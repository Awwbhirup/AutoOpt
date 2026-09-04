"""LLM providers behind one interface.

Gemini first, Groq second, stub last. The fallback chain matters for an
unattended batch: a rate limit on one provider degrades the run into using the
other, and losing both degrades it into the stub rather than killing it partway
through 500 programs.

Every response is cached on disk by prompt hash. Repeated runs cost nothing, and
more importantly the experiment stays reproducible, since the same prompt always
yields the same answer.
"""

from __future__ import annotations

import hashlib
import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import httpx

DEFAULT_TIMEOUT = 30.0
DEFAULT_CACHE_DIR = ".llm_cache"


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    provider: str
    cached: bool = False


class Provider(ABC):
    name: str

    @abstractmethod
    def complete(self, prompt: str) -> str:
        """Raise on any failure; the chain handles falling back."""
        ...

    @property
    def available(self) -> bool:
        return True


class StubProvider(Provider):
    """Deterministic no-network provider.

    Declines to propose anything. That keeps the pipeline runnable offline and
    makes the LLM method's contribution obvious: with the stub its validity rate
    is zero by construction rather than by accident.
    """

    name = "stub"

    def complete(self, prompt: str) -> str:
        del prompt  # the stub never looks at it
        return json.dumps({"optimization_type": "none", "site": -1, "rationale": "stub provider"})


class GeminiProvider(Provider):
    name = "gemini"
    ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, model: str = "gemini-3.6-flash") -> None:
        self.api_key = api_key
        self.model = model

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def complete(self, prompt: str) -> str:
        response = httpx.post(
            self.ENDPOINT.format(model=self.model),
            params={"key": self.api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                },
            },
            timeout=DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        return str(payload["candidates"][0]["content"]["parts"][0]["text"])


class GroqProvider(Provider):
    name = "groq"
    ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str = "qwen/qwen3.8-27b") -> None:
        self.api_key = api_key
        self.model = model

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def complete(self, prompt: str) -> str:
        response = httpx.post(
            self.ENDPOINT,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        return str(payload["choices"][0]["message"]["content"])


class ProviderChain:
    """Tries each provider in turn, caching whatever answers."""

    def __init__(self, providers: list[Provider], cache_dir: str | Path | None = None) -> None:
        self.providers = [p for p in providers if p.available]
        self.cache_dir = Path(cache_dir or DEFAULT_CACHE_DIR)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.failures: dict[str, int] = {}

    def _cache_path(self, prompt: str) -> Path:
        digest = hashlib.sha256(prompt.encode()).hexdigest()[:32]
        return self.cache_dir / f"{digest}.json"

    def complete(self, prompt: str) -> Completion:
        path = self._cache_path(prompt)
        if path.exists():
            stored = json.loads(path.read_text(encoding="utf-8"))
            return Completion(text=stored["text"], provider=stored["provider"], cached=True)

        for provider in self.providers:
            try:
                text = provider.complete(prompt)
            except Exception:  # any failure just moves to the next provider
                self.failures[provider.name] = self.failures.get(provider.name, 0) + 1
                continue

            path.write_text(json.dumps({"text": text, "provider": provider.name}), encoding="utf-8")
            return Completion(text=text, provider=provider.name)

        stub = StubProvider()
        return Completion(text=stub.complete(prompt), provider=stub.name)


def build_chain(cache_dir: str | Path | None = None) -> ProviderChain:
    """Gemini, then Groq, then the stub, using whatever keys are in the environment."""
    providers: list[Provider] = []

    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if gemini_key:
        providers.append(
            GeminiProvider(gemini_key, os.environ.get("AUTOOPT_LLM_MODEL", "gemini-3.6-flash"))
        )

    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        providers.append(GroqProvider(groq_key))

    providers.append(StubProvider())
    return ProviderChain(providers, cache_dir or os.environ.get("AUTOOPT_LLM_CACHE_DIR"))
