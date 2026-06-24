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
  Radio,
  Truck,
  FileText,
  Upload,
  Factory,
  Zap,
  GitCompare,
  Download,} from "lucide-react";

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
import { OutbreakSourceTracker } from "@/components/outbreak-source-tracker";
import { TransportGraphAnalysis } from "@/components/transport-graph-analysis";
import { PdfReportExport } from "@/components/pdf-report-export";
import { CustomDataImport } from "@/components/custom-data-import";
import { EnterpriseRiskMonitor } from "@/components/enterprise-risk-monitor";
import { SpatialSimulator } from "@/components/spatial-simulator";
import { RegionDrillDown } from "@/components/region-drill-down";import { ThemeToggle } from "@/components/theme-toggle";
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
  const [sourceTrackerOpen, setSourceTrackerOpen] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [pdfReportOpen, setPdfReportOpen] = useState(false);
  const [customImportOpen, setCustomImportOpen] = useState(false);
  const [enterpriseRiskOpen, setEnterpriseRiskOpen] = useState(false);

  // Load enterprises
  const [enterprises, setEnterprises] = useState<{id:string;name:string;type:string;lat:number;lon:number;region?:string}[]>([]);
  useEffect(() => {
    fetch("/data/enterprises.json")
      .then((r) => r.json())
      .then((d) => setEnterprises(d.enterprises || []))
      .catch(() => {});
  }, []);
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
      <main className="h-dvh flex items-center justify-center">
        <div className="text-center space-y-2">
          <Activity className="h-8 w-8 mx-auto animate-pulse text-primary" />
          <div className="text-sm text-muted-foreground">Загрузка данных…</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="h-dvh flex items-center justify-center p-6">
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
    <main className="flex h-dvh flex-col overflow-hidden bg-background">
      <PwaBanners />

      {/* ─── Header — fixed height, never scrolls ──────────────────── */}
      <header className="z-50 shrink-0 border-b bg-background/80 backdrop-blur-xl pt-safe">
        <div className="relative flex items-center gap-2 px-4 py-2 md:py-3">
          {/* Mesh gradient accent */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background:conic-gradient(from_0deg,transparent,var(--primary),transparent)] [animation:spin_18s_linear_infinite] blur-2xl" />

          <div className="relative flex items-center gap-2 flex-1 min-w-0">
            <Stethoscope className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-lg font-bold leading-tight tracking-tight truncate">
                <span className="text-primary">Вет</span>Карта
              </h1>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="relative hidden md:flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setAboutOpen(true)} aria-label="О проекте">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setNearbyOpen(true)}>
              <LocateFixed className="h-4 w-4 mr-1" />Рядом
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSpatialOpen(true)}>
              <Zap className="h-4 w-4 mr-1" />Распростр.
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceTrackerOpen(true)}
            >
              <Radio className="h-4 w-4 mr-1" />
              Источник
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransportOpen(true)}
            >
              <Truck className="h-4 w-4 mr-1" />
              Транспорт
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfReportOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              Отчёт
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomImportOpen(true)}
            >
              <Upload className="h-4 w-4 mr-1" />
              Импорт
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEnterpriseRiskOpen(true)}
            >
              <Factory className="h-4 w-4 mr-1" />
              Предприятия
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCalculator()}
            >
              <Calculator className="h-4 w-4 mr-1" />
              Карантин
            <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-4 w-4 mr-1" />Сравнить            </Button>
            <Button variant="outline" size="sm" onClick={() => setSirOpen(true)}>
              <Beaker className="h-4 w-4 mr-1" />SIR
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCalculator()}>
              <Calculator className="h-4 w-4 mr-1" />Карантин
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="GitHub">
              <a href="https://github.com/shray77/vet-heatmap" target="_blank" rel="noopener">
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <ThemeToggle />
          </div>

          {/* Mobile actions */}
          <div className="relative flex md:hidden items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setAboutOpen(true)} aria-label="О проекте">
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setNearbyOpen(true)} aria-label="Рядом">
              <LocateFixed className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSirOpen(true)} aria-label="SIR">
              <Beaker className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openCalculator()} aria-label="Карантин">
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

        {/* Inline KPI + disease chips — desktop only */}
        <div className="relative hidden md:flex items-center gap-3 overflow-hidden px-4 pb-2">
          <StatsBar outbreaks={filtered} totalRegions={totalRegions} />
          <div className="flex gap-1 overflow-x-auto thin-scroll ml-auto">
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

      {/* ─── Body: map locked + sidebar scrolls ────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* MAP — locked, fills, never scrolls page */}
        <section className="relative min-h-0 flex-1 overflow-hidden">
          <OutbreakMap
            outbreaks={filtered}
            geo={geo}
            showRiskZones={showRiskZones}
            showChoropleth={showChoropleth}
            densityLayer={densityLayer}
            onSelectOutbreak={(o) => onSelectOutbreak(o)}
            onSelectRegion={onSelectRegion}
          />

          {/* Mobile KPI orbs — floating glass discs over map */}
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex gap-2 md:hidden">
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-card/60 shadow-lg backdrop-blur-xl">
              <span className="text-sm font-bold tabular-nums leading-none text-foreground">{filtered.length}</span>
              <span className="mt-0.5 text-[7px] uppercase text-muted-foreground">всего</span>
            </div>
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-white/15 bg-card/60 shadow-lg backdrop-blur-xl">
              <span className="text-sm font-bold tabular-nums leading-none text-destructive">
                {filtered.filter((o) => o.status === "Ongoing").length}
              </span>
              <span className="mt-0.5 text-[7px] uppercase text-muted-foreground">активн.</span>
            </div>
          </div>

          {/* Frosted glass floating legend pill */}
          <div className="absolute bottom-3 right-3 z-20 max-w-[220px] rounded-2xl border border-white/15 bg-card/60 p-3 text-[10px] shadow-2xl backdrop-blur-xl pointer-events-auto">
            <div className="font-semibold text-foreground mb-1.5">Зоны риска</div>
            <LegendRow color="#D32F2F" label="Защита (3 км)" />
            <LegendRow color="#F57C00" label="Наблюдение (10 км)" />
            <LegendRow color="#1565C0" label="Ограничение (30 км)" />
            <div className="pt-1.5 mt-1.5 border-t border-white/10">
              <div className="font-semibold text-foreground mb-1">Плотность</div>
              <div className="flex gap-1">
                {[
                  { v: "none", label: "Нет", color: "var(--muted)" },
                  { v: "pigs", label: "Св.", color: "#fb6a4a" },
                  { v: "cattle", label: "КРС", color: "#74c476" },
                  { v: "poultry", label: "Птц.", color: "#fe9929" },
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
            <div className="pt-1.5 mt-1.5 border-t border-white/10 text-muted-foreground">
              {data?.sources.join(", ")} · {data?.updated}
            </div>
          </div>
        </section>

        {/* DESKTOP SIDEBAR — the ONLY scroll region */}
        <aside className="hidden w-[380px] shrink-0 flex-col overflow-hidden border-l bg-background/60 lg:flex xl:w-[420px]">
          <div className="thin-scroll flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
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

      {/* ─── Mobile: bottom sheet content ──────────────────────────── */}
      <div className="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-t-3xl border-t bg-card/95 p-4 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl lg:hidden">
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        <div className="space-y-4">
          <TimelineSlider outbreaks={data?.outbreaks ?? []} onDateRangeChange={(from, to) => setTimelineRange({from, to})} />
          <HotspotList outbreaks={filtered} onSelectRegion={(r) => { setRegionDrillDown(r); setRegionDrillDownOpen(true); }} />
          <EpiCurve outbreaks={filtered} />
          <OutbreaksTable outbreaks={filtered} onSelectOutbreak={(o) => onSelectOutbreak(o)} />
        </div>
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
      <OutbreakSourceTracker open={sourceTrackerOpen} onOpenChange={setSourceTrackerOpen} outbreaks={filtered} />
      <TransportGraphAnalysis open={transportOpen} onOpenChange={setTransportOpen} outbreaks={filtered} />
      <PdfReportExport open={pdfReportOpen} onOpenChange={setPdfReportOpen} outbreaks={outbreaks || []} />
      <CustomDataImport open={customImportOpen} onOpenChange={setCustomImportOpen} outbreaks={outbreaks || []} />
      <EnterpriseRiskMonitor open={enterpriseRiskOpen} onOpenChange={setEnterpriseRiskOpen} outbreaks={outbreaks || []} enterprises={enterprises} />
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
      <DiseaseComparison open={compareOpen} onOpenChange={setCompareOpen} />      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
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
