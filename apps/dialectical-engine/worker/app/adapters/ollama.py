from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.adapters.streaming_json import parse_json_payload


class OllamaAdapter:
    role_pool = {"proposer", "opponent", "synthesizer"}

    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self.model_id = f"ollama:{model_name.split(':')[0]}"

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get("http://localhost:11434/api/tags")
                response.raise_for_status()
                models = response.json().get("models", [])
                requested_name, has_requested_tag = self._model_health_matcher()
                return any(
                    self._model_matches_health_entry(str(model.get("name", "")), requested_name, has_requested_tag)
                    for model in models
                    if isinstance(model, dict)
                )
        except Exception:
            return False

    def _model_health_matcher(self) -> tuple[str, bool]:
        return self.model_name if ":" in self.model_name else self.model_name.split(":")[0], ":" in self.model_name

    @staticmethod
    def _model_matches_health_entry(model_name: str, requested_name: str, has_requested_tag: bool) -> bool:
        if has_requested_tag:
            return model_name == requested_name
        return model_name.split(":")[0] == requested_name

    async def stream(self, system: str, user: str, max_tokens: int) -> AsyncIterator[str]:
        prompt = f"{system}\n\n{user}"
        payload = {"model": self.model_name, "prompt": prompt, "stream": True, "options": {"num_predict": max_tokens}}
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", "http://localhost:11434/api/generate", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    chunk = parse_json_payload(line)
                    if not isinstance(chunk, dict):
                        continue
                    delta = chunk.get("response", "")
                    if delta:
                        yield delta
