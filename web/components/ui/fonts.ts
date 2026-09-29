/**
 * The app's two faces: Chakra Petch for interface text, Azeret Mono for data
 * and code. Loaded here rather than in the root layout so the app pages carry
 * them without touching the landing page's font set. next/font dedupes a face
 * that is loaded in both places.
 */

import { Azeret_Mono, Chakra_Petch } from "next/font/google";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui-display",
  display: "swap",
});

const mono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-ui-mono",
  display: "swap",
});

/** Class names that define both font variables on the element they are put on. */
export const uiFontVariables = `${display.variable} ${mono.variable}`;
