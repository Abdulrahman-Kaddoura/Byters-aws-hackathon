import { Link } from 'wouter';
import { Users, Clock, ArrowRight, ActivitySquare, ShieldAlert, Search } from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { LoadingState, EmptyState } from '@/components/common';
import { currentIdentity } from '@/lib/auth';

export function Dashboard() {
  const { data: cases = [], isLoading, error } = useCaseList();
  const identity = currentIdentity();

  const activeCases = cases.filter((c) => c.status !== 'Completed' && c.status !== 'Archived');
  const needsAttention = activeCases.filter((c) => c.priority === 'High' || c.insights.some((i) => i.kind === 'critical'));
  const completedTotal = cases.filter((c) => c.status === 'Completed').length;

  const displayName = identity?.email ?? identity?.username ?? 'there';

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Welcome back, {displayName}. Here's your current caseload.</p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <ActivitySquare className="mr-2 h-4 w-4" />
            New Case
          </Link>
        </Button>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{(error as Error).message}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCases.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">Across all stages</p>
          </CardContent>
        </Card>

        <Card className="border-amber-300/40 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">Needs Attention</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{needsAttention.length}</div>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/70">High priority or critical alerts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTotal}</div>
            <p className="mt-1 text-xs text-muted-foreground">Signed-off cases on file</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Active Cases</h2>
        {isLoading ? (
          <LoadingState label="Loading cases…" />
        ) : activeCases.length === 0 ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title="No active cases" description="Create a new case to get started." />
        ) : (
          <div className="grid gap-4">
            {activeCases.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`}>
                <Card className="group cursor-pointer transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <PatientAvatar name={c.patient.name} hue={c.patient.avatarHue} size={40} />
                      <div>
                        <h3 className="font-medium transition-colors group-hover:text-primary">{c.patient.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            {c.patient.age}
                            {c.patient.gender[0]}
                          </span>
                          <span>&bull;</span>
                          <span className="max-w-[250px] truncate">{c.chiefComplaint}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-end gap-1">
                        <PriorityBadge priority={c.priority} />
                        <StatusBadge status={c.status} />
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
