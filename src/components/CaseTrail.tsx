import {
  Check,
  CircleDashed,
  Clock,
  FlaskConical,
  MessageSquareWarning,
  Loader2,
} from 'lucide-react';

import type { PatientCase, ProgressStep } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Where the case has got to, as a list of facts rather than a diagram.
 *
 * This replaced a vertical timeline on Overview. A timeline draws the shape of
 * the journey; what a doctor opening a case actually wants is the one line
 * that says what is outstanding — "waiting on 2 test results" — and a short
 * record of what has already been done. So the active step is stated in words
 * with its real blocker attached, and everything else collapses to a row.
 */

/** What the case is actually waiting on right now, in the doctor's terms.
 *
 * Derived from the case rather than the stage label, because "Tests Ordered"
 * doesn't distinguish tests that are running from tests nobody has started. */
function currentBlocker(c: PatientCase): { text: string; icon: React.ReactNode } | null {
  const awaiting = c.tests.filter((t) => t.status === 'ordered' || t.status === 'pending');
  const unstarted = c.tests.filter((t) => t.status === 'recommended');
  const analysis = c.analysis;

  if (awaiting.length > 0) {
    return {
      icon: <Clock className="h-4 w-4" />,
      text: `Waiting on ${awaiting.length} test result${awaiting.length > 1 ? 's' : ''}: ${awaiting
        .map((t) => t.name)
        .join(', ')}.`,
    };
  }
  if (analysis?.verdict === 'needs_more_tests' && unstarted.length > 0) {
    return {
      icon: <FlaskConical className="h-4 w-4" />,
      text: `Aura asked for ${unstarted.length} further investigation${
        unstarted.length > 1 ? 's' : ''
      }. Mark them awaiting results once ordered.`,
    };
  }
  if (unstarted.length > 0) {
    return {
      icon: <FlaskConical className="h-4 w-4" />,
      text: `${unstarted.length} recommended test${
        unstarted.length > 1 ? 's have' : ' has'
      } not been ordered yet.`,
    };
  }
  if (analysis?.verdict === 'no_results') {
    return {
      icon: <MessageSquareWarning className="h-4 w-4" />,
      text: 'Aura has no results to reason over. Enter a test result on the Workup tab.',
    };
  }
  if (c.status === 'AI Interview') {
    return { icon: <Loader2 className="h-4 w-4" />, text: 'The patient has not finished their interview.' };
  }
  if (c.status === 'Treatment') {
    return {
      icon: <Clock className="h-4 w-4" />,
      text: 'Patient is on treatment. Mark the case resolved, or reopen it if the outcome was unexpected.',
    };
  }
  return null;
}

function TrailRow({ step, blocker }: { step: ProgressStep; blocker: ReturnType<typeof currentBlocker> }) {
  const done = step.status === 'done';
  const active = step.status === 'active';

  return (
    <li
      className={cn(
        'flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0',
        active && 'bg-primary/5'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          done && 'bg-emerald-500 text-white',
          active && 'bg-primary text-primary-foreground',
          step.status === 'pending' && 'text-muted-foreground/50'
        )}
      >
        {done ? (
          <Check className="h-3 w-3" strokeWidth={3.5} />
        ) : active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        ) : (
          <CircleDashed className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[13px] leading-tight',
            active ? 'font-semibold' : 'font-medium',
            step.status === 'pending' && 'text-muted-foreground'
          )}
        >
          {step.label}
        </p>
        {active && blocker && (
          <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
            <span className="mt-px shrink-0 text-primary">{blocker.icon}</span>
            {blocker.text}
          </p>
        )}
      </div>

      <span
        className={cn(
          'shrink-0 text-[11px] font-medium uppercase tracking-wide',
          done && 'text-emerald-600 dark:text-emerald-400',
          active && 'text-primary',
          step.status === 'pending' && 'text-muted-foreground/60'
        )}
      >
        {done ? 'Done' : active ? 'In progress' : 'Not started'}
      </span>
    </li>
  );
}

export function CaseTrail({ caseData: c }: { caseData: PatientCase }) {
  const blocker = currentBlocker(c);
  const done = c.progress.filter((s) => s.status === 'done').length;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Progress</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done} of {c.progress.length} steps complete
        </span>
      </div>
      <ol>
        {c.progress.map((step) => (
          <TrailRow key={step.key} step={step} blocker={blocker} />
        ))}
      </ol>
    </div>
  );
}
