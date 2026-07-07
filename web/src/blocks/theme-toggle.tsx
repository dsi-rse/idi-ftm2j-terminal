"use client";

import { Button } from "@base-ui/react/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "@/components/icon";
import { Switch } from "@/components/switch";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-sm bg-transparent border-0 cursor-pointer"
    >
      <MoonIcon className="size-4 hidden dark:block text-muted hover:text-primary" />
      <SunIcon className="size-4 block dark:hidden text-muted hover:text-primary" />
    </Button>
  );
}

/**
 * A theme toggle rendered as a stylized `Switch`. The thumb shows a sun icon
 * in light mode and a moon icon in dark mode; the switch is checked when
 * dark mode is active.
 *
 * `next-themes` reports `resolvedTheme` as `undefined` on the server and during
 * the first client render, so we render a placeholder pill until mount and
 * only then switch to the real, controlled Switch. This avoids a hydration
 * mismatch and keeps the thumb from being stuck at the "off" position after
 * refresh when the actual theme is dark.
 */
export function ThemeToggleSwitch() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        aria-hidden
        className="inline-flex h-6 w-11 shrink-0 rounded-full border border-muted/40 bg-overlay"
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Switch
      aria-label="Toggle dark mode"
      checked={isDark}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
    >
      <SunIcon className="size-3 block dark:hidden" />
      <MoonIcon className="size-3 hidden dark:block" />
    </Switch>
  );
}
