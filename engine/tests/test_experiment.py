from __future__ import annotations

import os
from pathlib import Path

import pytest

from autoopt.datagen import generate
from autoopt.experiment import (
    ConcurrentRunError,
    _exclusive,
    _holder_gone,
    run_experiment,
    select_named,
    select_shard,
    share_out,
)


def test_two_runs_cannot_share_one_output(tmp_path: Path) -> None:
    """Concurrent runs do not collide loudly, which is the problem.

    Rows are appended and resume reads back what is already there, so a second
    run on the same file interleaves rather than failing: every cell is done
    twice, the file gains duplicate rows, and against a rate limited API the
    day's quota buys half as much work. It cost a run before this existed.
    """
    output = tmp_path / "runs.csv"

    with _exclusive(output), pytest.raises(ConcurrentRunError), _exclusive(output):
        pass


def test_the_lock_is_released_when_a_run_fails(tmp_path: Path) -> None:
    """A crashed run must not leave the output unusable until someone notices."""
    output = tmp_path / "runs.csv"

    with pytest.raises(ValueError), _exclusive(output):
        raise ValueError("boom")

    with _exclusive(output):
        pass  # acquiring again is the assertion


def test_the_lock_names_the_holder(tmp_path: Path) -> None:
    output = tmp_path / "runs.csv"
    with _exclusive(output):
        lock = output.with_suffix(output.suffix + ".lock")
        assert lock.exists()
        assert lock.read_text(encoding="utf-8").strip().isdigit()
    assert not lock.exists()


def test_a_finished_run_leaves_no_lock_behind(tmp_path: Path) -> None:
    output = tmp_path / "runs.csv"
    run_experiment(output, methods=("greedy",), limit=1, prove_final=False)

    assert output.exists()
    assert not output.with_suffix(output.suffix + ".lock").exists()


