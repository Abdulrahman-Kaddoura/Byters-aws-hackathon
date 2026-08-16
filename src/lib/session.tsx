import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import * as api from './api';
import type { CognitoGroup, Me } from '../types';

/**
 * The caller's server-verified role and permissions.
 *
 * This replaces reading `cognito:groups` out of the ID token. The two are
 * different axes: the JWT claim carries the coarse Cognito role, while every
 * backend resolver gates on a fine-grained permission key computed from
 * admin-editable groups and per-user overrides. Guarding the UI on the claim
 * meant the client and server could disagree in both directions — screens
 * hidden from users the server would have allowed, and screens shown to users
 * whose every request then 403'd. Asking the server settles it.
 */
interface SessionValue {
  me: Me | null;
  isLoading: boolean;
  error: Error | null;
  /** True only if the backend says this permission is in the caller's set. */
  can: (permission: string) => boolean;
  role: CognitoGroup | null;
  /** This user's private case labels, keyed by case id. */
  caseTags: Record<string, string[]>;
}

const SessionContext = createContext<SessionValue | null>(null);

export const ME_QUERY_KEY = ['me'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: api.me,
    // Roles change rarely and a stale answer here means a wrong-looking menu,
    // so refetch on focus but don't poll.
    staleTime: 5 * 60_000,
  });

  const value: SessionValue = {
    me: data ?? null,
    isLoading,
    error: (error as Error) ?? null,
    // Fails closed: while the answer is in flight, nothing is permitted.
    can: (permission) => data?.permissions.includes(permission) ?? false,
    role: data?.role ?? null,
    caseTags: data?.caseTags ?? {},
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a <SessionProvider>.');
  return ctx;
}

/** Convenience for the common `can('...')` call. */
export function usePermission(permission: string): boolean {
  return useSession().can(permission);
}

// --- Permission keys, mirroring backend/sehati/permissions.py ---------------
export const PERMISSIONS = {
  casesCreate: 'cases.create',
  casesAssign: 'cases.assign',
  casesViewClinical: 'cases.view_clinical',
  casesManageState: 'cases.manage_state',
  casesAddNote: 'cases.add_note',
  examsManage: 'exams.manage',
  diagnosesManage: 'diagnoses.manage',
  finalDiagnosisAccept: 'final_diagnosis.accept',
  testsManage: 'tests.manage',
  assistantChat: 'assistant.chat',
  recommendationsRecord: 'recommendations.record',
  documentsManage: 'documents.manage',
  auditView: 'audit.view',
  usersManage: 'users.manage',
  settingsManage: 'settings.manage',
  resourcesManage: 'resources.manage',
} as const;
