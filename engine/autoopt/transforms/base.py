"""Transformation interface and the operand rewriting helpers.

Each transformation is a STRIPS-style action: preconditions that say when it
applies, and effects that say what it does. Both are recorded as prose on the
class so the decision log and the report can quote them, and so the planning
framing in the write-up matches what the code actually does.

Every transformation returns a new program or None. None means the opportunity no
longer applies, which happens when an earlier transformation in the same pass
already changed the instruction. The orchestrator treats that as a rejection with
reason NOT_APPLICABLE rather than as an error.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import replace

from ..events import OptimizationType
from ..ir.tac import (
    BinAssign,
    Copy,
    IfFalse,
    IfTrue,
    Instruction,
    Operand,
    Print,
    TacProgram,
    UnAssign,
    Var,
)
from ..rules import Opportunity


def substitute(instruction: Instruction, name: str, replacement: Operand) -> Instruction:
    """Replace every read of `name` in one instruction. Definitions are untouched."""

    def swap(operand: Operand) -> Operand:
        return replacement if isinstance(operand, Var) and operand.name == name else operand

    match instruction:
        case BinAssign(left=left, right=right):
            return replace(instruction, left=swap(left), right=swap(right))
        case UnAssign(operand=operand):
            return replace(instruction, operand=swap(operand))
        case Copy(src=src):
            return replace(instruction, src=swap(src))
        case IfFalse(cond=cond) | IfTrue(cond=cond):
            return replace(instruction, cond=swap(cond))
        case Print(value=value):
            return replace(instruction, value=swap(value))
        case _:
            return instruction


def with_instruction(program: TacProgram, index: int, instruction: Instruction) -> TacProgram:
    """A copy of the program with one instruction replaced."""
    instructions = list(program.instructions)
    instructions[index] = instruction
    return program.replace(tuple(instructions))


def without_instruction(program: TacProgram, index: int) -> TacProgram:
    """A copy of the program with one instruction removed."""
    instructions = list(program.instructions)
    del instructions[index]
    return program.replace(tuple(instructions))


def moved_instruction(program: TacProgram, source: int, destination: int) -> TacProgram:
    """A copy with the instruction at `source` relocated to `destination`.

    Only used for hoisting, where the destination always precedes the source, so
    removing first does not shift where the instruction needs to land.
    """
    instructions = list(program.instructions)
    instruction = instructions.pop(source)
    instructions.insert(destination, instruction)
    return program.replace(tuple(instructions))


class Transformation(ABC):
    """One optimization, expressed as a planning action."""

    kind: OptimizationType
    name: str
    preconditions: str
    effects: str

    @abstractmethod
    def apply(self, program: TacProgram, opportunity: Opportunity) -> TacProgram | None:
        """Rewrite the program, or return None if the opportunity is stale."""

    def _valid_site(self, program: TacProgram, opportunity: Opportunity) -> bool:
        return 0 <= opportunity.site < len(program.instructions)
