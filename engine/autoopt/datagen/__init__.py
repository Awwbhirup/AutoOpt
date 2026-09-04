"""Corpus generation: the 500 programs the spec's dataset table asks for."""

from __future__ import annotations

from .generator import (
    CATEGORY_COUNTS,
    CORPUS_SIZE,
    DEFAULT_SEED,
    Category,
    GeneratedProgram,
    generate,
)

__all__ = [
    "CATEGORY_COUNTS",
    "CORPUS_SIZE",
    "DEFAULT_SEED",
    "Category",
    "GeneratedProgram",
    "generate",
]
