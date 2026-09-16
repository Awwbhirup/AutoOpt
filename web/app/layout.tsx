import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  JetBrains_Mono,
  Space_Grotesk,
  Unbounded,
} from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The landing page's two faces, loaded here because fonts have to be, and used
 * nowhere else. The application keeps Geist.
 *
 * Space Grotesk is a grotesque with the corners left on: the g, the a and the
 * numerals are odd in a way that reads as drawn rather than as defaulted, which
 * is the whole problem with the usual choice. JetBrains Mono carries the data,
 * because the data is code and the page should not pretend otherwise.
 */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-terminal",
  subsets: ["latin"],
});

/**
 * Headlines and the one button that matters.
 *
 * Wide, geometric, flat-terminalled: it reads as drawn rather than picked, and
 * it is doing the job a display face is for, which is being recognisable at two
 * sizes and in two places. Kept off body copy, where its width would cost more
 * lines than its character is worth.
 */
const unbounded = Unbounded({
  variable: "--font-hero",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoOpt",
  description:
    "Optimizes programs and shows its working: every transformation proposed, " +
    "verified, costed, and accepted or rejected.",
};

// Typed here rather than through the framework's generated LayoutProps, which
// only exists once type generation has run. Depending on it means `tsc` fails
// on a clean checkout and passes after a build, which is a confusing thing for
// CI to report.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
