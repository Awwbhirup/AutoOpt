import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  EXAMPLE,
  GRAMMAR,
  KEYWORDS,
  LIMITATIONS,
  OPERATORS,
  PIPELINE,
  SEMANTICS,
  STATEMENTS,
  TRANSFORMATIONS,
  VERIFICATION,
} from "./language";

export const metadata: Metadata = {
  title: "Supported language | AutoOpt",
  description:
    "MiniLang: the grammar AutoOpt accepts, the eight transformations it can apply, " +
    "what the two verification channels prove, and where all of it stops.",
};

/**
 * The contents list and the anchors it points at. `as const` so a section whose
 * id no entry here names fails to compile rather than linking nowhere.
 */
const SECTIONS = [
  { id: "language", title: "What the language supports" },
  { id: "example", title: "A worked example" },
  { id: "pipeline", title: "How optimization works" },
  { id: "catalog", title: "The eight transformations" },
  { id: "verification", title: "What verification proves" },
  { id: "limitations", title: "Limitations" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: SectionId;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-line pt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 max-w-prose leading-7 text-foreground/75">{lead}</p>
      ) : null}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

function Listing({ label, children }: { label: string; children: string }) {
  return (
    <figure className="space-y-2">
      <figcaption className="font-terminal text-xs uppercase tracking-wider text-muted">
        {label}
      </figcaption>
      <pre className="overflow-x-auto rounded-lg border border-line bg-foreground/5 p-4 text-[13px] leading-6 text-foreground">
        <code className="font-terminal">{children}</code>
      </pre>
    </figure>
  );
}

function Term({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="font-medium text-foreground">{term}</dt>
      <dd className="max-w-prose leading-7 text-foreground/75">{children}</dd>
    </div>
  );
}

