from __future__ import annotations

from app.providers.codex_cli import ProviderAvailability
from app.scoring.judge_panel import (
    PANEL_MODELS_ENV_VAR,
    JudgePanelMember,
    build_judge_panel_members,
    panel_model_ids,
)
from app.scoring.judge_registry import judge_panel_role
from app.scoring.judges import ScoringProviderRequest
from app.scoring.normalizer import normalize_claim


class _FakeLLMProvider:
    def __init__(self, name: str, *, available: bool = True, reason: str | None = None) -> None:
        self.name = name
        self._available = available
        self._reason = reason
        self.calls: list[dict] = []

    def availability(self) -> ProviderAvailability:
        return ProviderAvailability(provider=self.name, available=self._available, reason=self._reason)

    def generate(self, messages, *, model, temperature=0.0, max_tokens=None, response_format=None, role=None):
        from app.providers.base import LLMResponse

        self.calls.append(
            {
                "messages": messages,
                "model": model,
                "temperature": temperature,
                "response_format": response_format,
                "role": role,
            }
        )
        return LLMResponse(text='{"fake": true}', raw={"provider": self.name}, usage=None)


def _panel_request() -> ScoringProviderRequest:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work improves retention.")
    return ScoringProviderRequest(claim=claim, argument_text="Employees stay longer.", judge_role="judge")


def test_panel_model_ids_parses_comma_separated_env_var_preserving_order(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "model-a, model-b ,model-c")
    assert panel_model_ids() == ["model-a", "model-b", "model-c"]


def test_panel_model_ids_drops_blank_entries_and_duplicates(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "model-a,,model-b, ,model-a")
    assert panel_model_ids() == ["model-a", "model-b"]


def test_panel_model_ids_is_empty_when_env_var_is_unset(monkeypatch) -> None:
    monkeypatch.delenv(PANEL_MODELS_ENV_VAR, raising=False)
    assert panel_model_ids() == []


def test_panel_model_ids_is_empty_when_env_var_is_blank(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "   ")
    assert panel_model_ids() == []


def test_build_judge_panel_members_returns_nothing_when_env_var_is_unset(monkeypatch) -> None:
    monkeypatch.delenv(PANEL_MODELS_ENV_VAR, raising=False)

    members, skipped = build_judge_panel_members()

    assert members == []
    assert skipped == []


def test_build_judge_panel_members_builds_one_member_per_recognized_family(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "family-a-model,family-b-model")
    providers = {"family-a": _FakeLLMProvider("family-a"), "family-b": _FakeLLMProvider("family-b")}

    def fake_lineage_family(model_id: str) -> str | None:
        return {"family-a-model": "family-a", "family-b-model": "family-b"}.get(model_id)

    monkeypatch.setattr("app.scoring.judge_panel.lineage_family", fake_lineage_family)

    members, skipped = build_judge_panel_members(provider_lookup=lambda family: providers.get(family))

    assert skipped == []
    assert len(members) == 2
    assert [member.family for member in members] == ["family-a", "family-b"]
    assert [member.model_id for member in members] == ["family-a-model", "family-b-model"]
    assert [member.judge_role for member in members] == [
        judge_panel_role("family-a"),
        judge_panel_role("family-b"),
    ]
    assert all(isinstance(member, JudgePanelMember) for member in members)


def test_build_judge_panel_members_skips_a_model_with_no_configured_provider(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "unrouted-model")
    monkeypatch.setattr("app.scoring.judge_panel.lineage_family", lambda model_id: "unrouted-family")

    members, skipped = build_judge_panel_members(provider_lookup=lambda family: None)

    assert members == []
    assert len(skipped) == 1
    assert skipped[0]["model_id"] == "unrouted-model"
    assert skipped[0]["family"] == "unrouted-family"
    assert skipped[0]["status"] == "unconfigured"
    assert skipped[0]["reason"]


def test_build_judge_panel_members_skips_a_model_whose_family_is_unrecognized(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "opaque-model-id")
    monkeypatch.setattr("app.scoring.judge_panel.lineage_family", lambda model_id: None)

    members, skipped = build_judge_panel_members(provider_lookup=lambda family: None)

    assert members == []
    assert len(skipped) == 1
    assert skipped[0]["model_id"] == "opaque-model-id"
    assert skipped[0]["family"] is None
    assert skipped[0]["status"] == "unconfigured"


def test_build_judge_panel_members_skips_a_model_whose_provider_reports_unavailable(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "family-a-model")
    monkeypatch.setattr("app.scoring.judge_panel.lineage_family", lambda model_id: "family-a")
    unavailable_provider = _FakeLLMProvider("family-a", available=False, reason="CLI not installed")

    members, skipped = build_judge_panel_members(provider_lookup=lambda family: unavailable_provider)

    assert members == []
    assert len(skipped) == 1
    assert skipped[0]["model_id"] == "family-a-model"
    assert skipped[0]["family"] == "family-a"
    assert skipped[0]["status"] == "unavailable"
    assert skipped[0]["reason"] == "CLI not installed"


def test_panel_judge_member_provider_calls_generate_with_json_response_format_and_returns_result(monkeypatch) -> None:
    monkeypatch.setenv(PANEL_MODELS_ENV_VAR, "family-a-model")
    monkeypatch.setattr("app.scoring.judge_panel.lineage_family", lambda model_id: "family-a")
    fake_provider = _FakeLLMProvider("family-a")

    members, skipped = build_judge_panel_members(provider_lookup=lambda family: fake_provider)

    assert skipped == []
    member = members[0]
    result = member.provider.judge_node(_panel_request())

    assert result.provider == "family-a"
    assert result.model == "family-a-model"
    assert result.raw_output == '{"fake": true}'
    assert fake_provider.calls[0]["model"] == "family-a-model"
    assert fake_provider.calls[0]["response_format"] == "json"
    assert fake_provider.calls[0]["role"] == judge_panel_role("family-a")
