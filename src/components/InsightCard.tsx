import { Info, AlertTriangle, CheckCircle2, Lightbulb, ShieldAlert } from 'lucide-react';
import type { AIInsight, InsightKind } from '@/types';
import { cn } from '@/lib/utils';

const KIND_META: Record<InsightKind, { icon: typeof Info; border: string; icon_cls: string }> = {
  info: { icon: Info, border: 'border-l-primary', icon_cls: 'text-primary' },
  warning: { icon: AlertTriangle, border: 'border-l-amber-500', icon_cls: 'text-amber-600 dark:text-amber-400' },
  success: { icon: CheckCircle2, border: 'border-l-emerald-500', icon_cls: 'text-emerald-600 dark:text-emerald-400' },
  suggestion: { icon: Lightbulb, border: 'border-l-violet-500', icon_cls: 'text-violet-600 dark:text-violet-400' },
  critical: { icon: ShieldAlert, border: 'border-l-rose-500', icon_cls: 'text-rose-600 dark:text-rose-400' },
};

export function InsightCard({ insight }: { insight: AIInsight }) {
  const meta = KIND_META[insight.kind];
  const Icon = meta.icon;
  return (
    <div className={cn('rounded-lg border border-l-[3px] bg-muted/40 p-3.5', meta.border)}>
      <div className="flex gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.icon_cls)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{insight.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{insight.text}</p>
        </div>
      </div>
    </div>
  );
}
