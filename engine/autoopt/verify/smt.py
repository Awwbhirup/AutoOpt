"""SMT-backed equivalence checking with Z3.

Symbolically executes both programs over the same input variables, collecting one
terminal state per feasible path: a path condition, the sequence of printed
expressions, and whether the path trapped. Two programs are equivalent when no
assignment of inputs satisfies one terminal of each whose observable behaviour
differs.

Path conditions partition the input space, so checking every pair of terminals
covers every input. That is what makes this a proof rather than sampling.

Bounds. Loops are unrolled by symbolic execution until a step budget runs out,
and branching is capped by a state budget. Hitting either means some behaviour
was never examined, and the result is UNKNOWN_BOUNDED rather than a proof. That
distinction is kept in the decision log instead of being flattened into a pass.

Division must match interp.machine exactly. Z3's `/` on Int is Euclidean, Python's
`//` floors, and the interpreter truncates toward zero, so all three disagree on
negative operands. _z3_div and _z3_mod below reproduce the interpreter, and the
tests check them against it on the same values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

import z3

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

DEFAULT_STEP_BUDGET = 400
DEFAULT_STATE_BUDGET = 256
DEFAULT_TIMEOUT_MS = 5000


class SmtVerdict(StrEnum):
    EQUIVALENT = "equivalent"
    DIFFERENT = "different"
    BOUNDED = "bounded"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True, slots=True)
class SmtReport:
    verdict: SmtVerdict
    paths_explored: int
    queries: int
    detail: str = ""
    counterexample: dict[str, int] | None = None

    @property
    def proves_equivalence(self) -> bool:
        return self.verdict is SmtVerdict.EQUIVALENT

    @property
    def refutes(self) -> bool:
        return self.verdict is SmtVerdict.DIFFERENT


def _z3_div(left: z3.ArithRef, right: z3.ArithRef) -> z3.ArithRef:
    """Truncating division, matching interp.machine._div rather than Z3's own."""
    magnitude = z3.If(left >= 0, left, -left) / z3.If(right >= 0, right, -right)
    negative = z3.Xor(left < 0, right < 0)
    return z3.If(negative, -magnitude, magnitude)


def _z3_mod(left: z3.ArithRef, right: z3.ArithRef) -> z3.ArithRef:
    """Remainder consistent with _z3_div, so a == (a/b)*b + a%b."""
    return left - _z3_div(left, right) * right


@dataclass
class _State:
    pc: int
    env: dict[str, z3.ArithRef]
    path: z3.BoolRef
    outputs: tuple[z3.ArithRef, ...] = ()
    trapped: bool = False
    steps: int = 0


@dataclass
class _Exploration:
    terminals: list[_State] = field(default_factory=list)
    exhausted: bool = False


def _operand(operand: Operand, env: dict[str, z3.ArithRef]) -> z3.ArithRef | None:
    match operand:
        case Const(value=value):
            return z3.IntVal(value)
        case Var(name=name):
            return env.get(name)


def _explore(
    program: TacProgram,
    symbols: dict[str, z3.ArithRef],
    *,
    step_budget: int,
    state_budget: int,
) -> _Exploration:
    """Symbolically execute every feasible path, within budget."""
    result = _Exploration()
    labels = program.labels
    code = program.instructions

    start = _State(pc=0, env=dict(symbols), path=z3.BoolVal(True))
    worklist: list[_State] = [start]
    created = 1

    while worklist:
        state = worklist.pop()

        while True:
            if state.pc >= len(code):
                result.terminals.append(state)
                break
            if state.steps >= step_budget:
                result.exhausted = True
                break

            instruction = code[state.pc]
            state.steps += 1

            match instruction:
                case Label():
                    state.pc += 1

                case Copy(dst=dst, src=src):
                    value = _operand(src, state.env)
                    if value is None:
                        return _unsupported(result)
                    state.env[dst] = value
                    state.pc += 1

                case UnAssign(dst=dst, op=op, operand=operand):
                    value = _operand(operand, state.env)
                    if value is None:
                        return _unsupported(result)
                    state.env[dst] = -value if op is UnOp.NEG else z3.If(value == 0, 1, 0)
                    state.pc += 1

                case BinAssign(dst=dst, op=op, left=left, right=right):
                    lhs, rhs = _operand(left, state.env), _operand(right, state.env)
                    if lhs is None or rhs is None:
                        return _unsupported(result)

                    if op in (BinOp.DIV, BinOp.MOD):
                        # Dividing by a possibly-zero value forks: one path traps,
                        # the other continues under the assumption it is nonzero.
                        trap = _State(
                            pc=len(code),
                            env=dict(state.env),
                            path=z3.And(state.path, rhs == 0),
                            outputs=state.outputs,
                            trapped=True,
                            steps=state.steps,
                        )
                        result.terminals.append(trap)
                        state.path = z3.And(state.path, rhs != 0)
                        state.env[dst] = _z3_div(lhs, rhs) if op is BinOp.DIV else _z3_mod(lhs, rhs)
                    else:
                        state.env[dst] = _apply(op, lhs, rhs)
                    state.pc += 1

                case Print(value=value):
                    printed = _operand(value, state.env)
                    if printed is None:
                        return _unsupported(result)
                    state.outputs = (*state.outputs, printed)
                    state.pc += 1

                case Goto(target=target):
                    state.pc = labels[target]

                case IfFalse(cond=cond, target=target) | IfTrue(cond=cond, target=target):
                    tested = _operand(cond, state.env)
                    if tested is None:
                        return _unsupported(result)

                    taken = (tested == 0) if isinstance(instruction, IfFalse) else (tested != 0)

                    if created >= state_budget:
                        result.exhausted = True
                        break
                    created += 1

                    branch = _State(
                        pc=labels[target],
                        env=dict(state.env),
                        path=z3.And(state.path, taken),
                        outputs=state.outputs,
                        trapped=state.trapped,
                        steps=state.steps,
                    )
                    if _feasible(branch.path):
                        worklist.append(branch)

                    state.path = z3.And(state.path, z3.Not(taken))
                    state.pc += 1
                    if not _feasible(state.path):
                        break

    return result


