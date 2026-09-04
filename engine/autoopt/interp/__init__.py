"""Execution of three-address code.

Used for differential testing, dynamic cost measurement, and the PASS/FAIL
output-match verdict the spec requires per program.
"""

from __future__ import annotations

from .machine import (
    DEFAULT_STEP_LIMIT,
    ExecutionResult,
    Interpreter,
    Status,
    TrapKind,
    execute,
)

__all__ = [
    "DEFAULT_STEP_LIMIT",
    "ExecutionResult",
    "Interpreter",
    "Status",
    "TrapKind",
    "execute",
]
