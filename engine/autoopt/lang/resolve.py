"""Declaration checking.

One flat scope: a name is visible from its declaration to the end of the
program and redeclaring is an error. Blocks don't open a scope. That keeps
lowering a straight one-to-one mapping with no alpha renaming, which makes the
dataflow analyses and the SSA encoding easier to follow.

Corpus generator therefore has to use unique loop variable names.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import ast
from .errors import SemanticError


@dataclass(frozen=True, slots=True)
class ProgramInfo:
    """Declaration facts a later stage needs.

    `inputs` is ordered: differential testing builds input vectors positionally, and the
    SMT encoder declares free variables in the same order, so the two agree.
    """

    inputs: tuple[str, ...]
    locals: tuple[str, ...]

    @property
    def all_variables(self) -> tuple[str, ...]:
        return self.inputs + self.locals


class _Resolver:
    def __init__(self) -> None:
        self._inputs: list[str] = []
        self._locals: list[str] = []
        self._declared: set[str] = set()

    # --- declarations --------------------------------------------------------

    def _declare(self, name: str, node: ast.Node, *, is_input: bool) -> None:
        if name in self._declared:
            raise SemanticError(f"{name!r} is already declared", node.line, node.column)
        self._declared.add(name)
        (self._inputs if is_input else self._locals).append(name)

    def _require_declared(self, name: str, node: ast.Node) -> None:
        if name not in self._declared:
            raise SemanticError(f"{name!r} is not declared", node.line, node.column)

    # --- traversal -----------------------------------------------------------

    def visit_program(self, program: ast.Program) -> ProgramInfo:
        for statement in program.statements:
            self.visit_stmt(statement)
        return ProgramInfo(inputs=tuple(self._inputs), locals=tuple(self._locals))

    def visit_stmt(self, node: ast.Stmt) -> None:
        match node:
            case ast.InputDecl(name=name):
                self._declare(name, node, is_input=True)

            case ast.VarDecl(name=name, init=init):
                # The initializer is resolved first, so `int x = x;` is rejected.
                if init is not None:
                    self.visit_expr(init)
                self._declare(name, node, is_input=False)

            case ast.Assign(name=name, value=value):
                self._require_declared(name, node)
                assert value is not None
                self.visit_expr(value)

            case ast.Print(value=value):
                assert value is not None
                self.visit_expr(value)

            case ast.Block(statements=statements):
                for statement in statements:
                    self.visit_stmt(statement)

            case ast.If(condition=condition, then_branch=then_branch, else_branch=else_branch):
                assert condition is not None and then_branch is not None
                self.visit_expr(condition)
                self.visit_stmt(then_branch)
                if else_branch is not None:
                    self.visit_stmt(else_branch)

            case ast.While(condition=condition, body=body):
                assert condition is not None and body is not None
                self.visit_expr(condition)
                self.visit_stmt(body)

            case ast.For(init=init, condition=condition, update=update, body=body):
                if init is not None:
                    self.visit_stmt(init)
                assert condition is not None and body is not None
                self.visit_expr(condition)
                if update is not None:
                    self.visit_stmt(update)
                self.visit_stmt(body)

    def visit_expr(self, node: ast.Expr) -> None:
        match node:
            case ast.Number():
                pass
            case ast.Identifier(name=name):
                self._require_declared(name, node)
            case ast.Binary(left=left, right=right):
                assert left is not None and right is not None
                self.visit_expr(left)
                self.visit_expr(right)
            case ast.Unary(operand=operand):
                assert operand is not None
                self.visit_expr(operand)


def resolve(program: ast.Program) -> ProgramInfo:
    """Validate declarations and return the program's variable inventory.

    Raises SemanticError on an undeclared use or a duplicate declaration.
    """
    return _Resolver().visit_program(program)
