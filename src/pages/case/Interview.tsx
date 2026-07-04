import { useState } from 'react';
import {
  FileText,
  MessagesSquare,
  Stethoscope,
  Pill,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Search,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import { useCaseData } from './CaseLayout';
import { Transcript } from '../../components/Chat';
import { TagList } from '../../components/ui';
import { cn } from '../../lib/ui';

export function Interview() {
  const c = useCaseData();
  const s = c.summary;
  const [view, setView] = useState<'summary' | 'transcript'>('summary');

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          <button
            onClick={() => setView('summary')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'summary' ? 'bg-brand-500 text-white' : 'text-secondary hover:text-[var(--text)]'
            )}
          >
            <FileText className="h-4 w-4" /> Structured summary
          </button>
          <button
            onClick={() => setView('transcript')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'transcript' ? 'bg-brand-500 text-white' : 'text-secondary hover:text-[var(--text)]'
            )}
          >
            <MessagesSquare className="h-4 w-4" /> Interview transcript
          </button>
        </div>
        <span className="hidden text-xs text-muted sm:block">{c.interview.length} messages · auto-summarized</span>
      </div>

      {view === 'summary' ? (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-brand-200/70 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-500/8">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
            <p className="text-[13px] text-secondary">
              Aura conducted an adaptive interview and distilled it into the structured summary below — so you can
              assess the case at a glance without reading the raw conversation.
            </p>
          </div>

          {/* Chief complaint + HPI */}
          <div className="card p-5">
            <Label icon={<Stethoscope className="h-4 w-4" />}>Chief complaint</Label>
            <p className="mt-2 text-sm font-medium">{s.chiefComplaint}</p>
            <div className="my-4 divider" />
            <Label icon={<ClipboardList className="h-4 w-4" />}>History of present illness</Label>
            <p className="mt-2 text-sm leading-relaxed text-secondary">{s.hpi}</p>
          </div>

          {/* Grid of sections */}
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard icon={<Activity className="h-4 w-4" />} title="Symptoms">
              <TagList items={s.symptoms} tone="brand" />
            </SectionCard>
            <SectionCard icon={<ShieldAlert className="h-4 w-4" />} title="Red flags">
              <TagList items={s.redFlags} tone="red" />
            </SectionCard>
            <SectionCard icon={<ClipboardList className="h-4 w-4" />} title="Relevant medical history">
              <TagList items={s.relevantHistory} tone="gray" />
            </SectionCard>
            <SectionCard icon={<Pill className="h-4 w-4" />} title="Current medications">
              <TagList items={s.medications} tone="teal" />
            </SectionCard>
            <SectionCard icon={<AlertTriangle className="h-4 w-4" />} title="Risk factors">
              <TagList items={s.riskFactors} tone="amber" />
            </SectionCard>
            <SectionCard icon={<Search className="h-4 w-4" />} title="Possible important findings">
              <ul className="space-y-1.5">
                {s.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-secondary">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <Label icon={<Activity className="h-4 w-4" />}>Symptom timeline</Label>
            <ol className="mt-4 space-y-3">
              {s.timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-300">{t.time}</span>
                  <span className="text-sm text-secondary">{t.event}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 border-b pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">AI ↔ Patient interview</p>
              <p className="text-xs text-muted">Adaptive follow-up questioning · read-only</p>
            </div>
          </div>
          <Transcript messages={c.interview} />
        </div>
      )}
    </div>
  );
}

function Label({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
      <span className="text-brand-500">{icon}</span>
      {children}
    </p>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <Label icon={icon}>{title}</Label>
      <div className="mt-3">{children}</div>
    </div>
  );
}
