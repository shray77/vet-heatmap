"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X, ChevronDown } from "lucide-react";
import { speciesRu } from "@/lib/i18n-species";
import type { Outbreak, DiseaseKey, OutbreakStatus } from "@/types/domain";
import { DISEASE_LABELS } from "@/data/diseases-normalize";
import { diseaseColor } from "@/lib/colors";
import type { FilterState } from "@/lib/filters";

interface FilterPanelProps {
  outbreaks: Outbreak[];
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
  showRiskZones: boolean;
  onShowRiskZonesChange: (v: boolean) => void;
  showChoropleth: boolean;
  onShowChoroplethChange: (v: boolean) => void;
  showHeatmap?: boolean;
  onShowHeatmapChange?: (v: boolean) => void;
}

export function FilterPanel({
  outbreaks,
  filters,
  onChange,
  onReset,
  showRiskZones,
  onShowRiskZonesChange,
  showChoropleth,
  onShowChoroplethChange,
  showHeatmap = false,
  onShowHeatmapChange,
}: FilterPanelProps) {
  // Compute available filter options from the data
  const allDiseases = useMemo(() => {
    const counts = new Map<DiseaseKey, number>();
    for (const o of outbreaks) counts.set(o.disease_key, (counts.get(o.disease_key) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [outbreaks]);

  const allSpecies = useMemo(() => {
    const set = new Set<string>();
    for (const o of outbreaks) set.add(o.species);
    return Array.from(set).sort();
  }, [outbreaks]);

  const statuses: OutbreakStatus[] = ["Ongoing", "Resolved", "Unknown"];

  const toggleDisease = (k: DiseaseKey) => {
    const has = filters.diseases.includes(k);
    onChange({
      ...filters,
      diseases: has ? filters.diseases.filter((x) => x !== k) : [...filters.diseases, k],
    });
  };

  const toggleSpecies = (s: string) => {
    const has = filters.species.includes(s);
    onChange({
      ...filters,
      species: has ? filters.species.filter((x) => x !== s) : [...filters.species, s],
    });
  };

  const toggleStatus = (s: OutbreakStatus) => {
    const has = filters.statuses.includes(s);
    onChange({
      ...filters,
      statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s],
    });
  };

  const activeCount =
    filters.diseases.length +
    filters.species.length +
    filters.statuses.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  return (
    <Card className="p-3 md:p-4 space-y-3">
      {/* Search */}
      <div className="space-y-1.5">
        <Label htmlFor="search" className="text-xs font-medium text-muted-foreground">
          Поиск
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Болезнь, регион, вид…"
            className="pl-9 h-9 text-sm"
          />
          {filters.query && (
            <button
              onClick={() => onChange({ ...filters, query: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Очистить"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Disease filter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Болезнь</Label>
          {filters.diseases.length > 0 && (
            <button
              onClick={() => onChange({ ...filters, diseases: [] })}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              сбросить
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto thin-scroll">
          {allDiseases.map(([k, n]) => {
            const active = filters.diseases.includes(k);
            const labels = DISEASE_LABELS[k];
            const color = diseaseColor(k, labels.group);
            return (
              <button
                key={k}
                onClick={() => toggleDisease(k)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors"
                style={{
                  backgroundColor: active ? color : "transparent",
                  borderColor: color,
                  color: active ? "#fff" : color,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color, opacity: active ? 0.5 : 1 }}
                />
                {labels.short_ru}
                <span style={{ opacity: 0.7 }}>({n})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Species filter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">Вид животных</Label>
          {filters.species.length > 0 && (
            <button
              onClick={() => onChange({ ...filters, species: [] })}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              сбросить
            </button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-normal">
              {filters.species.length === 0
                ? "Все виды"
                : `${filters.species.length} выбрано`}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-72 overflow-y-auto" align="start">
            <div className="space-y-1.5">
              {allSpecies.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-accent/30 rounded px-1"
                >
                  <Checkbox
                    checked={filters.species.includes(s)}
                    onCheckedChange={() => toggleSpecies(s)}
                  />
                  <span className="text-xs">{speciesRu(s)}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status filter */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Статус</Label>
        <div className="flex gap-1.5">
          {statuses.map((s) => {
            const active = filters.statuses.includes(s);
            const label =
              s === "Ongoing" ? "Активные" : s === "Resolved" ? "Завершённые" : "Неизвестно";
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => toggleStatus(s)}
                className="h-7 text-xs flex-1"
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Date range */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Период</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) =>
              onChange({ ...filters, dateFrom: e.target.value || null })
            }
            className="h-8 text-xs"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <Input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) =>
              onChange({ ...filters, dateTo: e.target.value || null })
            }
            className="h-8 text-xs"
          />
        </div>
        {/* Quick date shortcuts */}
        <div className="flex flex-wrap gap-1 pt-1">
          {[
            { label: "30д", days: 30 },
            { label: "90д", days: 90 },
            { label: "1 год", days: 365 },
            { label: "2 года", days: 730 },
            { label: "Всё время", days: null as number | null },
          ].map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2"
              onClick={() => {
                if (p.days === null) {
                  onChange({ ...filters, dateFrom: null, dateTo: null });
                } else {
                  const d = new Date();
                  d.setDate(d.getDate() - p.days);
                  onChange({ ...filters, dateFrom: d.toISOString().slice(0, 10), dateTo: null });
                }
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Layer toggles */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center justify-between">
          <Label htmlFor="risk-zones" className="text-xs cursor-pointer">
            Зоны риска 3/10/30 км
          </Label>
          <Switch
            id="risk-zones"
            checked={showRiskZones}
            onCheckedChange={onShowRiskZonesChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="choropleth" className="text-xs cursor-pointer">
            Хороплет (плотность)
          </Label>
          <Switch
            id="choropleth"
            checked={showChoropleth}
            onCheckedChange={onShowChoroplethChange}
          />
        </div>
        {onShowHeatmapChange && (
          <div className="flex items-center justify-between">
            <Label htmlFor="heatmap" className="text-xs cursor-pointer">
              Тепловая карта вспышек
            </Label>
            <Switch
              id="heatmap"
              checked={showHeatmap}
              onCheckedChange={onShowHeatmapChange}
            />
          </div>
        )}
      </div>

      {/* Reset */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onReset}
        >
          Сбросить все фильтры ({activeCount})
        </Button>
      )}
    </Card>
  );
}
