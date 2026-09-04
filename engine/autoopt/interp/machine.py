"""TAC interpreter.

Used for differential testing (run both versions, compare), for the dynamic
cost measure (count executed instructions), and for the PASS/FAIL output
match the spec wants per program.

Semantics, since verification depends on them:

- Ints are unbounded, no wrapping. Matches Z3's Int sort exactly, which is
  what lets the two verification channels be compared. Machine overflow is
  therefore not modelled.
- Division truncates toward zero (C99): -7 / 2 is -3. Python's // floors to
  -4 and Z3's / on Int is euclidean, so all three disagree on negatives. The
  SMT encoder has to mirror _div/_mod rather than emit a bare /.
- Modulo follows from a == (a/b)*b + a%b, so it takes the dividend's sign.
- Zero is false, anything else is true. Comparisons give 0 or 1.
- The observable is the print trace. Final variable state is kept for
  debugging but left out of equivalence, since the optimizer is supposed to
  delete variables.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from ..ir.tac import (
    BinAssign,
    BinOp,
    Const,
    Copy,
    Goto,
    IfFalse,
    IfTrue,
    Label,
    Operand,
    Print,
    TacProgram,
    UnAssign,
    UnOp,
    Var,
)

#: Default ceiling on executed instructions. Differential testing feeds programs random
#: inputs, and a loop bound derived from an input can fail to terminate for some of them.
#: Without a ceiling the verifier would hang instead of reporting a result.
DEFAULT_STEP_LIMIT = 100_000


class Status(StrEnum):
    COMPLETED = "completed"
    TRAPPED = "trapped"
    STEP_LIMIT = "step_limit"


class TrapKind(StrEnum):
    DIVISION_BY_ZERO = "division_by_zero"
    UNDEFINED_VARIABLE = "undefined_variable"
    UNDEFINED_LABEL = "undefined_label"


@dataclass(frozen=True, slots=True)
class ExecutionResult:
    status: Status
    outputs: tuple[int, ...]
    steps: int
    variables: dict[str, int] = field(default_factory=dict)
    trap: TrapKind | None = None
    trap_detail: str | None = None

    @property
    def conclusive(self) -> bool:
        """False when the run hit the step limit.

        A step-limited run proves nothing: the program might have gone on to print
        anything at all. Differential testing must treat two step-limited runs as
        inconclusive rather than as matching, or it would pass programs it never
        actually compared.
        """
        return self.status is not Status.STEP_LIMIT

    def observably_equals(self, other: ExecutionResult) -> bool:
        """Equivalence on the observable: same status, same print trace, same trap kind.

        Returns False if either run was inconclusive.
        """
        if not (self.conclusive and other.conclusive):
            return False
        return (
            self.status == other.status
            and self.outputs == other.outputs
            and self.trap == other.trap
        )


def _div(a: int, b: int) -> int:
    """Integer division truncating toward zero (C99), not Python's flooring."""
    quotient = abs(a) // abs(b)
    return -quotient if (a < 0) != (b < 0) else quotient


def _mod(a: int, b: int) -> int:
    """Remainder consistent with `_div`, so `a == _div(a, b) * b + _mod(a, b)`."""
    return a - _div(a, b) * b


class _TrapError(Exception):
    def __init__(self, kind: TrapKind, detail: str) -> None:
        super().__init__(detail)
        self.kind = kind
        self.detail = detail


class Interpreter:
    def __init__(self, program: TacProgram, *, step_limit: int = DEFAULT_STEP_LIMIT) -> None:
        self.program = program
        self.step_limit = step_limit
        self._labels = program.labels

    def run(self, inputs: dict[str, int] | None = None) -> ExecutionResult:
        """Execute with `inputs` bound to the program's free variables.

        Any declared input not supplied defaults to 0, so a caller cannot accidentally
        make two versions of a program diverge by passing different variable sets.
        """
        supplied = inputs or {}
        env: dict[str, int] = {name: int(supplied.get(name, 0)) for name in self.program.inputs}

        outputs: list[int] = []
        code = self.program.instructions
        pc = 0
        steps = 0

        try:
            while pc < len(code):
                if steps >= self.step_limit:
                    return ExecutionResult(
                        status=Status.STEP_LIMIT,
                        outputs=tuple(outputs),
                        steps=steps,
                        variables=dict(env),
                    )

                instruction = code[pc]
                steps += 1

                match instruction:
                    case Label():
                        pc += 1

                    case Copy(dst=dst, src=src):
                        env[dst] = self._value(src, env)
                        pc += 1

                    case BinAssign(dst=dst, op=op, left=left, right=right):
                        env[dst] = self._binary(op, self._value(left, env), self._value(right, env))
                        pc += 1

                    case UnAssign(dst=dst, op=op, operand=operand):
                        value = self._value(operand, env)
                        env[dst] = -value if op is UnOp.NEG else int(value == 0)
                        pc += 1

                    case Print(value=value):
                        outputs.append(self._value(value, env))
                        pc += 1

                    case Goto(target=target):
                        pc = self._target(target)

                    case IfFalse(cond=cond, target=target):
                        pc = self._target(target) if self._value(cond, env) == 0 else pc + 1

                    case IfTrue(cond=cond, target=target):
                        pc = self._target(target) if self._value(cond, env) != 0 else pc + 1

        except _TrapError as trap:
            return ExecutionResult(
                status=Status.TRAPPED,
                outputs=tuple(outputs),
                steps=steps,
                variables=dict(env),
                trap=trap.kind,
                trap_detail=trap.detail,
            )

        return ExecutionResult(
            status=Status.COMPLETED,
            outputs=tuple(outputs),
            steps=steps,
            variables=dict(env),
        )

    # --- helpers -------------------------------------------------------------

    def _value(self, operand: Operand, env: dict[str, int]) -> int:
        match operand:
            case Const(value=value):
                return value
            case Var(name=name):
                if name not in env:
                    # The lowerer initialises every declaration, so this means a
                    # transformation deleted a definition that was still live.
                    raise _TrapError(TrapKind.UNDEFINED_VARIABLE, f"read of undefined {name!r}")
                return env[name]

    def _target(self, label: str) -> int:
        if label not in self._labels:
            raise _TrapError(TrapKind.UNDEFINED_LABEL, f"jump to undefined label {label!r}")
        return self._labels[label]

    def _binary(self, op: BinOp, left: int, right: int) -> int:
        match op:
            case BinOp.ADD:
                return left + right
            case BinOp.SUB:
                return left - right
            case BinOp.MUL:
                return left * right
            case BinOp.DIV:
                if right == 0:
                    raise _TrapError(TrapKind.DIVISION_BY_ZERO, f"{left} / 0")
                return _div(left, right)
            case BinOp.MOD:
                if right == 0:
                    raise _TrapError(TrapKind.DIVISION_BY_ZERO, f"{left} % 0")
                return _mod(left, right)
            case BinOp.LT:
                return int(left < right)
            case BinOp.GT:
                return int(left > right)
            case BinOp.LE:
                return int(left <= right)
            case BinOp.GE:
                return int(left >= right)
            case BinOp.EQ:
                return int(left == right)
            case BinOp.NE:
                return int(left != right)


def execute(
    program: TacProgram,
    inputs: dict[str, int] | None = None,
    *,
    step_limit: int = DEFAULT_STEP_LIMIT,
) -> ExecutionResult:
    return Interpreter(program, step_limit=step_limit).run(inputs)
