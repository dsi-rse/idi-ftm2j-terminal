import { PropsWithChildren } from "react";

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
    <div className="flex min-h-dvh flex-col gap-4 py-1 pb-4">
      <Navbar />
      <div className="mx-12 mb-6 flex flex-1 flex-col items-center">
        <div
          className={`${narrow ? "max-w-4xl" : ""} w-full flex flex-col items-center`}
        >
          {children}
        </div>
      </div>
      <Footer />
    </div>
  );
}
