from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.adapters.credentials import configured_api_key
from app.adapters.streaming_json import parse_json_payload


class XaiApiAdapter:
    model_id = "grok-4"
    role_pool = {"proposer", "opponent"}

    async def health_check(self) -> bool:
        return configured_api_key("XAI_API_KEY") is not None

    async def stream(self, system: str, user: str, max_tokens: int) -> AsyncIterator[str]:
        api_key = configured_api_key("XAI_API_KEY")
        if not api_key:
            raise RuntimeError("XAI_API_KEY is not set or is a placeholder")
        payload = {
            "model": "grok-4",
            "stream": True,
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "https://api.x.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == "[DONE]":
                        break
                    chunk = parse_json_payload(data)
                    if not isinstance(chunk, dict):
                        continue
                    choices = chunk.get("choices")
                    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                        continue
                    delta_payload = choices[0].get("delta", {})
                    if not isinstance(delta_payload, dict):
                        continue
                    delta = delta_payload.get("content", "")
                    if delta:
                        yield delta
