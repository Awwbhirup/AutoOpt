import type { Metadata } from "next";
import Link from "next/link";

import { CopyCommand } from "./copy-command";

export const metadata: Metadata = {
  title: "API reference | AutoOpt",
  description: "Create programs and stream AutoOpt runs from a workspace key.",
};

const BASE = "https://autoopt.vercel.app/api/v1";

const CREATE = `curl -X POST ${BASE}/programs \\
  -H "Authorization: Bearer $AUTOOPT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"PROJECT_ID","name":"Example","source":"input x; print(x);"}'`;

const OPTIMIZE = `curl -N -X POST ${BASE}/optimize \\
  -H "Authorization: Bearer $AUTOOPT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"programId":"PROGRAM_ID","method":"greedy"}'`;

const LIST = `curl ${BASE}/runs \\
  -H "Authorization: Bearer $AUTOOPT_API_KEY"`;

export default function ApiReferencePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 pt-10 pb-20 sm:px-6">
      <header>
        <p className="font-terminal text-xs uppercase tracking-wider text-muted">Developer reference</p>
        <h1 className="font-hero mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Public API</h1>
        <p className="mt-4 max-w-prose leading-7 text-foreground/75">
          Store a MiniLang program in a workspace, start an optimization run, and read the
          decision trace as it arrives. Responses and examples use the same data as the app.
        </p>
        <Link href="/api/v1/openapi.json" className="mt-4 inline-block text-sm underline underline-offset-4">
          OpenAPI 3.1 document
        </Link>
      </header>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Authentication and scopes</h2>
        <p className="leading-7 text-foreground/75">
          Create a key in workspace settings. Send it as <code className="font-terminal text-sm">Authorization: Bearer KEY</code>.
          The key belongs to one workspace and is shown only when created. Revoke it in settings at any time.
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ["programs:read", "List programs"], ["programs:write", "Create programs"],
            ["runs:read", "List runs and read a trace"], ["runs:write", "Start a run"],
          ].map(([scope, meaning]) => (
            <div key={scope} className="rounded-lg border border-line px-3 py-2">
              <code className="font-terminal text-xs">{scope}</code>
              <p className="mt-1 text-foreground/75">{meaning}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Create a program</h2>
        <p className="leading-7 text-foreground/75">
          A program is stored in an existing project from the same workspace. Use its project ID
          from the app, then keep the returned program ID for the run request.
        </p>
        <CopyCommand label="POST /programs" command={CREATE} />
      </section>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Stream a run</h2>
        <p className="leading-7 text-foreground/75">
          The response is newline-delimited JSON. Each line is one event; the final line is
          <code className="font-terminal text-sm"> run_converged</code> or
          <code className="font-terminal text-sm"> run_failed</code>. The
          <code className="font-terminal text-sm"> x-run-id</code> header identifies the saved trace.
        </p>
        <CopyCommand label="POST /optimize" command={OPTIMIZE} />
      </section>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Read past runs</h2>
        <CopyCommand label="GET /runs" command={LIST} />
        <p className="leading-7 text-foreground/75">
          <code className="font-terminal text-sm">GET /runs/ID</code> returns a run with its ordered events.
          <code className="font-terminal text-sm"> GET /programs</code> lists programs and supports
          <code className="font-terminal text-sm"> limit</code> and
          <code className="font-terminal text-sm"> cursor</code> query parameters.
        </p>
      </section>

      <section className="space-y-3 border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Errors and limits</h2>
        <p className="leading-7 text-foreground/75">
          Errors before a stream starts are JSON with an error field. A missing or expired key
          returns 401, a missing scope returns 403, a bad request returns 422, and a run quota
          refusal returns 429. A compute service that is offline returns 503. Program source is
          limited to 8,000 characters for optimization.
        </p>
      </section>
    </main>
  );
}
