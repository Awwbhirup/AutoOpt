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
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import httpx

DEFAULT_TIMEOUT = 30.0
DEFAULT_CACHE_DIR = ".llm_cache"

#: The reply is one small JSON object. Providers that reserve the model's whole
#: output window against a per-minute budget reject the call otherwise.
MAX_OUTPUT_TOKENS = 256


#: Attempts per provider before giving up on a prompt, and the pause before each
#: retry. A 503 or a per-minute rate limit is a blip; stopping a five hundred
#: program batch on one of those wastes a day of quota for nothing. A daily cap
#: survives all four attempts and stops the run, which is the intended behaviour.
MAX_ATTEMPTS = 4
BACKOFF_SECONDS = (2.0, 8.0, 20.0)

#: Status codes worth waiting out. 429 covers both a per-minute limit, which
#: clears in seconds, and a daily cap, which does not; retrying tells them apart
#: without having to parse the provider's error body.
RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})


class ProviderExhaustedError(RuntimeError):
    """Every permitted provider failed and falling back was not allowed.

    Raised rather than degraded so a batch stops instead of silently finishing on
    a different model. A dataset where some rows came from one model and the rest
    from another cannot be reported as one method.
    """


def _is_transient(error: Exception) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in RETRYABLE_STATUS
    return isinstance(error, httpx.TimeoutException | httpx.TransportError)


def redact(text: str, secrets: list[str]) -> str:
    """Keep credentials out of anything that gets printed or written to disk.

    The key is sent as a header now, so this is a second line rather than the
    only one, but error text from a provider is not ours and should not be
    trusted to be clean.
    """
    for secret in secrets:
        if secret and len(secret) > 8:
            text = text.replace(secret, f"{secret[:4]}...redacted")
    return text


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
            # In the header, not as a ?key= query parameter. httpx puts the full
            # URL in the exception message, so a query parameter ends up in the
            # console and in the error column of the run CSV the moment the API
            # returns anything but 200.
            headers={"x-goog-api-key": self.api_key},
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
                # Without this Groq reserves the model's full output window
                # against a per-minute output token budget and rejects the
                # request before running it. The reply is a three field JSON
                # object, so the real ceiling is nowhere near this.
                "max_tokens": MAX_OUTPUT_TOKENS,
            },
            timeout=DEFAULT_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        return str(payload["choices"][0]["message"]["content"])


class ProviderChain:
    """Tries each provider in turn, caching whatever answers."""

    def __init__(
        self,
        providers: list[Provider],
        cache_dir: str | Path | None = None,
        *,
        allow_fallback: bool = True,
    ) -> None:
        self.providers = [p for p in providers if p.available]
        self.cache_dir = Path(cache_dir or DEFAULT_CACHE_DIR)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.failures: dict[str, int] = {}
        self.retries: dict[str, int] = {}
        #: With fallback off only the first provider is used, and its failure
        #: stops the run. Cached answers are still served, so resuming skips
        #: everything already done.
        self.allow_fallback = allow_fallback

    def _cache_path(self, prompt: str) -> Path:
        digest = hashlib.sha256(prompt.encode()).hexdigest()[:32]
        return self.cache_dir / f"{digest}.json"

    def _clean(self, error: Exception) -> str:
        keys = [getattr(provider, "api_key", "") for provider in self.providers]
        return redact(str(error), keys)

    def _with_retries(self, provider: Provider, prompt: str) -> str:
        """One provider, retried through blips but not through a daily cap."""
        for attempt in range(MAX_ATTEMPTS):
            try:
                return provider.complete(prompt)
            except Exception as error:
                last = attempt == MAX_ATTEMPTS - 1
                if last or not _is_transient(error):
                    raise
                self.retries[provider.name] = self.retries.get(provider.name, 0) + 1
                time.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
        raise AssertionError("unreachable")

    def complete(self, prompt: str) -> Completion:
        path = self._cache_path(prompt)
        if path.exists():
            stored = json.loads(path.read_text(encoding="utf-8"))
            return Completion(text=stored["text"], provider=stored["provider"], cached=True)

        permitted = self.providers if self.allow_fallback else self.providers[:1]

        for provider in permitted:
            try:
                text = self._with_retries(provider, prompt)
            except Exception as error:  # any failure just moves to the next provider
                self.failures[provider.name] = self.failures.get(provider.name, 0) + 1
                if not self.allow_fallback:
                    raise ProviderExhaustedError(
                        f"{provider.name} failed after {MAX_ATTEMPTS} attempts and "
                        f"fallback is off: {self._clean(error)}"
                    ) from None
                continue

            path.write_text(json.dumps({"text": text, "provider": provider.name}), encoding="utf-8")
            return Completion(text=text, provider=provider.name)

        if not self.allow_fallback:
            raise ProviderExhaustedError("no provider available and fallback is off")

        # Deliberately not cached. The stub is what answers when every real
        # provider is unavailable, not an answer in its own right, and storing it
        # would permanently record the program as having nothing to do even once
        # quota comes back.
        stub = StubProvider()
        return Completion(text=stub.complete(prompt), provider=stub.name)


def build_chain(
    cache_dir: str | Path | None = None, *, allow_fallback: bool | None = None
) -> ProviderChain:
    """Gemini, then Groq, then the stub, using whatever keys are in the environment."""
    providers: list[Provider] = []

    # Order is set by AUTOOPT_LLM_PROVIDER. Gemini's free tier has a daily cap
    # that a full corpus run exhausts, so whichever has quota should lead.
    preferred = os.environ.get("AUTOOPT_LLM_PROVIDER", "gemini").strip().lower()

    # AUTOOPT_LLM_FALLBACK=0 keeps a batch on one model: the run stops when that
    # model's quota is gone rather than finishing on another one, because a
    # dataset built from two models cannot be reported as one method.
    if allow_fallback is None:
        allow_fallback = os.environ.get("AUTOOPT_LLM_FALLBACK", "1").strip() not in ("0", "false")

    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    groq_key = os.environ.get("GROQ_API_KEY", "")

    def gemini() -> None:
        if gemini_key:
            providers.append(
                GeminiProvider(gemini_key, os.environ.get("AUTOOPT_LLM_MODEL", "gemini-3.6-flash"))
            )

    def groq() -> None:
        if groq_key:
            providers.append(GroqProvider(groq_key))

    if preferred == "groq":
        groq()
        gemini()
    else:
        gemini()
        groq()

    # The stub is deliberately NOT in the chain. Putting it there makes it a
    # provider that always succeeds, so it wins inside the loop and its answer
    # gets cached, permanently recording the program as having nothing to do.
    # ProviderChain falls through to it only when every real provider failed.
    return ProviderChain(
        providers,
        cache_dir or os.environ.get("AUTOOPT_LLM_CACHE_DIR"),
        allow_fallback=allow_fallback,
    )
