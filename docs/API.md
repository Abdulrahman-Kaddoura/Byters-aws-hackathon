# SEHATI-AI — API Reference (What Each Endpoint Wants & Sends)

This is the complete list of endpoints. For **each one** you get: its **purpose**,
**who may call it**, its **HTTP method + path**, what it **wants** (inputs), what it
**sends back** (outputs), and a short **example**. Entities like *Case*, *Diagnosis*,
*Test* are defined in [`DATA_MODEL.md`](./DATA_MODEL.md); the order you call them in
is in [`WORKFLOW.md`](./WORKFLOW.md).

---

## How the API works (read this first)

- **Amazon API Gateway (HTTP API)**, one Lambda behind it. Every request is a plain
  HTTPS call: path parameters for ids, a JSON body for input, JSON back.
- **Every request must be logged in.** Send the user's Cognito **ID token** in the
  `Authorization` header **with the `Bearer ` prefix** (`Authorization: Bearer
  <token>`) — HTTP API's JWT authorizer requires the bearer scheme, unlike the
  old REST API's Cognito authorizer which took the raw token. That token tells
  the backend *who* the user is and *which role* they have — you never pass
  identity in the path or body.
- **Plain JSON in, plain JSON out.** Unlike a GraphQL `AWSJSON` string, request
  bodies and responses here are ordinary JSON — no double-encoding, no
  `JSON.parse()` on the result.
- **Same call, different data per role.** The backend filters results by who you
  are. A patient calling `GET /cases` sees only their own cases.

**Two shapes of response:**
1. Some endpoints return the **whole Case** directly (a JSON object).
2. Others return a small **wrapper object** with named parts, e.g.
   `{ case, aiMessage, complete }`. The `case` part is always the full, updated Case.

---

## Roles cheat-sheet

| | patient | physician | admin | compliance |
|---|:-:|:-:|:-:|:-:|
| read cases (`GET /cases`, `GET /cases/{caseId}`) | own only | ✓ | ✓ | ✓ |
| create a case (`POST /cases`) | ✓ (self) | ✓ | ✓ | — |
| interview (`.../interview/messages`, `.../interview/summary`) | ✓ | ✓ | ✓ | — |
| side conversations (`.../conversations`, `.../conversations/{id}/messages`) | ✓ | ✓ | ✓ | — |
| exams, differential, tests, chat, propose dx | — | ✓ | ✓ | ✓ |
| accept final diagnosis (sign-off) | — | ✓ | ✓ | — |
| audit trail (`GET /cases/{caseId}/audit`) | — | — | ✓ | ✓ |
| reference library (`/resources`) | — | ✓ | ✓ | ✓ |

