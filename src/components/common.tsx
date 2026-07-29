import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, confidenceTone } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toneVariant } from '@/data/helpers';
import type { Tone } from '@/lib/utils';

// --------------------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <Spinner className="h-6 w-6" />
      {label}
    </div>
  );
}

// --------------------------------------------------------------------------
export function SectionHeading({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-primary">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// --------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</span>}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --------------------------------------------------------------------------
export function TagList({ items, tone = 'gray' }: { items: string[]; tone?: Tone }) {
  if (!items.length) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <Badge key={i} variant={toneVariant(tone)} className="font-medium">
          {it}
        </Badge>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
export function ConfidenceMeter({ value, showLabel = true, height = 8, className }: { value: number; showLabel?: boolean; height?: number; className?: string }) {
  const tone = confidenceTone(value);
  const fill =
    tone === 'green' ? 'bg-emerald-500' : tone === 'teal' ? 'bg-teal-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500';
  const text =
    tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'teal' ? 'text-teal-600 dark:text-teal-400' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1 overflow-hidden rounded-full bg-muted" style={{ height }}>
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill)} style={{ width: `${value}%` }} />
      </div>
      {showLabel && <span className={cn('text-sm font-semibold tabular-nums', text)}>{value}%</span>}
    </div>
  );
}

export function ConfidenceRing({ value, size = 56 }: { value: number; size?: number }) {
  const tone = confidenceTone(value);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const colorVar =
    tone === 'green' ? '#16a34a' : tone === 'teal' ? '#0d9488' : tone === 'amber' ? '#d97706' : '#dc2626';
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorVar}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums" style={{ color: colorVar }}>
        {value}
      </span>
    </div>
  );
}
