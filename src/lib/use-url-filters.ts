import { useState, useEffect } from "react";
import {
  DEFAULT_FILTERS,
  FilterState,
  filtersToParams,
  paramsToFilters,
} from "./filters";

// Viewport keys are owned by the map component (written directly via
// history.replaceState on moveend, without touching React state — a pan
// must not re-render the app). Filter writes must preserve them so that
// toggling a filter doesn't rewind the viewport to the initial-link position.
const MAP_KEYS = ["lat", "lng", "z"] as const;

export function useUrlFilters() {
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    const params = new URLSearchParams(window.location.search);
    return paramsToFilters(params);
  });

  useEffect(() => {
    const params = filtersToParams(filters);
    const current = new URLSearchParams(window.location.search);
    for (const k of MAP_KEYS) {
      const v = current.get(k);
      if (v != null) params.set(k, v);
    }
    const basePath = process.env.NODE_ENV === "production" ? "/vet-heatmap" : "";
    const url = params.toString()
      ? `${basePath}/?${params.toString()}`
      : `${basePath}/`;

    // Use history.replaceState to avoid Next.js router issues in static export
    window.history.replaceState(null, "", url);
  }, [filters]);

  return [filters, setFilters] as const;
}
