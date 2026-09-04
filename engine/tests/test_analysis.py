from __future__ import annotations

from autoopt.analysis import (
    available_expressions,
    constants,
    copies,
    expression_of,
    liveness,
    reaching,
)
from autoopt.ir import build_cfg, source_to_tac


def prepare(source: str):  # type: ignore[no-untyped-def]
    program = source_to_tac(source)
    return program, build_cfg(program)


def index_of(program, text: str) -> int:  # type: ignore[no-untyped-def]
    return next(i for i, instruction in enumerate(program) if str(instruction) == text)


# --- liveness -----------------------------------------------------------------


def test_unused_assignment_is_dead() -> None:
    program, cfg = prepare("input n; int a = n + 1; int dead = 99; print(a);")
    result = liveness(cfg)
    site = index_of(program, "dead = 99")
    assert result.is_dead_after(site, "dead")


def test_used_assignment_is_live() -> None:
    program, cfg = prepare("input n; int a = n + 1; print(a);")
    result = liveness(cfg)
    site = index_of(program, "a = t1")
    assert result.is_live_after(site, "a")


def test_variable_live_through_a_branch() -> None:
    program, cfg = prepare("input n; int a = n + 1; if (n) print(a); else print(0);")
    result = liveness(cfg)
    assert result.is_live_after(index_of(program, "a = t1"), "a")


def test_variable_live_across_a_loop_back_edge() -> None:
    # i is written at the bottom of the body and read at the top, so it has to be
    # live around the back edge.
    program, cfg = prepare("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")
    result = liveness(cfg)
    assert result.is_live_after(index_of(program, "i = t2"), "i")


def test_dead_after_last_use() -> None:
    program, cfg = prepare("input n; int a = n + 1; print(a); int b = 2; print(b);")
    result = liveness(cfg)
    assert result.is_dead_after(index_of(program, "print a"), "a")


# --- available expressions ----------------------------------------------------


def test_repeated_expression_is_available() -> None:
    program, cfg = prepare("input a; input b; int x = (a + b) * (a + b);")
    result = available_expressions(cfg)
    second = index_of(program, "t2 = a + b")
    assert result.holder_of(second, expression_of(program[second])) == "t1"


def test_first_computation_has_no_holder() -> None:
    program, cfg = prepare("input a; input b; int x = a + b;")
    result = available_expressions(cfg)
    first = index_of(program, "t1 = a + b")
    assert result.holder_of(first, expression_of(program[first])) is None


def test_redefining_an_operand_kills_availability() -> None:
    program, cfg = prepare("input a; input b; int x = a + b; a = 7; int y = a + b;")
    result = available_expressions(cfg)
    second = index_of(program, "t2 = a + b")
    assert result.holder_of(second, expression_of(program[second])) is None


def test_expression_available_across_a_loop_back_edge() -> None:
    # Regression: a must-analysis starting from the empty set gives the least
    # fixpoint, and intersecting a loop header with a still-empty back edge wipes
    # everything, so CSE would never fire inside a loop.
    program, cfg = prepare(
        "input n; int x = n + 1; int i = 0; while (i < n) { int y = n + 1; i = i + 1; }"
    )
    result = available_expressions(cfg)
    inside = index_of(program, "t3 = n + 1")
    assert result.holder_of(inside, expression_of(program[inside])) == "t1"


def test_division_is_not_treated_as_available() -> None:
    # Reusing an earlier quotient would let a trap move or vanish, and a program
    # that stops trapping is a different program.
    program, _ = prepare("input a; input b; int x = a / b;")
    assert expression_of(program[index_of(program, "t1 = a / b")]) is None


# --- constants ----------------------------------------------------------------


def test_constant_expression_is_folded() -> None:
    program, cfg = prepare("int x = 10 * 20; print(x);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "x = t1"), "t1") == 200


def test_input_is_not_constant() -> None:
    program, cfg = prepare("input n; int x = n + 1; print(x);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "x = t1"), "n") is None


def test_branches_disagreeing_makes_a_variable_unknown() -> None:
    program, cfg = prepare("input n; int x = 0; if (n) { x = 1; } else { x = 2; } print(x);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "print x"), "x") is None


def test_branches_agreeing_keeps_the_value() -> None:
    program, cfg = prepare("input n; int x = 0; if (n) { x = 7; } else { x = 7; } print(x);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "print x"), "x") == 7


def test_constant_propagates_into_a_loop_body() -> None:
    # Regression, same cause as the available-expressions loop case.
    program, cfg = prepare(
        "input n; int k = 5; int i = 0; while (i < n) { int y = k * 2; i = i + 1; }"
    )
    result = constants(cfg)
    assert result.value_of(index_of(program, "t2 = k * 2"), "k") == 5


def test_loop_counter_is_not_constant_inside_the_loop() -> None:
    program, cfg = prepare("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "t1 = i < n"), "i") is None


def test_division_by_zero_is_not_folded() -> None:
    # Folding it would delete a trap the original program hits.
    program, cfg = prepare("int x = 5 / 0; print(x);")
    result = constants(cfg)
    assert result.value_of(index_of(program, "x = t1"), "t1") is None


# --- copies -------------------------------------------------------------------


def test_copy_is_tracked() -> None:
    program, cfg = prepare("input n; int a = n; int b = a; print(b);")
    result = copies(cfg)
    assert result.source_of(index_of(program, "print b"), "b") == "a"


def test_redefining_the_source_kills_the_copy() -> None:
    program, cfg = prepare("input n; int a = n; int b = a; a = 5; print(b);")
    result = copies(cfg)
    assert result.source_of(index_of(program, "print b"), "b") is None


def test_computed_value_is_not_a_copy() -> None:
    # t1 = n + 1 computes something, so t1 mirrors no variable. The following
    # a = t1 is a genuine copy, which the previous tests cover.
    program, cfg = prepare("input n; int a = n + 1; print(a);")
    result = copies(cfg)
    assert result.source_of(index_of(program, "a = t1"), "t1") is None


# --- reaching definitions -----------------------------------------------------


def test_definition_reaches_its_use() -> None:
    program, cfg = prepare("input n; int a = n + 1; print(a);")
    result = reaching(cfg)
    site = index_of(program, "a = t1")
    assert site in result.definitions_of(index_of(program, "print a"), "a")


def test_redefinition_kills_the_earlier_one() -> None:
    program, cfg = prepare("input n; int a = 1; a = 2; print(a);")
    result = reaching(cfg)
    first = index_of(program, "a = 1")
    assert first not in result.definitions_of(index_of(program, "print a"), "a")


def test_both_branch_definitions_reach_the_join() -> None:
    program, cfg = prepare("input n; int x = 0; if (n) { x = 1; } else { x = 2; } print(x);")
    result = reaching(cfg)
    arriving = result.definitions_of(index_of(program, "print x"), "x")
    assert len(arriving) == 2


# --- consistency across analyses ----------------------------------------------


def test_analyses_index_alignment() -> None:
    program, cfg = prepare("input n; int a = n + 1; int b = a * 2; print(b);")
    size = len(program)
    assert len(liveness(cfg).live_after) == size
    assert len(available_expressions(cfg).before) == size
    assert len(constants(cfg).before) == size
    assert len(copies(cfg).before) == size
    assert len(reaching(cfg).before) == size


def test_empty_program_is_handled() -> None:
    _, cfg = prepare("")
    assert liveness(cfg).live_after == ()
    assert constants(cfg).before == ()
