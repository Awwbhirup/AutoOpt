"""Three address code."""

from __future__ import annotations

from ..lang import compile_source
from .lower import lower
from .tac import (
    BinAssign,
    BinOp,
    Const,
    Copy,
    Goto,
    IfFalse,
    IfTrue,
    Instruction,
    Label,
    Operand,
    Print,
    TacProgram,
    UnAssign,
    UnOp,
    Var,
    is_terminator,
    jump_target,
)

__all__ = [
    "BinAssign",
    "BinOp",
    "Const",
    "Copy",
    "Goto",
    "IfFalse",
    "IfTrue",
    "Instruction",
    "Label",
    "Operand",
    "Print",
    "TacProgram",
    "UnAssign",
    "UnOp",
    "Var",
    "is_terminator",
    "jump_target",
    "lower",
    "source_to_tac",
]


def source_to_tac(source: str) -> TacProgram:
    """MiniLang source straight to TAC. Raises MiniLangError on invalid source."""
    program, info = compile_source(source)
    return lower(program, info.inputs)
