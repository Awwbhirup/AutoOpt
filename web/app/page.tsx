import Link from "next/link";

const CLAIMS = [
  {
    heading: "It shows its working",
    body: "Every optimization is recorded as it happens: what was found, what was proposed, whether it survived verification, what it cost, and whether it was kept.",
  },
  {
    heading: "Nothing is taken on trust",
    body: "A change is kept only if it passes verification and lowers cost. Equivalence is checked twice over, by differential testing and by an SMT solver, and the limits of each are stated rather than glossed.",
  },
  {
    heading: "Several ways to search",
    body: "A fixed pipeline, greedy selection, A*, hill climbing, simulated annealing, and a language model proposing transformations. The same program, the same verifier, the same cost model.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        AutoOpt
      </h1>
      <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
        An optimizing compiler that reports every decision it makes, and keeps a
        change only when it can show the program still does the same thing.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/try"
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Optimize a program
        </Link>
        <Link
          href="/docs"
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
        >
          What it supports
        </Link>
      </div>

      <dl className="mt-16 grid gap-8 sm:grid-cols-3">
        {CLAIMS.map((claim) => (
          <div key={claim.heading}>
            <dt className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {claim.heading}
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {claim.body}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
