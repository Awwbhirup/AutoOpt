"""Mutation study: how much of a broken transformation each channel catches.

The run data cannot measure this. Every transformation in the catalogue is
correct, so no proposal in the grid was ever refuted, and a detection rate
computed from the runs would divide by zero faults and read as zero.

So faults are injected deliberately. A mutant is the original program with one
edit that changes what it computes: a different operator, a shifted constant,
swapped operands, an inverted branch, a dropped print. Each channel then gets the
same question the agent asks it during a run, and the answer is scored.

Ground truth comes from a third route, not from either channel: both programs are
run on a sweep far denser than either production setting uses, and the mutant
counts as genuinely different only if some input in that sweep separates them.
Mutants the sweep cannot separate are dropped rather than counted as misses,
because an edit that changes no observable output is not a fault. That makes the
denominator faults-that-exist, which is what a detection rate needs.

The result feeds Module 7: two channels, either one sufficient, so
R_detect = 1 - (1 - R_diff)(1 - R_smt).
"""

from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ..datagen import generate
from ..ir import source_to_tac
from ..ir.tac import (
    BinAssign,
    BinOp,
    Const,
    Copy,
    IfFalse,
    IfTrue,
    Instruction,
    Print,
    TacProgram,
    UnAssign,
)
from .differential import DEFAULT_RANDOM_RANGE, EDGE_VALUES, FAST, Profile, compare
from .smt import check_equivalence

#: Denser than either production profile in every dimension: its edge values are
#: a superset of both, and it runs more random cases over a wider range with a
#: higher step limit. Used only to decide whether a mutant is genuinely
#: different, never to score a channel. A ground truth no stronger than the
#: channel under test would drop exactly the mutants that channel missed, and the
#: measured detection rate would come out at 100% by construction.
ORACLE = Profile(
    edge_values=(
        *EDGE_VALUES,
        3,
        -3,
        4,
        -4,
        5,
        -5,
        7,
        -7,
        8,
        -8,
        11,
        -11,
        12,
        16,
        -16,
    ),
    random_cases=256,
    value_range=DEFAULT_RANDOM_RANGE,
    step_limit=200_000,
)

#: Operator substitutions that change the result. Kept within a kind, so an
#: arithmetic operator becomes another arithmetic one and a comparison another
#: comparison, which keeps the mutant well typed.
_ARITHMETIC = (BinOp.ADD, BinOp.SUB, BinOp.MUL, BinOp.DIV, BinOp.MOD)
_COMPARISON = (BinOp.LT, BinOp.LE, BinOp.GT, BinOp.GE, BinOp.EQ, BinOp.NE)

#: The only operators where swapping operands changes anything.
_ORDER_SENSITIVE = frozenset(
    {BinOp.SUB, BinOp.DIV, BinOp.MOD, BinOp.LT, BinOp.LE, BinOp.GT, BinOp.GE}
)


@dataclass(frozen=True, slots=True)
class Mutant:
    """One program with one injected fault."""

    program_id: str
    operator: str
    index: int
    program: TacProgram
    description: str


@dataclass
class ChannelScore:
    """How one channel did against the faults that exist."""

    name: str
    detected: int = 0
    missed: int = 0

    @property
    def total(self) -> int:
        return self.detected + self.missed

    @property
    def detection_rate(self) -> float:
        return self.detected / self.total if self.total else 0.0


@dataclass
class MutationStudy:
    """The whole study, in the shape Module 7 reads."""

    programs: int = 0
    mutants_generated: int = 0
    mutants_equivalent: int = 0
    detected_by_either: int = 0
    false_positives: int = 0
    differential: ChannelScore = field(default_factory=lambda: ChannelScore("differential testing"))
    smt: ChannelScore = field(default_factory=lambda: ChannelScore("Z3 equivalence"))
    by_operator: dict[str, dict[str, int]] = field(default_factory=dict)

    @property
    def faults(self) -> int:
        return self.differential.total

    @property
    def detection_either(self) -> float:
        """Share caught by at least one channel. Measured, not derived."""
        return self.detected_by_either / self.faults if self.faults else 0.0

    def to_dict(self) -> dict[str, object]:
        return {
            "programs": self.programs,
            "mutants_generated": self.mutants_generated,
            "mutants_equivalent_under_oracle": self.mutants_equivalent,
            "faults": self.faults,
            "differential": asdict(self.differential) | {"rate": self.differential.detection_rate},
            "smt": asdict(self.smt) | {"rate": self.smt.detection_rate},
            "detected_by_either": self.detected_by_either,
            "detection_either_rate": self.detection_either,
            "false_positives_on_unmutated": self.false_positives,
            "by_operator": self.by_operator,
        }


def _other(rng: random.Random, options: tuple[BinOp, ...], current: BinOp) -> BinOp:
    return rng.choice([option for option in options if option is not current])


