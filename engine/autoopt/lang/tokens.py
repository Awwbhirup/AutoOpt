"""Token definitions for MiniLang."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum, auto


class TokenType(StrEnum):
    # literals and names
    NUMBER = auto()
    IDENT = auto()

    # keywords
    INT = auto()
    INPUT = auto()
    IF = auto()
    ELSE = auto()
    WHILE = auto()
    FOR = auto()
    PRINT = auto()

    # arithmetic
    PLUS = auto()
    MINUS = auto()
    STAR = auto()
    SLASH = auto()
    PERCENT = auto()

    # comparison
    LT = auto()
    GT = auto()
    LE = auto()
    GE = auto()
    EQ = auto()
    NE = auto()

    # logical
    AND = auto()
    OR = auto()
    NOT = auto()

    # punctuation
    ASSIGN = auto()
    SEMICOLON = auto()
    LPAREN = auto()
    RPAREN = auto()
    LBRACE = auto()
    RBRACE = auto()

    EOF = auto()


KEYWORDS: dict[str, TokenType] = {
    "int": TokenType.INT,
    "input": TokenType.INPUT,
    "if": TokenType.IF,
    "else": TokenType.ELSE,
    "while": TokenType.WHILE,
    "for": TokenType.FOR,
    "print": TokenType.PRINT,
}


@dataclass(frozen=True, slots=True)
class Token:
    type: TokenType
    lexeme: str
    line: int
    column: int
    value: int | None = None

    def __str__(self) -> str:
        return f"{self.type.value}({self.lexeme!r}) at {self.line}:{self.column}"
