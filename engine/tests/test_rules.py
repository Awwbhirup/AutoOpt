from __future__ import annotations

from autoopt.events import OptimizationType as Kind
from autoopt.ir import build_cfg, source_to_tac
from autoopt.rules import analyse, build_working_memory, default_rules


def opportunities(source: str):  # type: ignore[no-untyped-def]
    return analyse(build_cfg(source_to_tac(source)))


def kinds(source: str) -> set[Kind]:
    return {opportunity.kind for opportunity in opportunities(source)}


def sites_for(source: str, kind: Kind) -> list[int]:
    return sorted(o.site for o in opportunities(source) if o.kind is kind)


# --- each rule fires on its own pattern ---------------------------------------


def test_dead_code_detected() -> None:
    assert Kind.DEAD_CODE_ELIMINATION in kinds("input n; int unused = 77; print(n);")


def test_constant_folding_detected() -> None:
    assert Kind.CONSTANT_FOLDING in kinds("int x = 10 * 20; print(x);")


def test_algebraic_identity_detected() -> None:
    assert Kind.ALGEBRAIC_SIMPLIFICATION in kinds("input n; int x = n + 0; print(x);")


def test_strength_reduction_detected() -> None:
    assert Kind.STRENGTH_REDUCTION in kinds("input n; int x = n * 2; print(x);")


def test_constant_propagation_detected() -> None:
    assert Kind.CONSTANT_PROPAGATION in kinds("int k = 5; int x = k + 1; print(x);")


def test_copy_propagation_detected() -> None:
    assert Kind.COPY_PROPAGATION in kinds("input n; int a = n; int b = a; print(b);")


def test_common_subexpression_detected() -> None:
    assert Kind.COMMON_SUBEXPRESSION_ELIMINATION in kinds(
        "input a; input b; int x = (a + b) * (a + b); print(x);"
    )


def test_loop_invariant_detected() -> None:
    # An input is never redefined anywhere, so an expression over inputs inside a
    # loop is invariant. Treating "no reaching definition" as not-invariant would
    # silently stop LICM ever firing.
    assert Kind.LOOP_INVARIANT_CODE_MOTION in kinds(
        "input n; int i = 0; while (i < n) { int c = n + 1; i = i + 1; }"
    )


# --- rules stay quiet when they should ----------------------------------------


def test_clean_program_yields_nothing_much() -> None:
    assert Kind.ALGEBRAIC_SIMPLIFICATION not in kinds("input a; input b; print(a + b);")


def test_impure_instruction_is_not_dead_code() -> None:
    # An unused division still traps on a zero divisor, so removing it would
    # change behaviour.
    sites = sites_for("input a; input b; int unused = a / b; print(a);", Kind.DEAD_CODE_ELIMINATION)
    program = source_to_tac("input a; input b; int unused = a / b; print(a);")
    division = next(i for i, ins in enumerate(program) if str(ins) == "t1 = a / b")
    assert division not in sites


def test_loop_variant_expression_is_not_hoisted() -> None:
    # i changes every iteration, so i + 1 cannot move out of the loop.
    program = source_to_tac("input n; int i = 0; while (i < n) { i = i + 1; }")
    sites = sites_for(
        "input n; int i = 0; while (i < n) { i = i + 1; }", Kind.LOOP_INVARIANT_CODE_MOTION
    )
    increment = next(i for i, ins in enumerate(program) if str(ins) == "t2 = i + 1")
    assert increment not in sites


def test_division_by_zero_is_not_folded() -> None:
    program = source_to_tac("int x = 5 / 0; print(x);")
    sites = sites_for("int x = 5 / 0; print(x);", Kind.CONSTANT_FOLDING)
    division = next(i for i, ins in enumerate(program) if str(ins) == "t1 = 5 / 0")
    assert division not in sites


# --- engine behaviour ----------------------------------------------------------


def test_every_opportunity_cites_its_facts() -> None:
    # The decision log has to be able to show why the agent thought a
    # transformation applied.
    for opportunity in opportunities("input n; int x = n + 0; int unused = 1; print(x);"):
        assert opportunity.derived_from
        assert all("(" in fact for fact in opportunity.derived_from)


def test_agenda_is_ordered_by_priority() -> None:
    found = opportunities("input n; int f = 10 * 20; int z = n + 0; int unused = 5; print(f);")
    priority = {rule.kind: rule.priority for rule in default_rules()}
    ordering = [priority[o.kind] for o in found]
    assert ordering == sorted(ordering)


def test_agenda_is_deterministic() -> None:
    # Reproducibility of the whole experiment rests on this.
    source = "input n; int f = 10 * 20; int z = n + 0; int u = 1; print(f);"
    first = [(o.kind, o.site) for o in opportunities(source)]
    second = [(o.kind, o.site) for o in opportunities(source)]
    assert first == second


def test_working_memory_records_facts() -> None:
    memory = build_working_memory(build_cfg(source_to_tac("input n; int x = n + 0; print(x);")))
    assert len(memory) > 0
    assert "algebraic" in memory.predicates
    assert memory.has("algebraic")


def test_query_filters_by_position() -> None:
    memory = build_working_memory(
        build_cfg(source_to_tac("input n; int a = n; int b = a; print(b);"))
    )
    everything = memory.query("defines")
    filtered = memory.query("defines", arg1="a")
    assert 0 < len(filtered) < len(everything)


def test_empty_program_produces_no_opportunities() -> None:
    assert opportunities("") == []


def test_mixed_program_finds_several_kinds() -> None:
    found = kinds(
        "input n; int f = 10 * 20; int z = n + 0; int d = n * 2; "
        "int u = 9; int c = (n+1)*(n+1); print(f);"
    )
    assert len(found) >= 5
