"""MiniLang: the source language AutoOpt optimizes.

from autoopt.lang import compile_source
program, info = compile_source("input n; int x = n + 0; print(x);")
"""

from __future__ import annotations

from . import ast
from .errors import LexError, MiniLangError, ParseError, SemanticError
from .lexer import tokenize
from .parser import parse
from .resolve import ProgramInfo, resolve
from .tokens import Token, TokenType

__all__ = [
    "LexError",
    "MiniLangError",
    "ParseError",
    "ProgramInfo",
    "SemanticError",
    "Token",
    "TokenType",
    "ast",
    "compile_source",
    "parse",
    "resolve",
    "tokenize",
]


def compile_source(source: str) -> tuple[ast.Program, ProgramInfo]:
    """Tokenize, parse and resolve. Raises MiniLangError on any invalid source."""
    program = parse(tokenize(source))
    return program, resolve(program)
