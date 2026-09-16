"use client";

/**
 * A heading whose letters answer the pointer.
 *
 * Each character lifts and takes the accent colour in turn, left to right, then
 * settles back the same way. The stagger is what makes it read as one movement
 * crossing the word rather than as every letter twitching at once, and springs
 * rather than durations are what keep it from arriving with a stop: a letter
 * that is still settling when the pointer leaves reverses from wherever it got
 * to, instead of snapping to the end of an animation it never finished.
 *
 * Spaces are rendered as their own non-animating spans. Wrapping a space in a
 * transformed inline-block collapses it, and the heading loses its word gaps.
 *
 * The whole text stays in the DOM as one string for assistive technology and
 * for selection; the per-character spans are hidden from it.
 */

import { motion, useReducedMotion } from "motion/react";

/** Per character. Short enough that a long heading still feels like one gesture. */
const STAGGER = 0.022;

export function KineticHeading({
  text,
  className,
  accentFrom,
}: {
  text: string;
  className?: string;
  /**
   * Index from which the rest of the line is already the accent colour, for a
   * heading that is part statement and part emphasis.
   */
  accentFrom?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <span className={className}>{text}</span>;
  }

  const characters = Array.from(text);

  return (
    <motion.span
      className={className}
      initial="rest"
      whileHover="lift"
      whileFocus="lift"
      tabIndex={-1}
      aria-label={text}
    >
      <span aria-hidden>
        {characters.map((character, index) => {
          if (character === " ") {
            return <span key={index}> </span>;
          }
          const accented = accentFrom !== undefined && index >= accentFrom;
          return (
            <motion.span
              key={index}
              className="inline-block will-change-transform"
              style={accented ? { color: "var(--accent)" } : undefined}
              variants={{
                rest: { y: 0, color: accented ? "var(--accent)" : "var(--foreground)" },
                lift: {
                  y: "-0.085em",
                  color: "var(--accent)",
                },
              }}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 26,
                mass: 0.5,
                delay: index * STAGGER,
              }}
            >
              {character}
            </motion.span>
          );
        })}
      </span>
    </motion.span>
  );
}
