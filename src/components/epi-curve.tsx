"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import type { Outbreak, DiseaseKey } from "@/types/domain";
import { DISEASE_LABELS } from "@/data/diseases-normalize";
import { diseaseColor } from "@/lib/colors";

interface EpiCurveProps {
  outbreaks: Outbreak[];
}

/** Group outbreaks by ISO week and disease_group, return stacked bar data. */
function buildWeeklyData(outbreaks: Outbreak[]) {
  // Find unique weeks across all outbreaks
  const weekMap = new Map<string, Map<DiseaseKey, number>>();

  for (const o of outbreaks) {
    const d = new Date(o.date);
    if (Number.isNaN(d.getTime())) continue;
    const year = d.getFullYear();
    const onejan = new Date(year, 0, 1);
    const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    const weekKey = `${year}-W${String(week).padStart(2, "0")}`;

    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Map());
    const m = weekMap.get(weekKey)!;
    m.set(o.disease_key, (m.get(o.disease_key) ?? 0) + 1);
  }

  // Build sorted list of weeks
  const weeks = Array.from(weekMap.keys()).sort();
  return weeks.map((wk) => {
    const m = weekMap.get(wk)!;
    return { week: wk, ...Object.fromEntries(m) };
  });
}

const MONTH_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

export function EpiCurve({ outbreaks }: EpiCurveProps) {
  const [showAll, setShowAll] = useState(true);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Wait one tick after mount before rendering chart — avoids ResponsiveContainer's
  // "width(0) height(0)" warning that fires on first paint before layout settles.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const data = buildWeeklyData(outbreaks);
  const diseases = new Set<DiseaseKey>();
  for (const o of outbreaks) diseases.add(o.disease_key);
  const diseaseList = Array.from(diseases);

  return (
    <Card className="p-3 md:p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Эпидкривая по неделям</h3>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showAll ? "Только топ-5" : "Показать все"}
        </button>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: 180, minHeight: 180 }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Нет данных для выбранного фильтра
          </div>
        ) : mounted ? (
          <ResponsiveContainer width="100%" height="100%" minHeight={180}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
              <XAxis
                dataKey="week"
                tickFormatter={(wk) => {
                  const m = wk.match(/W(\d{2})$/);
                  if (!m) return wk;
                  const weekNum = parseInt(m[1], 10);
                  const month = Math.min(11, Math.floor((weekNum - 1) / 4.33));
                  return MONTH_RU[month];
                }}
                tick={{ fontSize: 10, fill: "currentColor" }}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                stroke="currentColor"
                strokeOpacity={0.3}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  color: "var(--popover-foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                cursor={{ fill: "var(--accent)", opacity: 0.1 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                formatter={(value: string) => {
                  const labels = DISEASE_LABELS[value as DiseaseKey];
                  return labels?.short_ru ?? value;
                }}
              />
              {diseaseList.map((k) => {
                const labels = DISEASE_LABELS[k];
                return (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="a"
                    fill={diseaseColor(k, labels.group)}
                    name={k}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </Card>
  );
}
