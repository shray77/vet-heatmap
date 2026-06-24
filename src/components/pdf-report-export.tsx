"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Printer, Download } from "lucide-react";
import type { Outbreak } from "@/types/domain";
import { DISEASE_PROFILES } from "@/data/disease-profiles";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  outbreaks: Outbreak[];
}

/**
 * Feature 3: PDF report export (ГОСТ-style).
 *
 * Generates an official-looking veterinary report that can be printed
 * or saved as PDF via browser's print-to-PDF. No external dependencies —
 * uses window.print() with a styled hidden div.
 */
export function PdfReportExport({ open, onOpenChange, outbreaks }: Props) {
  const [selectedOutbreakId, setSelectedOutbreakId] = useState<string>("");

  const report = useMemo(() => {
    if (!selectedOutbreakId) return null;
    const o = outbreaks.find((x) => x.id === parseInt(selectedOutbreakId));
    if (!o) return null;
    const profile = DISEASE_PROFILES.find((p) => p.disease_key === o.disease_key);

    // Compute quarantine dates
    const detectionDate = new Date(o.date);
    const quarantineEnd = new Date(detectionDate);
    quarantineEnd.setDate(detectionDate.getDate() + (profile?.observation_days || 40));

    return { outbreak: o, profile, detectionDate, quarantineEnd };
  }, [selectedOutbreakId, outbreaks]);

  const handlePrint = () => {
    if (!report) return;
    const w = window.open("", "_blank");
    if (!w) return;

    const o = report.outbreak;
    const p = report.profile;
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Экстренное извещение №${o.id} — ${o.disease}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; color: #000; }
  h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin-bottom: 0; }
  h2 { font-size: 12pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 20px; }
  .header { text-align: center; margin-bottom: 20px; }
  .stamp { border: 2px solid #000; padding: 10px; text-align: center; margin: 20px 0; }
  .stamp h1 { margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td { padding: 4px 8px; border: 1px solid #999; vertical-align: top; }
  td:first-child { background: #f5f5f5; font-weight: bold; width: 35%; }
  ul { margin: 5px 0; padding-left: 20px; }
  .footer { margin-top: 40px; border-top: 1px solid #000; padding-top: 10px; font-size: 10pt; }
  .sign { margin-top: 30px; display: flex; justify-content: space-between; }
  .sign-line { border-bottom: 1px solid #000; width: 200px; height: 30px; }
</style>
</head>
<body>
<div class="stamp">
  <h1>ЭКСТРЕННОЕ ИЗВЕЩЕНИЕ<br>о возникновении заразной болезни животных</h1>
  <p>№ ${o.id} от ${new Date().toLocaleDateString("ru-RU")}</p>
</div>

<h2>I. Сведения о вспышке</h2>
<table>
  <tr><td>Болезнь</td><td><strong>${o.disease}</strong></td></tr>
  <tr><td>Код болезни</td><td>${o.disease_key.toUpperCase()}</td></tr>
  <tr><td>Регион</td><td>${o.region}</td></tr>
  <tr><td>Дата выявления</td><td>${o.date}</td></tr>
  <tr><td>Статус</td><td>${o.status === "Ongoing" ? "Действующий" : o.status === "Resolved" ? "Ликвидирован" : "Неизвестно"}</td></tr>
  <tr><td>Вид животных</td><td>${o.species}</td></tr>
  <tr><td>Количество случаев</td><td>${o.cases || "—"}</td></tr>
  <tr><td>Количество павших</td><td>${o.deaths || "—"}</td></tr>
  <tr><td>Источник данных</td><td>${o.source.toUpperCase()}</td></tr>
</table>

${p ? `
<h2>II. Характеристика болезни</h2>
<table>
  <tr><td>Инкубационный период</td><td>${p.incubation_min}–${p.incubation_max} сут.</td></tr>
  <tr><td>R₀ (базовый)</td><td>${p.r0_min}–${p.r0_max}</td></tr>
  <tr><td>Зооноз</td><td>${p.zoonotic ? "Да (опасно для человека)" : "Нет"}</td></tr>
  <tr><td>Вакцина доступна</td><td>${p.vaccine_available ? "Да" : "Нет"}</td></tr>
</table>

<h2>III. Зоны ограничения</h2>
<table>
  <tr><td>Зона защиты</td><td>${p.protection_zone_km} км от очага</td></tr>
  <tr><td>Зона наблюдения</td><td>${p.surveillance_zone_km} км от очага</td></tr>
  <tr><td>Зона ограничения</td><td>${p.restriction_zone_km} км от очага</td></tr>
</table>

<h2>IV. Сроки карантина</h2>
<table>
  <tr><td>Дата выявления</td><td>${report.detectionDate.toLocaleDateString("ru-RU")}</td></tr>
  <tr><td>Срок наблюдения</td><td>${p.observation_days} сут.</td></tr>
  <tr><td>Окончание карантина (расчётно)</td><td><strong>${report.quarantineEnd.toLocaleDateString("ru-RU")}</strong></td></tr>
  <tr><td>Срок ограничений</td><td>${p.restriction_days} сут. после ликвидации</td></tr>
</table>

<h2>V. Клинические признаки</h2>
<ul>
  ${p.clinical_signs.map((s) => `<li>${s}</li>`).join("")}
</ul>

<h2>VI. Пути передачи</h2>
<ul>
  ${p.transmission_routes.map((r) => `<li>${r}</li>`).join("")}
</ul>

<h2>VII. Меры борьбы</h2>
<p>${p.measures_summary}</p>

<h2>VIII. Нормативно-правовые акты</h2>
<ul>
  ${p.rf_regulatory.map((r) => `<li>${r}</li>`).join("")}
</ul>
<p style="font-size: 10pt; color: #666;">${p.woah_reference}</p>
` : ""}

<div class="footer">
  <p>Документ сформирован системой VetKarta (${new Date().toLocaleString("ru-RU")})</p>
  <p>Источники данных: ФСВП России (fsvps.gov.ru), WOAH WAHIS</p>
</div>

<div class="sign">
  <div>
    <p>Главный государственный ветеринарный инспектор:</p>
    <div class="sign-line"></div>
    <p style="font-size: 10pt;">подпись / Ф.И.О.</p>
  </div>
  <div>
    <p>М.П.</p>
  </div>
</div>

</body>
</html>`;

    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Отчёт для Россельхознадзора
          </DialogTitle>
          <DialogDescription>
            Экстренное извещение о вспышке в формате официального документа.
            Откроется в новой вкладке — нажмите «Печать» (Ctrl+P) → «Сохранить как PDF».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={selectedOutbreakId} onValueChange={setSelectedOutbreakId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите вспышку" />
            </SelectTrigger>
            <SelectContent>
              {outbreaks.slice(0, 100).map((o) => (
                <SelectItem key={o.id} value={o.id.toString()}>
                  {o.disease} — {o.region} ({o.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {report && (
            <Card className="p-4 space-y-3">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Болезнь:</span>
                  <span className="font-medium">{report.outbreak.disease}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Регион:</span>
                  <span className="font-medium">{report.outbreak.region}</span>
                </div>
                {report.profile && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Карантин до:</span>
                      <span className="font-medium">
                        {report.quarantineEnd.toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Зона ограничения:</span>
                      <span className="font-medium">{report.profile.restriction_zone_km} км</span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">Раздел I–VIII</Badge>
                {report.profile?.zoonotic && <Badge variant="destructive">Зооноз</Badge>}
                {report.profile && (
                  <Badge variant="secondary">{report.profile.rf_regulatory.length} НПА</Badge>
                )}
              </div>
            </Card>
          )}

          <Button
            className="w-full"
            disabled={!report}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 mr-2" />
            Сгенерировать отчёт
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
