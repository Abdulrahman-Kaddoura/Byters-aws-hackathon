import { useState } from 'react';
import {
  ClipboardCheck,
  Sparkles,
  Check,
  Pencil,
  Search,
  StickyNote,
  Pill,
  Activity,
  AlertTriangle,
  CalendarClock,
  XCircle,
  Trophy,
  GraduationCap,
  Link2,
  ShieldCheck,
  Hourglass,
} from 'lucide-react';
import { useCaseData, useCaseActions } from './CaseLayout';
import * as api from '../../lib/api';
import { SectionHeading, ConfidenceRing, Badge, TagList, EmptyState } from '../../components/ui';
import { cn } from '../../lib/ui';

function ListBlock({
  icon,
  title,
  items,
  tone = 'brand',
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone?: 'brand' | 'teal' | 'amber' | 'red' | 'green';
}) {
  const dot =
    tone === 'red' ? 'bg-rose-400' : tone === 'amber' ? 'bg-amber-400' : tone === 'teal' ? 'bg-teal-400' : tone === 'green' ? 'bg-emerald-400' : 'bg-brand-400';
  return (
    <div className="card p-5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className="text-brand-500">{icon}</span>
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
            <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinalDiagnosis() {
  const c = useCaseData();
  const fd = c.finalDiagnosis;
  const { apply } = useCaseActions();
  const [decision, setDecision] = useState<null | 'accepted' | 'investigating'>(
    fd?.status === 'accepted' ? 'accepted' : null
  );
  const readOnly = c.status === 'Completed' || c.status === 'Archived';

  async function accept() {
    setDecision('accepted');
    const res = await api.acceptFinalDiagnosis(c.id);
    apply(res.case);
  }

  // -- Not ready yet --------------------------------------------------------
  if (!fd) {
    const lead = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
    return (
      <div className="space-y-5">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <Hourglass className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Final diagnosis not yet reached</h2>
              <p className="mt-1 text-sm text-secondary">
                Aura is still gathering evidence before proposing a final diagnosis. The current leading impression is{' '}
                <span className="font-semibold text-[var(--text)]">{lead?.name}</span> at {lead?.confidence}% confidence.
              </p>
            </div>
          </div>
          {lead && (
            <div className="mt-5 rounded-xl border bg-[var(--surface-2)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">To reach a confident final diagnosis, Aura needs</p>
              <ul className="mt-2.5 space-y-2">
                {lead.missing.map((m, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px]">
                    <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header proposal */}
      <div className="card overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold',
            decision === 'accepted'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300'
              : 'bg-gradient-to-r from-brand-50 to-teal-50 text-brand-700 dark:from-brand-500/12 dark:to-teal-500/10 dark:text-brand-200'
          )}
        >
          {decision === 'accepted' ? <ShieldCheck className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {decision === 'accepted' ? 'Diagnosis accepted by physician' : 'Aura proposes a final diagnosis'}
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ConfidenceRing value={fd.confidence} size={72} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Final diagnosis</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{fd.name}</h1>
              <p className="mt-1 text-sm text-secondary">{fd.reasoning}</p>
            </div>
          </div>

          {/* Actions */}
          {!readOnly && (
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              <button
                onClick={accept}
                className={cn('btn', decision === 'accepted' ? 'btn-primary' : 'btn-primary')}
              >
                <Check className="h-4 w-4" /> Accept diagnosis
              </button>
              <button className="btn btn-outline">
                <Pencil className="h-4 w-4" /> Modify
              </button>
              <button onClick={() => setDecision('investigating')} className="btn btn-outline">
                <Search className="h-4 w-4" /> Continue investigation
              </button>
              <button className="btn btn-ghost">
                <StickyNote className="h-4 w-4" /> Add note
              </button>
            </div>
          )}
          {decision === 'accepted' && !readOnly && (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" /> Diagnosis confirmed. Treatment plan activated and follow-up scheduled.
            </p>
          )}
          {decision === 'investigating' && (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-amber-600 dark:text-amber-400">
              <Search className="h-4 w-4" /> Kept open for further investigation. Aura will continue monitoring for new evidence.
            </p>
          )}
        </div>
      </div>

      {/* Evidence summary + ruled out */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <SectionHeading icon={<ClipboardCheck className="h-[18px] w-[18px]" />} title="Evidence summary" />
          <ul className="mt-3 space-y-2">
            {fd.evidenceSummary.map((e, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {e}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <SectionHeading icon={<XCircle className="h-[18px] w-[18px]" />} title="Why alternatives were ruled out" />
          <ul className="mt-3 space-y-3">
            {fd.ruledOut.map((r, i) => (
              <li key={i}>
                <p className="text-[13px] font-semibold">{r.name}</p>
                <p className="text-[13px] text-secondary">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Management */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ListBlock icon={<Pill className="h-4 w-4" />} title="Suggested treatment" items={fd.treatment} tone="brand" />
        <ListBlock icon={<Activity className="h-4 w-4" />} title="Monitoring" items={fd.monitoring} tone="teal" />
        <ListBlock icon={<AlertTriangle className="h-4 w-4" />} title="Possible complications" items={fd.complications} tone="amber" />
        <ListBlock icon={<CalendarClock className="h-4 w-4" />} title="Follow-up recommendations" items={fd.followUp} tone="green" />
      </div>

      {/* Physician notes */}
      {c.notes.length > 0 && (
        <div className="card p-5">
          <SectionHeading icon={<StickyNote className="h-[18px] w-[18px]" />} title="Physician notes" />
          <ul className="mt-4 space-y-3">
            {c.notes.map((n, i) => (
              <li key={i} className="rounded-lg border bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{n.author}</span>
                  <span className="text-[11px] text-muted">{n.time}</span>
                </div>
                <p className="mt-1 text-[13px] text-secondary">{n.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Completed extras */}
      {readOnly && (
        <>
          {c.outcome && (
            <div className="card p-5">
              <SectionHeading icon={<Trophy className="h-[18px] w-[18px]" />} title="Outcome" />
              <p className="mt-3 text-sm leading-relaxed text-secondary">{c.outcome}</p>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {c.lessonsLearned && c.lessonsLearned.length > 0 && (
              <ListBlock icon={<GraduationCap className="h-4 w-4" />} title="Lessons learned" items={c.lessonsLearned} tone="brand" />
            )}
            {c.associatedConditions && c.associatedConditions.length > 0 && (
              <div className="card p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <Link2 className="h-4 w-4 text-brand-500" /> Associated conditions
                </p>
                <div className="mt-3">
                  <TagList items={c.associatedConditions} tone="purple" />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!fd && <EmptyState title="No final diagnosis" />}
    </div>
  );
}
