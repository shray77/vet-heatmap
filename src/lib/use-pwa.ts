"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA install prompt + service worker registration hook.
 *
 * Returns:
 *   - canInstall: true when browser fired beforeinstallprompt
 *   - promptInstall(): triggers the install prompt (call from a button)
 *   - updateAvailable: true when a new SW is waiting to activate
 *   - applyUpdate(): activates the new SW and reloads
 */
export function usePWA() {
  const [canInstall, setCanInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // Initial value derived once on client mount — avoids setState-in-effect.
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Service worker registration — only in production (basePath /vet-heatmap)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const swUrl = "/vet-heatmap/sw.js";
      navigator.serviceWorker
        .register(swUrl, { scope: "/vet-heatmap/" })
        .then((reg) => {
          // Watch for waiting SW (new version available)
          const checkWaiting = () => {
            if (reg.waiting) setUpdateAvailable(true);
          };
          checkWaiting();
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", checkWaiting);
          });
        })
        .catch((e) => {
          // SW registration failure is non-fatal
          console.warn("[pwa] SW registration failed:", e);
        });
    }

    // beforeinstallprompt
    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // appinstalled event
    const onInstalled = () => {
      setCanInstall(false);
      setInstallEvent(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // Online/offline
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const promptInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setCanInstall(false);
  };

  const applyUpdate = async () => {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
    window.location.reload();
  };

  return { canInstall, promptInstall, updateAvailable, applyUpdate, isOffline };
}
