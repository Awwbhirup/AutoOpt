from __future__ import annotations

import pytest

from autoopt.lang import SemanticError, compile_source


def test_collects_inputs_and_locals_separately() -> None:
    _, info = compile_source("input n; input m; int x = n + m; int y = 0;")
    assert info.inputs == ("n", "m")
    assert info.locals == ("x", "y")


def test_input_order_is_preserved() -> None:
    # Differential testing indexes input vectors positionally, so order matters.
    _, info = compile_source("input c; input a; input b; print(a + b + c);")
    assert info.inputs == ("c", "a", "b")


def test_variables_declared_inside_control_flow_are_visible_afterwards() -> None:
    # MiniLang has a single flat scope; blocks do not introduce one.
    _, info = compile_source("if (1) { int x = 5; } print(x);")
    assert info.locals == ("x",)


def test_undeclared_variable_is_rejected() -> None:
    with pytest.raises(SemanticError, match="'y' is not declared"):
        compile_source("int x = y + 1;")


def test_assignment_to_undeclared_variable_is_rejected() -> None:
    with pytest.raises(SemanticError, match="'z' is not declared"):
        compile_source("z = 5;")


def test_redeclaration_is_rejected() -> None:
    with pytest.raises(SemanticError, match="already declared"):
        compile_source("int x = 1; int x = 2;")


def test_input_and_local_may_not_share_a_name() -> None:
    with pytest.raises(SemanticError, match="already declared"):
        compile_source("input n; int n = 1;")


def test_self_reference_in_initializer_is_rejected() -> None:
    with pytest.raises(SemanticError, match="'x' is not declared"):
        compile_source("int x = x + 1;")


def test_use_before_declaration_is_rejected() -> None:
    with pytest.raises(SemanticError, match="'x' is not declared"):
        compile_source("print(x); int x = 1;")


def test_semantic_error_reports_a_position() -> None:
    with pytest.raises(SemanticError) as excinfo:
        compile_source("int x = 1;\nprint(nope);")
    assert excinfo.value.line == 2


def test_a_representative_program_resolves_cleanly() -> None:
    source = """
        input n;
        int total = 0;
        int i = 0;
        while (i < n) {
            total = total + i * 2;
            i = i + 1;
        }
        int unused = 99;          // dead code, kept for the optimizer to find
        int t = (n + 1) * (n + 1); // repeated subexpression
        if (total > 10) { print(total); } else { print(t); }
    """
    _, info = compile_source(source)
    assert info.inputs == ("n",)
    assert set(info.locals) == {"total", "i", "unused", "t"}
