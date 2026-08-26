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

        # Browser-enforced defenses (helmet-equivalent) for the SPA response.
        # Notably a CSP that blocks third-party script/connect origins, which
        # narrows the blast radius of any XSS given the session tokens the app
        # keeps in localStorage (see src/lib/auth.ts).
        response_headers_policy = cloudfront.ResponseHeadersPolicy(
            self, "SecurityHeaders",
            security_headers_behavior=cloudfront.ResponseSecurityHeadersBehavior(
                content_security_policy=cloudfront.ResponseHeadersContentSecurityPolicy(
                    # CSP host-source grammar only allows "*" as the *leading*
                    # label of a host (e.g. "*.execute-api.us-east-1.amazonaws.com").
                    # A wildcard in a middle label (e.g. "cognito-idp.*.amazonaws.com")
                    # is invalid syntax, so browsers silently drop that source —
                    # which left connect-src effectively 'self'-only and blocked
                    # every fetch() to Cognito/API Gateway before it hit the
                    # network (hence no request ever showing up in devtools).
                    content_security_policy=(
                        "default-src 'self'; "
                        # Allows exactly the inline theme-detection script in
                        # index.html (keeps 'unsafe-inline' off script-src,
                        # which would let any injected script run — this page
                        # holds bearer tokens in localStorage). Recompute this
                        # hash if that inline <script> block's contents change.
                        "script-src 'self' 'sha256-rc+U/+m7lCtQ/CPTC9NdX2P5Nth+cL4DiCng/Ldd7FU='; "
                        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                        # Case-document previews (CaseDocuments.tsx) load an
                        # image straight from a presigned S3 URL. Both S3
                        # virtual-hosted-style forms are needed: the legacy
                        # global endpoint (bucket.s3.amazonaws.com, used for
                        # us-east-1) and the region-qualified one.
                        f"img-src 'self' data: https://*.s3.amazonaws.com "
                        f"https://*.s3.{self.region}.amazonaws.com; "
                        "font-src 'self' data: https://fonts.gstatic.com; "
                        # Case-audio upload/playback (CaseAudio.tsx) PUTs/GETs
                        # straight to a presigned S3 URL from the browser, so
                        # S3 needs to be reachable from connect-src too (same
                        # two virtual-hosted-style forms as img-src above).
                        f"connect-src 'self' https://cognito-idp.{self.region}.amazonaws.com "
                        f"https://*.execute-api.{self.region}.amazonaws.com "
                        f"https://*.s3.amazonaws.com https://*.s3.{self.region}.amazonaws.com; "
                        "object-src 'none'; "
                        "base-uri 'self'; "
                        "frame-ancestors 'none'"
                    ),
                    override=True,
                ),
                content_type_options=cloudfront.ResponseHeadersContentTypeOptions(override=True),
                frame_options=cloudfront.ResponseHeadersFrameOptions(
                    frame_option=cloudfront.HeadersFrameOption.DENY, override=True
                ),
                referrer_policy=cloudfront.ResponseHeadersReferrerPolicy(
                    referrer_policy=cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                    override=True,
                ),
                strict_transport_security=cloudfront.ResponseHeadersStrictTransportSecurity(
                    access_control_max_age=Duration.days(365),
                    include_subdomains=True,
                    preload=True,
                    override=True,
                ),
                xss_protection=cloudfront.ResponseHeadersXSSProtection(
                    protection=True, mode_block=True, override=True
                ),
            ),
            custom_headers_behavior=cloudfront.ResponseCustomHeadersBehavior(
                custom_headers=[
                    cloudfront.ResponseCustomHeader(
                        header="Permissions-Policy",
                        value="camera=(), microphone=(), geolocation=()",
                        override=True,
                    ),
                ]
            ),
        )

        distribution = cloudfront.Distribution(
            self, "SiteDistribution",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                response_headers_policy=response_headers_policy,
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
