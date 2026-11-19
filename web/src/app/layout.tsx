import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";

import "./globals.css";
import { Providers } from "./providers";

// Text. The optical-size axis is loaded so labels and data at 12-13px get the
// cut drawn for small sizes.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Figures: numbers and tickers only. Self-hosted from `./fonts` (OFL, license
// alongside) because this version of next/font/google does not list Datatype.
// The file is variable, but its axes only drive the font's inline charts:
// letters and digits have one weight and one width.
// ponytail: Latin subset only. Add the latin-ext file if a currency sign
// outside Latin-1 has to be set in the mono; until then it falls back to a
// system font.
const datatype = localFont({
  src: "./fonts/datatype-latin.woff2",
  variable: "--font-datatype",
  weight: "100 900",
  display: "swap",
});

/**
 * Metadata for the "Home" page.
 */
export const metadata: Metadata = {
  title: "Home | FTM2J Terminal | Inclusive Development International",
  description:
    "Trace the corporate structures and investment and supply chains of publicly-traded companies.",
};

/**
 * The root layout for the application.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${datatype.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link
          rel="icon"
          href="/favicon.ico"
          type="image/vnd.microsoft.icon"
        ></link>
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/* The column is minmax(0, 1fr), not the implicit auto: an auto track grows
            to its widest descendant (a data table, say) and scrolls the whole page
            sideways on a phone instead of letting that one element scroll.
            `overflow-x-clip` is the backstop for anything that still escapes: a
            phone browser sizes its layout viewport to the document's scroll
            width, and one stray element then zooms the page out and pushes
            fixed controls off screen. `clip` rather than `hidden` so no scroll
            container is created and `sticky` descendants keep working. */}
        <div className="root grid min-h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-x-clip">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
