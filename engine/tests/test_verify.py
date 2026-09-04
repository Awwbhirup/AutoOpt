from __future__ import annotations

import itertools

import pytest
import z3

from autoopt.events import VerificationMethod, VerificationVerdict
from autoopt.interp.machine import _div, _mod
from autoopt.ir import source_to_tac
from autoopt.verify import check_equivalence, compare, input_vectors, verify
from autoopt.verify.smt import SmtVerdict, _z3_div, _z3_mod


def pair(a: str, b: str):  # type: ignore[no-untyped-def]
    return source_to_tac(a), source_to_tac(b)


# --- the two channels must agree on arithmetic --------------------------------

OPERANDS = [-100, -7, -3, -2, -1, 1, 2, 3, 7, 100]


@pytest.mark.parametrize(("left", "right"), list(itertools.product([*OPERANDS, 0], OPERANDS)))
def test_z3_division_matches_the_interpreter(left: int, right: int) -> None:
    """The single most important agreement in the project.

    Z3's own / on Int is Euclidean and Python's // floors, while the interpreter
    truncates toward zero. If the encoder used either built-in, the two
    verification channels would disagree about programs that are in fact correct,
    and the disagreement would only show on negative operands.
    """
    solver = z3.Solver()
    a, b = z3.IntVal(left), z3.IntVal(right)
    solver.add(z3.Or(_z3_div(a, b) != _div(left, right), _z3_mod(a, b) != _mod(left, right)))
    assert solver.check() == z3.unsat


# --- differential testing -----------------------------------------------------


def test_identical_programs_are_not_refuted() -> None:
    original, candidate = pair("input n; print(n + 1);", "input n; print(n + 1);")
    assert compare(original, candidate).passed


def test_difference_is_found() -> None:
    original, candidate = pair("input n; print(n + 1);", "input n; print(n + 2);")
    report = compare(original, candidate)
    assert report.refuted
    assert report.counterexample is not None


def test_edge_values_come_before_random_ones() -> None:
    # Division by zero and the algebraic identities break on 0 and 1, which random
    # sampling over a wide range hits rarely.
    vectors = input_vectors(source_to_tac("input n; print(n);"), seed=0)
    assert vectors[0] == {"n": 0}
    assert {"n": 1} in vectors[:6]


def test_input_vectors_are_seeded() -> None:
    program = source_to_tac("input a; input b; print(a + b);")
    assert input_vectors(program, seed=7) == input_vectors(program, seed=7)
    assert input_vectors(program, seed=7) != input_vectors(program, seed=8)


def test_program_without_inputs_is_still_executed() -> None:
    assert input_vectors(source_to_tac("print(1);"), seed=0) == [{}]


def test_trap_difference_is_caught() -> None:
    # Deleting a division removes a trap, which is a behaviour change.
    original, candidate = pair("input a; input b; print(a / b);", "input a; input b; print(a);")
    assert compare(original, candidate).refuted


# --- SMT ----------------------------------------------------------------------


def test_algebraic_identity_is_proven() -> None:
    original, candidate = pair("input n; print(n + 0);", "input n; print(n);")
    assert check_equivalence(original, candidate).verdict is SmtVerdict.EQUIVALENT


def test_constant_folding_is_proven() -> None:
    original, candidate = pair("int x = 10 * 20; print(x);", "print(200);")
    assert check_equivalence(original, candidate).verdict is SmtVerdict.EQUIVALENT


def test_reordered_branches_are_proven_equivalent() -> None:
    original, candidate = pair(
        "input n; if (n > 0) print(1); else print(2);",
        "input n; if (n <= 0) print(2); else print(1);",
    )
    assert check_equivalence(original, candidate).verdict is SmtVerdict.EQUIVALENT


def test_smt_refutes_and_gives_a_witness() -> None:
    original, candidate = pair("input n; print(n + 1);", "input n; print(n + 2);")
    report = check_equivalence(original, candidate)
    assert report.verdict is SmtVerdict.DIFFERENT
    assert report.counterexample is not None


def test_smt_finds_what_sampling_misses() -> None:
    """The reason the second channel exists.

    These differ at exactly one input, far outside the range differential testing
    samples. Sampling reports nothing; the solver names the value.
    """
    original, candidate = pair(
        "input n; print(n);",
        "input n; if (n == 999983) { print(0); } else { print(n); }",
    )
    assert compare(original, candidate).passed

    outcome = verify(original, candidate)
    assert outcome.verdict is VerificationVerdict.COUNTEREXAMPLE_FOUND
    assert outcome.method is VerificationMethod.SMT_Z3
    assert outcome.counterexample == {"n": 999983}


def test_loops_report_bounded_rather_than_proven() -> None:
    # An unbounded loop cannot be fully explored, and saying so is the honest
    # answer. Claiming a proof here is what a viva would take apart.
    source = "input n; int i = 0; while (i < n) { i = i + 1; } print(i);"
    original, candidate = pair(source, source)
    assert check_equivalence(original, candidate).verdict is SmtVerdict.BOUNDED


def test_division_semantics_survive_the_encoding() -> None:
    # Rewriting a division must be provable only when it is actually correct.
    original, candidate = pair("input a; print(a / 1);", "input a; print(a);")
    assert check_equivalence(original, candidate).verdict is SmtVerdict.EQUIVALENT


def test_negative_operand_division_is_not_wrongly_proven() -> None:
    # a / -1 is -a under truncation, so this pair really is equivalent. It only
    # comes out that way if the encoder truncates like the interpreter.
    original, candidate = pair("input a; print(a / -1);", "input a; print(-a);")
    assert check_equivalence(original, candidate).verdict is SmtVerdict.EQUIVALENT


def test_mismatched_inputs_are_unsupported() -> None:
    original, candidate = pair("input a; print(a);", "input a; input b; print(a);")
    assert check_equivalence(original, candidate).verdict is SmtVerdict.UNSUPPORTED


# --- combined module ----------------------------------------------------------


def test_verify_proves_a_correct_transformation() -> None:
    outcome = verify(*pair("input n; print(n * 1);", "input n; print(n);"))
    assert outcome.proven
    assert not outcome.refuted


def test_verify_refutes_a_broken_transformation() -> None:
    outcome = verify(*pair("input n; print(n + 1);", "input n; print(n - 1);"))
    assert outcome.refuted
    assert outcome.method is VerificationMethod.DIFFERENTIAL_TESTING


def test_verify_reports_bounded_for_loops() -> None:
    source = "input n; int i = 0; while (i < n) { i = i + 1; } print(i);"
    outcome = verify(*pair(source, source))
    assert outcome.verdict is VerificationVerdict.UNKNOWN_BOUNDED
    assert not outcome.refuted
    assert not outcome.proven


def test_smt_can_be_disabled() -> None:
    outcome = verify(*pair("input n; print(n + 0);", "input n; print(n);"), use_smt=False)
    assert outcome.verdict is VerificationVerdict.TESTS_PASSED
    assert outcome.smt is None


def test_verification_is_reproducible() -> None:
    programs = pair("input n; print(n + 1);", "input n; print(n + 2);")
    first, second = verify(*programs), verify(*programs)
    assert first.verdict == second.verdict
    assert first.counterexample == second.counterexample
