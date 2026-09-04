from __future__ import annotations

import json
from pathlib import Path

import pytest

from autoopt.datagen import Category
from autoopt.events import Event
from autoopt.experiment import FIELDNAMES, iter_rows, run_experiment, summarise
from autoopt.figures import DARK, LIGHT, THEMES, by_category, by_method, compute, oklch, render_all
from autoopt.ir import source_to_tac
from autoopt.orchestrator import RunConfig, optimize
from autoopt.report import decision_log, summary_page


@pytest.fixture(scope="module")
def master(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A small real run, so the reporting layer is tested against real rows."""
    path = tmp_path_factory.mktemp("runs") / "master.csv"
    run_experiment(
        path,
        methods=("greedy", "astar"),
        limit=1,
        prove_final=False,
        resume=False,
    )
    return path


@pytest.fixture(scope="module")
def rows(master: Path) -> list[dict[str, str]]:
    return list(iter_rows(master))


# --- the batch runner -----------------------------------------------------------


def test_every_field_is_written(rows: list[dict[str, str]]) -> None:
    assert rows
    assert set(rows[0]) == set(FIELDNAMES)


def test_one_row_per_program_and_method(rows: list[dict[str, str]]) -> None:
    # limit=1 takes one program from each of the seven categories, two methods.
    assert len(rows) == len(Category) * 2


def test_every_category_is_represented(rows: list[dict[str, str]]) -> None:
    assert {row["category"] for row in rows} == {c.value for c in Category}


def test_no_failures_and_no_mismatches(rows: list[dict[str, str]]) -> None:
    assert not [row for row in rows if row["error"]]
    assert all(row["output_match"] == "1" for row in rows)


def test_by_kind_is_valid_json(rows: list[dict[str, str]]) -> None:
    for row in rows:
        parsed = json.loads(row["by_kind"])
        for counts in parsed.values():
            assert set(counts) == {"proposed", "refuted", "improving", "accepted"}


def test_resume_skips_completed_cells(master: Path, rows: list[dict[str, str]]) -> None:
    # An interrupted overnight run has to pick up rather than start over.
    again = run_experiment(master, methods=("greedy", "astar"), limit=1, prove_final=False)
    assert again.total == 0
    assert len(list(iter_rows(master))) == len(rows)


def test_summarise_reports_headline_numbers(master: Path) -> None:
    stats = summarise(master)
    assert stats["rows"] > 0
    assert stats["false_positive_rate"] == 0.0
    assert set(stats["by_method"]) == {"greedy", "astar"}  # type: ignore[arg-type]


# --- metrics ----------------------------------------------------------------------


def test_metrics_table_has_the_six_spec_metrics(rows: list[dict[str, str]]) -> None:
    names = [metric.name for metric in compute(rows).metrics]
    assert names == [
        "Verification Pass Rate",
        "Acceptance Rate",
        "Cost Reduction",
        "Steps to Convergence",
        "LLM Validity Rate",
        "False Positive Rate",
    ]


def test_false_positive_rate_is_zero(rows: list[dict[str, str]]) -> None:
    """The one metric the spec requires to be exactly 0%."""
    metric = next(m for m in compute(rows).metrics if m.name == "False Positive Rate")
    assert metric.value == 0.0
    assert metric.meets_target is True


def test_llm_metric_says_not_run_without_data(rows: list[dict[str, str]]) -> None:
    assert compute(rows).metrics[4].display == "not run"
    assert compute(rows, llm_validity=0.8).metrics[4].display == "80.0%"


def test_breakdowns_cover_every_group(rows: list[dict[str, str]]) -> None:
    assert {entry[0] for entry in by_method(rows)} == {"greedy", "astar"}
    assert {entry[0] for entry in by_category(rows)} == {c.value for c in Category}


# --- theme -------------------------------------------------------------------------


def test_oklch_produces_hex() -> None:
    colour = oklch(0.5, 0.1, 60)
    assert colour.startswith("#")
    assert len(colour) == 7
    int(colour[1:], 16)


def test_no_pure_black_or_white() -> None:
    # A dark surface at true black loses every elevation cue, and pure white
    # glares. Both themes stay off the extremes deliberately.
    for theme in THEMES.values():
        assert theme.paper not in ("#000000", "#ffffff")
        assert theme.ink not in ("#000000", "#ffffff")


def test_categorical_palette_covers_every_transformation() -> None:
    for theme in THEMES.values():
        assert len(theme.categorical) == 8
        assert len(set(theme.categorical)) == 8


def test_dark_and_light_are_distinct() -> None:
    assert DARK.paper != LIGHT.paper
    assert DARK.ink != LIGHT.ink


# --- figures and report --------------------------------------------------------------


def test_all_six_figures_render(rows: list[dict[str, str]], tmp_path: Path) -> None:
    written = render_all(rows, tmp_path, ("dark",))
    assert len(written) == 6
    assert all(path.exists() and path.stat().st_size > 5000 for path in written)


def test_both_themes_render(rows: list[dict[str, str]], tmp_path: Path) -> None:
    written = render_all(rows, tmp_path, ("dark", "light"))
    assert len(written) == 12


def test_summary_page_is_self_contained(rows: list[dict[str, str]], tmp_path: Path) -> None:
    # Figures inlined as data URIs, so the page opens from disk with no server
    # and nothing to fail during a demo.
    render_all(rows, tmp_path, ("dark",))
    page = summary_page(rows, compute(rows), DARK, tmp_path / "dark")
    assert "data:image/png;base64," in page
    assert '<img src="http' not in page
    assert "False Positive Rate" in page


def test_decision_log_contains_every_required_part() -> None:
    """The spec's expected output, item by item."""
    events: list[Event] = []

    def collect(event: Event) -> None:
        events.append(event)

    optimize(
        source_to_tac("input n; int f = 10 * 20; int u = 7; print(f + n);"),
        config=RunConfig(method="greedy"),
        sink=collect,
        program_id="sample",
    )
    log = decision_log(events)

    assert "original TAC" in log
    assert "optimized TAC" in log
    assert "analysed" in log
    assert "proposed" in log
    assert "verify" in log
    assert "cost" in log
    assert "decide" in log
    assert "cost reduction" in log
    assert "output match   PASS" in log
