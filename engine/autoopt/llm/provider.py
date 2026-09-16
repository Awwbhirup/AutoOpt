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

#: Two separate limits act on this number and they pull opposite ways.
#:
#: A request is admitted only if its expected output fits the output-tokens-per
#: minute cap, which is 1000 on this tier, so the ceiling has to stay well under
#: that. But a cap below what the model actually emits does not truncate the
#: reply, it kills the request: the JSON object never closes and the whole
#: generation is rejected as invalid.
#:
#: With reasoning suppressed the worst case measured across every category is
#: 317 tokens, most sitting near 55, so this clears the real need several times
#: over while staying half the admission limit.
MAX_OUTPUT_TOKENS = 512

#: Stand-in output size for pacing the very first call, before any response has
#: reported a real one. The first reply corrects it.
ASSUMED_OUTPUT_TOKENS = 120

#: Stand-in prompt size, same reasoning.
ASSUMED_PROMPT_TOKENS = 400


#: Attempts per provider before giving up on a prompt, and the pause before each
#: retry. A 503 or a per-minute rate limit is a blip; stopping a five hundred
#: program batch on one of those wastes a day of quota for nothing. A daily cap
#: survives all four attempts and stops the run, which is the intended behaviour.
MAX_ATTEMPTS = 4
#: Long enough in total to outlast a one minute token window. Shorter waits meant
#: a per-minute limit looked like a daily one and stopped the batch.
BACKOFF_SECONDS = (5.0, 20.0, 40.0)

#: Status codes worth waiting out. 429 covers both a per-minute limit, which
#: clears in seconds, and a daily cap, which does not; retrying tells them apart
#: without having to parse the provider's error body.
RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})


class GenerationTooLongError(RuntimeError):
    """The model never closed its JSON object inside the output budget.

    Deterministic for a given prompt, so there is nothing to retry and nothing
    to fall back to: another provider asked the same question would be a
    different model answering, which is the one thing the chain must not do
    silently. It is also not a reason to stop the batch. The model failing to
    deliver a usable answer on one program is a result about the model, so it
    is reported as an invalid proposal and the run carries on.
    """

    def __init__(self, provider: str) -> None:
        super().__init__(f"{provider} hit the output cap before closing its JSON")
        self.provider = provider


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


def raise_with_reason(response: httpx.Response) -> None:
    """raise_for_status, but keeping what the provider actually said.

    The default message is the status line and the URL, so a refusal arrives
    with its reason stripped off. That cost a diagnosis once already: a 429
    that was the per-minute token window looked identical to one that was the
    daily cap, and the two want opposite responses.
    """
    if not response.is_error:
        return
    detail = ""
    try:
        body = response.json()
        detail = str(body.get("error", {}).get("message", "")).strip()
    except ValueError:
        detail = response.text[:200].strip()
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        if not detail:
            raise
        raise httpx.HTTPStatusError(
            f"{error}: {detail}", request=error.request, response=error.response
        ) from None


class MalformedResponseError(RuntimeError):
    """The provider answered with something that is not a completion.

    Its own errors are handled above this; reaching here means a 200 whose body
    is not the shape the API documents, which is worth saying plainly rather
    than surfacing as a KeyError from three levels down.
    """


def _first_choice(payload: dict[str, object]) -> str:
    """The message text out of an OpenAI-shaped completion body."""
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise MalformedResponseError("response carried no choices")
    first = choices[0]
    message = first.get("message") if isinstance(first, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if content is None:
        raise MalformedResponseError("response carried no message content")
    return str(content)


def _json_validate_failed(response: httpx.Response) -> bool:
    """Is this 400 the provider saying the generation ran past the cap?

    Worth telling apart from every other 400: a malformed request is a bug to
    fix, this is a measurement.
    """
    try:
        return str(response.json().get("error", {}).get("code", "")) == "json_validate_failed"
    except ValueError:
        return False


def _write_atomically(path: Path, payload: str) -> None:
    """Write a cache entry so a reader never sees a half-written one.

    Several workers can share one cache directory, and a plain write leaves a
    window where the file exists but is incomplete. A reader landing in that
    window gets a JSON error on an entry that is actually fine, and the run it
    belongs to is recorded as a failure. Writing beside it and renaming makes
    the entry appear whole or not at all.

    The temporary name carries the process id so two workers writing the same
    prompt do not tread on each other's partial file.
    """
    temporary = path.with_name(f"{path.name}.{os.getpid()}.part")
    temporary.write_text(payload, encoding="utf-8")
    try:
        os.replace(temporary, path)
    except OSError:
        # Another worker got there first, which is fine: the content is the
        # same answer to the same prompt.
        temporary.unlink(missing_ok=True)


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

    @property
    def prompt_variant(self) -> str:
        """How this provider alters the prompt before sending it.

        Part of the cache key. A provider that appends a control token is
        asking a different question, and an answer given without it must not
        be served in its place.
        """
        return ""


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
        raise_with_reason(response)
        payload = response.json()
        return str(payload["candidates"][0]["content"]["parts"][0]["text"])


def parse_duration(text: str) -> float:
    """Groq reports its reset window as "1m26.4s", "7.86s" or "1ms"."""
    if not text:
        return 0.0
    total, number = 0.0, ""
    units = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}
    index = 0
    while index < len(text):
        char = text[index]
        if char.isdigit() or char == ".":
            number += char
            index += 1
            continue
        unit = text[index : index + 2] if text[index : index + 2] in units else char
        total += float(number or 0) * units.get(unit, 0.0)
        number = ""
        index += len(unit)
    return total


