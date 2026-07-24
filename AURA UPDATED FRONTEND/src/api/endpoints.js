import { request } from "./client.js";

// Every function below normalizes to { case, ...extra } so call sites are uniform,
// even for endpoints that return a bare PatientCase.

export async function listCases({ status, mine } = {}) {
  const cases = await request("cases", { query: { status, mine } });
  return { cases };
}

export async function submitIntake(payload) {
  const c = await request("cases", { method: "POST", body: payload });
  return { case: c };
}

export async function getCase(caseId) {
  const c = await request(`cases/${caseId}`);
  return { case: c };
}

export async function setCaseState(caseId, body) {
  const c = await request(`cases/${caseId}`, { method: "PUT", body });
  return { case: c };
}

export async function getAudit(caseId) {
  const entries = await request(`cases/${caseId}/audit`);
  return { entries };
}

export async function addNote(caseId, text) {
  const c = await request(`cases/${caseId}/notes`, { method: "POST", body: { text } });
  return { case: c };
}

export async function postInterviewMessage(caseId, text) {
  return request(`cases/${caseId}/interview/messages`, { method: "POST", body: { text } });
}

export async function generateSummary(caseId) {
  return request(`cases/${caseId}/interview/summary`, { method: "POST" });
}

export async function recommendExams(caseId) {
  return request(`cases/${caseId}/exams`, { method: "POST" });
}

export async function recordExamFinding(caseId, examId, body) {
  return request(`cases/${caseId}/exams/${examId}`, { method: "PUT", body });
}

export async function requestRecommendations(caseId) {
  return request(`cases/${caseId}/diagnoses`, { method: "POST" });
}

export async function askDiagnosis(caseId, body) {
  return request(`cases/${caseId}/diagnoses/ask`, { method: "POST", body });
}

export async function rerankAfterResults(caseId) {
  return request(`cases/${caseId}/diagnoses/rerank`, { method: "POST" });
}

export async function proposeFinalDiagnosis(caseId) {
  return request(`cases/${caseId}/final-diagnosis`, { method: "POST" });
}

export async function acceptFinalDiagnosis(caseId, body) {
  return request(`cases/${caseId}/final-diagnosis`, { method: "PUT", body });
}

export async function orderTest(caseId, testId) {
  return request(`cases/${caseId}/tests/${testId}/order`, { method: "POST" });
}

export async function recordTestResult(caseId, testId, body) {
  return request(`cases/${caseId}/tests/${testId}/result`, { method: "PUT", body });
}

export async function assistantChat(caseId, text) {
  return request(`cases/${caseId}/assistant`, { method: "POST", body: { text } });
}

export async function acceptRecommendation(caseId, targetId, body) {
  return request(`cases/${caseId}/recommendations/${targetId}/accept`, { method: "POST", body });
}

export async function rejectRecommendation(caseId, targetId, body) {
  return request(`cases/${caseId}/recommendations/${targetId}/reject`, { method: "POST", body });
}
