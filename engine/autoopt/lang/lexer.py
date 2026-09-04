"""Hand-written scanner for MiniLang.

Single pass, one character of lookahead. Skips whitespace and both comment forms
(`// line` and `/* block */`).
"""

from __future__ import annotations

from .errors import LexError
from .tokens import KEYWORDS, Token, TokenType

# Two-character operators are matched before their single-character prefixes.
_TWO_CHAR: dict[str, TokenType] = {
    "<=": TokenType.LE,
    ">=": TokenType.GE,
    "==": TokenType.EQ,
    "!=": TokenType.NE,
    "&&": TokenType.AND,
    "||": TokenType.OR,
}

_ONE_CHAR: dict[str, TokenType] = {
    "+": TokenType.PLUS,
    "-": TokenType.MINUS,
    "*": TokenType.STAR,
    "/": TokenType.SLASH,
    "%": TokenType.PERCENT,
    "<": TokenType.LT,
    ">": TokenType.GT,
    "!": TokenType.NOT,
    "=": TokenType.ASSIGN,
    ";": TokenType.SEMICOLON,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
}


class Lexer:
    def __init__(self, source: str) -> None:
        self._src = source
        self._pos = 0
        self._line = 1
        self._col = 1

    # --- character helpers ---------------------------------------------------

    def _at_end(self) -> bool:
        return self._pos >= len(self._src)

    def _peek(self, offset: int = 0) -> str:
        index = self._pos + offset
        return self._src[index] if index < len(self._src) else ""

    def _advance(self) -> str:
        char = self._src[self._pos]
        self._pos += 1
        if char == "\n":
            self._line += 1
            self._col = 1
        else:
            self._col += 1
        return char

    # --- skipping ------------------------------------------------------------

    def _skip_trivia(self) -> None:
        while not self._at_end():
            char = self._peek()
            if char in " \t\r\n":
                self._advance()
            elif char == "/" and self._peek(1) == "/":
                while not self._at_end() and self._peek() != "\n":
                    self._advance()
            elif char == "/" and self._peek(1) == "*":
                start_line, start_col = self._line, self._col
                self._advance()
                self._advance()
                while not (self._peek() == "*" and self._peek(1) == "/"):
                    if self._at_end():
                        raise LexError("unterminated block comment", start_line, start_col)
                    self._advance()
                self._advance()
                self._advance()
            else:
                return

    # --- token constructors --------------------------------------------------

    def _number(self) -> Token:
        line, col = self._line, self._col
        digits = ""
        while not self._at_end() and self._peek().isdigit():
            digits += self._advance()
        # Reject `12abc` rather than silently producing NUMBER followed by IDENT.
        if not self._at_end() and (self._peek().isalpha() or self._peek() == "_"):
            raise LexError(f"invalid number literal {digits + self._peek()!r}", line, col)
        return Token(TokenType.NUMBER, digits, line, col, value=int(digits))

    def _identifier(self) -> Token:
        line, col = self._line, self._col
        name = ""
        while not self._at_end() and (self._peek().isalnum() or self._peek() == "_"):
            name += self._advance()
        return Token(KEYWORDS.get(name, TokenType.IDENT), name, line, col)

    # --- driver --------------------------------------------------------------

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []

        while True:
            self._skip_trivia()
            if self._at_end():
                tokens.append(Token(TokenType.EOF, "", self._line, self._col))
                return tokens

            char = self._peek()

            if char.isdigit():
                tokens.append(self._number())
                continue

            if char.isalpha() or char == "_":
                tokens.append(self._identifier())
                continue

            line, col = self._line, self._col
            pair = char + self._peek(1)
            if pair in _TWO_CHAR:
                self._advance()
                self._advance()
                tokens.append(Token(_TWO_CHAR[pair], pair, line, col))
                continue

            if char in _ONE_CHAR:
                self._advance()
                tokens.append(Token(_ONE_CHAR[char], char, line, col))
                continue

            # `&` or `|` alone is far more likely a typo for `&&` / `||` than anything else.
            if char in "&|":
                raise LexError(f"unexpected {char!r}; did you mean {char * 2!r}?", line, col)

            raise LexError(f"unexpected character {char!r}", line, col)


def tokenize(source: str) -> list[Token]:
    return Lexer(source).tokenize()
