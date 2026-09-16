import type { Metadata } from "next";

import { TryItClient } from "./client";

export const metadata: Metadata = {
  title: "Try it",
  description: "Optimize a program and watch every decision as it is made.",
};

const SAMPLES = [
  {
    name: "Arithmetic",
    note: "Constants that fold, an expression computed twice, a multiply by one.",
    source: `input x;
int a = 2 + 3;
int b = x + a;
int c = x + a;
int d = c * 1;
print(b);
print(d);
`,
  },
  {
    name: "Loop",
    note: "An expression inside the loop that does not depend on it.",
    source: `input n;
int total = 0;
int factor = 4;
int i = 0;
while (i < n) {
  int scale = factor * 2;
  total = total + scale;
  i = i + 1;
}
print(total);
`,
  },
  {
    name: "Dead code",
    note: "Values computed and never read.",
    source: `input x;
int used = x + 1;
int unused = x * 99;
int alsoUnused = unused + 7;
print(used);
`,
  },
];

export default function TryPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Optimize a program
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Every step is shown as it happens: the opportunity found, what was
          proposed, whether it survived verification, what it cost, and whether
          it was kept. Nothing is accepted unless it both verifies and gets
          cheaper.
        </p>
      </header>

      <TryItClient samples={SAMPLES} />
    </main>
  );
}
