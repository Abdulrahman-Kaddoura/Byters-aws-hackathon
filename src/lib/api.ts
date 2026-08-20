import { config } from './config';
import { getIdToken, signOut } from './auth';
import type {
  AppUser,
  CaseAnalysis,
  CaseDocument,
  ChatMessage,
  CognitoGroup,
  Consultation,
  ConsultationSummary,
  Conversation,
  Diagnosis,
  ExamRecommendation,
  Flag,
  FinalDiagnosis,
  KnowledgeResource,
  Me,
  PatientCase,
  PermissionCatalogEntry,
  PermissionGroup,
  StructuredSummary,
  TestRecommendation,
  TestStatus,
} from '../types';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Every mutation echoes the full updated case so the UI can re-render from one source. */
interface CaseEnvelope {
  case: PatientCase;
}

/** 503/504 here means the API Gateway integration gave up waiting on the
 * Lambda (its hard ceiling is well under the AI calls' worst-case latency),
 * not that the request was bad — the same call often succeeds a moment
 * later. Retried once before surfacing it as an error. */
const GATEWAY_TIMEOUT_STATUSES = new Set([503, 504]);

async function request<T>(method: string, path: string, body?: unknown, _retried = false): Promise<T> {
  const token = await getIdToken();
  if (!token) {
    signOut();
    throw new ApiError(401, 'Unauthorized', 'Your session has expired. Please sign in again.');
  }

  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      // HTTP API's JWT authorizer (Cognito as issuer) requires the bearer
      // scheme on the Authorization header, unlike the old REST API's
      // COGNITO_USER_POOLS authorizer, which accepted the raw ID token.
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (GATEWAY_TIMEOUT_STATUSES.has(res.status) && !_retried) {
    await new Promise((r) => setTimeout(r, 1500));
    return request<T>(method, path, body, true);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) signOut();
    if (GATEWAY_TIMEOUT_STATUSES.has(res.status)) {
      throw new ApiError(
        res.status,
        'ServiceUnavailable',
        "Aura's still working on this — the request took longer than the server allows. Please try again in a moment."
      );
    }
    throw new ApiError(res.status, data?.errorType ?? 'Error', data?.message ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

const enc = encodeURIComponent;

// --- Identity ---------------------------------------------------------------
/** Who the caller is and what the server will actually let them do. */
export function me(): Promise<Me> {
  return request('GET', '/me');
}

/** The doctors a case can be routed to (names and ids only). */
export function listDoctors(): Promise<{ sub: string; name: string }[]> {
  return request('GET', '/doctors');
}

// --- Cases ------------------------------------------------------------------
/** `scope: 'mine'` narrows a nurse's list to the patients she admitted; a
 * doctor's list is always their own assignments, enforced server-side. */
export function listCases(opts: { status?: string; scope?: 'mine' } = {}): Promise<PatientCase[]> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.scope) qs.set('scope', opts.scope);
  const query = qs.toString();
  return request('GET', `/cases${query ? `?${query}` : ''}`);
}

export function assignCase(caseId: string, doctorId: string): Promise<PatientCase> {
  return request('POST', `/cases/${enc(caseId)}/assign`, { doctorId });
}

export function setCaseTags(caseId: string, tags: string[]): Promise<{ caseId: string; tags: string[] }> {
  return request('PUT', `/cases/${enc(caseId)}/tags`, { tags });
}

export function getCase(id: string): Promise<PatientCase> {
  return request('GET', `/cases/${enc(id)}`);
}

export function submitIntake(payload: unknown): Promise<PatientCase> {
  return request('POST', '/cases', payload);
}

export function setCaseState(caseId: string, state: string, note?: string): Promise<PatientCase> {
  return request('PUT', `/cases/${enc(caseId)}`, { state, note });
}

export function addNote(caseId: string, text: string): Promise<PatientCase> {
  return request('POST', `/cases/${enc(caseId)}/notes`, { text });
}

export function caseAudit(caseId: string): Promise<Record<string, unknown>[]> {
  return request('GET', `/cases/${enc(caseId)}/audit`);
}

// --- Interview --------------------------------------------------------------
export interface InterviewView {
  caseId: string;
  title: string;
  messages: ChatMessage[];
  open: boolean;
  patientName?: string;
}

/** The live transcript for the kiosk screen.
 *
 * Patient Mode reads this rather than `case.interview` because the interview
 * runs on the *nurse's* device: the transcript is clinical content and is
 * stripped from any case payload she receives, but the patient answering the
 * questions still has to see the conversation in front of them. */
