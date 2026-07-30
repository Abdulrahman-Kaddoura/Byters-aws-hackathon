"""The SEHATI-AI backend stack.

    Cognito (auth, groups)  ->  API Gateway (REST, Cognito authorizer)
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

from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
)
from aws_cdk import aws_apigateway as apigateway
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
        cases.add_global_secondary_index(
            index_name="byPatient",
            partition_key=dynamodb.Attribute(name="patientId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
        )
        cases.add_global_secondary_index(
            index_name="byPhysician",
            partition_key=dynamodb.Attribute(name="assignedPhysicianId", type=dynamodb.AttributeType.STRING),
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
        for group in ("patient", "physician", "admin", "compliance"):
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
                    "requirements*.txt",
                    "sehati/data",
                    ".venv",
                    "venv",
                    "**/*.egg-info",
                    ".pytest_cache",
                ],
            ),
            timeout=Duration.seconds(60),
            memory_size=512,
            log_group=fn_log_group,
            environment={
                "CASES_TABLE": cases.table_name,
                "AUDIT_TABLE": audit.table_name,
                "FEEDBACK_TABLE": feedback.table_name,
                "DOCUMENTS_BUCKET": documents.bucket_name,
                "AUDIT_BUCKET": audit_bucket.bucket_name,
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
        documents.grant_read_write(fn)
        audit_bucket.grant_write(fn)
        key.grant_encrypt_decrypt(fn)

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

        # --- API Gateway (REST) ---------------------------------------------
        api_log_group = logs.LogGroup(
            self, "ApiAccessLogs",
            log_group_name="/aws/apigateway/sehati-api",
            retention=logs.RetentionDays.ONE_MONTH,
            removal_policy=RemovalPolicy.DESTROY,
        )
        api = apigateway.RestApi(
            self, "Api",
            rest_api_name="sehati-api",
            description="SEHATI-AI clinical decision-support REST API",
            deploy_options=apigateway.StageOptions(
                stage_name="prod",
                logging_level=apigateway.MethodLoggingLevel.ERROR,
                access_log_destination=apigateway.LogGroupLogDestination(api_log_group),
                access_log_format=apigateway.AccessLogFormat.json_with_standard_fields(
                    caller=True, http_method=True, ip=True, protocol=True,
                    request_time=True, resource_path=True, response_length=True,
                    status=True, user=True,
                ),
                tracing_enabled=True,
                # Per-client throttling (defense against a single caller flooding the
                # API); Cognito auth already stops anonymous abuse, this bounds an
                # authenticated caller too.
                throttling_rate_limit=50,
                throttling_burst_limit=100,
            ),
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=apigateway.Cors.ALL_ORIGINS,
                allow_methods=apigateway.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
            # Edge-optimized (the default) puts every request through an
            # AWS-managed CloudFront distribution in front of the API - which
            # caches responses (including CORS preflight) outside of
            # CloudFormation's control, so a backend redeploy doesn't bust
            # stale cached headers there. Regional skips that hidden layer
            # entirely; the frontend already has its own CloudFront in front
            # of it, so nothing is lost by dropping the API's own.
            endpoint_types=[apigateway.EndpointType.REGIONAL],
        )
        authorizer = apigateway.CognitoUserPoolsAuthorizer(
            self, "ApiAuthorizer",
            cognito_user_pools=[user_pool],
        )
        # scope_permission_to_method=False: grant API Gateway invoke access
        # via a single wildcard Lambda::Permission for the whole API instead
        # of one per method - Lambda's resource policy has a hard 20KB
        # ceiling that a permission-per-route design can outgrow.
        integration = apigateway.LambdaIntegration(
            fn, scope_permission_to_method=False,
        )

        def secured(resource: apigateway.Resource, method: str) -> None:
            resource.add_method(
                method, integration,
                authorization_type=apigateway.AuthorizationType.COGNITO,
                authorizer=authorizer,
            )

        # /cases
        cases_res = api.root.add_resource("cases")
        secured(cases_res, "GET")   # listCases
        secured(cases_res, "POST")  # submitIntake

        # /cases/{caseId}
        case_res = cases_res.add_resource("{caseId}")
        secured(case_res, "GET")  # getCase
        secured(case_res, "PUT")  # setCaseState

        secured(case_res.add_resource("audit"), "GET")  # caseAudit
        secured(case_res.add_resource("notes"), "POST")  # addNote
        secured(case_res.add_resource("documents"), "POST")  # uploadCaseDocument

        interview_res = case_res.add_resource("interview")
        secured(interview_res.add_resource("messages"), "POST")  # postInterviewMessage
        secured(interview_res.add_resource("summary"), "POST")  # generateSummary

        conversations_res = case_res.add_resource("conversations")
        secured(conversations_res, "POST")  # createConversation
        secured(
            conversations_res.add_resource("{conversationId}").add_resource("messages"),
            "POST",
        )  # postConversationMessage

        exams_res = case_res.add_resource("exams")
        secured(exams_res, "POST")  # recommendExams
        secured(exams_res.add_resource("{examId}"), "PUT")  # recordExamFinding

        diagnoses_res = case_res.add_resource("diagnoses")
        secured(diagnoses_res, "POST")  # requestRecommendations
        secured(diagnoses_res.add_resource("ask"), "POST")  # askDiagnosis
        secured(diagnoses_res.add_resource("rerank"), "POST")  # rerankAfterResults

        final_dx_res = case_res.add_resource("final-diagnosis")
        secured(final_dx_res, "POST")  # proposeFinalDiagnosis
        secured(final_dx_res, "PUT")  # acceptFinalDiagnosis

        test_res = case_res.add_resource("tests").add_resource("{testId}")
        secured(test_res.add_resource("order"), "POST")  # orderTest
        secured(test_res.add_resource("result"), "PUT")  # recordTestResult

        secured(case_res.add_resource("assistant"), "POST")  # assistantChat

        recommendation_res = case_res.add_resource("recommendations").add_resource("{targetId}")
        secured(recommendation_res.add_resource("accept"), "POST")  # acceptRecommendation
        secured(recommendation_res.add_resource("reject"), "POST")  # rejectRecommendation

        # --- Outputs --------------------------------------------------------
        CfnOutput(self, "ApiUrl", value=api.url)
        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "Region", value=self.region)
        CfnOutput(self, "CasesTableName", value=cases.table_name)
