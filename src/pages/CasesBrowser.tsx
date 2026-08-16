import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Tag, UserPlus } from 'lucide-react';

import { useCaseList } from '@/hooks/useCases';
import { PERMISSIONS, useSession } from '@/lib/session';
import { cn, timeAgo } from '@/lib/utils';
import { EmptyState, ErrorNote, LoadingState } from '@/components/common';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { PatientAvatar } from '@/components/PatientAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagEditor } from '@/components/TagEditor';
import { isActive, isCompleted, isNewForDoctor } from '@/pages/CasesHub';
import type { PatientCase } from '@/types';

const PAGE_SIZE = 12;

type SortKey = 'newest' | 'oldest' | 'name';

interface Filter {
  title: string;
  subtitle: string;
  matches: (c: PatientCase, ctx: { sub?: string; tagged: Set<string> }) => boolean;
}

const FILTERS: Record<string, Filter> = {
  new: {
    title: 'New cases',
    subtitle: 'Assigned to you and not yet worked',
    matches: (c) => isNewForDoctor(c),
  },
  active: {
    title: 'Active cases',
    subtitle: 'Everything still in progress',
    matches: (c) => isActive(c),
  },
  completed: {
    title: 'Completed cases',
    subtitle: 'Signed off and retained',
    matches: (c) => isCompleted(c),
  },
  tagged: {
    title: 'Tagged',
    subtitle: 'Cases you have labelled. Only you can see these labels.',
    matches: (c, ctx) => ctx.tagged.has(c.id),
  },
  mine: {
    title: 'My admissions',
    subtitle: 'Patients you admitted',
    matches: (c, ctx) => c.createdByNurseId === ctx.sub,
  },
  unassigned: {
    title: 'Waiting for a doctor',
    subtitle: 'Admitted but not yet routed to anyone',
    matches: (c) => !c.assignedPhysicianId,
  },
  all: {
    title: 'All admissions',
    subtitle: 'Everything on the desk',
    matches: () => true,
  },
};

function CaseCard({ patientCase, tags }: { patientCase: PatientCase; tags: string[] }) {
  const c = patientCase;
  return (
    <Card className="group relative transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <CardContent className="p-5">
        <Link href={`/cases/${c.id}`} className="flex items-start gap-3.5">
          <PatientAvatar name={c.patient.name} hue={c.patient.avatarHue} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight">{c.patient.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {c.patient.age}
              {c.patient.gender?.[0]} · {c.chiefComplaint}
            </p>
          </div>
          <PriorityBadge priority={c.priority} />
        </Link>

        <div className="mt-4 flex items-center justify-between gap-2">
          <StatusBadge status={c.status} />
          <span className="text-xs text-muted-foreground">{timeAgo(c.updatedAt)}</span>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 border-t pt-3">
          <TagEditor caseId={c.id} tags={tags} />
        </div>
      </CardContent>
    </Card>
  );
}

export function CasesBrowser() {
  const params = useParams<{ filter: string }>();
  const filterKey = params.filter ?? 'active';
  const filter = FILTERS[filterKey] ?? FILTERS.active;

  const { me, can, caseTags } = useSession();
  // A nurse's "mine" bucket is the one place a server-side scope helps; every
  // other bucket is a view over the same already-authorized list.
  const { data: cases = [], isLoading, error } = useCaseList(
    filterKey === 'mine' ? { scope: 'mine' } : {}
  );

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const tagged = useMemo(
    () => new Set(Object.keys(caseTags).filter((id) => (caseTags[id] ?? []).length > 0)),
    [caseTags]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(caseTags).forEach((list) => list.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [caseTags]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = cases
      .filter((c) => filter.matches(c, { sub: me?.sub, tagged }))
      .filter((c) => !tagFilter || (caseTags[c.id] ?? []).includes(tagFilter))
      .filter(
        (c) =>
          !q ||
          c.patient.name.toLowerCase().includes(q) ||
          c.chiefComplaint.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      );

    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.patient.name.localeCompare(b.patient.name));
    else
      sorted.sort((a, b) => {
        const cmp = (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        return sort === 'newest' ? cmp : -cmp;
      });
    return sorted;
  }, [cases, filter, me?.sub, tagged, tagFilter, caseTags, query, sort]);

  // Client-side paging: the list is already scoped to this caller and runs to
  // a few hundred rows at most, so a server cursor would be premature.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function reset<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href="/cases"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All cases
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{filter.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{filter.subtitle}</p>
        </div>
        {can(PERMISSIONS.casesCreate) && (
          <Button asChild>
            <Link href="/cases/new">
              <UserPlus className="mr-2 h-4 w-4" /> New patient
            </Link>
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => reset(setQuery)(e.target.value)}
            placeholder="Search by name or complaint…"
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Select value={sort} onValueChange={(v) => reset(setSort)(v as SortKey)}>
          <SelectTrigger className="h-10 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            onClick={() => reset(setTagFilter)(null)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              tagFilter === null ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => reset(setTagFilter)(tagFilter === tag ? null : tag)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                tagFilter === tag ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorNote className="mb-6">{(error as Error).message}</ErrorNote>}

      {isLoading ? (
        <LoadingState label="Loading cases…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            query || tagFilter
              ? 'No cases match your search. Try clearing the filters.'
              : `There are no cases in "${filter.title.toLowerCase()}" right now.`
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => (
              <CaseCard key={c.id} patientCase={c} tags={caseTags[c.id] ?? []} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} case{rows.length === 1 ? '' : 's'}
              {pageCount > 1 && ` · page ${safePage + 1} of ${pageCount}`}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
