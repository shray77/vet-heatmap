"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { Map as MLMap, Popup, Marker, LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";

import type { Outbreak, OutbreakDataset, DiseaseProfile } from "@/types/domain";
import { diseaseColor } from "@/lib/colors";
import { DISEASE_PROFILES_BY_KEY } from "@/data/disease-profiles";
import { REGION_PROPERTIES } from "@/data/regions";
import { speciesRu, sourceRu } from "@/lib/i18n-species";

const basePath = process.env.NODE_ENV === "production" ? "/vet-heatmap" : "";

// Russia bounds: [[west, south], [east, north]]
const RUSSIA_BOUNDS: LngLatBoundsLike = [[19, 41], [180, 82]];

interface OutbreakMapProps {
  outbreaks: Outbreak[];
  geo: GeoJSON.FeatureCollection | null;
  /** Show risk-zone circles around ongoing outbreaks (3/10/30 km). */
  showRiskZones: boolean;
  /** Show choropleth (density) layer. */
  showChoropleth: boolean;
  /** Show livestock density heatmap (pigs/cattle/poultry per km²). */
  densityLayer: "none" | "pigs" | "cattle" | "poultry";
  /** Show outbreak heatmap (replaces markers with density heatmap). */
  showHeatmap?: boolean;
  /** Called when user clicks an outbreak marker. */
  onSelectOutbreak?: (o: Outbreak) => void;
  /** Called when user clicks a region. */
  onSelectRegion?: (region: string) => void;
}

