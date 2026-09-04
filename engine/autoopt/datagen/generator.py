"""Corpus generator.

Produces the 500 programs the spec's dataset table asks for, in the exact counts
it gives:

    arithmetic 60, nested 60, repeated 60, dead code 60,
    loops 80, conditional 80, mixed 100

Generated rather than hand written, so the corpus is reproducible from a seed and
can be regenerated whenever the language or the categories change.

Two constraints the generator has to respect. MiniLang has one flat scope, so
every variable in a program needs a unique name, which is why loop counters are
i0, i1 and so on rather than all being i. And a category has to actually contain
the opportunity it is named for: a "repeated expressions" program with no
repeated expression would quietly weaken the results for that whole cell of the
experiment, so each builder is checked against the rule engine in the tests.
"""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum


class Category(StrEnum):
    ARITHMETIC = "arithmetic"
    NESTED = "nested"
    REPEATED = "repeated"
    DEAD_CODE = "dead_code"
    LOOPS = "loops"
    CONDITIONAL = "conditional"
    MIXED = "mixed"


#: Exactly the counts in the spec's dataset table.
CATEGORY_COUNTS: dict[Category, int] = {
    Category.ARITHMETIC: 60,
    Category.NESTED: 60,
    Category.REPEATED: 60,
    Category.DEAD_CODE: 60,
    Category.LOOPS: 80,
    Category.CONDITIONAL: 80,
    Category.MIXED: 100,
}

CORPUS_SIZE = sum(CATEGORY_COUNTS.values())

DEFAULT_SEED = 20260904


@dataclass(frozen=True, slots=True)
class GeneratedProgram:
    program_id: str
    category: Category
    source: str


class _Builder:
    """Helper that keeps names unique and emits lines."""

    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.lines: list[str] = []
        self.inputs: list[str] = []
        self.vars: list[str] = []
        self._counter = 0

    def fresh(self, stem: str) -> str:
        self._counter += 1
        return f"{stem}{self._counter}"

    def add_input(self, count: int = 1) -> list[str]:
        names = [self.fresh("in") for _ in range(count)]
        for name in names:
            self.lines.append(f"input {name};")
            self.inputs.append(name)
        return names

    def declare(self, expression: str, stem: str = "v") -> str:
        name = self.fresh(stem)
        self.lines.append(f"int {name} = {expression};")
        self.vars.append(name)
        return name

    def emit(self, line: str) -> None:
        self.lines.append(line)

    def any_value(self) -> str:
        """An operand: an input, an existing variable, or a literal."""
        pool = [*self.inputs, *self.vars]
        if pool and self.rng.random() < 0.7:
            return self.rng.choice(pool)
        return str(self.rng.randint(1, 20))

    def source(self) -> str:
        return "\n".join(self.lines)


def _arithmetic(rng: random.Random) -> str:
    """Constant-heavy straight-line arithmetic. Folding and propagation."""
    b = _Builder(rng)
    b.add_input(rng.randint(0, 1))

    for _ in range(rng.randint(2, 4)):
        left, right = rng.randint(2, 30), rng.randint(2, 30)
        b.declare(f"{left} {rng.choice(['+', '-', '*'])} {right}")

    tail = b.vars[-1]
    b.declare(f"{tail} + {rng.randint(1, 10)}")
    b.emit(f"print({b.vars[-1]});")
    return b.source()


def _nested(rng: random.Random) -> str:
    """Deeply parenthesised expressions, so lowering emits many temporaries."""
    b = _Builder(rng)
    names = b.add_input(rng.randint(1, 2))
    a = names[0]
    c = names[1] if len(names) > 1 else str(rng.randint(2, 9))

    depth = rng.randint(2, 3)
    expression = f"({a} + {c})"
    for _ in range(depth):
        op = rng.choice(["+", "*", "-"])
        expression = f"({expression} {op} ({a} + {rng.randint(1, 9)}))"

    b.declare(expression)
    b.emit(f"print({b.vars[-1]});")
    return b.source()


def _repeated(rng: random.Random) -> str:
    """The same subexpression computed several times. CSE."""
    b = _Builder(rng)
    names = b.add_input(rng.randint(1, 2))
    a = names[0]
    c = names[1] if len(names) > 1 else str(rng.randint(2, 9))

    shared = f"({a} + {c})"
    repeats = rng.randint(2, 3)
    b.declare(" * ".join([shared] * repeats))
    b.declare(f"{shared} + {rng.randint(1, 9)}")
    b.emit(f"print({b.vars[-2]} + {b.vars[-1]});")
    return b.source()


