from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

from autoopt.ir import source_to_tac
from autoopt.verify import mutation

SOURCE = """
input x;
input y;
int a = x * 3 + y;
int b = a - x;
if (b > 0) {
    print(b);
} else {
    print(a);
}
print(a + b);
"""


def test_a_mutant_is_a_different_program() -> None:
    """The point of the study: every mutant must actually change something.

    A mutant identical to the original would count as a fault no channel can
    detect, which would drag both detection rates down for no reason.
    """
    program = source_to_tac(SOURCE)
    mutants = mutation.mutants_for("p", program, rng=random.Random(0), count=6)

    assert mutants
    for mutant in mutants:
        assert mutant.program.instructions != program.instructions


def test_mutation_leaves_the_rest_of_the_program_alone() -> None:
    """One edit per mutant, so a miss points at one instruction."""
    program = source_to_tac(SOURCE)

    for mutant in mutation.mutants_for("p", program, rng=random.Random(1), count=6):
        if mutant.operator == "dropped print":
            assert len(mutant.program.instructions) == len(program.instructions) - 1
            continue
        assert len(mutant.program.instructions) == len(program.instructions)
        differences = sum(
            1
            for before, after in zip(program.instructions, mutant.program.instructions, strict=True)
            if before != after
        )
        assert differences == 1


def test_the_oracle_is_stricter_than_either_production_setting() -> None:
    """Ground truth has to come from outside the channels being scored.

    If the oracle were no denser than the channel under test, a mutant the
    channel missed would be dropped as equivalent and the measured rate would be
    100% by construction.
    """
    from autoopt.verify.differential import FAST, THOROUGH

    for profile in (FAST, THOROUGH):
        assert mutation.ORACLE.random_cases > profile.random_cases
        assert mutation.ORACLE.value_range >= profile.value_range
        assert mutation.ORACLE.step_limit >= profile.step_limit
        assert len(mutation.ORACLE.edge_values) >= len(profile.edge_values)


def test_study_scores_both_channels() -> None:
    study = mutation.run_study(programs=4, per_program=2, seed=3)

    assert study.programs == 4
    assert study.mutants_generated > 0
    assert study.faults > 0
    # A channel that refutes a program against itself invalidates everything else.
    assert study.false_positives == 0
    for channel in (study.differential, study.smt):
        assert channel.total == study.faults
        assert 0.0 <= channel.detection_rate <= 1.0


def test_equivalent_mutants_are_excluded_rather_than_counted_as_misses() -> None:
    """The denominator is faults that exist, not edits that were made."""
    study = mutation.run_study(programs=4, per_program=2, seed=3)
    assert study.faults + study.mutants_equivalent == study.mutants_generated


def test_round_trip(tmp_path: Path) -> None:
    study = mutation.run_study(programs=2, per_program=1, seed=0)
    path = tmp_path / "nested" / "study.json"
    mutation.write(study, path)

    loaded = mutation.load(path)
    assert loaded is not None
    assert loaded == json.loads(path.read_text(encoding="utf-8"))
    assert mutation.load(tmp_path / "absent.json") is None


@pytest.mark.slow
def test_the_committed_study_backs_the_reported_reliability() -> None:
    """Module 7 quotes these numbers, so they should not drift silently."""
    stored = mutation.load(Path(__file__).parents[2] / "data/verification/mutation_study.json")
    if stored is None:
        pytest.skip("mutation study has not been run")

    assert stored["false_positives_on_unmutated"] == 0
    assert stored["faults"] > 100
    assert stored["detection_either_rate"] == 1.0
