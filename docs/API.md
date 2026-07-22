# SEHATI-AI — API Reference (What Each Endpoint Wants & Sends)

This is the complete list of endpoints. For **each one** you get: its **purpose**,
**who may call it**, what it **wants** (inputs), what it **sends back** (outputs),
and a short **example**. Entities like *Case*, *Diagnosis*, *Test* are defined in
[`DATA_MODEL.md`](./DATA_MODEL.md); the order you call them in is in
[`WORKFLOW.md`](./WORKFLOW.md).

---

## How the API works (read this first)

- **One endpoint URL**, a **GraphQL** API on AWS AppSync. You send a *query* (to
  read) or a *mutation* (to change something).
- **Every request must be logged in.** Send the user's Cognito **ID token** in the
  `Authorization` header. That token tells the backend *who* the user is and *which
  role* they have — you never pass identity in the body.
- **JSON in, JSON out.** Because a Case is a large nested object, it travels as a
  JSON string (GraphQL type `AWSJSON`). So:
  - When an input is marked `AWSJSON` (e.g. `submitIntake`'s `input`), send a
    **JSON string**.
  - When a field like `case`, `diagnoses`, `summary` comes back, it's a **JSON
    string** — call `JSON.parse()` on it.
- **Same call, different data per role.** The backend filters results by who you
  are. A patient calling `listCases` sees only their own cases.

**Two shapes of response:**
1. Some endpoints return the **whole Case** directly (a JSON string).
2. Others return a small **wrapper object** with named parts, e.g.
   `{ case, aiMessage, complete }`. The `case` part is always the full, updated Case.

---

## Roles cheat-sheet

| | patient | physician | admin | compliance |
|---|:-:|:-:|:-:|:-:|
| read cases (`listCases`, `getCase`) | own only | ✓ | ✓ | ✓ |
| `submitIntake` | ✓ (self) | ✓ | ✓ | — |
| interview (`postInterviewMessage`, `generateSummary`) | ✓ | ✓ | ✓ | — |
| exams, differential, tests, chat, propose dx | — | ✓ | ✓ | ✓ |
| `acceptFinalDiagnosis` (sign-off) | — | ✓ | ✓ | — |
| `caseAudit` (read audit trail) | — | — | ✓ | ✓ |

If a user calls something they're not allowed to, they get a `Forbidden` error
(see [Errors](#errors) at the bottom).

---

# QUERIES (read data)

## `listCases` — list the cases you're allowed to see
- **Purpose:** Get the case list for a dashboard.
- **Who:** anyone logged in (patients get only their own).
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `status` | text | no | Filter to one status, e.g. `"Awaiting Tests"`. |
  | `mine` | boolean | no | For a physician: only cases assigned to me. |
- **Sends back:** a JSON string that is a **list of Cases** (each the full Case).
- **Example:**
  ```graphql
  query { listCases(status: "Awaiting Tests") }
  ```
  → `"[ {\"id\":\"AUR-1043\", ...}, {\"id\":\"AUR-1042\", ...} ]"`

## `getCase` — get one full case
- **Purpose:** Open a case and show everything about it.
- **Who:** anyone logged in (patients only their own; otherwise `Forbidden`).
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `id` | text | **yes** | The case id, e.g. `"AUR-1042"`. |
- **Sends back:** a JSON string that is the full **Case**.
- **Example:**
  ```graphql
  query { getCase(id: "AUR-1042") }
  ```

## `caseAudit` — read the permanent audit trail of a case
- **Purpose:** Compliance review — see every action taken on a case.
- **Who:** **compliance** or **admin** only.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `id` | text | **yes** | The case id. |
- **Sends back:** a JSON string that is a **list of audit entries**, each with
  `action`, `actor`, `ts`, and (where relevant) `modelVersion`, `retrievedContext`,
  `output`.
- **Example:**
  ```graphql
  query { caseAudit(id: "AUR-1042") }
  ```

---

# MUTATIONS (change data)

> In every response below, the returned `case` is the **full, updated Case**
> (JSON string). Only the *extra* parts are described per endpoint.

## `submitIntake` — create a new case from intake
- **Purpose:** Start a case. Auto-advances to the AI interview.
- **Who:** patient (creates their own), physician, or admin.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `input` | `AWSJSON` | **yes** | A JSON string with the intake payload (below). |

  **`input` fields:**
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
  ```graphql
  mutation {
    submitIntake(input: "{\"patient\":{\"name\":\"Layla\",\"age\":54,\"gender\":\"Female\"},\"chiefComplaint\":\"Headache 3 days with fever\",\"complaint\":{\"symptoms\":[\"Headache\",\"Fever\"],\"painScale\":6,\"duration\":\"3 days\"}}")
  }
  ```

## `postInterviewMessage` — send a patient answer, get the next question
- **Purpose:** Run the adaptive interview, one turn at a time.
- **Who:** patient, physician, or admin.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `text` | text | **yes** | The patient's answer. |
- **Sends back:** `{ case, aiMessage, complete }`
  | Part | Meaning |
  |------|---------|
  | `case` | Updated case (the turn is appended to `interview`). |
  | `aiMessage` | The AI's next question (a *ChatMessage*), or `null` if finished. |
  | `complete` | `true` when the interview is done → next call `generateSummary`. |
- **Example:**
  ```graphql
  mutation {
    postInterviewMessage(caseId: "AUR-1042", text: "It started 3 days ago and is worsening.") {
      aiMessage complete
    }
  }
  ```

## `generateSummary` — build the structured summary
- **Purpose:** Turn the interview into a doctor-ready summary. Advances to
  `DoctorReview`.
- **Who:** patient, physician, or admin.
- **Wants:** `caseId` (text, **required**).
- **Sends back:** `{ case, summary }` — `summary` is the *StructuredSummary*.
- **Example:**
  ```graphql
  mutation { generateSummary(caseId: "AUR-1042") { summary } }
  ```

## `recommendExams` — get suggested physical exams
- **Purpose:** Ask the AI which examinations matter for this case.
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (text, **required**).
- **Sends back:** `{ case, exams }` — `exams` is a list of *ExamRecommendation*
  (status `pending`).
- **Example:**
  ```graphql
  mutation { recommendExams(caseId: "AUR-1042") { exams } }
  ```

## `recordExamFinding` — enter what the doctor found
- **Purpose:** Save the result of one examination.
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `examId` | text | **yes** | Which exam (its `id`, e.g. `"e1"`). |
  | `finding` | text | no | What was found. |
  | `normalRange` | text | no | The normal range. |
  | `flag` | text | no | `normal` / `abnormal` / `critical`. |
  | `note` | text | no | Extra note. |
  | `status` | text | no | Defaults to `complete`. |
- **Sends back:** `{ case, exam }` — the updated exam.
- **Example:**
  ```graphql
  mutation {
    recordExamFinding(caseId: "AUR-1042", examId: "e1", finding: "Neck stiffness present", flag: "abnormal") { exam }
  }
  ```

## `requestRecommendations` — generate the differential + tests
- **Purpose:** Get the ranked list of possible diagnoses (with reasoning &
  citations) and suggested tests.
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (text, **required**).
- **Sends back:** `{ case, diagnoses, tests }`
  | Part | Meaning |
  |------|---------|
  | `diagnoses` | Ranked list of *Diagnosis* (each with `reasoning`, `supporting`, `references`, `confidence`, …). |
  | `tests` | List of *TestRecommendation* to consider ordering. |
- **Example:**
  ```graphql
  mutation { requestRecommendations(caseId: "AUR-1042") { diagnoses tests } }
  ```

## `askDiagnosis` — ask the AI about a diagnosis (explainability)
- **Purpose:** Challenge/interrogate the reasoning ("Why this? Why not that?").
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `question` | text | **yes** | The doctor's question. |
  | `diagnosisId` | text | no | Scope to one diagnosis; if given, the Q&A is saved in that diagnosis's `discussion`. |
- **Sends back:** `{ case, aiMessage }` — the AI's answer (a *ChatMessage*).
- **Example:**
  ```graphql
  mutation {
    askDiagnosis(caseId: "AUR-1042", diagnosisId: "dx-cap", question: "What would increase your confidence?") { aiMessage }
  }
  ```

## `orderTest` — order a recommended test
- **Purpose:** Mark a test as ordered. The **first** order moves the case to
  `InProgress` (Awaiting Tests).
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (**required**), `testId` (**required**, e.g. `"t1"`).
- **Sends back:** `{ case, test }` — the test now has status `ordered`.
- **Example:**
  ```graphql
  mutation { orderTest(caseId: "AUR-1042", testId: "t1") { test } }
  ```

## `recordTestResult` — enter a test result
- **Purpose:** Record a result (a radiologist's report is entered here as text).
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `testId` | text | **yes** | Which test. |
  | `result` | text | **yes** | The result value. |
  | `resultFlag` | text | no | `normal` / `abnormal` / `critical`. |
  | `resultDetail` | text | no | Extra detail. |
- **Sends back:** `{ case, test }` — the test now `completed` with the result.
- **Example:**
  ```graphql
  mutation {
    recordTestResult(caseId: "AUR-1042", testId: "t1", result: "RLL infiltrate", resultFlag: "abnormal") { test }
  }
  ```

## `rerankAfterResults` — re-reason once results are in
- **Purpose:** Have the AI update the differential with the new results. Moves the
  case to `ResultsDiscussion`.
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (text, **required**).
- **Sends back:** `{ case, diagnoses }` — the updated, re-ranked list.
- **Example:**
  ```graphql
  mutation { rerankAfterResults(caseId: "AUR-1042") { diagnoses } }
  ```

## `proposeFinalDiagnosis` — propose the conclusion
- **Purpose:** Ask the AI to propose a final diagnosis with a plan. Moves the case
  to `Diagnosis`.
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (text, **required**).
- **Sends back:** `{ case, finalDiagnosis }` — a *FinalDiagnosis* (status `proposed`).
- **Example:**
  ```graphql
  mutation { proposeFinalDiagnosis(caseId: "AUR-1042") { finalDiagnosis } }
  ```

## `acceptFinalDiagnosis` — doctor signs off (closes the case)
- **Purpose:** Physician accepts the final diagnosis. Moves the case to `Closed`.
- **Who:** **physician or admin only.**
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `note` | text | no | A sign-off note. |
- **Sends back:** `{ case, finalDiagnosis }` — `finalDiagnosis.status` is now
  `accepted`; the case is `Closed`.
- **Example:**
  ```graphql
  mutation { acceptFinalDiagnosis(caseId: "AUR-1042", note: "Agree, treating as bacterial.") { finalDiagnosis } }
  ```

## `setCaseState` — move the case to another state manually
- **Purpose:** Explicit lifecycle control (e.g. force a re-evaluation from
  `Diagnosis` back to `ResultsDiscussion`). Illegal jumps are rejected.
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `state` | text | **yes** | Target state, e.g. `"ResultsDiscussion"`. |
  | `note` | text | no | Reason for the move. |
- **Sends back:** the full **Case**.
- **Example:**
  ```graphql
  mutation { setCaseState(caseId: "AUR-1042", state: "ResultsDiscussion", note: "Re-evaluate.") }
  ```

## `addNote` — add a doctor's note
- **Purpose:** Attach a free-text note to the case.
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (**required**), `text` (**required**).
- **Sends back:** the full **Case** (note added to `notes`).

## `assistantChat` — case-level assistant chat
- **Purpose:** Open-ended chat with the AI about the whole case (the assistant panel).
- **Who:** physician, admin, or compliance.
- **Wants:** `caseId` (**required**), `text` (**required**).
- **Sends back:** `{ case, aiMessage }` — the AI's reply (saved to `assistantThread`).

## `acceptRecommendation` — record acceptance (feedback)
- **Purpose:** Log that the doctor accepted a suggestion (test, diagnosis…). Feeds
  the feedback flywheel + audit.
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `targetId` | text | **yes** | Id of the thing accepted (e.g. a test `t1` or diagnosis `dx-cap`). |
  | `targetType` | text | no | `recommendation` (default), `test`, `diagnosis`, or `final_diagnosis`. |
  | `reason` | text | no | Optional reason. |
- **Sends back:** `{ case, accepted: true }`.

## `rejectRecommendation` — record rejection (reason required)
- **Purpose:** Log that the doctor rejected a suggestion. **A reason is mandatory**
  (anti-rubber-stamp).
- **Who:** physician, admin, or compliance.
- **Wants:**
  | Argument | Type | Required | Description |
  |----------|------|:--:|-------------|
  | `caseId` | text | **yes** | The case id. |
  | `targetId` | text | **yes** | Id of the thing rejected. |
  | `targetType` | text | no | Same options as above. |
  | `reason` | text | **yes** | Why it was rejected. Missing → `ValidationError`. |
- **Sends back:** `{ case, accepted: false }`.
- **Example:**
  ```graphql
  mutation {
    rejectRecommendation(caseId: "AUR-1042", targetId: "dx-pe", reason: "Low Wells score; prefer to wait.") { accepted }
  }
  ```

---

# SUBSCRIPTIONS (real-time updates)

Use these to keep multiple viewers of a case in sync, or to stream chat.

## `onCaseUpdated` / `onNewMessage`
- **Purpose:** Receive a push whenever a case changes / a new message is posted.
- **Wants:** `caseId` (**required**).
- **How it fires:** these are triggered when a matching **publish** mutation runs.
  After you make a change locally, call the publish mutation to fan it out:

  | Subscription | Fired by | Publish wants |
  |--------------|----------|---------------|
  | `onCaseUpdated(caseId)` | `publishCaseUpdate(caseId, case)` | `case` = the updated Case JSON |
  | `onNewMessage(caseId)` | `publishMessage(caseId, message)` | `message` = the new *ChatMessage* JSON |

- **Example:**
  ```graphql
  subscription { onNewMessage(caseId: "AUR-1042") }
  ```

> Today AI replies come back as **complete messages**. Token-by-token streaming is a
> documented future extension ([`ARCHITECTURE.md`](./ARCHITECTURE.md) §8).

---

# Errors

Errors come back with a typed `errorType` and a safe `message` (never patient data):

| `errorType` | When it happens | What to do |
|-------------|-----------------|-----------|
| `Unauthorized` | No/expired login token. | Re-authenticate; resend the ID token. |
| `Forbidden` | Not allowed (e.g. a patient opening another patient's case, or a role calling a restricted endpoint). | Expected for the wrong role — don't retry. |
| `NotFound` | The `caseId` / `examId` / `testId` / `diagnosisId` doesn't exist. | Check the id. |
| `ValidationError` | A required argument is missing or invalid (e.g. rejecting without a reason). | Fix the inputs. |
| `StateTransitionError` | An illegal lifecycle move was requested. | Follow the allowed transitions ([`WORKFLOW.md`](./WORKFLOW.md) §1). |

---

# The minimal happy path (copy/paste order)

```
submitIntake
  → postInterviewMessage (repeat until complete=true)
  → generateSummary
  → recommendExams → recordExamFinding
  → requestRecommendations → askDiagnosis
  → orderTest → recordTestResult → rerankAfterResults
  → proposeFinalDiagnosis → acceptFinalDiagnosis
```

Everything a doctor screen needs is in these calls; everything a patient screen
needs is `submitIntake` + `postInterviewMessage` (+ `getCase`/`listCases` for their
own case).
