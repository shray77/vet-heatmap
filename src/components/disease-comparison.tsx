"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { GitCompare } from "lucide-react";
import type { DiseaseKey } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";
import { DISEASE_LABELS } from "@/data/diseases-normalize";
import { diseaseColor } from "@/lib/colors";

interface DiseaseComparisonProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const METRICS = [
  { key: "r0", label: "R₀", max: 20, getValue: (p: typeof DISEASE_PROFILES[0]) => (p.r0_min + p.r0_max) / 2 },
  { key: "incubation", label: "Инкубац.", max: 60, getValue: (p: typeof DISEASE_PROFILES[0]) => (p.incubation_min + p.incubation_max) / 2 },
  { key: "quarantine", label: "Карантин", max: 365, getValue: (p: typeof DISEASE_PROFILES[0]) => p.restriction_days },
  { key: "zones", label: "Зоны", max: 150, getValue: (p: typeof DISEASE_PROFILES[0]) => p.restriction_zone_km },
  { key: "observation", label: "Наблюд.", max: 365, getValue: (p: typeof DISEASE_PROFILES[0]) => p.observation_days },
  { key: "spread", label: "Spread", max: 50, getValue: (p: typeof DISEASE_PROFILES[0]) => (p.r0_min + p.r0_max) / 2 * p.incubation_max / 7 },
];

export function DiseaseComparison({ open, onOpenChange }: DiseaseComparisonProps) {
  const [disease1, setDisease1] = useState<DiseaseKey>("asf");
  const [disease2, setDisease2] = useState<DiseaseKey>("fmd");
  const [disease3, setDisease3] = useState<DiseaseKey | "">("");

  const selectedDiseases = useMemo(() => {
    const list = [disease1, disease2];
    if (disease3) list.push(disease3);
    return list.filter(Boolean);
  }, [disease1, disease2, disease3]);

  const chartData = useMemo(() => {
    return METRICS.map((metric) => {
      const point: Record<string, number | string> = { metric: metric.label };
      for (const key of selectedDiseases) {
        const profile = DISEASE_PROFILES.find((p) => p.disease_key === key);
        if (profile) {
          const value = metric.getValue(profile);
          point[key] = Math.min(100, (value / metric.max) * 100);
        }
      }
      return point;
    });
  }, [selectedDiseases]);

  const comparisonTable = useMemo(() => {
    return selectedDiseases.map((key) => {
      const profile = DISEASE_PROFILES.find((p) => p.disease_key === key);
      const labels = DISEASE_LABELS[key];
      if (!profile) return null;
      return {
        key,
        name: labels?.short_ru ?? profile.name_ru,
        color: diseaseColor(key, profile.group),
        r0: `${profile.r0_min}-${profile.r0_max}`,
        incubation: `${profile.incubation_min}-${profile.incubation_max} дн`,
        quarantine: `${profile.restriction_days} дн`,
        zones: `${profile.protection_zone_km}/${profile.surveillance_zone_km}/${profile.restriction_zone_km} км`,
        vaccine: profile.vaccine_available,
        zoonotic: profile.zoonotic,
      };
    }).filter(Boolean);
  }, [selectedDiseases]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Сравнение болезней
          </DialogTitle>
          <DialogDescription>
            Сравните до 3 болезней по ключевым параметрам
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          {[
            { value: disease1, onChange: setDisease1, label: "Болезнь 1" },
            { value: disease2, onChange: setDisease2, label: "Болезнь 2" },
            { value: disease3, onChange: (v: string) => setDisease3(v as DiseaseKey | ""), label: "Болезнь 3 (опц.)" },
          ].map((sel, i) => (
            <div key={i}>
              <label className="text-[10px] text-muted-foreground">{sel.label}</label>
              <Select value={sel.value} onValueChange={sel.onChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {DISEASE_PROFILES.map((p) => (
                    <SelectItem key={p.disease_key} value={p.disease_key}>
                      {p.short_ru} — {p.name_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* Radar chart */}
        <Card className="p-3 mb-3">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData}>
                <PolarGrid stroke="currentColor" strokeOpacity={0.2} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "currentColor" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "currentColor" }} />
                {selectedDiseases.map((key, i) => {
                  const profile = DISEASE_PROFILES.find((p) => p.disease_key === key);
                  const color = profile ? diseaseColor(key, profile.group) : "#999";
                  return (
                    <Radar
                      key={key}
                      name={DISEASE_LABELS[key]?.short_ru ?? key}
                      dataKey={key}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  );
                })}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Comparison table */}
        <Card className="p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Параметр</th>
                {comparisonTable.map((d) => (
                  <th key={d!.key} className="text-center py-2" style={{ color: d!.color }}>
                    {d!.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">R₀</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center tabular-nums">{d!.r0}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Инкубационный</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center">{d!.incubation}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Карантин (дн)</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center tabular-nums">{d!.quarantine}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Зоны (км)</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center">{d!.zones}</td>)}
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground">Вакцина</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center">{d!.vaccine ? "✅" : "❌"}</td>)}
              </tr>
              <tr>
                <td className="py-2 text-muted-foreground">Зооноз</td>
                {comparisonTable.map((d) => <td key={d!.key} className="text-center">{d!.zoonotic ? "⚠️" : "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
