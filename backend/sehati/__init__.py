"""SEHATI-AI backend package.

A doctor-in-the-loop clinical decision-support (CDS) backend, built AWS-native
per the SEHATI-AI design document: AppSync (GraphQL) -> Lambda orchestrator ->
DynamoDB, with a pluggable ``AIService`` seam (stub today, Amazon Bedrock ready).

The authorization boundary is the *data layer*, never the model: every access
is scoped to the caller's Cognito identity and explicit item ownership. See
``sehati.context`` and ``sehati.db.cases_repo``.
"""

__version__ = "0.1.0"
