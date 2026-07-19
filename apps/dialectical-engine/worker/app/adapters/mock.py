from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator


class MockAdapter:
    role_pool = {"decomposer", "proposer", "opponent", "synthesizer"}

    def __init__(self, model_id: str = "mock-local", token_delay_seconds: float | None = None) -> None:
        self.model_id = model_id
        self.token_delay_seconds = (
            token_delay_seconds
            if token_delay_seconds is not None
            else float(os.getenv("DIALECTICAL_MOCK_TOKEN_DELAY_SECONDS", "0.01"))
        )

    async def health_check(self) -> bool:
        return True

    async def stream(self, system: str, user: str, max_tokens: int) -> AsyncIterator[str]:
        del max_tokens
        output = self.generate(system, user)
        for token in output.split(" "):
            await asyncio.sleep(self.token_delay_seconds)
            yield token + " "

    def generate(self, system: str, user: str) -> str:
        claim = self._tag(user, "claim") or self._tag(user, "topic") or "the topic"
        topic = self._tag(user, "topic") or claim
        lower = system.lower()
        combined = f"{system}\n{user}".lower()
        if "v2 pov worker" in lower or ("output_contract" in combined and '"strongest_pro"' in combined):
            pov_match = re.search(r"generate the (.*?) branch", user, flags=re.IGNORECASE)
            pov = pov_match.group(1).strip() if pov_match else "Selected perspective"
            return json.dumps(
                {
                    "title": f"{pov} assessment",
                    "content": f"This {pov.lower()} lens identifies the central tradeoffs around {topic}.",
                    "strongest_pro": {
                        "title": "Strongest supporting case",
                        "content": "The proposal offers a plausible path to measurable public benefit.",
                        "pro": {
                            "title": "Support for the benefit",
                            "content": "Clear implementation milestones could make the expected benefit testable.",
                        },
                        "con": {
                            "title": "Challenge to the benefit",
                            "content": "The benefit depends on assumptions that may not hold across every affected group.",
                        },
                    },
                    "strongest_con": {
                        "title": "Strongest opposing case",
                        "content": "Transition costs and unintended effects could outweigh the intended gains.",
                        "pro": {
                            "title": "Support for the risk",
                            "content": "Complex enforcement and uneven impacts make the downside credible.",
                        },
                        "con": {
                            "title": "Challenge to the risk",
                            "content": "Phased adoption and safeguards could reduce the most serious downside.",
                        },
                    },
                }
            )
        if "json" in lower and "children" in lower:
            return json.dumps(
                {
                    "root_claim": topic,
                    "argument": "The topic is decomposed into initial supporting and opposing lines.",
                    "children": [
                        {"node_type": "PRO", "claim": f"The strongest reason to accept '{topic}' is its expected public benefit."},
                        {"node_type": "CON", "claim": f"The strongest reason to reject '{topic}' is the risk of costly side effects."},
                    ],
                }
            )
        if "synthes" in combined:
            if "non-adjudicating synthesis" in combined or '"evidence_gaps"' in combined:
                return json.dumps(
                    {
                        "title": "Synthesis",
                        "content": "The debate turns on whether the expected benefits can be delivered with credible safeguards for transition costs and uncertainty.",
                        "tensions": ["Expected public benefit versus transition and enforcement risk."],
                        "agreements": ["Implementation quality and measurable outcomes matter."],
                        "evidence_gaps": ["More context-specific evidence is needed about costs and affected groups."],
                        "key_takeaways": ["A phased, measurable approach best addresses both sides' strongest concerns."],
                    }
                )
            return json.dumps(
                {
                    "strongest_pro": "The pro side identifies concrete benefits and a path to implementation.",
                    "strongest_con": "The con side raises transition costs, enforcement limits, and uncertainty.",
                    "verdict": "The better position depends on whether safeguards and transition support are credible.",
                }
            )
        if "opposing" in lower or "opponent" in lower:
            return f"This objection challenges '{claim}' by pointing to tradeoffs, enforcement gaps, and unintended consequences."
        return f"This support for '{claim}' argues that the claimed benefit is plausible, actionable, and measurable."

    @staticmethod
    def _tag(text: str, tag: str) -> str | None:
        match = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", text, flags=re.DOTALL)
        return re.sub(r"\s+", " ", match.group(1)).strip() if match else None