def _mutate_instruction(
    instruction: Instruction, rng: random.Random
) -> tuple[Instruction, str] | None:
    """One edit to one instruction, or None if this instruction has no useful edit."""
    if isinstance(instruction, BinAssign):
        choices: list[str] = ["operator"]
        if instruction.op in _ORDER_SENSITIVE:
            choices.append("operand_order")
        if isinstance(instruction.left, Const) or isinstance(instruction.right, Const):
            choices.append("constant")

        choice = rng.choice(choices)
        if choice == "operator":
            family = _ARITHMETIC if instruction.op in _ARITHMETIC else _COMPARISON
            if instruction.op not in family:
                return None
            replacement = _other(rng, family, instruction.op)
            return BinAssign(
                dst=instruction.dst,
                op=replacement,
                left=instruction.left,
                right=instruction.right,
            ), f"{instruction.op.value} -> {replacement.value}"

        if choice == "operand_order":
            return BinAssign(
                dst=instruction.dst,
                op=instruction.op,
                left=instruction.right,
                right=instruction.left,
            ), f"swapped operands of {instruction.op.value}"

        left_is_const = isinstance(instruction.left, Const)
        original = instruction.left if left_is_const else instruction.right
        assert isinstance(original, Const)
        shifted = Const(original.value + rng.choice((1, -1, 2)))
        return BinAssign(
            dst=instruction.dst,
            op=instruction.op,
            left=shifted if left_is_const else instruction.left,
            right=instruction.right if left_is_const else shifted,
        ), f"constant {original.value} -> {shifted.value}"

    if isinstance(instruction, Copy) and isinstance(instruction.src, Const):
        shifted = Const(instruction.src.value + rng.choice((1, -1)))
        return (
            Copy(dst=instruction.dst, src=shifted),
            f"constant {instruction.src.value} -> {shifted.value}",
        )

    if isinstance(instruction, IfFalse):
        return IfTrue(cond=instruction.cond, target=instruction.target), "inverted branch"

    if isinstance(instruction, IfTrue):
        return IfFalse(cond=instruction.cond, target=instruction.target), "inverted branch"

    if isinstance(instruction, UnAssign):
        return (
            Copy(dst=instruction.dst, src=instruction.operand),
            f"dropped unary {instruction.op.value}",
        )

    return None


def _operator_name(description: str) -> str:
    if description.startswith("constant"):
        return "constant shift"
    if description.startswith("swapped"):
        return "operand order"
    if description.startswith("inverted"):
        return "inverted branch"
    if description.startswith("dropped"):
        return "dropped operator"
    return "operator substitution"


def mutants_for(
    program_id: str, program: TacProgram, *, rng: random.Random, count: int
) -> list[Mutant]:
    """Up to `count` single-edit mutants of one program.

    A print is dropped as well when the program has more than one, which is the
    only edit here that removes an observable rather than changing it.
    """
    mutants: list[Mutant] = []

    prints = [index for index, ins in enumerate(program.instructions) if isinstance(ins, Print)]
    if len(prints) > 1:
        dropped = rng.choice(prints)
        mutants.append(
            Mutant(
                program_id=program_id,
                operator="dropped print",
                index=dropped,
                program=TacProgram(
                    inputs=program.inputs,
                    instructions=tuple(
                        ins for index, ins in enumerate(program.instructions) if index != dropped
                    ),
                ),
                description="removed one print",
            )
        )

    candidates = list(enumerate(program.instructions))
    rng.shuffle(candidates)

    for index, instruction in candidates:
        if len(mutants) >= count:
            break
        edit = _mutate_instruction(instruction, rng)
        if edit is None:
            continue
        edited, description = edit
        instructions = list(program.instructions)
        instructions[index] = edited
        mutants.append(
            Mutant(
                program_id=program_id,
                operator=_operator_name(description),
                index=index,
                program=TacProgram(inputs=program.inputs, instructions=tuple(instructions)),
                description=description,
            )
        )

    return mutants[:count]


def run_study(
    *,
    programs: int = 60,
    per_program: int = 4,
    seed: int = 0,
    smt_timeout_ms: int = 5000,
    profile: Profile = FAST,
) -> MutationStudy:
    """Inject faults, ask each channel, score the answers.

    `profile` is the differential setting being scored. FAST is what the agent
    uses inside the search, so that is what the reported reliability describes.
    """
    rng = random.Random(seed)
    corpus = generate()
    rng.shuffle(corpus)
    study = MutationStudy()

    for entry in corpus[:programs]:
        original = source_to_tac(entry.source)
        study.programs += 1

        # A channel that refutes a program against itself would make every other
        # number meaningless, so it is checked rather than assumed.
        if compare(original, original, seed=seed, profile=profile).refuted:
            study.false_positives += 1

        for mutant in mutants_for(entry.program_id, original, rng=rng, count=per_program):
            study.mutants_generated += 1

            if not compare(original, mutant.program, seed=seed + 1, profile=ORACLE).refuted:
                # No input in the sweep separates them, so there is no fault here
                # to detect and scoring a channel against it would be unfair.
                study.mutants_equivalent += 1
                continue

            caught_differential = compare(
                original, mutant.program, seed=seed, profile=profile
            ).refuted
            caught_smt = check_equivalence(
                original, mutant.program, timeout_ms=smt_timeout_ms
            ).refutes

            for channel, caught in (
                (study.differential, caught_differential),
                (study.smt, caught_smt),
            ):
                if caught:
                    channel.detected += 1
                else:
                    channel.missed += 1

            if caught_differential or caught_smt:
                study.detected_by_either += 1

            bucket = study.by_operator.setdefault(
                mutant.operator, {"faults": 0, "differential": 0, "smt": 0, "either": 0}
            )
            bucket["faults"] += 1
            bucket["differential"] += int(caught_differential)
            bucket["smt"] += int(caught_smt)
            bucket["either"] += int(caught_differential or caught_smt)

    return study


def write(study: MutationStudy, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(study.to_dict(), indent=2), encoding="utf-8")


def load(path: Path) -> dict[str, object] | None:
    """The stored study, or None when it has not been run."""
    if not path.exists():
        return None
    loaded: dict[str, object] = json.loads(path.read_text(encoding="utf-8"))
    return loaded


__all__ = [
    "ORACLE",
    "ChannelScore",
    "Mutant",
    "MutationStudy",
    "load",
    "mutants_for",
    "run_study",
    "write",
]
