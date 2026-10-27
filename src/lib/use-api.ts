"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "./api-client";

interface Loaded<T> {
  key: string;
  data: T | null;
  error: ApiRequestError | null;
}

/** Minimal authenticated GET hook. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const key = path ? `${path}#${version}` : null;

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    api<T>(path)
      .then(({ data }) => !cancelled && setLoaded({ key, data, error: null }))
      .catch((e) => !cancelled && setLoaded({ key, data: null, error: e instanceof ApiRequestError ? e : new ApiRequestError(0, "NETWORK", "Request failed.") }));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  const current = loaded?.key === key ? loaded : null;
  return {
    // Keep showing the previous data while a refetch is in flight.
    data: current?.data ?? (loaded?.data && !current ? loaded.data : null),
    error: current?.error ?? null,
    loading: key !== null && !current,
    refetch,
  };
}
