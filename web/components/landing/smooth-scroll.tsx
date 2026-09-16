"use client";

/**
 * Smooth scrolling, and the section reveals that hang off it.
 *
 * Lenis takes the wheel and drives scroll position itself on an eased curve.
 * GSAP's ScrollTrigger reads that position for the reveals, so both are working
 * off one clock: left to their own devices, Lenis moves the page while
 * ScrollTrigger is still reading the native scroll value, and the reveals fire
 * at the wrong place.
 *
 * Both are off entirely under prefers-reduced-motion. Hijacking someone's
 * scroll is the most intrusive thing on this page, and the setting exists to
 * say no to exactly that; the page is perfectly readable without either.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect } from "react";

/** Elements carrying this are revealed as they come up the page. */
export const REVEAL = "data-reveal";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      // Long enough to feel carried, short enough that a flick still lands
      // where it was aimed.
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Touch devices already have momentum scrolling that people know. Taking
      // that over makes a phone feel broken.
      smoothWheel: true,
      touchMultiplier: 1,
    });

    lenis.on("scroll", ScrollTrigger.update);

    // Driven from GSAP's ticker rather than its own rAF, so there is one loop
    // rather than two competing for the same frame.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      for (const element of gsap.utils.toArray<HTMLElement>(`[${REVEAL}]`)) {
        gsap.from(element, {
          opacity: 0,
          y: 26,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: {
            trigger: element,
            // Fires when the element is a fifth of the way up the viewport,
            // which is late enough that it is not already read by the time it
            // animates and early enough that it is never caught mid-fade.
            start: "top 85%",
            once: true,
          },
        });
      }
    });

    return () => {
      context.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
