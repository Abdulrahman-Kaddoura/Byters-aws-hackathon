import { BookMarked, FileText, GraduationCap, FolderClock, ExternalLink } from 'lucide-react';
import type { Reference, ReferenceType, SimilarCase } from '@/types';
import { Badge } from '@/components/ui/badge';
import { toneVariant } from '@/data/helpers';
import type { Tone } from '@/lib/utils';

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
  const meta = REF_META[reference.type] ?? { icon: FileText, label: reference.type, tone: 'gray' as const };
  const Icon = meta.icon;
  return (
    <div className="group rounded-lg border bg-muted/30 p-3.5 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <Badge variant={toneVariant(meta.tone)} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0">
          <Icon className="h-4 w-4" />
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-snug">{reference.title}</p>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {reference.source}
            {reference.year ? ` · ${reference.year}` : ''} · {meta.label}
          </p>
          <p className="mt-2 text-[13px] italic leading-relaxed text-muted-foreground">&ldquo;{reference.snippet}&rdquo;</p>
          {reference.strength && (
            <div className="mt-2">
              <Badge variant={toneVariant(STRENGTH_TONE[reference.strength])}>{reference.strength} evidence</Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SimilarCaseCard({ item }: { item: SimilarCase }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{item.title}</p>
        <Badge variant="brand">{item.similarity}% match</Badge>
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{item.detail}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className="font-medium text-muted-foreground">Outcome:</span>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{item.outcome}</span>
      </div>
    </div>
  );
}
