import { Link } from 'react-router-dom';
import {
  Sparkles,
  ListChecks,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  Pill,
  ShieldAlert,
  HeartPulse,
  Clock,
  CircleDot,
} from 'lucide-react';
import { useCaseData } from './CaseLayout';
import { SectionHeading } from '../../components/ui';
import { ProgressTracker } from '../../components/ProgressTracker';
import { InsightCard } from '../../components/InsightCard';
import { TagList } from '../../components/ui';
import { STAGE_ORDER } from '../../data/helpers';

export function Overview() {
  const c = useCaseData();
  const s = c.summary;
  const currentStage = STAGE_ORDER.find((st) => st.key === c.stage)?.label ?? 'In progress';
  const lead = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];

  return (
    <div className="space-y-6">
      {/* Quick facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><CircleDot className="h-3.5 w-3.5" /> Current stage</p>
          <p className="mt-1.5 text-lg font-bold">{currentStage}</p>
        </div>
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Sparkles className="h-3.5 w-3.5" /> Leading Dx</p>
          <p className="mt-1.5 truncate text-lg font-bold">{lead?.name ?? '—'}</p>
          {lead && <p className="text-xs font-semibold text-brand-600 dark:text-brand-300">{lead.confidence}% confidence</p>}
        </div>
        <div className="card col-span-2 p-4 sm:col-span-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Clock className="h-3.5 w-3.5" /> Last updated</p>
          <p className="mt-1.5 text-lg font-bold">{c.updatedAt}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* AI insights */}
          <div className="card p-5">
            <SectionHeading icon={<Sparkles className="h-[18px] w-[18px]" />} title="AI insights" subtitle="Aura's proactive observations on this case" />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {c.insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          </div>

          {/* Conversation / structured summary highlights */}
          <div className="card p-5">
            <SectionHeading
              icon={<ClipboardList className="h-[18px] w-[18px]" />}
              title="Conversation summary"
              subtitle="Auto-generated from the AI patient interview"
              action={
                <Link to="interview" className="btn btn-ghost text-xs">
                  Full summary <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chief complaint</p>
                <p className="mt-1 text-sm text-secondary">{s.chiefComplaint}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">History of present illness</p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">{s.hpi}</p>
              </div>
              {s.redFlags.length > 0 && (
                <div className="rounded-lg border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-500/25 dark:bg-rose-500/8">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                    <ShieldAlert className="h-3.5 w-3.5" /> Red flags
                  </p>
                  <div className="mt-2">
                    <TagList items={s.redFlags} tone="red" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Patient summary */}
          <div className="card p-5">
            <SectionHeading icon={<HeartPulse className="h-[18px] w-[18px]" />} title="Patient summary" subtitle="Relevant background & risk profile" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SummaryBlock icon={<ClipboardList className="h-4 w-4" />} title="Relevant history" items={s.relevantHistory} tone="brand" />
              <SummaryBlock icon={<Pill className="h-4 w-4" />} title="Current medications" items={s.medications} tone="teal" />
              <SummaryBlock icon={<AlertTriangle className="h-4 w-4" />} title="Risk factors" items={s.riskFactors} tone="amber" />
              <SummaryBlock icon={<ShieldAlert className="h-4 w-4" />} title="Allergies" items={c.history.allergies} tone="red" />
            </div>
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <div className="card p-5">
            <ProgressTracker steps={c.progress} />
          </div>

          <div className="card p-5">
            <SectionHeading icon={<ListChecks className="h-[18px] w-[18px]" />} title="Suggested next steps" />
            <ul className="mt-4 space-y-2.5">
              {c.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-50 text-[11px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    {i + 1}
                  </span>
                  <span className="text-[13px] leading-snug">{step}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <SectionHeading title="Recent updates" />
            <ul className="mt-4 space-y-3">
              {c.recentUpdates.map((u, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div>
                    <p className="text-[13px] leading-snug">{u.text}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{u.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: 'brand' | 'teal' | 'amber' | 'red';
}) {
  return (
    <div className="rounded-lg border bg-[var(--surface-2)] p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {icon} {title}
      </p>
      <TagList items={items} tone={tone} />
    </div>
  );
}
