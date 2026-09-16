/**
 * What sits behind the landing page.
 *
 * Flat black read as a void behind a page whose subject is a process that
 * happens over time. This gives it somewhere to happen: two enormous, very dim
 * washes of the accent drifting on long unequal cycles, a grain layer over
 * them, and a grid that fades out before it reaches the content.
 *
 * The constraint is that none of it may compete. Nothing crosses six percent
 * opacity, nothing has an edge the eye can catch, and the two cycles are 34 and
 * 44 seconds so they never resolve into a pattern you can start watching. The
 * grid earns its place by saying "instrument" rather than "marketing page",
 * which is the register the rest of the page is in.
 *
 * A server component with no state: it is three divs and an SVG, and the drift
 * is CSS keyframes that stop under prefers-reduced-motion.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Graph paper, faded out before it reaches the middle so the content
          never sits on a visible ruling. */}
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 0%, transparent 70%)",
        }}
      />

      <div
        className="landing-wash-a absolute -left-1/4 -top-1/3 h-[110vh] w-[110vh] rounded-full opacity-[0.06] will-change-transform"
        style={{
          background:
            "radial-gradient(circle, var(--accent) 0%, transparent 62%)",
        }}
      />
      <div
        className="landing-wash-b absolute -bottom-1/3 -right-1/4 h-[95vh] w-[95vh] rounded-full opacity-[0.05] will-change-transform"
        style={{
          background:
            "radial-gradient(circle, #6ea8ff 0%, transparent 62%)",
        }}
      />

      {/* Grain. Enough to stop the washes banding on an 8-bit panel, which is
          what a large soft gradient on near-black does without it. */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.16]">
        <filter id="landing-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#landing-grain)" />
      </svg>
    </div>
  );
}
