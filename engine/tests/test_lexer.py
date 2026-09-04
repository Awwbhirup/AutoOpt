from __future__ import annotations

import pytest

from autoopt.lang import LexError, TokenType, tokenize


def types(source: str) -> list[TokenType]:
    return [token.type for token in tokenize(source)]


def test_tokenizes_a_declaration() -> None:
    assert types("int x = 5;") == [
        TokenType.INT,
        TokenType.IDENT,
        TokenType.ASSIGN,
        TokenType.NUMBER,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_number_literals_carry_their_value() -> None:
    tokens = tokenize("42")
    assert tokens[0].value == 42


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("<=", TokenType.LE),
        (">=", TokenType.GE),
        ("==", TokenType.EQ),
        ("!=", TokenType.NE),
        ("&&", TokenType.AND),
        ("||", TokenType.OR),
    ],
)
def test_two_character_operators_beat_their_prefixes(source: str, expected: TokenType) -> None:
    assert types(source) == [expected, TokenType.EOF]


def test_single_character_operators_still_work() -> None:
    assert types("< > = !") == [
        TokenType.LT,
        TokenType.GT,
        TokenType.ASSIGN,
        TokenType.NOT,
        TokenType.EOF,
    ]


def test_keywords_are_distinguished_from_identifiers() -> None:
    assert types("int input if else while for print") == [
        TokenType.INT,
        TokenType.INPUT,
        TokenType.IF,
        TokenType.ELSE,
        TokenType.WHILE,
        TokenType.FOR,
        TokenType.PRINT,
        TokenType.EOF,
    ]


def test_identifiers_may_contain_keywords_as_substrings() -> None:
    assert types("integer printer") == [TokenType.IDENT, TokenType.IDENT, TokenType.EOF]


def test_line_comments_are_skipped() -> None:
    assert types("int x; // trailing\nint y;") == [
        TokenType.INT,
        TokenType.IDENT,
        TokenType.SEMICOLON,
        TokenType.INT,
        TokenType.IDENT,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_block_comments_are_skipped() -> None:
    assert types("int /* inline */ x;") == [
        TokenType.INT,
        TokenType.IDENT,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_positions_track_across_newlines() -> None:
    token = tokenize("int x;\nint y;")[3]
    assert (token.type, token.line) == (TokenType.INT, 2)


def test_unterminated_block_comment_is_an_error() -> None:
    with pytest.raises(LexError, match="unterminated block comment"):
        tokenize("int x; /* never closed")


def test_unexpected_character_is_an_error() -> None:
    with pytest.raises(LexError, match="unexpected character"):
        tokenize("int x = 5 @ 3;")


def test_lone_ampersand_suggests_the_double_form() -> None:
    with pytest.raises(LexError, match=r"did you mean"):
        tokenize("a & b")


def test_number_glued_to_a_letter_is_rejected() -> None:
    with pytest.raises(LexError, match="invalid number literal"):
        tokenize("12abc")
