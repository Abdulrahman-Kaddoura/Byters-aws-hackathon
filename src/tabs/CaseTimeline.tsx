import { useState } from 'react';
import { GitBranch, User, Sparkles, Stethoscope, Server, ShieldCheck, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/common';
import { Timeline } from '@/components/Timeline';
import { useCaseAudit } from '@/hooks/useCases';
import { PERMISSIONS, useSession } from '@/lib/session';

function LegendDot({ icon, label, cls }: { icon: React.ReactNode; label: string; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cls}>{icon}</span>
      {label}
    </span>
  );
}

function AuditTrail({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const { data: entries, isLoading, error } = useCaseAudit(caseId, open);

  return (
    <Card>
      <CardContent className="p-5">
        <button className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)}>
          <SectionHeading icon={<ShieldCheck className="h-[18px] w-[18px]" />} title="Audit trail" subtitle="Compliance-only: every action recorded on this case" />
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {open && (
          <div className="mt-4">
            {isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
              </p>
            )}
            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p>}
            {entries && (
              <ul className="space-y-2 text-[13px]">
                {entries.map((e, i) => (
                  <li key={i} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{String(e.action ?? '—')}</span>
                      <span className="text-xs text-muted-foreground">{String(e.ts ?? '')}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">actor: {String(e.actor ?? 'unknown')}</div>
                  </li>
                ))}
                {entries.length === 0 && <p className="text-muted-foreground">No audit entries yet.</p>}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CaseTimeline({ caseData: c }: { caseData: PatientCase; isClinician?: boolean }) {
  const canAudit = useSession().can(PERMISSIONS.auditView);
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <SectionHeading icon={<GitBranch className="h-[18px] w-[18px]" />} title="Case timeline" subtitle="Every step of the diagnostic journey, from intake to resolution" />
          <div className="mt-4 flex flex-wrap gap-3 border-t pt-4 text-xs text-muted-foreground">
            <LegendDot icon={<User className="h-3 w-3" />} label="Patient" cls="text-primary" />
            <LegendDot icon={<Sparkles className="h-3 w-3" />} label="Sehati AI" cls="text-violet-500 dark:text-violet-400" />
            <LegendDot icon={<Stethoscope className="h-3 w-3" />} label="Physician" cls="text-emerald-500 dark:text-emerald-400" />
            <LegendDot icon={<Server className="h-3 w-3" />} label="System" cls="text-slate-400" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <Timeline events={c.timeline} />
        </CardContent>
      </Card>

      {canAudit && <AuditTrail caseId={c.id} />}
    </div>
  );
}
