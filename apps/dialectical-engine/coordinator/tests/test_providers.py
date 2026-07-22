from __future__ import annotations

from pathlib import Path

import pytest

from app.providers import (
    AgentConfig,
    ClaudeCliProvider,
    CodexCliProvider,
    FakeProvider,
    GeminiCliProvider,
    LLMResponse,
    ProviderError,
    ProviderRegistry,
    detect_codex_scoring_config,
    detect_scoring_provider_config,
    load_agent_configs,
    panel_cli_provider_for_family,
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
    monkeypatch.setenv("OPENAI_MODEL", "gpt-5.6sol-medium")

    configs = load_agent_configs(ENGINE_ROOT / "config" / "agents.yaml")

    assert configs["proponent"].model == "gpt-5.6sol-medium"
    assert configs["judge"].provider == "codex"
    assert configs["judge"].model == "gpt-5.6sol-medium"


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
        {"judge": AgentConfig(provider="codex", model="gpt-5.6sol-medium", temperature=0.0)}
    )

    assert status.model_dump() == {
        "available": True,
        "role": "judge",
        "provider": "codex",
        "model": "gpt-5.6sol-medium",
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
        model="gpt-5.6sol-medium",
        max_tokens=200,
        response_format="json",
    )

    assert command[:3] == ["codex", "exec", "--skip-git-repo-check"]
    assert "--ignore-rules" in command
    assert command[command.index("--sandbox") + 1] == "read-only"
    assert "--model" in command
    assert "gpt-5.6-sol" in command
    assert "model_reasoning_effort=medium" in command
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

    provider.generate([{"role": "user", "content": "score"}], model="gpt-5.6-sol")

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

    response = provider.generate([{"role": "user", "content": "score"}], model="gpt-5.6-sol")

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
        provider.generate([{"role": "user", "content": "score"}], model="gpt-5.6sol-medium")


# Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
# §P2.2 point 2): coordinator-side, in-process CLI providers for the claude
# and gemini CLIs, siblings of CodexCliProvider above. Command construction
# mirrors worker/app/adapters/claude_cli.py / gemini_cli.py's --model/
# --effort flags and scripts/subscription_loop.py's build_claude_command /
# build_gemini_command's single-shot (non-streaming) invocation -- NOT the
# worker's --output-format stream-json delta feed, since the coordinator
# wants one plain-text response it can feed straight to
# app.scoring.parser.parse_judge_json, the same way CodexCliProvider does.
def test_claude_provider_builds_cli_command_without_live_call() -> None:
    provider = ClaudeCliProvider(executable="claude")

    command = provider.command(
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "user"}],
        model="claude-sonnet-5-high-loop",
        response_format="json",
    )

    assert command[0] == "claude"
    assert "-p" in command
    assert command[command.index("--model") + 1] == "claude-sonnet-5"
    assert command[command.index("--effort") + 1] == "high"
    assert command[command.index("--output-format") + 1] == "text"
    assert "Return only valid JSON." in command[command.index("-p") + 1]


def test_claude_provider_passes_through_an_unrecognized_model_id_unchanged() -> None:
    provider = ClaudeCliProvider(executable="claude")

    command = provider.command(
        [{"role": "user", "content": "hi"}],
        model="claude-future-model",
    )

    assert command[command.index("--model") + 1] == "claude-future-model"


def test_claude_provider_reports_missing_cli_without_generation(monkeypatch) -> None:
    provider = ClaudeCliProvider(executable="missing-claude")
    run_called = False

    def fake_run(*args, **kwargs):
        nonlocal run_called
        run_called = True
        raise AssertionError("availability check must not invoke generation")

    monkeypatch.setattr("app.providers.claude_cli.shutil.which", lambda executable: None)
    monkeypatch.setattr("app.providers.claude_cli.subprocess.run", fake_run)

    status = provider.availability()

    assert status.available is False
    assert status.provider == "claude"
    assert status.reason == "Claude executable not found: missing-claude"
    assert run_called is False


