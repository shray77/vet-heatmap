"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle, Activity, MapPin, Biohazard } from "lucide-react";
import type { Outbreak } from "@/types/domain";

interface StatsBarProps {
  outbreaks: Outbreak[];
  totalRegions: number;
}

export function StatsBar({ outbreaks, totalRegions }: StatsBarProps) {
  const total = outbreaks.length;
  const ongoing = outbreaks.filter((o) => o.status === "Ongoing").length;
  const affectedRegions = new Set(outbreaks.map((o) => o.region_geo).filter(Boolean)).size;
  const diseaseTypes = new Set(outbreaks.map((o) => o.disease_key)).size;

  const cards = [
    {
      label: "Всего вспышек",
      value: total,
      // neutral primary — readable on both light/dark
      color: "var(--foreground)",
      icon: Activity,
    },
    {
      label: "Активные",
      value: ongoing,
      // destructive — strong red, AAA contrast on bg
      color: "var(--destructive)",
      icon: AlertTriangle,
      // emphasize ongoing with subtle bg tint
      highlight: ongoing > 0,
    },
    {
      label: "Регионов затронуто",
      value: `${affectedRegions}/${totalRegions}`,
      // chart-4 (info blue) — but use foreground for the number, color only the icon
      color: "var(--foreground)",
      iconColor: "var(--chart-4)",
      icon: MapPin,
    },
    {
      label: "Типов болезней",
      value: diseaseTypes,
      color: "var(--foreground)",
      iconColor: "var(--chart-3)",
      icon: Biohazard,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
      {cards.map((c) => (
        <Card
          key={c.label}
          className={`px-3 py-2 md:px-4 md:py-3 flex items-center gap-3 transition-colors ${
            c.highlight ? "border-destructive/30 bg-destructive/5" : ""
          }`}
        >
          <c.icon
            className="h-5 w-5 md:h-6 md:w-6 shrink-0"
            style={{ color: c.iconColor ?? c.color }}
            aria-hidden
          />
          {/* Number + label, baseline-aligned in a column */}
          <div className="min-w-0 flex flex-col justify-center">
            <div
              className="text-xl md:text-2xl font-bold leading-none tabular-nums"
              style={{ color: c.color }}
            >
              {c.value}
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground leading-tight mt-1 truncate">
              {c.label}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
