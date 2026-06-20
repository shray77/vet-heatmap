"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  Filter,
  Calculator,
  Github,
  Activity,
  Stethoscope,
  AlertTriangle,
  Info,
  LocateFixed,
  Beaker,
  Zap,
  GitCompare,
  Download,
} from "lucide-react";

import { OutbreakMap } from "@/components/outbreak-map";
import { StatsBar } from "@/components/stats-bar";
import { FilterPanel } from "@/components/filter-panel";
import { EpiCurve } from "@/components/epi-curve";
import { HotspotList } from "@/components/hotspot-list";
import { TimelineSlider } from "@/components/timeline-slider";
import { OutbreaksTable } from "@/components/outbreaks-table";
import { DiseaseProfileDrawer } from "@/components/disease-profile-drawer";
import { QuarantineCalculator } from "@/components/quarantine-calculator";
import { NearbyOutbreaks } from "@/components/nearby-outbreaks";
import { SIRSimulator } from "@/components/sir-simulator";
import { SpatialSimulator } from "@/components/spatial-simulator";
import { RegionDrillDown } from "@/components/region-drill-down";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaBanners } from "@/components/pwa-banners";
import { AboutDialog } from "@/components/about-dialog";
import { DiseaseComparison } from "@/components/disease-comparison";

import { useOutbreaks, useRegionsGeoJSON } from "@/lib/use-data";
import { useKeyboardShortcuts } from "@/lib/use-keyboard";
import { useTheme } from "next-themes";
import { diseaseColor } from "@/lib/colors";
import { generateOutbreakReport } from "@/lib/pdf-export";
import {
  DEFAULT_FILTERS,
  FilterState,
  applyFilters,
  filtersToParams,
  paramsToFilters,
} from "@/lib/filters";
import type { DiseaseKey, Outbreak } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";

export default function Home() {
  return <HomeContent />;
}