def _apply(op: BinOp, lhs: z3.ArithRef, rhs: z3.ArithRef) -> z3.ArithRef:
    match op:
        case BinOp.ADD:
            return lhs + rhs
        case BinOp.SUB:
            return lhs - rhs
        case BinOp.MUL:
            return lhs * rhs
        case BinOp.LT:
            return z3.If(lhs < rhs, 1, 0)
        case BinOp.GT:
            return z3.If(lhs > rhs, 1, 0)
        case BinOp.LE:
            return z3.If(lhs <= rhs, 1, 0)
        case BinOp.GE:
            return z3.If(lhs >= rhs, 1, 0)
        case BinOp.EQ:
            return z3.If(lhs == rhs, 1, 0)
        case BinOp.NE:
            return z3.If(lhs != rhs, 1, 0)
        case _:
            raise AssertionError(f"division must be handled by the caller: {op}")


def _unsupported(result: _Exploration) -> _Exploration:
    """Reading a variable with no definition means the encoding cannot continue."""
    result.exhausted = True
    return result


def _feasible(condition: z3.BoolRef, timeout_ms: int = 1000) -> bool:
    solver = z3.Solver()
    solver.set("timeout", timeout_ms)
    solver.add(condition)
    # Treating unknown as feasible keeps exploration conservative.
    return bool(solver.check() != z3.unsat)


def _differs(left: _State, right: _State) -> z3.BoolRef | bool:
    """Condition under which two terminal states are observably different."""
    if left.trapped != right.trapped:
        return True
    if len(left.outputs) != len(right.outputs):
        return True
    if not left.outputs:
        return False
    return z3.Or(*[a != b for a, b in zip(left.outputs, right.outputs, strict=True)])


def check_equivalence(
    original: TacProgram,
    candidate: TacProgram,
    *,
    step_budget: int = DEFAULT_STEP_BUDGET,
    state_budget: int = DEFAULT_STATE_BUDGET,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
) -> SmtReport:
    """Prove or refute equivalence over the supported subset of the IR."""
    if original.inputs != candidate.inputs:
        return SmtReport(
            verdict=SmtVerdict.UNSUPPORTED,
            paths_explored=0,
            queries=0,
            detail="programs declare different inputs",
        )

    symbols: dict[str, z3.ArithRef] = {name: z3.Int(name) for name in original.inputs}

    left = _explore(original, symbols, step_budget=step_budget, state_budget=state_budget)
    right = _explore(candidate, symbols, step_budget=step_budget, state_budget=state_budget)
    explored = len(left.terminals) + len(right.terminals)

    queries = 0
    for a in left.terminals:
        for b in right.terminals:
            difference = _differs(a, b)

            solver = z3.Solver()
            solver.set("timeout", timeout_ms)
            solver.add(a.path, b.path)
            if difference is not True:
                if difference is False:
                    continue
                solver.add(difference)

            queries += 1
            outcome = solver.check()

            if outcome == z3.sat:
                model = solver.model()
                witness = {
                    name: model.eval(symbol, model_completion=True).as_long()
                    for name, symbol in symbols.items()
                }
                return SmtReport(
                    verdict=SmtVerdict.DIFFERENT,
                    paths_explored=explored,
                    queries=queries,
                    detail="found inputs where the programs observably differ",
                    counterexample=witness,
                )
            if outcome == z3.unknown:
                return SmtReport(
                    verdict=SmtVerdict.BOUNDED,
                    paths_explored=explored,
                    queries=queries,
                    detail="solver returned unknown",
                )

    if left.exhausted or right.exhausted:
        return SmtReport(
            verdict=SmtVerdict.BOUNDED,
            paths_explored=explored,
            queries=queries,
            detail="exploration hit the step or state budget, so some paths were not examined",
        )

    return SmtReport(verdict=SmtVerdict.EQUIVALENT, paths_explored=explored, queries=queries)
