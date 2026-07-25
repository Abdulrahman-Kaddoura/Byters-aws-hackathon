import { config } from './config';
import { getIdToken, signOut } from './auth';
import type { ChatMessage, Diagnosis, ExamRecommendation, Flag, FinalDiagnosis, PatientCase, StructuredSummary, TestRecommendation } from '../types';

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
      Authorization: token,
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

export function uploadCaseDocument(
  caseId: string,
  payload: { fileBase64: string; fileExtension: string; contentType: string }
): Promise<CaseEnvelope & { documentS3Uri: string }> {
  return request('POST', `/cases/${enc(caseId)}/documents`, payload);
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