function HomeContent() {
  const { data, loading, error } = useOutbreaks();
  const { geo, loading: geoLoading } = useRegionsGeoJSON();

  // Read URL search params directly (avoids useSearchParams() which requires
  // Suspense boundary and was breaking production static export hydration).
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    const params = new URLSearchParams(window.location.search);
    return paramsToFilters(params);
  });

  // Sync filters to URL (preserve GitHub Pages basePath /vet-heatmap/)
  useEffect(() => {
    const params = filtersToParams(filters);
    const basePath = process.env.NODE_ENV === "production" ? "/vet-heatmap" : "";
    const url = params.toString()
      ? `${basePath}/?${params.toString()}`
      : `${basePath}/`;
    // Use history.replaceState to avoid Next.js router issues in static export
    window.history.replaceState(null, "", url);
  }, [filters]);

  // Layer toggles
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [showChoropleth, setShowChoropleth] = useState(true);
  const [densityLayer, setDensityLayer] = useState<"none" | "pigs" | "cattle" | "poultry">("none");

  // Drawer/dialog state
  const [drawerDisease, setDrawerDisease] = useState<DiseaseKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcPreselect, setCalcPreselect] = useState<DiseaseKey | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [sirOpen, setSirOpen] = useState(false);
  const [spatialOpen, setSpatialOpen] = useState(false);
  const [regionDrillDown, setRegionDrillDown] = useState<string | null>(null);
  const [regionDrillDownOpen, setRegionDrillDownOpen] = useState(false);
  const [timelineRange, setTimelineRange] = useState<{from: string | null, to: string | null}>({from: null, to: null});
  const [compareOpen, setCompareOpen] = useState(false);

  // Region centroids for "nearby" calculation (computed once geo is loaded)
  const regionCentroids = useMemo(() => {
    const m = new Map<string, [number, number]>();
    if (!geo) return m;
    for (const f of geo.features) {
      const name = (f.properties as { shapeName?: string }).shapeName;
      if (!name) continue;
      // Compute centroid as bounding-box center (rough, fine for distance calc)
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
      visit((f.geometry as { coordinates: unknown }).coordinates);
      if (minX !== Infinity) m.set(name, [(minX + maxX) / 2, (minY + maxY) / 2]);
    }
    return m;
  }, [geo]);

  // Filtered outbreaks
  const filtered = useMemo(() => {
    if (!data) return [];
    return applyFilters(data.outbreaks, {
      ...filters,
      dateFrom: timelineRange.from ?? filters.dateFrom,
      dateTo: timelineRange.to ?? filters.dateTo,
    });
  }, [data, filters]);

  const totalRegions = geo?.features.length ?? 85;

  const onSelectOutbreak = useCallback((o: Outbreak) => {
    setDrawerDisease(o.disease_key);
    setDrawerOpen(true);
  }, []);

  const onSelectRegion = useCallback((region: string) => {
    setRegionDrillDown(region);
    setRegionDrillDownOpen(true);
  }, []);

  const openCalculator = (d?: DiseaseKey) => {
    if (d) setCalcPreselect(d);
    setCalcOpen(true);
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const { setTheme, theme } = useTheme();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onOpenFilters: () => setMobileFiltersOpen(true),
    onOpenCalculator: () => openCalculator(),
    onOpenAbout: () => setAboutOpen(true),
    onOpenNearby: () => setNearbyOpen(true),
    onOpenSIR: () => setSirOpen(true),
    onResetFilters: resetFilters,
    onToggleTheme: () => {
      // Cycle: light -> dark -> system
      const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
      setTheme(next);
    },
  });

  if (loading || geoLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <Activity className="h-8 w-8 mx-auto animate-pulse text-primary" />
          <div className="text-sm text-muted-foreground">Загрузка данных…</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-md">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
          <h2 className="text-lg font-semibold">Не удалось загрузить данные</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()}>Попробовать снова</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <PwaBanners />

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-background to-background/95 backdrop-blur border-b pt-safe">
        <div className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Stethoscope className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-lg font-bold leading-tight tracking-tight truncate">
                <span className="text-primary">Вет</span>Карта
              </h1>
              <p className="text-[10px] md:text-xs text-muted-foreground leading-tight truncate">
                Эпизоотическая обстановка России
              </p>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAboutOpen(true)}
              aria-label="О проекте"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNearbyOpen(true)}
            >
              <LocateFixed className="h-4 w-4 mr-1" />
              Рядом
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSpatialOpen(true)}
            >
              <Zap className="h-4 w-4 mr-1" />
              Распростр.
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompareOpen(true)}
            >
              <GitCompare className="h-4 w-4 mr-1" />
              Сравнить
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSirOpen(true)}
            >
              <Beaker className="h-4 w-4 mr-1" />
              SIR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCalculator()}
            >
              <Calculator className="h-4 w-4 mr-1" />
              Карантин
            </Button>
            <Button
              variant="ghost"
              size="icon"
              asChild
              aria-label="GitHub"
            >
              <a
                href="https://github.com/shray77/vet-heatmap"
                target="_blank"
                rel="noopener"
              >
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <ThemeToggle />
          </div>

          {/* Mobile actions */}
          <div className="flex md:hidden items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAboutOpen(true)}
              aria-label="О проекте"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNearbyOpen(true)}
              aria-label="Рядом со мной"
            >
              <LocateFixed className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSirOpen(true)}
              aria-label="SIR-симулятор"
            >
              <Beaker className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openCalculator()}
              aria-label="Калькулятор"
            >
              <Calculator className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Фильтры">
                  <Filter className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto thin-scroll pb-safe">
                <div className="p-4">
                  <h2 className="text-base font-semibold mb-3">Фильтры</h2>
                  <FilterPanel
                    outbreaks={data?.outbreaks ?? []}
                    filters={filters}
                    onChange={setFilters}
                    onReset={resetFilters}
                    showRiskZones={showRiskZones}
                    onShowRiskZonesChange={setShowRiskZones}
                    showChoropleth={showChoropleth}
            densityLayer={densityLayer}
                    onShowChoroplethChange={setShowChoropleth}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Inline KPI bar + disease chips in one row */}
        <div className="px-3 pb-2 md:px-4 md:pb-2 flex items-center gap-3 overflow-hidden">
          <StatsBar outbreaks={filtered} totalRegions={totalRegions} />
          {/* Disease quick-filter chips — desktop only */}
          <div className="hidden lg:flex gap-1 overflow-x-auto thin-scroll ml-auto">
            <Button
              variant={filters.diseases.length === 0 ? "default" : "outline"}
              size="sm"
              className="h-7 text-[11px] shrink-0 px-2"
              onClick={resetFilters}
            >
              Все
            </Button>
            {DISEASE_PROFILES.slice(0, 10).map((p) => {
              const isActive = filters.diseases.includes(p.disease_key);
              const color = diseaseColor(p.disease_key, p.group);
              return (
                <button
                  key={p.disease_key}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      diseases: isActive
                        ? filters.diseases.filter((x) => x !== p.disease_key)
                        : [...filters.diseases, p.disease_key],
                    })
                  }
                  className="h-7 px-2 rounded-md text-[11px] shrink-0 border transition-all flex items-center gap-1"
                  style={{
                    backgroundColor: isActive ? color : "transparent",
                    borderColor: isActive ? color : "var(--border)",
                    color: isActive ? "#fff" : "var(--foreground)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color, opacity: isActive ? 0.7 : 1 }} />
                  {p.short_ru}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ─── Main content: map fills remaining space + sidebar ───── */}
      <div className="flex-1 flex min-h-0">
        {/* Map — full remaining height */}
        <div className="relative flex-1 min-h-0">
          <OutbreakMap
            outbreaks={filtered}
            geo={geo}
            showRiskZones={showRiskZones}
            showChoropleth={showChoropleth}
            densityLayer={densityLayer}
            onSelectOutbreak={(o) => onSelectOutbreak(o)}
            onSelectRegion={onSelectRegion}
          />

          {/* Legend overlay (bottom-right) */}
          <div className="absolute bottom-2 right-2 bg-card/95 backdrop-blur border-l-2 border-l-primary rounded-md p-2.5 text-[10px] space-y-1 max-w-[200px] shadow-md pointer-events-none">
            <div className="font-semibold text-foreground">Зоны риска</div>
            <LegendRow color="#D32F2F" label="Защита (3 км)" />
            <LegendRow color="#F57C00" label="Наблюдение (10 км)" />
            <LegendRow color="#1565C0" label="Ограничение (30 км)" />
            {/* Density layer toggle */}
            <div className="pt-1 border-t">
              <div className="font-semibold text-foreground mb-1">Плотность животных</div>
              <div className="flex gap-1">
                {[
                  { v: "none", label: "Нет", color: "var(--muted)" },
                  { v: "pigs", label: "Свиньи", color: "#fb6a4a" },
                  { v: "cattle", label: "КРС", color: "#74c476" },
                  { v: "poultry", label: "Птица", color: "#fe9929" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setDensityLayer(opt.v as any)}
                    className={`px-1.5 py-0.5 rounded text-[9px] border transition-all ${
                      densityLayer === opt.v ? "bg-foreground text-background" : "bg-transparent"
                    }`}
                    style={densityLayer === opt.v ? {} : { borderColor: opt.color, color: opt.color }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-1 border-t text-muted-foreground">
              Источник: {data?.sources.join(", ")} · обн. {data?.updated}
            </div>
          </div>
        </div>

        {/* Desktop sidebar — right panel with filters + charts + table */}
        <aside className="hidden lg:flex lg:w-[340px] xl:w-[380px] flex-col border-l bg-background/50">
          <div className="p-3 space-y-3 overflow-y-auto thin-scroll flex-1">
            <FilterPanel
              outbreaks={data?.outbreaks ?? []}
              filters={filters}
              onChange={setFilters}
              onReset={resetFilters}
              showRiskZones={showRiskZones}
              onShowRiskZonesChange={setShowRiskZones}
              showChoropleth={showChoropleth}
            densityLayer={densityLayer}
              onShowChoroplethChange={setShowChoropleth}
            />
            <TimelineSlider outbreaks={data?.outbreaks ?? []} onDateRangeChange={(from, to) => setTimelineRange({from, to})} />
            <HotspotList outbreaks={filtered} onSelectRegion={(r) => { setRegionDrillDown(r); setRegionDrillDownOpen(true); }} />
            <EpiCurve outbreaks={filtered} />
            <OutbreaksTable outbreaks={filtered} onSelectOutbreak={(o) => onSelectOutbreak(o)} />
          </div>
        </aside>
      </div>

      {/* ─── Mobile: Epi curve + table below map ─────────────────── */}
      <div className="lg:hidden p-3 space-y-3">
        <EpiCurve outbreaks={filtered} />
        <OutbreaksTable outbreaks={filtered} onSelectOutbreak={(o) => onSelectOutbreak(o)} />
      </div>

      {/* ─── Drawers/Dialogs ─────────────────────────────────────── */}
      <DiseaseProfileDrawer
        disease={drawerDisease}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
      <QuarantineCalculator
        open={calcOpen}
        onOpenChange={setCalcOpen}
        preselectDisease={calcPreselect}
      />
      <NearbyOutbreaks
        open={nearbyOpen}
        onOpenChange={setNearbyOpen}
        outbreaks={data?.outbreaks ?? []}
        regionCentroids={regionCentroids}
        onFocusOutbreak={(o) => {
          setDrawerDisease(o.disease_key);
          setDrawerOpen(true);
        }}
      />
      <SIRSimulator open={sirOpen} onOpenChange={setSirOpen} />
      <RegionDrillDown
        region={regionDrillDown}
        outbreaks={data?.outbreaks ?? []}
        open={regionDrillDownOpen}
        onOpenChange={setRegionDrillDownOpen}
        onSelectOutbreak={(o) => {
          setDrawerDisease(o.disease_key);
          setDrawerOpen(true);
        }}
      />
      <SpatialSimulator
        open={spatialOpen}
        onOpenChange={setSpatialOpen}
        outbreaks={data?.outbreaks ?? []}
        regionCentroids={regionCentroids}
      />
      <DiseaseComparison open={compareOpen} onOpenChange={setCompareOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </main>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2.5 h-2.5 rounded-sm"
        style={{ backgroundColor: color, opacity: 0.5 }}
      />
      <span className="text-foreground">{label}</span>
    </div>
  );
}
