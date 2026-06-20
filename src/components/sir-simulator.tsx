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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Area,
  AreaChart,
} from "recharts";
import {
  Activity, Users, AlertCircle, Heart, TrendingUp, Beaker,
  Syringe, ShieldHalf, Skull, Clock,
} from "lucide-react";
import type { DiseaseKey } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";

interface SIRSimulatorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preselectDisease?: DiseaseKey | null;
}

// ─── SEIR + D (deaths) + interventions ────────────────────────────────────
//
// Compartments:
//   S  susceptible
//   E  exposed (infected but not yet infectious — incubation period)
//   I  infectious (active cases)
//   R  recovered (immune)
//   D  dead
//
// Equations (Euler method):
//   dS = -β·S·I/N + (vaccination rate after intervention day)
//   dE = β·S·I/N - σ·E
//   dI = σ·E - γ·I - μ·I
//   dR = γ·I
//   dD = μ·I
//
// Where:
//   β  = transmission rate (R0 = β / (γ + μ))
//   σ  = 1 / incubation_days (rate E → I)
//   γ  = 1 / infectious_days (rate I → R)
//   μ  = case fatality rate / infectious_days (rate I → D)
//
// Interventions (toggleable, with start day):
//   - Quarantine: reduces β by quarantine efficacy (e.g., 60% reduction)
//   - Vaccination: moves S → R at vaccination rate (e.g., 1%/day after day N)

interface SimPoint {
  day: number;
  S: number;
  E: number;
  I: number;
  R: number;
  D: number;
  // Cumulative ever-infected (E + I + R + D)
  cumulative: number;
  // Effective R at this point (depends on susceptible fraction + intervention)
  Reff: number;
}

interface SimParams {
  N: number;                  // total population
  initialInfected: number;    // I(0)
  r0: number;                 // basic reproduction number
  incubationDays: number;     // σ = 1/this
  infectiousDays: number;     // γ = 1/this
  caseFatalityRate: number;   // 0..1, fraction of I who die
  totalDays: number;          // simulation horizon
  // Interventions
  quarantineEnabled: boolean;
  quarantineStartDay: number;
  quarantineEfficacy: number; // 0..1, fraction of contacts prevented
  vaccinationEnabled: boolean;
  vaccinationStartDay: number;
  vaccinationRatePerDay: number; // fraction of S vaccinated per day
}

function runSEIR(p: SimParams): SimPoint[] {
  const points: SimPoint[] = [];
  const dt = 0.5;
  const sigma = 1 / p.incubationDays;
  const gamma = 1 / p.infectiousDays;
  const mu = p.caseFatalityRate * gamma; // per-day mortality rate
  const baseBeta = p.r0 * (gamma + mu);

  let S = p.N - p.initialInfected;
  let E = 0;
  let I = p.initialInfected;
  let R = 0;
  let D = 0;

  const cumulative0 = p.initialInfected;
  points.push({
    day: 0,
    S: Math.round(S), E: Math.round(E), I: Math.round(I),
    R: Math.round(R), D: Math.round(D),
    cumulative: Math.round(cumulative0),
    Reff: p.r0 * (S / p.N),
  });

  for (let day = dt; day <= p.totalDays; day += dt) {
    // Sub-step for numerical stability
    for (let sub = 0; sub < 5; sub++) {
      const subDt = dt / 5;
      const isQuarantined = p.quarantineEnabled && day >= p.quarantineStartDay;
      const isVaccinating = p.vaccinationEnabled && day >= p.vaccinationStartDay;
      const beta = isQuarantined ? baseBeta * (1 - p.quarantineEfficacy) : baseBeta;

      const newInfections = beta * S * I / p.N * subDt;
      const newInfectious = sigma * E * subDt;
      const newRecoveries = gamma * I * subDt;
      const newDeaths = mu * I * subDt;
      const newVaccinated = isVaccinating ? p.vaccinationRatePerDay * S * subDt : 0;

      S += -newInfections - newVaccinated;
      E += newInfections - newInfectious;
      I += newInfectious - newRecoveries - newDeaths;
      R += newRecoveries + newVaccinated;
      D += newDeaths;

      if (S < 0) S = 0;
      if (E < 0) E = 0;
      if (I < 0) I = 0;
      if (R < 0) R = 0;
      if (D < 0) D = 0;
    }

    const cumulative = E + I + R + D;
    const Reff = (S / p.N) * p.r0 *
      (p.quarantineEnabled && day >= p.quarantineStartDay
        ? (1 - p.quarantineEfficacy)
        : 1);

    points.push({
      day: Math.round(day),
      S: Math.round(S), E: Math.round(E), I: Math.round(I),
      R: Math.round(R), D: Math.round(D),
      cumulative: Math.round(cumulative),
      Reff: Math.round(Reff * 100) / 100,
    });
  }
  return points;
}