If a user calls something they're not allowed to, they get a `403 Forbidden`
error (see [Errors](#errors) at the bottom).

**This table is enforced, not just descriptive.** Under the hood, each
clinical action above checks a specific fine-grained **permission**
(`cases.manage_state`, `exams.manage`, `diagnoses.manage`,
`final_diagnosis.accept`, `tests.manage`, `assistant.chat`,
`recommendations.record`, `audit.view`) rather than the role name directly. A
user's effective permissions come from the admin-editable permission
**groups** they belong to (see the `/admin` endpoints below), seeded by
default so every role above starts out with exactly this table's behavior —
an admin can then create custom groups to grant a narrower or different set
of permissions to specific users, independent of their Cognito role.
Row-level access (a patient only ever seeing their own case) is separate and
is **not** part of this permission system — it's Cognito-role-based and
enforced in the data layer, unaffected by permission-group changes.

---

# ENDPOINTS

## `GET /cases` — list the cases you're allowed to see
- **Purpose:** Get the case list for a dashboard.
- **Who:** anyone logged in (patients get only their own).
- **Wants (query string):**
  | Param | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `status` | text | no | Filter to one status, e.g. `"Awaiting Tests"`. |
  | `mine` | boolean | no | For a physician: only cases assigned to me. |
- **Sends back:** a JSON array of **Cases** (each the full Case).
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases?status=Awaiting%20Tests"
  ```

## `GET /cases/{caseId}` — get one full case
- **Purpose:** Open a case and show everything about it.
- **Who:** anyone logged in (patients only their own; otherwise `403 Forbidden`).
- **Sends back:** the full **Case** object.
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases/AUR-1042"
  ```

## `GET /cases/{caseId}/audit` — read the permanent audit trail of a case
- **Purpose:** Compliance review — see every action taken on a case.
- **Who:** **compliance** or **admin** only.
- **Sends back:** a JSON array of **audit entries**, each with `action`, `actor`,
  `ts`, and (where relevant) `modelVersion`, `retrievedContext`, `output`.
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases/AUR-1042/audit"
  ```

---

## `POST /cases` — create a new case from intake
- **Purpose:** Start a case. Auto-advances to the AI interview.
- **Who:** patient (creates their own), physician, or admin.
- **Wants (JSON body — the intake payload directly):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `patient` | **yes** | Object with at least `name` (plus `age`, `gender`, …). |
  | `chiefComplaint` | recommended | One-line reason for the visit. |
  | `complaint` | no | Symptoms object (`symptoms`, `painScale`, `duration`, …). |
  | `history` | no | Medical history object. |
  | `vitals` | no | Vitals object. |
  | `assignedPhysicianId` | no | Assign a doctor up front. |
- **Sends back:** the full new **Case** (state = `AIInterview`, with the AI's first
  greeting already in `interview`).
- **Example:**
  ```bash
  curl -X POST "$API_URL/cases" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"patient":{"name":"Layla","age":54,"gender":"Female"},"chiefComplaint":"Headache 3 days with fever","complaint":{"symptoms":["Headache","Fever"],"painScale":6,"duration":"3 days"}}'
  ```

## `PUT /cases/{caseId}` — move the case to another state manually
- **Purpose:** Explicit lifecycle control (e.g. force a re-evaluation from
  `Diagnosis` back to `ResultsDiscussion`). Illegal jumps are rejected.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `state` | **yes** | Target state, e.g. `"ResultsDiscussion"`. |
  | `note` | no | Reason for the move. |
- **Sends back:** the full **Case**.

## `POST /cases/{caseId}/notes` — add a doctor's note
- **Purpose:** Attach a free-text note to the case.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** the full **Case** (note added to `notes`).

---

## `POST /cases/{caseId}/interview/messages` — send a patient answer, get the next question
- **Purpose:** Run the adaptive interview, one turn at a time.
- **Who:** patient, physician, or admin.
- **Wants (JSON body):** `text` (**required**) — the patient's answer.
- **Sends back:** `{ case, aiMessage, complete }`
  | Part | Meaning |
  |------|---------|
  | `case` | Updated case (the turn is appended to `interview`). |
  | `aiMessage` | The AI's next question (a *ChatMessage*), or `null` if finished. |
  | `complete` | `true` when the interview is done → next call `.../interview/summary`. |
- **Example:**
  ```bash
  curl -X POST "$API_URL/cases/AUR-1042/interview/messages" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"text":"It started 3 days ago and is worsening."}'
  ```

## `POST /cases/{caseId}/interview/summary` — build the structured summary
- **Purpose:** Turn the interview into a doctor-ready summary. Advances to
  `DoctorReview`.
- **Who:** patient, physician, or admin.
- **Sends back:** `{ case, summary }` — `summary` is the *StructuredSummary*.

---

## `POST /cases/{caseId}/conversations` — start a side conversation
- **Purpose:** Start an extra chat session on an existing case — a return
  visit or a new question — separate from the primary intake `interview`.
  Purely additive: never affects `lifecycleState`, `status`, or `stage`.
- **Who:** patient, physician, or admin.
- **Wants (JSON body):** `title` (optional; defaults to `"New conversation"`).
- **Sends back:** `{ case, conversation }` — `conversation` is the new
  *Conversation* (`{ id, title, createdAt, updatedAt, messages: [] }`),
  also appended to `case.conversations`.

## `POST /cases/{caseId}/conversations/{conversationId}/messages` — post to a side conversation
- **Purpose:** Send a message in one specific side conversation and get the
  AI's grounded reply (uses the case's current data, including stage/status).
- **Who:** patient, physician, or admin.
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** `{ case, conversation, aiMessage }` — `conversation` is the
  updated *Conversation* (both turns appended to `messages`).

---

## `POST /cases/{caseId}/exams` — get suggested physical exams
- **Purpose:** Ask the AI which examinations matter for this case.
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ case, exams }` — `exams` is a list of *ExamRecommendation*
  (status `pending`).

