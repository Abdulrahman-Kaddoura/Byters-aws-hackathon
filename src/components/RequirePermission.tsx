import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'wouter';

import { LoadingState } from '@/components/common';
import { useSession } from '@/lib/session';

/**
 * Route guard gated on a server-verified permission.
 *
 * Replaces the old `RequireAdmin`, which checked the ID token's
 * `cognito:groups` claim for "admin" while the backend checked the
 * `users.manage` permission — two different things, so the guard could both
 * hide the panel from users the server allowed and show it to users whose
 * every request would 403.
 *
 * It also says no out loud. The old guard bounced silently to /dashboard,
 * which is indistinguishable from a broken link.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { can, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingState label="Checking your access…" />
      </div>
    );
  }

  if (!can(permission)) return <Forbidden />;
  return <>{children}</>;
}

function Forbidden() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">You don't have access to this page</h1>
        <p className="text-sm text-muted-foreground">
          Your account doesn't have the permissions this section needs. If you think that's wrong,
          ask an administrator to review your account.
        </p>
      </div>
      <Link
        href="/cases"
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
      >
        Back to cases
      </Link>
    </div>
  );
}
