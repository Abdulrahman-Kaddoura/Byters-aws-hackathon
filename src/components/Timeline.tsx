import { User, Sparkles, Stethoscope, Server } from 'lucide-react';
import type { CaseTimelineEvent, Speaker } from '../types';
import { cn, TONE_SOFT, type Tone } from '../lib/ui';

const ACTOR_META: Record<Speaker, { tone: Tone; icon: typeof User; label: string }> = {
  patient: { tone: 'brand', icon: User, label: 'Patient' },
  ai: { tone: 'purple', icon: Sparkles, label: 'Aura AI' },
  doctor: { tone: 'green', icon: Stethoscope, label: 'Physician' },
  system: { tone: 'gray', icon: Server, label: 'System' },
};

export function Timeline({ events }: { events: CaseTimelineEvent[] }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const meta = ACTOR_META[e.actor];
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span className="absolute left-[19px] top-10 h-[calc(100%-24px)] w-px bg-[var(--border)]" />
            )}
            <span
              className={cn(
                'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                TONE_SOFT[meta.tone]
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-semibold">{e.title}</p>
                <span className="text-xs text-muted tabular-nums">
                  {e.date} · {e.time}
                </span>
              </div>
              <p className="mt-1 text-sm text-secondary">{e.description}</p>
              <span className="mt-1.5 inline-block text-[11px] font-medium text-muted">{meta.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
