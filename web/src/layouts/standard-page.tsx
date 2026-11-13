import { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

import { Footer } from "@/views/footer";
import { Navbar } from "@/views/navbar";

type StandardPageLayoutProps = {
  narrow?: boolean;
};

/**
 * Defines a page layout with a navigation bar, footer, and narrow content area.
 */
export function StandardPageLayout({
  narrow = false,
  children,
}: PropsWithChildren<StandardPageLayoutProps>) {
  return (
    // No top padding: the navbar sits flush with the viewport top, as it does in
    // `TerminalShell`, so the bar's lower edge lands at the same height on every
    // page.
    <div className="flex min-h-dvh flex-col gap-4 pb-4">
      <Navbar />
      <div className="mx-4 md:mx-12 mb-6 flex flex-1 flex-col items-center">
        <div
          className={cn("w-full flex flex-col items-center", narrow && "max-w-4xl")}
        >
          {children}
        </div>
      </div>
      <Footer />
    </div>
  );
}
