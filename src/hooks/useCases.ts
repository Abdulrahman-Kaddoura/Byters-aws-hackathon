import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import type { PatientCase } from '../types';

interface Result<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCaseList(): Result<PatientCase[]> {
  const [data, setData] = useState<PatientCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCases()
      .then((cases) => !cancelled && (setData(cases), setError(null)))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/**
 * Mutations return the full updated case, so `apply` lets a page push that
 * straight into state without a second round trip.
 */
export function useCase(id: string | undefined): Result<PatientCase | undefined> & {
  apply: (updated: PatientCase) => void;
} {
  const [data, setData] = useState<PatientCase | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) {
      setData(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getCase(id)
      .then((c) => !cancelled && (setData(c), setError(null)))
      .catch((e) => !cancelled && (setData(undefined), setError(e.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, nonce]);

  return {
    data,
    loading,
    error,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    apply: useCallback((updated: PatientCase) => setData(updated), []),
  };
}
