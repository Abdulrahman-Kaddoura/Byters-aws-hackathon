import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Search, ArrowRight } from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { LoadingState, EmptyState } from '@/components/common';
import { timeAgo } from '@/lib/utils';
import type { Priority } from '@/types';

type Sort = 'priority' | 'name';
const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function CasesList() {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<Priority | 'All'>('All');
  const [sort, setSort] = useState<Sort>('priority');
  const { data: cases = [], isLoading, error } = useCaseList();

  const active = useMemo(() => cases.filter((c) => c.status !== 'Completed' && c.status !== 'Archived'), [cases]);

  const filtered = useMemo(() => {
    let list = active.filter((c) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        c.patient.name.toLowerCase().includes(q) ||
        c.chiefComplaint.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchesPriority = priority === 'All' || c.priority === priority;
      return matchesQuery && matchesPriority;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return a.patient.name.localeCompare(b.patient.name);
    });
    return list;
  }, [active, query, priority, sort]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Active Cases</h1>
          <p className="mt-1 text-muted-foreground">{isLoading ? 'Loading cases…' : `${active.length} cases moving through the diagnostic workflow`}</p>
        </div>
        <Button asChild>
          <Link href="/cases/new">New Case</Link>
        </Button>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{(error as Error).message}</p>}

      <Card className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patients, conditions, or IDs…" className="border-none pl-9 shadow-none focus-visible:ring-0" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority | 'All')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All priorities</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort: Priority</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading cases…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-5 w-5" />} title="No cases match your filters" description="Try adjusting the search term or priority filter." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Chief Complaint</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status / Stage</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={c.patient.name} hue={c.patient.avatarHue} size={32} />
                      <div>
                        <div className="font-medium">{c.patient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.patient.age}
                          {c.patient.gender?.[0]} &bull; {c.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-[220px] truncate">{c.chiefComplaint}</span>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={c.priority} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={c.status} />
                      <span className="text-xs capitalize text-muted-foreground">{c.stage} stage</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{timeAgo(c.updatedAt)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="group-hover:text-primary" asChild>
                      <Link href={`/cases/${c.id}`}>
                        Open <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
