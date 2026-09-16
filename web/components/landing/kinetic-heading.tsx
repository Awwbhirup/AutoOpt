"use client";

/**
 * A heading whose letters answer the pointer.
 *
 * Each character lifts and takes the accent colour in turn, left to right, then
 * settles back the same way. The stagger is what makes it read as one movement
 * crossing the line rather than every letter twitching at once, and springs
 * rather than durations are what keep it from arriving with a stop: a letter
 * still settling when the pointer leaves reverses from wherever it got to,
 * instead of snapping to the end of an animation it never finished.
 *
 * Split by word first, then by character inside each word. Splitting straight
 * into characters is the obvious way to write this and it breaks the heading:
 * every character becomes an inline-block, so the browser may wrap between any
 * two of them, and "Every rewrite is checked" came apart as "Everyre /
 * writeisc / hecked". The word wrappers are what carry the line breaks, and
 * nothing inside one can be split.
 *
 * The real text is in the DOM once as a visually hidden string. The animated
 * copy is hidden from assistive technology, which would otherwise read a
 * heading one letter at a time.
 */

import { motion, useReducedMotion } from "motion/react";

/** Per character. Short enough that a long heading stays one gesture. */
const STAGGER = 0.016;

export function KineticHeading({
  text,
  className,
  accentFrom,
}: {
  text: string;
  className?: string;
  /**
   * Character index from which the rest of the line is already the accent
   * colour, for a heading that is part statement and part emphasis.
   */
  accentFrom?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <span className={className}>
        {accentFrom === undefined ? (
          text
        ) : (
          <>
            {text.slice(0, accentFrom)}
            <span className="text-accent">{text.slice(accentFrom)}</span>
          </>
        )}
      </span>
    );
  }

  // Kept with their trailing space so the gaps survive. A space rendered as its
  // own inline-block collapses, and the words run together.
  const words = text.split(" ");

  // Each word's character offset in the whole string, worked out up front. A
  // counter incremented inside the map would be reassigned by a callback that
  // can run after render has finished, which is a different value on a second
  // pass and a different stagger every time the component re-renders.
  const offsets = words.reduce<number[]>((acc, word, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1] + words[index - 1].length + 1);
    return acc;
  }, []);

  return (
    <motion.span className={className} initial="rest" whileHover="lift">
      <span className="sr-only">{text}</span>

      <span aria-hidden>
        {words.map((word, wordIndex) => {
          const start = offsets[wordIndex];

          return (
            <span
              key={wordIndex}
              // Holds the word together. Line breaks happen between these.
              className="inline-block whitespace-nowrap"
            >
              {Array.from(word).map((character, index) => {
                const at = start + index;
                const accented = accentFrom !== undefined && at >= accentFrom;

                return (
                  <motion.span
                    key={index}
                    className="inline-block will-change-transform"
                    variants={{
                      rest: {
                        y: 0,
                        color: accented ? "var(--accent)" : "var(--foreground)",
                      },
                      lift: { y: "-0.08em", color: "var(--accent)" },
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 26,
                      mass: 0.5,
                      delay: at * STAGGER,
                    }}
                  >
                    {character}
                  </motion.span>
                );
              })}
              {wordIndex < words.length - 1 ? " " : null}
            </span>
          );
        })}
      </span>
    </motion.span>
  );
}
