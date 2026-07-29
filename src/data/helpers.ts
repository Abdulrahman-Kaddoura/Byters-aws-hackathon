import type { StageKey, CaseStatus, Priority, Flag, Importance } from '../types';
import type { Tone } from '../lib/utils';

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

export const STATUS_META: Record<CaseStatus, { label: string; tone: Tone }> = {
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

export const PRIORITY_META: Record<Priority, { tone: Tone; label: string }> = {
  High: { tone: 'red', label: 'High priority' },
  Medium: { tone: 'amber', label: 'Medium priority' },
  Low: { tone: 'green', label: 'Low priority' },
};

export const IMPORTANCE_META: Record<Importance, { tone: Tone }> = {
  Critical: { tone: 'red' },
  Important: { tone: 'amber' },
  Routine: { tone: 'gray' },
};

export const FLAG_META: Record<Flag, { tone: Tone; label: string }> = {
  normal: { tone: 'green', label: 'Normal' },
  abnormal: { tone: 'amber', label: 'Abnormal' },
  critical: { tone: 'red', label: 'Critical' },
};

/** Maps our semantic Tone to a shadcn Badge `variant`. */
export function toneVariant(tone: Tone): 'brand' | 'teal' | 'success' | 'warning' | 'critical' | 'purple' | 'secondary' {
  switch (tone) {
    case 'brand':
      return 'brand';
    case 'teal':
      return 'teal';
    case 'green':
      return 'success';
    case 'amber':
      return 'warning';
    case 'red':
      return 'critical';
    case 'purple':
      return 'purple';
    default:
      return 'secondary';
  }
}
