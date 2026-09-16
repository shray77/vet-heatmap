"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyFilters, type FilterState } from "@/lib/filters";
import type { Outbreak } from "@/types/domain";
import type { FilterWorkerResponse } from "@/lib/filter-worker";

/**
 * Hook: useWorkerFilter
 *
 * Filters outbreaks in a Web Worker to keep the UI responsive.
 * The dataset is pushed to the worker ONCE (init message); every filter
 * change afterwards only transfers the small FilterState. Falls back to
 * synchronous filtering when Worker is unavailable or while the first
 * response is still in flight.
 *
 * Usage:
 *   const filtered = useWorkerFilter(data?.outbreaks ?? [], debouncedFilters);
 */
export function useWorkerFilter(outbreaks: Outbreak[], filters: FilterState): Outbreak[] {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [filtered, setFiltered] = useState<Outbreak[] | null>(null);
  const [filteredVersion, setFilteredVersion] = useState(-1);
  // Dataset instance currently held by the worker; bumped version lets us
  // drop responses that belong to a stale dataset.
  const datasetRef = useRef<Outbreak[] | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("../lib/filter-worker.ts", import.meta.url), { type: "module" });
    } catch {
      return; // sync fallback below
    }
    setWorker(w);
    return () => {
      // Free the worker thread (it otherwise lives for the lifetime of the tab)
      w!.terminate();
      setWorker(null);
      datasetRef.current = null;
      versionRef.current = 0;
    };
  }, []);

  useEffect(() => {
    if (!worker) return;

    if (outbreaks.length === 0) {
      datasetRef.current = null;
      setFiltered([]);
      return;
    }

    // New dataset instance → push it once before filtering on it
    if (datasetRef.current !== outbreaks) {
      datasetRef.current = outbreaks;
      versionRef.current += 1;
      worker.postMessage({ type: "init", outbreaks, version: versionRef.current });
    }

    let cancelled = false;
    const onMessage = (e: MessageEvent<FilterWorkerResponse>) => {
      if (cancelled) return;
      if (e.data.version === versionRef.current) {
        setFiltered(e.data.result);
        setFilteredVersion(e.data.version);
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "filter", filters, version: versionRef.current });
    return () => {
      cancelled = true;
      worker.removeEventListener("message", onMessage);
    };
  }, [worker, outbreaks, filters]);

  // Synchronous fallback: used while there is no worker, and until the
  // worker's first response for the current dataset+filters arrives.
  const syncFiltered = useMemo(() => applyFilters(outbreaks, filters), [outbreaks, filters]);

  if (!worker) return syncFiltered;
  if (outbreaks.length === 0) return [];

  const workerCaughtUp =
    filtered !== null &&
    filteredVersion === versionRef.current &&
    datasetRef.current === outbreaks;

  return workerCaughtUp ? filtered : syncFiltered;
}
