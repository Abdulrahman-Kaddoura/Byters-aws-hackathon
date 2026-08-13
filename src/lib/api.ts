import { config } from './config';
import { getIdToken, signOut } from './auth';
import type {
  AppUser,
  ChatMessage,
  CognitoGroup,
  Conversation,
  Diagnosis,
  ExamRecommendation,
  Flag,
  FinalDiagnosis,
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

// --- Cases ------------------------------------------------------------------
export function listCases(opts: { status?: string; mine?: boolean } = {}): Promise<PatientCase[]> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.mine) qs.set('mine', 'true');
  const query = qs.toString();
  return request('GET', `/cases${query ? `?${query}` : ''}`);
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
export function postInterviewMessage(
  caseId: string,
  text: string
): Promise<CaseEnvelope & { aiMessage: ChatMessage; complete: boolean }> {
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

// --- Documents, audio + transcription ----------------------------------------
export function uploadCaseDocument(
  caseId: string,
  payload: { fileBase64: string; fileExtension?: string; contentType?: string }
): Promise<CaseEnvelope & { documentS3Uri: string }> {
  return request('POST', `/cases/${enc(caseId)}/documents`, payload);
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
