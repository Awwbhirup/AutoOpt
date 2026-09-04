"""MiniLang abstract syntax tree.

Nodes are frozen dataclasses: the AST is never mutated in place. Lowering to TAC
builds a fresh structure, and every optimization operates on TAC rather than on
the AST, so a program's source representation stays stable for the whole run.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class BinaryOp(StrEnum):
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
    AND = "&&"
    OR = "||"


class UnaryOp(StrEnum):
    NEG = "-"
    NOT = "!"


# Operators whose result is 0 or 1. Used by the lowerer to decide when a value
# already is a boolean, and by the verifier when comparing observable state.
COMPARISON_OPS = frozenset(
    {BinaryOp.LT, BinaryOp.GT, BinaryOp.LE, BinaryOp.GE, BinaryOp.EQ, BinaryOp.NE}
)
LOGICAL_OPS = frozenset({BinaryOp.AND, BinaryOp.OR})


@dataclass(frozen=True, slots=True)
class Node:
    line: int = field(default=0, compare=False)
    column: int = field(default=0, compare=False)


# --- expressions -------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Number(Node):
    value: int = 0


@dataclass(frozen=True, slots=True)
class Identifier(Node):
    name: str = ""


@dataclass(frozen=True, slots=True)
class Binary(Node):
    op: BinaryOp = BinaryOp.ADD
    left: Expr | None = None
    right: Expr | None = None


@dataclass(frozen=True, slots=True)
class Unary(Node):
    op: UnaryOp = UnaryOp.NEG
    operand: Expr | None = None


Expr = Number | Identifier | Binary | Unary


# --- statements --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class InputDecl(Node):
    """`input n;` - a free variable. Differential testing supplies values for these,
    and the SMT encoding treats them as the universally quantified inputs."""

    name: str = ""


@dataclass(frozen=True, slots=True)
class VarDecl(Node):
    name: str = ""
    init: Expr | None = None


@dataclass(frozen=True, slots=True)
class Assign(Node):
    name: str = ""
    value: Expr | None = None


@dataclass(frozen=True, slots=True)
class Print(Node):
    """The only observable effect. Equivalence is defined as producing an identical
    print trace for identical inputs."""

    value: Expr | None = None


@dataclass(frozen=True, slots=True)
class Block(Node):
    statements: tuple[Stmt, ...] = ()


@dataclass(frozen=True, slots=True)
class If(Node):
    condition: Expr | None = None
    then_branch: Stmt | None = None
    else_branch: Stmt | None = None


@dataclass(frozen=True, slots=True)
class While(Node):
    condition: Expr | None = None
    body: Stmt | None = None


@dataclass(frozen=True, slots=True)
class For(Node):
    """Desugared to a While during lowering; kept distinct in the AST so the corpus
    generator can emit both surface forms, as the spec's loop category requires."""

    init: Stmt | None = None
    condition: Expr | None = None
    update: Stmt | None = None
    body: Stmt | None = None


Stmt = InputDecl | VarDecl | Assign | Print | Block | If | While | For


@dataclass(frozen=True, slots=True)
class Program(Node):
    statements: tuple[Stmt, ...] = ()
