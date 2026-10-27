"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "./api-client";

/** Minimal authenticated GET hook. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then(({ data }) => !cancelled && (setData(data), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, "NETWORK", "Request failed.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading, refetch, setData };
}
