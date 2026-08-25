import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Mic,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import * as api from '@/lib/api';
import { PERMISSIONS, useSession } from '@/lib/session';
import {
  useCaseDocuments,
  useDeleteCaseDocument,
  useUploadCaseDocument,
} from '@/hooks/useCases';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, LoadingState, SectionHeading } from '@/components/common';
import type { CaseDocument, PatientCase } from '@/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What a consultation recording is doing right now.
 *
 * A recording is only grounding once HealthScribe has come back with its
 * transcript, so the row says which of the two it is rather than looking like
 * any other attachment. */
function audioStatusLabel(doc: CaseDocument): string | null {
  switch (doc.status) {
    case 'pending':
    case 'uploaded':
      return 'Not transcribed yet';
    case 'transcribing':
      return 'Transcribing…';
    case 'transcribed':
      return 'Transcribed — used as AI context';
    case 'failed':
      return `Transcription failed: ${doc.failureReason ?? 'unknown error'}`;
    default:
      return null;
  }
}

/**
 * Everything attached to this case.
 *
 * Nurses attach referral letters and prior records at admission; doctors add
 * reports later. Both can read and download; only clinical staff can delete,
 * so nothing leaves the record on an admissions-desk mistake.
 *
 * Files are fetched through a short-lived presigned URL rather than a raw S3
 * key, and their extracted text stays server-side as AI grounding.
 */
export function CaseDocuments({ caseData }: { caseData: PatientCase }) {
  const { can } = useSession();
  const { data: documents = [], isLoading } = useCaseDocuments(caseData.id);
  const upload = useUploadCaseDocument(caseData.id);
  const remove = useDeleteCaseDocument(caseData.id);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const mayDelete = can(PERMISSIONS.casesViewClinical);

  async function onFile(file: File) {
    try {
      const fileBase64 = await toBase64(file);
      await upload.mutateAsync({
        fileBase64,
        fileName: file.name,
        fileExtension: file.name.split('.').pop()?.toLowerCase() || 'bin',
        contentType: file.type || 'application/octet-stream',
      });
      toast.success(`${file.name} attached.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  async function open(doc: CaseDocument) {
    setBusyId(doc.id);
    try {
      const { url } = await api.getCaseDocument(caseData.id, doc.id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open that document.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(doc: CaseDocument) {
    if (!window.confirm(`Remove "${doc.name}" from this case?`)) return;
    try {
      await remove.mutateAsync(doc.id);
      toast.success(`${doc.name} removed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that document.');
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <SectionHeading
        title="Documents"
        subtitle="Referral letters, prior records, reports, consultation recordings. Everything attached here is also used as grounding for the AI."
        icon={<FileText className="h-4 w-4" />}
        action={
          <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onFile(file);
        }}
      />

      {isLoading ? (
        <LoadingState label="Loading documents…" />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents yet"
          description="Attach a referral letter, prior records, or a report. The AI reads them as context for this case."
        />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {doc.kind === 'audio' ? <Mic className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {doc.uploadedByName} · {timeAgo(doc.uploadedAt)}
                    {doc.size > 0 && ` · ${formatSize(doc.size)}`}
                  </p>
                  {doc.kind === 'audio' && audioStatusLabel(doc) && (
                    <p
                      className={
                        doc.status === 'failed'
                          ? 'mt-0.5 flex items-center gap-1 truncate text-xs text-rose-600 dark:text-rose-400'
                          : 'mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground'
                      }
                    >
                      {doc.status === 'failed' && <AlertTriangle className="h-3 w-3 shrink-0" />}
                      {doc.status === 'transcribing' && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                      {audioStatusLabel(doc)}
                    </p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download ${doc.name}`}
                  disabled={busyId === doc.id}
                  onClick={() => void open(doc)}
                >
                  {busyId === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                {mayDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${doc.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => void onDelete(doc)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** The API takes base64, so strip the `data:...;base64,` prefix the reader adds. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
