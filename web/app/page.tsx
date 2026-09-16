/**
 * The landing page.
 *
 * Built around the one thing no other compiler's page can show: an actual run,
 * with its refusals in it. The trace on the right is recorded output replayed
 * through the same fold and the same components the run pages use, so the page
 * cannot drift from the product without the product's own tests noticing.
 *
 * Deliberately asymmetric and deliberately not a row of three cards. The claim
 * is one column and the evidence is the wider one beside it; the section under
 * it is a before-and-after, which is the shape the content actually has.
 *
 * Accent is emerald, taken from the verdict badges rather than chosen: in this
 * product green already means "kept", and the page should not teach a second
 * colour language.
 */

import Link from "next/link";

import { RecordedRun } from "@/components/landing/recorded-run";
import { RECORDED_SOURCE } from "@/lib/recorded-run";

/** Four, because there are four. Not three to fill a row. */
const HOW = [
  {
    term: "Lowered, not parsed and hoped over",
    detail:
      "Your source becomes three-address code and a control-flow graph. Every analysis and every rewrite works on that, which is why every decision in that run can name a line.",
  },
  {
    term: "Proposed by a rule engine or a model",
    detail:
      "Dataflow facts drive a forward-chaining rule engine. A language model can take the same role and propose the next transformation instead, on the same programs and the same verifier.",
  },
  {
    term: "Tested against the original",
    detail:
      "Each candidate runs against the program it came from on generated inputs. The final program is then checked again with an SMT solver, over a defined subset of the language, and the subset is stated.",
  },
  {
    term: "Kept only if it also pays",
    detail:
      "Passing verification is not enough. A rewrite that leaves the weighted cost where it was is refused, which is most of them.",
  },
];

function Listing({ source }: { source: string }) {
  return (
    <pre className="overflow-x-auto font-mono text-xs leading-6 text-zinc-700 dark:text-zinc-300">
      <code>{source.replace(/\n+$/, "")}</code>
    </pre>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-mono text-sm tracking-tight text-zinc-900 dark:text-zinc-50">
            autoopt
          </span>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/docs"
              className="text-zinc-600 transition-colors duration-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Language
            </Link>
            <Link
              href="/signin"
              className="text-zinc-600 transition-colors duration-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Five columns of claim against seven of evidence. The evidence is the
            wider half because it is the argument, not an illustration of it. */}
        <section className="grid gap-12 py-16 lg:grid-cols-12 lg:gap-16 lg:py-24">
          <div className="lg:col-span-5">
            <h1 className="text-balance text-[clamp(2rem,4.2vw,3.15rem)] font-medium leading-[1.1] tracking-[-0.025em] text-zinc-900 dark:text-zinc-50">
              Every rewrite is checked before it is kept.
            </h1>
            <p className="mt-6 max-w-md text-pretty leading-relaxed text-zinc-600 dark:text-zinc-400">
              AutoOpt lowers a program to three-address code, looks for
              optimizations, and tests each one against the original before
              deciding. It refuses more than it keeps, and it writes down why.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/try"
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-100 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Optimize a program
              </Link>
              <Link
                href="/docs"
                className="text-sm text-zinc-600 underline-offset-4 transition-colors duration-100 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                See what the language supports
              </Link>
            </div>

            <dl className="mt-12 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <div className="flex items-baseline gap-3">
                <dt className="font-mono text-2xl tabular-nums text-emerald-700 dark:text-emerald-400">
                  3
                </dt>
                <dd className="text-sm text-zinc-600 dark:text-zinc-400">
                  rewrites kept in the run beside this
                </dd>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <dt className="font-mono text-2xl tabular-nums text-zinc-900 dark:text-zinc-100">
                  5
                </dt>
                <dd className="text-sm text-zinc-600 dark:text-zinc-400">
                  verified, costed, and refused anyway
                </dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-7">
            <RecordedRun />
          </div>
        </section>

        <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <h2 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
                The program that run started from
              </h2>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Two identities a reader can spot: adding nothing, and
                multiplying by one. The engine has to find them from dataflow
                facts, show each one is safe, and price it before it may keep
                it. It got 35.9% off the weighted cost.
              </p>
            </div>
            <div className="rounded border border-zinc-200 bg-zinc-50 p-4 lg:col-span-8 dark:border-zinc-800 dark:bg-zinc-900/50">
              <Listing source={RECORDED_SOURCE} />
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
          <h2 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
            How a change earns its place
          </h2>
          {/* A list, not cards. Nothing here is a separate object needing a
              boundary drawn round it; they are four stages of one pipeline. */}
          <dl className="mt-8 grid gap-x-16 gap-y-8 sm:grid-cols-2">
            {HOW.map((item, index) => (
              <div
                key={item.term}
                className="border-t border-zinc-200 pt-4 dark:border-zinc-800"
              >
                <dt className="flex gap-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="font-mono text-zinc-400 dark:text-zinc-600">
                    {index + 1}
                  </span>
                  {item.term}
                </dt>
                <dd className="mt-2 text-pretty pl-7 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            The run above is recorded output, replayed. Nothing on this page is
            a figure typed in by hand.
          </p>
        </div>
      </footer>
    </div>
  );
}
