"""Recursive-descent parser for MiniLang.

Grammar, lowest precedence first:

    program     := stmt* EOF
    stmt        := inputDecl | varDecl | assign | ifStmt | whileStmt
                 | forStmt | printStmt | block
    inputDecl   := 'input' IDENT ';'
    varDecl     := 'int' IDENT ('=' expr)? ';'
    assign      := IDENT '=' expr ';'
    ifStmt      := 'if' '(' expr ')' stmt ('else' stmt)?
    whileStmt   := 'while' '(' expr ')' stmt
    forStmt     := 'for' '(' simpleStmt ';' expr ';' simpleStmt ')' stmt
    printStmt   := 'print' '(' expr ')' ';'
    block       := '{' stmt* '}'

    expr        := logicalOr
    logicalOr   := logicalAnd ('||' logicalAnd)*
    logicalAnd  := equality ('&&' equality)*
    equality    := comparison (('==' | '!=') comparison)*
    comparison  := additive (('<' | '>' | '<=' | '>=') additive)*
    additive    := multiplicative (('+' | '-') multiplicative)*
    multiplicative := unary (('*' | '/' | '%') unary)*
    unary       := ('-' | '!') unary | primary
    primary     := NUMBER | IDENT | '(' expr ')'

All binary operators are left-associative; unary is right-associative.
"""

from __future__ import annotations

from . import ast
from .errors import ParseError
from .tokens import Token, TokenType

