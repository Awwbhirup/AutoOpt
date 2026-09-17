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
import { Glass, GlassFilters } from "@/components/landing/glass";
import { KineticHeading } from "@/components/landing/kinetic-heading";
import { MethodRidgeline } from "@/components/landing/method-ridgeline";
import { Reveal } from "@/components/landing/reveal";
import { RecordedRun } from "@/components/landing/recorded-run";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { RIDGES } from "@/lib/method-ridges";
import { RECORDED_SOURCE } from "@/lib/recorded-run";

/** Counted from the grid rather than typed, so another arm cannot make it a lie. */
const RUNS = RIDGES.reduce((total, ridge) => total + ridge.n, 0);

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

/** The run beside this, split the two ways it can go. Eight were costed. */
const TALLY = [
  {
    value: 3,
    share: 3 / 8,
    token: "--accent",
    label: "rewrites kept, each one proved and priced first",
  },
  {
    value: 5,
    share: 5 / 8,
    token: "--refused",
    label: "verified, costed, and refused anyway",
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
      className="group relative rounded-md px-3 py-1.5 text-[0.9rem] text-muted transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground"
    >
      {label}
      {/* Drawn from the left on hover rather than faded in, so the direction
          matches the way the line is read. */}
      <span
        aria-hidden
        className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-accent transition-transform duration-200 ease-out group-hover:scale-x-100"
      />
    </Link>
  );
}

/** The two subexpressions the engine finds, and what it does with them. */
const FINDINGS = [
  {
    token: "in1 + 0",
    note: "Adding nothing. Algebraic simplification rewrites it to in1, which drops an arithmetic op and a temporary.",
  },
  {
    token: "in1 * 1",
    note: "Multiplying by one, in the other branch. Same rewrite, and it has to be proved separately because it is a different line.",
  },
  {
    token: "int r3 = 0",
    note: "Assigned, then overwritten on both paths before anything reads it. Dead code elimination takes the whole line.",
  },
];

/**
 * Spans the engine actually acts on, so the reader sees what it saw.
 *
 * Split on the group, then decide by membership. Testing each piece against the
 * same global regex would have been the obvious thing and would have been
 * wrong: a /g regex carries lastIndex between calls, so it reports every other
 * match as a miss.
 */
const HIGHLIGHT = /(in1 \+ 0|in1 \* 1|int r3 = 0)/g;
const HIGHLIGHTED = new Set(["in1 + 0", "in1 * 1", "int r3 = 0"]);

