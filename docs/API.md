# SEHATI-AI — GraphQL API Reference (for the frontend team)

The backend is a single **AppSync GraphQL** endpoint. Authenticate with Cognito
and send the **ID token** in the `Authorization` header. Every `case` field is a
full **`PatientCase`** object — the exact shape in `src/types.ts` — returned as
`AWSJSON` (a JSON string; `JSON.parse` it). Inputs that are objects (e.g.
`submitIntake`'s `input`) are also passed as `AWSJSON` strings.

- **Endpoint:** the stack output `GraphQLApiUrl`
- **Auth header:** `Authorization: <Cognito ID token>`
- **Groups:** `patient`, `physician`, `admin`, `compliance`

Authorization is enforced server-side in the data layer, so the same query
returns different data per role (a patient only ever sees their own cases).

---

## Roles → what they can call

| Operation | patient | physician | admin | compliance |
|---|:-:|:-:|:-:|:-:|
| `listCases`, `getCase` | own only | ✓ | ✓ | ✓ |
| `submitIntake` | ✓ (self) | ✓ | ✓ | – |
| `postInterviewMessage`, `generateSummary` | ✓ | ✓ | ✓ | – |
| exams / differential / tests / final dx | – | ✓ | ✓ | ✓* |
| `acceptFinalDiagnosis` | – | ✓ | ✓ | – |
| `caseAudit` | – | – | ✓ | ✓ |

\* compliance can read/annotate but sign-off (`acceptFinalDiagnosis`) is physician/admin.

---

## Queries

```graphql
# All cases visible to the caller (patients: own only). Optional filters.
query ListCases($status: String, $mine: Boolean) {
  listCases(status: $status, mine: $mine)   # -> AWSJSON: PatientCase[]
}

# One case by id.
query GetCase($id: ID!) {
  getCase(id: $id)                          # -> AWSJSON: PatientCase
}

# Immutable audit trail (compliance/admin only).
query CaseAudit($id: ID!) {
  caseAudit(id: $id)                        # -> AWSJSON: AuditEntry[]
}
```

## Mutations

### Intake + lifecycle
```graphql
# Create a case from an intake payload; auto-advances to the AI interview.
# `input` is a JSON string, e.g.
#   {"patient":{"name":"Layla","age":54,"gender":"Female"},
#    "chiefComplaint":"Headache 3 days with fever",
#    "complaint":{"symptoms":["Headache","Fever"],"painScale":6,"duration":"3 days"},
#    "history":{...}, "vitals":{...}}
mutation SubmitIntake($input: AWSJSON!) { submitIntake(input: $input) }  # -> PatientCase

# Explicit lifecycle move (design doc §7 states):
# Intake→AIInterview→DoctorReview→InProgress→ResultsDiscussion→Diagnosis→Closed
mutation SetCaseState($caseId: ID!, $state: String!, $note: String) {
  setCaseState(caseId: $caseId, state: $state, note: $note)             # -> PatientCase
}

mutation AddNote($caseId: ID!, $text: String!) {
  addNote(caseId: $caseId, text: $text)                                  # -> PatientCase
}
```

### AI interview (patient-facing)
```graphql
# Append the patient's answer; get the AI's next question.
# Returns { case, aiMessage, complete }. When complete=true, call generateSummary.
mutation PostInterviewMessage($caseId: ID!, $text: String!) {
  postInterviewMessage(caseId: $caseId, text: $text) {
    case aiMessage complete
  }
}

# Build the structured summary; advances the case to DoctorReview.
mutation GenerateSummary($caseId: ID!) {
  generateSummary(caseId: $caseId) { case summary }
}
```

### Examination
```graphql
mutation RecommendExams($caseId: ID!) {
  recommendExams(caseId: $caseId) { case exams }
}

mutation RecordExamFinding(
  $caseId: ID!, $examId: ID!, $finding: String, $normalRange: String,
  $flag: String, $note: String, $status: String
) {
  recordExamFinding(
    caseId: $caseId, examId: $examId, finding: $finding, normalRange: $normalRange,
    flag: $flag, note: $note, status: $status
  ) { case exam }
}
```

### Differential + explainability
```graphql
# Generate the prioritised differential + recommended tests.
mutation RequestRecommendations($caseId: ID!) {
  requestRecommendations(caseId: $caseId) { case diagnoses tests }
}

# "Why this test?" — scoped to a diagnosis (persists to its discussion thread).
mutation AskDiagnosis($caseId: ID!, $question: String!, $diagnosisId: ID) {
  askDiagnosis(caseId: $caseId, question: $question, diagnosisId: $diagnosisId) {
    case aiMessage
  }
}

# After results arrive: re-reason and re-rank (advances to ResultsDiscussion).
mutation RerankAfterResults($caseId: ID!) {
  rerankAfterResults(caseId: $caseId) { case diagnoses }
}

# Propose a final diagnosis (advances to Diagnosis).
mutation ProposeFinalDiagnosis($caseId: ID!) {
  proposeFinalDiagnosis(caseId: $caseId) { case finalDiagnosis }
}

# Physician signs off → case Closed.
mutation AcceptFinalDiagnosis($caseId: ID!, $note: String) {
  acceptFinalDiagnosis(caseId: $caseId, note: $note) { case finalDiagnosis }
}
```

### Tests
```graphql
mutation OrderTest($caseId: ID!, $testId: ID!) {
  orderTest(caseId: $caseId, testId: $testId) { case test }   # first order → InProgress
}

mutation RecordTestResult(
  $caseId: ID!, $testId: ID!, $result: String!, $resultFlag: String, $resultDetail: String
) {
  recordTestResult(
    caseId: $caseId, testId: $testId, result: $result,
    resultFlag: $resultFlag, resultDetail: $resultDetail
  ) { case test }
}
```

### Collaboration + feedback flywheel
```graphql
# Case-level assistant panel.
mutation AssistantChat($caseId: ID!, $text: String!) {
  assistantChat(caseId: $caseId, text: $text) { case aiMessage }
}

# Accept / reject a recommendation. Rejection REQUIRES a reason (anti-rubber-stamp).
# targetType ∈ "recommendation" | "test" | "diagnosis" | "final_diagnosis"
mutation AcceptRecommendation($caseId: ID!, $targetId: ID!, $targetType: String, $reason: String) {
  acceptRecommendation(caseId: $caseId, targetId: $targetId, targetType: $targetType, reason: $reason) {
    case accepted
  }
}
mutation RejectRecommendation($caseId: ID!, $targetId: ID!, $targetType: String, $reason: String!) {
  rejectRecommendation(caseId: $caseId, targetId: $targetId, targetType: $targetType, reason: $reason) {
    case accepted
  }
}
```

## Subscriptions (real-time)

AppSync pushes updates to subscribers when the matching publish mutation runs.
Use these for live chat / multi-viewer case sync.

```graphql
subscription OnCaseUpdated($caseId: ID!) { onCaseUpdated(caseId: $caseId) }
subscription OnNewMessage($caseId: ID!)  { onNewMessage(caseId: $caseId) }

# Triggers (call after a local mutation to fan out to other viewers):
mutation PublishCaseUpdate($caseId: ID!, $case: AWSJSON!) {
  publishCaseUpdate(caseId: $caseId, case: $case)
}
mutation PublishMessage($caseId: ID!, $message: AWSJSON!) {
  publishMessage(caseId: $caseId, message: $message)
}
```

> Token-by-token streaming of AI replies is a documented extension (see
> `ARCHITECTURE.md`); today `aiMessage` is returned as a complete grounded message.

---

## Errors

Errors carry a typed `errorType` and a safe `message` (never PHI):

| `errorType` | Meaning |
|---|---|
| `Unauthorized` | Missing/invalid token |
| `Forbidden` | Not allowed (e.g. cross-patient access, or a role restriction) |
| `NotFound` | Case/exam/test/diagnosis id doesn't exist |
| `ValidationError` | Missing/invalid argument (e.g. reject without a reason) |
| `StateTransitionError` | Illegal lifecycle move |

## Minimal end-to-end (physician)

```
submitIntake → postInterviewMessage×N → generateSummary
  → recommendExams → recordExamFinding
  → requestRecommendations → askDiagnosis
  → orderTest → recordTestResult → rerankAfterResults
  → proposeFinalDiagnosis → acceptFinalDiagnosis
```
