"""AST to three address code.

Emits a fresh temp for every intermediate value and folds nothing on the way
down. The redundancy left behind is what the optimizer is measured on finding,
so being clever here would flatten the cost reductions we report.

&& and || short circuit, which is observable because division can trap:
in `x != 0 && 100 / x > 1` evaluating the right side when x is 0 would turn a
working program into a trapping one.

A declaration with no initializer defaults to 0, so every variable has a value
everywhere and equivalence stays well defined.
"""

from __future__ import annotations

from ..lang import ast
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
)

_BINOP: dict[ast.BinaryOp, BinOp] = {
    ast.BinaryOp.ADD: BinOp.ADD,
    ast.BinaryOp.SUB: BinOp.SUB,
    ast.BinaryOp.MUL: BinOp.MUL,
    ast.BinaryOp.DIV: BinOp.DIV,
    ast.BinaryOp.MOD: BinOp.MOD,
    ast.BinaryOp.LT: BinOp.LT,
    ast.BinaryOp.GT: BinOp.GT,
    ast.BinaryOp.LE: BinOp.LE,
    ast.BinaryOp.GE: BinOp.GE,
    ast.BinaryOp.EQ: BinOp.EQ,
    ast.BinaryOp.NE: BinOp.NE,
}

_UNOP: dict[ast.UnaryOp, UnOp] = {
    ast.UnaryOp.NEG: UnOp.NEG,
    ast.UnaryOp.NOT: UnOp.NOT,
}


class _Lowerer:
    def __init__(self) -> None:
        self._code: list[Instruction] = []
        self._temp_counter = 0
        self._label_counter = 0

    # --- name generation -----------------------------------------------------

    def _temp(self) -> str:
        self._temp_counter += 1
        return f"t{self._temp_counter}"

    def _label(self) -> str:
        self._label_counter += 1
        return f"L{self._label_counter}"

    def _emit(self, instruction: Instruction) -> None:
        self._code.append(instruction)

    # --- entry point ---------------------------------------------------------

    def lower(self, program: ast.Program, inputs: tuple[str, ...]) -> TacProgram:
        for statement in program.statements:
            self._stmt(statement)
        return TacProgram(inputs=inputs, instructions=tuple(self._code))

    # --- statements ----------------------------------------------------------

    def _stmt(self, node: ast.Stmt) -> None:
        match node:
            case ast.InputDecl():
                # Inputs are bound before execution; they need no instruction.
                pass

            case ast.VarDecl(name=name, init=init):
                value = self._expr(init) if init is not None else Const(0)
                self._emit(Copy(dst=name, src=value))

            case ast.Assign(name=name, value=value):
                assert value is not None
                self._emit(Copy(dst=name, src=self._expr(value)))

            case ast.Print(value=value):
                assert value is not None
                self._emit(Print(value=self._expr(value)))

            case ast.Block(statements=statements):
                for statement in statements:
                    self._stmt(statement)

            case ast.If(condition=condition, then_branch=then_branch, else_branch=else_branch):
                assert condition is not None and then_branch is not None
                self._if(condition, then_branch, else_branch)

            case ast.While(condition=condition, body=body):
                assert condition is not None and body is not None
                self._while(condition, body)

            case ast.For(init=init, condition=condition, update=update, body=body):
                # for (init; cond; update) body  ==>  init; while (cond) { body; update; }
                assert condition is not None and body is not None
                if init is not None:
                    self._stmt(init)
                self._while(condition, body, update=update)

    def _if(self, condition: ast.Expr, then_branch: ast.Stmt, else_branch: ast.Stmt | None) -> None:
        cond = self._expr(condition)

        if else_branch is None:
            end = self._label()
            self._emit(IfFalse(cond=cond, target=end))
            self._stmt(then_branch)
            self._emit(Label(name=end))
            return

        otherwise = self._label()
        end = self._label()
        self._emit(IfFalse(cond=cond, target=otherwise))
        self._stmt(then_branch)
        self._emit(Goto(target=end))
        self._emit(Label(name=otherwise))
        self._stmt(else_branch)
        self._emit(Label(name=end))

    def _while(
        self, condition: ast.Expr, body: ast.Stmt, *, update: ast.Stmt | None = None
    ) -> None:
        top = self._label()
        end = self._label()

        self._emit(Label(name=top))
        # The condition is re-evaluated each iteration, so it must be lowered inside
        # the loop rather than hoisted. Hoisting it is loop-invariant code motion's
        # job, and only when the analysis proves it safe.
        self._emit(IfFalse(cond=self._expr(condition), target=end))
        self._stmt(body)
        if update is not None:
            self._stmt(update)
        self._emit(Goto(target=top))
        self._emit(Label(name=end))

    # --- expressions ---------------------------------------------------------

    def _expr(self, node: ast.Expr) -> Operand:
        match node:
            case ast.Number(value=value):
                return Const(value)

            case ast.Identifier(name=name):
                return Var(name)

            case ast.Binary(op=op) if op in ast.LOGICAL_OPS:
                assert node.left is not None and node.right is not None
                return self._short_circuit(op, node.left, node.right)

            case ast.Binary(op=op, left=left, right=right):
                assert left is not None and right is not None
                # Left before right: evaluation order is observable when an operand traps.
                left_operand = self._expr(left)
                right_operand = self._expr(right)
                dst = self._temp()
                self._emit(
                    BinAssign(dst=dst, op=_BINOP[op], left=left_operand, right=right_operand)
                )
                return Var(dst)

            case ast.Unary(op=op, operand=operand):
                assert operand is not None
                source = self._expr(operand)
                dst = self._temp()
                self._emit(UnAssign(dst=dst, op=_UNOP[op], operand=source))
                return Var(dst)

        raise AssertionError(f"unhandled expression node: {node!r}")

    def _short_circuit(self, op: ast.BinaryOp, left: ast.Expr, right: ast.Expr) -> Operand:
        """Lower `&&` / `||` so the right operand is evaluated only when needed.

        `a && b`  ->  result = 0; if !a goto end; if !b goto end; result = 1; end:
        `a || b`  ->  result = 1; if  a goto end; if  b goto end; result = 0; end:
        """
        result = self._temp()
        end = self._label()
        is_and = op is ast.BinaryOp.AND

        self._emit(Copy(dst=result, src=Const(0 if is_and else 1)))

        left_operand = self._expr(left)
        self._emit(
            IfFalse(cond=left_operand, target=end)
            if is_and
            else IfTrue(cond=left_operand, target=end)
        )

        right_operand = self._expr(right)
        self._emit(
            IfFalse(cond=right_operand, target=end)
            if is_and
            else IfTrue(cond=right_operand, target=end)
        )

        self._emit(Copy(dst=result, src=Const(1 if is_and else 0)))
        self._emit(Label(name=end))
        return Var(result)


def lower(program: ast.Program, inputs: tuple[str, ...]) -> TacProgram:
    """Lower a resolved program to TAC. `inputs` comes from `lang.resolve`."""
    return _Lowerer().lower(program, inputs)
