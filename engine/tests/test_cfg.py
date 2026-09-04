from __future__ import annotations

import pytest

from autoopt.ir import build_cfg, source_to_tac
from autoopt.ir.tac import Const, Goto, Label, TacProgram


def cfg_of(source: str):  # type: ignore[no-untyped-def]
    return build_cfg(source_to_tac(source))


# --- block construction -------------------------------------------------------


def test_straight_line_code_is_one_block() -> None:
    graph = cfg_of("input a; int x = a + 1; int y = x * 2; print(y);")
    assert len(graph.blocks) == 1
    assert graph.successors(0) == frozenset()


def test_empty_program_has_no_blocks() -> None:
    graph = cfg_of("")
    assert graph.blocks == ()
    assert graph.entry is None


def test_if_else_splits_into_four_blocks() -> None:
    # cond | then | else | join
    graph = cfg_of("input a; if (a) print(1); else print(2);")
    assert len(graph.blocks) == 4


def test_conditional_block_has_two_successors() -> None:
    graph = cfg_of("input a; if (a) print(1); else print(2);")
    assert len(graph.successors(0)) == 2


def test_goto_does_not_fall_through() -> None:
    # The `then` block ends in `goto`, so it reaches only the join, never the else.
    graph = cfg_of("input a; if (a) print(1); else print(2);")
    then_block = next(b for b in graph.blocks if any(str(i) == "print 1" for i in b.instructions))
    assert len(graph.successors(then_block.index)) == 1


def test_blocks_partition_the_program_exactly() -> None:
    program = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")
    graph = build_cfg(program)
    covered = [i for block in graph.blocks for i in range(block.start, block.stop)]
    assert covered == list(range(len(program)))


def test_predecessors_mirror_successors() -> None:
    graph = cfg_of("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")
    for block in graph.blocks:
        for successor in graph.successors(block.index):
            assert block.index in graph.predecessors(successor)


# --- dominance ----------------------------------------------------------------


def test_entry_dominates_everything_reachable() -> None:
    graph = cfg_of("input a; if (a) print(1); else print(2); print(3);")
    for block in graph.reachable:
        assert graph.dominates(0, block)


def test_every_block_dominates_itself() -> None:
    graph = cfg_of("input n; int i = 0; while (i < n) { i = i + 1; }")
    for block in graph.reachable:
        assert graph.dominates(block, block)


def test_a_branch_arm_does_not_dominate_the_join() -> None:
    graph = cfg_of("input a; if (a) print(1); else print(2); print(3);")
    then_block = next(b for b in graph.blocks if any(str(i) == "print 1" for i in b.instructions))
    join = next(b for b in graph.blocks if any(str(i) == "print 3" for i in b.instructions))
    assert not graph.dominates(then_block.index, join.index)


# --- loops --------------------------------------------------------------------


def test_while_loop_produces_one_back_edge() -> None:
    graph = cfg_of("input n; int i = 0; while (i < n) { i = i + 1; }")
    assert len(graph.back_edges) == 1


def test_back_edge_head_dominates_its_tail() -> None:
    graph = cfg_of("input n; int i = 0; while (i < n) { i = i + 1; }")
    for tail, head in graph.back_edges:
        assert graph.dominates(head, tail)


def test_straight_line_code_has_no_loops() -> None:
    graph = cfg_of("int x = 1; int y = 2; print(x + y);")
    assert graph.back_edges == ()
    assert graph.natural_loops == ()


def test_loop_body_instructions_have_depth_one() -> None:
    program = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; }")
    depths = build_cfg(program).loop_depth_per_instruction
    body = next(i for i, ins in enumerate(program) if str(ins) == "t2 = i + 1")
    assert depths[body] == 1


def test_code_outside_the_loop_has_depth_zero() -> None:
    program = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; } print(i);")
    depths = build_cfg(program).loop_depth_per_instruction
    first = next(i for i, ins in enumerate(program) if str(ins) == "i = 0")
    last = next(i for i, ins in enumerate(program) if str(ins) == "print i")
    assert depths[first] == 0
    assert depths[last] == 0


def test_nested_loops_give_depth_two() -> None:
    # This is the number the Cost Evaluator multiplies by, so it has to be right:
    # without it, loop-invariant code motion registers as no improvement at all.
    program = source_to_tac(
        "input n; int i = 0; while (i < n) { int j = 0; while (j < n) { j = j + 1; } i = i + 1; }"
    )
    depths = build_cfg(program).loop_depth_per_instruction
    inner = next(i for i, ins in enumerate(program) if str(ins) == "t3 = j + 1")
    outer = next(i for i, ins in enumerate(program) if str(ins) == "t4 = i + 1")
    first = next(i for i, ins in enumerate(program) if str(ins) == "i = 0")
    assert depths[inner] == 2
    assert depths[outer] == 1
    assert depths[first] == 0


def test_two_sequential_loops_stay_at_depth_one() -> None:
    program = source_to_tac(
        "input n; int i = 0; while (i < n) { i = i + 1; } int k = 0; while (k < n) { k = k + 1; }"
    )
    depths = build_cfg(program).loop_depth_per_instruction
    assert max(depths) == 1
    assert len(build_cfg(program).back_edges) == 2


def test_depths_align_with_the_instruction_list() -> None:
    program = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; }")
    assert len(build_cfg(program).loop_depth_per_instruction) == len(program)


# --- reachability -------------------------------------------------------------


def test_all_blocks_reachable_in_normal_code() -> None:
    graph = cfg_of("input a; if (a) print(1); else print(2); print(3);")
    assert len(graph.reachable) == len(graph.blocks)


def test_code_after_an_unconditional_jump_is_unreachable() -> None:
    # Hand-built, since the lowerer never emits dead blocks. This is what
    # unreachable-code elimination will be allowed to delete.
    program = TacProgram(
        inputs=(),
        instructions=(
            Goto(target="L1"),
            Label(name="L0"),
            Label(name="L1"),
        ),
    )
    graph = build_cfg(program)
    orphan = next(b for b in graph.blocks if any(str(i) == "L0:" for i in b.instructions))
    assert orphan.index not in graph.reachable


def test_jump_to_a_missing_label_is_rejected() -> None:
    from autoopt.ir.tac import Copy

    program = TacProgram(
        inputs=(), instructions=(Copy(dst="x", src=Const(1)), Goto(target="nowhere"))
    )
    with pytest.raises(ValueError, match="undefined label"):
        build_cfg(program)
