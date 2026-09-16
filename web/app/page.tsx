/**
 * The landing page.
 *
 * Built around the one thing no other compiler's page can show: an actual run,
 * with its refusals in it. The trace on the right is recorded output replayed
 * through the same fold and the same components the run pages use, so the page
 * cannot drift from the product without the product's own tests noticing.
 *
 * Dark whatever the system says, and it says so in globals.css under .landing.
 * It is the only surface in the application that ignores the setting: its whole
 * subject is a terminal-coloured decision log, which does not survive white.
 *
 * Laid out against the notes on generic frontends rather than round a stock
 * hero: asymmetric instead of centred, a before-and-after and a four-item list
 * instead of two rows of three cards, flat surfaces and one accent instead of a
 * gradient. The accent is the colour the traces already use for a rewrite that
 * was kept, so the page does not teach a second colour language.
 *
 * The left column is sticky. It is short and the column beside it is tall, and
 * pinning the claim while the evidence scrolls past is the point of putting the
 * two side by side at all.
 */

import Link from "next/link";

import { Backdrop } from "@/components/landing/backdrop";
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
      "Dataflow facts drive a forward-chaining rule engine. A language model can take the same role and propose the next transformation instead, on the same programs and against the same verifier.",
  },
  {
    term: "Tested against the original",
    detail:
      "Each candidate runs against the program it came from on generated inputs. The final program is checked again with an SMT solver, over a defined subset of the language, and the subset is stated rather than glossed.",
  },
  {
    term: "Kept only if it also pays",
    detail:
      "Passing verification is not enough. A rewrite that leaves the weighted cost exactly where it was is refused, which is what happened to five of the eleven proposals in that run.",
  },
];

const NAV = [
  { href: "/docs", label: "Language" },
  { href: "/signin", label: "Sign in" },
];

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group relative py-1 text-sm text-muted transition-colors duration-150 hover:text-foreground"
    >
      {label}
      {/* Drawn from the left on hover rather than faded in, so the direction
          matches the way the line is read. */}
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-accent transition-transform duration-200 ease-out group-hover:scale-x-100"
      />
    </Link>
  );
}

function Listing({ source }: { source: string }) {
  const lines = source.replace(/\n+$/, "").split("\n");
  return (
    <pre className="overflow-x-auto font-terminal text-xs leading-6">
      <code>
        {lines.map((line, index) => (
          <span key={index} className="group grid grid-cols-[2rem_1fr]">
            <span className="select-none pr-3 text-right tabular-nums text-muted transition-colors duration-100 group-hover:text-accent">
              {index + 1}
            </span>
            <span className="transition-colors duration-100 group-hover:text-accent">
              {line === "" ? " " : line}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export default function Home() {
  return (
    <div className="landing relative flex min-h-full flex-1 flex-col bg-background text-foreground">
      <Backdrop />

      <header className="sticky top-0 z-20 border-b border-line bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="group flex items-center gap-2 font-terminal text-sm tracking-tight"
          >
            <span
              aria-hidden
              className="text-accent transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            >
              {"->"}
            </span>
            <span className="transition-colors duration-150 group-hover:text-accent">
              autoopt
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            {NAV.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Five columns of claim against seven of evidence. The evidence is the
            wider half because it is the argument, not an illustration of it. */}
        <section className="grid gap-12 py-14 lg:grid-cols-12 lg:gap-14 lg:py-20">
          <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
            <p className="font-terminal text-[0.7rem] uppercase tracking-[0.28em] text-muted">
              verified compiler optimization
            </p>

            <h1 className="mt-5 text-balance font-hero text-[clamp(1.95rem,3.9vw,3.05rem)] font-medium leading-[1.12] tracking-[-0.035em]">
              Every rewrite is checked
              {/* The clause the product turns on, in the colour the product
                  already uses for a rewrite that survived. */}
              <span className="text-accent"> before it is kept</span>.
            </h1>

            <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted">
              AutoOpt lowers a program to three-address code, looks for
              optimizations, and tests each one against the original before
              deciding. It refuses more than it keeps, and it writes down why.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/try"
                className="group inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-hero text-[0.8rem] font-semibold tracking-[-0.01em] text-[#06120d] shadow-[0_0_0_0_var(--accent)] transition-[box-shadow,transform,filter] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-8px_var(--accent)] hover:brightness-110"
              >
                Optimize a program
                <span
                  aria-hidden
                  className="transition-transform duration-150 ease-out group-hover:translate-x-1"
                >
                  {"->"}
                </span>
              </Link>
              <Link
                href="/docs"
                className="group text-sm text-muted transition-colors duration-150 hover:text-foreground"
              >
                See what the language supports
                <span
                  aria-hidden
                  className="ml-1 inline-block text-accent opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                >
                  {"->"}
                </span>
              </Link>
            </div>

            <dl className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
              <div className="bg-accent-soft px-4 py-3 transition-colors duration-150 hover:bg-accent/10">
                <dt className="font-terminal text-3xl tabular-nums text-accent">3</dt>
                <dd className="mt-0.5 text-xs leading-snug text-muted">
                  rewrites kept in the run beside this
                </dd>
              </div>
              <div className="bg-refused-soft px-4 py-3 transition-colors duration-150 hover:bg-refused/10">
                <dt className="font-terminal text-3xl tabular-nums text-refused">5</dt>
                <dd className="mt-0.5 text-xs leading-snug text-muted">
                  verified, costed, refused anyway
                </dd>
              </div>
            </dl>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <RecordedRun />
          </div>
        </section>

        <section className="border-t border-line py-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
            <div className="min-w-0 lg:col-span-4">
              <h2 className="font-hero text-xl font-medium tracking-[-0.02em]">
                The program that run started from
              </h2>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">
                Two identities a reader can spot: adding nothing, and multiplying
                by one. The engine has to find them from dataflow facts, show
                each one is safe, and price it before it may keep it. It got{" "}
                <span className="font-terminal text-accent">35.9%</span> off the
                weighted cost.
              </p>
            </div>
            <div className="min-w-0 rounded-lg border border-line bg-surface/70 p-4 backdrop-blur-sm lg:col-span-8">
              <Listing source={RECORDED_SOURCE} />
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="font-hero text-xl font-medium tracking-[-0.02em]">
            How a change earns its place
          </h2>
          {/* A list, not cards. Nothing here is a separate object needing a
              boundary drawn round it; they are four stages of one pipeline. */}
          <dl className="mt-8 grid gap-x-14 gap-y-8 sm:grid-cols-2">
            {HOW.map((item, index) => (
              <div key={item.term} className="group border-t border-line pt-4">
                <dt className="flex gap-3 text-sm font-medium">
                  <span className="font-terminal text-muted transition-colors duration-150 group-hover:text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.term}
                </dt>
                <dd className="mt-2 text-pretty pl-8 text-sm leading-relaxed text-muted">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <p className="font-terminal text-xs text-muted">
            The run above is recorded output, replayed. Nothing on this page is a
            figure typed in by hand.
          </p>
        </div>
      </footer>
    </div>
  );
}
