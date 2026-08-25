import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Mic } from 'lucide-react';

import type { CaseDocument, ConsultationSummary, PatientCase } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import {
  useSetConsultation,
  useStartTranscription,
  useUploadCaseAudio,
} from '@/hooks/useCases';

const POLL_INTERVAL_MS = 4000;

/** What AWS HealthScribe can actually ingest. Anything else is rejected by the
 * service minutes after upload, which is a miserable way to find out — so it is
 * caught here, before the file is sent. */
const SUPPORTED_AUDIO_EXTENSIONS = ['flac', 'mp3', 'mp4', 'm4a', 'oga', 'ogg', 'amr', 'webm', 'wav'];

function unsupportedFormatMessage(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return null;
  return (
    `${file.name} isn't a format the transcription service reads. ` +
    `Use one of: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}.`
  );
}

/** The case's consultation recording, if one has been attached. It is a case
 * document like any other — see `CaseDocument.kind`. */
function audioDocument(c: PatientCase): CaseDocument | undefined {
  const audio = (c.documents ?? []).filter((d) => d.kind === 'audio');
  return audio[audio.length - 1];
}

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
 *
 * Transcription runs for minutes, so nothing here is the system of record: the
 * upload lands the recording on the case, and each poll persists whatever
 * HealthScribe has produced server-side. Closing this dialog — or the tab —
 * loses nothing, and re-opening the case picks a running job back up.
 */
export function ConsultationPrompt({ caseData: c }: { caseData: PatientCase }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'working' | 'error'>('ask');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qc = useQueryClient();

  const uploadAudio = useUploadCaseAudio(c.id);
  const startTranscription = useStartTranscription(c.id);
  const setConsultation = useSetConsultation(c.id);

  // A legacy case carries no `consultation` at all, so its doctor gets asked
  // once too — which is right. A case that's already been resolved doesn't:
  // there is nothing left downstream for a recording to inform.
  const answered = c.consultation?.prompted === true;
  const caseClosed = c.status === 'Completed' || c.status === 'Archived';
  const shouldAsk = !answered && !caseClosed;

  const audio = audioDocument(c);
  const runningJob = audio?.status === 'transcribing' ? audio.jobName : undefined;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fail = useCallback((message: string) => {
    stopPolling();
    setError(message);
    setPhase('error');
  }, [stopPolling]);

  /** Saving the summary is what closes this out, so a transcription that never
   * completes leaves the prompt unanswered rather than silently losing audio. */
  const saveAndClose = useCallback(
    async (summary: ConsultationSummary, jobName: string, documentId?: string) => {
      await setConsultation.mutateAsync({ hasRecording: true, summary, jobName, documentId });
      setOpen(false);
    },
    [setConsultation]
  );

  /** Poll one job to completion. Safe to call for a job started in an earlier
   * session: the server holds the state, this only watches it. */
  const pollJob = useCallback(
    (jobName: string, documentId?: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.transcriptionStatus(c.id, jobName);
          // Each poll returns the case with the transcript already folded in,
          // so the documents list and the AI's grounding stay in step.
          if (status.case) qc.setQueryData(['case', c.id], status.case);
          if (status.status === 'COMPLETED') {
            stopPolling();
            await saveAndClose(status.summary ?? {}, jobName, documentId ?? status.documentId);
          } else if (status.status === 'FAILED') {
            fail(status.reason ?? 'Transcription failed.');
          }
        } catch (err) {
          fail((err as Error).message);
        }
      }, POLL_INTERVAL_MS);
    },
    [c.id, fail, qc, saveAndClose, stopPolling]
  );

  useEffect(() => {
    if (shouldAsk) setOpen(true);
  }, [shouldAsk]);

  // A job left running by an earlier visit (or an earlier device) is picked
  // back up rather than abandoned — transcription outlives the dialog.
  useEffect(() => {
    if (!shouldAsk || !runningJob || pollRef.current) return;
    setPhase('working');
    setFileName((current) => current ?? audio?.name ?? 'the recording');
    pollJob(runningJob, audio?.id);
  }, [shouldAsk, runningJob, audio?.id, audio?.name, pollJob]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const unsupported = unsupportedFormatMessage(file);
    if (unsupported) {
      setFileName(file.name);
      fail(unsupported);
      return;
    }

    setFileName(file.name);
    setError(null);
    setPhase('working');
    try {
      const ticket = await uploadAudio.mutateAsync({
        file,
        fileName: file.name,
        fileExtension: file.name.split('.').pop()?.toLowerCase(),
        contentType: file.type,
      });
      const started = await startTranscription.mutateAsync({ documentId: ticket.documentId });
      pollJob(started.jobName, ticket.documentId);
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
              Transcribing {fileName}… this can take a few minutes. It keeps running if you leave —
              the transcript lands on the case either way.
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
                accept={SUPPORTED_AUDIO_EXTENSIONS.map((e) => `.${e}`).join(',')}
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