export function OutbreakMap({
  outbreaks,
  geo,
  showRiskZones,
  showChoropleth,
  densityLayer,
  showHeatmap = false,
  onSelectOutbreak,
  onSelectRegion,
}: OutbreakMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const popupsRef = useRef<Record<string, Popup>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(false);

  // ─── Init map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const isDark = resolvedTheme === "dark";

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          "osm-light": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          },
          "osm-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: '&copy; OSM &copy; CARTO',
          },
          "satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "&copy; Esri",
          },
        },
        layers: [
          {
            id: "background-tiles",
            type: "raster",
            source: isDark ? "osm-dark" : "osm-light",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [55, 60], // geographic center of Russia-ish
      zoom: 2.5,
      minZoom: 2,
      maxZoom: 12,
      maxBounds: RUSSIA_BOUNDS,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      setReady(true);
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    mapRef.current = map;

    // Resize observer — handles mobile URL bar show/hide + viewport changes
    if (mapContainer.current && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        mapRef.current?.resize();
      });
      ro.observe(mapContainer.current);
      // Store for cleanup
      resizeObserverRef.current = ro;
    }

    // Also resize on window resize (mobile URL bar toggle, orientation change)
    const onWindowResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onWindowResize);

    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      resizeObserverRef.current?.disconnect();
      // cleanup markers
      Object.values(markersRef.current).forEach((m) => m.remove());
      Object.values(popupsRef.current).forEach((p) => p.remove());
      markersRef.current = {};
      popupsRef.current = {};
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []); // init once

  // ─── Switch base layer on theme change ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const isDark = resolvedTheme === "dark";
    if (map.getLayer("background-tiles")) {
      map.removeLayer("background-tiles");
    }
    map.addLayer(
      {
        id: "background-tiles",
        type: "raster",
        source: isDark ? "osm-dark" : "osm-light",
        minzoom: 0,
        maxzoom: 19,
      },
      // insert before any other layers if they exist
      map.getStyle().layers.find((l) => l.id.startsWith("choropleth") || l.id.startsWith("risk") || l.id.startsWith("outbreak"))?.id,
    );
  }, [resolvedTheme, ready]);

  // ─── Choropleth layer ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !geo) return;

    // Add source if missing
    if (!map.getSource("regions")) {
      map.addSource("regions", { type: "geojson", data: geo, promoteId: "shapeName" });
    } else {
      (map.getSource("regions") as maplibregl.GeoJSONSource).setData(geo);
    }

    // Compute outbreak density per region
    const density = new Map<string, number>();
    for (const o of outbreaks) {
      if (!o.region_geo) continue;
      density.set(o.region_geo, (density.get(o.region_geo) ?? 0) + 1);
    }
    const maxCount = Math.max(1, ...density.values());

    // Color stops (YlOrRd-ish)
    const stops: [number, string][] = [
      [0, "#ffffff00"],
      [1 / maxCount, "#fff5eb"],
      [Math.max(0.25, 1 / maxCount), "#fd8d3c"],
      [Math.max(0.5, 1 / maxCount), "#e6550d"],
      [1, "#a63603"],
    ];

    if (map.getLayer("choropleth-fill")) {
      map.removeLayer("choropleth-fill");
    }
    if (map.getLayer("choropleth-line")) {
      map.removeLayer("choropleth-line");
    }
    if (map.getLayer("choropleth-hover")) {
      map.removeLayer("choropleth-hover");
    }

    if (showChoropleth) {
      map.addLayer({
        id: "choropleth-fill",
        type: "fill",
        source: "regions",
        layout: {},
        paint: {
          "fill-color": {
            property: "shapeName",
            type: "interval",
            stops: stops.map(([t, c]) => [t * maxCount, c]),
            default: "#ffffff00",
          },
          "fill-opacity": 0.55,
        },
      });
      map.addLayer({
        id: "choropleth-line",
        type: "line",
        source: "regions",
        layout: {},
        paint: {
          "line-color": resolvedTheme === "dark" ? "#555" : "#888",
          "line-width": 0.5,
          "line-opacity": 0.4,
        },
      });
      // Hover highlight
      map.addLayer({
        id: "choropleth-hover",
        type: "line",
        source: "regions",
        layout: {},
        paint: {
          "line-color": "#1B5E20",
          "line-width": 2,
          "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0],
        },
      });
    }

    // Region click → callback
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const name = (f.properties as { shapeName: string }).shapeName;
      onSelectRegion?.(name);
    };
    map.on("click", "choropleth-fill", onClick);
    map.on("click", "choropleth-line", onClick);

    return () => {
      map.off("click", "choropleth-fill", onClick);
      map.off("click", "choropleth-line", onClick);
    };
  }, [geo, outbreaks, showChoropleth, ready, resolvedTheme, onSelectRegion]);

  // ─── Outbreak markers ──────────────────────────────────────────────
  // Use MapLibre circle layers for performance (HTML markers lag on mobile).
  // Only use HTML markers for desktop (hover-capable devices) where popups are better.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!geo) return;

    // Detect mobile (no hover, coarse pointer)
    const isMobile = window.matchMedia("(hover: none), (pointer: coarse)").matches;

    // Remove old HTML markers if any
    Object.values(markersRef.current).forEach((m) => m.remove());
    Object.values(popupsRef.current).forEach((p) => p.remove());
    markersRef.current = {};
    popupsRef.current = {};

    // Remove old circle layers if switching from mobile to desktop or vice versa
    const layers = map.getStyle()?.layers ?? [];
    for (const l of layers) {
      if (l.id === "outbreaks-circle" || l.id === "outbreaks-circle-active") {
        map.removeLayer(l.id);
      }
    }
    if (map.getSource("outbreaks-points")) {
      map.removeSource("outbreaks-points");
    }

    if (outbreaks.length === 0) return;

    // Compute centroids
    const centroids = new Map<string, [number, number]>();
    for (const f of geo.features) {
      const name = (f.properties as { shapeName: string }).shapeName;
      if (!name) continue;
      const bbox = computeBBox(f.geometry);
      if (bbox) centroids.set(name, [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]);
    }

    // Build GeoJSON points for all outbreaks
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const o of outbreaks) {
      let lngLat: [number, number] | null = null;
      if (typeof o.lon === "number" && typeof o.lat === "number"
          && Number.isFinite(o.lon) && Number.isFinite(o.lat)
          && !(o.lon === 0 && o.lat === 0)) {
        lngLat = [o.lon, o.lat];
      } else if (o.region_geo) {
        const c = centroids.get(o.region_geo);
        if (c && Number.isFinite(c[0]) && Number.isFinite(c[1]) && c[0] !== 0) {
          lngLat = c;
        }
      }
      if (!lngLat) continue;

      const color = diseaseColor(o.disease_key, o.disease_group);
      const isOngoing = o.status === "Ongoing";
      const size = 8 + Math.min(Math.sqrt(o.cases || 1) / 2, 18);

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: lngLat },
        properties: {
          id: o.id,
          disease: o.disease,
          disease_key: o.disease_key,
          region: o.region,
          date: o.date,
          status: o.status,
          cases: o.cases,
          deaths: o.deaths,
          species: o.species,
          color,
          isOngoing,
          size,
        },
      });
    }

    if (features.length === 0) return;

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

    if (isMobile) {
      // ─── Mobile: use native MapLibre circle layers (fast!) ────────
      map.addSource("outbreaks-points", { type: "geojson", data: geojson });

      // Resolved outbreaks (smaller, dimmer)
      map.addLayer({
        id: "outbreaks-circle",
        type: "circle",
        source: "outbreaks-points",
        filter: ["!", ["get", "isOngoing"]],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "size"], 0, 4, 30, 12],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-opacity": 0.9,
        },
      });

      // Ongoing outbreaks (bigger, brighter)
      map.addLayer({
        id: "outbreaks-circle-active",
        type: "circle",
        source: "outbreaks-points",
        filter: ["get", "isOngoing"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "size"], 0, 6, 30, 16],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 1,
        },
      });

      // Popup on tap
      const popup = new Popup({ closeButton: true, maxWidth: "300px" });
      const onMobileClick = (e: maplibregl.MapMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, unknown>;
        const html = buildPopupHTML({
          id: p.id as number,
          disease: p.disease as string,
          region: p.region as string,
          date: p.date as string,
          status: p.status as Outbreak["status"],
          cases: p.cases as number,
          deaths: p.deaths as number,
          species: p.species as string,
          disease_key: p.disease_key as Outbreak["disease_key"],
          disease_group: "Multi-species" as Outbreak["disease_group"],
          region_geo: "",
          source: "fsvps" as Outbreak["source"],
          notes: "",
        } as Outbreak);
        popup.setHTML(html).setLngLat(e.lngLat).addTo(map);
      };
      map.on("click", "outbreaks-circle", onMobileClick);
      map.on("click", "outbreaks-circle-active", onMobileClick);

      return () => {
        map.off("click", "outbreaks-circle", onMobileClick);
        map.off("click", "outbreaks-circle-active", onMobileClick);
        popup.remove();
      };
    }

    // ─── Desktop: use HTML markers (better popup UX) ──────────────
    for (const o of outbreaks) {
      const color = diseaseColor(o.disease_key, o.disease_group);
      const isOngoing = o.status === "Ongoing";

      // Use precise coords if available, else region centroid
      let lngLat: [number, number] | null = null;
      if (typeof o.lon === "number" && typeof o.lat === "number"
          && Number.isFinite(o.lon) && Number.isFinite(o.lat)
          && !(o.lon === 0 && o.lat === 0)) {
        lngLat = [o.lon, o.lat];
      } else if (o.region_geo) {
        const c = centroids.get(o.region_geo);
        // Guard against invalid centroids (anti-meridian wraparound → lng=0)
        if (c && Number.isFinite(c[0]) && Number.isFinite(c[1]) && c[0] !== 0) {
          lngLat = c;
        }
      }
      if (!lngLat) continue;

      // Build HTML element
      const el = document.createElement("div");
      el.className = `outbreak-marker${isOngoing ? " outbreak-marker--active" : ""}`;
      el.style.cssText = `
        width: ${8 + Math.min(Math.sqrt(o.cases) / 2, 18)}px;
        height: ${8 + Math.min(Math.sqrt(o.cases) / 2, 18)}px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid ${isOngoing ? "#fff" : color};
        box-shadow: 0 0 0 ${isOngoing ? "2px" : "1px"} ${color}88;
        cursor: pointer;
        --ripple-color: ${color}99;
        ${isOngoing ? "" : ""}
      `;

      const popup = new Popup({ offset: 14, closeButton: true, maxWidth: "320px" }).setHTML(
        buildPopupHTML(o),
      );
      popupsRef.current[o.id] = popup;

      const marker = new Marker({ element: el }).setLngLat(lngLat).setPopup(popup).addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectOutbreak?.(o);
      });
      markersRef.current[o.id] = marker;
    }

    return () => {
      Object.values(markersRef.current).forEach((m) => m.remove());
      Object.values(popupsRef.current).forEach((p) => p.remove());
      markersRef.current = {};
      popupsRef.current = {};
    };
  }, [outbreaks, geo, ready, onSelectOutbreak]);

  // ─── Risk zones (3/10/30 km circles around ongoing outbreaks) ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove existing risk zone layers
    const layers = map.getStyle()?.layers ?? [];
    for (const l of layers) {
      if (l.id.startsWith("risk-zone-")) {
        map.removeLayer(l.id);
      }
    }
    if (map.getSource("risk-zones")) {
      map.removeSource("risk-zones");
    }

    if (!showRiskZones) return;

    // Build circles for ongoing outbreaks
    const ongoing = outbreaks.filter((o) => o.status === "Ongoing");
    if (ongoing.length === 0) return;

    const features: GeoJSON.Feature[] = [];
    for (const o of ongoing) {
      const center = getOutbreakCenter(o, geo);
      if (!center) continue;
      const profile = DISEASE_PROFILES_BY_KEY[o.disease_key];
      const zones = profile
        ? [
            { radius: profile.protection_zone_km, color: "#D32F2F", opacity: 0.3, label: "protection" },
            { radius: profile.surveillance_zone_km, color: "#F57C00", opacity: 0.2, label: "surveillance" },
            { radius: profile.restriction_zone_km, color: "#1565C0", opacity: 0.1, label: "restriction" },
          ]
        : [
            { radius: 3, color: "#D32F2F", opacity: 0.3, label: "protection" },
            { radius: 10, color: "#F57C00", opacity: 0.2, label: "surveillance" },
            { radius: 30, color: "#1565C0", opacity: 0.1, label: "restriction" },
          ];

      for (const z of zones) {
        features.push({
          type: "Feature",
          properties: { outbreak_id: o.id, label: z.label, color: z.color, opacity: z.opacity },
          geometry: {
            type: "Polygon",
            coordinates: [makeCircle(center, z.radius)],
          },
        });
      }
    }

    map.addSource("risk-zones", { type: "geojson", data: { type: "FeatureCollection", features } });

    // Three layers, drawn in order: restriction (biggest) -> surveillance -> protection (smallest, on top)
    const layerOrder = ["restriction", "surveillance", "protection"];
    for (const label of layerOrder) {
      map.addLayer({
        id: `risk-zone-${label}`,
        type: "fill",
        source: "risk-zones",
        filter: ["==", ["get", "label"], label],
        layout: {},
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["get", "opacity"],
        },
      });
    }
  }, [outbreaks, geo, showRiskZones, ready]);

  // ─── Livestock density layer ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !geo) return;

    // Remove old density layer
    if (map.getLayer("density-fill")) map.removeLayer("density-fill");
    if (map.getSource("density-data")) map.removeSource("density-data");

    if (densityLayer === "none" || !showChoropleth) return;

    // Build GeoJSON with density values
    const densityField = densityLayer === "pigs" ? "pigs_per_km2" : densityLayer === "cattle" ? "cattle_per_km2" : "poultry_per_km2";
    const maxDensity = Math.max(...Object.values(REGION_PROPERTIES).map(p => p[densityField] as number), 1);

    const features = geo.features.map((f) => {
      const name = (f.properties as { shapeName?: string }).shapeName;
      const props = name ? REGION_PROPERTIES[name] : undefined;
      const density = props ? (props[densityField] as number) : 0;
      return {
        ...f,
        properties: {
          ...f.properties,
          density,
          densityPercent: (density / maxDensity) * 100,
        },
      };
    });

    map.addSource("density-data", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    const colors = densityLayer === "pigs"
      ? ["#fff5f0", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#a50f15"]
      : densityLayer === "cattle"
        ? ["#f7fcf5", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45"]
        : ["#fffbeb", "#fee391", "#fec44f", "#fe9929", "#ec7014", "#cc4c02"];

    map.addLayer({
      id: "density-fill",
      type: "fill",
      source: "density-data",
      layout: {},
      paint: {
        "fill-color": {
          property: "densityPercent",
          type: "interval",
          stops: [
            [0, colors[0]],
            [5, colors[1]],
            [15, colors[2]],
            [30, colors[3]],
            [50, colors[4]],
            [75, colors[5]],
          ],
          default: colors[0],
        },
        "fill-opacity": 0.6,
      },
    }, "choropleth-line" in map.getStyle()?.layers?.map(l => l.id) ?? [] ? "choropleth-line" : undefined);
  }, [densityLayer, showChoropleth, geo, ready]);

  // ─── Outbreak heatmap layer ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !geo) return;

    // Remove existing heatmap
    if (map.getLayer("outbreak-heat")) map.removeLayer("outbreak-heat");
    if (map.getSource("outbreak-heat-data")) map.removeSource("outbreak-heat-data");

    if (!showHeatmap) return;

    // Build point GeoJSON from outbreaks
    const centroids = new Map<string, [number, number]>();
    for (const f of geo.features) {
      const name = (f.properties as { shapeName?: string }).shapeName;
      if (!name) continue;
      const bbox = computeBBox(f.geometry);
      if (bbox) centroids.set(name, [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]);
    }

    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const o of outbreaks) {
      let lngLat: [number, number] | null = null;
      if (typeof o.lon === "number" && typeof o.lat === "number"
          && Number.isFinite(o.lon) && Number.isFinite(o.lat)
          && !(o.lon === 0 && o.lat === 0)) {
        lngLat = [o.lon, o.lat];
      } else if (o.region_geo) {
        const c = centroids.get(o.region_geo);
        if (c && c[0] !== 0) lngLat = c;
      }
      if (!lngLat) continue;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: lngLat },
        properties: {
          weight: Math.max(0.1, Math.min(1, (o.cases || 1) / 100)),
          active: o.status === "Ongoing" ? 1 : 0.3,
        },
      });
    }

    if (features.length === 0) return;

    map.addSource("outbreak-heat-data", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    map.addLayer({
      id: "outbreak-heat",
      type: "heatmap",
      source: "outbreak-heat-data",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 1, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 3],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "rgba(33,102,172,0.4)",
          0.4, "rgba(103,169,207,0.6)",
          0.6, "rgba(209,229,240,0.7)",
          0.8, "rgba(253,219,199,0.8)",
          1, "rgba(239,138,98,0.9)",
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 6, 60],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 9, 0],
      },
    });
  }, [showHeatmap, outbreaks, geo, ready]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-muted-foreground">Загрузка карты…</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function buildPopupHTML(o: Outbreak): string {
  const color = diseaseColor(o.disease_key, o.disease_group);
  const statusBadge =
    o.status === "Ongoing"
      ? '<span style="background:#D32F2F;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;">АКТИВНО</span>'
      : o.status === "Resolved"
        ? '<span style="background:#2E7D32;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;">ЗАВЕРШЕНО</span>'
        : '<span style="background:#757575;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;">НЕИЗВЕСТНО</span>';

  return `
    <div style="font-family: inherit; padding: 4px 0;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${color};"></div>
        <strong style="font-size:14px;">${escapeHTML(o.disease)}</strong>
      </div>
      <div style="margin-bottom:8px;">${statusBadge}</div>
      <table style="font-size:12px;width:100%;border-spacing:0;">
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Регион:</td><td style="font-weight:500;">${escapeHTML(o.region === 'Russia' || o.region === 'Russian Federation' ? 'Россия (без региона)' : o.region)}</td></tr>
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Дата:</td><td>${formatDate(o.date)}</td></tr>
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Вид:</td><td>${escapeHTML(speciesRu(o.species))}</td></tr>
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Случаи:</td><td><strong>${o.cases.toLocaleString("ru-RU")}</strong></td></tr>
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Пало:</td><td><strong style="color:#D32F2F;">${o.deaths.toLocaleString("ru-RU")}</strong></td></tr>
        <tr><td style="color:#888;padding:2px 8px 2px 0;">Источник:</td><td style="font-size:11px;">${sourceRu(o.source)}</td></tr>
      </table>
    </div>
  `;
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

