"use client";

import { useEffect, useState } from "react";
import type { OutbreakDataset, DiseaseProfile } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";

/**
 * Load the outbreaks dataset from /public/data.
 *
 * In dev (no basePath), fetches `/data/outbreaks.json`.
 * In prod (GitHub Pages), fetches `/vet-heatmap/data/outbreaks.json`.
 *
 * Disease profiles are imported directly (compile-time data) for performance.
 */

const basePath = process.env.NODE_ENV === "production" ? "/vet-heatmap" : "";

interface LoadState {
  data: OutbreakDataset | null;
  loading: boolean;
  error: string | null;
}

export function useOutbreaks(): LoadState & { profiles: DiseaseProfile[]; profilesByKey: Record<string, DiseaseProfile> } {
  const [state, setState] = useState<LoadState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/data/outbreaks.json`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: OutbreakDataset = await res.json();
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (e) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const profilesByKey = Object.fromEntries(DISEASE_PROFILES.map((p) => [p.disease_key, p]));
  return { ...state, profiles: DISEASE_PROFILES, profilesByKey };
}

/** Load the GeoJSON regions layer. */
export function useRegionsGeoJSON() {
  const [state, setState] = useState<{
    geo: GeoJSON.FeatureCollection | null;
    loading: boolean;
    error: string | null;
  }>({ geo: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${basePath}/data/russia_regions.geojson`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geo: GeoJSON.FeatureCollection = await res.json();
        if (!cancelled) setState({ geo, loading: false, error: null });
      } catch (e) {
        if (!cancelled) {
          setState({
            geo: null,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export { basePath };