function herdImmunityThreshold(r0: number): number {
  if (r0 <= 1) return 0;
  return (1 - 1 / r0) * 100;
}

export function SIRSimulator({ open, onOpenChange, preselectDisease }: SIRSimulatorProps) {
  const [disease, setDisease] = useState<DiseaseKey | null>(preselectDisease ?? "asf");
  const [r0, setR0] = useState<number>(4);
  const [population, setPopulation] = useState<number>(10000);
  const [initialInfected, setInitialInfected] = useState<number>(10);
  const [incubationDays, setIncubationDays] = useState<number>(7);
  const [infectiousDays, setInfectiousDays] = useState<number>(7);
  const [caseFatalityRate, setCaseFatalityRate] = useState<number>(0.05);
  const [totalDays, setTotalDays] = useState<number>(120);
  // Interventions
  const [quarantineEnabled, setQuarantineEnabled] = useState<boolean>(false);
  const [quarantineStartDay, setQuarantineStartDay] = useState<number>(14);
  const [quarantineEfficacy, setQuarantineEfficacy] = useState<number>(0.6);
  const [vaccinationEnabled, setVaccinationEnabled] = useState<boolean>(false);
  const [vaccinationStartDay, setVaccinationStartDay] = useState<number>(21);
  const [vaccinationRatePerDay, setVaccinationRatePerDay] = useState<number>(0.02);
  const [chartReady, setChartReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadedDisease, setLoadedDisease] = useState<string | null>(null);

  const applyDiseasePreset = (key: DiseaseKey) => {
    setDisease(key);
    if (key !== loadedDisease) {
      const profile = DISEASE_PROFILES.find((p) => p.disease_key === key);
      if (profile) {
        setR0(Math.round((profile.r0_min + profile.r0_max) / 2 * 10) / 10);
        setIncubationDays(profile.incubation_max);
        // For infectious period, use ~2x incubation as rough estimate if not available
        setInfectiousDays(Math.max(profile.incubation_max, 7));
      }
      setLoadedDisease(key);
    }
  };

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setChartReady(true));
    return () => {
      cancelAnimationFrame(id);
      setChartReady(false);
    };
  }, [open]);

  const simulation: SimPoint[] = useMemo(() => {
    return runSEIR({
      N: population,
      initialInfected,
      r0,
      incubationDays,
      infectiousDays,
      caseFatalityRate,
      totalDays,
      quarantineEnabled,
      quarantineStartDay,
      quarantineEfficacy,
      vaccinationEnabled,
      vaccinationStartDay,
      vaccinationRatePerDay,
    });
  }, [population, initialInfected, r0, incubationDays, infectiousDays,
      caseFatalityRate, totalDays, quarantineEnabled, quarantineStartDay,
      quarantineEfficacy, vaccinationEnabled, vaccinationStartDay, vaccinationRatePerDay]);

  const stats = useMemo(() => {
    let peakI = 0;
    let peakDay = 0;
    let finalD = 0;
    let finalCumulative = 0;
    let peakReff = r0;
    let dayReffBelow1: number | null = null;
    for (const p of simulation) {
      if (p.I > peakI) {
        peakI = p.I;
        peakDay = p.day;
      }
      if (p.Reff > peakReff) peakReff = p.Reff;
      if (dayReffBelow1 === null && p.Reff < 1) dayReffBelow1 = p.day;
      finalD = p.D;
      finalCumulative = p.cumulative;
    }
    return {
      peakI, peakDay, finalD, finalCumulative,
      attackRate: (finalCumulative / population) * 100,
      mortalityRate: finalD > 0 ? (finalD / finalCumulative) * 100 : 0,
      peakReff,
      dayReffBelow1,
    };
  }, [simulation, population, r0]);

  const herdImmunity = herdImmunityThreshold(r0);
  const neededVaccinated = Math.round((population * herdImmunity) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            SEIR-симулятор вспышки
          </DialogTitle>
          <DialogDescription>
            Расширенная модель с инкубационным периодом, летальностью и интервенциями
            (карантин, вакцинация). Учебный инструмент — не точный прогноз.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-4">
          {/* ─── Controls (with tabs) ─── */}
          <div>
            <Tabs defaultValue="basic">
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="basic" className="text-xs">Параметры</TabsTrigger>
                <TabsTrigger value="interventions" className="text-xs">Интервенции</TabsTrigger>
              </TabsList>

              {/* Tab: Basic parameters */}
              <TabsContent value="basic" className="space-y-5 mt-0">
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
            </div>

            <SliderControl
              label="R₀ (репродуктивное число)"
              icon={TrendingUp}
              value={r0}
              min={0.5}
              max={20}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={setR0}
              hint="0.5 (спокойная) → 20 (взрывная)"
            />
            <SliderControl
              label="Популяция"
              icon={Users}
              value={Math.log10(population)}
              min={2}
              max={7}
              step={0.1}
              format={() => population.toLocaleString("ru-RU")}
              onChange={(v) => setPopulation(Math.round(Math.pow(10, v)))}
              hint="100 → 10 млн"
            />
            <SliderControl
              label="Начальные инфицированные"
              icon={AlertCircle}
              value={initialInfected}
              min={1}
              max={Math.min(1000, Math.floor(population / 10))}
              step={1}
              format={(v) => v.toLocaleString("ru-RU")}
              onChange={setInitialInfected}
            />
            <SliderControl
              label="Инкубационный период (E → I)"
              icon={Clock}
              value={incubationDays}
              min={1}
              max={60}
              step={1}
              format={(v) => `${v} дн`}
              onChange={setIncubationDays}
            />
            <SliderControl
              label="Длительность инфекции (I → R)"
              icon={Activity}
              value={infectiousDays}
              min={1}
              max={60}
              step={1}
              format={(v) => `${v} дн`}
              onChange={setInfectiousDays}
            />
            <SliderControl
              label="Летальность (CFR)"
              icon={Skull}
              value={caseFatalityRate * 100}
              min={0}
              max={100}
              step={1}
              format={(v) => `${v.toFixed(0)}%`}
              onChange={(v) => setCaseFatalityRate(v / 100)}
              hint="Доля умерших среди заболевших"
            />
            <SliderControl
              label="Горизонт прогноза"
              icon={Clock}
              value={totalDays}
              min={30}
              max={365}
              step={1}
              format={(v) => `${v} дн`}
              onChange={setTotalDays}
            />
              </TabsContent>

              {/* Tab: Interventions */}
              <TabsContent value="interventions" className="space-y-4 mt-0">
            {/* Interventions */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <ShieldHalf className="h-3 w-3" />
                Интервенции
              </Label>

              <InterventionToggle
                icon={ShieldHalf}
                label="Карантин"
                desc="Снижение контактов после дня N"
                enabled={quarantineEnabled}
                onToggle={setQuarantineEnabled}
                color="var(--chart-3)"
              />
              {quarantineEnabled && (
                <div className="pl-6 space-y-2">
                  <SliderControl
                    label="День начала карантина"
                    icon={Clock}
                    value={quarantineStartDay}
                    min={0}
                    max={60}
                    step={1}
                    format={(v) => `День ${v}`}
                    onChange={setQuarantineStartDay}
                    compact
                  />
                  <SliderControl
                    label="Эффективность карантина"
                    icon={ShieldHalf}
                    value={quarantineEfficacy * 100}
                    min={0}
                    max={100}
                    step={5}
                    format={(v) => `${v.toFixed(0)}%`}
                    onChange={(v) => setQuarantineEfficacy(v / 100)}
                    hint="Какая доля контактов предотвращена"
                    compact
                  />
                </div>
              )}

              <InterventionToggle
                icon={Syringe}
                label="Вакцинация"
                desc="Ежедневная вакцинация доли восприимчивых"
                enabled={vaccinationEnabled}
                onToggle={setVaccinationEnabled}
                color="var(--chart-4)"
              />
              {vaccinationEnabled && (
                <div className="pl-6 space-y-2">
                  <SliderControl
                    label="День начала вакцинации"
                    icon={Clock}
                    value={vaccinationStartDay}
                    min={0}
                    max={120}
                    step={1}
                    format={(v) => `День ${v}`}
                    onChange={setVaccinationStartDay}
                    compact
                  />
                  <SliderControl
                    label="Скорость вакцинации"
                    icon={Syringe}
                    value={vaccinationRatePerDay * 100}
                    min={0.1}
                    max={10}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}% в день`}
                    onChange={(v) => setVaccinationRatePerDay(v / 100)}
                    compact
                  />
                </div>
              )}
            </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ─── Results ─── */}
          <div className="space-y-3">
            {/* Key stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <StatCard
                icon={AlertCircle}
                color="var(--destructive)"
                label="Пик больных"
                value={stats.peakI.toLocaleString("ru-RU")}
                sub={`День ${stats.peakDay}`}
              />
              <StatCard
                icon={TrendingUp}
                color="var(--primary)"
                label="Всего переболеет"
                value={stats.finalCumulative.toLocaleString("ru-RU")}
                sub={`${stats.attackRate.toFixed(1)}% популяции`}
              />
              <StatCard
                icon={Skull}
                color="var(--foreground)"
                label="Погибнет"
                value={stats.finalD.toLocaleString("ru-RU")}
                sub={`Летальность ${stats.mortalityRate.toFixed(1)}%`}
              />
              <StatCard
                icon={Activity}
                color="var(--chart-3)"
                label="R эффективный"
                value={stats.peakReff.toFixed(1)}
                sub={stats.dayReffBelow1 !== null
                  ? `< 1 с дня ${stats.dayReffBelow1}`
                  : "Никогда < 1"}
              />
              <StatCard
                icon={Heart}
                color="var(--chart-1)"
                label="Коллективный иммунитет"
                value={`${herdImmunity.toFixed(0)}%`}
                sub={`${neededVaccinated.toLocaleString("ru-RU")} животных`}
              />
              <StatCard
                icon={Users}
                color="var(--chart-4)"
                label="Выживет"
                value={Math.round((population - stats.finalD)).toLocaleString("ru-RU")}
                sub={`из ${population.toLocaleString("ru-RU")}`}
              />
            </div>

            {/* Main chart — SEIR compartments over time */}
            <Card className="p-3">
              <div className="text-xs font-medium mb-2">
                Компартменты: S · E · I · R · D
              </div>
              <div ref={containerRef} style={{ width: "100%", height: 240, minHeight: 240 }}>
                {chartReady && (
                  <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                    <LineChart data={simulation} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: "currentColor", fontVariantNumeric: "tabular-nums" }}
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        label={{ value: "День", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "currentColor" } }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "currentColor", fontVariantNumeric: "tabular-nums" }}
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
                          const labels: Record<string, string> = {
                            S: "Восприимчивые", E: "Инкубация", I: "Больные",
                            R: "Выздоровевшие", D: "Погибшие",
                          };
                          return [v.toLocaleString("ru-RU"), labels[name] ?? name];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(name) => {
                          const labels: Record<string, string> = {
                            S: "Восприимчивые", E: "Инкубация", I: "Больные",
                            R: "Выздоровевшие", D: "Погибшие",
                          };
                          return labels[name] ?? name;
                        }}
                      />
                      <ReferenceLine
                        y={stats.peakI}
                        stroke="var(--destructive)"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                        label={{ value: `Пик: ${stats.peakI.toLocaleString("ru-RU")}`, fontSize: 10, fill: "var(--destructive)", position: "right" }}
                      />
                      {quarantineEnabled && (
                        <ReferenceLine
                          x={quarantineStartDay}
                          stroke="var(--chart-3)"
                          strokeDasharray="4 2"
                          label={{ value: "Карантин", fontSize: 9, fill: "var(--chart-3)", position: "top" }}
                        />
                      )}
                      {vaccinationEnabled && (
                        <ReferenceLine
                          x={vaccinationStartDay}
                          stroke="var(--chart-4)"
                          strokeDasharray="4 2"
                          label={{ value: "Вакцина", fontSize: 9, fill: "var(--chart-4)", position: "top" }}
                        />
                      )}
                      <Line type="monotone" dataKey="S" stroke="#1565C0" strokeWidth={1.5} dot={false} name="S" />
                      <Line type="monotone" dataKey="E" stroke="#F57C00" strokeWidth={1.5} dot={false} name="E" />
                      <Line type="monotone" dataKey="I" stroke="#D32F2F" strokeWidth={2} dot={false} name="I" />
                      <Line type="monotone" dataKey="R" stroke="#2E7D32" strokeWidth={1.5} dot={false} name="R" />
                      <Line type="monotone" dataKey="D" stroke="#000000" strokeWidth={1.5} dot={false} name="D" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* R-effective chart */}
            <Card className="p-3">
              <div className="text-xs font-medium mb-2">
                R эффективный во времени (когда &lt; 1, эпидемия идёт на спад)
              </div>
              <div style={{ width: "100%", height: 140, minHeight: 140 }}>
                {chartReady && (
                  <ResponsiveContainer width="100%" height="100%" minHeight={140}>
                    <AreaChart data={simulation} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        stroke="currentColor"
                        strokeOpacity={0.3}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "currentColor" }}
                        stroke="currentColor"
                        strokeOpacity={0.3}
                        domain={[0, "auto"]}
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
                        formatter={(v: number) => [v.toFixed(2), "R эфф."]}
                      />
                      <ReferenceLine y={1} stroke="var(--destructive)" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="Reff" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} name="R эфф." />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              ⚠️ SEIR-модель упрощённая: не учитывает пространственное распределение,
              неоднородность популяции, возрастные группы, скрытые случаи. Для реального
              планирования обратитесь к эпизоотологу.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable sub-components ─────────────────────────────────────────────

function SliderControl({
  label, icon: Icon, value, min, max, step, format, onChange, hint, compact,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${compact ? "" : "space-y-2"}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {label}
        </Label>
        <Badge variant="outline" className="text-xs tabular-nums">
          {format(value)}
        </Badge>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function InterventionToggle({
  icon: Icon, label, desc, enabled, onToggle, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  color: string;
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`w-full p-2.5 rounded-md border flex items-center gap-2.5 transition-all text-left ${
        enabled
          ? "border-primary/40 bg-primary/5"
          : "border-border hover:bg-accent/30"
      }`}
    >
      <div
        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
        style={{
          backgroundColor: enabled
            ? `color-mix(in srgb, ${color} 18%, transparent)`
            : "var(--muted)",
        }}
      >
        <Icon className="h-4 w-4" style={{ color: enabled ? color : "var(--muted-foreground)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
      </div>
      <div className={`h-4 w-7 rounded-full p-0.5 transition-colors shrink-0 ${
        enabled ? "bg-primary" : "bg-muted-foreground/30"
      }`}>
        <div className={`h-3 w-3 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-3" : ""
        }`} />
      </div>
    </button>
  );
}

function StatCard({
  icon: Icon, color, label, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-2.5 flex items-center gap-2.5">
      <Icon className="h-5 w-5 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <div className="text-sm font-bold tabular-nums leading-none" style={{ color }}>
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 truncate">{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </Card>
  );
}