/** Compute bounding box of a geometry — used as rough centroid source. */
function computeBBox(geom: GeoJSON.Geometry): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (coords: unknown) => {
    if (typeof (coords as number[])[0] === "number") {
      const [x, y] = coords as number[];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    } else if (Array.isArray(coords)) {
      for (const c of coords) visit(c);
    }
  };
  visit((geom as { coordinates: unknown }).coordinates);
  if (minX === Infinity) return null;
  return [minX, minY, maxX, maxY];
}

function getOutbreakCenter(o: Outbreak, geo: GeoJSON.FeatureCollection | null): [number, number] | null {
  if (typeof o.lon === "number" && typeof o.lat === "number"
      && Number.isFinite(o.lon) && Number.isFinite(o.lat)
      && !(o.lon === 0 && o.lat === 0)) {
    return [o.lon, o.lat];
  }
  if (geo && o.region_geo) {
    for (const f of geo.features) {
      if ((f.properties as { shapeName?: string }).shapeName === o.region_geo) {
        const bbox = computeBBox(f.geometry);
        if (bbox) {
          const cx = (bbox[0] + bbox[2]) / 2;
          const cy = (bbox[1] + bbox[3]) / 2;
          // For Russia, cx=0 always means anti-meridian wraparound bug
          // (Chukotka spans -180..+180, midpoint = 0 = Atlantic Ocean).
          // Filter these out — outbreak won't render, but won't appear in
          // the wrong place either.
          if (Number.isFinite(cx) && Number.isFinite(cy) && cx !== 0) {
            return [cx, cy];
          }
        }
      }
    }
  }
  return null;
}

/** Build a circle polygon (lat/lng, rough — uses spherical-to-planar approximation). */
function makeCircle(center: [number, number], radiusKm: number, segments = 64): [number, number][] {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const radiusDeg = radiusKm / 111; // 1 deg ≈ 111km (rough, ignores lat)
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const dLng = (radiusDeg * Math.cos(angle)) / Math.cos(latRad || 0.0001);
    const dLat = radiusDeg * Math.sin(angle);
    points.push([lng + dLng, lat + dLat]);
  }
  return points;
}
