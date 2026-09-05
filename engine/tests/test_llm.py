"""The LLM specialist and the strategy that drives it.

No live calls. A scripted provider stands in for the model so the loop's
behaviour is pinned exactly: what it feeds back, when it asks again, and when it
gives up.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from autoopt.cost import CostModel
from autoopt.ir import TacProgram, source_to_tac
from autoopt.llm.provider import Provider, ProviderChain, ProviderExhaustedError
from autoopt.llm.specialist import LlmSpecialist, Validity
from autoopt.llm.strategy import LlmStrategy
from autoopt.search.base import Environment, SearchStats
from autoopt.verify import FAST, verify

SOURCE = """
input x;
int a = 2 + 3;
int b = x + a;
int c = x + a;
int d = c * 1;
print(b);
print(d);
"""


class ScriptedProvider(Provider):
    """Returns queued replies in order, recording every prompt it was given."""

    name = "scripted"

    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if not self.replies:
            raise RuntimeError("scripted provider ran out of replies")
        return self.replies.pop(0)


class FailingProvider(Provider):
    name = "failing"

    def complete(self, prompt: str) -> str:
        del prompt
        raise RuntimeError("quota exhausted")


def reply(kind: str, site: int) -> str:
    return json.dumps({"optimization_type": kind, "site": site, "rationale": "test"})


def specialist_for(replies: list[str], tmp_path: Path) -> tuple[LlmSpecialist, ScriptedProvider]:
    provider = ScriptedProvider(replies)
    return LlmSpecialist(ProviderChain([provider], cache_dir=tmp_path)), provider


def rejections_in(prompt: str) -> str:
    """Just the ruled-out section.

    Searching the whole prompt for a transformation name matches the catalog,
    which lists all eight of them every time.
    """
    marker = "Pick something else:"
    if marker not in prompt:
        return ""
    return prompt.split(marker, 1)[1].split("Reply with JSON only:", 1)[0]


def environment(program: TacProgram) -> Environment:
    return Environment(
        CostModel.for_program(program),
        lambda before, after: verify(before, after, use_smt=False, profile=FAST),
        SearchStats(),
    )


# --- the prompt carries the rejections ----------------------------------------


def test_rejections_reach_the_prompt(tmp_path: Path) -> None:
    specialist, provider = specialist_for([reply("constant_folding", 0)], tmp_path)
    program = source_to_tac(SOURCE)

    specialist.propose(
        program, ruled_out=("dead_code_elimination at line 4: not applicable there",)
    )

    assert "dead_code_elimination at line 4" in rejections_in(provider.prompts[0])


def test_an_unchanged_prompt_would_be_the_same_question(tmp_path: Path) -> None:
    """Why the rejections have to go in the prompt at all.

    Temperature is zero and answers are cached by prompt hash, so asking again
    without changing anything returns the identical reply. A retry loop built on
    that would spin until its budget ran out.
    """
    specialist, provider = specialist_for([reply("constant_folding", 0)], tmp_path)
    program = source_to_tac(SOURCE)

    first = specialist.propose(program)
    second = specialist.propose(program)

    assert len(provider.prompts) == 1, "the second ask was served from cache, not re-sent"
    assert first.named_type == second.named_type
    assert second.provider == "scripted"


def test_a_ruled_out_prompt_is_cached_separately(tmp_path: Path) -> None:
    specialist, provider = specialist_for(
        [reply("constant_folding", 0), reply("dead_code_elimination", 3)], tmp_path
    )
    program = source_to_tac(SOURCE)

    specialist.propose(program)
    specialist.propose(program, ruled_out=("constant_folding at line 0: does not lower cost",))

    assert len(provider.prompts) == 2, "the changed prompt should have been a new call"


# --- the loop keeps going --------------------------------------------------


def test_an_unusable_proposal_does_not_end_the_run(tmp_path: Path) -> None:
    """The behaviour this whole change exists for.

    A first answer naming something that is not there used to stop the program,
    so the method measured first-guess accuracy rather than whether the model can
    drive a sequence.
    """
    specialist, provider = specialist_for(
        [
            reply("loop_invariant_code_motion", 1),  # not available there
            reply("constant_folding", 0),  # this one works
            json.dumps({"optimization_type": "none", "site": -1, "rationale": "done"}),
        ],
        tmp_path,
    )
    strategy = LlmStrategy(specialist)

    program = source_to_tac(SOURCE)
    result = strategy.search(program, environment(program), max_iterations=8)

    assert len(provider.prompts) >= 2, "it stopped at the first unusable answer"
    assert result.applied, "nothing was applied even though a valid proposal followed"
    assert "not applicable there" in rejections_in(provider.prompts[1])


def test_declining_still_stops_the_run(tmp_path: Path) -> None:
    """ "Nothing to do here" is an answer, not a failure, so it is not argued with."""
    specialist, provider = specialist_for(
        [json.dumps({"optimization_type": "none", "site": -1, "rationale": "clean"})], tmp_path
    )
    strategy = LlmStrategy(specialist)

    program = source_to_tac(SOURCE)
    result = strategy.search(program, environment(program), max_iterations=8)

    assert len(provider.prompts) == 1
    assert result.applied == []


def test_it_gives_up_after_repeated_failures(tmp_path: Path) -> None:
    """A program with nothing left should not burn the whole call budget."""
    specialist, provider = specialist_for([reply("nonsense_transformation", 0)] * 12, tmp_path)
    strategy = LlmStrategy(specialist, max_calls=12, max_consecutive_failures=3)

    program = source_to_tac(SOURCE)
    strategy.search(program, environment(program), max_iterations=8)

    assert len(provider.prompts) == 3, "stopped later than max_consecutive_failures"


def test_rejections_are_dropped_once_the_program_changes(tmp_path: Path) -> None:
    """Line numbers shift when a transformation lands.

    Carrying the old list over would rule out transformations at sites the model
    was never actually offered.
    """
    specialist, provider = specialist_for(
        [
            reply("loop_invariant_code_motion", 1),  # rejected, gets fed back
            reply("constant_folding", 0),  # accepted, list should clear
            reply("common_subexpression_elimination", 99),  # rejected again
            json.dumps({"optimization_type": "none", "site": -1, "rationale": "done"}),
        ],
        tmp_path,
    )
    strategy = LlmStrategy(specialist)

    program = source_to_tac(SOURCE)
    strategy.search(program, environment(program), max_iterations=8)

    assert "not applicable there" in rejections_in(provider.prompts[1])
    assert "loop_invariant_code_motion" not in rejections_in(provider.prompts[3]), (
        "a rejection from before the program changed was carried over"
    )


def test_unknown_type_is_named_back_to_the_model(tmp_path: Path) -> None:
    specialist, provider = specialist_for(
        [reply("unroll_everything", 0), reply("constant_folding", 0)], tmp_path
    )
    strategy = LlmStrategy(specialist)

    program = source_to_tac(SOURCE)
    strategy.search(program, environment(program), max_iterations=8)

    assert "unroll_everything" in rejections_in(provider.prompts[1])
    assert "not in the allowed list" in rejections_in(provider.prompts[1])


def test_validity_is_still_counted_per_call(tmp_path: Path) -> None:
    """Retrying must not quietly inflate the reported LLM Validity Rate."""
    specialist, _ = specialist_for(
        [reply("unroll_everything", 0), reply("constant_folding", 0)], tmp_path
    )
    strategy = LlmStrategy(specialist)

    program = source_to_tac(SOURCE)
    strategy.search(program, environment(program), max_iterations=8)

    stats = specialist.stats
    assert stats.calls == sum(
        stats.by_validity[v] for v in stats.by_validity if v != "not_available"
    )
    assert stats.by_validity[Validity.UNKNOWN_TYPE.value] == 1


# --- one run, one model -------------------------------------------------------


def test_fallback_off_stops_instead_of_switching_model(tmp_path: Path) -> None:
    """A dataset built from two models cannot be reported as one method."""
    second = ScriptedProvider([reply("constant_folding", 0)])
    chain = ProviderChain([FailingProvider(), second], cache_dir=tmp_path, allow_fallback=False)

    with pytest.raises(ProviderExhaustedError):
        chain.complete("anything")

    assert second.prompts == [], "it fell through to the second provider anyway"


def test_fallback_on_uses_the_next_provider(tmp_path: Path) -> None:
    second = ScriptedProvider([reply("constant_folding", 0)])
    chain = ProviderChain([FailingProvider(), second], cache_dir=tmp_path, allow_fallback=True)

    completion = chain.complete("anything")

    assert completion.provider == "scripted"
    assert chain.failures["failing"] == 1


def test_cached_answers_still_serve_with_fallback_off(tmp_path: Path) -> None:
    """Resuming a stopped run must not need the provider that ran out."""
    working = ScriptedProvider([reply("constant_folding", 0)])
    ProviderChain([working], cache_dir=tmp_path).complete("prompt")

    stopped = ProviderChain([FailingProvider()], cache_dir=tmp_path, allow_fallback=False)
    assert stopped.complete("prompt").cached
