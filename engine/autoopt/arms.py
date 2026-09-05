"""Which models the experiment treats as separate methods.

One arm today, running whatever the environment configures. The point of the
registry is that a second is an entry here rather than a change anywhere else:
the experiment grid reads it, the presentation order reads it, and the strategy
factory reads it, so a new model becomes a new level of the `method` factor with
its answers cached separately from every other model's.

That covers both of the reasons to want it. Comparing models is then an ordinary
ANOVA level rather than a special case, and offering a reader a choice of model
is a matter of exposing these names.

Kept as a leaf module with no imports of its own, so the search package can name
the arms without dragging in a provider or an HTTP client to do it.
"""

from __future__ import annotations

#: Arm name -> model id. An empty string means whatever the environment
#: configures, which is how the default arm stays provider agnostic.
#:
#: To compare two models, give each its own entry:
#:
#:     LLM_ARMS = {
#:         "llm_small": "gemini-2.5-flash-lite",
#:         "llm_large": "gemini-2.5-flash",
#:     }
#:
#: Nothing else needs editing. Responses are cached per model, so the arms
#: cannot silently serve each other's answers.
LLM_ARMS: dict[str, str] = {
    "llm": "",
}


def is_llm(method: str) -> bool:
    return method in LLM_ARMS
