import { BookMarked, FileText, GraduationCap, FolderClock, ExternalLink } from 'lucide-react';
import type { Reference, ReferenceType, SimilarCase } from '../types';
import { Badge } from './ui';
import { cn, type Tone } from '../lib/ui';

const REF_META: Record<ReferenceType, { icon: typeof FileText; label: string; tone: Tone }> = {
  guideline: { icon: BookMarked, label: 'Clinical guideline', tone: 'brand' },
  paper: { icon: FileText, label: 'Research paper', tone: 'teal' },
  textbook: { icon: GraduationCap, label: 'Textbook', tone: 'purple' },
  case: { icon: FolderClock, label: 'Prior case', tone: 'amber' },
};

const STRENGTH_TONE: Record<NonNullable<Reference['strength']>, Tone> = {
  Strong: 'green',
  Moderate: 'amber',
  Supportive: 'gray',
};

export function ReferenceCard({ reference }: { reference: Reference }) {
  const meta = REF_META[reference.type];
  const Icon = meta.icon;
  return (
    <div className="group rounded-lg border bg-[var(--surface-2)] p-3.5 transition-colors hover:border-brand-300">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            meta.tone === 'brand' && 'bg-brand-50 text-brand-600 border-brand-200/70 dark:bg-brand-500/12 dark:text-brand-300',
            meta.tone === 'teal' && 'bg-teal-50 text-teal-600 border-teal-200/70 dark:bg-teal-500/12 dark:text-teal-300',
            meta.tone === 'purple' && 'bg-violet-50 text-violet-600 border-violet-200/70 dark:bg-violet-500/12 dark:text-violet-300',
            meta.tone === 'amber' && 'bg-amber-50 text-amber-600 border-amber-200/70 dark:bg-amber-500/12 dark:text-amber-300'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug">{reference.title}</p>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {reference.source}
            {reference.year ? ` · ${reference.year}` : ''} · {meta.label}
          </p>
          <p className="mt-2 text-[13px] italic leading-relaxed text-secondary">"{reference.snippet}"</p>
          {reference.strength && (
            <div className="mt-2">
              <Badge tone={STRENGTH_TONE[reference.strength]}>{reference.strength} evidence</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SimilarCaseCard({ item }: { item: SimilarCase }) {
  return (
    <div className="rounded-lg border bg-[var(--surface-2)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{item.title}</p>
        <Badge tone="brand">{item.similarity}% match</Badge>
      </div>
      <p className="mt-1.5 text-[13px] text-secondary">{item.detail}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className="font-medium text-muted">Outcome:</span>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{item.outcome}</span>
      </div>
    </div>
  );
}
