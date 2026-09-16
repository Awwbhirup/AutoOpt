"use client";

/**
 * A heading whose letters answer the pointer.
 *
 * Each character lifts and takes the accent colour in turn, left to right. The
 * stagger is a transition-delay per letter, so the movement crosses the line
 * rather than every letter twitching at once.
 *
 * Pure CSS. It was forty-four springs a heading before, each interpolating a
 * transform and a colour on the main thread, and on a page already running two
 * canvases and a backdrop filter they arrived late and unevenly, which is what
 * the jitter was. A transition on transform and colour is handed to the
 * compositor and costs nothing per frame.
 *
 * Split by word first, then by character inside each word. Splitting straight
 * into characters makes every one an inline-block, so the browser may wrap
 * between any two of them and "Every rewrite is checked" comes apart as
 * "Everyre / writeisc / hecked". The word wrappers carry the line breaks.
 *
 * The spaces are text nodes between the wrappers, not inside them. A trailing
 * space inside an inline-block is trimmed, which is how the words ended up
 * jammed together.
 *
 * The real text is in the DOM once, hidden, for assistive technology; the
 * animated copy would otherwise be read a letter at a time.
 */

import { Fragment } from "react";

/** Per character. Fast enough that a long heading is one gesture, not a wave. */
const STAGGER_MS = 11;

export function KineticHeading({
  text,
  className = "",
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
  const words = text.split(" ");

  // Each word's character offset in the whole string, worked out up front. A
  // counter incremented inside the map would be reassigned by a callback that
  // can run after render completes, giving a different stagger each pass.
  const offsets = words.reduce<number[]>((acc, _word, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1] + words[index - 1].length + 1);
    return acc;
  }, []);

  return (
    <span className={`group/kin ${className}`}>
      <span className="sr-only">{text}</span>

      <span aria-hidden>
        {words.map((word, wordIndex) => (
          <Fragment key={wordIndex}>
            {/* Holds the word together; line breaks happen between these. */}
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((character, index) => {
                const at = offsets[wordIndex] + index;
                const accented = accentFrom !== undefined && at >= accentFrom;

                return (
                  <span
                    key={index}
                    style={{ transitionDelay: `${at * STAGGER_MS}ms` }}
                    className={`inline-block transition-[transform,color] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/kin:-translate-y-[0.07em] group-hover/kin:text-accent motion-reduce:transition-none motion-reduce:transform-none ${
                      accented ? "text-accent" : ""
                    }`}
                  >
                    {character}
                  </span>
                );
              })}
            </span>
            {wordIndex < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
