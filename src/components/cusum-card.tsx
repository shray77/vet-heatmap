"use client";

/**
 * Карточка CUSUM-надзора: раннее обнаружение аномального роста вспышек
 * в текущем срезе фильтра. Показывает статус сигнала, накопленную
 * статистику S и мини-спарклайн. Ставится рядом с эпи-кривой.
 */

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card } from "@/components/ui/card";
import { cusumDetect, type CusumResult } from "@/lib/cusum";
import type { Outbreak } from "@/types/domain";

interface CusumCardProps {
  outbreaks: Outbreak[];
}

export function CusumCard({ outbreaks }: CusumCardProps) {
  const result: CusumResult = useMemo(() => cusumDetect(outbreaks), [outbreaks]);

  const chartData = result.weeks.map((w) => ({
    week: w.week.replace(/^\d{4}-/, ""),
    s: w.s,
    n: w.n,
  }));
  // Последние 26 недель — читаемый спарклайн.
  const tail = chartData.slice(-26);

  const statusText = !result.enoughData
    ? "мало данных в срезе"
    : result.signal
      ? `сигнал с ${result.signalSince}`
      : "в пределах нормы";

  const statusColor = result.signal ? "#dc2626" : result.sNow > 0 ? "#ea9c0c" : "#16a34a";

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">CUSUM-надзор</h3>
          <p className="text-xs text-muted-foreground">раннее обнаружение роста вспышек в срезе</p>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 text-xs font-semibold"
          style={{ color: statusColor, borderColor: `${statusColor}55`, background: `${statusColor}12` }}
        >
          {statusText}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border bg-muted/30 p-1.5">
          <div className="font-mono text-sm font-bold" style={{ color: statusColor }}>
            {result.sNow.toFixed(1)}
          </div>
          <div className="text-[10px] text-muted-foreground">статистика S</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-1.5">
          <div className="font-mono text-sm font-bold">{result.h}</div>
          <div className="text-[10px] text-muted-foreground">порог сигнала</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-1.5">
          <div className="font-mono text-sm font-bold">
            {result.weeks.length ? result.weeks[result.weeks.length - 1].n : 0}
          </div>
          <div className="text-[10px] text-muted-foreground">вспышек за неделю</div>
        </div>
      </div>

      {tail.length > 1 && (
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={tail} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="week" hide />
              <YAxis hide domain={[0, Math.max(result.h * 1.4, 1)]} />
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                formatter={(v, name) => (name === "s" ? [Number(v).toFixed(2), "S (накопленное отклонение)"] : [String(v), String(name)])}
              />
              <ReferenceLine y={result.h} stroke="#dc2626" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="s" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        S растёт, когда недельные вспышки превышают скользящую норму за 8 недель (σ = √μ, Пуассон);
        сигнал при S ≥ 4. Сравнение всегда с недавней нормой — сезонность не даёт ложных тревог.
        Служебная статистика: не заменяет официальную оценку эпизоотической ситуации.
      </p>
    </Card>
  );
}