export default function LanguagePage() {
  return (
    <div className="flex-1 px-4 pt-10 pb-20 sm:px-6">
      <main className="mx-auto w-full max-w-3xl">
        <header>
                    <h1 className="font-hero text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            The supported language
          </h1>
          <p className="mt-4 max-w-prose leading-7 text-foreground/75">
            AutoOpt optimizes MiniLang, a small imperative language with one type and one
            observable effect. Every claim the project makes about correctness is scoped to
            exactly what is on this page, so it describes what the engine implements today and
            says plainly where that stops.
          </p>
          <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </header>

        <div className="mt-12 space-y-12">
          <Section
            id="language"
            title="What the language supports"
            lead="Integers, assignment, if, while, for, and print. The grammar below is the whole of it, lowest precedence first."
          >
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-left font-terminal text-[13px]">
                <tbody>
                  {GRAMMAR.map((production) => (
                    <tr
                      key={production.name}
                      className="border-b border-line last:border-0"
                    >
                      <th
                        scope="row"
                        className="w-40 px-4 py-2 align-top font-normal text-muted"
                      >
                        {production.name}
                      </th>
                      <td className="px-4 py-2 align-top text-foreground">
                        {production.rule}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="max-w-prose leading-7 text-foreground/75">
              The keywords are{" "}
              <span className="font-terminal text-foreground">
                {KEYWORDS.join(", ")}
              </span>
              . Anything else that lexes as a name is an identifier.
            </p>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Operators
              </h3>
              <div className="mt-3 overflow-x-auto rounded-md border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted">
                    <tr className="border-b border-line">
                      <th scope="col" className="px-4 py-2 font-medium">
                        Level
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Operators
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Binds
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPERATORS.map((level) => (
                      <tr
                        key={level.level}
                        className="border-b border-line last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-2 align-top text-muted">
                          {level.level}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 align-top font-terminal text-foreground">
                          {level.operators}
                        </td>
                        <td className="px-4 py-2 align-top text-muted">{level.associativity}</td>
                        <td className="px-4 py-2 align-top text-foreground/75">
                          {level.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Statements
              </h3>
              <dl className="mt-4 space-y-5">
                {STATEMENTS.map((statement) => (
                  <div key={statement.form} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-6">
                    <dt>
                      <span className="font-terminal text-sm text-foreground">
                        {statement.syntax}
                      </span>
                      <span className="block text-xs text-muted">{statement.form}</span>
                    </dt>
                    <dd className="max-w-prose leading-7 text-foreground/75">
                      {statement.note}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Semantics
              </h3>
              <dl className="mt-4 space-y-5">
                {SEMANTICS.map((rule) => (
                  <Term key={rule.topic} term={rule.topic}>
                    {rule.rule}
                  </Term>
                ))}
              </dl>
            </div>
          </Section>

          <Section
            id="example"
            title="A worked example"
            lead="One program, lowered and then optimized. The listings are from an actual run at seed 0 with the default cost weights, not a sketch of one."
          >
            <Listing label="source">{EXAMPLE.source}</Listing>
            <Listing label="three-address code, before optimization">{EXAMPLE.lowered}</Listing>

            <p className="max-w-prose leading-7 text-foreground/75">
              Lowering folds nothing, so the redundancy is all still there: a doubling, a
              subtraction of a value from itself sitting inside the loop, an addition of the zero
              that comes out of it, and a chain of copies. The{" "}
              <span className="font-terminal text-sm">greedy</span> method takes the first move that
              lowers cost, and on this program it finds two of them and then stops with cost at{" "}
              {EXAMPLE.greedy.cost.toFixed(3)} of the original, having accepted{" "}
              {EXAMPLE.greedy.accepted} of {EXAMPLE.greedy.proposals} proposals.
            </p>

            <Listing label={`after ${EXAMPLE.greedy.method}`}>{EXAMPLE.greedy.listing}</Listing>

            <p className="max-w-prose leading-7 text-foreground/75">
              Nothing was wrong with the moves it skipped. Propagating a copy does not remove an
              instruction by itself, so it fails the cost gate on its own even though it is what
              makes the removal possible one step later. A method that can sit on a plateau gets
              through the chain: <span className="font-terminal text-sm">astar</span> accepts{" "}
              {EXAMPLE.astar.accepted} transformations out of {EXAMPLE.astar.proposals} proposals
              and finishes at {EXAMPLE.astar.cost.toFixed(3)}, with the loop body down to the two
              instructions that do the work.
            </p>

            <Listing label={`after ${EXAMPLE.astar.method}`}>{EXAMPLE.astar.listing}</Listing>

            <p className="max-w-prose leading-7 text-foreground/75">
              In order, the accepted transformations were{" "}
              <span className="font-terminal text-sm">{EXAMPLE.applied.join(", ")}</span>. Every one of
              them was verified against the original before it was kept, and the final program was
              compared against the original again on the thorough profile.
            </p>
          </Section>

          <Section
            id="pipeline"
            title="How optimization works"
            lead="One loop, run until it stops paying. The stages below are the whole of a run."
          >
            <ol className="space-y-5">
              {PIPELINE.map((stage, index) => (
                <li key={stage.title} className="grid gap-1 sm:grid-cols-[2rem_1fr] sm:gap-4">
                  <span className="font-terminal text-sm text-muted/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-medium text-foreground">{stage.title}</h3>
                    <p className="mt-1 max-w-prose leading-7 text-foreground/75">
                      {stage.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            id="catalog"
            title="The eight transformations"
            lead="Each one is an action with stated preconditions and effects, and each re-checks its own preconditions before it rewrites anything, because the program may have moved underneath it since the opportunity was found."
          >
            <div className="space-y-6">
              {TRANSFORMATIONS.map((transformation) => (
                <article
                  key={transformation.kind}
                  className="glass glass--card rounded-xl p-5"
                >
                  <h3 className="font-medium text-foreground">
                    {transformation.name}
                  </h3>
                  <p className="mt-1 font-terminal text-xs text-muted">{transformation.kind}</p>
                  <p className="mt-3 max-w-prose leading-7 text-foreground/75">
                    {transformation.description}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="sm:flex sm:gap-3">
                      <dt className="w-32 shrink-0 text-muted">preconditions</dt>
                      <dd className="font-terminal text-[13px] text-foreground/80">
                        {transformation.preconditions}
                      </dd>
                    </div>
                    <div className="sm:flex sm:gap-3">
                      <dt className="w-32 shrink-0 text-muted">effects</dt>
                      <dd className="font-terminal text-[13px] text-foreground/80">
                        {transformation.effects}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </Section>

          <Section
            id="verification"
            title="What verification proves"
            lead="Two independent channels, and they are worth different things. A candidate is kept only if neither refutes it, which is not the same as either one endorsing it."
          >
            {VERIFICATION.map((channel) => (
              <article key={channel.method} className="space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">{channel.title}</h3>
                  <p className="mt-1 font-terminal text-xs text-muted">
                    {channel.method} | verdicts: {channel.verdicts.join(", ")}
                  </p>
                </div>
                <p className="max-w-prose leading-7 text-foreground/75">
                  {channel.summary}
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Establishes
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground/75">
                      {channel.proves.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Does not establish
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground/75">
                      {channel.doesNotProve.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </Section>

          <Section
            id="limitations"
            title="Limitations"
            lead="These are properties of the implementation as it stands, not defects and not a list of things that are about to change. A result from AutoOpt means what it means inside these bounds."
          >
            <dl className="space-y-5">
              {LIMITATIONS.map((limitation) => (
                <div key={limitation.title}>
                  <dt className="font-medium text-foreground">
                    {limitation.title}
                  </dt>
                  <dd className="mt-1 max-w-prose leading-7 text-foreground/75">
                    {limitation.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </main>
    </div>
  );
}
