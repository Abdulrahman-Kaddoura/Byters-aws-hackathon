import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FilePlus2, FolderKanban } from 'lucide-react';

export function Dashboard() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[26px]">Welcome back</h1>
      <p className="mt-1 text-sm text-secondary">What would you like to do?</p>

      <div className="mt-8 grid w-full max-w-2xl gap-5 sm:grid-cols-2">
        <DashboardAction
          to="/intake"
          icon={<FilePlus2 className="h-7 w-7" />}
          title="Create New Case"
          description="Start a new patient intake"
        />
        <DashboardAction
          to="/cases"
          icon={<FolderKanban className="h-7 w-7" />}
          title="Go to Cases"
          description="View and manage active cases"
        />
      </div>
    </div>
  );
}

function DashboardAction({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="card group flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center transition-all hover:-translate-y-0.5 hover:shadow-lift sm:p-10"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/12 dark:text-brand-300">
        {icon}
      </span>
      <span className="text-lg font-semibold">{title}</span>
      <span className="text-sm text-secondary">{description}</span>
      <span className="mt-1 flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-300">
        Continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
