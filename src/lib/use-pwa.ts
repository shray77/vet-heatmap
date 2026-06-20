"use client";

import { useEffect, useState } from "react";
import { pushSupported, getPermission, requestPermission, checkForNewOutbreaks } from "./push-notifications";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA hooks: install prompt + offline detection.
 *
 * Note: SW update detection is intentionally DISABLED. The update banner
 * was annoying users (and on iOS the "waiting worker" logic was unreliable).
 * New versions are picked up automatically on next visit — no user action
 * required.
 */
export function usePWA() {
  const [canInstall, setCanInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"
  );

  useEffect(() => {
    // Service worker registration — only in production (basePath /vet-heatmap)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const swUrl = "/vet-heatmap/vetkart-sw.js";
      navigator.serviceWorker
        .register(swUrl, { scope: "/vet-heatmap/" })
        .then((reg) => {
          // Auto-activate any waiting worker silently (no user-facing banner).
          // This is safe: SW changes only affect cached resources, not active
          // page state. User gets the new version on next reload.
          const activateWaiting = () => {
            if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          };
          activateWaiting();
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", activateWaiting);
          });
        })
        .catch((e) => {
          console.warn("[pwa] SW registration failed:", e);
        });
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => {
      setCanInstall(false);
      setInstallEvent(null);
    };
    window.addEventListener("appinstalled", onInstalled);

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

  const enablePush = async () => {
    const perm = await requestPermission();
    setPushPermission(perm);
  };

  return { canInstall, promptInstall, isOffline, pushPermission, enablePush, pushSupported: pushSupported() };
}