def test_claude_provider_uses_resolved_cli_path_and_returns_stripped_stdout(monkeypatch) -> None:
    provider = ClaudeCliProvider(executable="claude")
    captured: dict[str, object] = {}

    class Completed:
        returncode = 0
        stdout = '{"status":"unavailable"}\n'
        stderr = ""

    def fake_run(command, *args, **kwargs):
        captured["command"] = command
        return Completed()

    monkeypatch.setattr("app.providers.claude_cli.shutil.which", lambda executable: "/usr/local/bin/claude")
    monkeypatch.setattr("app.providers.claude_cli.subprocess.run", fake_run)

    response = provider.generate([{"role": "user", "content": "score"}], model="claude-sonnet-5-high-loop")

    assert captured["command"][0] == "/usr/local/bin/claude"
    assert response.text == '{"status":"unavailable"}'


def test_claude_provider_reports_compact_nonzero_cli_error(monkeypatch) -> None:
    provider = ClaudeCliProvider(executable="claude")

    class Completed:
        returncode = 1
        stdout = ""
        stderr = "fatal: authentication required\n"

    monkeypatch.setattr("app.providers.claude_cli.shutil.which", lambda executable: executable)
    monkeypatch.setattr("app.providers.claude_cli.subprocess.run", lambda *args, **kwargs: Completed())

    with pytest.raises(ProviderError, match="Claude command exited with code 1: fatal: authentication required"):
        provider.generate([{"role": "user", "content": "score"}], model="claude-sonnet-5-high-loop")


def test_claude_provider_times_out(monkeypatch) -> None:
    import subprocess

    provider = ClaudeCliProvider(executable="claude", timeout_seconds=5)

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="claude", timeout=5)

    monkeypatch.setattr("app.providers.claude_cli.shutil.which", lambda executable: "claude")
    monkeypatch.setattr("app.providers.claude_cli.subprocess.run", fake_run)

    with pytest.raises(TimeoutError):
        provider.generate([{"role": "user", "content": "score"}], model="claude-sonnet-5-high-loop")


def test_gemini_provider_builds_cli_command_without_live_call() -> None:
    provider = GeminiCliProvider(executable="agy")

    command = provider.command(
        [{"role": "user", "content": "score this"}],
        model="gemini-3.5-flash-loop",
        response_format="json",
    )

    assert command[0] == "agy"
    assert command[1] == "--print"
    assert command[command.index("--model") + 1] == "gemini-3.5-flash-high"
    assert command[command.index("--effort") + 1] == "high"
    assert "--output-format" not in command
    assert "Return only valid JSON." in command[2]


def test_gemini_provider_passes_through_an_unrecognized_model_id_unchanged() -> None:
    provider = GeminiCliProvider(executable="agy")

    command = provider.command([{"role": "user", "content": "hi"}], model="gemini-future-model")

    assert command[command.index("--model") + 1] == "gemini-future-model"


def test_gemini_provider_reports_missing_cli_without_generation(monkeypatch) -> None:
    provider = GeminiCliProvider(executable="missing-agy")
    run_called = False

    def fake_run(*args, **kwargs):
        nonlocal run_called
        run_called = True
        raise AssertionError("availability check must not invoke generation")

    monkeypatch.setattr("app.providers.gemini_cli.shutil.which", lambda executable: None)
    monkeypatch.setattr("app.providers.gemini_cli.subprocess.run", fake_run)

    status = provider.availability()

    assert status.available is False
    assert status.provider == "gemini"
    assert status.reason == "Gemini executable not found: missing-agy"
    assert run_called is False


