"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { Outbreak } from "@/types/domain";
import { DISEASE_PROFILES_BY_KEY } from "@/data/disease-profiles";
import { calculateRt, buildDailyCases, interpretRt } from "@/lib/rt";

interface RtChartProps {
  outbreaks: Outbreak[];
  diseaseKey?: string;
  /** Compact mode — smaller height, no axis labels (for embedding in detail panel). */
  compact?: boolean;
}

/**
 * Rt (effective reproduction number) chart.
 *
 * Shows whether the epidemic is growing (Rt > 1) or fading (Rt < 1).
 * Uses Cori et al. 2013 method with serial interval from disease profile.
 *
 * Color zones:
 *   - Red area: Rt > 1 (epidemic growing)
 *   - Green area: Rt < 1 (epidemic fading)
 *   - Dashed line at Rt = 1 (threshold)
 */
export function RtChart({ outbreaks, diseaseKey, compact = false }: RtChartProps) {
  const data = useMemo(() => {
    // Filter to specific disease if provided
    const filtered = diseaseKey
      ? outbreaks.filter((o) => o.disease_key === diseaseKey)
      : outbreaks;

    if (filtered.length < 10) return null;

    // Get serial interval from disease profile (use incubation_max as proxy)
    const profile = diseaseKey ? DISEASE_PROFILES_BY_KEY[diseaseKey] : null;
    const serialInterval = profile?.incubation_max ?? 7;

    const dailyCases = buildDailyCases(filtered);
    const rtData = calculateRt(dailyCases, {
      serialInterval,
      windowSize: 7,
      smooth: true,
    });

    return rtData;
  }, [outbreaks, diseaseKey]);

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        Недостаточно данных для расчёта Rt (нужно ≥10 вспышек)
      </div>
    );
  }

  // Последняя ИЗМЕРИМАЯ точка (rt≠null): при пустом прошлом окне (Λ=0) Rt
  // неизмерим и приходит как null — раньше там была заглушка rt=1, теперь
  // честное «н/д» (и разрыв линии на графике).
  const latestMeasured = [...data].reverse().find((p) => p.rt != null) ?? null;
  const interpretation = latestMeasured?.rt != null ? interpretRt(latestMeasured.rt) : null;

  return (
    <div className="space-y-2">
      {/* Rt summary badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {interpretation ? <span className="text-lg">{interpretation.emoji}</span> : null}
          <div>
            <div className="text-xs text-muted-foreground">Текущий Rt</div>
            {latestMeasured && latestMeasured.rt != null ? (
              <div className="text-sm font-bold" style={{ color: interpretation?.color }}>
                {latestMeasured.rt.toFixed(2)}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  (95% ДИ: {latestMeasured.ciLower?.toFixed(2)}–{latestMeasured.ciUpper?.toFixed(2)})
                </span>
              </div>
            ) : (
              <div className="text-sm font-bold text-muted-foreground">
                н/д{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  (нет случаев в прошлом окне)
                </span>
              </div>
            )}
          </div>
        </div>
        <div
          className="text-xs font-medium"
          style={{ color: interpretation?.color ?? "var(--muted-foreground)" }}
        >
          {interpretation?.label ?? "Rt не измерим"}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={compact ? 120 : 200}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <defs>
            <linearGradient id="rtGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "currentColor" } as any}
            stroke="currentColor"
            strokeOpacity={0.3}
            tickFormatter={(d) => {
              const dt = new Date(d);
              return `${dt.getDate()}.${dt.getMonth() + 1}`;
            }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "currentColor" } as any}
            stroke="currentColor"
            strokeOpacity={0.3}
            domain={[0, "dataMax + 0.5"]}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            labelFormatter={(d) => {
              const dt = new Date(d);
              return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
            }}
            formatter={((v: number | null) => {
              const point = v == null ? null : data.find((p) => p.rt === v);
              if (point && point.rt != null) {
                return [
                  `Rt: ${point.rt.toFixed(2)} (ДИ: ${point.ciLower?.toFixed(2)}–${point.ciUpper?.toFixed(2)})`,
                  `Случаев: ${point.cases}`,
                ];
              }
              if (v == null) return ["Rt: н/д", "Нет данных"];
              return [v.toFixed(2), "Rt"];
            }) as any}
          />
          {/* Rt = 1 threshold line */}
          <ReferenceLine y={1} stroke="var(--destructive)" strokeDasharray="4 4" strokeWidth={1.5}>
          </ReferenceLine>

          {/* Rt area */}
          <Area
            type="monotone"
            dataKey="rt"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#rtGradient)"
            name="Rt"
          />

          {/* CI bounds */}
          <Area
            type="monotone"
            dataKey="ciUpper"
            stroke="none"
            fill="var(--primary)"
            fillOpacity={0.08}
            name="95% ДИ"
          />
          <Area
            type="monotone"
            dataKey="ciLower"
            stroke="none"
            fill="var(--background)"
            fillOpacity={1}
            name="95% ДИ нижн."
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary" /> Rt
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 border-t-2 border-dashed border-destructive" /> Rt = 1 (порог)
        </div>
        <div className="ml-auto">
          Окно: 7 дней · Сериал. интервал: {DISEASE_PROFILES_BY_KEY[diseaseKey ?? ""]?.incubation_max ?? 7} дн.
        </div>
      </div>
    </div>
  );
}
