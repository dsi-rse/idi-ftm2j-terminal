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
        <div className="root grid min-h-screen grid-rows-[auto_1fr_auto]">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
