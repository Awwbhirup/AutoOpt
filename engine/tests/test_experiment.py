from __future__ import annotations

from pathlib import Path

import pytest

from autoopt.experiment import ConcurrentRunError, _exclusive, run_experiment


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