## `PUT /cases/{caseId}/exams/{examId}` — enter what the doctor found
- **Purpose:** Save the result of one examination.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `finding` | no | What was found. |
  | `normalRange` | no | The normal range. |
  | `flag` | no | `normal` / `abnormal` / `critical`. |
  | `note` | no | Extra note. |
  | `status` | no | Defaults to `complete`. |
- **Sends back:** `{ case, exam }` — the updated exam.
- **Example:**
  ```bash
  curl -X PUT "$API_URL/cases/AUR-1042/exams/e1" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"finding":"Neck stiffness present","flag":"abnormal"}'
  ```

---

## `POST /cases/{caseId}/diagnoses` — generate the differential + tests
- **Purpose:** Get the ranked list of possible diagnoses (with reasoning &
  citations) and suggested tests.
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ case, diagnoses, tests }`
  | Part | Meaning |
  |------|---------|
  | `diagnoses` | Ranked list of *Diagnosis* (each with `reasoning`, `supporting`, `references`, `confidence`, …). |
  | `tests` | List of *TestRecommendation* to consider ordering. |

## `POST /cases/{caseId}/diagnoses/ask` — ask the AI about a diagnosis (explainability)
- **Purpose:** Challenge/interrogate the reasoning ("Why this? Why not that?").
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `question` | **yes** | The doctor's question. |
  | `diagnosisId` | no | Scope to one diagnosis; if given, the Q&A is saved in that diagnosis's `discussion`. |
- **Sends back:** `{ case, aiMessage }` — the AI's answer (a *ChatMessage*).

## `POST /cases/{caseId}/diagnoses/rerank` — re-reason once results are in
- **Purpose:** Have the AI update the differential with the new results. Moves the
  case to `ResultsDiscussion`.
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ case, diagnoses }` — the updated, re-ranked list.

---

## `POST /cases/{caseId}/final-diagnosis` — propose the conclusion
- **Purpose:** Ask the AI to propose a final diagnosis with a plan. Moves the case
  to `Diagnosis`.
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ case, finalDiagnosis }` — a *FinalDiagnosis* (status `proposed`).

## `PUT /cases/{caseId}/final-diagnosis` — doctor signs off (closes the case)
- **Purpose:** Physician accepts the final diagnosis. Moves the case to `Closed`.
- **Who:** **physician or admin only.**
- **Wants (JSON body):** `note` (no, optional sign-off note).
- **Sends back:** `{ case, finalDiagnosis }` — `finalDiagnosis.status` is now
  `accepted`; the case is `Closed`.
- **Example:**
  ```bash
  curl -X PUT "$API_URL/cases/AUR-1042/final-diagnosis" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"note":"Agree, treating as bacterial."}'
  ```

---

## `POST /cases/{caseId}/tests/{testId}/order` — order a recommended test
- **Purpose:** Mark a test as ordered. The **first** order moves the case to
  `InProgress` (Awaiting Tests).
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ case, test }` — the test now has status `ordered`.

