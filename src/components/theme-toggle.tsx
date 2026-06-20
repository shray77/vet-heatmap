"use client";

import { Moon, Sun, Monitor, Eye } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useSyncExternalStore } from "react";

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
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

  // Cycle: light -> dark -> system -> night-red
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : theme === "system" ? "night-red" : "light";

  let Icon = Sun;
  let label = "Тема: " + theme;

  if (theme === "night-red") {
    Icon = Eye;
  } else if (resolvedTheme === "dark") {
    Icon = Moon;
  } else if (theme === "system") {
    Icon = Monitor;
  }

  const handleClick = () => {
    if (next === "night-red") {
      document.documentElement.classList.add("night-red");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("night-red");
      setTheme(next);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
