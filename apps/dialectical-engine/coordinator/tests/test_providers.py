from __future__ import annotations

from pathlib import Path

import pytest

from app.providers import (
    AgentConfig,
    CodexCliProvider,
    FakeProvider,
    LLMResponse,
    ProviderError,
    ProviderRegistry,
    detect_codex_scoring_config,
    detect_scoring_provider_config,
    load_agent_configs,
)


ENGINE_ROOT = Path(__file__).resolve().parents[2]


def test_agent_config_loads_defaults_and_openai_model_from_settings(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_MODEL", "codex-test-model")

    configs = load_agent_configs(ENGINE_ROOT / "config" / "agents.yaml")

    assert configs["proponent"] == AgentConfig(
        provider="codex",
        model="codex-test-model",
        temperature=0.2,
        max_tokens=None,
    )
    assert configs["judge"].temperature == 0.0
    assert configs["estimator"].temperature == 0.0


def test_agent_config_pins_scoring_judge_to_supported_codex_cli_model(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_MODEL", "codex-gpt-5.5")

    configs = load_agent_configs(ENGINE_ROOT / "config" / "agents.yaml")

    assert configs["proponent"].model == "codex-gpt-5.5"
    assert configs["judge"].provider == "codex"
    assert configs["judge"].model == "gpt-5.5"


def test_registry_uses_fake_provider_without_changing_call_path() -> None:
    registry = ProviderRegistry(
        agents={
            "judge": AgentConfig(provider="fake", model="fake-model", temperature=0.0, max_tokens=128)
        },
        providers={
            "fake": FakeProvider({"judge": "score=0.73"}),
        },
    )

    response = registry.generate_for_role(
        "judge",
        [{"role": "user", "content": "score this claim"}],
        response_format="json",
    )

    assert response == LLMResponse(
        text="score=0.73",
        raw={"provider": "fake", "model": "fake-model", "role": "judge"},
        usage={"tokens_out": 1},
    )


def test_registry_uses_configured_codex_command(monkeypatch) -> None:
    monkeypatch.setenv("CODEX_COMMAND", "codex.cmd")

    registry = ProviderRegistry(agents={})

    assert registry.providers["codex"].executable == "codex.cmd"


def test_registry_rejects_unknown_role() -> None:
    registry = ProviderRegistry(agents={}, providers={"fake": FakeProvider()})

    with pytest.raises(KeyError, match="No agent configured for role specialist"):
        registry.generate_for_role("specialist", [{"role": "user", "content": "hello"}])


def test_codex_scoring_config_detection_reports_available_judge_config() -> None:
    status = detect_codex_scoring_config(
        {"judge": AgentConfig(provider="codex", model="codex-gpt-5.5", temperature=0.0)}
    )

    assert status.model_dump() == {
        "available": True,
        "role": "judge",
        "provider": "codex",
        "model": "codex-gpt-5.5",
        "reason": None,
    }


def test_codex_scoring_config_detection_reports_missing_config_as_unavailable() -> None:
    status = detect_codex_scoring_config({})

    assert status.available is False
    assert status.role == "judge"
    assert status.provider is None
    assert status.model is None
    assert status.reason == "No judge agent is configured for scoring."


def test_codex_scoring_config_detection_reports_non_codex_provider_as_unavailable() -> None:
    status = detect_codex_scoring_config(
        {"judge": AgentConfig(provider="fake", model="fake-model", temperature=0.0)}
    )

    assert status.available is False
    assert status.provider == "fake"
    assert status.model == "fake-model"
    assert status.reason == "Configured judge provider is not codex."


def test_scoring_provider_config_detection_accepts_registered_non_codex_provider() -> None:
    status = detect_scoring_provider_config(
        {"judge": AgentConfig(provider="fake", model="fake-model", temperature=0.0)},
        providers={"fake": FakeProvider()},
    )

    assert status.model_dump() == {
        "available": True,
        "role": "judge",
        "provider": "fake",
        "model": "fake-model",
        "reason": None,
    }


def test_scoring_provider_config_detection_reports_unregistered_provider() -> None:
    status = detect_scoring_provider_config(
        {"judge": AgentConfig(provider="missing", model="missing-model", temperature=0.0)},
        providers={"fake": FakeProvider()},
    )

    assert status.available is False
    assert status.provider == "missing"
    assert status.model == "missing-model"
    assert status.reason == "Configured judge provider is not registered: missing."


def test_codex_provider_builds_cli_command_without_live_call() -> None:
    provider = CodexCliProvider(executable="codex")

    command = provider.command(
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "user"}],
        model="gpt-5.5",
        max_tokens=200,
        response_format="json",
    )

    assert command[:3] == ["codex", "exec", "--skip-git-repo-check"]
    assert "--ignore-rules" in command
    assert command[command.index("--sandbox") + 1] == "read-only"
    assert "--model" in command
    assert "gpt-5.5" in command
    assert "Return only valid JSON." in command[-1]
    assert "Keep the answer under 200 tokens." in command[-1]


