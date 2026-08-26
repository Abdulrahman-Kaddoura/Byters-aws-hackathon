import { User, Sparkles, Stethoscope, Server } from 'lucide-react';
import type { CaseTimelineEvent, Speaker } from '@/types';
import { cn } from '@/lib/utils';

const ACTOR_META: Record<Speaker, { icon: typeof User; label: string; cls: string }> = {
  patient: { icon: User, label: 'Patient', cls: 'bg-primary/10 text-primary border-primary/20' },
  ai: { icon: Sparkles, label: 'Sehati AI', cls: 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/12 dark:text-violet-300 dark:border-violet-500/25' },
  doctor: { icon: Stethoscope, label: 'Physician', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/12 dark:text-emerald-300 dark:border-emerald-500/25' },
  system: { icon: Server, label: 'System', cls: 'bg-muted text-muted-foreground border-border' },
};

export function Timeline({ events }: { events: CaseTimelineEvent[] }) {
  if (!events.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No timeline events yet.</p>;
  }
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const meta = ACTOR_META[e.actor];
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className="absolute left-[19px] top-10 h-[calc(100%-24px)] w-px bg-border" />}
            <span className={cn('z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border', meta.cls)}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold">{e.title}</p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {e.date} · {e.time}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>
              <span className="mt-1.5 inline-block text-[11px] font-medium text-muted-foreground">{meta.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
