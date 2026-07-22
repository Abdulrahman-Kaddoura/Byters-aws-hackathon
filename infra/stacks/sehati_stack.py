"""The SEHATI-AI backend stack.

    Cognito (auth, groups)  ->  AppSync (GraphQL + subscriptions)
                                      |
                                Lambda orchestrator (Python)
                                      |
              DynamoDB (cases/audit/feedback)  +  S3/KMS (docs, WORM audit)
                                      |
                               Amazon Bedrock (when AI_PROVIDER=bedrock)

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
from aws_cdk import aws_appsync as appsync
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
SCHEMA_PATH = os.path.abspath(os.path.join(HERE, "..", "schema.graphql"))

# GraphQL (type, field) pairs wired to the Lambda data source.
QUERY_FIELDS = ["listCases", "getCase", "caseAudit"]
MUTATION_FIELDS = [
    "submitIntake", "setCaseState", "addNote",
    "postInterviewMessage", "generateSummary",
    "recommendExams", "recordExamFinding",
    "requestRecommendations", "askDiagnosis", "rerankAfterResults",
    "proposeFinalDiagnosis", "acceptFinalDiagnosis",
    "orderTest", "recordTestResult",
    "assistantChat", "acceptRecommendation", "rejectRecommendation",
    "publishCaseUpdate", "publishMessage",
]


class SehatiStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        ai_provider: str = "stub",
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
                exclude=["tests", "scripts", "**/__pycache__", "*.md", "requirements*.txt", "sehati/data"],
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
                "AI_PROVIDER": ai_provider,
                "LOG_LEVEL": "INFO",
            },
        )
        cases.grant_read_write_data(fn)
        audit.grant_read_write_data(fn)
        feedback.grant_read_write_data(fn)
        documents.grant_read_write(fn)
        audit_bucket.grant_write(fn)
        key.grant_encrypt_decrypt(fn)

        # Bedrock permissions (used only when AI_PROVIDER=bedrock).
        fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                    "bedrock:Converse",
                    "bedrock:ConverseStream",
                    "bedrock:Retrieve",
                    "bedrock:ApplyGuardrail",
                ],
                resources=["*"],  # scope to specific model/KB/guardrail ARNs in prod
            )
        )

        # --- AppSync GraphQL API -------------------------------------------
        api = appsync.GraphqlApi(
            self, "GraphqlApi",
            name="sehati-api",
            definition=appsync.Definition.from_file(SCHEMA_PATH),
            authorization_config=appsync.AuthorizationConfig(
                default_authorization=appsync.AuthorizationMode(
                    authorization_type=appsync.AuthorizationType.USER_POOL,
                    user_pool_config=appsync.UserPoolConfig(user_pool=user_pool),
                ),
                additional_authorization_modes=[
                    appsync.AuthorizationMode(authorization_type=appsync.AuthorizationType.IAM),
                ],
            ),
            log_config=appsync.LogConfig(
                field_log_level=appsync.FieldLogLevel.ERROR,
                retention=logs.RetentionDays.ONE_MONTH,
            ),
            xray_enabled=True,
        )
        ds = api.add_lambda_data_source("OrchestratorDS", fn)
        for field in QUERY_FIELDS:
            ds.create_resolver(f"Query_{field}", type_name="Query", field_name=field)
        for field in MUTATION_FIELDS:
            ds.create_resolver(f"Mutation_{field}", type_name="Mutation", field_name=field)

        # --- Outputs --------------------------------------------------------
        CfnOutput(self, "GraphQLApiUrl", value=api.graphql_url)
        CfnOutput(self, "GraphQLApiId", value=api.api_id)
        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "Region", value=self.region)
        CfnOutput(self, "CasesTableName", value=cases.table_name)
        CfnOutput(self, "AIProvider", value=ai_provider)
