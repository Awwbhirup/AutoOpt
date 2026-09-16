"use client";

/**
 * A section that eases in as it comes up the page.
 *
 * Through motion's viewport observer rather than GSAP's ScrollTrigger. The
 * GSAP version left two sections of this page stuck at opacity zero: Lenis
 * drives scroll position itself and ScrollTrigger was reading a position that
 * had stopped changing, so triggers below the fold never fired and their
 * content stayed invisible. An observer asks the browser whether the element is
 * on screen, which is true regardless of who is moving the page.
 *
 * The failure mode matters more than the mechanism. A reveal that does not fire
 * must leave the content readable, not hidden, so the animation starts from
 * whatever is on screen and the element is never hidden by a stylesheet.
 */

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.section
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Once, and while a sixth of it is showing: late enough not to fire
      // before it is on the way in, early enough never to be caught mid-fade
      // by someone who has already started reading it.
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}
