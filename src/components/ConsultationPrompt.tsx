import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mic } from 'lucide-react';

import type { ConsultationSummary, PatientCase } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fileToBase64 } from '@/lib/utils';
import * as api from '@/lib/api';
import {
  useSetConsultation,
  useStartTranscription,
  useUploadCaseAudio,
} from '@/hooks/useCases';

const POLL_INTERVAL_MS = 4000;

/**
 * The one question the doctor is asked before anything else: is there a
 * recording of you talking to this patient?
 *
 * The AI interview on the nurse's device is one account of the presentation.
 * The doctor's own consultation is another, usually better one — but it only
 * helps if it reaches the model *before* the summary, differential and tests
 * are generated from it. Hence a prompt rather than a control tucked in a tab:
 * it fires once, on first open of a case routed to this doctor, and whichever
 * way it is answered the answer is recorded so it never fires again.
 *
 * "No recording" is a complete answer, not a deferral. A case running on the
 * AI interview alone is normal.
 */
export function ConsultationPrompt({ caseData: c }: { caseData: PatientCase }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'working' | 'error'>('ask');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadAudio = useUploadCaseAudio(c.id);
  const startTranscription = useStartTranscription(c.id);
  const setConsultation = useSetConsultation(c.id);

  // A legacy case carries no `consultation` at all, so its doctor gets asked
  // once too — which is right. A case that's already been resolved doesn't:
  // there is nothing left downstream for a recording to inform.
  const answered = c.consultation?.prompted === true;
  const caseClosed = c.status === 'Completed' || c.status === 'Archived';
  const shouldAsk = !answered && !caseClosed;

  useEffect(() => {
    if (shouldAsk) setOpen(true);
  }, [shouldAsk]);

  useEffect(() => () => stopPolling(), []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  /** Saving the summary is what closes this out, so a transcription that never
   * completes leaves the prompt unanswered rather than silently losing audio. */
  async function saveAndClose(summary: ConsultationSummary, jobName: string, s3Key: string) {
    await setConsultation.mutateAsync({ hasRecording: true, summary, jobName, s3Key });
    setOpen(false);
  }

  function fail(message: string) {
    stopPolling();
    setError(message);
    setPhase('error');
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setPhase('working');
    try {
      const { base64, extension } = await fileToBase64(file);
      const uploaded = await uploadAudio.mutateAsync({
        fileBase64: base64,
        fileExtension: extension,
        contentType: file.type,
      });
      const started = await startTranscription.mutateAsync({ s3Key: uploaded.s3Key });

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.transcriptionStatus(c.id, started.jobName);
          if (status.status === 'COMPLETED') {
            stopPolling();
            await saveAndClose(status.summary ?? {}, started.jobName, uploaded.s3Key);
          } else if (status.status === 'FAILED') {
            fail(status.reason ?? 'Transcription failed.');
          }
        } catch (err) {
          fail((err as Error).message);
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      fail((err as Error).message);
    }
  }

  async function declineRecording() {
    stopPolling();
    try {
      await setConsultation.mutateAsync({ hasRecording: false });
      setOpen(false);
    } catch (err) {
      fail((err as Error).message);
    }
  }

  const busy = phase === 'working';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && setOpen(false)}>
      <DialogContent
        hideClose
        // Dismissing without answering would just re-open on the next visit,
        // so the two buttons are the only way out.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mic className="h-5 w-5" />
          </div>
          <DialogTitle>Do you have a recording of your consultation?</DialogTitle>
          <DialogDescription>
            If you recorded yourself talking to {c.patient.name.split(' ')[0] || 'this patient'}, add
            it now. Aura will transcribe it and reason over it together with the patient's AI
            interview when it builds the summary, the examinations, the tests and the differential.
            Without it, Aura works from the AI interview alone.
          </DialogDescription>
        </DialogHeader>

        {phase === 'working' && (
          <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Transcribing {fileName}… this can take a few minutes. Leave this open.
            </p>
          </div>
        )}

        {phase === 'error' && error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-3 dark:border-rose-500/25 dark:bg-rose-500/10">
            <p className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error} You can try another file, or continue without a recording.
            </p>
          </div>
        )}

        {setConsultation.isSuccess && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Consultation added to the case.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={declineRecording} disabled={busy || setConsultation.isPending}>
            No recording — continue
          </Button>
          <Button asChild disabled={busy}>
            <label className={busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}>
              <Mic className="mr-2 h-4 w-4" />
              {phase === 'error' ? 'Choose another file' : 'Upload recording'}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={onFileChange}
                disabled={busy}
              />
            </label>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
