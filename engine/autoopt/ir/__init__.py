"""Three-address code: the representation every optimization operates on."""

from __future__ import annotations

from ..lang import compile_source
from .cfg import BasicBlock, ControlFlowGraph, build_cfg
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
    "BasicBlock",
    "BinAssign",
    "BinOp",
    "Const",
    "ControlFlowGraph",
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
    "build_cfg",
    "is_terminator",
    "jump_target",
    "lower",
    "source_to_tac",
]


def source_to_tac(source: str) -> TacProgram:
    """MiniLang source straight to TAC. Raises MiniLangError on invalid source."""
    program, info = compile_source(source)
    return lower(program, info.inputs)