_EQUALITY = {TokenType.EQ: ast.BinaryOp.EQ, TokenType.NE: ast.BinaryOp.NE}
_COMPARISON = {
    TokenType.LT: ast.BinaryOp.LT,
    TokenType.GT: ast.BinaryOp.GT,
    TokenType.LE: ast.BinaryOp.LE,
    TokenType.GE: ast.BinaryOp.GE,
}
_ADDITIVE = {TokenType.PLUS: ast.BinaryOp.ADD, TokenType.MINUS: ast.BinaryOp.SUB}
_MULTIPLICATIVE = {
    TokenType.STAR: ast.BinaryOp.MUL,
    TokenType.SLASH: ast.BinaryOp.DIV,
    TokenType.PERCENT: ast.BinaryOp.MOD,
}
_UNARY = {TokenType.MINUS: ast.UnaryOp.NEG, TokenType.NOT: ast.UnaryOp.NOT}


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    # --- token helpers -------------------------------------------------------

    @property
    def _current(self) -> Token:
        return self._tokens[self._pos]

    def _check(self, *types: TokenType) -> bool:
        return self._current.type in types

    def _advance(self) -> Token:
        token = self._current
        if token.type is not TokenType.EOF:
            self._pos += 1
        return token

    def _match(self, *types: TokenType) -> Token | None:
        return self._advance() if self._check(*types) else None

    def _expect(self, type_: TokenType, what: str) -> Token:
        if not self._check(type_):
            raise ParseError(
                f"expected {what}, found {self._current.lexeme or 'end of input'!r}",
                self._current.line,
                self._current.column,
            )
        return self._advance()

    # --- entry point ---------------------------------------------------------

    def parse(self) -> ast.Program:
        statements: list[ast.Stmt] = []
        while not self._check(TokenType.EOF):
            statements.append(self._statement())
        return ast.Program(line=1, column=1, statements=tuple(statements))

    # --- statements ----------------------------------------------------------

    def _statement(self) -> ast.Stmt:
        if self._check(TokenType.INPUT):
            return self._input_decl()
        if self._check(TokenType.INT):
            return self._var_decl()
        if self._check(TokenType.IF):
            return self._if_statement()
        if self._check(TokenType.WHILE):
            return self._while_statement()
        if self._check(TokenType.FOR):
            return self._for_statement()
        if self._check(TokenType.PRINT):
            return self._print_statement()
        if self._check(TokenType.LBRACE):
            return self._block()
        if self._check(TokenType.IDENT):
            statement = self._assignment()
            self._expect(TokenType.SEMICOLON, "';' after assignment")
            return statement

        raise ParseError(
            f"expected a statement, found {self._current.lexeme or 'end of input'!r}",
            self._current.line,
            self._current.column,
        )

    def _input_decl(self) -> ast.InputDecl:
        keyword = self._advance()
        name = self._expect(TokenType.IDENT, "a variable name after 'input'")
        self._expect(TokenType.SEMICOLON, "';' after input declaration")
        return ast.InputDecl(line=keyword.line, column=keyword.column, name=name.lexeme)

    def _var_decl(self) -> ast.VarDecl:
        keyword = self._advance()
        name = self._expect(TokenType.IDENT, "a variable name after 'int'")
        init: ast.Expr | None = None
        if self._match(TokenType.ASSIGN):
            init = self._expression()
        self._expect(TokenType.SEMICOLON, "';' after declaration")
        return ast.VarDecl(line=keyword.line, column=keyword.column, name=name.lexeme, init=init)

    def _assignment(self) -> ast.Assign:
        name = self._advance()
        self._expect(TokenType.ASSIGN, "'=' in assignment")
        value = self._expression()
        return ast.Assign(line=name.line, column=name.column, name=name.lexeme, value=value)

    def _if_statement(self) -> ast.If:
        keyword = self._advance()
        self._expect(TokenType.LPAREN, "'(' after 'if'")
        condition = self._expression()
        self._expect(TokenType.RPAREN, "')' after condition")
        then_branch = self._statement()
        else_branch = self._statement() if self._match(TokenType.ELSE) else None
        return ast.If(
            line=keyword.line,
            column=keyword.column,
            condition=condition,
            then_branch=then_branch,
            else_branch=else_branch,
        )

    def _while_statement(self) -> ast.While:
        keyword = self._advance()
        self._expect(TokenType.LPAREN, "'(' after 'while'")
        condition = self._expression()
        self._expect(TokenType.RPAREN, "')' after condition")
        return ast.While(
            line=keyword.line, column=keyword.column, condition=condition, body=self._statement()
        )

    def _for_statement(self) -> ast.For:
        keyword = self._advance()
        self._expect(TokenType.LPAREN, "'(' after 'for'")

        init: ast.Stmt | None
        if self._check(TokenType.INT):
            init = self._var_decl()  # consumes its own ';'
        elif self._check(TokenType.SEMICOLON):
            self._advance()
            init = None
        else:
            init = self._assignment()
            self._expect(TokenType.SEMICOLON, "';' after loop initializer")

        condition = self._expression()
        self._expect(TokenType.SEMICOLON, "';' after loop condition")

        update = None if self._check(TokenType.RPAREN) else self._assignment()
        self._expect(TokenType.RPAREN, "')' after for clauses")

        return ast.For(
            line=keyword.line,
            column=keyword.column,
            init=init,
            condition=condition,
            update=update,
            body=self._statement(),
        )

    def _print_statement(self) -> ast.Print:
        keyword = self._advance()
        self._expect(TokenType.LPAREN, "'(' after 'print'")
        value = self._expression()
        self._expect(TokenType.RPAREN, "')' after printed expression")
        self._expect(TokenType.SEMICOLON, "';' after print statement")
        return ast.Print(line=keyword.line, column=keyword.column, value=value)

    def _block(self) -> ast.Block:
        brace = self._advance()
        statements: list[ast.Stmt] = []
        while not self._check(TokenType.RBRACE, TokenType.EOF):
            statements.append(self._statement())
        self._expect(TokenType.RBRACE, "'}' to close block")
        return ast.Block(line=brace.line, column=brace.column, statements=tuple(statements))

    # --- expressions ---------------------------------------------------------

    def _expression(self) -> ast.Expr:
        return self._logical_or()

    def _binary_level(self, operators: dict[TokenType, ast.BinaryOp], operand: str) -> ast.Expr:
        """One left-associative precedence level; `operand` names the sub-rule method."""
        parse_operand = getattr(self, operand)
        left: ast.Expr = parse_operand()
        while self._check(*operators):
            token = self._advance()
            right = parse_operand()
            left = ast.Binary(
                line=token.line,
                column=token.column,
                op=operators[token.type],
                left=left,
                right=right,
            )
        return left

    def _logical_or(self) -> ast.Expr:
        return self._binary_level({TokenType.OR: ast.BinaryOp.OR}, "_logical_and")

    def _logical_and(self) -> ast.Expr:
        return self._binary_level({TokenType.AND: ast.BinaryOp.AND}, "_equality")

    def _equality(self) -> ast.Expr:
        return self._binary_level(_EQUALITY, "_comparison")

    def _comparison(self) -> ast.Expr:
        return self._binary_level(_COMPARISON, "_additive")

    def _additive(self) -> ast.Expr:
        return self._binary_level(_ADDITIVE, "_multiplicative")

    def _multiplicative(self) -> ast.Expr:
        return self._binary_level(_MULTIPLICATIVE, "_unary")

    def _unary(self) -> ast.Expr:
        if self._check(*_UNARY):
            token = self._advance()
            return ast.Unary(
                line=token.line,
                column=token.column,
                op=_UNARY[token.type],
                operand=self._unary(),
            )
        return self._primary()

    def _primary(self) -> ast.Expr:
        token = self._current

        if self._match(TokenType.NUMBER):
            assert token.value is not None
            return ast.Number(line=token.line, column=token.column, value=token.value)

        if self._match(TokenType.IDENT):
            return ast.Identifier(line=token.line, column=token.column, name=token.lexeme)

        if self._match(TokenType.LPAREN):
            inner = self._expression()
            self._expect(TokenType.RPAREN, "')' after expression")
            return inner

        raise ParseError(
            f"expected an expression, found {token.lexeme or 'end of input'!r}",
            token.line,
            token.column,
        )


def parse(tokens: list[Token]) -> ast.Program:
    return Parser(tokens).parse()
