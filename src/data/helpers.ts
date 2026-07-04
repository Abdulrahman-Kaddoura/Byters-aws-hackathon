import type { ProgressStep, StageKey, CaseStatus, Priority, Flag, Importance } from '../types';

export const STAGE_ORDER: { key: StageKey; label: string }[] = [
  { key: 'intake', label: 'Patient Intake' },
  { key: 'interview', label: 'AI Interview' },
  { key: 'examination', label: 'Physical Examination' },
  { key: 'differential', label: 'Differential Diagnosis' },
  { key: 'tests', label: 'Tests Ordered' },
  { key: 'results', label: 'Results Review' },
  { key: 'diagnosis', label: 'Final Diagnosis' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'completion', label: 'Completion' },
];

export function buildProgress(current: StageKey, completed = false): ProgressStep[] {
  const idx = STAGE_ORDER.findIndex((s) => s.key === current);
  return STAGE_ORDER.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: completed
      ? 'done'
      : i < idx
        ? 'done'
        : i === idx
          ? 'active'
          : 'pending',
  }));
}

export const STATUS_META: Record<
  CaseStatus,
  { label: string; tone: 'brand' | 'teal' | 'amber' | 'green' | 'gray' | 'red' | 'purple' }
> = {
  New: { label: 'New', tone: 'brand' },
  'AI Interview': { label: 'AI Interview', tone: 'purple' },
  'Doctor Review': { label: 'Doctor Review', tone: 'brand' },
  'Awaiting Examination': { label: 'Awaiting Exam', tone: 'amber' },
  'Awaiting Tests': { label: 'Awaiting Tests', tone: 'amber' },
  'Diagnosis in Progress': { label: 'Diagnosis in Progress', tone: 'teal' },
  Treatment: { label: 'Treatment', tone: 'teal' },
  'Follow-up': { label: 'Follow-up', tone: 'brand' },
  Completed: { label: 'Completed', tone: 'green' },
  Archived: { label: 'Archived', tone: 'gray' },
};

export const PRIORITY_META: Record<Priority, { tone: 'red' | 'amber' | 'green'; label: string }> = {
  High: { tone: 'red', label: 'High priority' },
  Medium: { tone: 'amber', label: 'Medium priority' },
  Low: { tone: 'green', label: 'Low priority' },
};

export const IMPORTANCE_META: Record<Importance, { tone: 'red' | 'amber' | 'gray' }> = {
  Critical: { tone: 'red' },
  Important: { tone: 'amber' },
  Routine: { tone: 'gray' },
};

export const FLAG_META: Record<Flag, { tone: 'green' | 'amber' | 'red'; label: string }> = {
  normal: { tone: 'green', label: 'Normal' },
  abnormal: { tone: 'amber', label: 'Abnormal' },
  critical: { tone: 'red', label: 'Critical' },
};

export function confidenceTone(v: number): 'green' | 'teal' | 'amber' | 'red' {
  if (v >= 75) return 'green';
  if (v >= 55) return 'teal';
  if (v >= 35) return 'amber';
  return 'red';
}
