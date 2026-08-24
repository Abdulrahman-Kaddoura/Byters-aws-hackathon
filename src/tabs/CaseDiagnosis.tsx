import { useState } from 'react';
import { ClipboardCheck, Sparkles, Check, Search, StickyNote, Pill, Activity, AlertTriangle, CalendarClock, XCircle, ShieldCheck, Hourglass, Loader2 } from 'lucide-react';
import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeading, ConfidenceRing } from '@/components/common';
import { useProposeFinalDiagnosis, useAcceptFinalDiagnosis } from '@/hooks/useCases';
import { CaseDifferential } from '@/tabs/CaseDifferential';
import { CompleteCaseButton, PostAcceptDialog, isCaseComplete } from '@/components/CaseCompletion';
import { cn } from '@/lib/utils';

function ListBlock({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </p>
        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The ranked differential and the sign-off, on one page.
 *
 * The differential and the sign-off were two tabs, which meant reading the
 * reasoning and acting on it happened in different places. The differential
 * leads and the sign-off follows from it.
 *
 * What used to follow the sign-off — a treatment panel, a reopen path, a note
 * form, and a feedback form pinned to the bottom — is gone from the page.
 * Accepting a diagnosis now opens one dialog that asks for feedback and then
 * offers to complete the case (components/CaseCompletion.tsx), so the ending
 * is two decisions in sequence instead of a page of parallel ones.
 */
export function CaseDiagnosis({ caseData }: { caseData: PatientCase }) {
  return (
    <div className="space-y-10 pb-8">
      <CaseDifferential caseData={caseData} />
      <div className="border-t pt-8">
        <FinalDiagnosisPanel caseData={caseData} />
      </div>
    </div>
  );
}

function FinalDiagnosisPanel({ caseData: c }: { caseData: PatientCase }) {
  const fd = c.finalDiagnosis;
  const readOnly = isCaseComplete(c);
  const propose = useProposeFinalDiagnosis(c.id);
  const accept = useAcceptFinalDiagnosis(c.id);
  const [signOffNote, setSignOffNote] = useState('');
  const [postAccept, setPostAccept] = useState(false);

  if (!fd) {
    const lead = c.diagnoses.length ? [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0] : undefined;
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                <Hourglass className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">Final diagnosis not yet reached</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {lead ? (
                    <>
                      Current leading impression is <span className="font-semibold text-foreground">{lead.name}</span> at {lead.confidence}% confidence.
                    </>
                  ) : (
                    'Build a differential diagnosis first.'
                  )}
                </p>
              </div>
            </div>
            {lead && (
              <div className="mt-5 space-y-3">
                {lead.missing.length > 0 && (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To reach a confident final diagnosis, Aura needs</p>
                    <ul className="mt-2.5 space-y-2">
                      {lead.missing.map((m, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[13px]">
                          <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button onClick={() => propose.mutate()} disabled={propose.isPending}>
                  {propose.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Propose final diagnosis
                </Button>
                {propose.isError && <p className="text-sm text-rose-600 dark:text-rose-400">{(propose.error as Error).message}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold',
            fd.status === 'accepted' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300' : 'bg-gradient-to-r from-primary/10 to-teal-50 text-primary dark:from-primary/15'
          )}
        >
          {fd.status === 'accepted' ? <ShieldCheck className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {fd.status === 'accepted' ? 'Diagnosis accepted by the doctor' : 'Aura proposes a final diagnosis'}
        </div>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ConfidenceRing value={fd.confidence} size={72} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Final diagnosis</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{fd.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{fd.reasoning}</p>
            </div>
          </div>

          {/* One button. "Continue investigating" used to sit next to it,
              which asked the doctor to re-decide something they had just
              decided; the differential above is still there to go back to. */}
          {!readOnly && fd.status !== 'accepted' && (
            <div className="mt-5 space-y-3 border-t pt-4">
              <Textarea value={signOffNote} onChange={(e) => setSignOffNote(e.target.value)} placeholder="Optional sign-off note…" rows={2} />
              <Button
                onClick={() =>
                  accept.mutate(signOffNote || undefined, { onSuccess: () => setPostAccept(true) })
                }
                disabled={accept.isPending}
              >
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept diagnosis
              </Button>
              {accept.isError && <p className="text-[13px] text-rose-600 dark:text-rose-400">{(accept.error as Error).message}</p>}
            </div>
          )}
          {fd.status === 'accepted' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {readOnly ? 'Case complete and retained immutably.' : 'Diagnosis signed off.'}
              </p>
              {/* The dialog is the usual way this gets pressed, but a doctor
                  who chose "not yet" (or reloaded the page) needs the ending
                  in reach without hunting for it. */}
              {!readOnly && <CompleteCaseButton caseData={c} />}
            </div>
          )}
        </CardContent>
      </Card>

      <PostAcceptDialog caseData={c} open={postAccept} onOpenChange={setPostAccept} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <SectionHeading icon={<ClipboardCheck className="h-[18px] w-[18px]" />} title="Evidence summary" />
            <ul className="mt-3 space-y-2">
              {fd.evidenceSummary.map((e, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {e}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <SectionHeading icon={<XCircle className="h-[18px] w-[18px]" />} title="Why alternatives were ruled out" />
            <ul className="mt-3 space-y-3">
              {fd.ruledOut.map((r, i) => (
                <li key={i}>
                  <p className="text-[13px] font-semibold">{r.name}</p>
                  <p className="text-[13px] text-muted-foreground">{r.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListBlock icon={<Pill className="h-4 w-4" />} title="Suggested treatment" items={fd.treatment} />
        <ListBlock icon={<Activity className="h-4 w-4" />} title="Monitoring" items={fd.monitoring} />
        <ListBlock icon={<AlertTriangle className="h-4 w-4" />} title="Possible complications" items={fd.complications} />
        <ListBlock icon={<CalendarClock className="h-4 w-4" />} title="Follow-up recommendations" items={fd.followUp} />
      </div>

      {c.notes.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <SectionHeading icon={<StickyNote className="h-[18px] w-[18px]" />} title="Physician notes" />
            <ul className="mt-4 space-y-3">
              {c.notes.map((n, i) => (
                <li key={i} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{n.author}</span>
                    <span className="text-[11px] text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">{n.text}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {readOnly && c.outcome && (
        <Card>
          <CardContent className="p-5">
            <SectionHeading title="Outcome" />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.outcome}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
