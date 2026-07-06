from __future__ import annotations

import asyncio
import os

import httpx

from app.adapters import (
    ClaudeCliAdapter,
    CodexCliAdapter,
    GeminiApiAdapter,
    GeminiCliAdapter,
    GrokCliAdapter,
    LMStudioAdapter,
    MockAdapter,
    ModelClient,
    OllamaAdapter,
    XaiApiAdapter,
)
from app.config import WorkerConfig


async def discover_ollama_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get("http://localhost:11434/api/tags")
            response.raise_for_status()
            return [model["name"] for model in response.json().get("models", []) if model.get("name")]
    except Exception:
        return []


def configured_lm_studio_models() -> list[str]:
    raw = os.getenv("DIALECTICAL_LMSTUDIO_MODELS", "google_gemma-4-e4b-it")
    models: list[str] = []
    seen: set[str] = set()
    for candidate in raw.split(","):
        model = candidate.strip()
        if model and model not in seen:
            models.append(model)
            seen.add(model)
    return models


async def candidate_adapters(config: WorkerConfig) -> list[ModelClient]:
    candidates: list[ModelClient] = []
    if config.enable_mock:
        for model_id in config.mock_models or ["mock-local"]:
            candidates.append(MockAdapter(model_id))
    if config.enable_real_adapters:
        candidates.extend(
            [
                ClaudeCliAdapter(),
                CodexCliAdapter(),
                GeminiApiAdapter(),
                GeminiCliAdapter(),
                GrokCliAdapter(),
                XaiApiAdapter(),
            ]
        )
        candidates.extend(LMStudioAdapter(model_name) for model_name in configured_lm_studio_models())
        for model_name in await discover_ollama_models():
            candidates.append(OllamaAdapter(model_name))
    return candidates


async def detect_adapters(config: WorkerConfig) -> dict[str, ModelClient]:
    allowed_models = set(config.allowed_models or [])
    candidates = candidate_adapters(config)
    if asyncio.iscoroutine(candidates):
        candidates = await candidates

    probeable: list[ModelClient] = []
    for adapter in candidates:
        model_ids = adapter_model_ids(adapter)
        if allowed_models and not allowed_models.intersection(model_ids):
            continue
        probeable.append(adapter)

    async def probe(adapter: ModelClient) -> tuple[ModelClient, bool]:
        try:
            return adapter, await adapter.health_check()
        except Exception:  # health probe failure = unhealthy, never fatal
            return adapter, False

    results = await asyncio.gather(*(probe(adapter) for adapter in probeable))

    adapters: dict[str, ModelClient] = {}
    seen_adapter_ids: set[str] = set()
    for adapter, healthy in results:
        if adapter.model_id in seen_adapter_ids:
            continue
        if not healthy:
            continue
        seen_adapter_ids.add(adapter.model_id)
        for model_id in adapter_model_ids(adapter):
            if allowed_models and model_id not in allowed_models and adapter.model_id not in allowed_models:
                continue
            adapters.setdefault(model_id, adapter)
    return adapters


def adapter_model_ids(adapter: ModelClient) -> list[str]:
    model_ids: list[str] = []
    for candidate in (adapter.model_id, *getattr(adapter, "capability_aliases", ())):
        model_id = str(candidate).strip()
        if model_id and model_id not in model_ids:
            model_ids.append(model_id)
    return model_ids
