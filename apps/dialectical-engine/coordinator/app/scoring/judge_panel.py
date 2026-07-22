"""Task 6: cross-family judge panel construction (docs/improvement-plan-
2026-07-22.md §P2.2).

Opt-in via DIALECTICAL_JUDGE_PANEL_MODELS (comma-separated model ids).
Unset/empty -> build_judge_panel_members returns no members, which is what
keeps the single-judge production path byte-identical (brief point 1) --
callers must never construct panel behavior any other way. When set, each
listed model that resolves to a family with a working in-process CLI
provider becomes a secondary panel judge, run in-process the same way the
primary judge already is -- no worker/job round trip (brief point 2).

Vendor-agnostic by design, like every other module in this package except
the one already-allowlisted app.scoring.lineage -- see coordinator/tests/
test_providers.py::test_proposal_engine_modules_outside_providers_do_not_
reference_vendors. This file never names a specific vendor: it asks
app.scoring.lineage.lineage_family for an opaque family bucket and
app.providers for whichever in-process CLI provider (if any) backs that
family, and wires the two together generically.

Construction only: this module never touches the DB or persists anything --
app.scoring.service (the existing sole owner of every JudgeOutputArtifact
write) calls .judge_node() on each returned member and persists the result
itself, exactly like it already does for the primary judge.
"""
from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass

from app.models.entities import now_utc
from app.providers.base import LLMProvider
from app.providers.judge_panel_providers import panel_cli_provider_for_family
from app.scoring.judge_registry import judge_panel_role
from app.scoring.judges import ScoringProvider, ScoringProviderRequest, ScoringProviderResult
from app.scoring.lineage import lineage_family
from app.scoring.prompts import render_single_node_judge_prompt

PANEL_MODELS_ENV_VAR = "DIALECTICAL_JUDGE_PANEL_MODELS"

ProviderLookup = Callable[[str], LLMProvider | None]


@dataclass(frozen=True)
class JudgePanelMember:
    """One resolved, ready-to-call secondary judge. `provider.judge_node`
    has the same shape as app.scoring.service.RegistryScoringProvider's, so
    callers treat a panel member exactly like the primary judge provider."""

    family: str
    model_id: str
    judge_role: str
    provider: ScoringProvider


def panel_model_ids() -> list[str]:
    """Parse DIALECTICAL_JUDGE_PANEL_MODELS: comma-separated model ids,
    order-preserving, with blank/whitespace-only entries and exact
    duplicates dropped. Unset or empty -> [] (panel disabled)."""
    raw = os.getenv(PANEL_MODELS_ENV_VAR, "")
    seen: set[str] = set()
    model_ids: list[str] = []
    for candidate in raw.split(","):
        model_id = candidate.strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        model_ids.append(model_id)
    return model_ids


def build_judge_panel_members(
    *, provider_lookup: ProviderLookup = panel_cli_provider_for_family
) -> tuple[list[JudgePanelMember], list[dict]]:
    """Resolve DIALECTICAL_JUDGE_PANEL_MODELS into working panel members.

    Returns (members, skipped) -- skipped is one entry per requested model
    id that did NOT become a member (unrecognized family, or a recognized
    family whose CLI provider reports unavailable), each carrying an honest
    `reason` so a caller can record why (see app.scoring.service._run_
    judge_panel, which folds these into score_provenance.judge_panel_notes
    -- brief point 2: "a panel member failing/timeout must degrade to the
    remaining judges, never fail the scoring run (log + provenance note)").
    Never raises: an unrecognized/unavailable model is a skip, not an
    error -- the run must degrade to whatever panel members ARE available,
    including zero (which reproduces today's single-judge behavior).

    `provider_lookup` defaults to the real in-process CLI provider factory
    (app.providers.judge_panel_providers.panel_cli_provider_for_family) but
    is injectable so tests never need a real CLI on PATH.
    """
    members: list[JudgePanelMember] = []
    skipped: list[dict] = []
    for model_id in panel_model_ids():
        family = lineage_family(model_id)
        provider = provider_lookup(family) if family else None
        if provider is None:
            skipped.append(
                {
                    "model_id": model_id,
                    "family": family,
                    "status": "unconfigured",
                    "reason": "No in-process CLI provider is configured for this model's family.",
                }
            )
            continue
        availability = provider.availability()
        if not availability.available:
            skipped.append(
                {
                    "model_id": model_id,
                    "family": family,
                    "status": "unavailable",
                    "reason": availability.reason or "Panel provider is not available.",
                }
            )
            continue
        role = judge_panel_role(family)
        members.append(
            JudgePanelMember(
                family=family,
                model_id=model_id,
                judge_role=role,
                provider=_PanelJudgeProvider(provider, model=model_id, judge_role=role),
            )
        )
    return members, skipped


class _PanelJudgeProvider:
    """Adapts an LLMProvider (an in-process CLI provider from app.providers)
    into the ScoringProvider.judge_node shape app.scoring.service.
    RegistryScoringProvider already implements for the primary judge --
    deliberately NOT going through ProviderRegistry.generate_for_role, which
    resolves role -> AgentConfig via agents.yaml (panel members are not
    agents.yaml roles; they come entirely from DIALECTICAL_JUDGE_PANEL_
    MODELS)."""

    def __init__(self, provider: LLMProvider, *, model: str, judge_role: str) -> None:
        self._provider = provider
        self.provider = provider.name
        self.model = model
        self.judge_role = judge_role

    def judge_node(self, request: ScoringProviderRequest) -> ScoringProviderResult:
        panel_request = request.model_copy(update={"judge_role": self.judge_role})
        response = self._provider.generate(
            render_single_node_judge_prompt(panel_request),
            model=self.model,
            temperature=0.0,
            response_format="json",
            role=self.judge_role,
        )
        return ScoringProviderResult(
            provider=self.provider,
            model=self.model,
            raw_output=response.text,
            checked_at=now_utc().isoformat(),
            metadata=response.raw,
        )
