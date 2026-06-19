"use client";

import { usePWA } from "@/lib/use-pwa";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useState } from "react";

/**
 * PWA banners: install prompt, update-available, offline.
 * Renders at the top of the page when needed.
 *
 * Each banner can be dismissed by the user (stored in sessionStorage so it
 * doesn't reappear on the same session but does come back next visit).
 */
export function PwaBanners() {
  const { canInstall, promptInstall, updateAvailable, applyUpdate, isOffline } = usePWA();
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(false);

  // Critical: update banner always shows (can't dismiss — security/feature)
  if (updateAvailable) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Доступна новая версия</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-[11px] shrink-0"
          onClick={applyUpdate}
        >
          Обновить
        </Button>
      </div>
    );
  }

  // Install banner — dismissable (X in corner)
  if (canInstall && !dismissedInstall) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-primary/95 backdrop-blur text-primary-foreground px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Установить приложение для офлайн-доступа</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={promptInstall}
          >
            Установить
          </Button>
          <button
            onClick={() => setDismissedInstall(true)}
            aria-label="Скрыть"
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Offline banner — dismissable
  if (isOffline && !dismissedOffline) {
    return (
      <div className="fixed top-0 inset-x-0 z-[100] bg-amber-600 text-white px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Офлайн — показаны кэшированные данные</span>
        </div>
        <button
          onClick={() => setDismissedOffline(true)}
          aria-label="Скрыть"
          className="p-1.5 hover:bg-white/10 rounded transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
}