## `PUT /cases/{caseId}/tests/{testId}/result` — enter a test result
- **Purpose:** Record a result (a radiologist's report is entered here as text).
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `result` | **yes** | The result value. |
  | `resultFlag` | no | `normal` / `abnormal` / `critical`. |
  | `resultDetail` | no | Extra detail. |
- **Sends back:** `{ case, test }` — the test now `completed` with the result.
- **Example:**
  ```bash
  curl -X PUT "$API_URL/cases/AUR-1042/tests/t1/result" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"result":"RLL infiltrate","resultFlag":"abnormal"}'
  ```

---

## `POST /cases/{caseId}/assistant` — case-level assistant chat
- **Purpose:** Open-ended chat with the AI about the whole case (the assistant panel).
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** `{ case, aiMessage }` — the AI's reply (saved to `assistantThread`).

## `POST /cases/{caseId}/recommendations/{targetId}/accept` — record acceptance (feedback)
- **Purpose:** Log that the doctor accepted a suggestion (test, diagnosis…). Feeds
  the feedback flywheel + audit.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `targetType` | no | `recommendation` (default), `test`, `diagnosis`, or `final_diagnosis`. |
  | `reason` | no | Optional reason. |
- **Sends back:** `{ case, accepted: true }`.

## `POST /cases/{caseId}/recommendations/{targetId}/reject` — record rejection (reason required)
- **Purpose:** Log that the doctor rejected a suggestion. **A reason is mandatory**
  (anti-rubber-stamp).
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `targetType` | no | Same options as above. |
  | `reason` | **yes** | Why it was rejected. Missing → `400 ValidationError`. |
- **Sends back:** `{ case, accepted: false }`.
- **Example:**
  ```bash
  curl -X POST "$API_URL/cases/AUR-1042/recommendations/dx-pe/reject" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"reason":"Low Wells score; prefer to wait."}'
  ```

---

## `POST /cases/{caseId}/documents` — upload a doctor's document
- **Purpose:** Attach a PDF/DOCX/text document to a case; its text is extracted
  and folded into `documentContext` as grounding for every subsequent AI step.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `fileBase64` | **yes** | The file, base64-encoded. |
  | `fileExtension` | no | `pdf` (default), `docx`, or any text extension. |
  | `contentType` | no | MIME type stored on the S3 object. |
- **Sends back:** `{ case, documentS3Uri }`.

## `POST /cases/{caseId}/audio` — upload a doctor-recorded audio file
- **Purpose:** Store a case's audio recording in S3 ahead of transcription — no
  text extraction, unlike `.../documents`. Returns the S3 key to pass straight
  into `.../transcribe`.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `fileBase64` | **yes** | The audio file, base64-encoded. |
  | `fileExtension` | no | `wav` (default), `mp3`, `m4a`, etc. |
  | `contentType` | no | MIME type stored on the S3 object. |
- **Sends back:** `{ case, s3Key, bucket }`.

## `POST /cases/{caseId}/transcribe` — start a HealthScribe transcription job
- **Purpose:** Kick off an AWS HealthScribe medical-scribe job against a case's
  uploaded audio. Returns immediately — a scribe job can run for minutes, well
  past any API Gateway integration timeout, so this never blocks waiting for
  it. Poll `.../transcribe/{jobName}` for the result.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):** one of:
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `s3Key` | one of these | The key returned by `.../audio` (resolved against the configured HealthScribe bucket). |
  | `audioS3Uri` | one of these | A full `s3://bucket/key` URI, if you already have one. |
- **Sends back:** `{ jobName, status: "IN_PROGRESS" }`.

## `GET /cases/{caseId}/transcribe/{jobName}` — poll a transcription job
- **Purpose:** Check a HealthScribe job's status; once complete, returns the
  structured clinical summary (chief complaint, HPI, review of systems, past
  medical history) extracted from it.
- **Who:** physician, admin, or compliance.
- **Sends back:** `{ status: "IN_PROGRESS" | "COMPLETED" | "FAILED", summary?, reason? }`
  — `summary` is present only when `status` is `COMPLETED`; `reason` only when `FAILED`.

## `POST /cases/{caseId}/feedback` — leave free-text feedback on a case
- **Purpose:** A doctor's free-text note on the AI's performance for this case
  — distinct from the structured accept/reject flywheel above. Stored per
  doctor, and folded back into that doctor's future AI prompts as a
  preference history.
