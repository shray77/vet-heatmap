/**
 * Web Worker for outbreak filtering.
 *
 * Protocol:
 *   { type: "init", outbreaks, version }  — push the full dataset once
 *   { type: "filter", filters, version }  — cheap filter-only messages after
 *
 * The dataset (~2.5k records) is transferred ONCE instead of on every
 * keystroke; filter changes then only move a small FilterState over the
 * boundary. Responses carry the dataset version so stale replies after a
 * dataset swap are dropped.
 *
 * Usage in page.tsx:
 *   const worker = new Worker(new URL("../lib/filter-worker.ts", import.meta.url), { type: "module" });
 *   const filtered = useWorkerFilter(worker, data?.outbreaks ?? [], debouncedFilters);
 */

import type { Outbreak } from "@/types/domain";
import { applyFilters, type FilterState } from "@/lib/filters";

export type FilterWorkerMessage =
  | { type: "init"; outbreaks: Outbreak[]; version: number }
  | { type: "filter"; filters: FilterState; version: number };

export interface FilterWorkerResponse {
  result: Outbreak[];
  version: number;
}

let dataset: Outbreak[] = [];
let datasetVersion = -1;

self.onmessage = (e: MessageEvent<FilterWorkerMessage>) => {
  const msg = e.data;
  if (msg.type === "init") {
    dataset = msg.outbreaks;
    datasetVersion = msg.version;
    return;
  }
  if (msg.type === "filter") {
    // Stale dataset version — an init for the new dataset is queued ahead
    // of this message; the worker loop is sequential, so this cannot happen
    // in practice, but guard anyway.
    if (msg.version !== datasetVersion) return;
    const result = applyFilters(dataset, msg.filters);
    (self as unknown as Worker).postMessage({
      result,
      version: msg.version,
    } satisfies FilterWorkerResponse);
  }
};
