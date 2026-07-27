import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, TONE_SOFT, TONE_DOT, TONE_FILL, TONE_TEXT, CHART_COLORS, initials, type Tone } from '../lib/ui';
import { confidenceTone } from '../data/helpers';

// --------------------------------------------------------------------------
// Spinner / loading state
// --------------------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner className="h-6 w-6" />
      {label}
    </div>
  );
}

// --------------------------------------------------------------------------
// Badge
// --------------------------------------------------------------------------
export function Badge({
  tone = 'gray',
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('chip border', TONE_SOFT[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

// --------------------------------------------------------------------------
// Avatar — generated from name + hue
// --------------------------------------------------------------------------
export function Avatar({
  name,
  hue = 220,
  size = 40,
  className,
}: {
  name: string;
  hue?: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${hue} 70% 56%), hsl(${(hue + 40) % 360} 65% 46%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

// --------------------------------------------------------------------------
// Confidence meter (linear)
// --------------------------------------------------------------------------
export function ConfidenceMeter({
  value,
  showLabel = true,
  height = 8,
  className,
}: {
  value: number;
  showLabel?: boolean;
  height?: number;
  className?: string;
}) {
  const tone = confidenceTone(value);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="flex-1 overflow-hidden rounded-full"
        style={{ height, background: 'var(--bg-subtle)' }}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', TONE_FILL[tone])}
          style={{ width: `${value}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn('text-sm font-semibold tabular-nums', TONE_TEXT[tone])}>{value}%</span>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Confidence ring (circular)
// --------------------------------------------------------------------------
export function ConfidenceRing({ value, size = 56 }: { value: number; size?: number }) {
  const tone = confidenceTone(value);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  const colorVar =
    tone === 'green'
      ? CHART_COLORS.green
      : tone === 'teal'
        ? CHART_COLORS.teal
        : tone === 'amber'
          ? CHART_COLORS.amber
          : CHART_COLORS.red;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={stroke} />
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

// --------------------------------------------------------------------------
// Stat tile
// --------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-secondary">{sub}</p>}
        </div>
        {icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', TONE_SOFT[tone])}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Section heading
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
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && <span className="mt-0.5 text-brand-500 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-secondary">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// --------------------------------------------------------------------------
// Empty state
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
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 px-6 text-center">
      {icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-muted">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// --------------------------------------------------------------------------
// Key/value row
// --------------------------------------------------------------------------
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Pill list of tags
// --------------------------------------------------------------------------
export function TagList({ items, tone = 'gray' }: { items: string[]; tone?: Tone }) {
  if (!items.length) return <span className="text-sm text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', TONE_SOFT[tone])}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export { initials };
