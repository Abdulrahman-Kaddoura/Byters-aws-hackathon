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

There are three kinds of account: **doctor**, **nurse**, **admin**. Patients
never sign in — a nurse admits them and hands over her own device for the AI
interview.

| | nurse | doctor | admin |
|---|:-:|:-:|:-:|
| admit a patient (`POST /cases`) | ✓ | — | ✓ |
| assign/reassign a case (`POST /cases/{caseId}/assign`, `GET /doctors`) | ✓ | — | ✓ |
| read cases (`GET /cases`, `GET /cases/{caseId}`) | any, redacted | **assigned only** | ✓ |
| see clinical content (interview, differential, tests, diagnosis) | — | ✓ | ✓ |
| run the interview (`.../interview`, `.../interview/messages`, `.../interview/summary`) | ✓ | ✓ | ✓ |
| side conversations (`.../conversations`) | ✓ | ✓ | ✓ |
| exams, differential, tests, assistant chat, propose dx | — | ✓ | ✓ |
| accept final diagnosis (sign-off) | — | ✓ | ✓ |
| case documents (`.../documents`) | upload + read | ✓ (incl. delete) | ✓ |
| private case tags (`PUT /cases/{caseId}/tags`) | ✓ | ✓ | ✓ |
| audit trail (`GET /cases/{caseId}/audit`) | — | — | ✓ |
| reference library (`/resources`) | — | ✓ | ✓ |
| user + group management (`/admin/users`, `/admin/groups`) | — | — | ✓ |
| hospital settings (`/admin/settings`) | — | — | ✓ |
| unlock a kiosk device (`POST /kiosk/exit`) | ✓ | ✓ | ✓ |

