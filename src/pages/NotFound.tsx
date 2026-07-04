import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-subtle)] text-muted">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-1.5 text-sm text-secondary">The page you're looking for doesn't exist in this prototype.</p>
      <Link to="/" className="btn btn-primary mt-5">
        Back to dashboard
      </Link>
    </div>
  );
}
