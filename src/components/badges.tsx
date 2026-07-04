import { Badge } from './ui';
import { STATUS_META, PRIORITY_META, FLAG_META } from '../data/helpers';
import type { CaseStatus, Priority, Flag } from '../types';

export function StatusBadge({ status }: { status: CaseStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return <Badge tone={m.tone}>{priority}</Badge>;
}

export function FlagBadge({ flag }: { flag: Flag }) {
  const m = FLAG_META[flag];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
