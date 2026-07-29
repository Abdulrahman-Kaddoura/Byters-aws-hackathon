import { useLocation } from 'wouter';
import { Activity, Heart, Wind, Droplets, Thermometer, Sparkles, ListChecks, ClipboardList, AlertTriangle, Pill, ShieldAlert, HeartPulse, Clock, ArrowRight, CircleDot } from 'lucide-react';
import type { PatientCase, Vitals } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeading, TagList } from '@/components/common';
import { ProgressTracker } from '@/components/ProgressTracker';
import { InsightCard } from '@/components/InsightCard';
import { STAGE_ORDER } from '@/data/helpers';
import { cn } from '@/lib/utils';

function VitalChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: string; tone: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
      <span className={cn('shrink-0', tone)}>{icon}</span>
      <div className="leading-none">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function VitalsRow({ vitals }: { vitals: Vitals }) {
  const hasAny = vitals.bp || vitals.hr || vitals.rr || vitals.spo2 || vitals.temp;
  if (!hasAny) return <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>;
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

function SummaryBlock({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: 'brand' | 'teal' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </p>
      <TagList items={items} tone={tone} />
    </div>
  );
}

export function CaseOverview({ caseData: c, isClinician }: { caseData: PatientCase; isClinician: boolean }) {
  const [, navigate] = useLocation();
  const s = c.summary;
  const currentStage = STAGE_ORDER.find((st) => st.key === c.stage)?.label ?? 'In progress';
  const lead = c.diagnoses.length ? [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0] : undefined;

  const nextStepTab = (() => {
    switch (c.stage) {
      case 'intake':
      case 'interview':
        return 'interview';
      case 'examination':
        return isClinician ? 'examination' : 'overview';
      case 'differential':
        return isClinician ? 'differential' : 'overview';
      case 'tests':
      case 'results':
        return isClinician ? 'tests' : 'overview';
      case 'diagnosis':
        return isClinician ? 'diagnosis' : 'overview';
      default:
        return 'timeline';
    }
  })();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CircleDot className="h-3.5 w-3.5" /> Current stage
            </p>
            <p className="mt-1.5 text-lg font-bold">{currentStage}</p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Leading Dx
            </p>
            <p className="mt-1.5 truncate text-lg font-bold">{lead?.name ?? '—'}</p>
            {lead && <p className="text-xs font-semibold text-primary">{lead.confidence}% confidence</p>}
          </Card>
          <Card className="col-span-2 p-4 sm:col-span-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Priority
            </p>
            <p className="mt-1.5 text-lg font-bold">{c.priority}</p>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5">
            <SectionHeading icon={<HeartPulse className="h-[18px] w-[18px]" />} title="Vitals" />
            <div className="mt-4">
              <VitalsRow vitals={c.vitals} />
            </div>
          </CardContent>
        </Card>

        {c.insights.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <SectionHeading icon={<Sparkles className="h-[18px] w-[18px]" />} title="Aura insights" subtitle="Proactive observations on this case" />
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {c.insights.map((ins, i) => (
                  <InsightCard key={i} insight={ins} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5">
            <SectionHeading
              icon={<ClipboardList className="h-[18px] w-[18px]" />}
              title="Conversation summary"
              subtitle="Auto-generated from the AI patient interview"
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${c.id}/interview`)}>
                  Full summary <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              }
            />
            {s ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chief complaint</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.chiefComplaint}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">History of present illness</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.hpi}</p>
                </div>
                {s.redFlags.length > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/25 dark:bg-rose-500/8">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                      <ShieldAlert className="h-3.5 w-3.5" /> Red flags
                    </p>
                    <div className="mt-2">
                      <TagList items={s.redFlags} tone="red" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No structured summary yet — complete the AI interview to generate one.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeading icon={<HeartPulse className="h-[18px] w-[18px]" />} title="Patient summary" subtitle="Relevant background & risk profile" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SummaryBlock icon={<ClipboardList className="h-4 w-4" />} title="Relevant history" items={s?.relevantHistory ?? c.history.previousIllnesses} tone="brand" />
              <SummaryBlock icon={<Pill className="h-4 w-4" />} title="Current medications" items={s?.medications ?? c.history.medications} tone="teal" />
              <SummaryBlock icon={<AlertTriangle className="h-4 w-4" />} title="Risk factors" items={s?.riskFactors ?? []} tone="amber" />
              <SummaryBlock icon={<ShieldAlert className="h-4 w-4" />} title="Allergies" items={c.history.allergies} tone="red" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="relative overflow-hidden border-primary/40 shadow-md">
          <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Suggested next step</p>
            <Button className="mt-3 w-full justify-between" onClick={() => navigate(`/cases/${c.id}/${nextStepTab}`)}>
              Go to {nextStepTab} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <ProgressTracker steps={c.progress} />
          </CardContent>
        </Card>

        {c.nextSteps.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <SectionHeading icon={<ListChecks className="h-[18px] w-[18px]" />} title="Suggested next steps" />
              <ul className="mt-4 space-y-2.5">
                {c.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                    <span className="text-[13px] leading-snug">{step}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {c.recentUpdates.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <SectionHeading title="Recent updates" />
              <ul className="mt-4 space-y-3">
                {c.recentUpdates.map((u, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <div>
                      <p className="text-[13px] leading-snug">{u.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{u.time}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
