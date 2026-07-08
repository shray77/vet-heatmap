"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  Play,
  MapPin,
  Zap,
  Download,
  Bell,
  ChevronDown,
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
import { OutbreakSourceTracker } from "@/components/outbreak-source-tracker";
import { TransportGraphAnalysis } from "@/components/transport-graph-analysis";
import { PdfReportExport } from "@/components/pdf-report-export";
import { CustomDataImport } from "@/components/custom-data-import";
import { SearchBox } from "@/components/search-box";
import { TodaySummary } from "@/components/today-summary";
import { OutbreakDetailPanel } from "@/components/outbreak-detail-panel";
import { EnterpriseRiskMonitor } from "@/components/enterprise-risk-monitor";
import { SpatialSimulator } from "@/components/spatial-simulator";
import { RegionDrillDown } from "@/components/region-drill-down";import { ThemeToggle } from "@/components/theme-toggle";
import { PwaBanners } from "@/components/pwa-banners";
import { AboutDialog } from "@/components/about-dialog";
import { DiseaseComparison } from "@/components/disease-comparison";
import { SpreadAnimation } from "@/components/spread-animation";
import { RegionReportCard } from "@/components/region-report-card";
import { AlertSettings } from "@/components/alert-settings";
import { RiskScoreMap } from "@/components/risk-score-map";

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
  const [showHeatmap, setShowHeatmap] = useState(false);

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
  const [spreadAnimOpen, setSpreadAnimOpen] = useState(false);
  const [regionCardOpen, setRegionCardOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [nightMode, setNightMode] = useState(false);

  // Load enterprises (OSM + Yandex.Maps merged)
  const [enterprises, setEnterprises] = useState<{id:string;name:string;type:string;lat:number;lon:number;region?:string}[]>([]);
  useEffect(() => {
    // IMPORTANT: must use basePath for prod (GitHub Pages /vet-heatmap/)
    // — fetch without basePath returns 404 HTML page, JSON parse fails,
    // enterprises stays [] (this was the bug — "Монитор предприятий"
    // showed "Все (0)" even though enterprises.json had 686 entries).
    const basePath = process.env.NODE_ENV === "production" ? "/vet-heatmap" : "";

    // Load both OSM-curated enterprises.json AND Yandex.Maps enterprises-yandex.json
    // Yandex has better coverage of Russian businesses (many small/medium farms
    // not tagged in OSM). Merge by id (Yandex ids start with "yandex-", OSM with "osm-").
    Promise.all([
      fetch(`${basePath}/data/enterprises.json`, { cache: "no-store" }).then(r => r.json()).catch(() => ({ enterprises: [] })),
      fetch(`${basePath}/data/enterprises-yandex.json`, { cache: "no-store" }).then(r => r.json()).catch(() => ({ enterprises: [] })),
    ]).then(([osmData, yandexData]) => {
      const osmEnts = (osmData.enterprises || []).filter((e: any) => typeof e.lat === "number" && typeof e.lon === "number");
      const yandexEnts = (yandexData.enterprises || []).filter((e: any) => typeof e.lat === "number" && typeof e.lon === "number");
      const all = [...osmEnts, ...yandexEnts];
      console.log(`[enterprises] OSM: ${osmEnts.length}, Yandex: ${yandexEnts.length}, merged: ${all.length}`);
      setEnterprises(all);
    }).catch(() => setEnterprises([]));
  }, []);
  const [spatialOpen, setSpatialOpen] = useState(false);
  const [regionDrillDown, setRegionDrillDown] = useState<string | null>(null);
  const [regionDrillDownOpen, setRegionDrillDownOpen] = useState(false);
  const [timelineRange, setTimelineRange] = useState<{from: string | null, to: string | null}>({from: null, to: null});

  // Outbreak detail panel (replaces small popup on marker click)
  const [selectedOutbreak, setSelectedOutbreak] = useState<Outbreak | null>(null);
  const [outbreakDetailOpen, setOutbreakDetailOpen] = useState(false);

  // Resizable sidebar width (desktop only). Stored in localStorage.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 380;
    const saved = window.localStorage.getItem("vet:sidebarWidth");
    return saved ? Math.min(Math.max(parseInt(saved, 10), 280), 720) : 380;
  });
  
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
    // Open the new detail panel instead of just the disease drawer.
    // Detail panel includes a "view disease profile" button that opens
    // the DiseaseProfileDrawer as a secondary step.
    setSelectedOutbreak(o);
    setOutbreakDetailOpen(true);
  }, []);

  /** Focus the map on a region (called from search box). */
  const focusRegion = useCallback((shapeName: string) => {
    // Open region drill-down panel
    setRegionDrillDown(shapeName);
    setRegionDrillDownOpen(true);
    // Also dispatch a custom event so OutbreakMap can fly to the region.
    // (OutbreakMap listens for 'vet:focusRegion' events.)
    window.dispatchEvent(new CustomEvent("vet:focusRegion", { detail: shapeName }));
  }, []);

  /** Toggle a disease filter (called from search box disease hit). */
  const toggleDiseaseFilter = useCallback((key: DiseaseKey) => {
    setFilters((f) => {
      const isActive = f.diseases.includes(key);
      return {
        ...f,
        diseases: isActive
          ? f.diseases.filter((x) => x !== key)
          : [...f.diseases, key],
      };
    });
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
    <main className={`flex h-dvh flex-col overflow-hidden bg-background ${nightMode ? "night-mode" : ""}`}>
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
            {/* Desktop search box */}
            <div className="hidden md:block ml-3">
              <SearchBox
                outbreaks={data?.outbreaks ?? []}
                onFocusRegion={focusRegion}
                onSelectDisease={(k) => { setDrawerDisease(k); setDrawerOpen(true); }}
                onToggleDiseaseFilter={toggleDiseaseFilter}
              />
            </div>
          </div>

          {/* Desktop actions — compact: keep only most-used visible, hide rest in 'Tools' dropdown */}
          <div className="relative hidden md:flex items-center gap-1 shrink-0">
            {/* Most-used: stay as individual buttons */}
            <Button variant="outline" size="sm" onClick={() => setNearbyOpen(true)}>
              <LocateFixed className="h-4 w-4 mr-1" />Рядом
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCalculator()}>
              <Calculator className="h-4 w-4 mr-1" />Карантин
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSirOpen(true)}>
              <Beaker className="h-4 w-4 mr-1" />SIR
            </Button>

            {/* Tools dropdown — holds the rest, prevents header overflow */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1">
                  <Beaker className="h-4 w-4" />
                  <span className="text-xs">Инструменты</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Аналитика</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSpatialOpen(true)}>
                  <Zap className="h-4 w-4 mr-2" /> Распространение
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourceTrackerOpen(true)}>
                  <Radio className="h-4 w-4 mr-2" /> Источник вспышки
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTransportOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" /> Транспорт
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSpreadAnimOpen(true)}>
                  <Play className="h-4 w-4 mr-2" /> Анимация
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Данные</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setRegionCardOpen(true)}>
                  <MapPin className="h-4 w-4 mr-2" /> Карточка региона
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEnterpriseRiskOpen(true)}>
                  <Factory className="h-4 w-4 mr-2" /> Предприятия
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPdfReportOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" /> Отчёт PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCustomImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Импорт данных
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAlertOpen(true)}>
                  <Bell className="h-4 w-4 mr-2" /> Уведомления
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAboutOpen(true)}>
                  <Info className="h-4 w-4 mr-2" /> О проекте
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" asChild aria-label="GitHub">
              <a href="https://github.com/shray77/vet-heatmap" target="_blank" rel="noopener">
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNightMode(!nightMode)}
              aria-label="Ночной режим"
              title="Ночной режим (красный фильтр)"
            >
              {nightMode ? "☀️" : "🌙"}
            </Button>
            <ThemeToggle />
          </div>

          {/* Mobile actions — compact dropdown for tools */}
          <div className="relative flex md:hidden items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1">
                  <Beaker className="h-4 w-4" />
                  <span className="text-xs">Инструменты</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Аналитика</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setSirOpen(true)}>
                  <Beaker className="h-4 w-4 mr-2" /> SIR модель
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourceTrackerOpen(true)}>
                  <Radio className="h-4 w-4 mr-2" /> Источник вспышки
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTransportOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" /> Транспорт
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSpreadAnimOpen(true)}>
                  <Play className="h-4 w-4 mr-2" /> Анимация
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Инструменты</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setPdfReportOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" /> Отчёт PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCalculator()}>
                  <Calculator className="h-4 w-4 mr-2" /> Карантин
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNearbyOpen(true)}>
                  <LocateFixed className="h-4 w-4 mr-2" /> Рядом
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRegionCardOpen(true)}>
                  <MapPin className="h-4 w-4 mr-2" /> Карточка региона
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEnterpriseRiskOpen(true)}>
                  <Factory className="h-4 w-4 mr-2" /> Предприятия
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCustomImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" /> Импорт данных
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAlertOpen(true)}>
                  <Bell className="h-4 w-4 mr-2" /> Уведомления
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAboutOpen(true)}>
                  <Info className="h-4 w-4 mr-2" /> О проекте
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9" aria-label="Фильтры">
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
                    showHeatmap={showHeatmap}
                    onShowChoroplethChange={setShowChoropleth}
                    onShowHeatmapChange={setShowHeatmap}
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
              const isSolo = filters.diseases.length === 1 && isActive;
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
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    // Solo: only this disease (or reset if already solo)
                    setFilters({
                      ...filters,
                      diseases: isSolo ? [] : [p.disease_key],
                    });
                  }}
                  title={`${p.name_ru} — клик: фильтр, двойной клик: только эта болезнь`}
                  className="h-7 px-2 rounded-md text-[11px] shrink-0 border transition-all flex items-center gap-1"
                  style={{
                    backgroundColor: isActive ? color : "transparent",
                    borderColor: isActive ? color : "var(--border)",
                    color: isActive ? "#fff" : "var(--foreground)",
                    outline: isSolo ? `2px solid ${color}` : "none",
                    outlineOffset: -1,
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

      {/* ─── Today summary strip (desktop only — mobile gets KPI orbs) ── */}
      <div className="hidden md:block">
        <TodaySummary
          outbreaks={filtered}
          totalRegionsWithOutbreaks={totalRegions}
          onSelectDisease={(k) => { setDrawerDisease(k); setDrawerOpen(true); }}
        />
      </div>

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
            showHeatmap={showHeatmap}
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

        {/* DESKTOP SIDEBAR — resizable, the ONLY scroll region */}
        <aside
          className="hidden shrink-0 flex-col overflow-hidden border-l bg-background/60 lg:flex"
          style={{ width: `${sidebarWidth}px` }}
        >
          {/* Drag handle — drag to resize sidebar */}
          <SidebarResizer width={sidebarWidth} onResize={setSidebarWidth} />
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
            showHeatmap={showHeatmap}
              onShowChoroplethChange={setShowChoropleth}
            />
            <TimelineSlider outbreaks={data?.outbreaks ?? []} onDateRangeChange={(from, to) => setTimelineRange({from, to})} />
            <HotspotList outbreaks={filtered} onSelectRegion={(r) => { setRegionDrillDown(r); setRegionDrillDownOpen(true); }} />
            <EpiCurve outbreaks={filtered} />
            <DiseaseComparison outbreaks={filtered} />
            <RiskScoreMap outbreaks={filtered} />
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
          <DiseaseComparison outbreaks={filtered} />
          <RiskScoreMap outbreaks={filtered} />
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
      <PdfReportExport open={pdfReportOpen} onOpenChange={setPdfReportOpen} outbreaks={data?.outbreaks ?? []} />
      <CustomDataImport open={customImportOpen} onOpenChange={setCustomImportOpen} outbreaks={data?.outbreaks ?? []} />
      <EnterpriseRiskMonitor open={enterpriseRiskOpen} onOpenChange={setEnterpriseRiskOpen} outbreaks={data?.outbreaks ?? []} enterprises={enterprises} />
      <SpreadAnimation open={spreadAnimOpen} onOpenChange={setSpreadAnimOpen} outbreaks={data?.outbreaks ?? []} />
      <RegionReportCard open={regionCardOpen} onOpenChange={setRegionCardOpen} outbreaks={data?.outbreaks ?? []} />
      <AlertSettings open={alertOpen} onOpenChange={setAlertOpen} outbreaks={data?.outbreaks ?? []} />
      <RegionDrillDown
        region={regionDrillDown}
        outbreaks={data?.outbreaks ?? []}
        open={regionDrillDownOpen}
        onOpenChange={setRegionDrillDownOpen}
        onSelectOutbreak={(o) => {
          setSelectedOutbreak(o);
          setOutbreakDetailOpen(true);
        }}
        geo={geo}
        enterprises={enterprises}
      />
      <OutbreakDetailPanel
        outbreak={selectedOutbreak}
        open={outbreakDetailOpen}
        onOpenChange={setOutbreakDetailOpen}
        outbreaks={data?.outbreaks ?? []}
        enterprises={enterprises}
        onSelectDisease={(k) => { setDrawerDisease(k); setDrawerOpen(true); }}
        onSimulate={(o) => { setSirOpen(true); }}
      />
      <SpatialSimulator
        open={spatialOpen}
        onOpenChange={setSpatialOpen}
        outbreaks={data?.outbreaks ?? []}
        regionCentroids={regionCentroids}
      />
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

/**
 * Drag handle for resizing the desktop sidebar.
 *
 * Drag left/right to shrink/grow the sidebar between 280px and 720px.
 * Width is persisted to localStorage via the parent's onResize callback.
 *
 * Renders a thin vertical bar at the left edge of the sidebar. Cursor
 * changes to col-resize on hover. The handle is keyboard-accessible
 * (ArrowLeft/ArrowRight to adjust by 16px).
 */
function SidebarResizer({
  width,
  onResize,
}: {
  width: number;
  onResize: (w: number) => void;
}) {
  const draggingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Sidebar is on the right, so dragging left (decreasing clientX)
      // means the sidebar gets wider.
      const newWidth = Math.min(
        Math.max(window.innerWidth - e.clientX, 280),
        720,
      );
      onResize(newWidth);
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Persist on release (not every move — avoids localStorage thrash)
        window.localStorage.setItem("vet:sidebarWidth", String(width));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onResize, width]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(Math.min(width + 16, 720));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(Math.max(width - 16, 280));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить размер боковой панели"
      tabIndex={0}
      onMouseDown={startDrag}
      onKeyDown={onKeyDown}
      className="group relative h-1 w-full cursor-col-resize shrink-0 bg-border hover:bg-primary/40 transition-colors"
      title="Перетащите для изменения размера (←/→ для шага 16px)"
    >
      {/* Grip dots — visible on hover */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
        <div className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
        <div className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}