If a user calls something they're not allowed to, they get a `403 Forbidden`
error (see [Errors](#errors) at the bottom).

**This table is enforced, not just descriptive.** Each action checks a
fine-grained **permission** (`cases.create`, `cases.assign`,
`cases.view_clinical`, `cases.manage_state`, `cases.add_note`, `exams.manage`,
`diagnoses.manage`, `final_diagnosis.accept`, `tests.manage`,
`assistant.chat`, `recommendations.record`, `documents.manage`, `audit.view`,
`users.manage`, `settings.manage`, `resources.manage`) rather than the role
name. A user's effective permissions come from the admin-editable permission
**groups** they belong to (see the `/admin` endpoints below), seeded so every
role starts out with exactly this table's behaviour. `GET /me` returns the
caller's own set, which is what the frontend gates its screens on — client and
server therefore cannot disagree.

### Two things the permission system does *not* do

**Row-level access.** Which cases you can reach at all is decided by your
Cognito role and the case's `assignedPhysicianId`, in the data layer
(`db/cases_repo._visible_to`). Assignment is a boundary, not a filter: a
doctor reads the cases routed to them and nothing else, and no permission
grant widens that. Nurses reach the whole admissions desk so they can
reassign for each other; admins reach everything.

**Field-level redaction.** A caller without `cases.view_clinical` gets a
case stripped of `interview`, `summary`, `exams`, `diagnoses`, `tests`,
`finalDiagnosis`, `notes`, `insights`, `assistantThread`, `conversations`,
`timeline`, `primaryImpression`, `documentContext` and `recentUpdates` before
the response leaves the Lambda (`handler._project_result`). A nurse can
therefore open a case to check her intake and route it, without the payload
ever containing the clinical record. Document `text` and S3 keys are stripped
for everyone — downloads go through a presigned URL.

---

---

# ENDPOINTS

## `GET /me` — who am I and what may I do
- **Purpose:** The caller's own identity, role and effective permissions. The
  frontend gates every screen on this, so client and server can't disagree
  about access.
- **Who:** anyone logged in. No permission required.
- **Sends back:** `{ sub, username, name, email, role, permissions[], caseTags }`
  where `role` is `"doctor" | "nurse" | "admin"` (or `null` for an account with
  no role), `permissions` is the caller's effective permission keys, and
  `caseTags` maps case id → this user's private labels.
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/me"
  ```

## `GET /doctors` — who a case can be routed to
- **Purpose:** Populate the nurse's assignment picker.
- **Who:** requires `cases.assign` (nurse, admin).
- **Sends back:** `[{ sub, name }]` for every active doctor. Names and ids
  only — deliberately not a staff directory.

---

## `GET /cases` — list the cases you're allowed to see
- **Purpose:** Get the case list.
- **Who:** anyone logged in. A doctor always gets exactly their assigned cases;
  a nurse gets the admissions desk (redacted); an admin gets everything.
- **Wants (query string):**
  | Param | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `status` | text | no | Filter to one status, e.g. `"Awaiting Tests"`. |
  | `scope` | text | no | `mine` — for a nurse, only the patients she admitted. Ignored for doctors, whose list is always their own assignments. |
- **Sends back:** a JSON array of **Cases**, each projected for your role (a
  nurse's rows have no clinical fields — see the cheat-sheet above).
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases?status=Awaiting%20Tests"
  ```

## `GET /cases/{caseId}` — get one case
- **Purpose:** Open a case.
- **Who:** the assigned doctor, any nurse, or an admin. Anyone else gets
  `403 Forbidden` — including a doctor the case is not assigned to.
- **Sends back:** the **Case** object, projected for your role. With
  `cases.view_clinical` that's the whole record; without it, the clinical
  fields are absent from the response entirely.
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases/AUR-1042"
  ```

## `GET /cases/{caseId}/audit` — read the permanent audit trail of a case
- **Purpose:** Compliance review — see every action taken on a case.
- **Who:** requires `audit.view` (**admin** by default).
- **Sends back:** a JSON array of **audit entries**, each with `action`, `actor`,
  `ts`, and (where relevant) `modelVersion`, `retrievedContext`, `output`.
- **Example:**
  ```bash
  curl -H "Authorization: Bearer $TOKEN" "$API_URL/cases/AUR-1042/audit"
  ```

---

## `POST /cases` — admit a patient
- **Purpose:** The nurse's admission form. Creates the case and auto-advances
  it to the AI interview.
- **Who:** requires `cases.create` (nurse, admin).
- **Wants (JSON body — the intake payload directly):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `patient` | **yes** | Object with at least `name` (plus `age`, `gender`, `height`, `weight`). |
  | `vitals` | no | Measured vitals (`bp`, `hr`, `rr`, `spo2`, `temp`). |
  | `chiefComplaint` | no | One line, if known. The AI interview establishes it otherwise. |
  | `history` | no | Medical history object. |

  Symptoms are deliberately not collected here — the AI interview asks the
  patient directly, so a form field would mean asking twice.

  **Ownership comes from your token, not the body.** `createdByNurseId` is set
  to the caller; any `patientId` or `assignedPhysicianId` in the body is
  ignored. Routing is a separate, audited step (`POST /cases/{caseId}/assign`).
- **Sends back:** the full new **Case** (state = `AIInterview`, with the AI's first
  greeting already in `interview`).
- **Example:**
  ```bash
  curl -X POST "$API_URL/cases" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"patient":{"name":"Layla","age":54,"gender":"Female","height":"165 cm","weight":"70 kg"},"vitals":{"bp":"128/82","hr":"88 bpm","temp":"38.1°C","spo2":"97%"}}'
  ```

## `POST /cases/{caseId}/assign` — route a case to a doctor
- **Purpose:** Give the case to one doctor. **This is what grants access:**
  until a case is assigned, no doctor can open it.
- **Who:** requires `cases.assign` (nurse, admin). A doctor cannot reassign
  their own case.
- **Wants (JSON body):** `{ "doctorId": "<cognito sub>" }`. The target must be
  an active account whose role is `doctor`, or you get a `400 ValidationError`.
- **Sends back:** the updated **Case** with `assignedPhysicianId`, `assignedAt`
  and `assignedBy` set. Reassignment is allowed and recorded in the audit trail
  with the previous doctor.

## `PUT /cases/{caseId}/tags` — set your private labels on a case
- **Purpose:** Personal shorthand ("follow up monday", "waiting on radiology")
  for filtering your own list.
- **Who:** anyone who can already see the case.
- **Wants (JSON body):** `{ "tags": ["follow up monday"] }`. Max 10 tags, each
  trimmed to 40 characters; an empty list clears them.
- **Sends back:** `{ caseId, tags }`.
- Tags are stored on **your** user record, not on the case, so nobody else can
  see them. Read them back from `GET /me`.

## `PUT /cases/{caseId}` — move the case to another state manually
- **Purpose:** Explicit lifecycle control (e.g. force a re-evaluation from
  `Diagnosis` back to `ResultsDiscussion`). Illegal jumps are rejected.
- **Who:** requires `cases.manage_state` (doctor, admin).
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `state` | **yes** | Target state, e.g. `"ResultsDiscussion"`. |
  | `note` | no | Reason for the move. |
- **Sends back:** the full **Case**.

## `POST /cases/{caseId}/notes` — add a doctor's note
- **Purpose:** Attach a free-text note to the case.
- **Who:** requires `cases.add_note` (doctor, admin).
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** the full **Case** (note added to `notes`).

---

## `GET /cases/{caseId}/interview` — the live transcript (kiosk screen)
- **Purpose:** Read the interview conversation on its own, scoped to one case.
- **Who:** anyone who can see the case.
- **Wants (query string):** `conversationId` (optional) to read a follow-up
  session instead of the primary interview.
- **Sends back:** `{ caseId, title, messages, open, patientName }` — `open` is
  false once the interview has moved past `AIInterview`, so the kiosk shows it
  read-only.
- **Why this exists:** the interview runs on the *nurse's* device while the
  patient answers, but the transcript is clinical content and is stripped from
  any case payload she receives. This endpoint gives the kiosk screen the
  conversation without handing her the rest of the record.

## `POST /cases/{caseId}/interview/messages` — send a patient answer, get the next question
- **Purpose:** Run the adaptive interview, one turn at a time.
- **Who:** anyone who can see the case.
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
- **Who:** anyone who can see the case.
- **Sends back:** `{ case, summary }` — `summary` is the *StructuredSummary*.

---

## `POST /cases/{caseId}/conversations` — start a side conversation
- **Purpose:** Start an extra chat session on an existing case — a return
  visit or a new question — separate from the primary intake `interview`.
  Purely additive: never affects `lifecycleState`, `status`, or `stage`.
- **Who:** anyone who can see the case.
- **Wants (JSON body):** `title` (optional; defaults to `"New conversation"`).
- **Sends back:** `{ case, conversation }` — `conversation` is the new
  *Conversation* (`{ id, title, createdAt, updatedAt, messages: [] }`),
  also appended to `case.conversations`.

## `POST /cases/{caseId}/conversations/{conversationId}/messages` — post to a side conversation
- **Purpose:** Send a message in one specific side conversation and get the
  AI's grounded reply (uses the case's current data, including stage/status).
- **Who:** anyone who can see the case.
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** `{ case, conversation, aiMessage }` — `conversation` is the
  updated *Conversation* (both turns appended to `messages`).

---

## `POST /cases/{caseId}/consultation` — answer the recording prompt
- **Purpose:** Record whether the doctor has a recording of their own
  consultation with the patient, and attach its transcription summary if so.
  The doctor is asked exactly once, the first time they open a case routed to
  them, because everything the AI generates downstream (summary, exams, tests,
  differential) reasons over this alongside the AI interview.
- **Who:** requires `cases.view_clinical` (doctor, admin).
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `hasRecording` | **yes** | `false` is a real answer — it records that the question was put and stops it being asked again. |
  | `summary` | only when `hasRecording` | The HealthScribe clinical summary (see `GET /cases/{caseId}/transcribe/{jobName}`). |
  | `jobName` | no | The transcription job it came from. |
  | `s3Key` | no | Where the audio was uploaded. |
- **Sends back:** `{ case, consultation }`.

---

## `POST /cases/{caseId}/exams` — get suggested physical exams
- **Purpose:** Ask the AI which examinations matter for this case.
- **Who:** requires `exams.manage` (doctor, admin).
- **Sends back:** `{ case, exams }` — `exams` is a list of *ExamRecommendation*
  (status `pending`).

## `POST /cases/{caseId}/exams/custom` — record an exam the AI didn't suggest
- **Purpose:** A doctor examines the patient in front of them, not the one in
  the model's prompt. This puts an examination they actually performed onto the
  case, where the AI reads it exactly like a recommended one.
- **Who:** requires `exams.manage` (doctor, admin).
- **Wants (JSON body):** `name` (**required**), plus optional `finding`,
  `reason`, `flag`, `note`.
- **Sends back:** `{ case, exam }` — the exam lands `complete` (it describes
  something that has already happened) with `custom: true`.

## `PUT /cases/{caseId}/exams/{examId}` — enter what the doctor found
- **Purpose:** Save the result of one examination.
- **Who:** requires `exams.manage` (doctor, admin).
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
- **Who:** requires `diagnoses.manage` (doctor, admin).
- **Sends back:** `{ case, diagnoses, tests }`
  | Part | Meaning |
  |------|---------|
  | `diagnoses` | Ranked list of *Diagnosis* (each with `reasoning`, `supporting`, `references`, `confidence`, …). |
  | `tests` | List of *TestRecommendation* to consider ordering. |

## `POST /cases/{caseId}/diagnoses/ask` — ask the AI about a diagnosis (explainability)
- **Purpose:** Challenge/interrogate the reasoning ("Why this? Why not that?").
- **Who:** requires `diagnoses.manage` (doctor, admin).
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `question` | **yes** | The doctor's question. |
  | `diagnosisId` | no | Scope to one diagnosis; if given, the Q&A is saved in that diagnosis's `discussion`. |
- **Sends back:** `{ case, aiMessage }` — the AI's answer (a *ChatMessage*).

## `POST /cases/{caseId}/diagnoses/analyze` — weigh the results
- **Purpose:** The differential's main entry point once a workup is underway.
  Compares each recommended test against the result the doctor entered, then
  answers honestly rather than always producing a ranking.
- **Who:** requires `diagnoses.manage` (doctor, admin).
- **Sends back:** `{ case, verdict, message, diagnoses, newTests }`
  | `verdict` | Meaning |
  |-----------|---------|
  | `no_results` | Nothing has been resulted, so there is nothing to reason over. No case change beyond recording the verdict. |
  | `confident` | The results settle it; `diagnoses` is the re-ranked differential. Moves `InProgress` → `ResultsDiscussion`. |
  | `needs_more_tests` | The results narrow the field without closing it. `newTests` have been written onto the case as a new round and the case goes back to `InProgress`. |
- **What a new round does to `tests`:** everything `ordered` or `completed`
  keeps its `round` number and stays as history; recommendations the doctor
  never acted on are dropped, since they are the guesses this analysis just
  superseded. `case.testRound` is incremented.

## `POST /cases/{caseId}/diagnoses/rerank` — re-reason once results are in
- **Purpose:** Have the AI update the differential with the new results. Moves the
  case to `ResultsDiscussion`.
- **Who:** requires `diagnoses.manage` (doctor, admin).
- **Sends back:** `{ case, diagnoses }` — the updated, re-ranked list.

---

## `POST /cases/{caseId}/final-diagnosis` — propose the conclusion
- **Purpose:** Ask the AI to propose a final diagnosis with a plan. Moves the case
  to `Diagnosis`.
- **Who:** requires `diagnoses.manage` (doctor, admin).
- **Sends back:** `{ case, finalDiagnosis }` — a *FinalDiagnosis* (status `proposed`).

## `PUT /cases/{caseId}/final-diagnosis` — doctor signs off
- **Purpose:** Physician accepts the final diagnosis. Moves the case to
  `Treatment` — **not** `Closed`. Sign-off is not resolution: the patient still
  has to be treated, and treatment is where an unexpected outcome shows up.
- **Who:** requires `final_diagnosis.accept` (doctor, admin).
- **Wants (JSON body):** `note` (no, optional sign-off note).
- **Sends back:** `{ case, finalDiagnosis }` — `finalDiagnosis.status` is now
  `accepted`; the case is on `Treatment`.
- **Example:**
  ```bash
  curl -X PUT "$API_URL/cases/AUR-1042/final-diagnosis" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"note":"Agree, treating as bacterial."}'
  ```

## `POST /cases/{caseId}/resolve` — the patient got better; close the case
- **Purpose:** The one thing that actually closes a case (`Treatment` →
  `Closed`), and the only thing that unlocks `POST /cases/{caseId}/feedback`.
- **Who:** requires `cases.manage_state` (doctor, admin).
- **Wants (JSON body):** optional `outcome` (defaults to the final diagnosis's
  name) and `note`.
- **Sends back:** `{ case }`.
- **Errors:** `ValidationError` if the case is not on `Treatment`.

## `POST /cases/{caseId}/reopen` — the outcome wasn't what was predicted
- **Purpose:** Withdraw the sign-off and re-reason. Moves `Treatment` →
  `ResultsDiscussion`, writes the doctor's account of what happened onto the
  case as a note the AI reads, sets `finalDiagnosis.status` back to `proposed`,
  and then runs `POST /cases/{caseId}/diagnoses/analyze` immediately — so a
  reopen usually lands the doctor on a fresh round of tests.
- **Who:** requires `cases.manage_state` (doctor, admin).
- **Wants (JSON body):** `reason` (**required**).
- **Sends back:** the analyze response — `{ case, verdict, message, diagnoses, newTests }`.

---

## `POST /cases/{caseId}/tests/recommend` — get suggested investigations
- **Purpose:** Stock the workup with AI-recommended tests without first
  committing to a differential (the differential is results-driven and has
  nothing to say until something comes back). Merges by name, so calling it
  again adds only what's new, tagged with the current `case.testRound`.
- **Who:** requires `tests.manage` (doctor, admin).
- **Sends back:** `{ case, tests }` — the full list.

## `POST /cases/{caseId}/tests/custom` — record a test the AI didn't suggest
- **Purpose:** A recommendation is a suggestion, not a work order. This puts an
  investigation the doctor ordered themselves onto the case.
- **Who:** requires `tests.manage` (doctor, admin).
- **Wants (JSON body):** `name` (**required**), plus optional `category`,
  `reason`, `expectedFinding`, `priority`.
- **Sends back:** `{ case, test }` — the test starts at `ordered` (awaiting
  results, since it has already been ordered) with `custom: true`.

## `PUT /cases/{caseId}/tests/{testId}` — change a test's status
- **Purpose:** Mark a test awaiting results, or record that the doctor chose
  not to run it.
- **Who:** requires `tests.manage` (doctor, admin).
- **Wants (JSON body):** `status` (**required**) — one of `recommended`,
  `ordered` (awaiting results), `pending`, `declined`; optional `note`.
  `completed` is rejected: a test becomes complete by having a result recorded,
  never by a status flip.
- **Sends back:** `{ case, test }`.

## `POST /cases/{caseId}/tests/{testId}/order` — order a recommended test
- **Purpose:** Mark a test as ordered. The **first** order moves the case to
  `InProgress` (Awaiting Tests).
- **Who:** requires `tests.manage` (doctor, admin).
- **Sends back:** `{ case, test }` — the test now has status `ordered`.

## `PUT /cases/{caseId}/tests/{testId}/result` — enter a test result
- **Purpose:** Record a result (a radiologist's report is entered here as text).
- **Who:** requires `tests.manage` (doctor, admin).
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
- **Who:** requires `assistant.chat` (doctor, admin).
- **Wants (JSON body):** `text` (**required**).
- **Sends back:** `{ case, aiMessage }` — the AI's reply (saved to `assistantThread`).

## `POST /cases/{caseId}/recommendations/{targetId}/accept` — record acceptance (feedback)
- **Purpose:** Log that the doctor accepted a suggestion (test, diagnosis…). Feeds
  the feedback flywheel + audit.
- **Who:** requires `recommendations.record` (doctor, admin).
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `targetType` | no | `recommendation` (default), `test`, `diagnosis`, or `final_diagnosis`. |
  | `reason` | no | Optional reason. |
- **Sends back:** `{ case, accepted: true }`.

## `POST /cases/{caseId}/recommendations/{targetId}/reject` — record rejection (reason required)
- **Purpose:** Log that the doctor rejected a suggestion. **A reason is mandatory**
  (anti-rubber-stamp).
- **Who:** requires `recommendations.record` (doctor, admin).
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

## `POST /cases/{caseId}/documents` — attach a document
- **Purpose:** Add a file to the case. Its text is extracted and folded into
  `documentContext` as grounding for every subsequent AI step. A case keeps
  **all** its documents; the combined grounding text is capped at ~40k
  characters, newest first, so a thick folder can't blow out the model context.
- **Who:** requires `documents.manage` (nurse, doctor, admin) — nurses attach
  referral letters and prior records at admission.
- **Wants (JSON body):**
  | Field | Required | Description |
  |-------|:--:|-------------|
  | `fileBase64` | **yes** | The file, base64-encoded. |
  | `fileName` | recommended | Original filename, shown in the document list. |
  | `fileExtension` | no | `pdf` (default), `docx`, or any text extension. |
  | `contentType` | no | MIME type stored on the S3 object. |
- **Sends back:** `{ case, document }` — document metadata only; the extracted
  text and S3 key stay server-side.

## `GET /cases/{caseId}/documents` — list a case's documents
- **Who:** requires `documents.manage`.
- **Sends back:** `{ documents: [{ id, name, contentType, extension, size,
  uploadedBy, uploadedByName, uploadedAt }] }`.

## `GET /cases/{caseId}/documents/{documentId}` — download or preview one
- **Who:** requires `documents.manage`.
- **Sends back:** `{ document, url, expiresIn }` — `url` is a presigned S3 link
  valid for 5 minutes. Raw S3 keys are never handed to a client.

## `DELETE /cases/{caseId}/documents/{documentId}` — remove a document
- **Who:** requires `cases.view_clinical` (doctor, admin). A nurse can attach
  paperwork but not remove anything from the record.

## `POST /cases/{caseId}/audio` — upload a doctor-recorded audio file
- **Purpose:** Store a case's audio recording in S3 ahead of transcription — no
  text extraction, unlike `.../documents`. Returns the S3 key to pass straight
  into `.../transcribe`.
- **Who:** requires `documents.manage`.
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
- **Who:** requires `documents.manage`.
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
- **Who:** requires `documents.manage`.
- **Sends back:** `{ status: "IN_PROGRESS" | "COMPLETED" | "FAILED", summary?, reason? }`
  — `summary` is present only when `status` is `COMPLETED`; `reason` only when `FAILED`.

## `POST /cases/{caseId}/feedback` — leave free-text feedback on a case
- **Purpose:** A doctor's free-text note on the AI's performance for this case
  — distinct from the structured accept/reject flywheel above. Stored per
  doctor, and folded back into that doctor's future AI prompts as a
  preference history.
- **Who:** anyone who can see the case — **and only once the case is
  `Closed`.** How the AI reasoned can only be judged once the patient's outcome
  is known, so an open case rejects feedback with a `ValidationError`. Mark the
  case resolved (`POST /cases/{caseId}/resolve`) first. This is a server rule,
  not a UI convention: the client offers the form in exactly one place because
  this is the only state that accepts it.
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
- **Who:** requires `resources.manage` (doctor, admin).
- **Sends back:** a JSON array of resource metadata objects (`id`, `title`,
  `tags[]`, `s3Uri`, `fileExtension`, `uploadedBy`, `uploadedByUsername`,
  `createdAt`, `truncated`).

## `POST /resources` — upload a reference document
- **Purpose:** Add a document (e.g. a guideline for a specific condition) to
  the shared library. Its text is extracted and stored; `ai/bedrock.py`
  keyword-matches it against a case's chief complaint or a doctor's question
  and folds matching documents in as grounding evidence — no separate step
  needed once uploaded.
- **Who:** requires `resources.manage` (doctor, admin).
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
- **Who:** requires `resources.manage` (doctor, admin).
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
  | `cognitoGroup` | **yes** | One of `doctor`, `nurse`, `admin`. |
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

## `GET /admin/settings` — hospital-wide settings
- **Who:** requires `settings.manage` (admin).
- **Sends back:** `{ kioskExitPasswordSet, updatedAt, updatedBy }`. The
  password itself is stored as a PBKDF2 hash and is **never** returned — only
  whether one exists.

## `PUT /admin/settings` — set the patient-interview exit password
- **Who:** requires `settings.manage` (admin).
- **Wants (JSON body):** `{ "kioskExitPassword": "…" }` (minimum 4 characters).
- **Sends back:** the same shape as `GET`. Replacing the password invalidates
  the old one immediately.

---

# Patient-interview (kiosk) lock

A nurse hands the patient her own device, so the browser is holding *her*
session. While the interview runs the client refuses to navigate anywhere else;
these two endpoints are the only way out. The comparison happens server-side on
purpose — a password checked in JavaScript is readable in the shipped bundle.

## `GET /kiosk` — is an exit password configured?
- **Who:** anyone logged in.
- **Sends back:** `{ kioskExitPasswordSet: boolean }` — nothing else. Lets the
  nurse's UI warn her *before* she hands the device over.

## `POST /kiosk/exit` — unlock the device
- **Who:** anyone logged in.
- **Wants (JSON body):** `{ "password": "…" }`.
- **Sends back:** `{ ok: true }`, or `403 Forbidden` if the password is wrong.
  If no password has ever been set it also refuses, with a message pointing at
  the admin panel — an unconfigured hospital fails closed (device stays
  locked) rather than open.

---

# Errors

Errors come back as an HTTP status code plus a JSON body with a typed
`errorType` and a safe `message` (never patient data):

| HTTP | `errorType` | When it happens | What to do |
|-----|-------------|-----------------|-----------|
| 401 | `Unauthorized` | No/expired login token. | Re-authenticate; resend the ID token. |
| 403 | `Forbidden` | Not allowed — e.g. a doctor opening a case that isn't assigned to them, a nurse calling a clinical endpoint, or a wrong kiosk exit password. | Expected for the wrong role — don't retry. |
| 404 | `NotFound` | The `caseId` / `examId` / `testId` / `diagnosisId` doesn't exist, or the route itself doesn't exist. | Check the id / path. |
| 400 | `ValidationError` | A required field is missing or invalid (e.g. rejecting without a reason). | Fix the inputs. |
| 409 | `StateTransitionError` | An illegal lifecycle move was requested. | Follow the allowed transitions ([`WORKFLOW.md`](./WORKFLOW.md) §1). |
| 500 | `InternalError` | Unexpected server error. | Retry; check CloudWatch logs if it persists. |

---

# The minimal happy path (copy/paste order)

```
NURSE
POST /cases                                     (admit the patient)
  → GET  /cases/{caseId}/interview              (kiosk screen)
  → POST /cases/{caseId}/interview/messages     (repeat until complete=true)
  → POST /cases/{caseId}/interview/summary
  → POST /kiosk/exit                            (take the device back)
  → GET  /doctors → POST /cases/{caseId}/assign (route it)

