import { CaseExamination } from '@/tabs/CaseExamination';
import { CaseTests } from '@/tabs/CaseTests';
import type { PatientCase } from '@/types';

/**
 * Examination and tests, merged.
 *
 * They were separate tabs, but they are one activity: you examine the patient,
 * that tells you what to order, the results come back and inform the next
 * exam. Splitting them made the doctor bounce between two tabs to follow a
 * single thread.
 */
export function CaseWorkup({ caseData }: { caseData: PatientCase }) {
  return (
    <div className="space-y-10 pb-8">
      <CaseExamination caseData={caseData} />
      <div className="border-t pt-8">
        <CaseTests caseData={caseData} />
      </div>
    </div>
  );
}
