import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { Flag, PatientCase } from '../types';

const casesKey = (opts: { status?: string; mine?: boolean } = {}) => ['cases', opts] as const;
const caseKey = (id: string) => ['case', id] as const;
const auditKey = (id: string) => ['case-audit', id] as const;

function applyCase(qc: ReturnType<typeof useQueryClient>, updated: PatientCase) {
  qc.setQueryData(caseKey(updated.id), updated);
  qc.invalidateQueries({ queryKey: ['cases'] });
}

// --- Reads --------------------------------------------------------------
export function useCaseList(opts: { status?: string; mine?: boolean } = {}) {
  return useQuery({
    queryKey: casesKey(opts),
    queryFn: () => api.listCases(opts),
  });
}

export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: caseKey(id ?? ''),
    queryFn: () => api.getCase(id!),
    enabled: !!id,
  });
}

export function useCaseAudit(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: auditKey(id ?? ''),
    queryFn: () => api.caseAudit(id!),
    enabled: !!id && enabled,
  });
}

// --- Mutations ------------------------------------------------------------
export function useSubmitIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => api.submitIntake(payload),
    onSuccess: (created) => {
      qc.setQueryData(caseKey(created.id), created);
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

export function useSetCaseState(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { state: string; note?: string }) => api.setCaseState(caseId, vars.state, vars.note),
    onSuccess: (updated) => applyCase(qc, updated),
  });
}

export function useAddNote(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.addNote(caseId, text),
    onSuccess: (updated) => applyCase(qc, updated),
  });
}

export function usePostInterviewMessage(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.postInterviewMessage(caseId, text),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useGenerateSummary(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.generateSummary(caseId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRecommendExams(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.recommendExams(caseId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRecordExamFinding(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { examId: string; patch: { finding?: string; flag?: Flag; note?: string; status?: string } }) =>
      api.recordExamFinding(caseId, vars.examId, vars.patch),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRequestRecommendations(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestRecommendations(caseId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useAskDiagnosis(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { question: string; diagnosisId?: string }) => api.askDiagnosis(caseId, vars.question, vars.diagnosisId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRerankAfterResults(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.rerankAfterResults(caseId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useProposeFinalDiagnosis(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.proposeFinalDiagnosis(caseId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useAcceptFinalDiagnosis(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) => api.acceptFinalDiagnosis(caseId, note),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useOrderTest(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => api.orderTest(caseId, testId),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRecordTestResult(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { testId: string; payload: { result: string; resultFlag?: Flag; resultDetail?: string } }) =>
      api.recordTestResult(caseId, vars.testId, vars.payload),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useAssistantChat(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.assistantChat(caseId, text),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useAcceptRecommendation(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { targetId: string; targetType?: string; reason?: string }) =>
      api.acceptRecommendation(caseId, vars.targetId, { targetType: vars.targetType, reason: vars.reason }),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}

export function useRejectRecommendation(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { targetId: string; targetType?: string; reason: string }) =>
      api.rejectRecommendation(caseId, vars.targetId, { targetType: vars.targetType, reason: vars.reason }),
    onSuccess: (res) => applyCase(qc, res.case),
  });
}
