"use client";

import { useMemo } from "react";
import { AlertTriangle, Activity, MapPin, Biohazard, Download, TrendingUp } from "lucide-react";
import type { Outbreak, DiseaseKey } from "@/types/domain";
import { exportOutbreaksCSV } from "@/lib/csv-export";
import { DISEASE_LABELS } from "@/data/diseases-normalize";
import { diseaseColor } from "@/lib/colors";

interface StatsBarProps {
  outbreaks: Outbreak[];
  totalRegions: number;
  /** Opens the disease profile drawer (was in the removed TodaySummary strip). */
  onSelectDisease?: (key: DiseaseKey) => void;
}

/**
 * Single KPI row: total / active / regions / diseases / cases + top-3 active
 * diseases + CSV export. Absorbs the old TodaySummary strip (one chrome row
 * less above the map). All stats are memoized on the outbreaks identity.
 */
export function StatsBar({ outbreaks, totalRegions, onSelectDisease }: StatsBarProps) {
  const stats = useMemo(() => {
    const ongoingCounts = new Map<DiseaseKey, number>();
    const regions = new Set<string>();
    const diseaseTypes = new Set<Outbreak["disease_key"]>();
    let ongoing = 0;
    let totalCases = 0;

    for (const o of outbreaks) {
      totalCases += o.cases || 0;
      diseaseTypes.add(o.disease_key);
      if (o.region_geo) regions.add(o.region_geo);
      if (o.status === "Ongoing") {
        ongoing++;
        ongoingCounts.set(o.disease_key, (ongoingCounts.get(o.disease_key) ?? 0) + 1);
      }
    }

    const top3 = Array.from(ongoingCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      total: outbreaks.length,
      ongoing,
      regions: regions.size,
      diseases: diseaseTypes.size,
      totalCases,
      top3,
    };
  }, [outbreaks]);

  const items = [
    { label: "Всего", value: stats.total, icon: Activity, color: "var(--foreground)", pulse: false },
    { label: "Активных", value: stats.ongoing, icon: AlertTriangle, color: "var(--destructive)", pulse: stats.ongoing > 0 },
    { label: "Регионов", value: `${stats.regions}/${totalRegions}`, icon: MapPin, color: "var(--chart-4)", pulse: false },
    { label: "Болезней", value: stats.diseases, icon: Biohazard, color: "var(--chart-3)", pulse: false },
    { label: "Случаев", value: stats.totalCases >= 1000 ? `${(stats.totalCases / 1000).toFixed(1)}k` : stats.totalCases, icon: TrendingUp, color: "var(--foreground)", pulse: false },
  ];

  return (
    <>
      {/* Desktop: inline KPI bar + top diseases + CSV export */}
      <div className="hidden md:flex items-center gap-4 px-1">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2">
            {i > 0 && <div className="h-4 w-px bg-border" />}
            <item.icon className="h-4 w-4 shrink-0" style={{ color: item.color }} aria-hidden />
            {item.pulse && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
            )}
            <span className="text-lg font-bold tabular-nums tracking-tight" style={{ color: item.color }}>
              {item.value}
            </span>
            <span className="text-xs text-muted-foreground tracking-tight">{item.label}</span>
          </div>
        ))}
        {/* Top-3 active diseases (from the removed TodaySummary strip) */}
        {stats.top3.length > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              {stats.top3.map(([key, count]) => {
                const labels = DISEASE_LABELS[key];
                if (!labels) return null;
                const color = diseaseColor(key, labels.group);
                return (
                  <button
                    key={key}
                    onClick={() => onSelectDisease?.(key)}
                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-accent"
                    style={{ borderColor: color + "55" }}
                    title={`${labels.ru} — ${count} активных (клик — открыть профиль)`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-medium text-foreground">{labels.short_ru}</span>
                    <span className="text-muted-foreground tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {/* CSV export button — exports currently filtered outbreaks */}
        <button
          onClick={() => exportOutbreaksCSV(outbreaks)}
          disabled={outbreaks.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={`Экспорт ${outbreaks.length} вспышек в CSV (Excel-совместимый)`}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>

      {/* Mobile: 2x2 compact grid */}
      <div className="md:hidden grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border"
          >
            {item.pulse && (
              <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
              </span>
            )}
            <item.icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} aria-hidden />
            <span className="text-sm font-bold tabular-nums" style={{ color: item.color }}>
              {item.value}
            </span>
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
