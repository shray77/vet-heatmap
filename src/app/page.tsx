"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";

import { OutbreakMap } from "@/components/outbreak-map";
import { StatsBar } from "@/components/stats-bar";
import { FilterPanel } from "@/components/filter-panel";
import { EpiCurve } from "@/components/epi-curve";
import { DiseaseProfileDrawer } from "@/components/disease-profile-drawer";
import { QuarantineCalculator } from "@/components/quarantine-calculator";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaBanners } from "@/components/pwa-banners";
import { AboutDialog } from "@/components/about-dialog";

import { useOutbreaks, useRegionsGeoJSON } from "@/lib/use-data";
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
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <Stethoscope className="h-8 w-8 mx-auto animate-pulse text-primary" />
        <div className="text-sm text-muted-foreground">ВетКарта загружается…</div>
      </div>
    </main>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, loading, error } = useOutbreaks();
  const { geo, loading: geoLoading } = useRegionsGeoJSON();

  // Filters from URL
  const [filters, setFilters] = useState<FilterState>(() =>
    paramsToFilters(searchParams),
  );

  // Sync filters to URL
  useEffect(() => {
    const params = filtersToParams(filters);
    const url = params.toString() ? `/?${params.toString()}` : "/";
    router.replace(url, { scroll: false });
  }, [filters, router]);

  // Layer toggles
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [showChoropleth, setShowChoropleth] = useState(true);

  // Drawer/dialog state
  const [drawerDisease, setDrawerDisease] = useState<DiseaseKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcPreselect, setCalcPreselect] = useState<DiseaseKey | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Filtered outbreaks
  const filtered = useMemo(() => {
    if (!data) return [];
    return applyFilters(data.outbreaks, filters);
  }, [data, filters]);

  const totalRegions = geo?.features.length ?? 85;

  const onSelectOutbreak = useCallback((o: Outbreak) => {
    setDrawerDisease(o.disease_key);
    setDrawerOpen(true);
  }, []);

  const onSelectRegion = useCallback((_region: string) => {
    // could open a region summary later
  }, []);

  const openCalculator = (d?: DiseaseKey) => {
    if (d) setCalcPreselect(d);
    setCalcOpen(true);
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

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
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b pt-safe">
        <div className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Stethoscope className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm md:text-lg font-bold leading-tight truncate">
                ВетКарта
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
              onClick={() => openCalculator()}
            >
              <Calculator className="h-4 w-4 mr-1" />
              Калькулятор карантина
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
                    onShowChoroplethChange={setShowChoropleth}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-3 pb-2 md:px-4 md:pb-3">
          <StatsBar outbreaks={filtered} totalRegions={totalRegions} />
        </div>

        {/* Disease chips row (quick disease filter access) */}
        <div className="px-3 pb-2 md:px-4 md:pb-3 flex gap-1 overflow-x-auto thin-scroll">
          <Button
            variant={filters.diseases.length === 0 ? "default" : "outline"}
            size="sm"
            className="h-7 text-[11px] shrink-0"
            onClick={resetFilters}
          >
            Все
          </Button>
          {DISEASE_PROFILES.slice(0, 12).map((p) => (
            <Button
              key={p.disease_key}
              variant={filters.diseases.includes(p.disease_key) ? "default" : "outline"}
              size="sm"
              className="h-7 text-[11px] shrink-0"
              onClick={() =>
                setFilters({
                  ...filters,
                  diseases: filters.diseases.includes(p.disease_key)
                    ? filters.diseases.filter((x) => x !== p.disease_key)
                    : [...filters.diseases, p.disease_key],
                })
              }
            >
              {p.short_ru}
            </Button>
          ))}
        </div>
      </header>

      {/* ─── Main content: map + sidebar ───────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Map */}
        <div className="flex-1 relative min-h-[50vh] lg:min-h-0">
          <OutbreakMap
            outbreaks={filtered}
            geo={geo}
            showRiskZones={showRiskZones}
            showChoropleth={showChoropleth}
            onSelectOutbreak={(o) => onSelectOutbreak(o)}
            onSelectRegion={onSelectRegion}
          />

          {/* Legend overlay (bottom-right) */}
          <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur border rounded-md p-2 text-[10px] space-y-1 max-w-[200px] pointer-events-none">
            <div className="font-semibold text-foreground">Зоны риска</div>
            <LegendRow color="#D32F2F" label="Защита (3 км)" />
            <LegendRow color="#F57C00" label="Наблюдение (10 км)" />
            <LegendRow color="#1565C0" label="Ограничение (30 км)" />
            <div className="pt-1 border-t text-muted-foreground">
              Источник: {data?.sources.join(", ")} · обн. {data?.updated}
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-[360px] xl:w-[400px] flex-col border-l bg-background/50">
          <div className="p-3 space-y-3 overflow-y-auto thin-scroll">
            <FilterPanel
              outbreaks={data?.outbreaks ?? []}
              filters={filters}
              onChange={setFilters}
              onReset={resetFilters}
              showRiskZones={showRiskZones}
              onShowRiskZonesChange={setShowRiskZones}
              showChoropleth={showChoropleth}
              onShowChoroplethChange={setShowChoropleth}
            />
            <EpiCurve outbreaks={filtered} />
          </div>
        </aside>
      </div>

      {/* ─── Mobile: Epi curve below map ──────────────────────────── */}
      <div className="lg:hidden p-3">
        <EpiCurve outbreaks={filtered} />
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
