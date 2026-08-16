import { Link } from 'wouter';
import {
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Sparkles,
  Tag,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import { useCaseList } from '@/hooks/useCases';
import { PERMISSIONS, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { ErrorNote } from '@/components/common';
import type { PatientCase } from '@/types';

/**
 * The one page behind the app's single nav entry.
 *
 * Deliberately almost empty: a handful of large targets, a count on each, and
 * nothing to read. Everything that used to be spread across a dashboard, an
 * active-cases page and a completed-cases page is one click from here.
 */
interface Destination {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  count?: number;
  tone?: 'primary' | 'default';
}

function DestinationCard({ destination }: { destination: Destination }) {
  const Icon = destination.icon;
  const primary = destination.tone === 'primary';

  return (
    <Link
      href={destination.to}
      className={cn(
        'group flex min-h-[168px] flex-col justify-between rounded-2xl border p-6 text-left transition-all',
        'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        primary
          ? 'border-primary bg-primary text-primary-foreground shadow-md hover:bg-primary/95'
          : 'bg-card hover:border-primary/40'
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          primary ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="h-6 w-6" />
      </span>

      <span className="mt-6 block">
        <span className="flex items-baseline gap-2.5">
          <span className="text-lg font-semibold tracking-tight">{destination.label}</span>
          {destination.count != null && destination.count > 0 && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                primary ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary'
              )}
            >
              {destination.count}
            </span>
          )}
        </span>
        <span
          className={cn(
            'mt-1 block text-sm',
            primary ? 'text-primary-foreground/75' : 'text-muted-foreground'
          )}
        >
          {destination.hint}
        </span>
      </span>
    </Link>
  );
}

/** A case a doctor has been given but hasn't opened into the workflow yet. */
export function isNewForDoctor(c: PatientCase): boolean {
  return c.status === 'Doctor Review' || c.status === 'AI Interview' || c.status === 'New';
}

export function isActive(c: PatientCase): boolean {
  return c.status !== 'Completed' && c.status !== 'Archived';
}

export function isCompleted(c: PatientCase): boolean {
  return c.status === 'Completed' || c.status === 'Archived';
}

export function CasesHub() {
  const { role, can, caseTags, me } = useSession();
  const { data: cases = [], isLoading, error } = useCaseList();

  const isNurse = role === 'nurse' && !can(PERMISSIONS.casesViewClinical);
  const firstName = (me?.name || me?.username || '').split(' ')[0];

  const taggedCount = cases.filter((c) => (caseTags[c.id] ?? []).length > 0).length;
  const mine = cases.filter((c) => c.createdByNurseId === me?.sub);

  const destinations: Destination[] = isNurse
    ? [
        {
          to: '/cases/new',
          label: 'New patient',
          hint: 'Admit a patient and record their details',
          icon: UserPlus,
          tone: 'primary',
        },
        {
          to: '/cases/list/mine',
          label: 'My admissions',
          hint: 'Patients you admitted',
          icon: ClipboardList,
          count: mine.length,
        },
        {
          to: '/cases/list/unassigned',
          label: 'Waiting for a doctor',
          hint: 'Admitted but not yet routed',
          icon: Sparkles,
          count: cases.filter((c) => !c.assignedPhysicianId).length,
        },
        {
          to: '/cases/list/all',
          label: 'All admissions',
          hint: 'Everything on the desk',
          icon: FolderKanban,
          count: cases.length,
        },
      ]
    : [
        {
          to: '/cases/list/new',
          label: 'New cases',
          hint: 'Assigned to you, not yet worked',
          icon: Sparkles,
          count: cases.filter(isNewForDoctor).length,
          tone: 'primary',
        },
        {
          to: '/cases/list/active',
          label: 'Active cases',
          hint: 'In progress',
          icon: FolderKanban,
          count: cases.filter(isActive).length,
        },
        {
          to: '/cases/list/completed',
          label: 'Completed cases',
          hint: 'Signed off',
          icon: CheckCircle2,
          count: cases.filter(isCompleted).length,
        },
        {
          to: '/cases/list/tagged',
          label: 'Tagged',
          hint: 'Your private labels',
          icon: Tag,
          count: taggedCount,
        },
      ];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {firstName ? `Hello, ${firstName}` : 'Cases'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isNurse ? 'Admit a patient or pick up where you left off.' : 'Pick up where you left off.'}
        </p>
      </div>

      {error && <ErrorNote className="mb-6">{(error as Error).message}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-2">
        {destinations.map((destination) => (
          <DestinationCard key={destination.to} destination={destination} />
        ))}
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading your cases…</p>
      )}
    </div>
  );
}
