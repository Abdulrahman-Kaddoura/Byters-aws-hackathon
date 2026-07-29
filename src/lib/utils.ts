import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Confidence / similarity (0-100) -> a status tone, used consistently across the app. */
export type Tone = 'brand' | 'teal' | 'green' | 'amber' | 'red' | 'purple' | 'gray';

export function confidenceTone(v: number): 'green' | 'teal' | 'amber' | 'red' {
  if (v >= 75) return 'green';
  if (v >= 55) return 'teal';
  if (v >= 35) return 'amber';
  return 'red';
}

const TONE_HEX: Record<'green' | 'teal' | 'amber' | 'red', string> = {
  green: '#16a34a',
  teal: '#0d9488',
  amber: '#d97706',
  red: '#dc2626',
};

export function confidenceHex(v: number): string {
  return TONE_HEX[confidenceTone(v)];
}

/** Relative "time ago" label for ISO timestamps returned by the backend. */
export function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
