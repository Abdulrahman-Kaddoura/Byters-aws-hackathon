import { useEffect, useRef, useState } from 'react';
import { FileUp, Mic, MessageSquarePlus, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SectionHeading } from '@/components/common';
import { fileToBase64 } from '@/lib/utils';
import * as api from '@/lib/api';
import {
  useUploadCaseDocument,
  useUploadCaseAudio,
  useStartTranscription,
  useSubmitFeedback,
} from '@/hooks/useCases';
import type { TranscriptionStatus } from '@/lib/api';

// ---------------------------------------------------------------------------
export function DocumentUploadCard({ caseId }: { caseId: string }) {
  const upload = useUploadCaseDocument(caseId);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    const { base64, extension } = await fileToBase64(file);
    upload.mutate({ fileBase64: base64, fileExtension: extension, contentType: file.type });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <SectionHeading icon={<FileUp className="h-[18px] w-[18px]" />} title="Upload document" subtitle="PDF or DOCX — added as context for every AI step" />
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary">
            <FileUp className="h-4 w-4" />
            {fileName ?? 'Choose a file…'}
            <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onFileChange} disabled={upload.isPending} />
          </label>
          {upload.isPending && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </p>
          )}
          {upload.isSuccess && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded — added to case context.
            </p>
          )}
          {upload.isError && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {(upload.error as Error).message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 4000;

export function AudioTranscriptionCard({ caseId }: { caseId: string }) {
  const uploadAudio = useUploadCaseAudio(caseId);
  const startTranscription = useStartTranscription(caseId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [jobName, setJobName] = useState<string | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(job: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.transcriptionStatus(caseId, job);
        setStatus(result);
        if (result.status === 'COMPLETED' || result.status === 'FAILED') stopPolling();
      } catch (err) {
        setPollError((err as Error).message);
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setStatus(null);
    setPollError(null);
    stopPolling();

    const { base64, extension } = await fileToBase64(file);
    const uploaded = await uploadAudio.mutateAsync({ fileBase64: base64, fileExtension: extension, contentType: file.type });
    const started = await startTranscription.mutateAsync({ s3Key: uploaded.s3Key });
    setJobName(started.jobName);
    setStatus({ status: 'IN_PROGRESS' });
    startPolling(started.jobName);
  }

  const busy = uploadAudio.isPending || startTranscription.isPending;

  return (
    <Card>
      <CardContent className="p-5">
        <SectionHeading icon={<Mic className="h-[18px] w-[18px]" />} title="Audio transcription" subtitle="Upload a recording — AWS HealthScribe produces a clinical summary" />
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary">
            <Mic className="h-4 w-4" />
            {fileName ?? 'Choose an audio file…'}
            <input type="file" accept="audio/*" className="hidden" onChange={onFileChange} disabled={busy || status?.status === 'IN_PROGRESS'} />
          </label>

          {busy && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading & starting transcription…
            </p>
          )}
          {!busy && status?.status === 'IN_PROGRESS' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing{jobName ? ` (job ${jobName})` : ''}… this can take a few minutes.
            </p>
          )}
          {status?.status === 'FAILED' && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {status.reason ?? 'Transcription failed.'}
            </p>
          )}
          {pollError && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {pollError}
            </p>
          )}
          {(uploadAudio.isError || startTranscription.isError) && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {((uploadAudio.error ?? startTranscription.error) as Error).message}
            </p>
          )}

          {status?.status === 'COMPLETED' && status.summary && (
            <div className="space-y-2.5 rounded-lg border bg-muted/30 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Clinical summary
              </p>
              {status.summary.chief_complaint && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chief complaint</p>
                  <p className="text-sm text-muted-foreground">{status.summary.chief_complaint}</p>
                </div>
              )}
              {status.summary.history_of_present_illness && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">History of present illness</p>
                  <p className="text-sm text-muted-foreground">{status.summary.history_of_present_illness}</p>
                </div>
              )}
              {status.summary.review_of_systems && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Review of systems</p>
                  <p className="text-sm text-muted-foreground">{status.summary.review_of_systems}</p>
                </div>
              )}
              {status.summary.past_medical_history && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Past medical history</p>
                  <p className="text-sm text-muted-foreground">{status.summary.past_medical_history}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
const FEEDBACK_CATEGORIES = ['general', 'diagnosis', 'summary', 'transcription', 'other'] as const;

export function FeedbackCard({ caseId }: { caseId: string }) {
  const submit = useSubmitFeedback(caseId);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<(typeof FEEDBACK_CATEGORIES)[number]>('general');

  function onSubmit() {
    if (!text.trim()) return;
    submit.mutate(
      { feedback: text.trim(), category },
      { onSuccess: () => setText('') }
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <SectionHeading icon={<MessageSquarePlus className="h-[18px] w-[18px]" />} title="Feedback" subtitle="Tell us what the AI got right or wrong on this case" />
        <div className="mt-4 space-y-3">
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="What worked, what didn't, what would you change…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <Button size="sm" onClick={onSubmit} disabled={!text.trim() || submit.isPending}>
            {submit.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Submit feedback
          </Button>
          {submit.isSuccess && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Thanks — feedback recorded.
            </p>
          )}
          {submit.isError && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {(submit.error as Error).message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
