"""Report output.

Two things, from the same run data.

A per-program decision log, which is what the spec asks for as the expected
output: at every step the opportunity analysed, what was proposed, the
verification result, cost before and after, and the accept or reject decision,
ending with the final TAC, the overall reduction and a PASS/FAIL verdict. Written
as text, one file per program, because 500 of them do not belong in one page.

A summary page carrying the metrics table, the per-method and per-category
breakdowns, and the six figures. Self contained: the figures are inlined as data
URIs, so the file can be opened from disk or handed over on its own, with no
server and nothing to break during a demo.
"""

from __future__ import annotations

import base64
import html
from collections.abc import Sequence
from pathlib import Path

from ..events import (
    CandidateProposed,
    CostEvaluated,
    Decision,
    Event,
    OpportunityFound,
    RunConverged,
    RunStarted,
    VerificationResult,
)
from ..figures import MetricsTable, Theme, by_category, by_method

Rows = Sequence[dict[str, str]]


def decision_log(events: Sequence[Event]) -> str:
    """The per-step log the spec asks for, as plain text."""
    lines: list[str] = []
    reduction = 0.0

    for event in events:
        match event:
            case RunStarted():
                lines.append(
                    f"program {event.program_id}   category {event.category}   method {event.method}"
                )
                lines.append(
                    f"initial cost {event.initial_cost.weighted_total:.4f}, "
                    f"{event.initial_cost.instruction_count} instructions"
                )
                lines.append("")
                lines.append("original TAC")
                lines.extend(f"    {line}" for line in event.initial_tac)
                lines.append("")
            case OpportunityFound():
                lines.append(
                    f"  [{event.seq:>4}] analysed  {event.optimization_type.value} at {event.site}"
                )
                if event.derived_from:
                    lines.append(f"         facts   {', '.join(event.derived_from)}")
            case CandidateProposed():
                lines.append(f"         proposed {event.optimization_type.value} ({event.source})")
                if event.rationale:
                    lines.append(f"         reason  {event.rationale}")
            case VerificationResult():
                detail = f" counterexample {event.counterexample}" if event.counterexample else ""
                lines.append(
                    f"         verify  {event.verdict.value} via {event.method.value}"
                    f" ({event.inputs_tested} inputs){detail}"
                )
            case CostEvaluated():
                lines.append(
                    f"         cost    {event.cost_before.weighted_total:.4f}"
                    f" -> {event.cost_after.weighted_total:.4f}"
                    f"  {'better' if event.improved else 'no gain'}"
                )
            case Decision():
                verdict = "ACCEPT" if event.accepted else f"reject ({event.reject_reason})"
                lines.append(f"         decide  {verdict}")
            case RunConverged():
                reduction = 1.0 - event.final_cost.weighted_total
                lines.append("")
                lines.append(
                    f"converged after {event.iterations} iterations, "
                    f"{event.proposals} proposals, {event.accepted} accepted"
                )
                lines.append("")
                lines.append("optimized TAC")
                lines.extend(f"    {line}" for line in event.final_tac)
                lines.append("")
                lines.append(f"cost reduction {reduction:.1%}")
                lines.append(f"output match   {'PASS' if event.output_match else 'FAIL'}")

    return "\n".join(lines)


def _inline(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def _table(headings: Sequence[str], rows: Sequence[Sequence[object]]) -> str:
    head = "".join(f"<th>{html.escape(str(h))}</th>" for h in headings)
    body = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


FIGURE_TITLES = {
    "sankey_decisions": "Where proposals end up",
    "outcomes_by_kind": "Outcome per transformation",
    "cost_trajectories": "Cost falling across iterations",
    "applied_mix": "Mix of applied transformations",
    "steps_vs_improvement": "Steps against improvement",
    "category_kind_heatmap": "Category against transformation",
}


def summary_page(
    rows: Rows,
    metrics: MetricsTable,
    theme: Theme,
    figure_dir: Path,
    title: str = "AutoOpt results",
) -> str:
    metric_rows = [
        (m.name, m.display, m.target, {True: "met", False: "MISSED", None: ""}[m.meets_target])
        for m in metrics.metrics
    ]

    method_rows = [
        (name, runs, f"{reduction:.1%}", f"{verify:.1%}", f"{accept:.1%}", mismatch)
        for name, runs, reduction, verify, accept, mismatch in by_method(rows)
    ]
    category_rows = [
        (name, runs, f"{reduction:.1%}", f"{steps:.2f}")
        for name, runs, reduction, steps in by_category(rows)
    ]

    figures = "".join(
        f'<figure><img src="{_inline(figure_dir / f"{name}.png")}" alt="{html.escape(caption)}">'
        f"<figcaption>{html.escape(caption)}</figcaption></figure>"
        for name, caption in FIGURE_TITLES.items()
        if (figure_dir / f"{name}.png").exists()
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
  :root {{
    --paper: {theme.paper}; --surface: {theme.surface}; --rule: {theme.rule};
    --muted: {theme.muted}; --ink: {theme.ink}; --accent: {theme.accent};
    --positive: {theme.positive}; --negative: {theme.negative};
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 3rem 1.5rem 5rem; background: var(--paper); color: var(--ink);
         font: 15px/1.6 "Segoe UI", Inter, system-ui, sans-serif; }}
  main {{ max-width: 68rem; margin: 0 auto; }}
  h1 {{ font-size: 1.6rem; font-weight: 600; margin: 0 0 .3rem; letter-spacing: -.01em; }}
  h2 {{ font-size: .8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .09em;
        color: var(--muted); margin: 3rem 0 1rem; }}
  .lede {{ color: var(--muted); margin: 0 0 2.5rem; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 14px; }}
  th {{ text-align: left; font-weight: 500; color: var(--muted); font-size: 12px;
        text-transform: uppercase; letter-spacing: .06em; padding: 0 .8rem .6rem 0;
        border-bottom: 1px solid var(--rule); }}
  td {{ padding: .55rem .8rem .55rem 0; border-bottom: 1px solid var(--rule); }}
  td:first-child {{ font-variant-numeric: tabular-nums; }}
  tr td:last-child {{ text-align: right; color: var(--muted); }}
  figure {{ margin: 0 0 2.5rem; }}
  figure img {{ width: 100%; border-radius: 8px; display: block; }}
  figcaption {{ color: var(--muted); font-size: 13px; margin-top: .6rem; }}
</style></head>
<body><main>
  <h1>{html.escape(title)}</h1>
  <p class="lede">{metrics.runs:,} runs over {metrics.programs:,} programs.
     {metrics.failures} failed.</p>

  <h2>Metrics</h2>
  {_table(("metric", "value", "target", ""), metric_rows)}

  <h2>By method</h2>
  {_table(("method", "runs", "reduction", "verify pass", "acceptance", "mismatches"), method_rows)}

  <h2>By category</h2>
  {_table(("category", "runs", "reduction", "mean steps"), category_rows)}

  <h2>Figures</h2>
  {figures}
</main></body></html>"""
