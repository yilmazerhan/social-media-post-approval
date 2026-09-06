"use client";

import { useEffect, useState } from "react";
import { ApiError, getJson } from "@/lib/api-client";

/** Shared fetch-on-mount/on-filter-change pattern every report card uses. */
export function useReportData<T>(path: string, queryString: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getJson<T>(`/api/v1/reports/${path}?${queryString}`);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetches only when the query string (i.e. applied filters) changes.
  }, [path, queryString]);

  return { data, error, loading, reload: load };
}
