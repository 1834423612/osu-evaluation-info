"use client";
import { useEffect, useState } from "react";
export function useRmpResource<T>(url: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${url}:${attempt}`;
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("RMP unavailable");
        return (await response.json()) as T;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: true });
      });
    return () => controller.abort();
  }, [key, url]);
  return {
    data: state?.key === key ? state.data : null,
    loading: state?.key !== key,
    error: state?.key === key && state.error,
    retry: () => setAttempt((x) => x + 1),
  };
}
