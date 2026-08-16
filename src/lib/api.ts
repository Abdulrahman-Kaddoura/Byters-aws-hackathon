import { config } from './config';
import { getIdToken, signOut } from './auth';
import type {
  AppUser,
  CaseDocument,
  ChatMessage,
  CognitoGroup,
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) signOut();
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

export function proposeFinalDiagnosis(caseId: string): Promise<CaseEnvelope & { finalDiagnosis: FinalDiagnosis }> {
  return request('POST', `/cases/${enc(caseId)}/final-diagnosis`);
}

export function acceptFinalDiagnosis(
  caseId: string,
  note?: string
): Promise<CaseEnvelope & { finalDiagnosis: FinalDiagnosis }> {
  return request('PUT', `/cases/${enc(caseId)}/final-diagnosis`, { note });
}

// --- Tests ------------------------------------------------------------------
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