def test_codex_provider_reports_missing_cli_without_generation(monkeypatch) -> None:
    provider = CodexCliProvider(executable="missing-codex")
    run_called = False

    def fake_run(*args, **kwargs):
        nonlocal run_called
        run_called = True
        raise AssertionError("availability check must not invoke generation")

    monkeypatch.setattr("app.providers.codex_cli.shutil.which", lambda executable: None)
    monkeypatch.setattr("app.providers.codex_cli.subprocess.run", fake_run)

    status = provider.availability()

    assert status.available is False
    assert status.provider == "codex"
    assert status.reason == "Codex executable not found: missing-codex"
    assert run_called is False


def test_codex_provider_uses_resolved_cli_path_for_generation(monkeypatch) -> None:
    provider = CodexCliProvider(executable="codex")
    captured: dict[str, object] = {}

    class Completed:
        returncode = 0
        stdout = '{"status":"unavailable","reason":"fixture"}'
        stderr = ""

    def fake_run(command, *args, **kwargs):
        captured["command"] = command
        return Completed()

    monkeypatch.setattr("app.providers.codex_cli.shutil.which", lambda executable: "C:\\Users\\vladm\\AppData\\Roaming\\npm\\codex.CMD")
    monkeypatch.setattr("app.providers.codex_cli.subprocess.run", fake_run)

    provider.generate([{"role": "user", "content": "score"}], model="gpt-5.5")

    assert captured["command"][0] == "C:\\Users\\vladm\\AppData\\Roaming\\npm\\codex.CMD"


def test_codex_provider_reads_clean_last_message_output(monkeypatch) -> None:
    provider = CodexCliProvider(executable="codex")
    captured: dict[str, object] = {}

    class Completed:
        returncode = 0
        stdout = "noisy transcript"
        stderr = ""

    def fake_run(command, *args, **kwargs):
        captured["command"] = command
        captured["input"] = kwargs.get("input")
        output_path = command[command.index("--output-last-message") + 1]
        Path(output_path).write_text('{"status":"unavailable","reason":"fixture"}', encoding="utf-8")
        return Completed()

    monkeypatch.setattr("app.providers.codex_cli.shutil.which", lambda executable: "codex.cmd")
    monkeypatch.setattr("app.providers.codex_cli.subprocess.run", fake_run)

    response = provider.generate([{"role": "user", "content": "score"}], model="gpt-5.5")

    assert response.text == '{"status":"unavailable","reason":"fixture"}'
    assert response.raw["stdout"] == "noisy transcript"
    assert "--cd" in captured["command"]
    assert captured["command"][captured["command"].index("--cd") + 1]
    assert captured["command"][-1] == "-"
    assert captured["input"] == "USER:\nscore"


def test_codex_provider_reports_compact_nonzero_cli_error(monkeypatch) -> None:
    provider = CodexCliProvider(executable="codex.cmd")

    class Completed:
        returncode = 1
        stdout = ""
        stderr = "\n".join(
            [
                "2026-06-23T15:06:21Z WARN noisy setup detail",
                "ERROR: Reconnecting... 5/5",
                "ERROR: stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)",
            ]
        )

    monkeypatch.setattr("app.providers.codex_cli.shutil.which", lambda executable: executable)
    monkeypatch.setattr("app.providers.codex_cli.subprocess.run", lambda *args, **kwargs: Completed())

    with pytest.raises(
        ProviderError,
        match=(
            "Codex command exited with code 1: stream disconnected before completion: "
            "error sending request"
        ),
    ):
        provider.generate([{"role": "user", "content": "score"}], model="codex-gpt-5.5")


def test_proposal_engine_modules_outside_providers_do_not_reference_vendors() -> None:
    checked_roots = [
        ENGINE_ROOT / "coordinator" / "app" / "debate",
        ENGINE_ROOT / "coordinator" / "app" / "evaluation",
        ENGINE_ROOT / "coordinator" / "app" / "evidence",
        ENGINE_ROOT / "coordinator" / "app" / "metareasoning",
        ENGINE_ROOT / "coordinator" / "app" / "orchestration",
        ENGINE_ROOT / "coordinator" / "app" / "qbaf",
        ENGINE_ROOT / "coordinator" / "app" / "scoring",
    ]
    forbidden = ["openai", "codex", "anthropic", "claude", "gemini", "grok", "ollama"]
    offenders: list[str] = []
    for root in checked_roots:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            text = path.read_text().lower()
            for token in forbidden:
                if token in text:
                    offenders.append(f"{path.relative_to(ENGINE_ROOT)} contains {token}")

    assert offenders == []
