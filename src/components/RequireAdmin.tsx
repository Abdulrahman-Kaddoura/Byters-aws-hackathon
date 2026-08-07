import type { ReactNode } from 'react';
import { Redirect } from 'wouter';
import { currentIdentity } from '@/lib/auth';

/** Route guard: only renders children for signed-in users in the "admin" group. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const identity = currentIdentity();
  if (!identity?.groups.includes('admin')) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}
