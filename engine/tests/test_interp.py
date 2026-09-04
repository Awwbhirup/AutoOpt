from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from autoopt.interp import ExecutionResult, Status, TrapKind, execute
from autoopt.ir import source_to_tac


def outputs(source: str, **inputs: int) -> tuple[int, ...]:
    return execute(source_to_tac(source), inputs).outputs


# --- arithmetic ---------------------------------------------------------------


def test_constant_arithmetic() -> None:
    assert outputs("print(2 + 3 * 4);") == (14,)


def test_precedence_is_honoured_through_lowering() -> None:
    assert outputs("print((2 + 3) * 4);") == (20,)


def test_inputs_are_bound() -> None:
    assert outputs("input a; input b; print(a * b);", a=6, b=7) == (42,)


def test_unsupplied_inputs_default_to_zero() -> None:
    # Two versions of a program must never diverge because a caller passed
    # different variable sets.
    assert outputs("input a; print(a + 1);") == (1,)


def test_integers_are_unbounded() -> None:
    # No wrapping, so the interpreter and Z3's Int sort agree.
    assert outputs("print(1000000 * 1000000 * 1000000);") == (10**18,)


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("7 / 2", 3),
        ("-7 / 2", -3),  # truncates toward zero, not Python's floor of -4
        ("7 / -2", -3),
        ("-7 / -2", 3),
    ],
)
def test_division_truncates_toward_zero(expression: str, expected: int) -> None:
    assert outputs(f"print({expression});") == (expected,)


@pytest.mark.parametrize(
    ("expression", "expected"),
    [("7 % 2", 1), ("-7 % 2", -1), ("7 % -2", 1), ("-7 % -2", -1)],
)
def test_modulo_takes_the_sign_of_the_dividend(expression: str, expected: int) -> None:
    assert outputs(f"print({expression});") == (expected,)


@given(a=st.integers(min_value=-(10**6), max_value=10**6), b=st.integers().filter(bool))
def test_division_identity_holds(a: int, b: int) -> None:
    # a == (a/b)*b + a%b, the identity that ties _div and _mod together.
    b = max(min(b, 10**6), -(10**6))
    result = execute(
        source_to_tac("input a; input b; print(a / b); print(a % b);"), {"a": a, "b": b}
    )
    quotient, remainder = result.outputs
    assert quotient * b + remainder == a


def test_unary_negation_and_not() -> None:
    assert outputs("input a; print(-a);", a=5) == (-5,)
    assert outputs("input a; print(!a);", a=0) == (1,)
    assert outputs("input a; print(!a);", a=9) == (0,)


def test_comparisons_yield_zero_or_one() -> None:
    assert outputs("print(3 < 5);") == (1,)
    assert outputs("print(5 < 3);") == (0,)


def test_nonzero_is_true() -> None:
    assert outputs("input a; if (a) print(1); else print(2);", a=-4) == (1,)


# --- short-circuit evaluation -------------------------------------------------


def test_and_short_circuits_past_a_trapping_operand() -> None:
    # If `&&` evaluated both sides, this would trap instead of printing.
    result = execute(source_to_tac("input x; int ok = x != 0 && 100 / x > 1; print(ok);"), {"x": 0})
    assert result.status is Status.COMPLETED
    assert result.outputs == (0,)


def test_or_short_circuits_past_a_trapping_operand() -> None:
    result = execute(source_to_tac("input x; int ok = x == 0 || 100 / x > 1; print(ok);"), {"x": 0})
    assert result.status is Status.COMPLETED
    assert result.outputs == (1,)


def test_and_evaluates_the_right_operand_when_needed() -> None:
    assert outputs("input a; input b; print(a && b);", a=1, b=0) == (0,)
    assert outputs("input a; input b; print(a && b);", a=1, b=3) == (1,)


# --- control flow -------------------------------------------------------------


def test_while_loop_accumulates() -> None:
    source = "input n; int t = 0; int i = 0; while (i < n) { t = t + i; i = i + 1; } print(t);"
    assert outputs(source, n=10) == (45,)


def test_loop_with_zero_trips_does_not_execute_its_body() -> None:
    source = "input n; int t = 0; int i = 0; while (i < n) { t = t + 1; i = i + 1; } print(t);"
    assert outputs(source, n=0) == (0,)


def test_for_and_while_forms_agree(  # metamorphic: desugaring must not change behaviour
) -> None:
    for_program = source_to_tac(
        "int t = 0; for (int i = 0; i < 6; i = i + 1) { t = t + i; } print(t);"
    )
    while_program = source_to_tac(
        "int t = 0; int i = 0; while (i < 6) { t = t + i; i = i + 1; } print(t);"
    )
    assert execute(for_program).outputs == execute(while_program).outputs == (15,)


