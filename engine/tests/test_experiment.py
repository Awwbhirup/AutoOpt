from __future__ import annotations

import os
from pathlib import Path

import pytest

from autoopt.datagen import generate
from autoopt.experiment import (
    ConcurrentRunError,
    _exclusive,
    run_experiment,
    select_shard,
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
    # number above its own maximum.
    lock.write_text("4294967294", encoding="utf-8")

    progress = run_experiment(output, methods=("greedy",), limit=1, prove_final=False)

    # One program per category, so the count is the number of categories. What
    # matters is that it ran at all rather than refusing.
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
