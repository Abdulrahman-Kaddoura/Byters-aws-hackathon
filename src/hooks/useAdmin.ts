import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { AppUser, CognitoGroup, PermissionGroup } from '../types';

const usersKey = ['admin-users'] as const;
const groupsKey = ['admin-groups'] as const;
const permissionsKey = ['admin-permissions'] as const;

// --- Reads --------------------------------------------------------------
export function useUserList() {
  return useQuery({ queryKey: usersKey, queryFn: api.adminListUsers });
}

export function useGroupList() {
  return useQuery({ queryKey: groupsKey, queryFn: api.adminListGroups });
}

export function usePermissionCatalog() {
  return useQuery({ queryKey: permissionsKey, queryFn: api.adminListPermissions });
}

// --- Mutations: users -------------------------------------------------------
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { username: string; email: string; name?: string; cognitoGroup: CognitoGroup; customGroups?: string[] }) =>
      api.adminCreateUser(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      sub: string;
      patch: {
        cognitoGroup?: CognitoGroup;
        customGroups?: string[];
        permissionOverrides?: Record<string, boolean>;
        status?: 'active' | 'disabled';
      };
    }) => api.adminUpdateUser(vars.sub, vars.patch),
    onSuccess: (updated: AppUser) => {
      qc.setQueryData<AppUser[]>(usersKey, (prev) => prev?.map((u) => (u.sub === updated.sub ? updated : u)));
      qc.invalidateQueries({ queryKey: usersKey });
    },
  });
}

// --- Mutations: custom permission groups ------------------------------------
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string; permissions?: string[] }) => api.adminCreateGroup(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupsKey }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: { name?: string; description?: string; permissions?: string[] } }) =>
      api.adminUpdateGroup(vars.id, vars.patch),
    onSuccess: (updated: PermissionGroup) => {
      qc.setQueryData<PermissionGroup[]>(groupsKey, (prev) => prev?.map((g) => (g.id === updated.id ? updated : g)));
      qc.invalidateQueries({ queryKey: groupsKey });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.adminDeleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: groupsKey }),
  });
}
