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

    invocation = module.build_gemini_command("gemini-3.5-flash-high", "Prompt text")

    assert invocation.command == [
        "agy",
        "--print",
        "Prompt text",
        "--model",
        "gemini-3.5-flash-high",
        "--effort",
        "high",
    ]
    assert invocation.env == {}
    assert invocation.stdin_text is None
    assert invocation.cleanup_paths == ()


def test_build_claude_command_uses_subscription_cli_model() -> None:
    module = load_module()

    invocation = module.build_claude_command("claude-sonnet-5-high-loop", "Prompt text")

    # Every flag is unchanged; only the prompt moved off argv onto stdin.
    assert invocation.command == [
        "claude",
        "-p",
        "--model",
        "claude-sonnet-5-high-loop",
        "--effort",
        "high",
        "--output-format",
        "text",
    ]
    assert invocation.stdin_text == "Prompt text"


def test_parse_model_response_treats_v2_evidence_as_json() -> None:
    module = load_module()

    parsed = module.parse_model_response(
        {"job_type": "v2_evidence"},
        'prefix {"sources": [], "provenance": {"model_id": "m"}} suffix',
    )
    assert parsed == {"sources": [], "provenance": {"model_id": "m"}}


def _run_claude_once_capture(tmp_path, monkeypatch, job_type: str) -> list[str]:
    """Drive claude_once for a job of `job_type` and return the CLI argv that
    was handed to run_cli_with_liveness (no real CLI, no coordinator I/O)."""
    import argparse
    import asyncio
    import subprocess

    loop_module = load_module()
    captured: dict[str, list[str]] = {}

    class FakeClient:
        def __init__(self, config):
            pass

        async def register(self, models, save_path=None):
            pass

        async def heartbeat(self, capabilities, status="online"):
            pass

        async def poll(self):
            return {
                "id": "job-evidence-1",
                "job_type": job_type,
                "required_role": "v2_evidence",
                "required_model": loop_module.CLAUDE_LOOP_MODEL,
                "prompt": {"system": "System instruction", "user": "User claim", "max_tokens": 800},
            }

        async def aclose(self):
            pass

    class FakeWorkerConfig:
        def __init__(self):
            self.coordinator_url = ""
            self.name = None
            self.enable_mock = True
            self.enable_real_adapters = True
            self.allowed_models = None
            self.user_token = None

    async def fake_run_cli(config, command, **kwargs):
        captured["command"] = command
        return subprocess.CompletedProcess(args=command, returncode=0, stdout='{"sources": []}', stderr="")

    async def fake_complete(args):
        return 0

    monkeypatch.setattr(
        loop_module,
        "worker_runtime",
        lambda: (FakeClient, FakeWorkerConfig, lambda path: FakeWorkerConfig(), lambda config, path=None: None),
    )
    monkeypatch.setattr(loop_module, "run_cli_with_liveness", fake_run_cli)
    monkeypatch.setattr(loop_module, "complete_from_job_file", fake_complete)

    args = argparse.Namespace(
        config=str(tmp_path / "config.toml"),
        worker_name="test-claude-loop",
        coordinator_url="http://example.test",
        advertised_model=loop_module.CLAUDE_LOOP_MODEL,
        claude_model=loop_module.CLAUDE_LOOP_MODEL,
        state_dir=str(tmp_path),
        timeout_seconds=30,
    )
    result = asyncio.run(loop_module.claude_once(args))
    assert result == 0
    return captured["command"]


def test_claude_once_appends_websearch_tool_for_evidence_jobs(tmp_path, monkeypatch) -> None:
    command = _run_claude_once_capture(tmp_path, monkeypatch, "v2_evidence")
    assert "--allowedTools" in command
    idx = command.index("--allowedTools")
    assert command[idx + 1] == "WebSearch"


def test_claude_once_omits_websearch_tool_for_non_evidence_jobs(tmp_path, monkeypatch) -> None:
    command = _run_claude_once_capture(tmp_path, monkeypatch, "v2_pov")
    assert "--allowedTools" not in command
    assert "WebSearch" not in command


