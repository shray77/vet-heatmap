"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useSyncExternalStore } from "react";

// Subscribe to "is mounted" without triggering cascading re-render
// (per react-hooks/set-state-in-effect rule)
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true, // client
    () => false, // server
  );
}

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled aria-label="Переключить тему">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  // Cycle: light -> dark -> system
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = resolvedTheme === "dark" ? Moon : Sun;
  const Label =
    theme === "system" ? <Monitor className="h-4 w-4" /> : <Icon className="h-4 w-4" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Тема: ${theme}, переключить на ${next}`}
      title={`Тема: ${theme}`}
    >
      {Label}
    </Button>
  );
}