- **Who:** physician, admin, or compliance.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `feedback` | **yes** | The feedback text. |
  | `category` | no | `general` (default), `diagnosis`, `summary`, etc. |
- **Sends back:** `{ status: "success", data }`.

---

## `GET /resources` — list the shared reference-document library
- **Purpose:** Browse the guideline/reference documents clinical staff have
  uploaded (not case-scoped — shared across every case). Metadata only; the
  extracted text is never sent to the client.
- **Who:** requires the **`resources.manage`** permission (physician, admin,
  or compliance by default).
- **Sends back:** a JSON array of resource metadata objects (`id`, `title`,
  `tags[]`, `s3Uri`, `fileExtension`, `uploadedBy`, `uploadedByUsername`,
  `createdAt`, `truncated`).

## `POST /resources` — upload a reference document
- **Purpose:** Add a document (e.g. a guideline for a specific condition) to
  the shared library. Its text is extracted and stored; `ai/bedrock.py`
  keyword-matches it against a case's chief complaint or a doctor's question
  and folds matching documents in as grounding evidence — no separate step
  needed once uploaded.
- **Who:** requires the **`resources.manage`** permission.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `title` | **yes** | Display title, e.g. `"Type 2 Diabetes Guideline"`. |
  | `fileBase64` | **yes** | The file, base64-encoded. |
  | `tags` | no | Array of topic keywords, e.g. `["diabetes", "endocrine"]` — matched against a case's chief complaint/question, case-insensitive. |
  | `fileExtension` | no | `pdf` (default), `docx`, or any text extension. |
  | `contentType` | no | MIME type stored on the S3 object. |
- **Sends back:** the created resource's metadata (same shape as the list above).

## `DELETE /resources/{resourceId}` — remove a reference document
- **Purpose:** Take a document out of the library; it stops being considered
  for future AI grounding.
- **Who:** requires the **`resources.manage`** permission.
- **Sends back:** `{ deleted: true }`.

---

# Admin panel — users + permission groups

Everything below requires the **`users.manage`** permission (only the
"Administrator" system group has it by default). These are not part of the
clinical role table above — they're how an admin actually manages accounts
and the permission groups that back it. See `docs/ARCHITECTURE.md` §5 for the
two-tier model (Cognito groups = coarse identity, these groups = fine-grained
permissions), and the "Admin panel access" subsection there for the frontend
route guard and the fixed, un-lockable super admin account.

## `GET /admin/users` — list every hospital account
- **Sends back:** a JSON array of *AppUser* (`sub`, `username`, `email`,
  `name`, `cognitoGroup`, `customGroups`, `permissionOverrides`, `status`,
  `createdAt`, `updatedAt`, `isSuperAdmin`).

## `POST /admin/users` — provision a new account
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `username` | **yes** | Cognito sign-in username. |
  | `email` | **yes** | Used for the Cognito `email` attribute (marked pre-verified). |
  | `name` | no | Display name. |
  | `cognitoGroup` | **yes** | One of `patient`, `physician`, `admin`, `compliance`. |
  | `customGroups` | no | Permission-group ids to assign; defaults to the system group matching `cognitoGroup`. |
- **Sends back:** `{ user, temporaryPassword }` — the temp password is
  generated server-side and shown **only in this one response**; the account
  is left in Cognito's `FORCE_CHANGE_PASSWORD` state, so the user sets their
  own permanent password on first sign-in (the existing `NEW_PASSWORD_REQUIRED`
  flow).
- **Errors:** `409 Conflict` if the username already exists.

## `GET /admin/users/{userId}` — get one account
- `userId` is the Cognito `sub`. Sends back one *AppUser*.

## `PUT /admin/users/{userId}` — update an account
- **Wants (JSON body, all optional):** `cognitoGroup`, `customGroups`,
  `permissionOverrides` (`{ "permission.key": true|false }`), `status`
  (`"active"` or `"disabled"`).
- Changing `cognitoGroup` moves the user between Cognito groups; changing
  `status` to `"disabled"` calls Cognito's `AdminDisableUser` (blocks sign-in
  entirely, separate from permissions).
