"use client";

import { Button } from "@base-ui/react/button";
import { useTheme } from "next-themes";

import { MoonIcon, SunIcon } from "@/components/icon";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-sm bg-transparent border border-muted/40 cursor-pointer hover:bg-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <MoonIcon className="size-4 hidden dark:block text-muted hover:text-primary" />
      <SunIcon className="size-4 block dark:hidden text-muted hover:text-primary" />
    </Button>
  );
}
