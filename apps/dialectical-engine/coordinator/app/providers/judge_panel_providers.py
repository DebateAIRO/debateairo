"""Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
§P2.2): maps a app.scoring.lineage.lineage_family bucket to its
coordinator-side in-process CLI provider, the same way CodexCliProvider
already backs the primary judge.

Lives under app/providers (not app/scoring) because this is the one place
in this codebase allowed to name vendors -- see coordinator/tests/
test_providers.py::test_proposal_engine_modules_outside_providers_do_not_
reference_vendors, which fails any app/scoring/*.py file (other than the
already-allowlisted app/scoring/lineage.py) that mentions a vendor by name.
app.scoring.judge_panel calls panel_cli_provider_for_family with an opaque
family string it got from lineage_family and never has to name a vendor
itself.
"""
from __future__ import annotations

from collections.abc import Callable

from app.providers.base import LLMProvider
from app.providers.claude_cli import ClaudeCliProvider
from app.providers.gemini_cli import GeminiCliProvider

# Task 6 point 2: only these two families get a coordinator-side CLI
# provider in this task (grok/lmstudio are named only in app.scoring.
# lineage.panel_vendor_family's separate vendor-brand vocabulary, used
# purely for the sole_judge_family_matches_author comparison -- that stays
# honest about an author's family even when no provider exists to judge
# against it). A family with no entry here is an honest "no provider
# configured" skip at the call site (app.scoring.judge_panel.
# build_judge_panel_members), never an error.
_PANEL_PROVIDER_FACTORIES: dict[str, Callable[[], LLMProvider]] = {
    "claude": ClaudeCliProvider,
    "gemini": GeminiCliProvider,
}


def panel_cli_provider_for_family(family: str) -> LLMProvider | None:
    """A fresh in-process CLI provider instance for `family`, or None if no
    coordinator-side CLI provider is configured for it. `family` is expected
    to be a app.scoring.lineage.lineage_family bucket (e.g. "claude"), but
    this function is a plain string lookup -- it neither calls nor imports
    lineage_family itself."""
    factory = _PANEL_PROVIDER_FACTORIES.get(family)
    return factory() if factory is not None else None