export function getInterview(caseId: string, conversationId?: string): Promise<InterviewView> {
  const qs = conversationId ? `?conversationId=${enc(conversationId)}` : '';
  return request('GET', `/cases/${enc(caseId)}/interview${qs}`);
}

export function postInterviewMessage(
  caseId: string,
  text: string
): Promise<CaseEnvelope & { messages: ChatMessage[]; aiMessage: ChatMessage; complete: boolean }> {
  return request('POST', `/cases/${enc(caseId)}/interview/messages`, { text });
}

export function generateSummary(caseId: string): Promise<CaseEnvelope & { summary: StructuredSummary }> {
  return request('POST', `/cases/${enc(caseId)}/interview/summary`);
}

// --- Side conversations (return visits / follow-ups) -------------------------
export function createConversation(caseId: string, title?: string): Promise<CaseEnvelope & { conversation: Conversation }> {
  return request('POST', `/cases/${enc(caseId)}/conversations`, { title });
}

export function postConversationMessage(
  caseId: string,
  conversationId: string,
  text: string
): Promise<CaseEnvelope & { conversation: Conversation; aiMessage: ChatMessage }> {
  return request('POST', `/cases/${enc(caseId)}/conversations/${enc(conversationId)}/messages`, { text });
}

// --- Examination ------------------------------------------------------------
export function recommendExams(caseId: string): Promise<CaseEnvelope & { exams: ExamRecommendation[] }> {
  return request('POST', `/cases/${enc(caseId)}/exams`);
}

export function recordExamFinding(
  caseId: string,
  examId: string,
  patch: { finding?: string; flag?: Flag; note?: string; status?: string }
): Promise<CaseEnvelope & { exam: ExamRecommendation }> {
  return request('PUT', `/cases/${enc(caseId)}/exams/${enc(examId)}`, patch);
}

/** Record an examination the doctor performed that Aura didn't recommend. */
export function addCustomExam(
  caseId: string,
  payload: { name: string; finding?: string; reason?: string; flag?: Flag; note?: string }
): Promise<CaseEnvelope & { exam: ExamRecommendation }> {
  return request('POST', `/cases/${enc(caseId)}/exams/custom`, payload);
}

// --- The doctor's consultation recording ------------------------------------
/** Answer the once-only consultation-recording prompt. `hasRecording: false`
 * is a real answer — it records that the question was put and stops it coming
 * back; the case then runs on the AI interview alone. */
export function setConsultation(
  caseId: string,
  payload: { hasRecording: boolean; summary?: ConsultationSummary; jobName?: string; s3Key?: string }
): Promise<CaseEnvelope & { consultation: Consultation }> {
  return request('POST', `/cases/${enc(caseId)}/consultation`, payload);
}

// --- Diagnosis --------------------------------------------------------------
export function requestRecommendations(
  caseId: string
): Promise<CaseEnvelope & { diagnoses: Diagnosis[]; tests: TestRecommendation[] }> {
  return request('POST', `/cases/${enc(caseId)}/diagnoses`);
}

export function askDiagnosis(
  caseId: string,
  question: string,
  diagnosisId?: string
): Promise<CaseEnvelope & { aiMessage: ChatMessage }> {
  return request('POST', `/cases/${enc(caseId)}/diagnoses/ask`, { question, diagnosisId });
}

export function rerankAfterResults(caseId: string): Promise<CaseEnvelope & { diagnoses: Diagnosis[] }> {
  return request('POST', `/cases/${enc(caseId)}/diagnoses/rerank`);
}

/** Weigh the results the doctor entered against what each test was meant to
 * show. Either names a leading diagnosis (`confident`) or writes a fresh round
 * of investigations onto the workup and says so (`needs_more_tests`). With
 * nothing resulted it answers `no_results` rather than guessing. */
export function analyzeResults(
  caseId: string
): Promise<
  CaseEnvelope & {
    verdict: CaseAnalysis['verdict'];
    message: string;
    diagnoses: Diagnosis[];
    newTests: TestRecommendation[];
  }
> {
  return request('POST', `/cases/${enc(caseId)}/diagnoses/analyze`);
}

export function proposeFinalDiagnosis(caseId: string): Promise<CaseEnvelope & { finalDiagnosis: FinalDiagnosis }> {
  return request('POST', `/cases/${enc(caseId)}/final-diagnosis`);
}