DOCTOR
GET  /cases                                     (their assigned cases)
  → POST /cases/{caseId}/consultation           (asked once, on first open)
  → POST /cases/{caseId}/exams → PUT /cases/{caseId}/exams/{examId}
  → POST /cases/{caseId}/tests/recommend        (or /tests/custom)
  → PUT  /cases/{caseId}/tests/{testId}         (mark awaiting results)
  → PUT  /cases/{caseId}/tests/{testId}/result  (enter what came back)
  → POST /cases/{caseId}/diagnoses/analyze      ⤵ loop while verdict is
      needs_more_tests: a new round is on the workup, enter its results
      and analyze again
  → POST /cases/{caseId}/final-diagnosis → PUT /cases/{caseId}/final-diagnosis
  → POST /cases/{caseId}/resolve                (or /reopen if it went wrong)
  → POST /cases/{caseId}/feedback               (only once resolved)
```

Every screen starts with `GET /me` to learn what it is allowed to show.

> **No real-time channel today.** The previous AppSync-based design had
> `onCaseUpdated`/`onNewMessage` subscriptions; a plain REST-style API (REST
> or HTTP) has no equivalent. Multi-viewer sync is short-polling
> `GET /cases/{caseId}` for now — a WebSocket API (API Gateway) is the
> documented next step if live push is needed later.
