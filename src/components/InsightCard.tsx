import { Info, AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert } from 'lucide-react';
import type { AIInsight, InsightKind } from '../types';
import { cn, type Tone } from '../lib/ui';

const KIND_META: Record<InsightKind, { tone: Tone; icon: typeof Info }> = {
  info: { tone: 'brand', icon: Info },
  warning: { tone: 'amber', icon: AlertTriangle },
  success: { tone: 'green', icon: CheckCircle2 },
  suggestion: { tone: 'purple', icon: Lightbulb },
  critical: { tone: 'red', icon: ShieldAlert },
};

const ACCENT: Record<Tone, string> = {
  brand: 'border-l-brand-500',
  teal: 'border-l-teal-500',
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  red: 'border-l-rose-500',
  purple: 'border-l-violet-500',
  gray: 'border-l-slate-400',
};

const ICON_BG: Record<Tone, string> = {
  brand: 'text-brand-600 dark:text-brand-300',
  teal: 'text-teal-600 dark:text-teal-300',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-rose-600 dark:text-rose-400',
  purple: 'text-violet-600 dark:text-violet-400',
  gray: 'text-slate-500',
};

export function InsightCard({ insight }: { insight: AIInsight }) {
  const meta = KIND_META[insight.kind];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        'rounded-lg border border-l-[3px] bg-[var(--surface-2)] p-3.5',
        ACCENT[meta.tone]
      )}
    >
      <div className="flex gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_BG[meta.tone])} />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{insight.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">{insight.text}</p>
        </div>
      </div>
    </div>
  );
}
