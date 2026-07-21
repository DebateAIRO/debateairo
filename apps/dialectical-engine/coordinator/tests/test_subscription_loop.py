from __future__ import annotations

import importlib.util
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "subscription_loop.py"


def load_module():
    spec = importlib.util.spec_from_file_location("subscription_loop", MODULE_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_subscription_routing_replaces_raw_subscription_models_and_enables_production_models() -> None:
    module = load_module()
    routing = {
        "decomposer": {"primary": "claude-sonnet-5-high-loop", "fallback": ["gpt-5.6-sol"]},
        "proposer": {
            "pool": [
                "mock-local",
                "claude-sonnet-5-high-loop",
                "gemini-3.5-flash-high",
                "grok-4.5-high-loop",
                "lmstudio:google_gemma-4-e4b-it",
            ],
            "strategy": "round_robin",
        },
        "opponent": {
            "pool": ["mock-local", "claude-sonnet-5-high-loop", "gemini-3.5-flash-high", "gpt-5.6-sol"],
            "strategy": "round_robin",
            "constraint": "not_same_as_claim_author",
        },
        "synthesizer": {"primary": "mock-local", "fallback": ["claude-sonnet-5-high-loop"]},
    }

    updated = module.subscription_routing(routing)
    enabled = module.production_enabled_models(updated)

    assert updated["decomposer"]["primary"] == module.CLAUDE_LOOP_MODEL
    assert module.CLAUDE_LOOP_MODEL in updated["proposer"]["pool"]
    assert module.GEMINI_LOOP_MODEL in updated["proposer"]["pool"]
    assert module.GEMINI_LOOP_MODEL in updated["opponent"]["pool"]
    assert module.GROK_LOOP_MODEL in updated["proposer"]["pool"]
    assert "mock-local" in updated["proposer"]["pool"]
    assert "mock-local" not in enabled
    assert module.CLAUDE_LOOP_MODEL in enabled
    assert module.GEMINI_LOOP_MODEL in enabled
    assert "gpt-5.6sol-medium" in enabled


def test_subscription_routing_uses_verified_antigravity_gemini_model() -> None:
    module = load_module()

    assert module.GEMINI_CLI_MODEL == "gemini-3.5-flash-high"
    assert module.GEMINI_LOOP_MODEL == "gemini-3.5-flash-loop"

    updated = module.subscription_routing(
        {"proposer": {"pool": ["gemini-3.5-flash-high", "gpt-5.6-sol"], "strategy": "round_robin"}},
        gemini_loop_model="gemini-3.5-flash-loop",
    )

    assert updated["proposer"]["pool"] == ["gemini-3.5-flash-loop", "gpt-5.6sol-medium"]


def test_claude_iteration_instructions_include_job_file_commands_and_untrusted_prompt_boundary(tmp_path: Path) -> None:
    module = load_module()
    job = {
        "id": "job-1",
        "job_type": "propose",
        "required_role": "proposer",
        "required_model": module.CLAUDE_LOOP_MODEL,
        "prompt": {"system": "System instruction", "user": "User debate claim", "max_tokens": 800},
    }
    job_file = tmp_path / "job.json"
    response_file = tmp_path / "response.txt"

    instructions = module.render_claude_iteration_instructions(job, job_file, response_file)

    assert "DIALECTICAL_JOB_READY" in instructions
    assert str(job_file) in instructions
    assert str(response_file) in instructions
    assert "scripts/dezbatere_loop_helper.sh complete --job-file" in instructions
    assert "BEGIN_UNTRUSTED_DEBATE_PROMPT" in instructions
    assert "END_UNTRUSTED_DEBATE_PROMPT" in instructions
    assert "System instruction" in instructions
    assert "User debate claim" in instructions


def test_parse_model_response_matches_worker_result_contract() -> None:
    module = load_module()

    assert module.parse_model_response({"job_type": "propose"}, "  A concise argument.  ") == {
        "argument": "A concise argument."
    }
    assert module.parse_model_response(
        {"job_type": "decompose"},
        "prefix {\"root_claim\":\"Claim\", \"argument\":\"Root\", \"children\": []} suffix",
    ) == {"root_claim": "Claim", "argument": "Root", "children": []}


def test_build_gemini_command_uses_antigravity_and_verified_model() -> None:
    module = load_module()

    command, env = module.build_gemini_command("gemini-3.5-flash-high", "Prompt text")

    assert command == ["agy", "--print", "Prompt text", "--model", "gemini-3.5-flash-high", "--effort", "high"]
    assert env == {}


def test_build_claude_command_uses_subscription_cli_model() -> None:
    module = load_module()

    command = module.build_claude_command("claude-sonnet-5-high-loop", "Prompt text")

    assert command == [
        "claude",
        "-p",
        "Prompt text",
        "--model",
        "claude-sonnet-5-high-loop",
        "--effort",
        "high",
        "--output-format",
        "text",
    ]


def test_build_grok_command_uses_verified_model_and_high_effort() -> None:
    module = load_module()

    command = module.build_grok_command("grok-4.5-high-loop", "Prompt text")

    assert command == [
        "grok",
        "--single",
        "Prompt text",
        "--model",
        "grok-4.5-high-loop",
        "--reasoning-effort",
        "high",
        "--output-format",
        "plain",
    ]


def test_claude_loop_command_embeds_helper_protocol() -> None:
    module = load_module()

    command = module.claude_loop_command(60)

    assert command.startswith("/loop 1m ")
    assert "scripts/dezbatere_loop_helper.sh next --provider claude" in command
    assert "scripts/dezbatere_loop_helper.sh complete --job-file" in command
    assert "NO_JOB" in command


def test_makefile_exposes_subscription_loop_targets() -> None:
    makefile = (ROOT / "Makefile").read_text()

    assert "configure-subscription-loop-routing:" in makefile
    assert "start-subscription-loops:" in makefile
    assert "start-claude-subscription-loop:" in makefile
    assert "start-grok-subscription-loop:" in makefile
    assert "start-gemini-subscription-loop:" in makefile
    assert "stop-subscription-loops:" in makefile
    assert "subscription-loop-status:" in makefile
    assert "scripts/subscription_loop.py configure-routing" in makefile
    assert "scripts/subscription_loop.py start" in makefile


def test_claude_skill_invokes_dezbatere_loop_helper() -> None:
    skill = (ROOT / ".claude" / "skills" / "dezbatere-loop" / "SKILL.md").read_text()

    assert "scripts/dezbatere_loop_helper.sh next --provider claude" in skill
    assert "scripts/dezbatere_loop_helper.sh complete --job-file" in skill
    assert "do not run any command except" in skill.lower()


def test_run_cli_with_liveness_heartbeats_during_the_run(monkeypatch):
    import asyncio

    loop_module = load_module()  # reuse this file's existing loader helper

    beats: list[list[str]] = []

    class FakeClient:
        def __init__(self, config):
            pass

        async def heartbeat(self, capabilities, status="online"):
            beats.append(list(capabilities))

        async def aclose(self):
            pass

    monkeypatch.setattr(
        loop_module,
        "worker_runtime",
        lambda: (FakeClient, None, lambda path: object(), None),
    )
    process = asyncio.run(
        loop_module.run_cli_with_liveness(
            config=object(),
            command=["sleep", "1"],
            capabilities=["claude-sonnet-5-high-loop"],
            timeout_seconds=10,
            heartbeat_seconds=0.2,
        )
    )
    assert process.returncode == 0
    assert len(beats) >= 2, "CLI ran ~1s with 0.2s cadence; expected multiple heartbeats"