def _dead_code(rng: random.Random) -> str:
    """Assignments nothing reads."""
    b = _Builder(rng)
    names = b.add_input(1)
    live = b.declare(f"{names[0]} + {rng.randint(1, 9)}")

    for _ in range(rng.randint(2, 4)):
        b.declare(str(rng.randint(10, 99)), stem="dead")

    b.emit(f"print({live});")
    return b.source()


def _loops(rng: random.Random) -> str:
    """for or while with a body, plus something invariant to hoist."""
    b = _Builder(rng)
    names = b.add_input(1)
    bound = names[0]

    total = b.declare("0", stem="acc")
    counter = b.fresh("i")
    invariant = f"({bound} + {rng.randint(1, 5)})"

    body = [
        f"    {total} = {total} + {invariant} * {rng.randint(1, 4)};",
    ]
    if rng.random() < 0.4:
        body.append(f"    {total} = {total} + {counter};")

    if rng.random() < 0.5:
        b.emit(f"for (int {counter} = 0; {counter} < {bound}; {counter} = {counter} + 1) {{")
        b.lines.extend(body)
        b.emit("}")
    else:
        b.emit(f"int {counter} = 0;")
        b.emit(f"while ({counter} < {bound}) {{")
        b.lines.extend(body)
        b.emit(f"    {counter} = {counter} + 1;")
        b.emit("}")

    b.emit(f"print({total});")
    return b.source()


def _conditional(rng: random.Random) -> str:
    """if/else, sometimes nested, with simplifiable arms."""
    b = _Builder(rng)
    names = b.add_input(rng.randint(1, 2))
    guard = names[0]
    other = names[1] if len(names) > 1 else str(rng.randint(1, 9))

    result = b.declare("0", stem="r")
    comparison = rng.choice(["<", ">", "<=", ">=", "==", "!="])

    b.emit(f"if ({guard} {comparison} {other}) {{")
    b.emit(f"    {result} = {guard} + 0;")
    if rng.random() < 0.4:
        b.emit(f"    if ({guard} > 0) {{ {result} = {result} * 1; }}")
    b.emit("} else {")
    b.emit(f"    {result} = {guard} * {rng.choice(['1', '2'])};")
    b.emit("}")
    b.emit(f"print({result});")
    return b.source()


def _mixed(rng: random.Random) -> str:
    """Several kinds of opportunity in one program."""
    b = _Builder(rng)
    names = b.add_input(1)
    value = names[0]

    folded = b.declare(f"{rng.randint(4, 20)} * {rng.randint(4, 20)}")
    identity = b.declare(f"{value} {rng.choice(['+ 0', '* 1', '- 0'])}")
    b.declare(str(rng.randint(50, 99)), stem="dead")
    doubled = b.declare(f"{value} * 2")

    shared = f"({value} + {rng.randint(1, 6)})"
    repeated = b.declare(f"{shared} * {shared}")

    if rng.random() < 0.5:
        counter = b.fresh("i")
        accumulator = b.declare("0", stem="acc")
        b.emit(f"int {counter} = 0;")
        b.emit(f"while ({counter} < {value}) {{")
        b.emit(f"    {accumulator} = {accumulator} + {shared};")
        b.emit(f"    {counter} = {counter} + 1;")
        b.emit("}")
        b.emit(f"print({folded} + {identity} + {doubled} + {repeated} + {accumulator});")
    else:
        b.emit(f"if ({value} > 0) {{")
        b.emit(f"    print({folded} + {identity} + {doubled} + {repeated});")
        b.emit("} else {")
        b.emit(f"    print({folded} - {identity});")
        b.emit("}")

    return b.source()


BUILDERS: dict[Category, Callable[[random.Random], str]] = {
    Category.ARITHMETIC: _arithmetic,
    Category.NESTED: _nested,
    Category.REPEATED: _repeated,
    Category.DEAD_CODE: _dead_code,
    Category.LOOPS: _loops,
    Category.CONDITIONAL: _conditional,
    Category.MIXED: _mixed,
}


def generate(seed: int = DEFAULT_SEED) -> list[GeneratedProgram]:
    """The whole corpus, in category order, reproducible from the seed."""
    programs: list[GeneratedProgram] = []

    for category, count in CATEGORY_COUNTS.items():
        for index in range(count):
            # Seeding per program rather than per run means one program can be
            # regenerated in isolation without replaying the whole corpus.
            rng = random.Random(f"{seed}:{category.value}:{index}")
            programs.append(
                GeneratedProgram(
                    program_id=f"{category.value}_{index:03d}",
                    category=category,
                    source=BUILDERS[category](rng),
                )
            )

    return programs
