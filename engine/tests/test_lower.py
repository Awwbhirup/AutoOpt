from __future__ import annotations

from autoopt.ir import BinAssign, Copy, Goto, IfFalse, IfTrue, Label, Print, source_to_tac


def listing(source: str) -> list[str]:
    return [str(instruction) for instruction in source_to_tac(source)]


# --- expressions --------------------------------------------------------------


def test_simple_assignment() -> None:
    assert listing("int x = 5;") == ["x = 5"]


def test_declaration_without_initializer_defaults_to_zero() -> None:
    # Every variable must have a defined value at every point, or equivalence
    # between two programs is not well defined.
    assert listing("int x;") == ["x = 0"]


def test_binary_expression_creates_a_temporary() -> None:
    assert listing("input a; input b; int x = a + b;") == ["t1 = a + b", "x = t1"]


def test_nested_expression_creates_one_temporary_per_operation() -> None:
    assert listing("input a; input b; input c; int x = a + b * c;") == [
        "t1 = b * c",
        "t2 = a + t1",
        "x = t2",
    ]


def test_repeated_subexpression_is_left_redundant() -> None:
    # The lowerer must not do CSE itself: that redundancy is what the optimizer
    # is measured on finding.
    assert listing("input a; input b; int x = (a + b) * (a + b);") == [
        "t1 = a + b",
        "t2 = a + b",
        "t3 = t1 * t2",
        "x = t3",
    ]


def test_constants_are_not_folded_during_lowering() -> None:
    assert listing("int x = 10 * 20;") == ["t1 = 10 * 20", "x = t1"]


def test_unary_negation() -> None:
    assert listing("input a; int x = -a;") == ["t1 = -a", "x = t1"]


def test_left_operand_is_evaluated_before_the_right() -> None:
    # Observable, because division can trap.
    assert listing("input a; input b; input c; input d; int x = a / b + c / d;") == [
        "t1 = a / b",
        "t2 = c / d",
        "t3 = t1 + t2",
        "x = t3",
    ]


def test_print_is_emitted() -> None:
    assert listing("input a; print(a);") == ["print a"]


# --- short-circuit evaluation --------------------------------------------------


def test_logical_and_short_circuits() -> None:
    assert listing("input a; input b; int x = a && b;") == [
        "t1 = 0",
        "ifFalse a goto L1",
        "ifFalse b goto L1",
        "t1 = 1",
        "L1:",
        "x = t1",
    ]


def test_logical_or_short_circuits() -> None:
    assert listing("input a; input b; int x = a || b;") == [
        "t1 = 1",
        "ifTrue a goto L1",
        "ifTrue b goto L1",
        "t1 = 0",
        "L1:",
        "x = t1",
    ]


def test_short_circuit_guards_a_trapping_operand() -> None:
    # The division must sit after the guard branch, not before it.
    code = listing("input x; int ok = x != 0 && 100 / x > 1;")
    guard_index = next(i for i, line in enumerate(code) if line.startswith("ifFalse"))
    division_index = next(i for i, line in enumerate(code) if "/" in line)
    assert guard_index < division_index


# --- control flow ---------------------------------------------------------------


def test_if_without_else() -> None:
    assert listing("input a; if (a) print(1);") == [
        "ifFalse a goto L1",
        "print 1",
        "L1:",
    ]


def test_if_with_else() -> None:
    assert listing("input a; if (a) print(1); else print(2);") == [
        "ifFalse a goto L1",
        "print 1",
        "goto L2",
        "L1:",
        "print 2",
        "L2:",
    ]


def test_while_loop_reevaluates_its_condition() -> None:
    # The condition is lowered inside the loop; hoisting it is LICM's job.
    assert listing("input n; int i = 0; while (i < n) { i = i + 1; }") == [
        "i = 0",
        "L1:",
        "t1 = i < n",
        "ifFalse t1 goto L2",
        "t2 = i + 1",
        "i = t2",
        "goto L1",
        "L2:",
    ]


def test_for_loop_desugars_to_a_while_loop() -> None:
    for_code = listing("for (int i = 0; i < 10; i = i + 1) print(i);")
    while_code = listing("int i = 0; while (i < 10) { print(i); i = i + 1; }")
    assert for_code == while_code


def test_for_loop_update_runs_after_the_body() -> None:
    code = listing("for (int i = 0; i < 3; i = i + 1) print(i);")
    print_index = code.index("print i")
    update_index = next(i for i, line in enumerate(code) if line == "t2 = i + 1")
    assert print_index < update_index


def test_nested_loops_get_distinct_labels() -> None:
    code = listing(
        "int i = 0; while (i < 2) { int j = 0; while (j < 2) { j = j + 1; } i = i + 1; }"
    )
    labels = [line for line in code if line.endswith(":")]
    assert len(labels) == len(set(labels))


# --- program structure ----------------------------------------------------------


def test_inputs_emit_no_instructions_but_are_recorded() -> None:
    program = source_to_tac("input n; input m; print(n);")
    assert program.inputs == ("n", "m")
    assert [str(i) for i in program] == ["print n"]


def test_labels_index_maps_names_to_positions() -> None:
    program = source_to_tac("input a; if (a) print(1);")
    assert program.labels == {"L1": 2}


def test_canonical_hash_is_stable_and_distinguishing() -> None:
    a = source_to_tac("int x = 1 + 2;")
    b = source_to_tac("int x = 1 + 2;")
    c = source_to_tac("int x = 1 + 3;")
    assert a.canonical_hash() == b.canonical_hash()
    assert a.canonical_hash() != c.canonical_hash()


def test_replace_keeps_inputs() -> None:
    program = source_to_tac("input n; print(n);")
    assert program.replace(()).inputs == ("n",)


def test_format_indents_everything_except_labels() -> None:
    text = source_to_tac("input a; if (a) print(1);").format(numbered=False)
    assert text.splitlines() == ["    ifFalse a goto L1", "    print 1", "L1:"]


# --- instruction properties the dataflow analyses rely on -----------------------


def test_defs_and_uses() -> None:
    instruction = source_to_tac("input a; input b; int x = a + b;")[0]
    assert isinstance(instruction, BinAssign)
    assert instruction.defs == {"t1"}
    assert instruction.uses == {"a", "b"}


def test_constant_operands_are_not_uses() -> None:
    instruction = source_to_tac("input a; int x = a + 1;")[0]
    assert instruction.uses == {"a"}


def test_print_is_impure_so_it_is_never_removable() -> None:
    instruction = source_to_tac("int x = 1; print(x);")[1]
    assert isinstance(instruction, Print)
    assert instruction.is_pure is False


def test_division_is_impure_because_it_can_trap() -> None:
    instruction = source_to_tac("input a; input b; int x = a / b;")[0]
    assert isinstance(instruction, BinAssign)
    assert instruction.is_pure is False


def test_addition_is_pure() -> None:
    instruction = source_to_tac("input a; input b; int x = a + b;")[0]
    assert instruction.is_pure is True


def test_control_flow_instructions_define_nothing() -> None:
    program = source_to_tac("input a; if (a) print(1); else print(2);")
    for instruction in program:
        if isinstance(instruction, Label | Goto | IfFalse | IfTrue):
            assert instruction.defs == frozenset()


def test_copy_of_a_constant_uses_nothing() -> None:
    instruction = source_to_tac("int x = 5;")[0]
    assert isinstance(instruction, Copy)
    assert instruction.uses == frozenset()
