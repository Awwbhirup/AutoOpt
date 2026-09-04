"""Command line interface.

autoopt corpus      write the 500 generated programs to disk
autoopt run         optimize one program and print its decision log
autoopt experiment  run the method x category grid, producing the master CSV
autoopt summary     headline numbers from an existing master CSV
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Annotated

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from .datagen import generate
from .events import Decision, Event, RunConverged, RunStarted, VerificationResult
from .experiment import BatchProgress, iter_rows, run_experiment, summarise
from .figures import THEMES, compute, render_all
from .ir import source_to_tac
from .orchestrator import RunConfig, optimize
from .report import decision_log, summary_page
from .search import METHOD_NAMES

app = typer.Typer(add_completion=False, help="Autonomous program optimization agent.")
console = Console()


def _load_env() -> None:
    for candidate in (Path(".env"), Path("engine/.env"), Path(__file__).parent.parent / ".env"):
        if candidate.exists():
            load_dotenv(candidate)
            return


@app.command()
def corpus(
    out: Annotated[Path, typer.Option(help="Directory to write programs into")] = Path(
        "../data/corpus"
    ),
    seed: int = 20260904,
) -> None:
    """Generate the corpus and write one file per program."""
    out.mkdir(parents=True, exist_ok=True)
    programs = generate(seed)

    for program in programs:
        (out / f"{program.program_id}.ml").write_text(program.source, encoding="utf-8")

    table = Table(title=f"corpus: {len(programs)} programs")
    table.add_column("category")
    table.add_column("count", justify="right")
    counts: dict[str, int] = {}
    for program in programs:
        counts[program.category.value] = counts.get(program.category.value, 0) + 1
    for category, count in counts.items():
        table.add_row(category, str(count))
    console.print(table)
    console.print(f"written to [bold]{out}[/bold]")


@app.command()
def run(
    path: Annotated[Path, typer.Argument(help="MiniLang source file")],
    method: str = "greedy",
    smt: bool = False,
) -> None:
    """Optimize one program and print the decision log the spec asks for."""
    _load_env()
    program = source_to_tac(path.read_text(encoding="utf-8"))

    log: list[Event] = []

    def collect(event: Event) -> None:
        log.append(event)

    result = optimize(
        program,
        config=RunConfig(method=method, use_smt=smt, prove_final=smt),
        sink=collect,
        program_id=path.stem,
    )

    console.print(f"[bold]{path.name}[/bold]  method={method}")
    console.print("\n[bold]original[/bold]")
    console.print(result.original.format())

    console.print("\n[bold]decision log[/bold]")
    for event in log:
        if isinstance(event, RunStarted):
            console.print(f"  start    {len(event.initial_tac)} instructions")
        elif isinstance(event, VerificationResult):
            console.print(f"  verify   {event.verdict.value} ({event.inputs_tested} inputs)")
        elif isinstance(event, Decision):
            mark = "ACCEPT" if event.accepted else f"reject ({event.reject_reason})"
            console.print(f"  decide   {event.optimization_type.value}: {mark}")
        elif isinstance(event, RunConverged):
            console.print(f"  done     {event.iterations} iterations")

    console.print("\n[bold]optimized[/bold]")
    console.print(result.final.format())

    console.print(
        f"\ncost {result.cost_before:.4f} -> {result.cost_after:.4f} "
        f"([bold]{result.cost_reduction:.1%}[/bold] reduction), "
        f"output match: {'PASS' if result.output_match else 'FAIL'}"
    )


@app.command()
def experiment(
    out: Annotated[Path, typer.Option(help="Master CSV path")] = Path("../data/runs/master.csv"),
    methods: Annotated[str, typer.Option(help="Comma separated, or 'all'")] = "all",
    limit: Annotated[int, typer.Option(help="Programs per category, 0 for all")] = 0,
    seed: int = 0,
    prove: Annotated[bool, typer.Option(help="Prove original against final with Z3")] = True,
    resume: bool = True,
    budgets: Annotated[
        str, typer.Option(help="Node budgets, comma separated; 0 for unconstrained")
    ] = "0",
) -> None:
    """Run the method x category grid and write the master CSV."""
    _load_env()
    chosen = METHOD_NAMES if methods == "all" else tuple(m.strip() for m in methods.split(","))
    unknown = [m for m in chosen if m not in METHOD_NAMES]
    if unknown:
        console.print(f"[red]unknown methods: {', '.join(unknown)}[/red]")
        raise typer.Exit(1)

    console.print(f"methods: {', '.join(chosen)}")
    last = time.monotonic()

    def progress(state: BatchProgress, row: dict[str, object]) -> None:
        nonlocal last
        if state.completed % 25 and time.monotonic() - last < 15:
            return
        last = time.monotonic()
        console.print(
            f"  {state.completed}/{state.total}  "
            f"{state.rate:.1f}/s  eta {state.remaining_seconds / 60:.1f}m  "
            f"failures={state.failures} mismatches={state.mismatches}  "
            f"[dim]{row['program_id']} {row['method']}[/dim]"
        )

    caps = tuple(int(b.strip()) or None for b in budgets.split(","))
    console.print(f"budgets: {', '.join(str(b or 'unconstrained') for b in caps)}")

    state = run_experiment(
        out,
        methods=chosen,
        seed=seed,
        limit=limit or None,
        prove_final=prove,
        resume=resume,
        budgets=caps,
        on_progress=progress,
    )

    console.print(
        f"\ndone in {state.elapsed / 60:.1f}m: {state.completed} cells, "
        f"{state.failures} failures, {state.mismatches} output mismatches"
    )
    summary(out)


@app.command()
def summary(
    path: Annotated[Path, typer.Argument()] = Path("../data/runs/master.csv"),
) -> None:
    """Headline numbers from a master CSV."""
    if not path.exists():
        console.print(f"[red]no such file: {path}[/red]")
        raise typer.Exit(1)

    stats = summarise(path)
    if not stats.get("rows"):
        console.print("[yellow]no usable rows[/yellow]")
        return

    console.print(f"\nrows: {stats['rows']}")
    console.print(f"mean cost reduction: [bold]{stats['mean_reduction']:.1%}[/bold]")
    console.print(
        f"output mismatches: {stats['output_mismatches']} "
        f"(false positive rate {stats['false_positive_rate']:.2%})"
    )

    table = Table(title="mean cost reduction by method")
    table.add_column("method")
    table.add_column("reduction", justify="right")
    by_method = stats["by_method"]
    assert isinstance(by_method, dict)
    for method, value in sorted(by_method.items(), key=lambda item: -item[1]):
        table.add_row(method, f"{value:.1%}")
    console.print(table)


@app.command()
def figures(
    data: Annotated[Path, typer.Option(help="Master CSV")] = Path("../data/runs/master.csv"),
    out: Annotated[Path, typer.Option(help="Where to write images")] = Path(
        "../reports/generated/figures"
    ),
    themes: Annotated[str, typer.Option(help="Comma separated: dark, light")] = "dark,light",
) -> None:
    """Render the six required figures."""
    if not data.exists():
        console.print(f"[red]no such file: {data}[/red]")
        raise typer.Exit(1)

    rows = list(iter_rows(data))
    chosen = tuple(name.strip() for name in themes.split(","))
    written = render_all(rows, out, chosen)

    for path in written:
        console.print(f"  {path}")
    console.print(f"{len(written)} figures written")


@app.command()
def report(
    data: Annotated[Path, typer.Option(help="Master CSV")] = Path("../data/runs/master.csv"),
    out: Annotated[Path, typer.Option()] = Path("../reports/generated"),
    theme: Annotated[str, typer.Option(help="dark or light")] = "dark",
    logs_for: Annotated[str, typer.Option(help="Method whose decision logs to write")] = "astar",
    log_limit: Annotated[int, typer.Option(help="How many decision logs, 0 for all")] = 0,
) -> None:
    """Write the summary page and the per-program decision logs."""
    _load_env()
    if not data.exists():
        console.print(f"[red]no such file: {data}[/red]")
        raise typer.Exit(1)

    rows = list(iter_rows(data))
    out.mkdir(parents=True, exist_ok=True)

    figure_dir = out / "figures" / theme
    if not figure_dir.exists():
        console.print("rendering figures first")
        render_all(rows, out / "figures", (theme,))

    page = summary_page(rows, compute(rows), THEMES[theme], figure_dir)
    index = out / "index.html"
    index.write_text(page, encoding="utf-8")
    console.print(f"  {index}")

    # One decision log per program, which is the spec's expected output.
    logs = out / "decision-logs"
    logs.mkdir(parents=True, exist_ok=True)
    programs = generate()
    if log_limit:
        programs = programs[:log_limit]

    written = 0
    for program in programs:
        events: list[Event] = []

        def collect(event: Event, sink: list[Event] = events) -> None:
            sink.append(event)

        optimize(
            source_to_tac(program.source),
            config=RunConfig(method=logs_for),
            sink=collect,
            program_id=program.program_id,
            category=program.category.value,
        )
        (logs / f"{program.program_id}.txt").write_text(decision_log(events), encoding="utf-8")
        written += 1

    console.print(f"  {logs}  ({written} decision logs, method={logs_for})")


@app.command()
def analyze(
    data: Annotated[Path, typer.Option(help="Master CSV")] = Path("../data/runs/budgeted.csv"),
    out: Annotated[Path, typer.Option()] = Path("../reports/generated/statistics"),
    budget: Annotated[int, typer.Option(help="Which node budget to analyse, 0 for the first")] = 0,
) -> None:
    """Run the full statistical analysis and write the tables."""
    from .stats import analysis as stats_analysis
    from .stats import load

    if not data.exists():
        console.print(f"[red]no such file: {data}[/red]")
        raise typer.Exit(1)

    dataset = load(data)
    console.print(dataset.describe())

    chosen = budget or dataset.budgets[0]
    result = stats_analysis.run(dataset, chosen)
    console.print(f"analysed at node budget {chosen}")

    out.mkdir(parents=True, exist_ok=True)
    tables = result.write_tables(out / "tables")
    result.to_json(out / "results.json")

    from .figures import render_statistical

    hazard = result.section("M7").tables.get("hazard")
    written = render_statistical(dataset.frame, hazard, out / "figures", ("dark", "light"))
    console.print(f"{len(written)} statistical figures written")

    for section in result.sections:
        console.print(f"[bold]{section.module}[/bold]  {section.title}")
        for name in section.tables:
            console.print(f"    table  {name}")
        for note in section.notes:
            console.print(f"    [dim]{note}[/dim]")

    console.print(f"{len(tables)} tables written to {out / 'tables'}")
    console.print(f"scalar results in {out / 'results.json'}")

    # The two numbers that decide whether the design worked.
    module6 = result.section("M6")
    subsets = module6.values.get("homogeneous_subsets", [])
    console.print(
        f"method groups Tukey could separate: [bold]{len(subsets)}[/bold] of {len(dataset.methods)}"
    )
    for index, subset in enumerate(subsets, 1):
        console.print(f"  group {index}: {', '.join(subset)}")


@app.command()
def mutants(
    out: Annotated[Path, typer.Option(help="Where to write the study")] = Path(
        "../data/verification/mutation_study.json"
    ),
    programs: Annotated[int, typer.Option(help="Programs to mutate")] = 120,
    per_program: Annotated[int, typer.Option(help="Mutants per program")] = 4,
    seed: int = 0,
) -> None:
    """Inject faults and measure what each verification channel catches.

    The runs cannot measure this. Every transformation is correct, so nothing in
    the grid was ever refuted, and a detection rate taken from the runs would be
    zero faults over a hundred thousand proposals. Module 7 needs a denominator of
    faults that exist, so they are made here.
    """
    from .verify import mutation

    study = mutation.run_study(programs=programs, per_program=per_program, seed=seed)
    mutation.write(study, out)

    console.print(
        f"{study.programs} programs, {study.mutants_generated} mutants, "
        f"{study.mutants_equivalent} with no observable difference"
    )
    console.print(f"faults to detect: [bold]{study.faults}[/bold]")
    for channel in (study.differential, study.smt):
        console.print(
            f"  {channel.name:22s} {channel.detected}/{channel.total} "
            f"= {channel.detection_rate:.4f}"
        )
    console.print(f"  {'either channel':22s} {study.detection_either:.4f}")
    if study.false_positives:
        console.print(
            f"[red]{study.false_positives} programs were refuted against themselves[/red]"
        )
    console.print(f"written to {out}")


def main() -> int:
    app()
    return 0


if __name__ == "__main__":
    sys.exit(main())
