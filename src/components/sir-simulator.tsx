"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { Activity, Users, AlertCircle, Heart, TrendingUp, Beaker } from "lucide-react";
import type { DiseaseKey } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";

interface SIRSimulatorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preselectDisease?: DiseaseKey | null;
}

interface SIRPoint {
  day: number;
  S: number;
  I: number;
  R: number;
  // Cumulative infected (for "total cases" stat)
  cumulative: number;
}

/**
 * Run a discrete SIR simulation.
 *
 * Equations (Euler method, dt = 0.1 day for stability):
 *   dS = -β * S * I / N * dt
 *   dI =  (β * S * I / N - γ * I) * dt
 *   dR =  γ * I * dt
 *
 * Where:
 *   β = R0 * γ  (so R0 = β / γ)
 *   γ = 1 / infectious_period_days
 *   N = S + I + R (constant)
 */
function runSIR(
  N: number,
  initialInfected: number,
  r0: number,
  infectiousDays: number,
  totalDays: number,
): SIRPoint[] {
  const points: SIRPoint[] = [];
  const dt = 0.5; // days per step (smaller = smoother but more compute)
  const gamma = 1 / infectiousDays;
  const beta = r0 * gamma;

  let S = N - initialInfected;
  let I = initialInfected;
  let R = 0;
  let cumulative = initialInfected;

  // Initial point
  points.push({ day: 0, S: Math.round(S), I: Math.round(I), R: Math.round(R), cumulative: Math.round(cumulative) });

  for (let day = dt; day <= totalDays; day += dt) {
    // Sub-step for stability
    for (let sub = 0; sub < 5; sub++) {
      const dS = -beta * S * I / N * (dt / 5);
      const dI = (beta * S * I / N - gamma * I) * (dt / 5);
      const dR = gamma * I * (dt / 5);
      S += dS;
      I += dI;
      R += dR;
      cumulative += Math.max(0, dI); // new infections
      // Numerical guard
      if (S < 0) S = 0;
      if (I < 0) I = 0;
      if (R < 0) R = 0;
    }
    // Record every full day
    points.push({
      day: Math.round(day),
      S: Math.round(S),
      I: Math.round(I),
      R: Math.round(R),
      cumulative: Math.round(cumulative),
    });
  }

  return points;
}

/** Compute herd immunity threshold: 1 - 1/R0 */
function herdImmunityThreshold(r0: number): number {
  if (r0 <= 1) return 0;
  return (1 - 1 / r0) * 100;
}

