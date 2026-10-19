# TODO — ВетКарта (vet-heatmap)

> Обновлено 2026-10-20 (процесс ревью Z.ai): сняты выполненные пункты,
> статус приведён к фактическому состоянию кода и CI.

## 🔴 High Priority — Data

### 1. Telegram-канал @vetrfru (VetIS.News) — подключить к пайплайну
- **Status:** Парсер готов и протестирован (`scripts/scrape/sources/telegram.ts` + `telegram.test.ts`), но НЕ подключён к `run-all.ts`
- **What:** Добавить вызов в `run-all.ts` → реальные алерты быстрее PDF-отчётов fsvps
- **Effort:** ~30 минут

### 2. FGIS SIRANO integration
- **What:** Федеральная система раннего предупреждения — лабораторные подтверждения с числом случаев
- **Problem:** sirano.vetrf.ru требует логин
- **Effort:** Unknown (нужны учётки от юзера)

### 3. Прецизные координаты вспышек
- Вспышки пока на центроидах регионов (маркеры накладываются в центре)
- Предприятия геокодируются (`geocode.py`/`fast-geocode.py` в CI); для вспышек нужен NER по тексту PDF + Nominatim (лимит 1 req/sec)

## 🟡 Medium Priority — Features

### 4. Слой плотности поголовья
- **What:** MapLibre fill-layer из `pigs_per_km2` / `cattle_per_km2` (данные уже в `REGION_PROPERTIES`)
- **Effort:** ~1 час

### 5. Группировка по федеральным округам
- **What:** ЦФО/СЗФО/ЮФО… в фильтрах и списке хотспотов (`federal_district` уже в данных)
- **Effort:** ~1 час

### 6. Push-уведомления
- **Status:** ОТКРЫТО. Прототип `src/lib/push-notifications.ts` УДАЛЁН 2026-10-20:
  приватный VAPID-ключ был закоммичен в git (компрометация). Для реализации —
  сгенерировать НОВУЮ пару ключей (`npx web-push generate-vapid-keys`) и хранить в секретах,
  не в коде; рассылка через GitHub Action.
- **Problem:** Статик-экспорт без API-роутов — нужен GH Action или бесплатный push-сервис

### 7. ProMED-mail RSS
- **What:** Международные алерты по болезням животных, фильтр по РФ
- **Effort:** ~1 час (`scripts/scrape/sources/promed.ts`)

## 🟢 Low Priority — Polish

### 8. Красный ночной режим
- CSS filter: sepia(1) hue-rotate(-50deg) — для полевой работы ночью
- **Effort:** ~30 мин

### 9. Regional vet management reports
- Скрейп региональных сайтов ветслужб (у каждого региона своя структура)
- **Effort:** ~1 день

### 10. Cloudflare Pages как альтернативный деплой
- `cf-merge.mjs` уже есть; лучше CDN для RU-трафика
- **Effort:** ~30 мин сетапа

## ✅ Архив (сделано, чтобы не потерять контекст)

- **Источники данных:** fsvps.ts + fsvps-historical.ts + wahis.ts (прямой API) + efsa.ts + curated.ts — все в CI (`update-data.yml` 4×/день)
- **Timeline-слайдер** — `timeline-slider.tsx`
- **Сравнение болезней** — `disease-comparison.tsx`
- **Карта рисков** — `risk-score-map.tsx`
- **PDF-отчёт** — `pdf-report-export.tsx` (browser print-to-PDF)
- **CSV-импорт** — `custom-data-import.tsx`
- **Тесты:** 52 в 7 файлах, гоняются в CI (vitest) — парсер merge покрыт
- **Чистка зависимостей:** 2026-10-20 — 68 → 26 runtime-пакетов, версии запинены под lockfile
- **Prisma:** удалена раньше, в репо отсутствует
