/** Every run of a suite run as CSV, one line per run. */

import { prisma } from "@/lib/db";
import { listSuiteRunRows } from "@/lib/repositories/suites";
import { suiteRunForCaller } from "@/lib/suites/access";
import { suiteCsv } from "@/lib/suites/results";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await suiteRunForCaller(id);
  if (!access.ok) return new Response(null, { status: access.status });

  const rows = await listSuiteRunRows(prisma, id);
  const day = access.suiteRun.startedAt.toISOString().slice(0, 10);
  const name = `${slugify(access.suiteRun.suite.name) || "suite"}-${day}.csv`;

  return new Response(suiteCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