def test_nested_loops() -> None:
    source = (
        "int t = 0; int i = 0; while (i < 3) { int j = 0; "
        "while (j < 3) { t = t + 1; j = j + 1; } i = i + 1; } print(t);"
    )
    assert outputs(source) == (9,)


def test_multiple_prints_preserve_order() -> None:
    assert outputs("print(1); print(2); print(3);") == (1, 2, 3)


# --- traps and limits ---------------------------------------------------------


def test_division_by_zero_traps() -> None:
    result = execute(source_to_tac("input a; print(a / 0);"), {"a": 1})
    assert result.status is Status.TRAPPED
    assert result.trap is TrapKind.DIVISION_BY_ZERO


def test_modulo_by_zero_traps() -> None:
    result = execute(source_to_tac("input a; print(a % 0);"), {"a": 1})
    assert result.trap is TrapKind.DIVISION_BY_ZERO


def test_output_before_a_trap_is_retained() -> None:
    result = execute(source_to_tac("input a; print(7); print(a / 0);"), {"a": 1})
    assert result.outputs == (7,)
    assert result.status is Status.TRAPPED


def test_nonterminating_loop_hits_the_step_limit() -> None:
    # Random inputs can make a loop bound never hold; the verifier must report
    # rather than hang.
    result = execute(source_to_tac("int i = 0; while (i > -1) { i = i + 1; }"), step_limit=500)
    assert result.status is Status.STEP_LIMIT
    assert result.steps == 500


# --- equivalence --------------------------------------------------------------


def test_identical_programs_are_observably_equal() -> None:
    program = source_to_tac("input n; print(n * 2);")
    assert execute(program, {"n": 4}).observably_equals(execute(program, {"n": 4}))


def test_differing_outputs_are_not_equal() -> None:
    a = execute(source_to_tac("input n; print(n * 2);"), {"n": 4})
    b = execute(source_to_tac("input n; print(n * 3);"), {"n": 4})
    assert not a.observably_equals(b)


def test_optimized_program_matching_on_outputs_is_equal_despite_different_variables() -> None:
    # A good optimizer deletes variables, so final state must not be part of
    # equivalence or correct transformations would be rejected.
    original = execute(source_to_tac("input n; int junk = 99; int x = n + 0; print(x);"), {"n": 3})
    optimized = execute(source_to_tac("input n; print(n);"), {"n": 3})
    assert original.variables != optimized.variables
    assert original.observably_equals(optimized)


def test_step_limited_runs_are_never_equal() -> None:
    # Two inconclusive runs must not be reported as matching; nothing was compared.
    source = "int i = 0; while (i > -1) { i = i + 1; }"
    a = execute(source_to_tac(source), step_limit=100)
    b = execute(source_to_tac(source), step_limit=100)
    assert a.status is Status.STEP_LIMIT
    assert not a.observably_equals(b)


def test_a_trap_does_not_match_a_completed_run() -> None:
    trapped = execute(source_to_tac("input a; print(a / 0);"), {"a": 1})
    completed = execute(source_to_tac("input a; print(a);"), {"a": 1})
    assert not trapped.observably_equals(completed)


# --- properties ---------------------------------------------------------------

PROGRAMS = [
    "input a; print(a + 1);",
    "input a; input b; print(a * b - a);",
    "input n; int t = 0; int i = 0; while (i < n) { t = t + i; i = i + 1; } print(t);",
    "input a; if (a > 0) print(1); else print(-1);",
    "input a; input b; print(a > b && a != 0);",
    "int x = 5; int unused = 99; print(x * (x + 1));",
]


@pytest.mark.parametrize("source", PROGRAMS)
@given(value=st.integers(min_value=-50, max_value=50))
def test_every_program_terminates_conclusively(source: str, value: int) -> None:
    program = source_to_tac(source)
    result = execute(program, dict.fromkeys(program.inputs, value))
    assert isinstance(result, ExecutionResult)
    assert result.status is not Status.STEP_LIMIT


@pytest.mark.parametrize("source", PROGRAMS)
@given(value=st.integers(min_value=-50, max_value=50))
def test_execution_is_deterministic(source: str, value: int) -> None:
    # Reproducibility depends on this: the same program and inputs must always
    # give the same trace, or seeded experiment runs would not be repeatable.
    program = source_to_tac(source)
    bindings = dict.fromkeys(program.inputs, value)
    assert execute(program, bindings).outputs == execute(program, bindings).outputs


@pytest.mark.parametrize("source", PROGRAMS)
def test_steps_are_counted(source: str) -> None:
    program = source_to_tac(source)
    assert execute(program, dict.fromkeys(program.inputs, 3)).steps > 0
