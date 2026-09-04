"""The eight production rules.

Each is a query over working memory. None of them looks at the program or at a
dataflow result directly, which is what keeps adding an optimization to a matter
of adding a rule.

Priority orders the agenda. Cheap transformations that always shrink the program
go first; ones that only pay off indirectly, or that move code around, go last.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..events import OptimizationType
from .engine import Opportunity, Rule, WorkingMemory


class DeadCodeRule(Rule):
    name = "dead-code"
    kind = OptimizationType.DEAD_CODE_ELIMINATION
    condition = "defines(i, x) AND dead_after(x, i) AND pure(i)"
    priority = 10

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for defines in memory.query("defines"):
            site, name = defines.args
            dead = memory.first("dead_after", arg0=name, arg1=site)
            pure = memory.first("pure", arg0=site)
            # An impure instruction stays even when its result is unused, because
            # dropping a division would delete a trap the program would have hit.
            if dead is None or pure is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(defines.id, dead.id, pure.id),
                detail={"variable": name},
            )


class ConstantFoldRule(Rule):
    name = "constant-fold"
    kind = OptimizationType.CONSTANT_FOLDING
    condition = "foldable(i, v) AND computes(i, _)"
    priority = 20

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for foldable in memory.query("foldable"):
            site, value = foldable.args
            # Only worth folding something that actually computes. A copy of a
            # constant is already as folded as it gets.
            computes = memory.first("computes", arg0=site)
            if computes is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(foldable.id, computes.id),
                detail={"value": int(value)},
            )


class AlgebraicRule(Rule):
    name = "algebraic"
    kind = OptimizationType.ALGEBRAIC_SIMPLIFICATION
    condition = "algebraic(i, pattern)"
    priority = 25

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for fact in memory.query("algebraic"):
            site, pattern = fact.args
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(fact.id,),
                detail={"pattern": pattern},
            )


class StrengthReductionRule(Rule):
    name = "strength-reduction"
    kind = OptimizationType.STRENGTH_REDUCTION
    condition = "strength_reducible(i, pattern)"
    priority = 30

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for fact in memory.query("strength_reducible"):
            site, pattern = fact.args
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(fact.id,),
                detail={"pattern": pattern},
            )


class ConstantPropagationRule(Rule):
    name = "constant-propagation"
    kind = OptimizationType.CONSTANT_PROPAGATION
    condition = "reads(i, x) AND is_const(x, v, i)"
    priority = 35

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for reads in memory.query("reads"):
            site, name = reads.args
            known = memory.first("is_const", arg0=name, arg2=site)
            if known is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(reads.id, known.id),
                detail={"variable": name, "value": int(known.args[1])},
            )


class CopyPropagationRule(Rule):
    name = "copy-propagation"
    kind = OptimizationType.COPY_PROPAGATION
    condition = "reads(i, x) AND copy_of(x, y, i)"
    priority = 40

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for reads in memory.query("reads"):
            site, name = reads.args
            copy = memory.first("copy_of", arg0=name, arg2=site)
            if copy is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(reads.id, copy.id),
                detail={"variable": name, "source": copy.args[1]},
            )


class CommonSubexpressionRule(Rule):
    name = "common-subexpression"
    kind = OptimizationType.COMMON_SUBEXPRESSION_ELIMINATION
    condition = "computes(i, e) AND available(i, e, holder)"
    priority = 45

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for fact in memory.query("available"):
            site, expression, holder = fact.args
            computes = memory.first("computes", arg0=site, arg1=expression)
            if computes is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(computes.id, fact.id),
                detail={"holder": holder, "expression": expression},
            )


class LoopInvariantRule(Rule):
    name = "loop-invariant-code-motion"
    kind = OptimizationType.LOOP_INVARIANT_CODE_MOTION
    condition = "loop_invariant(i, depth) AND in_loop(i, depth) AND pure(i)"
    # Last, because it relocates rather than removes. Only worth doing once the
    # cheaper transformations have stopped finding anything.
    priority = 60

    def fire(self, memory: WorkingMemory) -> Iterator[Opportunity]:
        for fact in memory.query("loop_invariant"):
            site, depth = fact.args
            pure = memory.first("pure", arg0=site)
            if pure is None:
                continue
            yield Opportunity(
                kind=self.kind,
                site=int(site),
                derived_from=(fact.id, pure.id),
                detail={"depth": int(depth)},
            )


def default_rules() -> list[Rule]:
    return [
        DeadCodeRule(),
        ConstantFoldRule(),
        AlgebraicRule(),
        StrengthReductionRule(),
        ConstantPropagationRule(),
        CopyPropagationRule(),
        CommonSubexpressionRule(),
        LoopInvariantRule(),
    ]
