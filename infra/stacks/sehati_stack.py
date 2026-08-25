"""The SEHATI-AI backend stack.

    Cognito (auth, groups)  ->  API Gateway (HTTP API, Cognito JWT authorizer)
                                      |
                                Lambda orchestrator (Python)
                                      |
              DynamoDB (cases/audit/feedback)  +  S3/KMS (docs, WORM audit)
                                      |
                               Amazon Bedrock (Claude)

All data at rest is encrypted with a customer-managed KMS key. Authorization is
enforced in the Lambda data layer; the Cognito groups here are the coarse gate.
"""

from __future__ import annotations

import os

import jsii
from aws_cdk import (
    BundlingOptions,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
)
from aws_cdk import aws_apigateway as apigateway
from aws_cdk import aws_apigatewayv2 as apigatewayv2
from aws_cdk import aws_apigatewayv2_authorizers as apigatewayv2_authorizers
from aws_cdk import aws_apigatewayv2_integrations as apigatewayv2_integrations
from aws_cdk import aws_cognito as cognito
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_iam as iam
from aws_cdk import aws_kms as kms
from aws_cdk import aws_lambda as lambda_
from aws_cdk import aws_logs as logs
from aws_cdk import aws_s3 as s3
from constructs import Construct

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "backend"))


@jsii.implements(apigatewayv2.IAccessLogSettings)
class _AccessLogSettings:
    """``IAccessLogSettings`` is a jsii interface (Protocol), not a struct —
    a plain dict doesn't deserialize across the jsii boundary, so it needs an
    actual implementing object."""

    def __init__(self, destination: apigatewayv2.IAccessLogDestination, format: apigateway.AccessLogFormat) -> None:
        self._destination = destination
        self._format = format

    @property
    def destination(self) -> apigatewayv2.IAccessLogDestination:
        return self._destination

    @property
    def format(self) -> apigateway.AccessLogFormat:
        return self._format


class SehatiStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        bedrock_model_id: str = "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        bedrock_guardrail_id: str = "",
        bedrock_guardrail_version: str = "DRAFT",
        bedrock_knowledge_base_id: str = "",
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # --- KMS customer-managed key (encryption at rest) ------------------
        key = kms.Key(
            self, "SehatiKey",
            alias="alias/sehati",
            enable_key_rotation=True,
            description="SEHATI-AI CMK for DynamoDB + S3 (PHI at rest)",
            removal_policy=RemovalPolicy.DESTROY,
        )

        # --- DynamoDB tables ------------------------------------------------
        cases = dynamodb.Table(
            self, "CasesTable",
            table_name="sehati-cases",
            partition_key=dynamodb.Attribute(name="id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,  # scale-to-zero cost
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
        )
        # Retained but no longer written to: patients stopped being account
        # holders when the nurse-led intake replaced patient self-service, so
        # nothing sets `patientId` any more. It is left in place because
        # DynamoDB permits only ONE index creation or deletion per UpdateTable
        # call — dropping this in the same deploy that adds `byNurse` below
        # would fail the changeset. Safe to delete in a later, separate deploy.
        cases.add_global_secondary_index(
            index_name="byPatient",
            partition_key=dynamodb.Attribute(name="patientId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
        )
        # A doctor's entire case list is a query on this index: assignment is
        # the access boundary (see db/cases_repo._visible_to), so this is the
        # only index a doctor's reads ever touch.
        cases.add_global_secondary_index(
            index_name="byPhysician",
            partition_key=dynamodb.Attribute(name="assignedPhysicianId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
        )
        # The admissions desk: cases a given nurse admitted.
        cases.add_global_secondary_index(
            index_name="byNurse",
            partition_key=dynamodb.Attribute(name="createdByNurseId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
        )
        cases.add_global_secondary_index(
            index_name="byStatus",
            partition_key=dynamodb.Attribute(name="status", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
        )

        audit = dynamodb.Table(
            self, "AuditTable",
            table_name="sehati-audit",
            partition_key=dynamodb.Attribute(name="caseId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
        )

        feedback = dynamodb.Table(
            self, "FeedbackTable",
            table_name="sehati-feedback",
            partition_key=dynamodb.Attribute(name="caseId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Doctor-facing free-text feedback (distinct from the accept/reject
        # flywheel dataset above), keyed by doctor so it doubles as a
        # per-doctor preference history the AI seam can read back.
        doctor_feedback = dynamodb.Table(
            self, "DoctorFeedbackTable",
            table_name="sehati-doctor-feedback",
            partition_key=dynamodb.Attribute(name="doctorId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="timestamp", type=dynamodb.AttributeType.NUMBER),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Admin panel: hospital-provisioned accounts (Cognito is the identity
        # store; this table carries app-level custom-group membership and
        # per-user permission overrides) and the admin-editable custom groups
        # that carry the fine-grained permission catalog (see permissions.py).
        users = dynamodb.Table(
            self, "UsersTable",
            table_name="sehati-users",
            partition_key=dynamodb.Attribute(name="sub", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
        )

        groups = dynamodb.Table(
            self, "GroupsTable",
            table_name="sehati-groups",
            partition_key=dynamodb.Attribute(name="id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Shared reference-document library: clinical staff upload guideline/
        # reference docs (resolvers/resources.py, gated behind the
        # resources.manage permission); the AI seam keyword-matches them in
        # as grounding evidence for any case (ai/bedrock.py's _retrieve).
        resources = dynamodb.Table(
            self, "ResourcesTable",
            table_name="sehati-resources",
            partition_key=dynamodb.Attribute(name="id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Hospital-wide settings — a single item (id = "app"). Today it holds
        # only the hashed patient-interview exit password (db/settings_repo.py),
        # which is why it is a table rather than a Lambda env var: an admin sets
        # it at runtime from the panel, and it must be stored hashed, not in the
        # CDK-owned environment map.
        settings = dynamodb.Table(
            self, "SettingsTable",
            table_name="sehati-settings",
            partition_key=dynamodb.Attribute(name="id", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=key,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
        )

        # --- S3 buckets -----------------------------------------------------
        # Documents / audio / images (KMS-encrypted, private).
        documents = s3.Bucket(
            self, "DocumentsBucket",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=key,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        # The browser PUTs consultation audio straight here with a presigned
        # URL — a recording is far too large to pass through API Gateway as
        # base64 — so the bucket has to answer the preflight itself. Reads stay
        # presigned GETs, which need no CORS, but are allowed for symmetry.
        documents.add_cors_rule(
            allowed_methods=[s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
            allowed_origins=["*"],
            allowed_headers=["*"],
            exposed_headers=["ETag"],
            max_age=3000,
        )
        # Immutable audit (WORM) — Object Lock in GOVERNANCE mode. RETAINED on
        # stack deletion (must be emptied manually) to honour immutability.
        audit_bucket = s3.Bucket(
            self, "AuditBucket",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=key,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            object_lock_enabled=True,
            object_lock_default_retention=s3.ObjectLockRetention.governance(Duration.days(1)),
            removal_policy=RemovalPolicy.RETAIN,
        )

        # AWS HealthScribe (via Transcribe's medical-scribe API) assumes this
        # role to read the doctor-uploaded source audio and write its
        # clinical-summary output — both live in the documents bucket, under
        # the case-audio/ and medical-scribe-output/ prefixes respectively.
        # Previously configured by hand in the console (not provisioned as
        # code, see ai/healthscribe.py's original docstring); wiring it here
        # so a `cdk deploy` no longer silently drops it.
        healthscribe_role = iam.Role(
            self, "HealthScribeDataAccessRole",
            assumed_by=iam.ServicePrincipal("transcribe.amazonaws.com"),
            description="AWS HealthScribe data-access role: reads case audio, writes clinical summaries",
        )
        documents.grant_read_write(healthscribe_role)
        key.grant_encrypt_decrypt(healthscribe_role)

        # --- Cognito --------------------------------------------------------
        user_pool = cognito.UserPool(
            self, "UserPool",
            user_pool_name="sehati-users",
            self_sign_up_enabled=False,  # hospital provisions accounts
            sign_in_aliases=cognito.SignInAliases(email=True, username=True),
            mfa=cognito.Mfa.OPTIONAL,
            mfa_second_factor=cognito.MfaSecondFactor(sms=False, otp=True),
            password_policy=cognito.PasswordPolicy(
                min_length=12, require_lowercase=True, require_uppercase=True,
                require_digits=True, require_symbols=True,
            ),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=RemovalPolicy.DESTROY,
        )
        # The three kinds of account holder (backend/sehati/models.py ROLES).
        # Patients never sign in — a nurse admits them and hands over her own
        # device for the AI interview — so there is no patient group. This
        # replaces the former patient/physician/admin/compliance set; deploying
        # it deletes those groups (Cognito allows deleting a group that still
        # has members), which is why scripts/migrate_roles.py reads each user's
        # role from DynamoDB and must run *after* the deploy.
        for group in ("doctor", "nurse", "admin"):
            cognito.CfnUserPoolGroup(
                self, f"Group{group.capitalize()}",
                user_pool_id=user_pool.user_pool_id,
                group_name=group,
                description=f"SEHATI {group} role",
            )
        user_pool_client = user_pool.add_client(
            "WebClient",
            auth_flows=cognito.AuthFlow(user_srp=True, user_password=True),
            id_token_validity=Duration.hours(8),
            access_token_validity=Duration.hours(8),
        )

        # --- Lambda orchestrator -------------------------------------------
        fn_log_group = logs.LogGroup(
            self, "OrchestratorLogs",
            log_group_name="/aws/lambda/sehati-orchestrator",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )
        fn = lambda_.Function(
            self, "OrchestratorFn",
            function_name="sehati-orchestrator",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="sehati.handler.handler",
            code=lambda_.Code.from_asset(
                BACKEND_DIR,
                exclude=[
                    "tests",
                    "scripts",
                    "**/__pycache__",
                    "*.md",
                    "requirements.txt",
                    "sehati/data",
                    ".venv",
                    "venv",
                    "**/*.egg-info",
                    ".pytest_cache",
                ],
                # `from_asset` alone just zips the source tree — it never installs
                # third-party deps, so pypdf/python-docx (needed by text_extract.py)
                # silently went missing from the deployed package. Install the
                # runtime-only deps (requirements-lambda.txt; boto3 is preinstalled
                # by the Lambda runtime, pytest/moto are dev-only) into the asset
                # before it's zipped.
                bundling=BundlingOptions(
                    image=lambda_.Runtime.PYTHON_3_12.bundling_image,
                    command=[
                        "bash", "-c",
                        "pip install -r requirements-lambda.txt -t /asset-output "
                        # Not `cp -a`: archive mode implies -p, and preserving
                        # timestamps on the bind-mounted /asset-output fails as
                        # the non-root bundling user on a Docker Desktop volume
                        # ("cp: preserving times for '/asset-output/.':
                        # Operation not permitted"), which kills the whole
                        # deploy. Nothing downstream cares about the mtimes —
                        # the asset is zipped and hashed by content — so a
                        # plain recursive copy is what this step actually
                        # needs. -u is kept: it is what stops the source tree
                        # from overwriting anything pip just installed.
                        "&& cp -ru . /asset-output "
                        "&& rm -f /asset-output/requirements-lambda.txt",
                    ],
                ),
            ),
            timeout=Duration.seconds(60),
            memory_size=512,
            log_group=fn_log_group,
            environment={
                "CASES_TABLE": cases.table_name,
                "AUDIT_TABLE": audit.table_name,
                "FEEDBACK_TABLE": feedback.table_name,
                "USERS_TABLE": users.table_name,
                "GROUPS_TABLE": groups.table_name,
                "USER_POOL_ID": user_pool.user_pool_id,
                "DOCUMENTS_BUCKET": documents.bucket_name,
                "AUDIT_BUCKET": audit_bucket.bucket_name,
                "DOCTOR_FEEDBACK_TABLE": doctor_feedback.table_name,
                "RESOURCES_TABLE": resources.table_name,
                "SETTINGS_TABLE": settings.table_name,
                "HEALTHSCRIBE_BUCKET": documents.bucket_name,
                "HEALTHSCRIBE_ROLE_ARN": healthscribe_role.role_arn,
                "DOCUMENTS_KMS_KEY_ARN": key.key_arn,
                "BEDROCK_MODEL_ID": bedrock_model_id,
                "BEDROCK_GUARDRAIL_ID": bedrock_guardrail_id,
                "BEDROCK_GUARDRAIL_VERSION": bedrock_guardrail_version,
                "BEDROCK_KNOWLEDGE_BASE_ID": bedrock_knowledge_base_id,
                "LOG_LEVEL": "INFO",
            },
        )
        cases.grant_read_write_data(fn)
        audit.grant_read_write_data(fn)
        feedback.grant_read_write_data(fn)
        doctor_feedback.grant_read_write_data(fn)
        users.grant_read_write_data(fn)
        groups.grant_read_write_data(fn)
        resources.grant_read_write_data(fn)
        settings.grant_read_write_data(fn)
        documents.grant_read_write(fn)
        audit_bucket.grant_write(fn)
        key.grant_encrypt_decrypt(fn)

        # HealthScribe: the Lambda starts/polls medical-scribe jobs and must be
        # able to hand Transcribe the data-access role it assumes to read/write
        # the documents bucket on the Lambda's behalf.
        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "transcribe:StartMedicalScribeJob",
                    "transcribe:GetMedicalScribeJob",
                ],
                resources=["*"],  # Transcribe has no per-job resource ARN for IAM
            )
        )
        healthscribe_role.grant_pass_role(fn)

        # Admin panel: the Lambda provisions/manages hospital accounts via the
        # Cognito Admin* API (never client-side — self_sign_up is disabled and
        # only an authenticated admin's request reaches these resolvers).
        # Scoped to this one user pool, not the account-wide "*".
        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminAddUserToGroup",
                    "cognito-idp:AdminRemoveUserFromGroup",
                    "cognito-idp:AdminGetUser",
                    "cognito-idp:AdminDisableUser",
                    "cognito-idp:AdminEnableUser",
                    "cognito-idp:ListUsers",
                ],
                resources=[user_pool.user_pool_arn],
            )
        )

        # Bedrock permissions, scoped to the specific model/inference-profile/
        # guardrail/knowledge-base configured for this stack rather than "*".
        # A cross-region inference profile id (e.g.
        # "us.anthropic.claude-...") still routes to the underlying foundation
        # model in whichever region it lands in, so that resource is granted
        # region-wildcarded on the model ARN only (never on the account).
        model_name = bedrock_model_id.split(".", 1)[-1] if "." in bedrock_model_id else bedrock_model_id
        model_resources = [
            f"arn:aws:bedrock:{self.region}::foundation-model/{bedrock_model_id}",
            f"arn:aws:bedrock:*::foundation-model/{model_name}",
            f"arn:aws:bedrock:{self.region}:{self.account}:inference-profile/{bedrock_model_id}",
        ]
        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                    "bedrock:Converse",
                    "bedrock:ConverseStream",
                ],
                resources=model_resources,
            )
        )

        # Textract: structured extraction (forms + tables) for uploaded case
        # documents that are images or scanned/image-only PDFs.
        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=["textract:AnalyzeDocument"],
                resources=["*"],
            )
        )

        if bedrock_guardrail_id:
            fn.add_to_role_policy(
                iam.PolicyStatement(
                    actions=["bedrock:ApplyGuardrail"],
                    resources=[
                        f"arn:aws:bedrock:{self.region}:{self.account}:guardrail/{bedrock_guardrail_id}"
                    ],
                )
            )
        if bedrock_knowledge_base_id:
            fn.add_to_role_policy(
                iam.PolicyStatement(
                    actions=["bedrock:Retrieve"],
                    resources=[
                        f"arn:aws:bedrock:{self.region}:{self.account}:knowledge-base/{bedrock_knowledge_base_id}"
                    ],
                )
            )
        # --- API Gateway (HTTP API) ------------------------------------------
        # HTTP API instead of REST API: lower per-request latency/cost, and a
        # (marginally) longer hard integration-timeout ceiling for the
        # HealthScribe transcription routes. Both API types still cap Lambda
        # proxy integrations at ~30s either way, which is why transcription
        # itself (resolvers/transcribe.py) starts the HealthScribe job and
        # returns immediately rather than blocking on it — the frontend polls
        # transcriptionStatus separately.
        #
        # payload_format_version=VERSION_1_0 keeps the Lambda event shape
        # (httpMethod/resource/pathParameters/body) byte-for-byte compatible
        # with the old REST API proxy integration, so handler.py's route
        # table and _build_args didn't need to change.
        api_log_group = logs.LogGroup(
            self, "ApiAccessLogs",
            log_group_name="/aws/apigateway/sehati-api",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )
        api = apigatewayv2.HttpApi(
            self, "HttpApi",
            api_name="sehati-api",
            description="SEHATI-AI clinical decision-support HTTP API",
            create_default_stage=False,
            cors_preflight=apigatewayv2.CorsPreflightOptions(
                allow_origins=["*"],
                allow_methods=[
                    apigatewayv2.CorsHttpMethod.GET,
                    apigatewayv2.CorsHttpMethod.POST,
                    apigatewayv2.CorsHttpMethod.PUT,
                    apigatewayv2.CorsHttpMethod.DELETE,
                    apigatewayv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=["Content-Type", "Authorization"],
            ),
        )
        stage = apigatewayv2.HttpStage(
            self, "ApiStage",
            http_api=api,
            stage_name="prod",
            auto_deploy=True,
            throttle=apigatewayv2.ThrottleSettings(rate_limit=50, burst_limit=100),
            access_log_settings=_AccessLogSettings(
                destination=apigatewayv2.LogGroupLogDestination(api_log_group),
                format=apigateway.AccessLogFormat.json_with_standard_fields(
                    caller=True, http_method=True, ip=True, protocol=True,
                    request_time=True, resource_path=True, response_length=True,
                    status=True, user=True,
                ),
            ),
        )
        authorizer = apigatewayv2_authorizers.HttpJwtAuthorizer(
            "JwtAuthorizer",
            f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}",
            jwt_audience=[user_pool_client.user_pool_client_id],
        )
        # scope_permission_to_route=False: grant API Gateway invoke access via
        # a single wildcard Lambda::Permission for the whole API instead of
        # one per route - Lambda's resource policy has a hard 20KB ceiling
        # that a permission-per-route design can outgrow.
        integration = apigatewayv2_integrations.HttpLambdaIntegration(
            "OrchestratorIntegration", fn,
            payload_format_version=apigatewayv2.PayloadFormatVersion.VERSION_1_0,
            scope_permission_to_route=False,
        )

        def secured(path: str, methods: list[apigatewayv2.HttpMethod]) -> None:
            api.add_routes(
                path=path, methods=methods, integration=integration, authorizer=authorizer,
            )

        # The caller's own role + effective permissions. The frontend gates
        # every screen on this rather than on the JWT's group claim, so client
        # and server can't disagree about what is allowed.
        secured("/me", [apigatewayv2.HttpMethod.GET])
        # Who a nurse may route a case to.
        secured("/doctors", [apigatewayv2.HttpMethod.GET])

        secured("/cases", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/assign", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/tags", [apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/audit", [apigatewayv2.HttpMethod.GET])
        secured("/cases/{caseId}/notes", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/documents", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST])
        secured(
            "/cases/{caseId}/documents/{documentId}",
            [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.DELETE],
        )
        secured("/cases/{caseId}/audio", [apigatewayv2.HttpMethod.POST])
        # Recordings are PUT straight to S3 from the browser (see
        # resolvers/documents.create_case_audio_upload); this route only
        # hands out the presigned URL.
        secured("/cases/{caseId}/audio/upload-url", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/transcribe", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/transcribe/{jobName}", [apigatewayv2.HttpMethod.GET])
        secured("/cases/{caseId}/feedback", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/interview", [apigatewayv2.HttpMethod.GET])
        secured("/cases/{caseId}/interview/messages", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/interview/summary", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/consultation", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/conversations", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/conversations/{conversationId}/messages", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/exams", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/exams/custom", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/exams/{examId}", [apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/diagnoses", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/diagnoses/ask", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/diagnoses/analyze", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/diagnoses/rerank", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/final-diagnosis", [apigatewayv2.HttpMethod.POST, apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/resolve", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/reopen", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/tests/recommend", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/tests/custom", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/tests/{testId}", [apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/tests/{testId}/order", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/tests/{testId}/result", [apigatewayv2.HttpMethod.PUT])
        secured("/cases/{caseId}/assistant", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/recommendations/{targetId}/accept", [apigatewayv2.HttpMethod.POST])
        secured("/cases/{caseId}/recommendations/{targetId}/reject", [apigatewayv2.HttpMethod.POST])

        # Shared reference-document library (gated server-side by the
        # "resources.manage" permission).
        secured("/resources", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST])
        secured("/resources/{resourceId}", [apigatewayv2.HttpMethod.DELETE])

        # /admin — user + custom-group management (all gated server-side by
        # the "users.manage" permission, regardless of Cognito role).
        secured("/admin/users", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST])
        secured("/admin/users/{userId}", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT])
        secured("/admin/groups", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST])
        secured("/admin/groups/{groupId}", [apigatewayv2.HttpMethod.PUT, apigatewayv2.HttpMethod.DELETE])
        secured("/admin/permissions", [apigatewayv2.HttpMethod.GET])
        secured("/admin/settings", [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PUT])

        # Patient-interview (kiosk) lock. GET reports only whether an exit
        # password exists, so a nurse can be warned before handing the device
        # over; POST verifies it. The password itself is compared server-side
        # against a PBKDF2 hash — a check done in the browser would be readable
        # in the JS bundle.
        secured("/kiosk", [apigatewayv2.HttpMethod.GET])
        secured("/kiosk/exit", [apigatewayv2.HttpMethod.POST])

        # --- Outputs --------------------------------------------------------
        CfnOutput(self, "ApiUrl", value=stage.url)
        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "Region", value=self.region)
        CfnOutput(self, "CasesTableName", value=cases.table_name)
        CfnOutput(self, "UsersTableName", value=users.table_name)
        CfnOutput(self, "GroupsTableName", value=groups.table_name)
