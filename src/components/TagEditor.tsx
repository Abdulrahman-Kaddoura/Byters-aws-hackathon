import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useSetCaseTags } from '@/hooks/useCases';
import { cn } from '@/lib/utils';

/**
 * Private per-doctor labels on a case.
 *
 * Stored on the caller's own user record rather than on the case, so one
 * clinician's shorthand ("waiting on radiology", "teaching case") is never
 * visible to another — there is no payload it could travel in.
 */
export function TagEditor({
  caseId,
  tags,
  className,
}: {
  caseId: string;
  tags: string[];
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const setTags = useSetCaseTags(caseId);

  async function commit(next: string[]) {
    try {
      await setTags.mutateAsync(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save that tag.');
    }
  }

  function add() {
    const value = draft.trim();
    setDraft('');
    setAdding(false);
    if (!value || tags.includes(value)) return;
    void commit([...tags, value]);
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => void commit(tags.filter((t) => t !== tag))}
          className="group/tag inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          title={`Remove "${tag}"`}
        >
          {tag}
          <X className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/tag:opacity-100" />
        </button>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder="Tag name…"
          className="h-6 w-28 rounded-full border bg-background px-2 text-[11px] outline-none focus:border-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={setTags.isPending || tags.length >= 10}
          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Plus className="h-2.5 w-2.5" /> Tag
        </button>
      )}
    </div>
  );
}