def test_gemini_provider_uses_resolved_cli_path_and_returns_stripped_stdout(monkeypatch) -> None:
    provider = GeminiCliProvider(executable="agy")
    captured: dict[str, object] = {}

    class Completed:
        returncode = 0
        stdout = '{"status":"unavailable"}\n'
        stderr = ""

    def fake_run(command, *args, **kwargs):
        captured["command"] = command
        return Completed()

    monkeypatch.setattr("app.providers.gemini_cli.shutil.which", lambda executable: "/usr/local/bin/agy")
    monkeypatch.setattr("app.providers.gemini_cli.subprocess.run", fake_run)

    response = provider.generate([{"role": "user", "content": "score"}], model="gemini-3.5-flash-loop")

    assert captured["command"][0] == "/usr/local/bin/agy"
    assert response.text == '{"status":"unavailable"}'


def test_gemini_provider_reports_compact_nonzero_cli_error(monkeypatch) -> None:
    provider = GeminiCliProvider(executable="agy")

    class Completed:
        returncode = 1
        stdout = ""
        stderr = "fatal: not authenticated\n"

    monkeypatch.setattr("app.providers.gemini_cli.shutil.which", lambda executable: executable)
    monkeypatch.setattr("app.providers.gemini_cli.subprocess.run", lambda *args, **kwargs: Completed())

    with pytest.raises(ProviderError, match="Gemini command exited with code 1: fatal: not authenticated"):
        provider.generate([{"role": "user", "content": "score"}], model="gemini-3.5-flash-loop")


def test_gemini_provider_times_out(monkeypatch) -> None:
    import subprocess

    provider = GeminiCliProvider(executable="agy", timeout_seconds=5)

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="agy", timeout=5)

    monkeypatch.setattr("app.providers.gemini_cli.shutil.which", lambda executable: "agy")
    monkeypatch.setattr("app.providers.gemini_cli.subprocess.run", fake_run)

    with pytest.raises(TimeoutError):
        provider.generate([{"role": "user", "content": "score"}], model="gemini-3.5-flash-loop")


def test_panel_cli_provider_for_family_resolves_claude_and_gemini() -> None:
    claude = panel_cli_provider_for_family("claude")
    gemini = panel_cli_provider_for_family("gemini")

    assert isinstance(claude, ClaudeCliProvider)
    assert isinstance(gemini, GeminiCliProvider)


def test_panel_cli_provider_for_family_returns_none_for_unconfigured_family() -> None:
    assert panel_cli_provider_for_family("grok") is None
    assert panel_cli_provider_for_family("unknown") is None
    assert panel_cli_provider_for_family("") is None


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
    # app/scoring/lineage.py classifies an opaque model_id string into a
    # coarse vendor "family" bucket so judge/arguer independence can be
    # reported honestly (never fabricated) -- see lineage_family()'s
    # docstring. That is scoring-domain independence logic, not a vendor API
    # integration, so app/providers is not the right home for it; the exact
    # vendor-family tokens its classification table needs are allowlisted
    # here rather than banned, while any other vendor leak in the file (e.g.
    # "ollama") still fails the test.
    # Task 6 (cross-family judge panel, docs/improvement-plan-2026-07-22.md
    # §P2.2): lineage.py's panel_vendor_family adds a second classification
    # table (gpt*/codex -> "openai", claude* -> "anthropic") for the
    # sole_judge_family_matches_author comparison -- "openai"/"anthropic"
    # join the allowlist for the same reason "codex"/"claude"/"gemini"/
    # "grok" are already there.
    allowed_vendor_tokens = {
        "coordinator/app/scoring/lineage.py": {"codex", "claude", "gemini", "grok", "openai", "anthropic"},
    }
    offenders: list[str] = []
    for root in checked_roots:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            relative = path.relative_to(ENGINE_ROOT)
            allowed_tokens = allowed_vendor_tokens.get(str(relative), set())
            text = path.read_text().lower()
            for token in forbidden:
                if token in allowed_tokens:
                    continue
                if token in text:
                    offenders.append(f"{relative} contains {token}")

    assert offenders == []
