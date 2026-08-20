import { Badge } from '@/components/ui/badge';
import { STATUS_META, PRIORITY_META, FLAG_META, IMPORTANCE_META, toneVariant } from '@/data/helpers';
import type { CaseStatus, Priority, Flag, Importance } from '@/types';

export function StatusBadge({ status }: { status: CaseStatus }) {
  const m = STATUS_META[status] ?? { label: status, tone: 'gray' as const };
  return (
    <Badge variant={toneVariant(m.tone)} dot>
      {m.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority] ?? { tone: 'gray' as const, label: priority };
  return <Badge variant={toneVariant(m.tone)}>{priority}</Badge>;
}

export function FlagBadge({ flag }: { flag: Flag }) {
  const m = FLAG_META[flag] ?? { tone: 'gray' as const, label: flag };
  return <Badge variant={toneVariant(m.tone)}>{m.label}</Badge>;
}

export function ImportanceBadge({ importance }: { importance: Importance }) {
  const m = IMPORTANCE_META[importance] ?? { tone: 'gray' as const };
  return <Badge variant={toneVariant(m.tone)}>{importance}</Badge>;
}
