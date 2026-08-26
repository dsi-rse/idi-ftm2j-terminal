"use client";

import { PropsWithChildren } from "react";

import { ThemeProvider } from "next-themes";

import { Tooltip } from "@/components/tooltip";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Tooltip.Provider>{children}</Tooltip.Provider>
    </ThemeProvider>
  );
}
