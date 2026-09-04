from __future__ import annotations

from collections import Counter

import pytest

from autoopt.datagen import CATEGORY_COUNTS, CORPUS_SIZE, Category, generate
from autoopt.events import OptimizationType as Kind
from autoopt.interp import execute
from autoopt.ir import build_cfg, source_to_tac
from autoopt.rules import analyse

CORPUS = generate()

#: The opportunity each category exists to provide. A category that does not
#: actually contain its own pattern would quietly weaken that whole cell of the
#: experiment, and the weakness would look like a real result.
EXPECTED_OPPORTUNITY = {
    Category.ARITHMETIC: Kind.CONSTANT_FOLDING,
    Category.REPEATED: Kind.COMMON_SUBEXPRESSION_ELIMINATION,
    Category.DEAD_CODE: Kind.DEAD_CODE_ELIMINATION,
    Category.LOOPS: Kind.LOOP_INVARIANT_CODE_MOTION,
}


def test_corpus_size_matches_the_spec() -> None:
    assert len(CORPUS) == CORPUS_SIZE == 500


def test_category_counts_match_the_spec_table() -> None:
    counts = Counter(program.category for program in CORPUS)
    assert dict(counts) == CATEGORY_COUNTS
    assert counts[Category.LOOPS] == 80
    assert counts[Category.MIXED] == 100


def test_program_ids_are_unique() -> None:
    ids = [program.program_id for program in CORPUS]
    assert len(ids) == len(set(ids))


def test_generation_is_reproducible() -> None:
    # Everything downstream is regenerated from this seed, so it has to be exact.
    again = generate()
    assert [p.source for p in CORPUS] == [p.source for p in again]


def test_different_seeds_give_different_programs() -> None:
    assert [p.source for p in generate(1)] != [p.source for p in generate(2)]


@pytest.mark.parametrize("program", CORPUS, ids=lambda p: p.program_id)
def test_every_program_parses_and_runs(program) -> None:  # type: ignore[no-untyped-def]
    tac = source_to_tac(program.source)
    result = execute(tac, dict.fromkeys(tac.inputs, 5))
    assert result.conclusive


@pytest.mark.parametrize("program", CORPUS, ids=lambda p: p.program_id)
def test_every_program_has_something_to_optimize(program) -> None:  # type: ignore[no-untyped-def]
    assert analyse(build_cfg(source_to_tac(program.source)))


@pytest.mark.parametrize(("category", "kind"), list(EXPECTED_OPPORTUNITY.items()))
def test_category_contains_the_pattern_it_is_named_for(category: Category, kind: Kind) -> None:
    members = [p for p in CORPUS if p.category is category]
    with_pattern = sum(
        1
        for p in members
        if any(o.kind is kind for o in analyse(build_cfg(source_to_tac(p.source))))
    )
    assert with_pattern / len(members) > 0.8


def test_loop_variables_are_uniquely_named() -> None:
    # MiniLang has one flat scope, so a program reusing a loop counter name would
    # fail to resolve rather than shadow.
    for program in CORPUS:
        source_to_tac(program.source)


def test_corpus_exercises_every_transformation() -> None:
    kinds: set[Kind] = set()
    for program in CORPUS:
        kinds.update(o.kind for o in analyse(build_cfg(source_to_tac(program.source))))
    assert kinds == set(Kind)
