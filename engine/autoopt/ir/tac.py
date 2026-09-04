"""Three address code.

Instructions are frozen, so a transformation returns a new program instead of
mutating one. The search methods hold many program states at once and sharing
mutable instructions between them would cause hard to find bugs.

defs/uses/is_pure are the only things the dataflow analyses look at.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class BinOp(StrEnum):
    ADD = "+"
    SUB = "-"
    MUL = "*"
    DIV = "/"
    MOD = "%"
    LT = "<"
    GT = ">"
    LE = "<="
    GE = ">="
    EQ = "=="
    NE = "!="


class UnOp(StrEnum):
    NEG = "-"
    NOT = "!"


#: Operators that can trap at runtime (division by zero). Dead-code elimination must
#: not remove an instruction using one of these purely because its result is unused:
#: removing it could turn a trapping program into a non-trapping one.
TRAPPING_OPS = frozenset({BinOp.DIV, BinOp.MOD})

#: Operators whose result is always 0 or 1.
COMPARISON_OPS = frozenset({BinOp.LT, BinOp.GT, BinOp.LE, BinOp.GE, BinOp.EQ, BinOp.NE})


# --- operands ----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Const:
    value: int

    def __str__(self) -> str:
        return str(self.value)


@dataclass(frozen=True, slots=True)
class Var:
    name: str

    def __str__(self) -> str:
        return self.name


Operand = Const | Var


def used_vars(*operands: Operand) -> frozenset[str]:
    return frozenset(op.name for op in operands if isinstance(op, Var))


# --- instructions -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class BinAssign:
    """`dst = left op right`"""

    dst: str
    op: BinOp
    left: Operand
    right: Operand

    @property
    def defs(self) -> frozenset[str]:
        return frozenset({self.dst})

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.left, self.right)

    @property
    def is_pure(self) -> bool:
        return self.op not in TRAPPING_OPS

    def __str__(self) -> str:
        return f"{self.dst} = {self.left} {self.op.value} {self.right}"


@dataclass(frozen=True, slots=True)
class UnAssign:
    """`dst = op operand`"""

    dst: str
    op: UnOp
    operand: Operand

    @property
    def defs(self) -> frozenset[str]:
        return frozenset({self.dst})

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.operand)

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"{self.dst} = {self.op.value}{self.operand}"


@dataclass(frozen=True, slots=True)
class Copy:
    """`dst = src` - also how constants enter the program (`x = 5`)."""

    dst: str
    src: Operand

    @property
    def defs(self) -> frozenset[str]:
        return frozenset({self.dst})

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.src)

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"{self.dst} = {self.src}"


@dataclass(frozen=True, slots=True)
class Label:
    name: str

    @property
    def defs(self) -> frozenset[str]:
        return frozenset()

    @property
    def uses(self) -> frozenset[str]:
        return frozenset()

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"{self.name}:"


@dataclass(frozen=True, slots=True)
class Goto:
    target: str

    @property
    def defs(self) -> frozenset[str]:
        return frozenset()

    @property
    def uses(self) -> frozenset[str]:
        return frozenset()

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"goto {self.target}"


@dataclass(frozen=True, slots=True)
class IfFalse:
    """`ifFalse cond goto target`"""

    cond: Operand
    target: str

    @property
    def defs(self) -> frozenset[str]:
        return frozenset()

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.cond)

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"ifFalse {self.cond} goto {self.target}"


@dataclass(frozen=True, slots=True)
class IfTrue:
    """`ifTrue cond goto target` - lets short-circuit `||` lower without a detour."""

    cond: Operand
    target: str

    @property
    def defs(self) -> frozenset[str]:
        return frozenset()

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.cond)

    @property
    def is_pure(self) -> bool:
        return True

    def __str__(self) -> str:
        return f"ifTrue {self.cond} goto {self.target}"


@dataclass(frozen=True, slots=True)
class Print:
    """The only observable effect, and therefore never removable."""

    value: Operand

    @property
    def defs(self) -> frozenset[str]:
        return frozenset()

    @property
    def uses(self) -> frozenset[str]:
        return used_vars(self.value)

    @property
    def is_pure(self) -> bool:
        return False

    def __str__(self) -> str:
        return f"print {self.value}"


Instruction = BinAssign | UnAssign | Copy | Label | Goto | IfFalse | IfTrue | Print

#: Instructions that end a basic block.
Terminator = Goto | IfFalse | IfTrue


def is_terminator(instruction: Instruction) -> bool:
    return isinstance(instruction, Goto | IfFalse | IfTrue)


def jump_target(instruction: Instruction) -> str | None:
    match instruction:
        case Goto(target=target) | IfFalse(target=target) | IfTrue(target=target):
            return target
        case _:
            return None


# --- programs -----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TacProgram:
    """A lowered program.

    `inputs` are free variables: they have no defining instruction and are bound before
    execution. Differential testing supplies a vector for them; the SMT encoder declares
    them as the variables it quantifies over. Their order matches the source declaration
    order, so both agree on which value is which.
    """

    inputs: tuple[str, ...]
    instructions: tuple[Instruction, ...]

    def __len__(self) -> int:
        return len(self.instructions)

    def __iter__(self):  # type: ignore[no-untyped-def]
        return iter(self.instructions)

    def __getitem__(self, index: int) -> Instruction:
        return self.instructions[index]

    def replace(self, instructions: tuple[Instruction, ...]) -> TacProgram:
        """A new program with the same inputs and different code."""
        return TacProgram(inputs=self.inputs, instructions=instructions)

    @property
    def labels(self) -> dict[str, int]:
        """Label name to the index of its Label instruction."""
        return {
            instruction.name: index
            for index, instruction in enumerate(self.instructions)
            if isinstance(instruction, Label)
        }

    def canonical_hash(self) -> str:
        """Stable identity for a program state.

        The search methods use this for the closed set, so that reaching the same
        program by two different transformation orders is recognised as one state
        rather than explored twice.
        """
        import hashlib

        payload = "\n".join(str(instruction) for instruction in self.instructions)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    def format(self, *, numbered: bool = True) -> str:
        """Human-readable TAC listing. Labels sit flush left, everything else indents."""
        lines: list[str] = []
        for index, instruction in enumerate(self.instructions):
            text = str(instruction)
            body = text if isinstance(instruction, Label) else f"    {text}"
            lines.append(f"{index:>3}  {body}" if numbered else body)
        return "\n".join(lines)

    def __str__(self) -> str:
        return self.format(numbered=False)
