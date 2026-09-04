"""Dataflow analyses feeding the rule engine.

Five analyses, all built on the iterative solver in framework.py:

    liveness              backward, may     dead code, dead stores
    available_expressions forward,  must    common subexpression elimination
    constants             forward,  must    constant folding and propagation
    copies                forward,  must    copy propagation
    reaching              forward,  may     loop invariance
"""

from __future__ import annotations

from .available import Available, ExprKey, expression_of
from .available import analyse as available_expressions
from .constants import Constants, fold_binary, fold_unary
from .constants import analyse as constants
from .copies import Copies
from .copies import analyse as copies
from .framework import Direction, intersection, solve, union
from .liveness import Liveness
from .liveness import analyse as liveness
from .reaching import Reaching
from .reaching import analyse as reaching

__all__ = [
    "Available",
    "Constants",
    "Copies",
    "Direction",
    "ExprKey",
    "Liveness",
    "Reaching",
    "available_expressions",
    "constants",
    "copies",
    "expression_of",
    "fold_binary",
    "fold_unary",
    "intersection",
    "liveness",
    "reaching",
    "solve",
    "union",
]
