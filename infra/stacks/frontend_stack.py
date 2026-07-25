"""Static hosting for the built frontend (Vite/React SPA).

    S3 (private bucket, OAC-only)  ->  CloudFront (HTTPS, SPA routing)

The bucket is never public — CloudFront reaches it through Origin Access
Control (the bucket policy is scoped to this distribution's ARN only). 403/404s
(e.g. a deep link like /cases/123 with no matching S3 key) are rewritten to
/index.html so React Router can handle client-side routes.

Requires `npm run build` to have produced ../dist BEFORE `cdk deploy` — CDK
uploads whatever is in that directory at synth time, it does not build it.
"""

from __future__ import annotations

import os

from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
)
from aws_cdk import aws_cloudfront as cloudfront
from aws_cdk import aws_cloudfront_origins as origins
from aws_cdk import aws_s3 as s3
from aws_cdk import aws_s3_deployment as s3deploy
from constructs import Construct

HERE = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "dist"))


class SehatiFrontendStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = s3.Bucket(
            self, "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        distribution = cloudfront.Distribution(
            self, "SiteDistribution",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            # SPA routing: any path S3 doesn't have (client-side routes) -> index.html.
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403, response_http_status=200,
                    response_page_path="/index.html", ttl=Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404, response_http_status=200,
                    response_page_path="/index.html", ttl=Duration.seconds(0),
                ),
            ],
        )

        s3deploy.BucketDeployment(
            self, "DeploySite",
            sources=[s3deploy.Source.asset(DIST_DIR)],
            destination_bucket=bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )

        CfnOutput(self, "SiteUrl", value=f"https://{distribution.distribution_domain_name}")
        CfnOutput(self, "BucketName", value=bucket.bucket_name)
        CfnOutput(self, "DistributionId", value=distribution.distribution_id)
