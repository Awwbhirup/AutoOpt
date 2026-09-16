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
 * without being asked, so it can be stopped, and it stops on its own at the end
 * rather than looping.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
 * page that arrives complete and then empties itself to start playing would
 * be worse than one that simply plays.
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

export function RecordedRun() {
  const reducedMotion = usePrefersReducedMotion();
  // Starts complete, so the server render, the reduced-motion render and the
  // no-JavaScript case all leave the whole trace on the page rather than an
  // empty box. Playback rewinds it on its first tick.
  const [playback, setPlayback] = useState<Playback>(COMPLETE);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const toggle = () => {
    if (finished) {
      setPlayback({ started: true, shown: 0 });
      setPaused(false);
      return;
    }
    setPaused((value) => !value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          conditional_001 · greedy · recorded
        </p>
        {reducedMotion ? null : (
          <button
            type="button"
            onClick={toggle}
            // Pressed describes the pause, not the button: the control's job is
            // stopping motion, so "on" has to mean stopped.
            aria-pressed={paused}
            className="rounded border border-zinc-300 px-2 py-0.5 font-mono text-xs text-zinc-600 transition-colors duration-100 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
          >
            {finished ? "replay" : paused ? "play" : "pause"}
          </button>
        )}
      </div>

      <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        {trace.steps.length === 0 ? (
          // Holds the height it is about to need, so the section below does not
          // get shoved down the page as the first steps arrive.
          <p className="flex h-64 items-center justify-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
            reading conditional_001
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {finished ? <FinalVerdict summary={trace.summary} /> : null}
            <TraceStepList
              steps={trace.steps}
              status={trace.summary.status}
              initialTac={trace.initialTac}
            />
          </div>
        )}
      </div>
    </div>
  );
}
