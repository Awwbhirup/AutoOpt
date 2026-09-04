from __future__ import annotations

import pytest

from autoopt.cost import CostModel
from autoopt.events import OptimizationType as Kind
from autoopt.interp import execute
from autoopt.ir import build_cfg, source_to_tac
from autoopt.rules import Opportunity, analyse
from autoopt.transforms import apply

PROBE_INPUTS = (-7, -1, 0, 1, 2, 13, 100)


def listing(program) -> list[str]:  # type: ignore[no-untyped-def]
    return [str(instruction) for instruction in program]


def first_opportunity(program, kind: Kind):  # type: ignore[no-untyped-def]
    return next(o for o in analyse(build_cfg(program)) if o.kind is kind)


def apply_kind(source: str, kind: Kind):  # type: ignore[no-untyped-def]
    program = source_to_tac(source)
    return program, apply(program, first_opportunity(program, kind))


def behaves_identically(original, rewritten) -> bool:  # type: ignore[no-untyped-def]
    """Same print trace and same status for every probe input."""
    for value in PROBE_INPUTS:
        bindings = dict.fromkeys(original.inputs, value)
        before = execute(original, bindings)
        after = execute(rewritten, bindings)
        if not before.observably_equals(after):
            return False
    return True


# --- each transformation does what it claims ----------------------------------


def test_dead_code_removes_the_instruction() -> None:
    original, rewritten = apply_kind(
        "input n; int unused = 77; print(n);", Kind.DEAD_CODE_ELIMINATION
    )
    assert rewritten is not None
    assert len(rewritten) < len(original)


def test_constant_folding_replaces_the_computation() -> None:
    _, rewritten = apply_kind("int x = 10 * 20; print(x);", Kind.CONSTANT_FOLDING)
    assert rewritten is not None
    assert "t1 = 200" in listing(rewritten)


def test_algebraic_add_zero() -> None:
    _, rewritten = apply_kind("input n; int x = n + 0; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION)
    assert rewritten is not None
    assert "t1 = n" in listing(rewritten)


def test_algebraic_multiply_by_zero_becomes_a_constant() -> None:
    _, rewritten = apply_kind("input n; int x = n * 0; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION)
    assert rewritten is not None
    assert "t1 = 0" in listing(rewritten)


def test_strength_reduction_turns_doubling_into_addition() -> None:
    _, rewritten = apply_kind("input n; int x = n * 2; print(x);", Kind.STRENGTH_REDUCTION)
    assert rewritten is not None
    assert "t1 = n + n" in listing(rewritten)


def test_constant_propagation_substitutes_the_value() -> None:
    _, rewritten = apply_kind("int k = 5; int x = k + 1; print(x);", Kind.CONSTANT_PROPAGATION)
    assert rewritten is not None
    assert any("5" in line for line in listing(rewritten))


def test_copy_propagation_substitutes_the_source() -> None:
    _, rewritten = apply_kind("input n; int a = n; int b = a; print(b);", Kind.COPY_PROPAGATION)
    assert rewritten is not None
    assert "b = n" in listing(rewritten)


def test_cse_replaces_recomputation_with_a_copy() -> None:
    _, rewritten = apply_kind(
        "input a; input b; int x = (a + b) * (a + b); print(x);",
        Kind.COMMON_SUBEXPRESSION_ELIMINATION,
    )
    assert rewritten is not None
    assert "t2 = t1" in listing(rewritten)


def test_licm_moves_the_instruction_before_the_loop() -> None:
    original, rewritten = apply_kind(
        "input n; int i = 0; while (i < n) { int c = n + 1; i = i + 1; }",
        Kind.LOOP_INVARIANT_CODE_MOTION,
    )
    assert rewritten is not None
    assert len(rewritten) == len(original)  # relocated, not removed

    before = build_cfg(original).loop_depth_per_instruction
    after = build_cfg(rewritten).loop_depth_per_instruction
    hoisted = listing(rewritten).index("t2 = n + 1")
    assert after[hoisted] == 0
    assert max(before) > 0


# --- semantics are preserved, which is the property that matters --------------


SEMANTIC_CASES = [
    ("input n; int unused = 77; print(n);", Kind.DEAD_CODE_ELIMINATION),
    ("int x = 10 * 20; print(x);", Kind.CONSTANT_FOLDING),
    ("input n; int x = n + 0; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION),
    ("input n; int x = n * 1; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION),
    ("input n; int x = n * 0; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION),
    ("input n; int x = n - 0; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION),
    ("input n; int x = n / 1; print(x);", Kind.ALGEBRAIC_SIMPLIFICATION),
    ("input n; int x = n * 2; print(x);", Kind.STRENGTH_REDUCTION),
    ("int k = 5; int x = k + 1; print(x);", Kind.CONSTANT_PROPAGATION),
    ("input n; int a = n; int b = a; print(b);", Kind.COPY_PROPAGATION),
    ("input a; int x = (a + 1) * (a + 1); print(x);", Kind.COMMON_SUBEXPRESSION_ELIMINATION),
    (
        "input n; int i = 0; while (i < n) { int c = n + 1; i = i + 1; } print(i);",
        Kind.LOOP_INVARIANT_CODE_MOTION,
    ),
]


@pytest.mark.parametrize(("source", "kind"), SEMANTIC_CASES)
def test_transformation_preserves_behaviour(source: str, kind: Kind) -> None:
    program = source_to_tac(source)
    rewritten = apply(program, first_opportunity(program, kind))
    assert rewritten is not None
    assert behaves_identically(program, rewritten)


def test_repeated_application_preserves_behaviour() -> None:
    # Applying whatever passes the verification and cost gates, to convergence,
    # must still produce the original output.
    source = (
        "input n; int f = 10 * 20; int z = n + 0; int u = 77; "
        "int c = (n + 1) * (n + 1); print(f + z + c);"
    )
    original = source_to_tac(source)
    model = CostModel.for_program(original)
    current = original

    for _ in range(50):
        for opportunity in analyse(build_cfg(current)):
            candidate = apply(current, opportunity)
            if candidate is None or not behaves_identically(original, candidate):
                continue
            if model.score(candidate).total >= model.score(current).total:
                continue
            current = candidate
            break
        else:
            break

    assert len(current) < len(original)
    assert behaves_identically(original, current)


# --- stale opportunities are refused, not crashed on --------------------------


def test_out_of_range_site_returns_none() -> None:
    program = source_to_tac("input n; print(n);")
    stale = Opportunity(kind=Kind.DEAD_CODE_ELIMINATION, site=99, derived_from=())
    assert apply(program, stale) is None


def test_wrong_instruction_kind_returns_none() -> None:
    # A folding opportunity pointing at a print, which cannot be folded.
    program = source_to_tac("input n; print(n);")
    stale = Opportunity(kind=Kind.CONSTANT_FOLDING, site=0, derived_from=(), detail={"value": 3})
    assert apply(program, stale) is None


def test_missing_detail_returns_none() -> None:
    program = source_to_tac("input n; int x = n + 1; print(x);")
    stale = Opportunity(kind=Kind.COMMON_SUBEXPRESSION_ELIMINATION, site=0, derived_from=())
    assert apply(program, stale) is None


def test_impure_instruction_is_not_deleted() -> None:
    # Removing an unused division would delete a trap the program hits.
    program = source_to_tac("input a; input b; int unused = a / b; print(a);")
    division = next(i for i, ins in enumerate(program) if str(ins) == "t1 = a / b")
    stale = Opportunity(kind=Kind.DEAD_CODE_ELIMINATION, site=division, derived_from=())
    assert apply(program, stale) is None
