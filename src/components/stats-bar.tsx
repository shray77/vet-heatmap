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
      color: "var(--chart-1)",
      icon: Activity,
    },
    {
      label: "Активные",
      value: ongoing,
      color: "var(--destructive)",
      icon: AlertTriangle,
    },
    {
      label: "Регионов затронуто",
      value: `${affectedRegions}/${totalRegions}`,
      color: "var(--chart-4)",
      icon: MapPin,
    },
    {
      label: "Типов болезней",
      value: diseaseTypes,
      color: "var(--chart-3)",
      icon: Biohazard,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
      {cards.map((c) => (
        <Card
          key={c.label}
          className="px-3 py-2 md:px-4 md:py-3 flex flex-col md:flex-row md:items-center gap-1 md:gap-3"
        >
          <c.icon
            className="h-5 w-5 md:h-6 md:w-6 shrink-0"
            style={{ color: c.color }}
            aria-hidden
          />
          <div className="min-w-0">
            <div
              className="text-xl md:text-2xl font-bold leading-none truncate"
              style={{ color: c.color }}
            >
              {c.value}
            </div>
            <div className="text-[10px] md:text-xs text-muted-foreground truncate mt-1">
              {c.label}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
