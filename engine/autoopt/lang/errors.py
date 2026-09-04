"""Diagnostics shared by the lexer, parser and semantic checks.

Errors carry a source position so the web editor can underline the offending span
rather than only reporting a message.
"""

from __future__ import annotations


class MiniLangError(Exception):
    """Base class for every user-facing source error."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(message)
        self.message = message
        self.line = line
        self.column = column

    def __str__(self) -> str:
        return f"{self.message} (line {self.line}, column {self.column})"


class LexError(MiniLangError):
    """An unrecognised character or malformed literal."""


class ParseError(MiniLangError):
    """The token stream does not match the grammar."""


class SemanticError(MiniLangError):
    """Well-formed syntax that is still invalid, e.g. use of an undeclared variable."""
