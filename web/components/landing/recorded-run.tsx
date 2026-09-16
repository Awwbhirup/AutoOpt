"use client";

/**
 * A real recorded run, replayed at reading speed.
 *
 * The events come from lib/recorded-run.ts, which a script writes by running
 * the engine. They are folded with the same foldTrace the run pages use and
 * rendered with the same components, so this is not an illustration of the
 * product, it is the product's output with a clock attached.
 *
 * The motion has a job: the page claims the engine refuses most of what it
 * proposes, and watching five refusals land against three acceptances is that
 * claim being demonstrated rather than asserted. It is still motion that starts
 * without being asked, so it can be stopped, and it stops at the end rather
 * than looping.
 *
 * The step list is a fixed height that scrolls inside itself. Letting it grow
 * pushed the whole page down for twelve seconds while the column beside it sat
 * still, which left the hero taller than the screen by the time it finished.
 */

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { columnsOf } from "@/components/landing/cost-trajectory";
import { RunTrajectory3D } from "@/components/landing/run-trajectory-3d";
import { FinalVerdict } from "@/components/trace/final-verdict";
import { TraceStepList } from "@/components/trace/step-list";
import { RECORDED_EVENTS } from "@/lib/recorded-run";
import { foldTrace } from "@/lib/trace";

/** Per event. Eight decided steps land over roughly twelve seconds. */
const TICK_MS = 230;

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the reader has asked for less motion.
 *
 * Through useSyncExternalStore rather than an effect that sets state, so the
 * answer is available during the first render instead of one render later. The
 * server is told "yes", which is the answer that renders the whole trace: a
 * page that arrives complete and then empties itself to start playing would be
 * worse than one that simply plays.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}

/**
 * How far playback has got.
 *
 * `started` and `shown` are one value because they change together and are read
 * together. Keeping the flag in a ref would mean reading a ref during render to
 * decide what to draw, which is the thing refs are not for.
 */
interface Playback {
  started: boolean;
  shown: number;
}

/** Everything on screen, which is where playback begins and ends. */
const COMPLETE: Playback = { started: false, shown: RECORDED_EVENTS.length };

/** The finished run. Fixes the chart's axis before the first column arrives. */
const FINISHED = foldTrace(RECORDED_EVENTS);
const ALL_COLUMNS = columnsOf(FINISHED.steps);

export function RecordedRun() {
  const reducedMotion = usePrefersReducedMotion();
  const [playback, setPlayback] = useState<Playback>(COMPLETE);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (reducedMotion || paused) {
      stop();
      return;
    }
    timer.current = setInterval(() => {
      // The rewind is playback's first tick rather than a second render pass
      // out of the effect body, so no state is set while rendering.
      setPlayback((state) =>
        state.started
          ? { started: true, shown: Math.min(state.shown + 1, RECORDED_EVENTS.length) }
          : { started: true, shown: 0 },
      );
    }, TICK_MS);
    return stop;
  }, [reducedMotion, paused, stop]);

  const finished = playback.started && playback.shown >= RECORDED_EVENTS.length;
  const trace = useMemo(
    () => foldTrace(RECORDED_EVENTS.slice(0, playback.shown)),
    [playback.shown],
  );
  const columns = useMemo(() => columnsOf(trace.steps), [trace.steps]);
  const stepCount = trace.steps.length;

  // Follows the newest step down. Layout effect rather than effect so the
  // scroll is issued in the same frame the step is painted; a step appearing
  // and then being scrolled to is two movements where there should be one.
  //
  // Smooth rather than a jump, because a jump every 230ms is the jitter. The
  // scroll is short and the tick is long enough for it to land before the next.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || !playback.started) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [stepCount, playback.started, reducedMotion]);

  const toggle = () => {
    if (finished) {
      setPlayback({ started: true, shown: 0 });
      setPaused(false);
      return;
    }
    setPaused((value) => !value);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-terminal text-[0.78rem] text-muted">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full bg-accent ${
              finished ? "" : "animate-pulse"
            }`}
          />
          conditional_001 · greedy · recorded
        </p>
        {reducedMotion ? null : (
          <button
            type="button"
            onClick={toggle}
            // Pressed describes the pause, not the button: the control's job is
            // stopping motion, so "on" has to mean stopped.
            aria-pressed={paused}
            className="rounded border border-line px-2 py-0.5 font-terminal text-[0.82rem] text-muted transition-colors duration-100 hover:border-accent hover:text-accent"
          >
            {finished ? "replay" : paused ? "play" : "pause"}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface/80 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.9)] backdrop-blur-sm">
        <div className="border-b border-line px-4 pb-3 pt-4">
          <RunTrajectory3D slabs={columns} total={ALL_COLUMNS} />
        </div>

        {/* Masked top and bottom, so a step arrives out of a fade rather than
            at a hard edge, and the list reads as a window onto something longer
            than the window. */}
        <div
          ref={scroller}
          // Fixed, so the page does not grow for twelve seconds while it plays.
          className="max-h-[19rem] overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 18px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 18px), transparent 100%)",
          }}
        >
          {stepCount === 0 ? (
            <p className="flex h-40 items-center justify-center font-terminal text-[0.82rem] text-muted">
              reading conditional_001
            </p>
          ) : (
            <TraceStepList
              steps={trace.steps}
              status={trace.summary.status}
              initialTac={trace.initialTac}
            />
          )}
        </div>

        <AnimatePresence initial={false}>
          {finished ? (
            <motion.div
              key="verdict"
              // Grows the panel open rather than appearing inside it. Height is
              // the one property worth animating here: the card is already the
              // bottom of a fixed box, so nothing below it moves.
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-line bg-raised/80"
            >
              <div className="p-3">
                <FinalVerdict summary={trace.summary} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