- **Sends back:** the updated *AppUser*.
- **Errors:** `400 Validation` if this targets the fixed super admin account
  (`isSuperAdmin: true`, username `admin` by default) and the request would
  change its `cognitoGroup` away from `admin`, set `status` to `"disabled"`,
  drop the Administrator group from `customGroups`, or override
  `users.manage` to `false`. That account can't be locked out through this
  endpoint by design.

## `GET /admin/groups` — list permission groups
- **Sends back:** a JSON array of *PermissionGroup* (`id`, `name`,
  `description`, `permissions`, `isSystem`, `createdAt`, `updatedAt`). The 4
  system groups (`isSystem: true`) back the 4 Cognito roles.

## `POST /admin/groups` — create a custom permission group
- **Wants (JSON body):** `name` (**yes**), `description` (no), `permissions`
  (no — list of permission keys from the catalog below).
- **Sends back:** the created *PermissionGroup*.

## `PUT /admin/groups/{groupId}` — edit a group
- **Wants (JSON body, all optional):** `name`, `description`, `permissions`.
  Permissions can be edited on system groups too (that's how you'd loosen or
  tighten a role's defaults); only deleting a system group is blocked.
- **Sends back:** the updated *PermissionGroup*.

## `DELETE /admin/groups/{groupId}` — delete a custom group
- **Sends back:** `{ deleted: true }`.
- **Errors:** `409 Conflict` if the group is a system group.

## `GET /admin/permissions` — the fixed permission catalog
- **Sends back:** a JSON array of `{ key, label }` — every permission key
  that's actually checked somewhere in the backend (see the table above),
  plus `users.manage` itself. This is what the admin UI's permission
  checklists are built from; it is not admin-extensible.

---

# Errors

Errors come back as an HTTP status code plus a JSON body with a typed
`errorType` and a safe `message` (never patient data):

| HTTP | `errorType` | When it happens | What to do |
|-----|-------------|-----------------|-----------|
| 401 | `Unauthorized` | No/expired login token. | Re-authenticate; resend the ID token. |
| 403 | `Forbidden` | Not allowed (e.g. a patient opening another patient's case, or a role calling a restricted endpoint). | Expected for the wrong role — don't retry. |
| 404 | `NotFound` | The `caseId` / `examId` / `testId` / `diagnosisId` doesn't exist, or the route itself doesn't exist. | Check the id / path. |
| 400 | `ValidationError` | A required field is missing or invalid (e.g. rejecting without a reason). | Fix the inputs. |
| 409 | `StateTransitionError` | An illegal lifecycle move was requested. | Follow the allowed transitions ([`WORKFLOW.md`](./WORKFLOW.md) §1). |
| 500 | `InternalError` | Unexpected server error. | Retry; check CloudWatch logs if it persists. |

---

# The minimal happy path (copy/paste order)

```
POST /cases
  → POST /cases/{caseId}/interview/messages (repeat until complete=true)
  → POST /cases/{caseId}/interview/summary
  → POST /cases/{caseId}/exams → PUT /cases/{caseId}/exams/{examId}
  → POST /cases/{caseId}/diagnoses → POST /cases/{caseId}/diagnoses/ask
  → POST /cases/{caseId}/tests/{testId}/order → PUT /cases/{caseId}/tests/{testId}/result
    → POST /cases/{caseId}/diagnoses/rerank
  → POST /cases/{caseId}/final-diagnosis → PUT /cases/{caseId}/final-diagnosis
```

Everything a doctor screen needs is in these calls; everything a patient screen
needs is `POST /cases` + `POST /cases/{caseId}/interview/messages` (+
`GET /cases/{caseId}` / `GET /cases` for their own case).

> **No real-time channel today.** The previous AppSync-based design had
> `onCaseUpdated`/`onNewMessage` subscriptions; a plain REST-style API (REST
> or HTTP) has no equivalent. Multi-viewer sync is short-polling
> `GET /cases/{caseId}` for now — a WebSocket API (API Gateway) is the
> documented next step if live push is needed later.
