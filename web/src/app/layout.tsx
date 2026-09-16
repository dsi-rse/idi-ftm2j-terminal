import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
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
      className={`${interTight.variable} ${inter.variable} ${jetbrainsMono.variable}`}
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