class GroqProvider(Provider):
    """Free tier, paced against a rolling per-minute token budget.

    The daily request cap is not the binding constraint. A prompt here carries
    the whole program listing and the catalogue, so a batch that fires as fast as
    it can spends the minute's token budget in seconds and then spends the rest
    of the minute being refused. Pacing turns that into a steady rate.
    """

    name = "groq"
    ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

    #: Floor between calls, whatever the arithmetic below works out to.
    MIN_INTERVAL = 6.0
    #: Assumed per-minute token budget until a response tells us the real one.
    DEFAULT_TOKEN_LIMIT = 8000
    #: Output tokens per minute. Not reported in any header, unlike the combined
    #: budget, so it has to be carried here. Measured: ten calls six seconds
    #: apart, each emitting about 58 tokens, pass without a refusal, which puts
    #: consumption at what the reply actually costs rather than what it reserved.
    OUTPUT_TOKEN_LIMIT = 1000
    #: Spend this share of the refill rate rather than all of it. The budget is
    #: a bucket shared with anything else on the key, and a call that arrives a
    #: moment early is refused outright rather than queued.
    SAFETY = 0.85
    #: Qwen reasons out loud by default, and on a loop-heavy program that
    #: preamble ran past any ceiling the admission limit allows, taking the
    #: whole request with it. This is the model's own switch for turning it off.
    #: Suppressing it left every answer unchanged where one came back at all.
    NO_THINK = "/no_think"

    def __init__(self, api_key: str, model: str = "qwen/qwen3.8-27b") -> None:
        self.api_key = api_key
        self.model = model
        self._next_allowed = 0.0
        #: Last prompt size seen, used to pace the next call when a response
        #: carries no usage of its own, as a refusal does.
        self._last_prompt_tokens = ASSUMED_PROMPT_TOKENS
        self._last_output_tokens = ASSUMED_OUTPUT_TOKENS

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _wait_for_slot(self) -> None:
        pause = self._next_allowed - time.monotonic()
        if pause > 0:
            time.sleep(pause)

    def _note_budget(self, response: httpx.Response, prompt_tokens: int | None = None) -> None:
        """Wait long enough for the window to refill what this call spent.

        The budget is a bucket that refills continuously, not an allowance that
        resets on a clock. Reading the remaining count straight after a response
        therefore always looks healthy, because the refill has already started,
        and pacing off that reading is how a fixed interval ended up being
        trusted for something it could not know.

        So the wait is computed instead: a call reserves its prompt plus the
        whole output ceiling whether or not it uses it, and the window refills
        at limit/60 per second, so the time owed is one divided by the other.
        The prompt length comes from the response when the provider reports it,
        since it grows with the program being optimized.
        """
        usage = self._reported_usage(response)
        prompt_tokens = prompt_tokens or usage[0] or self._last_prompt_tokens
        output_tokens = usage[1] or self._last_output_tokens

        limit = self._header_int(response, "x-ratelimit-limit-tokens") or self.DEFAULT_TOKEN_LIMIT
        # Two windows, and whichever needs longer is the one that binds.
        combined = (prompt_tokens + output_tokens) / (limit / 60.0)
        output_only = output_tokens / (self.OUTPUT_TOKEN_LIMIT / 60.0)
        delay = max(self.MIN_INTERVAL, max(combined, output_only) / self.SAFETY)

        if response.status_code == 429:
            # Already over. The provider says how long the window needs, and
            # that beats guessing: too short and the retry is spent for nothing.
            reset = parse_duration(response.headers.get("x-ratelimit-reset-tokens", ""))
            delay = max(delay, reset + 1.0)

        self._next_allowed = time.monotonic() + delay

    @classmethod
    def _reported_usage(cls, response: httpx.Response) -> tuple[int | None, int | None]:
        """Prompt and completion tokens as the provider counted them.

        Paced on what the reply actually cost rather than on what it reserved,
        because the reservation is only an admission check. Pacing on it instead
        would idle at a fifth of the rate the budget allows.
        """
        usage = cls._payload(response).get("usage")
        if not isinstance(usage, dict):
            return None, None
        prompt = usage.get("prompt_tokens")
        output = usage.get("completion_tokens")
        return (int(prompt) if prompt else None, int(output) if output else None)

    @staticmethod
    def _header_int(response: httpx.Response, name: str) -> int | None:
        try:
            return int(response.headers[name])
        except (KeyError, ValueError):
            return None

    @property
    def prompt_variant(self) -> str:
        return self.NO_THINK if "qwen" in self.model.lower() else ""

    def _sent(self, prompt: str) -> str:
        """The prompt as this model needs to receive it.

        Kept here rather than in the prompt template because it is a property
        of one model, not of the task. Another model would see a stray token,
        and answers are cached per model, so the two cannot mix.
        """
        variant = self.prompt_variant
        return f"{prompt}\n{variant}" if variant else prompt

    def complete(self, prompt: str) -> str:
        self._wait_for_slot()
        response = httpx.post(
            self.ENDPOINT,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": self._sent(prompt)}],
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
        # Before raise_for_status: a refusal carries the budget headers too, and
        # that is exactly when knowing how long to wait matters most.
        payload = self._payload(response)
        prompt_tokens, output_tokens = self._reported_usage(response)
        if prompt_tokens:
            self._last_prompt_tokens = prompt_tokens
        if output_tokens:
            self._last_output_tokens = output_tokens
        self._note_budget(response, prompt_tokens)

        if response.status_code == 400 and _json_validate_failed(response):
            raise GenerationTooLongError(self.name)
        raise_with_reason(response)
        return _first_choice(payload)

    @staticmethod
    def _payload(response: httpx.Response) -> dict[str, object]:
        try:
            body = response.json()
        except ValueError:
            return {}
        return body if isinstance(body, dict) else {}


class ProviderChain:
    """Tries each provider in turn, caching whatever answers."""

    def __init__(
        self,
        providers: list[Provider],
        cache_dir: str | Path | None = None,
        *,
        allow_fallback: bool = True,
        namespace: str = "",
    ) -> None:
        self.providers = [p for p in providers if p.available]
        self.cache_dir = Path(cache_dir or DEFAULT_CACHE_DIR)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.failures: dict[str, int] = {}
        self.retries: dict[str, int] = {}
        #: Part of the cache key, so two models do not share answers. Without it
        #: a second model is served whatever the first one said, and a comparison
        #: between them comes out identical for a reason nothing would report.
        self.namespace = namespace or self._default_namespace()
        #: With fallback off only the first provider is used, and its failure
        #: stops the run. Cached answers are still served, so resuming skips
        #: everything already done.
        self.allow_fallback = allow_fallback

    def _default_namespace(self) -> str:
        """Model and prompt variant together.

        The model alone is not enough. The same model asked with a control
        token appended is a different treatment, and keying only on the name
        would serve the old answers to the new configuration without saying so.
        """
        if not self.providers:
            return ""
        first = self.providers[0]
        model = getattr(first, "model", "")
        variant = first.prompt_variant
        return f"{model}{variant}"

    def _cache_path(self, prompt: str) -> Path:
        keyed = f"{self.namespace}\0{prompt}"
        digest = hashlib.sha256(keyed.encode()).hexdigest()[:32]
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
            except GenerationTooLongError:
                raise
            except Exception as error:  # any failure just moves to the next provider
                self.failures[provider.name] = self.failures.get(provider.name, 0) + 1
                if not self.allow_fallback:
                    raise ProviderExhaustedError(
                        f"{provider.name} failed and fallback is off: {self._clean(error)}"
                    ) from None
                continue

            _write_atomically(path, json.dumps({"text": text, "provider": provider.name}))
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
    cache_dir: str | Path | None = None,
    *,
    allow_fallback: bool | None = None,
    model: str | None = None,
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

    # An explicit model wins, so the two LLM arms can each name their own without
    # having to reach through the environment.
    gemini_model = model or os.environ.get("AUTOOPT_LLM_MODEL", "gemini-3.6-flash")
    groq_model = model or os.environ.get("AUTOOPT_GROQ_MODEL", "qwen/qwen3.8-27b")

    def gemini() -> None:
        if gemini_key:
            providers.append(GeminiProvider(gemini_key, gemini_model))

    def groq() -> None:
        if groq_key:
            providers.append(GroqProvider(groq_key, groq_model))

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
