"use client";

import { usePWA } from "@/lib/use-pwa";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useState } from "react";

/**
 * PWA banners: install prompt, update-available, offline.
 * Renders at the top of the page when needed.
 */
export function PwaBanners() {
  const { canInstall, promptInstall, updateAvailable, applyUpdate, isOffline } = usePWA();
  const [offlineDismissedAt, setOfflineDismissedAt] = useState<number | null>(null);

  // Derived: if we go offline again after dismissing, show the banner once more.
  // Pure derivation — no setState-in-effect.
  const showOffline =
    isOffline &&
    (offlineDismissedAt === null || Date.now() - offlineDismissedAt > 60_000);

  if (updateAvailable) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Доступна новая версия приложения</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={applyUpdate}
          >
            Обновить
          </Button>
        </div>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Установить приложение для офлайн-доступа</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-[11px] shrink-0"
          onClick={promptInstall}
        >
          Установить
        </Button>
      </div>
    );
  }

  if (showOffline) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-amber-600 text-white px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Офлайн-режим — показаны последние кэшированные данные</span>
        </div>
        <button
          onClick={() => setOfflineDismissedAt(Date.now())}
          aria-label="Скрыть"
          className="shrink-0 p-1 hover:bg-white/10 rounded"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
