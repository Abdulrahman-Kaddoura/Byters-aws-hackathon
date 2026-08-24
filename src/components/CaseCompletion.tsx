import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, MessageSquarePlus, ShieldCheck } from 'lucide-react';

import type { PatientCase } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResolveCase, useSubmitFeedback } from '@/hooks/useCases';

// The same vocabulary the old end-of-case form used (components/DoctorTools.tsx,
// deleted with this change) — the stored feedback is one dataset, and
// renaming the categories here would split it in two.
export const FEEDBACK_CATEGORIES = ['general', 'diagnosis', 'summary', 'transcription', 'other'] as const;
type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** A case that is finished — nothing left to complete. */
export function isCaseComplete(c: PatientCase): boolean {
  return c.status === 'Completed' || c.status === 'Archived';
}

/**
 * What happens the moment a doctor accepts a diagnosis.
 *
 * Accepting used to drop the doctor into a page of treatment controls, notes,
 * a reopen path and a feedback form further down — every one of them optional,
 * none of them obviously next. So the two things that actually matter now come
 * to them, centre-screen, one at a time:
 *
 *   1. feedback, asked while the reasoning is still fresh (and skippable —
 *      it's the doctor's call, not a toll gate), and
 *   2. "mark this case complete", which is the ending.
 *
 * Feedback is asked here rather than after the case closes because sign-off is
 * the moment the doctor has actually judged how Aura reasoned; days later,
 * nobody answers. It is saved per doctor and folded back into how Aura reasons
 * on their future cases, which is why the copy says so.
 */
export function PostAcceptDialog({
  caseData: c,
  open,
  onOpenChange,
}: {
  caseData: PatientCase;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<'feedback' | 'complete'>('feedback');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [note, setNote] = useState('');

  const submitFeedback = useSubmitFeedback(c.id);
  const resolveCase = useResolveCase(c.id);

  function close() {
    onOpenChange(false);
    // Reset only after the dialog is gone, so the content doesn't visibly
    // snap back to step one while it animates out.
    setTimeout(() => {
      setStep('feedback');
      setText('');
      setCategory('general');
      setNote('');
    }, 200);
  }

  function saveFeedbackThenContinue() {
    if (!text.trim()) {
      setStep('complete');
      return;
    }
    submitFeedback.mutate(
      { feedback: text.trim(), category },
      // Feedback is a nice-to-have; a failure to record it must not block the
      // doctor from finishing the case, so we move on either way and surface
      // the error on the next step rather than trapping them here.
      { onSettled: () => setStep('complete') }
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        {step === 'feedback' ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <DialogTitle>Diagnosis accepted</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{c.finalDiagnosis?.name}</span> is signed off.
                Before you close this out — how did Aura do? This is kept as your preferences and feeds
                back into how it reasons on your future cases.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                autoFocus
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Ranked pneumonia third when the chest film made it obvious — the CRP seemed to be weighted too heavily."
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('complete')} disabled={submitFeedback.isPending}>
                Skip
              </Button>
              <Button onClick={saveFeedbackThenContinue} disabled={submitFeedback.isPending}>
                {submitFeedback.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
                Save feedback
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <DialogTitle>Mark this case complete?</DialogTitle>
              <DialogDescription>
                That closes {c.patient.name.split(' ')[0] || 'the patient'}'s case for good and files it
                under completed cases. You can leave it open and come back — the{' '}
                <span className="font-medium text-foreground">Mark complete</span> button stays in the case
                header.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Closing note (optional)
              </p>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Symptoms resolved after 5 days of oral antibiotics."
              />
            </div>

            {submitFeedback.isError && (
              <p className="text-[13px] text-amber-600 dark:text-amber-400">
                Your feedback couldn't be saved ({(submitFeedback.error as Error).message}), but the case is
                unaffected.
              </p>
            )}
            {submitFeedback.isSuccess && (
              <p className="flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Feedback saved.
              </p>
            )}
            {resolveCase.isError && (
              <p className="text-[13px] text-rose-600 dark:text-rose-400">
                {(resolveCase.error as Error).message}
              </p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={close} disabled={resolveCase.isPending}>
                Not yet
              </Button>
              <Button
                disabled={resolveCase.isPending}
                onClick={() =>
                  resolveCase.mutate({ note: note.trim() || undefined }, { onSuccess: close })
                }
              >
                {resolveCase.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark case complete
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Mark complete" in the case header, available at every stage.
 *
 * The dialog above is the happy path, but a case doesn't always end by
 * reaching a diagnosis — the patient is discharged, referred on, or simply
 * never comes back — and the doctor still has to be able to close the record.
 * So this sits in the header from intake onward and the server allows the
 * transition from any open state (backend/sehati/state_machine.py). Because it
 * is reachable long before a diagnosis exists, it confirms first and says what
 * is being closed.
 */
export function CompleteCaseButton({ caseData: c }: { caseData: PatientCase }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const resolveCase = useResolveCase(c.id);

  if (isCaseComplete(c)) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Completed
      </span>
    );
  }

  const signedOff = c.finalDiagnosis?.status === 'accepted';

  return (
    <>
      <Button variant={signedOff ? 'default' : 'outline'} size="sm" onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" /> Mark complete
      </Button>

      <Dialog open={open} onOpenChange={(o) => !resolveCase.isPending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark this case complete?</DialogTitle>
            <DialogDescription>
              {signedOff ? (
                <>
                  Closes {c.patient.name}'s case with{' '}
                  <span className="font-medium text-foreground">{c.finalDiagnosis?.name}</span> as the
                  outcome. This is final.
                </>
              ) : (
                <>
                  No final diagnosis has been signed off on this case yet. Completing it now closes the
                  record as it stands — use this when the patient was discharged, referred on, or didn't
                  return. This is final.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Closing note (optional)"
          />

          {resolveCase.isError && (
            <p className="text-[13px] text-rose-600 dark:text-rose-400">
              {(resolveCase.error as Error).message}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={resolveCase.isPending}>
              Cancel
            </Button>
            <Button
              disabled={resolveCase.isPending}
              onClick={() =>
                resolveCase.mutate(
                  { note: note.trim() || undefined },
                  { onSuccess: () => setOpen(false) }
                )
              }
            >
              {resolveCase.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
