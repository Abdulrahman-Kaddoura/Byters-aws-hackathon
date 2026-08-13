import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type { KnowledgeResource } from '../types';

const resourcesKey = ['resources'] as const;

// --- Reads --------------------------------------------------------------
export function useResourceList() {
  return useQuery({ queryKey: resourcesKey, queryFn: api.listResources });
}

// --- Mutations ------------------------------------------------------------
export function useUploadResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; tags: string[]; fileBase64: string; fileExtension?: string; contentType?: string }) =>
      api.uploadResource(payload),
    onSuccess: (created: KnowledgeResource) => {
      qc.setQueryData<KnowledgeResource[]>(resourcesKey, (prev) => [created, ...(prev ?? [])]);
      qc.invalidateQueries({ queryKey: resourcesKey });
    },
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteResource(id),
    onSuccess: (_result, id) => {
      qc.setQueryData<KnowledgeResource[]>(resourcesKey, (prev) => prev?.filter((r) => r.id !== id));
      qc.invalidateQueries({ queryKey: resourcesKey });
    },
  });
}