def test_build_grok_command_uses_verified_model_and_high_effort(tmp_path: Path) -> None:
    module = load_module()

    invocation = module.build_grok_command("grok-4.5-high-loop", "Prompt text", prompt_dir=tmp_path)

    prompt_path = invocation.command[2]
    # Every flag is unchanged except the single-turn prompt source: `--single
    # <PROMPT>` (argv) becomes grok's own `--prompt-file <PATH>`.
    assert invocation.command == [
        "grok",
        "--prompt-file",
        prompt_path,
        "--model",
        "grok-4.5-high-loop",
        "--reasoning-effort",
        "high",
        "--output-format",
        "plain",
    ]
    assert Path(prompt_path).parent == tmp_path
    assert Path(prompt_path).read_text(encoding="utf-8") == "Prompt text"
    assert invocation.cleanup_paths == (Path(prompt_path),)
    assert invocation.stdin_text is None

    invocation.cleanup()
    assert not Path(prompt_path).exists()


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


def test_claude_once_reports_retryable_failure_when_the_cli_times_out(tmp_path, monkeypatch):
    """Fix 2: a CLI that hangs past --timeout-seconds must not crash the loop
    iteration with a raw subprocess.TimeoutExpired -- it must be caught and
    reported through the same fail path a nonzero exit code takes, so the
    loop harness can move on to the next job."""
    import argparse
    import asyncio

    loop_module = load_module()

    fail_calls: list[tuple[str, str, bool]] = []

    class FakeClient:
        def __init__(self, config):
            pass

        async def register(self, models, save_path=None):
            pass

        async def heartbeat(self, capabilities, status="online"):
            pass

        async def poll(self):
            return {
                "id": "job-timeout-1",
                "job_type": "propose",
                "required_role": "proposer",
                "required_model": loop_module.CLAUDE_LOOP_MODEL,
                "prompt": {"system": "System instruction", "user": "User claim", "max_tokens": 800},
            }

        async def fail(self, job_id, reason, retryable=True):
            fail_calls.append((job_id, reason, retryable))

        async def aclose(self):
            pass

    class FakeWorkerConfig:
        """Plain attribute bag standing in for worker.app.config.WorkerConfig
        -- loop_config() only ever assigns attributes onto it. Faked (rather
        than importing the real worker package) because the worker's `app.*`
        and the coordinator's `app.*` collide under the shared 'app' name
        once pytest has already imported the coordinator's app package."""

        def __init__(self):
            self.coordinator_url = ""
            self.name = None
            self.enable_mock = True
            self.enable_real_adapters = True
            self.allowed_models = None
            self.user_token = None

    monkeypatch.setattr(
        loop_module,
        "worker_runtime",
        lambda: (FakeClient, FakeWorkerConfig, lambda path: FakeWorkerConfig(), lambda config, path=None: None),
    )
    # The CLI command itself is irrelevant to the fix -- swap in a command
    # that reliably outlives a 1s timeout instead of shelling out to `claude`.
    monkeypatch.setattr(
        loop_module,
        "build_claude_command",
        lambda model, prompt: loop_module.CliInvocation(command=["sleep", "5"]),
    )

    args = argparse.Namespace(
        config=str(tmp_path / "config.toml"),
        worker_name="test-claude-loop",
        coordinator_url="http://example.test",
        advertised_model=loop_module.CLAUDE_LOOP_MODEL,
        claude_model=loop_module.CLAUDE_LOOP_MODEL,
        state_dir=str(tmp_path),
        timeout_seconds=1,
    )

    result = asyncio.run(loop_module.claude_once(args))

    assert result == 0
    assert len(fail_calls) == 1
    job_id, reason, retryable = fail_calls[0]
    assert job_id == "job-timeout-1"
    assert retryable is True
    assert "1s" in reason


def test_job_files_are_keyed_by_job_id(tmp_path):
    loop_module = load_module()
    job = {"id": "job-abc123", "job_type": "v2_pov", "prompt": {"system": "s", "user": "u", "max_tokens": 100}}
    job_file, response_file = loop_module.write_job_file(
        provider="claude",
        config_path=tmp_path / "config.json",
        job=job,
        state_dir=tmp_path,
    )
    assert "job-abc123" in job_file.name
    assert "job-abc123" in response_file.name