/** Sign-off, not resolution: the case moves to treatment and waits there. */
export function acceptFinalDiagnosis(
  caseId: string,
  note?: string
): Promise<CaseEnvelope & { finalDiagnosis: FinalDiagnosis }> {
  return request('PUT', `/cases/${enc(caseId)}/final-diagnosis`, { note });
}

/** The patient responded to treatment — close the case. This is the only
 * thing that unlocks the feedback form. */
export function resolveCase(
  caseId: string,
  payload: { outcome?: string; note?: string } = {}
): Promise<CaseEnvelope> {
  return request('POST', `/cases/${enc(caseId)}/resolve`, payload);
}

/** Treatment didn't go as the diagnosis predicted. Withdraws the sign-off and
 * immediately re-runs the results analysis with the doctor's account of what
 * actually happened. */
export function reopenCase(
  caseId: string,
  reason: string
): Promise<
  CaseEnvelope & { verdict: CaseAnalysis['verdict']; message: string; newTests: TestRecommendation[] }
> {
  return request('POST', `/cases/${enc(caseId)}/reopen`, { reason });
}

// --- Tests ------------------------------------------------------------------
/** Stock the workup with AI-recommended investigations, without committing to
 * a differential first — the differential is results-driven and has nothing to
 * say until something comes back. */
export function recommendTests(caseId: string): Promise<CaseEnvelope & { tests: TestRecommendation[] }> {
  return request('POST', `/cases/${enc(caseId)}/tests/recommend`);
}

/** Record an investigation the doctor ordered that Aura didn't suggest. */
export function addCustomTest(
  caseId: string,
  payload: { name: string; category?: string; reason?: string; expectedFinding?: string; priority?: string }
): Promise<CaseEnvelope & { test: TestRecommendation }> {
  return request('POST', `/cases/${enc(caseId)}/tests/custom`, payload);
}

/** Move a test between states — 'ordered' means awaiting results, 'declined'
 * means the doctor chose not to run it. */
export function updateTest(
  caseId: string,
  testId: string,
  payload: { status: TestStatus; note?: string }
): Promise<CaseEnvelope & { test: TestRecommendation }> {
  return request('PUT', `/cases/${enc(caseId)}/tests/${enc(testId)}`, payload);
}

export function orderTest(caseId: string, testId: string): Promise<CaseEnvelope & { test: TestRecommendation }> {
  return request('POST', `/cases/${enc(caseId)}/tests/${enc(testId)}/order`);
}

export function recordTestResult(
  caseId: string,
  testId: string,
  payload: { result: string; resultFlag?: Flag; resultDetail?: string }
): Promise<CaseEnvelope & { test: TestRecommendation }> {
  return request('PUT', `/cases/${enc(caseId)}/tests/${enc(testId)}/result`, payload);
}

// --- Assistant + feedback ---------------------------------------------------
export function assistantChat(caseId: string, text: string): Promise<CaseEnvelope & { aiMessage: ChatMessage }> {
  return request('POST', `/cases/${enc(caseId)}/assistant`, { text });
}

export function acceptRecommendation(
  caseId: string,
  targetId: string,
  opts: { targetType?: string; reason?: string } = {}
): Promise<CaseEnvelope & { accepted: boolean }> {
  return request('POST', `/cases/${enc(caseId)}/recommendations/${enc(targetId)}/accept`, opts);
}

export function rejectRecommendation(
  caseId: string,
  targetId: string,
  opts: { targetType?: string; reason?: string } = {}
): Promise<CaseEnvelope & { accepted: boolean }> {
  return request('POST', `/cases/${enc(caseId)}/recommendations/${enc(targetId)}/reject`, opts);
}

// --- Admin panel: users + custom permission groups ---------------------------
export function adminListUsers(): Promise<AppUser[]> {
  return request('GET', '/admin/users');
}

export function adminCreateUser(payload: {
  username: string;
  email: string;
  name?: string;
  cognitoGroup: CognitoGroup;
  customGroups?: string[];
}): Promise<{ user: AppUser; temporaryPassword: string }> {
  return request('POST', '/admin/users', payload);
}

export function adminGetUser(sub: string): Promise<AppUser> {
  return request('GET', `/admin/users/${enc(sub)}`);
}

export function adminUpdateUser(
  sub: string,
  patch: {
    cognitoGroup?: CognitoGroup;
    customGroups?: string[];
    permissionOverrides?: Record<string, boolean>;
    status?: 'active' | 'disabled';
  }
): Promise<AppUser> {
  return request('PUT', `/admin/users/${enc(sub)}`, patch);
}