def test_a_lock_from_a_dead_process_is_taken_over(tmp_path: Path) -> None:
    """A killed run must not block every later one for good.

    This job is restarted unattended for days, so a lock that outlives its
    owner is the difference between resuming and never running again. It cost
    a full day of quota before the lock learned to check.
    """
    output = tmp_path / "runs.csv"
    lock = output.with_suffix(output.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    # A pid that cannot be running: the kernel would have to have handed out a
    # number above its own maximum. Also wider than the C int os.kill parses
    # into on Linux, which is a second way for this to not be a live holder and
    # was for ten commits a way to fail on one platform and pass on the other.
    lock.write_text("4294967294", encoding="utf-8")

    progress = run_experiment(output, methods=("greedy",), limit=1, prove_final=False)

    # One program per category, so the count is the number of categories. What
    # matters is that it ran at all rather than refusing.
    assert progress.completed == progress.total > 0
    assert not lock.exists()


def test_a_lock_naming_a_plausible_dead_pid_is_taken_over(tmp_path: Path) -> None:
    """The ordinary stale lock, inside the range a pid can actually take.

    Separate from the out-of-range one because they fail differently: this asks
    the OS and is told no such process, that one cannot be asked at all.
    """
    output = tmp_path / "runs.csv"
    lock = output.with_suffix(output.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    # Claimed, never released, and long gone: the pid is in range but there is
    # no such process on either platform.
    lock.write_text("4194303", encoding="utf-8")

    progress = run_experiment(output, methods=("greedy",), limit=1, prove_final=False)
    assert progress.completed == progress.total > 0
    assert not lock.exists()


def test_a_lock_held_by_a_live_process_is_respected(tmp_path: Path) -> None:
    """The case the lock exists for. Two runs sharing an output interleave."""
    output = tmp_path / "runs.csv"
    lock = output.with_suffix(output.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text(str(os.getpid()), encoding="utf-8")

    with pytest.raises(ConcurrentRunError):
        run_experiment(output, methods=("greedy",), limit=1, prove_final=False)

    assert lock.exists(), "a live holder's lock must survive the refusal"


def test_a_pid_too_wide_to_be_one_is_gone_on_posix(monkeypatch: pytest.MonkeyPatch) -> None:
    """The posix branch, exercised from whichever platform is running this.

    os.kill parses its pid into a C int there, so a lock naming a number wider
    than one raises instead of reporting no such process. Only Linux reached
    that line, so the suite passed here and failed in CI for ten commits with
    nothing in the local run to show for it. Forcing the branch is what stops
    that happening again.
    """
    monkeypatch.setattr(os, "name", "posix")

    def kill(pid: int, signal: int) -> None:
        if pid > 2**31 - 1:
            raise OverflowError("Python int too large to convert to C int")
        raise ProcessLookupError

    monkeypatch.setattr(os, "kill", kill)

    assert _holder_gone("4294967294"), "a number that cannot be a pid holds nothing"
    assert _holder_gone("4194303"), "no such process"
    assert _holder_gone("not a pid")

    monkeypatch.setattr(os, "kill", lambda pid, signal: None)
    assert not _holder_gone("4194303"), "a live holder keeps its lock"


def test_an_unreadable_lock_is_not_permanent(tmp_path: Path) -> None:
    """A lock naming nobody cannot be waited on, so it is taken over."""
    output = tmp_path / "runs.csv"
    lock = output.with_suffix(output.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text("not a pid", encoding="utf-8")

    progress = run_experiment(output, methods=("greedy",), limit=1, prove_final=False)
    assert progress.completed == progress.total > 0


def shard_programs(shards: int, shard: int) -> list[str]:
    """Which program ids a worker would take, asked of the code that decides.

    Reimplementing the split here would only prove this file's arithmetic: an
    earlier version did exactly that and passed against a deliberately broken
    engine.
    """
    return [p.program_id for p in select_shard(generate(), shard, shards)]


def test_shards_partition_the_corpus_exactly() -> None:
    """No program run twice, none missed.

    An overlap spends quota twice for one row and leaves the merge with a
    duplicate; a gap leaves a hole nothing would report, because every worker
    finishes cleanly having done its own slice.
    """
    everything = [p.program_id for p in generate()]
    for shards in (2, 3, 6, 7):
        slices = [shard_programs(shards, index) for index in range(shards)]
        combined = [pid for slice_ in slices for pid in slice_]

        assert sorted(combined) == sorted(everything), f"{shards} shards lost or repeated work"
        assert len(set(combined)) == len(combined)


def test_every_shard_sees_every_category() -> None:
    """Strided, not blocked.

    A contiguous split would hand one worker all the loop programs, so it would
    still be running long after the others finished and a partial result would
    be a biased sample rather than a smaller one.
    """
    for index in range(6):
        taken = set(shard_programs(6, index))
        categories = {pid.rsplit("_", 1)[0] for pid in taken}
        assert len(categories) == 7, f"shard {index} only covers {categories}"


def test_a_shard_outside_the_run_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="shard"):
        run_experiment(tmp_path / "r.csv", methods=("greedy",), limit=1, shard=6, shards=6)


def test_one_shard_of_one_is_the_whole_corpus() -> None:
    assert shard_programs(1, 0) == [p.program_id for p in generate()]


def test_sharing_out_loses_nothing_and_repeats_nothing() -> None:
    """Every pending program goes to exactly one worker.

    The same requirement the shards have, and for the same reasons: an overlap
    spends quota twice for one row, a gap leaves a hole nothing reports.
    """
    pending = [p.program_id for p in generate()][:137]
    for workers in (1, 2, 5, 9):
        plan = share_out(pending, workers)
        combined = [pid for assigned in plan.values() for pid in assigned]
        assert sorted(combined) == sorted(pending), f"{workers} workers lost or repeated work"
        assert len(set(combined)) == len(combined)


def test_sharing_out_is_level() -> None:
    """No worker gets more than one program more than any other.

    The point of recomputing the split each batch is that the run goes at the
    speed of every key rather than the speed of the slowest slice, which only
    holds if the shares are the same size.
    """
    pending = [p.program_id for p in generate()][:137]
    sizes = [len(assigned) for assigned in share_out(pending, 9).values()]
    assert max(sizes) - min(sizes) <= 1


def test_the_last_programs_go_to_separate_workers() -> None:
    """Eight programs left and nine keys means eight workers, not two.

    This is the case that made the change worth making: the fixed slices left
    the last of the corpus with two workers while seven sat idle.
    """
    plan = share_out([p.program_id for p in generate()][:8], 9)
    assert sum(1 for assigned in plan.values() if assigned) == 8
    assert all(len(assigned) <= 1 for assigned in plan.values())


def test_every_worker_is_told_even_when_it_has_nothing() -> None:
    """An absent entry and an empty one read the same to a caller that indexes."""
    plan = share_out([], 9)
    assert sorted(plan) == list(range(9))
    assert all(assigned == [] for assigned in plan.values())


def test_naming_programs_selects_exactly_those() -> None:
    wanted = ["loops_003", "arithmetic_000", "mixed_010"]
    taken = [p.program_id for p in select_named(generate(), wanted)]
    # Corpus order, not the order asked for: the run order is the corpus's.
    assert taken == [p.program_id for p in generate() if p.program_id in set(wanted)]
    assert sorted(taken) == sorted(wanted)


def test_a_program_that_does_not_exist_is_an_error() -> None:
    """Rather than a shorter run that looks like it finished.

    The lists are generated, so a name matching nothing means the generator and
    whatever wrote the list disagree about the corpus.
    """
    with pytest.raises(ValueError, match="nonsense_999"):
        select_named(generate(), ["arithmetic_000", "nonsense_999"])
