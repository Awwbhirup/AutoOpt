"""Optimization Specialist: turns an opportunity into a rewritten program."""

from __future__ import annotations

from ..events import OptimizationType
from ..ir.tac import TacProgram
from ..rules import Opportunity
from .base import Transformation, substitute
from .catalog import (
    AlgebraicSimplification,
    CommonSubexpressionElimination,
    ConstantFolding,
    ConstantPropagation,
    CopyPropagation,
    DeadCodeElimination,
    LoopInvariantCodeMotion,
    StrengthReduction,
    default_transformations,
)

__all__ = [
    "AlgebraicSimplification",
    "CommonSubexpressionElimination",
    "ConstantFolding",
    "ConstantPropagation",
    "CopyPropagation",
    "DeadCodeElimination",
    "LoopInvariantCodeMotion",
    "StrengthReduction",
    "Transformation",
    "apply",
    "default_transformations",
    "substitute",
]

_CATALOG: dict[OptimizationType, Transformation] = default_transformations()


def apply(program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
    """Apply whichever transformation handles this opportunity kind."""
    transformation = _CATALOG.get(opportunity.kind)
    if transformation is None:
        return None
    return transformation.apply(program, opportunity)
