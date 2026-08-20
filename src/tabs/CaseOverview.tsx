import { useLocation } from 'wouter';
import { ArrowRight, ShieldAlert } from 'lucide-react';

import type { PatientCase } from '@/types';
import { Button } from '@/components/ui/button';
import { TagList } from '@/components/common';
import { CaseTrail } from '@/components/CaseTrail';
import { cn } from '@/lib/utils';

/**
 * The case at a glance: who the patient is, and where the case has got to.
 *
 * This page has been cut twice. It once carried three stat cards, an insights
 * grid, two summary blocks and a right rail with a progress tracker, a
 * next-steps list, a recent-updates feed, audio transcription, document upload
 * and a feedback form. The first pass moved the tools to the tabs they belong
 * to. This pass finished the job: the AI's clinical summary lives on the
 * Interview tab, where the interview it summarises is, and Overview is now the
 * two things you open a case to check — the patient's numbers, and what the
 * case is waiting on.
 *
 * Both are tables rather than cards. A column of cards down the middle of a
 * wide screen is what made this page feel like a scroll; a table puts eleven
 * facts in the space one card used and lets the eye go straight to the row it
 * wants.
 */

/** One labelled cell of the patient/vitals table. */
function Cell({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value?: string | number | null;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-r px-4 py-2.5 last:border-r-0', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate text-sm font-semibold tabular-nums', tone)}>
        {value === undefined || value === null || value === '' ? '—' : value}
      </p>
    </div>
  );
}

function PatientTable({ caseData: c }: { caseData: PatientCase }) {
  const v = c.vitals;
  const p = c.patient;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Patient &amp; vitals</h2>
        <p className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
          {c.chiefComplaint}
        </p>
      </div>

      {/* Two rows of one table: identity above, the numbers below. Vitals are
          tinted so an eye scanning for them doesn't have to read the labels. */}
      <div className="grid grid-cols-2 border-b sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="Name" value={p.name} className="col-span-2 sm:col-span-1" />
        <Cell label="Age" value={p.age ? `${p.age} y` : undefined} />
        <Cell label="Sex" value={p.gender} />
        <Cell label="Height" value={p.height} />
        <Cell label="Weight" value={p.weight} />
        <Cell label="Blood type" value={p.bloodType} className="border-b-0" />
      </div>

      <div className="grid grid-cols-2 bg-muted/20 sm:grid-cols-3 lg:grid-cols-6">
        <Cell label="BP" value={v.bp} tone="text-rose-600 dark:text-rose-400" className="border-b-0" />
        <Cell label="HR" value={v.hr} tone="text-primary" className="border-b-0" />
        <Cell label="RR" value={v.rr} tone="text-teal-600 dark:text-teal-400" className="border-b-0" />
        <Cell label="SpO₂" value={v.spo2} tone="text-violet-600 dark:text-violet-400" className="border-b-0" />
        <Cell label="Temp" value={v.temp} tone="text-amber-600 dark:text-amber-400" className="border-b-0" />
        <Cell label="BMI" value={p.bmi} className="border-b-0" />
      </div>
    </div>
  );
}

/** Where the case wants to go next, given where it is. */
function nextStep(stage: string): { tab: string; label: string } {
  switch (stage) {
    case 'intake':
    case 'interview':
      return { tab: 'interview', label: 'Review the interview' };
    case 'examination':
      return { tab: 'workup', label: 'Start the workup' };
    case 'differential':
      return { tab: 'diagnosis', label: 'Review the differential' };
    case 'tests':
    case 'results':
      return { tab: 'workup', label: 'Continue the workup' };
    case 'diagnosis':
    case 'treatment':
      return { tab: 'diagnosis', label: 'Finalise the diagnosis' };
    default:
      return { tab: 'timeline', label: 'View the timeline' };
  }
}

export function CaseOverview({
  caseData: c,
  isClinician,
}: {
  caseData: PatientCase;
  isClinician: boolean;
}) {
  const [, navigate] = useLocation();
  const next = nextStep(c.stage);
  const redFlags = c.summary?.redFlags ?? [];

  return (
    <div className="space-y-4 pb-8">
      <PatientTable caseData={c} />

      {/* The one piece of clinical content that stays: a red flag is a safety
          signal, and burying it a tab away would be the wrong kind of tidy. */}
      {isClinician && redFlags.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 dark:border-rose-500/25 dark:bg-rose-500/10">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
            <ShieldAlert className="h-3.5 w-3.5" /> Red flags
          </p>
          <div className="mt-2">
            <TagList items={redFlags} tone="red" />
          </div>
        </div>
      )}

      {isClinician ? (
        <>
          <CaseTrail caseData={c} />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-card px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Next step</p>
              <p className="text-sm font-semibold">{next.label}</p>
            </div>
            <Button size="sm" onClick={() => navigate(`/cases/${c.id}/${next.tab}`)}>
              {next.label} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </>
      ) : (
        // A nurse's payload has no clinical content in it, so there is nothing
        // to report here — only whether her part of the job is done.
        <div className="rounded-xl border bg-card px-4 py-3">
          <h2 className="text-sm font-semibold">Interview status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.status === 'AI Interview'
              ? 'The patient has not finished their interview yet.'
              : 'The interview is complete.'}{' '}
            {c.assignedPhysicianId
              ? 'This case has been assigned to a doctor.'
              : 'It is still waiting to be assigned to a doctor.'}{' '}
            The clinical record is only visible to the assigned doctor.
          </p>
        </div>
      )}
    </div>
  );
}