def test_slot_names_are_unique_and_slot_one_keeps_the_base_name():
    loop_module = load_module()
    assert loop_module.slot_worker_name("claude-sonnet-loop", 1) == "claude-sonnet-loop"
    assert loop_module.slot_worker_name("claude-sonnet-loop", 3) == "claude-sonnet-loop-s3"


def test_start_claude_loop_default_slot_matches_legacy_single_slot_behavior(monkeypatch):
    module = load_module()
    calls = []
    monkeypatch.setattr(module, "start_tmux_session", lambda session, command: calls.append((session, command)))
    parser = module.build_parser()
    args = parser.parse_args(["start-claude"])

    result = module.start_claude_loop(args)

    assert result == 0
    assert len(calls) == 1
    session, command = calls[0]
    assert session == "dialectical-claude-loop" == args.claude_session
    assert f"--worker-name {args.claude_worker_name} " in command
    assert f"--config {args.claude_config} " in command


def test_start_claude_loop_with_slots_creates_one_session_per_slot_with_unique_identities(monkeypatch):
    module = load_module()
    calls = []
    monkeypatch.setattr(module, "start_tmux_session", lambda session, command: calls.append((session, command)))
    parser = module.build_parser()
    args = parser.parse_args(["start-claude", "--slots", "3"])

    result = module.start_claude_loop(args)

    assert result == 0
    sessions = [session for session, _ in calls]
    assert sessions == [
        "dialectical-claude-loop",
        "dialectical-claude-loop-s2",
        "dialectical-claude-loop-s3",
    ]
    # slot 1 keeps the legacy worker name and config path so existing deployments are unchanged
    assert f"--worker-name {args.claude_worker_name} " in calls[0][1]
    assert f"--config {args.claude_config} " in calls[0][1]
    # slots 2 and 3 each register a distinct worker identity against a distinct config path
    assert f"--worker-name {args.claude_worker_name}-s2 " in calls[1][1]
    assert f"--config {args.claude_config}.s2 " in calls[1][1]
    assert f"--worker-name {args.claude_worker_name}-s3 " in calls[2][1]
    assert f"--config {args.claude_config}.s3 " in calls[2][1]


def test_start_grok_loop_with_slots_creates_one_session_per_slot_with_unique_identities(monkeypatch):
    module = load_module()
    calls = []
    monkeypatch.setattr(module, "start_tmux_session", lambda session, command: calls.append((session, command)))
    parser = module.build_parser()
    args = parser.parse_args(["start-grok", "--slots", "2"])

    result = module.start_grok_loop(args)

    assert result == 0
    sessions = [session for session, _ in calls]
    assert sessions == ["dialectical-grok-loop", "dialectical-grok-loop-s2"]
    assert f"--worker-name {args.grok_worker_name} " in calls[0][1]
    assert f"--config {args.grok_config} " in calls[0][1]
    assert f"--worker-name {args.grok_worker_name}-s2 " in calls[1][1]
    assert f"--config {args.grok_config}.s2 " in calls[1][1]


def test_start_gemini_loop_with_slots_creates_one_session_per_slot_with_unique_identities(monkeypatch):
    module = load_module()
    calls = []
    monkeypatch.setattr(module, "start_tmux_session", lambda session, command: calls.append((session, command)))
    parser = module.build_parser()
    args = parser.parse_args(["start-gemini", "--slots", "2"])

    result = module.start_gemini_loop(args)

    assert result == 0
    sessions = [session for session, _ in calls]
    assert sessions == ["dialectical-gemini-loop", "dialectical-gemini-loop-s2"]
    assert f"--worker-name {args.gemini_worker_name} " in calls[0][1]
    assert f"--config {args.gemini_config} " in calls[0][1]
    assert f"--worker-name {args.gemini_worker_name}-s2 " in calls[1][1]
    assert f"--config {args.gemini_config}.s2 " in calls[1][1]


def test_start_loop_subcommands_default_slots_to_one():
    module = load_module()
    parser = module.build_parser()

    assert parser.parse_args(["start-claude"]).slots == 1
    assert parser.parse_args(["start-grok"]).slots == 1
    assert parser.parse_args(["start-gemini"]).slots == 1