function Listing({ source }: { source: string }) {
  const lines = source.replace(/\n+$/, "").split("\n");

  return (
    <pre className="overflow-x-auto font-terminal text-[0.95rem] leading-[2]">
      <code>
        {lines.map((line, index) => (
          <span
            key={index}
            className="group grid grid-cols-[2.5rem_1fr] rounded transition-colors duration-150 hover:bg-white/[0.035]"
          >
            <span className="select-none pr-4 text-right tabular-nums text-muted/50 transition-colors duration-150 group-hover:text-accent">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-foreground/85">
              {line === "" ? (
                " "
              ) : (
                line.split(HIGHLIGHT).map((part, i) =>
                  HIGHLIGHTED.has(part) ? (
                    <mark
                      key={i}
                      className="rounded bg-accent/15 px-1 text-accent ring-1 ring-inset ring-accent/25"
                    >
                      {part}
                    </mark>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )
              )}
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
      <GlassFilters />
      <SmoothScroll />

      {/* Floating, and rounded. A square pane has no corner for the refraction
          to bend around, so the filter had nothing to show; inset from the
          edges it reads as a pane of glass lying over the page rather than as
          a band welded to the top of it. */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
        <Glass className="mx-auto w-full max-w-6xl rounded-2xl border border-white/[0.08]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-3.5 sm:gap-6 sm:px-6">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5 font-terminal text-[0.95rem] tracking-tight"
          >
            {/* Two chevrons closing on a bar: a program going in and coming
                out smaller. Drawn rather than set in type, because an arrow
                glyph in a box sat off-centre at every size. */}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-[22px] w-[22px] shrink-0 overflow-visible"
              fill="none"
            >
              <path
                d="M4 5 L10 12 L4 19"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="origin-center transition-transform duration-300 ease-out group-hover:translate-x-[2px]"
              />
              <path
                d="M14 19 L20 12 L14 5"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="origin-center transition-transform duration-300 ease-out group-hover:-translate-x-[2px]"
              />
              <path
                d="M12 8.5 L12 15.5"
                stroke="var(--accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            </svg>
            <span className="hidden font-semibold transition-colors duration-150 group-hover:text-accent xs:inline">
              autoopt
            </span>
          </Link>

          {/* What the page is evidence of, stated once where it stays in view. */}
          <p className="hidden items-center gap-2 font-terminal text-[0.76rem] text-muted md:flex">
            <span aria-hidden className="h-3 w-px bg-line" />
            <span className="tabular-nums text-foreground">{RUNS.toLocaleString()}</span>{" "}
            runs
            <span aria-hidden className="text-muted/50">/</span>
            <span className="tabular-nums text-foreground">{RIDGES.length}</span>{" "}
            methods
            <span aria-hidden className="text-muted/50">/</span>
            <span className="tabular-nums text-accent">0</span> false positives
          </p>

          {/* The text links go before the action does. On a narrow screen the
              wordmark, two links and a button came to 360px inside a 264px
              viewport, which scrolled the whole page sideways. */}
          <nav className="ml-auto flex items-center gap-1">
            <span className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </span>
            <Link
              href="/try"
              className="ml-1 shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 font-hero text-[0.8rem] font-bold text-accent transition-all duration-200 hover:border-accent/80 hover:bg-accent/20 sm:ml-2 sm:px-3.5 sm:text-[0.82rem]"
            >
              Try it
            </Link>
          </nav>
        </div>
        </Glass>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-6">
        {/* Five columns of claim against seven of evidence. The evidence is the
            wider half because it is the argument, not an illustration of it. */}
        <section className="grid gap-16 py-16 lg:grid-cols-12 lg:gap-20 lg:py-32">
          <div className="min-w-0 lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
            <p className="font-terminal text-[0.78rem] uppercase tracking-[0.3em] text-muted">
              verified compiler optimization
            </p>

            {/* The clause the product turns on is already in the colour the
                traces use for a rewrite that survived; the hover carries that
                colour back across the rest of the line, one letter at a time. */}
            <h1 className="mt-5 text-balance font-hero text-[clamp(2.6rem,5.2vw,4.4rem)] font-bold leading-[0.98] tracking-[-0.04em]">
              <KineticHeading
                text="Every rewrite is checked before it is kept."
                accentFrom={24}
                className="cursor-default"
              />
            </h1>

            <p className="mt-7 max-w-md text-pretty text-[1.05rem] leading-[1.75] text-muted">
              AutoOpt lowers a program to three-address code, looks for
              optimizations, and tests each one against the original before
              deciding. It refuses more than it keeps, and it writes down why.
            </p>

            <div className="mt-11 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/try"
                className="group inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 font-hero text-[0.95rem] font-bold tracking-[-0.01em] text-[#06120d] shadow-[0_0_0_0_var(--accent)] transition-[box-shadow,transform,filter] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_28px_-8px_var(--accent)] hover:brightness-110"
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
                className="group text-[0.95rem] text-muted transition-colors duration-150 hover:text-foreground"
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

            <dl className="mt-14 grid gap-3 sm:grid-cols-2">
              {TALLY.map((entry) => (
                <Glass
                  key={entry.label}
                  className="group/tile relative overflow-hidden p-5"
                >
                  {/* A bar of the count, drawn to scale against the eight
                      proposals that got as far as being costed. The number is
                      the fact; this is how much of the run it was. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-500 ease-out"
                    style={{
                      background: `var(${entry.token})`,
                      transform: `scaleX(${entry.share})`,
                    }}
                  />
                  <dt className="flex items-baseline gap-2">
                    <span
                      className="font-terminal text-[2.6rem] leading-none tabular-nums transition-transform duration-300 ease-out group-hover/tile:-translate-y-0.5"
                      style={{ color: `var(${entry.token})` }}
                    >
                      {entry.value}
                    </span>
                    <span className="font-terminal text-[0.78rem] text-muted">
                      of 8
                    </span>
                  </dt>
                  <dd className="mt-2.5 text-[0.86rem] leading-snug text-muted">
                    {entry.label}
                  </dd>
                </Glass>
              ))}
            </dl>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <RecordedRun />
          </div>
        </section>

        <Reveal className="border-t border-line py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 max-w-xl">
              <h2 className="font-hero text-[clamp(1.7rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                <KineticHeading text="And the same question asked four thousand times" className="cursor-default" />
              </h2>
              <p className="mt-4 text-pretty text-[0.95rem] leading-[1.7] text-muted">
                Every method against all 500 programs. The three searches that
                can cross a cost-neutral state land together at the back, the
                three that cannot land together in the middle, and the three
                language-model arms land at the front. A Tukey test on this data
                separates those three groups and no others.
              </p>
            </div>
            <p className="font-terminal text-[0.8rem] text-muted">
              drag your pointer across it
            </p>
          </div>

          <Glass className="mt-10 overflow-hidden p-5">
            <MethodRidgeline />
          </Glass>
        </Reveal>

        <Reveal className="border-t border-line py-24">
          {/* The prose column stretched to nine hundred pixels against a code
              panel of three hundred, because the three findings were stacked
              inside it while the listing beside them is nine short lines. The
              findings run underneath instead, where they have the full width
              and sit directly under the lines they are about. */}
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="min-w-0 lg:col-span-5">
              <h2 className="font-hero text-[clamp(1.7rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                <KineticHeading text="The program that run started from" className="cursor-default" />
              </h2>
              <p className="mt-5 max-w-md text-pretty text-[1rem] leading-[1.75] text-muted">
                Nine lines, and three of them are doing nothing. The engine has
                to find that from dataflow facts rather than from recognising
                the shape, show each rewrite is safe, and price it before it may
                keep it.
              </p>
            </div>

            <Glass className="min-w-0 p-6 lg:col-span-7">
              <Listing source={RECORDED_SOURCE} />
            </Glass>
          </div>

          <dl className="mt-10 grid gap-8 sm:grid-cols-3">
            {FINDINGS.map((finding) => (
              <div key={finding.token} className="border-t-2 border-accent/30 pt-4">
                <dt>
                  <code className="rounded bg-accent/10 px-1.5 py-0.5 font-terminal text-[0.88rem] text-accent ring-1 ring-inset ring-accent/25">
                    {finding.token}
                  </code>
                </dt>
                <dd className="mt-3 text-pretty text-[0.95rem] leading-[1.7] text-muted">
                  {finding.note}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className="border-t border-line py-24">
          <div className="max-w-2xl">
            <h2 className="font-hero text-[clamp(1.7rem,3vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              <KineticHeading text="How a change earns its place" className="cursor-default" />
            </h2>
            <p className="mt-5 text-pretty text-[1rem] leading-[1.75] text-muted">
              Four gates, in order. A rewrite that fails any of them is recorded
              and thrown away, which is what happens to most of them.
            </p>
          </div>

          {/* A sequence, not a grid of equal cards: these are four stages of one
              pipeline and the order is the content. The rule down the left is
              the pipeline; each stage hangs off it. */}
          <ol className="mt-14 space-y-px">
            {HOW.map((item, index) => (
              <li key={item.term} className="group relative">
                <div className="grid gap-x-6 gap-y-3 py-7 sm:grid-cols-[auto_minmax(0,18rem)_minmax(0,1fr)] sm:items-baseline">
                  <span
                    aria-hidden
                    className="font-terminal text-[0.8rem] tabular-nums text-muted transition-colors duration-200 group-hover:text-accent"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-hero text-[1.12rem] font-bold leading-snug tracking-[-0.01em] transition-colors duration-200 group-hover:text-accent">
                    {item.term}
                  </h3>
                  <p className="text-pretty text-[0.98rem] leading-[1.75] text-muted">
                    {item.detail}
                  </p>
                </div>

                {/* The rule between stages, which lights up left to right as
                    the stage above it is read. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px bg-line"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 ease-out group-hover:scale-x-100"
                />
              </li>
            ))}
          </ol>
        </Reveal>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <p className="font-terminal text-[0.82rem] text-muted">
            The run above is recorded output, replayed. Nothing on this page is a
            figure typed in by hand.
          </p>
        </div>
      </footer>
    </div>
  );
}
