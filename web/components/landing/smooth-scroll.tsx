"use client";

/**
 * Smooth scrolling.
 *
 * Lenis takes the wheel and drives scroll position itself on an eased curve.
 * It runs off GSAP's ticker rather than its own requestAnimationFrame, so the
 * page has one loop rather than two competing for the same frame.
 *
 * The section reveals used to hang off ScrollTrigger here and are now an
 * ordinary viewport observer in reveal.tsx. ScrollTrigger was reading a scroll
 * position that Lenis had taken over, so triggers below the fold never fired
 * and two sections of this page sat at opacity zero.
 *
 * All of it is off under prefers-reduced-motion. Taking someone's scroll is the
 * most intrusive thing on this page, and the setting exists to say no to
 * exactly that; it reads perfectly well without any of this.
 */

import gsap from "gsap";
import Lenis from "lenis";
import { useEffect } from "react";

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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

    // Driven from GSAP's ticker rather than its own rAF, so there is one loop
    // rather than two competing for the same frame.
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
