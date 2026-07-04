import { Check } from 'lucide-react';
import type { ProgressStep } from '../types';
import { cn } from '../lib/ui';

export function ProgressTracker({ steps }: { steps: ProgressStep[] }) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold">Progress</span>
        <span className="text-xs font-medium text-secondary tabular-nums">
          {doneCount}/{steps.length} · {pct}%
        </span>
      </div>
      <ol className="relative">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  className={cn(
                    'absolute left-[11px] top-6 h-[calc(100%-12px)] w-px',
                    s.status === 'done' ? 'bg-emerald-400/60' : 'bg-[var(--border)]'
                  )}
                />
              )}
              <span
                className={cn(
                  'z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                  s.status === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                  s.status === 'active' &&
                    'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300 ring-4 ring-brand-500/10',
                  s.status === 'pending' && 'border-[var(--border-strong)] bg-[var(--surface)] text-muted'
                )}
              >
                {s.status === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <div className="flex-1 pt-0.5">
                <p
                  className={cn(
                    'text-sm leading-tight',
                    s.status === 'active' ? 'font-semibold' : 'font-medium',
                    s.status === 'pending' && 'text-muted'
                  )}
                >
                  {s.label}
                </p>
                {s.status === 'active' && (
                  <span className="mt-0.5 inline-block text-[11px] font-medium text-brand-600 dark:text-brand-300">
                    In progress
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Compact horizontal stepper for headers
export function ProgressBarCompact({ steps }: { steps: ProgressStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s) => (
        <div
          key={s.key}
          title={s.label}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            s.status === 'done' && 'bg-emerald-500',
            s.status === 'active' && 'bg-brand-500',
            s.status === 'pending' && 'bg-[var(--bg-subtle)]'
          )}
        />
      ))}
    </div>
  );
}
