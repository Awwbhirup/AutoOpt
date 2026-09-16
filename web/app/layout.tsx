import type { Metadata } from "next";
import {
  Azeret_Mono,
  Chakra_Petch,
  Geist,
  Geist_Mono,
  Syne,
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
 * The landing page's three faces. The application keeps Geist; none of these
 * are loaded on a page that does not use them.
 *
 * Syne is a display grotesque that widens as it gets heavier and has corners
 * where a normal one has curves. Chakra Petch carries UI text with the clipped
 * corners of a technical drawing. Azeret Mono carries the data, because the
 * data is code and the page should not pretend otherwise. Three faces is two
 * more than a page usually needs; they are here because a single neutral sans
 * across everything is the thing that made this read as a default.
 */
const syne = Syne({
  variable: "--font-hero",
  subsets: ["latin"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const azeretMono = Azeret_Mono({
  variable: "--font-terminal",
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
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${chakraPetch.variable} ${azeretMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
