import { useState, useCallback, useEffect } from "react";
import { listCases } from "../api/endpoints.js";

export default function useCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { cases: fetched } = await listCases();
      setCases(fetched || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const updateOne = useCallback((updatedCase) => {
    setCases((prev) => {
      const exists = prev.some((c) => c.id === updatedCase.id);
      return exists ? prev.map((c) => (c.id === updatedCase.id ? updatedCase : c)) : [updatedCase, ...prev];
    });
  }, []);

  return { cases, loading, error, refetch, updateOne };
}
