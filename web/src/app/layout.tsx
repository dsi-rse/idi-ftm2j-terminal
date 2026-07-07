import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Bebas_Neue,
  Syne,
  DM_Mono,
  Inter,
  Inter_Tight,
  Heebo,
} from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
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

export const metadata: Metadata = {
  title: "FTM2J Terminal | Inclusive Development International",
  description:
    "Trace the corporate structures and investment and supply chains of publicly-traded companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} ${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} ${syne.variable} ${dmMono.variable} ${heebo.variable}`}
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
