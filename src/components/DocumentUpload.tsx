import { useRef, useState } from 'react';
import { FileText, Upload, CheckCircle2 } from 'lucide-react';
import * as api from '../lib/api';
import { SectionHeading } from './ui';
import type { PatientCase } from '../types';

/** Reads a File as base64 without the leading `data:...;base64,` prefix. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function DocumentUpload({
  caseData,
  onUploaded,
}: {
  caseData: PatientCase;
  onUploaded: (updated: PatientCase) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fileBase64 = await readAsBase64(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const res = await api.uploadCaseDocument(caseData.id, {
        fileBase64,
        fileExtension: ext,
        contentType: file.type || 'application/octet-stream',
      });
      onUploaded(res.case);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="card p-5">
      <SectionHeading
        icon={<FileText className="h-[18px] w-[18px]" />}
        title="Supporting document"
        subtitle="Uploaded PDFs/DOCX are read into context for every AI step"
      />
      <div className="mt-4">
        {caseData.documentContext ? (
          <div className="rounded-lg border bg-[var(--surface-2)] p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Document on file
            </p>
            <p className="mt-2 line-clamp-4 text-[13px] text-secondary">{caseData.documentContext}</p>
          </div>
        ) : (
          <p className="text-[13px] text-muted">No document uploaded for this case yet.</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn btn-outline mt-3 w-full text-sm disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {busy ? 'Uploading…' : caseData.documentContext ? 'Replace document' : 'Upload document'}
        </button>
        {error && <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