export function SIRSimulator({ open, onOpenChange, preselectDisease }: SIRSimulatorProps) {
  const [disease, setDisease] = useState<DiseaseKey | null>(preselectDisease ?? "asf");
  const [r0, setR0] = useState<number>(4);
  const [population, setPopulation] = useState<number>(10000);
  const [initialInfected, setInitialInfected] = useState<number>(10);
  const [infectiousDays, setInfectiousDays] = useState<number>(7);
  const [totalDays, setTotalDays] = useState<number>(90);
  const [chartReady, setChartReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track which disease we've already loaded defaults for, to avoid clobbering
  // user edits when the same disease is re-selected
  const [loadedDisease, setLoadedDisease] = useState<string | null>(null);

  // When disease changes (and differs from what's already loaded),
  // load its default R0 + incubation from profile.
  // Use a click handler instead of useEffect to avoid setState-in-effect lint.
  const applyDiseasePreset = (key: DiseaseKey) => {
    setDisease(key);
    if (key !== loadedDisease) {
      const profile = DISEASE_PROFILES.find((p) => p.disease_key === key);
      if (profile) {
        setR0(Math.round((profile.r0_min + profile.r0_max) / 2 * 10) / 10);
        setInfectiousDays(profile.incubation_max);
      }
      setLoadedDisease(key);
    }
  };

  // Defer chart render to next frame to avoid width=0 warning.
  // Using rAF-only (no setState in effect body) to satisfy React 19 rules.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => {
      cancelAnimationFrame(id);
      setChartReady(false);
    };
  }, [open]);

  const simulation: SIRPoint[] = useMemo(() => {
    return runSIR(population, initialInfected, r0, infectiousDays, totalDays);
  }, [population, initialInfected, r0, infectiousDays, totalDays]);

  // Peak statistics
  const peak = useMemo(() => {
    let peakI = 0;
    let peakDay = 0;
    let finalCumulative = 0;
    for (const p of simulation) {
      if (p.I > peakI) {
        peakI = p.I;
        peakDay = p.day;
      }
      finalCumulative = p.cumulative;
    }
    return {
      peakI,
      peakDay,
      finalCumulative,
      attackRate: (finalCumulative / population) * 100,
    };
  }, [simulation, population]);

  const herdImmunity = herdImmunityThreshold(r0);
  const neededVaccinated = Math.round((population * herdImmunity) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            SIR-симулятор вспышки
          </DialogTitle>
          <DialogDescription>
            Модель SIR прогнозирует распространение болезни в популяции.
            Не является точным прогнозом — учебный инструмент для понимания.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ─── Controls ─── */}
          <div className="space-y-4">
            {/* Disease preset */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Болезнь (пресет)</Label>
              <Select
                value={disease ?? ""}
                onValueChange={(v) => applyDiseasePreset(v as DiseaseKey)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Выберите болезнь" />
                </SelectTrigger>
                <SelectContent>
                  {DISEASE_PROFILES.map((p) => (
                    <SelectItem key={p.disease_key} value={p.disease_key}>
                      {p.short_ru} — {p.name_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Загружает средний R₀ и инкубационный из справочника
              </p>
            </div>

            <Separator />

            {/* R0 slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  R₀ (базовое репродуктивное число)
                </Label>
                <Badge variant="outline" className="text-xs tabular-nums">
                  {r0.toFixed(1)}
                </Badge>
              </div>
              <Slider
                value={[r0]}
                onValueChange={(v) => setR0(v[0])}
                min={0.5}
                max={20}
                step={0.1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0.5 (спокойная)</span>
                <span>20 (взрывная)</span>
              </div>
            </div>

            {/* Population */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Популяция (восприимчивых)
                </Label>
                <Badge variant="outline" className="text-xs tabular-nums">
                  {population.toLocaleString("ru-RU")}
                </Badge>
              </div>
              <Slider
                value={[Math.log10(population)]}
                onValueChange={(v) => setPopulation(Math.round(Math.pow(10, v[0])))}
                min={2}    // 100
                max={7}    // 10 000 000
                step={0.1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>100</span>
                <span>10 млн</span>
              </div>
            </div>

            {/* Initial infected */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Начальное число инфицированных
                </Label>
                <Badge variant="destructive" className="text-xs tabular-nums">
                  {initialInfected.toLocaleString("ru-RU")}
                </Badge>
              </div>
              <Slider
                value={[initialInfected]}
                onValueChange={(v) => setInitialInfected(v[0])}
                min={1}
                max={Math.min(1000, population / 10)}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1</span>
                <span>{Math.min(1000, Math.floor(population / 10)).toLocaleString("ru-RU")}</span>
              </div>
            </div>

            {/* Infectious period */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  Длительность инфекции (дни)
                </Label>
                <Badge variant="outline" className="text-xs tabular-nums">
                  {infectiousDays} дн
                </Badge>
              </div>
              <Slider
                value={[infectiousDays]}
                onValueChange={(v) => setInfectiousDays(v[0])}
                min={1}
                max={60}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1 день</span>
                <span>60 дней</span>
              </div>
            </div>

            {/* Total days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Горизонт прогноза (дни)</Label>
                <Badge variant="outline" className="text-xs tabular-nums">
                  {totalDays} дн
                </Badge>
              </div>
              <Slider
                value={[totalDays]}
                onValueChange={(v) => setTotalDays(v[0])}
                min={30}
                max={365}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>30 дн</span>
                <span>365 дн</span>
              </div>
            </div>
          </div>

          {/* ─── Results ─── */}
          <div className="space-y-3">
            {/* Key stats */}
            <div className="grid grid-cols-2 gap-2">
              <Card className="p-2.5 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <div className="text-base font-bold tabular-nums text-destructive">
                    {peak.peakI.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Пик больных</div>
                </div>
              </Card>
              <Card className="p-2.5 flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <div className="text-base font-bold tabular-nums">
                    День {peak.peakDay}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Пик эпидемии</div>
                </div>
              </Card>
              <Card className="p-2.5 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-base font-bold tabular-nums">
                    {peak.finalCumulative.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Всего переболеет</div>
                </div>
              </Card>
              <Card className="p-2.5 flex items-center gap-2">
                <Heart className="h-5 w-5 text-blue-500 shrink-0" />
                <div>
                  <div className="text-base font-bold tabular-nums">
                    {peak.attackRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">Атака популяции</div>
                </div>
              </Card>
            </div>

            {/* Herd immunity */}
            <Card className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Коллективный иммунитет</span>
                <Badge variant="secondary" className="text-xs">
                  {herdImmunity.toFixed(0)}% популяции
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Нужно вакцинировать минимум{" "}
                <strong className="text-foreground">
                  {neededVaccinated.toLocaleString("ru-RU")}
                </strong>{" "}
                животных, чтобы остановить распространение.
              </div>
            </Card>

            {/* Chart */}
            <Card className="p-3">
              <div className="text-xs font-medium mb-2">
                Кривые S (восприимчивые) / I (больные) / R (выздоровевшие)
              </div>
              <div ref={containerRef} style={{ width: "100%", height: 240, minHeight: 240 }}>
                {chartReady && (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <LineChart data={simulation} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        label={{ value: "День", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "currentColor" } }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          color: "var(--popover-foreground)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                        labelFormatter={(d) => `День ${d}`}
                        formatter={(v: number, name) => {
                          const labels: Record<string, string> = { S: "Восприимчивые", I: "Больные", R: "Выздоровевшие" };
                          return [v.toLocaleString("ru-RU"), labels[name] ?? name];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(name) => {
                          const labels: Record<string, string> = { S: "Восприимчивые", I: "Больные", R: "Выздоровевшие" };
                          return labels[name] ?? name;
                        }}
                      />
                      <ReferenceLine
                        y={peak.peakI}
                        stroke="var(--destructive)"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                        label={{ value: `Пик: ${peak.peakI.toLocaleString("ru-RU")}`, fontSize: 10, fill: "var(--destructive)", position: "right" }}
                      />
                      <Line type="monotone" dataKey="S" stroke="#1565C0" strokeWidth={2} dot={false} name="S" />
                      <Line type="monotone" dataKey="I" stroke="#D32F2F" strokeWidth={2} dot={false} name="I" />
                      <Line type="monotone" dataKey="R" stroke="#2E7D32" strokeWidth={2} dot={false} name="R" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              ⚠️ Модель SIR упрощённая: не учитывает пространственное распределение,
              неоднородность популяции, вмешательства (карантин, вакцинация во время
              вспышки), инкубационный период (используйте SEIR для этого), и многое
              другое. Для реального планирования обратитесь к эпизоотологу.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