# --------------------------------------------------------------------------
# ARG_MAX transport (live incident 2026-07-26, debate 0f688d87 @ 91 nodes)
#
# `build_gemini_command` passed the whole rendered prompt as ONE argv element,
# so at 91 nodes the gemini loop died in subprocess.run with
#   OSError: [Errno 7] Argument list too long: 'agy'
# and the job crash/requeue-looped 4 times without ever reaching the model.
# macOS ARG_MAX is 1 MiB (getconf ARG_MAX = 1048576) counting argv AND envp;
# Linux additionally caps a single argv element at 128 KiB (MAX_ARG_STRLEN).
# --------------------------------------------------------------------------

FRONTIER_PROMPT_BYTES = 2 * 1024 * 1024  # 2 MiB: comfortably past every wall
SAFE_TOTAL_ARGV_BYTES = 256 * 1024


def _frontier_prompt() -> str:
    body = "A frontier-scale debate node payload. " * 64
    return (body * (FRONTIER_PROMPT_BYTES // len(body) + 1))[:FRONTIER_PROMPT_BYTES]


def _argv_bytes(command: list[str]) -> int:
    """Exec footprint of an argv list: each element plus its NUL terminator."""
    return sum(len(part.encode("utf-8")) + 1 for part in command)


def test_claude_command_keeps_a_frontier_scale_prompt_out_of_argv() -> None:
    module = load_module()
    prompt = _frontier_prompt()

    invocation = module.build_claude_command("claude-sonnet-5", prompt)

    assert _argv_bytes(invocation.command) < SAFE_TOTAL_ARGV_BYTES
    assert all(prompt not in part for part in invocation.command)
    # ...and the prompt is still delivered, byte-for-byte, over stdin.
    assert invocation.stdin_text == prompt


def test_grok_command_keeps_a_frontier_scale_prompt_out_of_argv(tmp_path: Path) -> None:
    module = load_module()
    prompt = _frontier_prompt()

    invocation = module.build_grok_command("grok-4.5", prompt, prompt_dir=tmp_path)

    assert _argv_bytes(invocation.command) < SAFE_TOTAL_ARGV_BYTES
    assert all(prompt not in part for part in invocation.command)
    # ...and the prompt is still delivered, byte-for-byte, through the file grok
    # is told to read.
    prompt_path = Path(invocation.command[invocation.command.index("--prompt-file") + 1])
    assert prompt_path.read_text(encoding="utf-8") == prompt

    invocation.cleanup()
    assert not prompt_path.exists()


def test_gemini_command_refuses_a_frontier_scale_prompt_instead_of_exceeding_arg_max() -> None:
    """The agy CLI has no stdin and no --prompt-file channel (verified against
    the installed binary on 2026-07-26: piped stdin is ignored, `--print ""`
    errors "empty prompt", and no such flag exists in --help or the binary's
    strings). Its only prompt channel is argv, so an oversized prompt must be
    refused BEFORE exec -- a typed error the loop can report as a retryable job
    failure, never a raw OSError that kills the loop process."""
    import pytest

    module = load_module()
    prompt = _frontier_prompt()

    with pytest.raises(module.PromptTooLargeForCli) as excinfo:
        module.build_gemini_command("gemini-3.5-flash-high", prompt)

    message = str(excinfo.value)
    assert "agy" in message
    assert str(FRONTIER_PROMPT_BYTES) in message or f"{FRONTIER_PROMPT_BYTES:,}" in message


def test_gemini_command_still_passes_a_normal_prompt_on_argv() -> None:
    module = load_module()

    invocation = module.build_gemini_command("gemini-3.5-flash-high", "Prompt text")

    assert invocation.command[:3] == ["agy", "--print", "Prompt text"]
    assert _argv_bytes(invocation.command) < module.argv_capacity_bytes()


_STUB_CLI = """\
import sys

args = sys.argv[1:]
if "--prompt-file" in args:
    with open(args[args.index("--prompt-file") + 1], encoding="utf-8") as handle:
        sys.stdout.write(handle.read())
elif "--print" in args:
    sys.stdout.write(args[args.index("--print") + 1])
else:
    sys.stdout.write(sys.stdin.read())
"""


def _stub_cli(tmp_path: Path) -> Path:
    stub = tmp_path / "stub_cli.py"
    stub.write_text(_STUB_CLI, encoding="utf-8")
    return stub


def _round_trip(module, monkeypatch, stub: Path, invocation) -> str:
    """Run the built invocation against a stub 'CLI' that echoes back whatever
    it received, through the real run_cli_with_liveness plumbing."""
    import asyncio
    import sys

    class FakeClient:
        def __init__(self, config):
            pass

        async def heartbeat(self, capabilities, status="online"):
            pass

        async def aclose(self):
            pass

    monkeypatch.setattr(module, "worker_runtime", lambda: (FakeClient, None, lambda path: object(), None))
    process = asyncio.run(
        module.run_cli_with_liveness(
            config=object(),
            command=[sys.executable, str(stub), *invocation.command[1:]],
            capabilities=["test-model"],
            timeout_seconds=60,
            env=invocation.env,
            stdin_text=invocation.stdin_text,
            heartbeat_seconds=30.0,
        )
    )
    assert process.returncode == 0, process.stderr
    return process.stdout


def _round_trip_prompt(module) -> str:
    job = {
        "id": "job-round-trip",
        "job_type": "v2_expand",
        "required_role": "opponent",
        "required_model": module.GEMINI_LOOP_MODEL,
        "prompt": {
            "system": "System instruction with 'quotes', \"doubles\", $VARS and `backticks`.",
            "user": "Ünïcödé — em-dash, newlines\nand tabs\there.\n" * 200,
            "max_tokens": 800,
        },
    }
    return module.render_model_prompt(job)


def test_claude_stdin_transport_delivers_the_prompt_to_the_subprocess_intact(tmp_path, monkeypatch) -> None:
    module = load_module()
    prompt = _round_trip_prompt(module)

    invocation = module.build_claude_command("claude-sonnet-5", prompt)
    received = _round_trip(module, monkeypatch, _stub_cli(tmp_path), invocation)

    assert received == prompt
    assert "BEGIN_UNTRUSTED_DEBATE_PROMPT" in received


def test_grok_prompt_file_transport_delivers_the_prompt_to_the_subprocess_intact(tmp_path, monkeypatch) -> None:
    module = load_module()
    prompt = _round_trip_prompt(module)

    invocation = module.build_grok_command("grok-4.5", prompt, prompt_dir=tmp_path)
    received = _round_trip(module, monkeypatch, _stub_cli(tmp_path), invocation)

    assert received == prompt
    assert "BEGIN_UNTRUSTED_DEBATE_PROMPT" in received
    invocation.cleanup()


def test_gemini_argv_transport_delivers_the_prompt_to_the_subprocess_intact(tmp_path, monkeypatch) -> None:
    module = load_module()
    prompt = _round_trip_prompt(module)

    invocation = module.build_gemini_command("gemini-3.5-flash-high", prompt)
    received = _round_trip(module, monkeypatch, _stub_cli(tmp_path), invocation)

    assert received == prompt


def _drive_once(module, monkeypatch, tmp_path, *, provider: str, prompt_user: str):
    """Drive <provider>_once end-to-end against fakes and return
    (exit_code, fail_calls, commands)."""
    import argparse
    import asyncio
    import subprocess

    fail_calls: list[tuple[str, str, bool]] = []
    commands: list[list[str]] = []

    class FakeClient:
        def __init__(self, config):
            pass

        async def register(self, models, save_path=None):
            pass

        async def heartbeat(self, capabilities, status="online"):
            pass

        async def poll(self):
            return {
                "id": f"job-{provider}-1",
                "job_type": "v2_expand",
                "required_role": "opponent",
                "required_model": "model-under-test",
                "prompt": {"system": "System instruction", "user": prompt_user, "max_tokens": 800},
            }

        async def fail(self, job_id, reason, retryable=True):
            fail_calls.append((job_id, reason, retryable))

        async def aclose(self):
            pass

    class FakeWorkerConfig:
        def __init__(self):
            self.coordinator_url = ""
            self.name = None
            self.enable_mock = True
            self.enable_real_adapters = True
            self.allowed_models = None
            self.user_token = None

    async def fake_run_cli(config, command, **kwargs):
        commands.append(command)
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="answer", stderr="")

    async def fake_complete(args):
        return 0

    monkeypatch.setattr(
        module,
        "worker_runtime",
        lambda: (FakeClient, FakeWorkerConfig, lambda path: FakeWorkerConfig(), lambda config, path=None: None),
    )
    monkeypatch.setattr(module, "run_cli_with_liveness", fake_run_cli)
    monkeypatch.setattr(module, "complete_from_job_file", fake_complete)

    args = argparse.Namespace(
        config=str(tmp_path / "config.toml"),
        worker_name=f"test-{provider}-loop",
        coordinator_url="http://example.test",
        advertised_model="model-under-test",
        claude_model="claude-sonnet-5",
        gemini_model="gemini-3.5-flash-high",
        grok_model="grok-4.5",
        state_dir=str(tmp_path),
        timeout_seconds=30,
    )
    entrypoint = {"claude": module.claude_once, "gemini": module.gemini_once, "grok": module.grok_once}[provider]
    return asyncio.run(entrypoint(args)), fail_calls, commands


def test_gemini_once_reports_a_retryable_failure_instead_of_crashing_on_an_oversized_prompt(
    tmp_path, monkeypatch
) -> None:
    """The live pathology: the loop process died (OSError E2BIG) after claiming
    the job, so the coordinator only ever saw a silent 10-minute deadline
    requeue -- four times over. The loop must instead survive and tell the
    coordinator why, which burns full-weight attempts and reaches the failover
    ladder."""
    module = load_module()

    exit_code, fail_calls, _ = _drive_once(
        module, monkeypatch, tmp_path, provider="gemini", prompt_user=_frontier_prompt()
    )

    assert exit_code == 0
    assert len(fail_calls) == 1
    job_id, reason, retryable = fail_calls[0]
    assert job_id == "job-gemini-1"
    assert retryable is True
    assert "agy" in reason
    assert len(reason) <= 2000


def test_claude_and_grok_once_run_a_frontier_scale_prompt_without_touching_argv(tmp_path, monkeypatch) -> None:
    module = load_module()
    prompt_user = _frontier_prompt()

    claude_code, claude_fails, claude_commands = _drive_once(
        module, monkeypatch, tmp_path, provider="claude", prompt_user=prompt_user
    )
    grok_code, grok_fails, grok_commands = _drive_once(
        module, monkeypatch, tmp_path, provider="grok", prompt_user=prompt_user
    )

    assert (claude_code, claude_fails) == (0, [])
    assert (grok_code, grok_fails) == (0, [])
    assert _argv_bytes(claude_commands[0]) < SAFE_TOTAL_ARGV_BYTES
    assert _argv_bytes(grok_commands[0]) < SAFE_TOTAL_ARGV_BYTES


def test_grok_once_removes_the_prompt_file_after_the_run(tmp_path, monkeypatch) -> None:
    module = load_module()

    _, _, commands = _drive_once(module, monkeypatch, tmp_path, provider="grok", prompt_user="User claim")

    command = commands[0]
    prompt_path = Path(command[command.index("--prompt-file") + 1])
    assert prompt_path.parent == tmp_path / "grok"
    assert not prompt_path.exists(), "the rendered prompt must not be left behind in the loop state dir"


def test_start_claude_loop_falls_back_to_a_single_slot_when_namespace_has_no_slots_attribute(monkeypatch):
    """Pins the getattr(args, "slots", 1) fallback that keeps the combined `start`
    subcommand byte-identical to legacy behavior: its argparse namespace never carries
    `.slots` (only start-claude/start-grok/start-gemini get that flag), so
    start_claude_loop must still produce exactly one session with the legacy names."""
    module = load_module()
    calls = []
    monkeypatch.setattr(module, "start_tmux_session", lambda session, command: calls.append((session, command)))
    parser = module.build_parser()
    args = parser.parse_args(["start"])
    assert not hasattr(args, "slots")

    result = module.start_claude_loop(args)

    assert result == 0
    assert len(calls) == 1
    session, command = calls[0]
    assert session == "dialectical-claude-loop" == args.claude_session
    assert f"--worker-name {args.claude_worker_name} " in command
    assert f"--config {args.claude_config} " in command
