from __future__ import annotations

from autoopt.cost import CostModel, CostWeights, measure
from autoopt.ir import source_to_tac


def test_original_program_scores_one() -> None:
    # Normalisation is against the original, so cost reduction reads as 1 - cost.
    program = source_to_tac("input n; int x = n + 1; print(x);")
    model = CostModel.for_program(program)
    assert model.score(program).total == 1.0


def test_reduction_against_itself_is_zero() -> None:
    program = source_to_tac("input n; int x = n + 1; print(x);")
    model = CostModel.for_program(program)
    assert model.reduction(model.score(program)) == 0.0


def test_shorter_program_costs_less() -> None:
    original = source_to_tac("input n; int x = n + 1; int unused = 99; print(x);")
    improved = source_to_tac("input n; int x = n + 1; print(x);")
    model = CostModel.for_program(original)
    assert model.score(improved).total < model.score(original).total
    assert model.reduction(model.score(improved)) > 0


def test_instruction_count_matches_program_length() -> None:
    program = source_to_tac("input n; int x = n + 1; print(x);")
    assert measure(program).instruction_count == len(program)


def test_arithmetic_ops_counted() -> None:
    program = source_to_tac("input a; input b; int x = a + b; int y = a * b; print(x + y);")
    assert measure(program).arithmetic_ops == 3


def test_comparisons_are_not_arithmetic() -> None:
    # The spec says arithmetic ops, and a comparison is not one.
    program = source_to_tac("input a; input b; print(a < b);")
    assert measure(program).arithmetic_ops == 0


def test_temporaries_counted_separately_from_variables() -> None:
    program = source_to_tac("input a; input b; int x = a + b; print(x);")
    raw = measure(program)
    assert raw.temp_vars == 1  # t1 only; x is a source variable


def test_loop_body_dominates_the_execution_estimate() -> None:
    # An instruction inside a loop has to cost more than the same instruction
    # outside one, or loop-invariant code motion registers as no gain.
    flat = source_to_tac("input n; int a = n + 1; int b = n + 2; int c = n + 3;")
    looped = source_to_tac("input n; int i = 0; while (i < n) { int a = n + 1; i = i + 1; }")
    assert measure(looped).execution_estimate > measure(flat).execution_estimate


def test_nested_loop_costs_more_than_single_loop() -> None:
    single = source_to_tac("input n; int i = 0; while (i < n) { int a = n + 1; i = i + 1; }")
    nested = source_to_tac(
        "input n; int i = 0; while (i < n) { int j = 0; "
        "while (j < n) { int a = n + 1; j = j + 1; } i = i + 1; }"
    )
    assert measure(nested).execution_estimate > measure(single).execution_estimate


def test_weights_are_a_parameter() -> None:
    # They get fitted from the corpus later, so nothing may hard-code them.
    #
    # Needs a loop to show any difference: in straight-line code every
    # instruction sits at depth 0, so instruction count and execution estimate
    # move together and any weighting gives the same answer. Removing an
    # instruction from inside a loop is what separates them.
    program = source_to_tac(
        "input n; int i = 0; while (i < n) { int unused = 5; i = i + 1; } print(i);"
    )
    improved = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")

    instruction_heavy = CostModel.for_program(
        program, CostWeights(instructions=1.0, arithmetic=0.0, temporaries=0.0, execution=0.0)
    )
    execution_heavy = CostModel.for_program(
        program, CostWeights(instructions=0.0, arithmetic=0.0, temporaries=0.0, execution=1.0)
    )
    assert instruction_heavy.score(improved).total != execution_heavy.score(improved).total


def test_zero_term_does_not_divide_by_zero() -> None:
    program = source_to_tac("input n; print(n);")  # no arithmetic at all
    assert measure(program).arithmetic_ops == 0
    model = CostModel.for_program(program)
    assert model.score(program).total == 1.0


def test_costs_order() -> None:
    program = source_to_tac("input n; int x = n + 1; int unused = 1; print(x);")
    improved = source_to_tac("input n; int x = n + 1; print(x);")
    model = CostModel.for_program(program)
    assert model.score(improved) < model.score(program)


def test_empty_program_is_handled() -> None:
    program = source_to_tac("")
    model = CostModel.for_program(program)
    assert model.score(program).total == 0.0
