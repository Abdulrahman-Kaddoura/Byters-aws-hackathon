import { useState } from 'react';
import {
  Stethoscope,
  Check,
  SkipForward,
  StickyNote,
  Sparkles,
  CircleCheck,
  Circle,
  X,
} from 'lucide-react';
import { useCaseData } from './CaseLayout';
import { SectionHeading, Badge } from '../../components/ui';
import { FlagBadge } from '../../components/badges';
import { IMPORTANCE_META } from '../../data/helpers';
import { cn } from '../../lib/ui';
import type { ExamRecommendation } from '../../types';

function ExamItem({ exam }: { exam: ExamRecommendation }) {
  const [status, setStatus] = useState(exam.status);
  const [finding, setFinding] = useState(exam.finding ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(exam.note ?? '');
  const [aiUpdated, setAiUpdated] = useState(false);
  const imp = IMPORTANCE_META[exam.importance];

  function complete() {
    setStatus('complete');
    if (finding.trim()) setAiUpdated(true);
  }

  return (
    <div
      className={cn(
        'card-flat p-4 transition-colors',
        status === 'skipped' && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            status === 'complete' ? 'text-emerald-500' : 'text-muted'
          )}
        >
          {status === 'complete' ? <CircleCheck className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{exam.name}</h4>
            <Badge tone={imp.tone}>{exam.importance}</Badge>
            {status === 'complete' && exam.flag && <FlagBadge flag={exam.flag} />}
            {status === 'skipped' && <Badge tone="gray">Skipped</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-secondary">{exam.reason}</p>

          {/* Confidence */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted">AI relevance</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${exam.confidence}%` }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-secondary">{exam.confidence}%</span>
          </div>

          {/* Finding */}
          {status === 'complete' ? (
            <div className="mt-3 rounded-lg border bg-[var(--surface-2)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-muted">Finding</p>
                  <p className="text-sm font-semibold">{finding || '—'}</p>
                </div>
                {exam.normalRange && (
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-muted">Normal range</p>
                    <p className="text-[13px] text-secondary">{exam.normalRange}</p>
                  </div>
                )}
              </div>
              {note && <p className="mt-2 border-t pt-2 text-[13px] italic text-secondary">{note}</p>}
            </div>
          ) : status === 'pending' ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={finding}
                  onChange={(e) => setFinding(e.target.value)}
                  placeholder="Enter finding…"
                  className="input"
                />
                <div className="flex gap-2">
                  <button onClick={complete} className="btn btn-primary shrink-0 px-3 py-2 text-xs">
                    <Check className="h-3.5 w-3.5" /> Complete
                  </button>
                  <button onClick={() => setStatus('skipped')} className="btn btn-outline shrink-0 px-3 py-2 text-xs">
                    <SkipForward className="h-3.5 w-3.5" /> Skip
                  </button>
                  <button onClick={() => setNoteOpen((o) => !o)} className="btn btn-ghost shrink-0 px-2.5 py-2 text-xs" aria-label="Add note">
                    <StickyNote className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {noteOpen && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Add a note…"
                  className="input resize-none"
                />
              )}
            </div>
          ) : (
            <button onClick={() => setStatus('pending')} className="btn btn-ghost mt-2 px-2 py-1 text-xs">
              <X className="h-3.5 w-3.5" /> Undo skip
            </button>
          )}

          {/* AI reasoning update */}
          {aiUpdated && (
            <div className="mt-3 flex animate-fade-in items-start gap-2 rounded-lg border border-teal-200/70 bg-teal-50/60 p-3 dark:border-teal-500/25 dark:bg-teal-500/8">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-300" />
              <p className="text-[13px] text-secondary">
                <span className="font-semibold text-[var(--text)]">Aura updated its reasoning.</span> This finding has
                been incorporated into the differential — confidence scores on the Differential tab have been
                re-weighted accordingly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Examination() {
  const c = useCaseData();
  const completed = c.exams.filter((e) => e.status === 'complete').length;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <SectionHeading
          icon={<Stethoscope className="h-[18px] w-[18px]" />}
          title="Recommended examinations"
          subtitle="Aura suggests these based on the presentation. Enter findings to update the differential."
          action={
            <Badge tone={completed === c.exams.length ? 'green' : 'amber'}>
              {completed}/{c.exams.length} complete
            </Badge>
          }
        />
      </div>

      <div className="space-y-3">
        {c.exams.map((exam) => (
          <ExamItem key={exam.id} exam={exam} />
        ))}
      </div>
    </div>
  );
}