export function adminListGroups(): Promise<PermissionGroup[]> {
  return request('GET', '/admin/groups');
}

export function adminCreateGroup(payload: { name: string; description?: string; permissions?: string[] }): Promise<PermissionGroup> {
  return request('POST', '/admin/groups', payload);
}

export function adminUpdateGroup(
  id: string,
  patch: { name?: string; description?: string; permissions?: string[] }
): Promise<PermissionGroup> {
  return request('PUT', `/admin/groups/${enc(id)}`, patch);
}

export function adminDeleteGroup(id: string): Promise<{ deleted: boolean }> {
  return request('DELETE', `/admin/groups/${enc(id)}`);
}

export function adminListPermissions(): Promise<PermissionCatalogEntry[]> {
  return request('GET', '/admin/permissions');
}

// --- Hospital settings + the patient-interview (kiosk) lock -------------------
export interface AppSettings {
  kioskExitPasswordSet: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export function adminGetSettings(): Promise<AppSettings> {
  return request('GET', '/admin/settings');
}

export function adminSetKioskPassword(kioskExitPassword: string): Promise<AppSettings> {
  return request('PUT', '/admin/settings', { kioskExitPassword });
}

/** Whether an exit password exists at all, so the nurse can be warned before
 * she hands the device over. Reveals only the boolean. */
export function kioskStatus(): Promise<{ kioskExitPasswordSet: boolean }> {
  return request('GET', '/kiosk');
}

/** Verifies the exit password server-side. A check done in the browser would
 * be readable in the shipped bundle, so this is the only way out of kiosk mode. */
export function kioskExit(password: string): Promise<{ ok: true }> {
  return request('POST', '/kiosk/exit', { password });
}

// --- Documents, audio + transcription ----------------------------------------
export function uploadCaseDocument(
  caseId: string,
  payload: { fileBase64: string; fileName?: string; fileExtension?: string; contentType?: string }
): Promise<CaseEnvelope & { document: CaseDocument }> {
  return request('POST', `/cases/${enc(caseId)}/documents`, payload);
}

export function listCaseDocuments(caseId: string): Promise<{ documents: CaseDocument[] }> {
  return request('GET', `/cases/${enc(caseId)}/documents`);
}

/** Returns a presigned URL valid for a few minutes — used for both download
 * and the inline preview. */
export function getCaseDocument(
  caseId: string,
  documentId: string
): Promise<{ document: CaseDocument; url: string; expiresIn: number }> {
  return request('GET', `/cases/${enc(caseId)}/documents/${enc(documentId)}`);
}

export function deleteCaseDocument(caseId: string, documentId: string): Promise<CaseEnvelope> {
  return request('DELETE', `/cases/${enc(caseId)}/documents/${enc(documentId)}`);
}

export function uploadCaseAudio(
  caseId: string,
  payload: { fileBase64: string; fileExtension?: string; contentType?: string }
): Promise<CaseEnvelope & { s3Key: string; bucket: string }> {
  return request('POST', `/cases/${enc(caseId)}/audio`, payload);
}

export function startTranscription(
  caseId: string,
  payload: { s3Key?: string; audioS3Uri?: string }
): Promise<{ jobName: string; status: string }> {
  return request('POST', `/cases/${enc(caseId)}/transcribe`, payload);
}

export interface TranscriptionStatus {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  summary?: {
    chief_complaint: string | null;
    history_of_present_illness: string | null;
    review_of_systems: string | null;
    past_medical_history: string | null;
  };
  reason?: string;
}

export function transcriptionStatus(caseId: string, jobName: string): Promise<TranscriptionStatus> {
  return request('GET', `/cases/${enc(caseId)}/transcribe/${enc(jobName)}`);
}

// --- Doctor feedback ----------------------------------------------------------
export function submitFeedback(
  caseId: string,
  feedback: string,
  category?: string
): Promise<{ status: string; data: unknown }> {
  return request('POST', `/cases/${enc(caseId)}/feedback`, { feedback, category });
}

// --- Shared reference-document library (AI grounding evidence) ---------------
export function listResources(): Promise<KnowledgeResource[]> {
  return request('GET', '/resources');
}

export function uploadResource(payload: {
  title: string;
  tags: string[];
  fileBase64: string;
  fileExtension?: string;
  contentType?: string;
}): Promise<KnowledgeResource> {
  return request('POST', '/resources', payload);
}

export function deleteResource(id: string): Promise<{ deleted: boolean }> {
  return request('DELETE', `/resources/${enc(id)}`);
}
