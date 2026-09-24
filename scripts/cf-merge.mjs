#!/usr/bin/env node
/**
 * scripts/cf-merge.mjs — опциональный перенос merge+upsert в CF Worker vet-api.
 *
 * Вход:
 *   scripts/scrape/.cache/sources.json — дамп per-source массивов из run-all.ts (шаг 3.5)
 *   git HEAD:public/data/outbreaks.json — baseline (тот же, что loadBaseline в run-all.ts)
 *
 * POST $VET_API_URL/v1/heatmap/merge (Bearer VET_API_TOKEN):
 *   Worker выполняет тот же алгоритм (порт merge.ts + upsert [4/5]) и возвращает датасет.
 *
 * Действия: строгая валидация → байт-сравнение с локальным результатом →
 * перезапись public/data/outbreaks.json ТОЛЬКО при отличии (+ ::warning:: — детектор
 * дрейфа двух реализаций). Любая ошибка → exit 0: локальный merge уже на диске.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// cf-merge.mjs лежит в scripts/ → репо-корень на ОДИН уровень выше
// (в отличие от run-all.ts, который в scripts/scrape/ и поднимается на два)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public', 'data', 'outbreaks.json');
const API = (process.env.VET_API_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.VET_API_TOKEN ?? '';

if (!API || !TOKEN) {
  console.log('vet-api: VET_API_URL/VET_API_TOKEN не заданы — пропускаем (локальный merge остаётся)');
  process.exit(0);
}

/* ---------- входные данные ---------- */
let recent = [];
try {
  recent = JSON.parse(readFileSync(resolve(ROOT, 'scripts', 'scrape', '.cache', 'sources.json'), 'utf8'));
} catch {
  console.log('vet-api: sources.json нет — пропускаем');
  process.exit(0);
}
if (!Array.isArray(recent) || !recent.length) {
  console.log('vet-api: sources пуст — пропускаем');
  process.exit(0);
}

let baseline = null;
try {
  baseline = JSON.parse(
    execSync('git show HEAD:public/data/outbreaks.json', { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'),
  );
} catch {
  console.log('vet-api: baseline (git HEAD) недоступен — merge без baseline');
}

/* ---------- вызов vet-api ---------- */
const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 120000);
let r;
try {
  r = await fetch(`${API}/v1/heatmap/merge`, {
    method: 'POST',
    signal: ctl.signal,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ recent, baseline }),
  });
} finally {
  clearTimeout(timer);
}
if (!r.ok) {
  console.log(`vet-api: HTTP ${r.status} — пропускаем (локальный merge остаётся)`);
  process.exit(0);
}
const d = await r.json();
if (!d.ok || !d.dataset || !Array.isArray(d.dataset.outbreaks) || !d.dataset.outbreaks.length) {
  console.log('vet-api: некорректный ответ — пропускаем');
  process.exit(0);
}
const ds = d.dataset;

/* ---------- санити-проверки ---------- */
let local = null;
try {
  local = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {}
if (local?.total_outbreaks && ds.total_outbreaks < local.total_outbreaks * 0.9) {
  console.log(`vet-api: total ${ds.total_outbreaks} << local ${local.total_outbreaks} — НЕ перезаписываем`);
  process.exit(0);
}
const bad = ds.outbreaks.find((o, i) => o.id !== i + 1 || !o.disease_key || !o.date || !o.source);
if (bad) {
  console.log(`vet-api: битые записи (id=${bad?.id}) — НЕ перезаписываем`);
  process.exit(0);
}

/* ---------- байт-сравнение и перезапись ---------- */
const cfOut = JSON.stringify(ds, null, 2);
const cur = readFileSync(OUT, 'utf8');
if (cur === cfOut) {
  console.log(`vet-api: merge совпал с локальным (${ds.total_outbreaks} вспышек, ${d.computeMs}ms, hash ${d.hash?.slice(0, 8)}) — файл не трогаем`);
  process.exit(0);
}
writeFileSync(OUT, cfOut, 'utf-8');
console.log(`::warning::vet-api merge отличается от локального (CF ${ds.total_outbreaks} vs local ${local?.total_outbreaks ?? '?'}, hash ${d.hash?.slice(0, 8)}, ${d.computeMs}ms) — принят CF-результат`);
