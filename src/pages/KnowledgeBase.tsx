import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Search, BookOpen, FileUp, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { useResourceList, useUploadResource, useDeleteResource } from '@/hooks/useResources';
import { PERMISSIONS, useSession } from '@/lib/session';
import { fileToBase64 } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, SectionHeading } from '@/components/common';
import { ReferenceCard, SimilarCaseCard } from '@/components/Evidence';
import type { Reference, SimilarCase } from '@/types';


function ReferenceLibrary() {
  const isClinician = useSession().can(PERMISSIONS.resourcesManage);
  const { data: resources = [], isLoading } = useResourceList();
  const upload = useUploadResource();
  const del = useDeleteResource();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  if (!isClinician) return null;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !title.trim()) return;
    setFileName(file.name);
    const { base64, extension } = await fileToBase64(file);
    upload.mutate(
      {
        title: title.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        fileBase64: base64,
        fileExtension: extension,
        contentType: file.type,
      },
      { onSuccess: () => { setTitle(''); setTags(''); setFileName(null); } }
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <SectionHeading
          icon={<FileUp className="h-[18px] w-[18px]" />}
          title="Reference library"
          subtitle="Upload guideline/reference documents (e.g. a diabetes guideline, tagged “diabetes”) — Sehati AI pulls in matching ones as grounding evidence whenever a case's chief complaint or a doctor's question overlaps their tags."
        />

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <Input placeholder="Title, e.g. Type 2 Diabetes Guideline" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Tags, comma-separated, e.g. diabetes, endocrine" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <label
          className={`mt-2.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary ${!title.trim() ? 'pointer-events-none opacity-50' : ''}`}
        >
          <FileUp className="h-4 w-4" />
          {fileName ?? (title.trim() ? 'Choose a file…' : 'Enter a title first')}
          <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={onFileChange} disabled={upload.isPending || !title.trim()} />
        </label>
        {upload.isPending && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </p>
        )}
        {upload.isError && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {(upload.error as Error).message}
          </p>
        )}

        <div className="mt-5 space-y-2">
          {isLoading ? (
            <LoadingState label="Loading library…" />
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reference documents uploaded yet.</p>
          ) : (
            resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {r.tags.map((t) => (
                      <Badge key={t} variant="brand" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                    <span className="text-[11px] text-muted-foreground">
                      uploaded by {r.uploadedByUsername}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-rose-600"
                  onClick={() => del.mutate(r.id)}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const { data: cases = [], isLoading } = useCaseList();

  const { references, similarCases } = useMemo(() => {
    const refs: { ref: Reference; caseId: string; dxName: string }[] = [];
    const sims: { sim: SimilarCase; caseId: string; dxName: string }[] = [];
    for (const c of cases) {
      for (const dx of c.diagnoses) {
        for (const r of dx.references) refs.push({ ref: r, caseId: c.id, dxName: dx.name });
        for (const s of dx.similarCases) sims.push({ sim: s, caseId: c.id, dxName: dx.name });
      }
    }
    return { references: refs, similarCases: sims };
  }, [cases]);

  const q = query.trim().toLowerCase();
  const filteredRefs = q ? references.filter((r) => r.ref.title.toLowerCase().includes(q) || r.ref.source.toLowerCase().includes(q) || r.dxName.toLowerCase().includes(q)) : references;
  const filteredSims = q ? similarCases.filter((s) => s.sim.title.toLowerCase().includes(q) || s.dxName.toLowerCase().includes(q)) : similarCases;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="mt-1 text-muted-foreground">The clinical evidence Sehati AI has cited across your cases — guidelines, papers, textbooks and similar historical cases.</p>
      </div>

      <ReferenceLibrary />

      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search references, sources or diagnoses…" className="rounded-xl border-2 py-6 pl-10 text-lg shadow-sm" />
      </div>

      {isLoading ? (
        <LoadingState label="Loading evidence…" />
      ) : filteredRefs.length === 0 && filteredSims.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No evidence yet"
          description="References appear here automatically once Sehati AI generates a differential diagnosis on one of your cases."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">References ({filteredRefs.length})</h2>
            {filteredRefs.map((r, i) => (
              <div key={i}>
                <ReferenceCard reference={r.ref} />
                <Link href={`/cases/${r.caseId}`} className="mt-1 block text-xs text-primary hover:underline">
                  Cited for {r.dxName} · {r.caseId}
                </Link>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Similar cases ({filteredSims.length})</h2>
            {filteredSims.map((s, i) => (
              <div key={i}>
                <SimilarCaseCard item={s.sim} />
                <Link href={`/cases/${s.caseId}`} className="mt-1 block text-xs text-primary hover:underline">
                  Compared against {s.dxName} · {s.caseId}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
