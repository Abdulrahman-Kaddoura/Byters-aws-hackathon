export type Tone = 'brand' | 'teal' | 'green' | 'amber' | 'red' | 'purple' | 'gray';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// Soft badge/chip color classes. Written as literal strings so Tailwind's JIT
// can see every class it must generate.
export const TONE_SOFT: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200/70 dark:bg-brand-500/12 dark:text-brand-200 dark:border-brand-500/25',
  teal: 'bg-teal-50 text-teal-700 border-teal-200/70 dark:bg-teal-500/12 dark:text-teal-200 dark:border-teal-500/25',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-500/12 dark:text-emerald-300 dark:border-emerald-500/25',
  amber: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/12 dark:text-amber-300 dark:border-amber-500/25',
  red: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-500/12 dark:text-rose-300 dark:border-rose-500/25',
  purple: 'bg-violet-50 text-violet-700 border-violet-200/70 dark:bg-violet-500/12 dark:text-violet-300 dark:border-violet-500/25',
  gray: 'bg-slate-100 text-slate-600 border-slate-200/70 dark:bg-slate-500/12 dark:text-slate-300 dark:border-slate-500/25',
};

// Solid dot colors for status indicators.
export const TONE_DOT: Record<Tone, string> = {
  brand: 'bg-brand-500',
  teal: 'bg-teal-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  purple: 'bg-violet-500',
  gray: 'bg-slate-400',
};

// Foreground text color per tone.
export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand-600 dark:text-brand-300',
  teal: 'text-teal-600 dark:text-teal-300',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-rose-600 dark:text-rose-400',
  purple: 'text-violet-600 dark:text-violet-400',
  gray: 'text-slate-500 dark:text-slate-400',
};

// Meter / progress fill colors.
export const TONE_FILL: Record<Tone, string> = {
  brand: 'bg-brand-500',
  teal: 'bg-teal-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  purple: 'bg-violet-500',
  gray: 'bg-slate-400',
};

// Chart-mark colors — slightly darker/higher-contrast variants of the brand
// ramp so thin marks read on light surfaces. Every use pairs them with a
// direct numeric label, so identity/magnitude is never color-alone.
export const CHART_COLORS = {
  brand: '#2f66f6',
  teal: '#0b8a7a',
  green: '#059669',
  amber: '#d97706',
  red: '#e11d48',
  purple: '#7c3aed',
  grid: 'rgba(120,130,150,0.16)',
};

// Confidence → chart color (status ramp, always shown with the % value).
export function confidenceHex(v: number): string {
  if (v >= 75) return CHART_COLORS.green;
  if (v >= 55) return CHART_COLORS.teal;
  if (v >= 35) return CHART_COLORS.amber;
  return CHART_COLORS.red;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
