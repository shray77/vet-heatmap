"use client";

import { usePWA } from "@/lib/use-pwa";
import { Button } from "@/components/ui/button";
import { Download, WifiOff, X } from "lucide-react";
import { useState } from "react";

/**
 * PWA banners: install prompt + offline indicator.
 *
 * Update banner was intentionally REMOVED — it was annoying users (and on iOS
 * the "waiting worker" logic was unreliable, causing 404 on apply). SW now
 * auto-activates waiting workers silently; users get the new version on next
 * visit.
 *
 * QA sw32 (Б1): баннер был fixed top-0 z-[100] и перекрывал шапку — клики по
 * «Карантин»/«Рядом»/поиску уходили в баннер. Теперь баннер в потоке
 * (первый flex-ребёнок <main>) — сдвигает контент вниз, интерактив свободен.
 * Скрытие install-баннера пишется в localStorage (раньше — только useState,
 * F5 возвращал баннер).
 */
const INSTALL_DISMISSED_KEY = "vet:pwa_install_dismissed";

export function PwaBanners() {
  const { canInstall, promptInstall, isOffline } = usePWA();
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1",
  );

  const dismissInstall = () => {
    setDismissedInstall(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // приватный режим — просто скрываем до перезагрузки
    }
  };

  if (canInstall && !dismissedInstall) {
    return (
      <div className="shrink-0 bg-primary/95 backdrop-blur text-primary-foreground px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
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
            onClick={dismissInstall}
            aria-label="Скрыть"
            className="p-1.5 hover:bg-white/10 rounded transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (isOffline && !dismissedOffline) {
    return (
      <div className="shrink-0 bg-amber-600 text-white px-3 py-2 flex items-center justify-between gap-3 text-xs pt-safe">
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
