import { useLocation } from 'wouter';
import {
  Activity,
  ArrowRight,
  ClipboardList,
  Droplets,
  Heart,
  HeartPulse,
  Pill,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wind,
} from 'lucide-react';

import type { PatientCase, Vitals } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeading, TagList } from '@/components/common';
import { ProgressTracker } from '@/components/ProgressTracker';
import { cn } from '@/lib/utils';

/**
 * The case at a glance: who the patient is, what the AI heard, and the one
 * thing to do next.
 *
 * This page used to carry three stat cards, an insights grid, two summary
 * blocks and a right rail holding a progress tracker, a next-steps list, a
 * recent-updates feed, audio transcription, document upload and a feedback
 * form — ten or so cards competing for the same glance. The tools moved to the
 * tabs they belong to (uploads to Documents, transcription and feedback to
 * Interview), and what's left is the summary a doctor actually opens a case to
 * read.
 */
function VitalChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  tone: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
      <span className={cn('shrink-0', tone)}>{icon}</span>
      <div className="leading-none">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function VitalsRow({ vitals }: { vitals: Vitals }) {
  const hasAny = vitals.bp || vitals.hr || vitals.rr || vitals.spo2 || vitals.temp;
  if (!hasAny) return <p className="text-sm text-muted-foreground">No vitals recorded.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      <VitalChip icon={<Activity className="h-4 w-4" />} label="BP" value={vitals.bp} tone="text-rose-500" />
      <VitalChip icon={<Heart className="h-4 w-4" />} label="HR" value={vitals.hr} tone="text-primary" />
      <VitalChip icon={<Wind className="h-4 w-4" />} label="RR" value={vitals.rr} tone="text-teal-500" />
      <VitalChip icon={<Droplets className="h-4 w-4" />} label="SpO₂" value={vitals.spo2} tone="text-violet-500" />
      <VitalChip icon={<Thermometer className="h-4 w-4" />} label="Temp" value={vitals.temp} tone="text-amber-500" />
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
  const s = c.summary;
  const next = nextStep(c.stage);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <Card>
        <CardContent className="p-5">
          <SectionHeading icon={<HeartPulse className="h-[18px] w-[18px]" />} title="Vitals" />
          <div className="mt-4">
            <VitalsRow vitals={c.vitals} />
          </div>
        </CardContent>
      </Card>

      {isClinician ? (
        <>
          <Card>
            <CardContent className="p-5">
              <SectionHeading
                icon={<ClipboardList className="h-[18px] w-[18px]" />}
                title="What the patient told SEHATI"
                subtitle="Summarised from the AI interview"
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${c.id}/interview`)}>
                    Full transcript <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              {s ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Chief complaint
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.chiefComplaint}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      History of present illness
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.hpi}</p>
                  </div>
                  {s.redFlags.length > 0 && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/25 dark:bg-rose-500/10">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                        <ShieldAlert className="h-3.5 w-3.5" /> Red flags
                      </p>
                      <div className="mt-2">
                        <TagList items={s.redFlags} tone="red" />
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    <div className="rounded-lg border bg-muted/30 p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <ClipboardList className="h-4 w-4" /> Relevant history
                      </p>
                      <TagList items={s.relevantHistory ?? c.history.previousIllnesses} tone="brand" />
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3.5">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Pill className="h-4 w-4" /> Medications
                      </p>
                      <TagList items={s.medications ?? c.history.medications} tone="teal" />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No summary yet — it's generated when the patient finishes the AI interview.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/40">
            <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-xs text-muted-foreground">Next step</p>
                <p className="text-[15px] font-semibold">{next.label}</p>
              </div>
              <Button onClick={() => navigate(`/cases/${c.id}/${next.tab}`)}>
                {next.label} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        // A nurse's payload has no clinical content in it, so there is nothing
        // to summarise here — only whether her part of the job is done.
        <Card>
          <CardContent className="p-5">
            <SectionHeading
              icon={<Sparkles className="h-[18px] w-[18px]" />}
              title="Interview status"
              subtitle="The clinical record for this case is only visible to the assigned doctor."
            />
            <p className="mt-4 text-sm text-muted-foreground">
              {c.status === 'AI Interview'
                ? 'The patient has not finished their interview yet.'
                : 'The interview is complete.'}{' '}
              {c.assignedPhysicianId
                ? 'This case has been assigned to a doctor.'
                : 'It is still waiting to be assigned to a doctor.'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <ProgressTracker steps={c.progress} />
        </CardContent>
      </Card>
    </div>
  );
}
