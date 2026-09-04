from __future__ import annotations

import pytest

from autoopt.lang import ParseError, ast, parse, tokenize


def parse_source(source: str) -> ast.Program:
    return parse(tokenize(source))


def only_statement(source: str) -> ast.Stmt:
    program = parse_source(source)
    assert len(program.statements) == 1
    return program.statements[0]


def expression_of(source: str) -> ast.Expr:
    """Parse `print(<expr>);` and hand back the expression."""
    statement = only_statement(f"print({source});")
    assert isinstance(statement, ast.Print)
    assert statement.value is not None
    return statement.value


# --- precedence and associativity --------------------------------------------


def test_multiplication_binds_tighter_than_addition() -> None:
    # a + b * c  ==  a + (b * c)
    expr = expression_of("a + b * c")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.ADD
    assert isinstance(expr.right, ast.Binary)
    assert expr.right.op is ast.BinaryOp.MUL


def test_parentheses_override_precedence() -> None:
    expr = expression_of("(a + b) * c")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.MUL
    assert isinstance(expr.left, ast.Binary)
    assert expr.left.op is ast.BinaryOp.ADD


def test_subtraction_is_left_associative() -> None:
    # a - b - c  ==  (a - b) - c
    expr = expression_of("a - b - c")
    assert isinstance(expr, ast.Binary)
    assert isinstance(expr.left, ast.Binary)
    assert expr.left.op is ast.BinaryOp.SUB
    assert isinstance(expr.right, ast.Identifier)


def test_comparison_binds_looser_than_arithmetic() -> None:
    expr = expression_of("a + 1 < b * 2")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.LT


def test_logical_and_binds_tighter_than_or() -> None:
    # a || b && c  ==  a || (b && c)
    expr = expression_of("a || b && c")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.OR
    assert isinstance(expr.right, ast.Binary)
    assert expr.right.op is ast.BinaryOp.AND


def test_equality_binds_looser_than_comparison() -> None:
    expr = expression_of("a < b == c > d")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.EQ


def test_unary_is_right_associative() -> None:
    expr = expression_of("--a")
    assert isinstance(expr, ast.Unary)
    assert isinstance(expr.operand, ast.Unary)


def test_unary_binds_tighter_than_multiplication() -> None:
    expr = expression_of("-a * b")
    assert isinstance(expr, ast.Binary)
    assert expr.op is ast.BinaryOp.MUL
    assert isinstance(expr.left, ast.Unary)


# --- statements ---------------------------------------------------------------


def test_input_declaration() -> None:
    statement = only_statement("input n;")
    assert isinstance(statement, ast.InputDecl)
    assert statement.name == "n"


def test_declaration_without_initializer() -> None:
    statement = only_statement("int x;")
    assert isinstance(statement, ast.VarDecl)
    assert statement.init is None


def test_if_without_else() -> None:
    statement = only_statement("if (a) print(1);")
    assert isinstance(statement, ast.If)
    assert statement.else_branch is None


def test_dangling_else_attaches_to_the_nearest_if() -> None:
    statement = only_statement("if (a) if (b) print(1); else print(2);")
    assert isinstance(statement, ast.If)
    assert statement.else_branch is None  # the else belongs to the inner if
    inner = statement.then_branch
    assert isinstance(inner, ast.If)
    assert inner.else_branch is not None


def test_while_loop() -> None:
    statement = only_statement("while (i < 10) { i = i + 1; }")
    assert isinstance(statement, ast.While)
    assert isinstance(statement.body, ast.Block)


def test_for_loop_with_declaration_initializer() -> None:
    statement = only_statement("for (int i = 0; i < 10; i = i + 1) print(i);")
    assert isinstance(statement, ast.For)
    assert isinstance(statement.init, ast.VarDecl)
    assert isinstance(statement.update, ast.Assign)


def test_for_loop_with_empty_initializer_and_update() -> None:
    statement = only_statement("for (; i < 10; ) print(i);")
    assert isinstance(statement, ast.For)
    assert statement.init is None
    assert statement.update is None


def test_nested_blocks() -> None:
    statement = only_statement("{ { int x = 1; } }")
    assert isinstance(statement, ast.Block)


def test_empty_program_parses() -> None:
    assert parse_source("").statements == ()


# --- errors -------------------------------------------------------------------


@pytest.mark.parametrize(
    "source",
    [
        "int x = 5",  # missing semicolon
        "int = 5;",  # missing name
        "x = ;",  # missing expression
        "if a) print(1);",  # missing '('
        "print(1;",  # missing ')'
        "{ int x = 1;",  # unclosed block
        "5 = x;",  # not a statement
        "int x = (1 + 2;",  # unclosed parenthesis
    ],
)
def test_malformed_sources_raise_parse_errors(source: str) -> None:
    with pytest.raises(ParseError):
        parse_source(source)


def test_parse_error_reports_a_position() -> None:
    with pytest.raises(ParseError) as excinfo:
        parse_source("int x = 5;\nint y = ;")
    assert excinfo.value.line == 2
