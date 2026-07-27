from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import httpx
import pytest

from app.adapters import ollama as ollama_module
from app.adapters import codex_cli as codex_cli_module
from app.adapters import gemini_api as gemini_api_module
from app.adapters import gemini_cli as gemini_cli_module
from app.adapters import lmstudio as lmstudio_module
from app.adapters import grok_cli as grok_module
from app.adapters import subprocess_base
from app.adapters import xai_api as xai_module
from app.adapters.claude_cli import ClaudeCliAdapter
from app.adapters.codex_cli import CodexCliAdapter
from app.adapters.gemini_cli import GeminiCliAdapter
from app.adapters.gemini_api import GeminiApiAdapter
from app.adapters.grok_cli import GrokCliAdapter
from app.adapters.lmstudio import LMStudioAdapter
from app.adapters.mock import MockAdapter
from app.adapters.ollama import OllamaAdapter
from app.adapters.subprocess_base import ClaudeStreamJsonParser, claude_stream_json_delta
from app.adapters.xai_api import XaiApiAdapter
from app.capabilities import detect_adapters
from app.client import CoordinatorClient
from app.config import WorkerConfig
from app.main import (
    estimate_tokens,
    extract_json_object,
    enrich_v2_result,
    handle_job,
    handle_job_with_heartbeats,
    parse_result,
    nonretryable_coordinator_completion_error,
    register_with_backoff,
    stale_job_coordinator_error,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
CLAUDE_STREAM_JSON_FIXTURE = FIXTURES / "claude_stream_json_2026-07.jsonl"

# Twice macOS ARG_MAX (1 048 576, argv + env charged together) -- the size
# class that killed the gemini subscription loop live on 2026-07-26 with
# OSError: [Errno 7] Argument list too long: 'agy'. Any adapter that puts the
# rendered prompt on argv dies on this input before ever reaching the model.
TWO_MEBIBYTE_PROMPT = "x" * (2 * 1024 * 1024)


def total_argv_bytes(command: list[str]) -> int:
    """Independent measure of a command's execve argv footprint (element bytes
    plus NUL terminators), deliberately not reusing the production helper."""
    return sum(len(str(part).encode("utf-8")) + 1 for part in command)


@pytest.mark.asyncio
async def test_mock_adapter_generates_structured_decomposition() -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    chunks = [
        chunk
        async for chunk in adapter.stream(
            "Return strict JSON with children.",
            "<topic>Should cities ban cars?</topic><claim>Should cities ban cars?</claim>",
            200,
        )
    ]

    text = "".join(chunks)
    result = parse_result({"job_type": "decompose"}, text)
    assert result["root_claim"] == "Should cities ban cars?"
    assert result["children"][0]["node_type"] == "PRO"


def test_mock_adapter_generates_argument() -> None:
    adapter = MockAdapter()
    assert "tradeoffs" in adapter.generate("You are an opposing argument writer", "<claim>Ban cars</claim>")
    assert "plausible" in adapter.generate("You are supporting", "<claim>Ban cars</claim>")


def test_mock_adapter_matches_current_decomposer_prompt_contract() -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    system = (
        "You are decomposing a debate topic into a concise debate tree seed.\n"
        "Return JSON only:\n"
        '{"root_claim":"clear restatement","children":[]}'
    )

    result = parse_result(
        {"job_type": "decompose"},
        adapter.generate(system, "<topic>Should 16 year old children vote?</topic>"),
    )

    assert result["root_claim"] == "Should 16 year old children vote?"
    assert result["children"][0]["node_type"] == "PRO"


def test_mock_adapter_matches_real_decomposer_prompt_contract() -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    system = (ROOT / "coordinator" / "app" / "prompts" / "decomposer.v1.md").read_text()
    text = adapter.generate(
        system,
        "<topic>Should local AI debate systems separate provider adapters from reasoning logic?</topic>"
        "<claim depth=\"0\">Should local AI debate systems separate provider adapters from reasoning logic?</claim>",
    )

    result = parse_result({"job_type": "decompose"}, text)

    assert result["root_claim"] == "Should local AI debate systems separate provider adapters from reasoning logic?"
    assert result["children"][0]["node_type"] == "PRO"


def test_mock_adapter_matches_v2_pov_contract() -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    text = adapter.generate(
        "You are a Codex-backed Dialectical Engine V2 POV worker. Return exactly one strict JSON object.",
        'Generate the Ethical POV branch. Context JSON: {"output_contract":{"title":"...","strongest_pro":{},"strongest_con":{}}}',
    )

    result = parse_result({"job_type": "v2_pov"}, text)

    assert result["title"] == "Ethical POV assessment"
    for stance_name in ("strongest_pro", "strongest_con"):
        stance = result[stance_name]
        assert stance["title"] and stance["content"]
        assert stance["pro"]["title"] and stance["pro"]["content"]
        assert stance["con"]["title"] and stance["con"]["content"]


def test_mock_adapter_matches_v2_synthesis_contract() -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    text = adapter.generate(
        "You are a Codex-backed Dialectical Engine V2 artifact worker.",
        'Return a non-adjudicating synthesis JSON with "evidence_gaps" and "key_takeaways".',
    )

    result = parse_result({"job_type": "v2_synthesize"}, text)

    assert result["title"] == "Synthesis"
    assert result["content"]
    assert result["tensions"]
    assert result["agreements"]
    assert result["evidence_gaps"]
    assert result["key_takeaways"]


@pytest.mark.parametrize(
    ("polarity", "stance"),
    [("PRO", "supporting"), ("CON", "challenging")],
)
def test_mock_adapter_matches_v2_expand_contract(polarity: str, stance: str) -> None:
    adapter = MockAdapter(token_delay_seconds=0)
    text = adapter.generate(
        "You are a Codex-backed Dialectical Engine V2 expansion worker. Return exactly one strict JSON object.",
        f"Generate exactly one new {polarity} argument that supports or challenges the parent argument below, "
        'reasoned through the Ethical POV lens. Context JSON: {"output_contract":{"title":"...","content":"..."}}',
    )

    result = parse_result({"job_type": "v2_expand"}, text)

    # Deliberately minimal contract: a single {title, content} JSON object.
    assert set(result) == {"title", "content"}
    assert result["title"] == f"Additional {stance} consideration"
    assert result["content"]


def test_enrich_v2_result_stamps_runtime_provenance_for_v2_expand() -> None:
    job = {"id": "job-4", "job_type": "v2_expand", "required_model": "gpt-5.6sol-medium"}
    result = {"title": "Additional consideration", "content": "A further line of reasoning."}

    enriched = enrich_v2_result(job, result, "worker-1")

    assert enriched["provenance"] == {
        "model_id": "gpt-5.6sol-medium",
        "worker_id": "worker-1",
        "prompt_id": "prompt-job-4",
        "job_id": "job-4",
    }


def test_codex_expand_prompt_selects_no_output_schema() -> None:
    # v2_expand has no strict codex output schema; the selector must not
    # strap another v2 schema onto the expansion prompt (that would make the
    # minimal {title, content} contract unproducible for the real adapter).
    schema = codex_cli_module.output_schema_for_prompt(
        "You are a Codex-backed Dialectical Engine V2 expansion worker. Return exactly one strict JSON object.",
        "Generate exactly one new PRO argument that supports the parent argument below, reasoned through the "
        'Scientific POV lens. Context JSON: {"output_contract":{"title":"...","content":"..."}}',
    )

    assert schema is None


def test_mock_adapter_model_id_can_be_named() -> None:
    assert MockAdapter("mock-alpha").model_id == "mock-alpha"


def test_mock_adapter_delay_can_come_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DIALECTICAL_MOCK_TOKEN_DELAY_SECONDS", "0.25")

    assert MockAdapter().token_delay_seconds == 0.25
    assert MockAdapter(token_delay_seconds=0).token_delay_seconds == 0


def test_parse_result_accepts_fenced_json_with_preamble() -> None:
    result = parse_result(
        {"job_type": "synthesize"},
        'Here is the final JSON:\n```json\n{"strongest_pro":"A {braced} pro","strongest_con":"Con","verdict":"Verdict"}\n```',
    )

    assert result == {
        "strongest_pro": "A {braced} pro",
        "strongest_con": "Con",
        "verdict": "Verdict",
    }


@pytest.mark.parametrize("job_type", ["v2_plan", "v2_agent_run", "v2_synthesize"])
def test_parse_result_accepts_planner_first_v2_json(job_type: str) -> None:
    result = parse_result(
        {"job_type": job_type},
        'Model notes before JSON:\n{"agent_run_id":"run-1","steps":[{"skill_id":"skill-1"}]}',
    )

    assert result == {"agent_run_id": "run-1", "steps": [{"skill_id": "skill-1"}]}


def test_extract_json_object_rejects_missing_object() -> None:
    with pytest.raises(ValueError, match="valid JSON object"):
        extract_json_object("no structured output here")


def test_estimate_tokens_uses_text_length_for_long_words() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("one two three") == 4
    assert estimate_tokens("x" * 80) == 20


def test_enrich_v2_result_stamps_creation_provenance() -> None:
    job = {"id": "job-1", "job_type": "v2_skill_create", "required_model": "gpt-5.6sol-medium"}
    result = {"kind": "skill", "provenance": {"created_by_model": "wrong"}}

    enriched = enrich_v2_result(job, result, "worker-1")

    assert enriched["provenance"] == {
        "created_by_model": "gpt-5.6sol-medium",
        "created_by_worker_id": "worker-1",
        "creation_prompt_id": "prompt-job-1",
        "job_id": "job-1",
    }


def test_enrich_v2_result_stamps_runtime_provenance() -> None:
    job = {"id": "job-2", "job_type": "v2_agent_argument", "required_model": "gpt-5.6sol-medium"}
    result = {"pros": ["a"] * 5, "cons": ["b"] * 5}

    enriched = enrich_v2_result(job, result, "worker-1")

    assert enriched["provenance"] == {
        "model_id": "gpt-5.6sol-medium",
        "worker_id": "worker-1",
        "prompt_id": "prompt-job-2",
        "job_id": "job-2",
    }


@pytest.mark.parametrize("job_type", ["v2_plan", "v2_agent_run", "v2_synthesize"])
def test_enrich_v2_result_stamps_planner_first_provenance_generically(job_type: str) -> None:
    job = {"id": "job-3", "job_type": job_type, "required_model": "gpt-5.6sol-medium"}
    result = {"payload": {"ok": True}, "provenance": {"source": "model"}}

    enriched = enrich_v2_result(job, result, "worker-1")

    assert enriched["provenance"] == {
        "source": "model",
        "model_id": "gpt-5.6sol-medium",
        "worker_id": "worker-1",
        "prompt_id": "prompt-job-3",
        "job_id": "job-3",
    }


def test_cli_adapter_commands(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CODEX_COMMAND", "codex")

    claude = ClaudeCliAdapter()
    assert claude.command("sys", "user", 10) == [
        "claude",
        "-p",
        "--model",
        "claude-sonnet-5",
        "--effort",
        "high",
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    assert claude.stdin_text("sys", "user", 10) == "sys\n\nuser"
    codex_command = CodexCliAdapter().command("sys", "user", 10)
    assert codex_command[:5] == ["codex", "exec", "--skip-git-repo-check", "--sandbox", "workspace-write"]
    assert "--output-schema" not in codex_command
    assert "--model" in codex_command
    assert "gpt-5.6-sol" in codex_command
    assert "model_reasoning_effort=medium" in codex_command
    assert codex_command[-1] == "-"
    assert "sys\n\nuser" in CodexCliAdapter().stdin_text("sys", "user", 10)
    assert "--full-auto" not in codex_command
    assert "-q" not in codex_command
    assert GeminiCliAdapter().command("sys", "user", 10) == [
        "agy",
        "--print",
        "sys\n\nuser\n\nMaximum tokens: 10",
        "--model",
        "gemini-3.5-flash-high",
        "--effort",
        "high",
    ]
    monkeypatch.setattr(grok_module.tempfile, "gettempdir", lambda: str(tmp_path))
    grok = GrokCliAdapter()
    grok_command = grok.command("sys", "user", 10)
    assert grok_command[:2] == ["grok", "--prompt-file"]
    assert Path(grok_command[2]).read_text(encoding="utf-8") == "sys\n\nuser\n\nMaximum tokens: 10"
    assert grok_command[3:5] == ["--model", "grok-4.5"]
    assert grok_command[-4:] == [
        "--reasoning-effort",
        "high",
        "--output-format",
        "plain",
    ]
    grok.cleanup()
    assert not Path(grok_command[2]).exists()


def test_claude_command_keeps_two_mebibyte_prompt_off_argv() -> None:
    # The prompt must ride stdin (claude -p with no prompt argument reads it
    # from stdin), never argv, or execve fails with E2BIG on big debate trees.
    adapter = ClaudeCliAdapter()

    command = adapter.command("sys", TWO_MEBIBYTE_PROMPT, 10)

    assert total_argv_bytes(command) < 4096
    assert adapter.stdin_text("sys", TWO_MEBIBYTE_PROMPT, 10) == f"sys\n\n{TWO_MEBIBYTE_PROMPT}"


@pytest.mark.asyncio
async def test_claude_stream_delivers_two_mebibyte_prompt_via_stdin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdout, stderr, env
        captured["command"] = list(command)
        captured["stdin"] = stdin
        process = FakeStreamingProcess(stdout=b'{"type":"result","result":"OK"}\n', returncode=0)
        captured["process"] = process
        return process

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    chunks = [chunk async for chunk in ClaudeCliAdapter().stream("sys", TWO_MEBIBYTE_PROMPT, 100)]

    assert "".join(chunks) == "OK"
    assert total_argv_bytes(captured["command"]) < 4096
    assert captured["stdin"] == asyncio.subprocess.PIPE
    piped = getattr(captured["process"].stdin, "payload", b"")
    assert piped.decode() == f"sys\n\n{TWO_MEBIBYTE_PROMPT}"


def test_grok_command_stages_two_mebibyte_prompt_in_prompt_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # grok documents --prompt-file <PATH> ("Single-turn prompt from a file");
    # the prompt goes to disk and only the path rides argv.
    monkeypatch.setattr(grok_module.tempfile, "gettempdir", lambda: str(tmp_path))
    adapter = GrokCliAdapter()

    command = adapter.command("sys", TWO_MEBIBYTE_PROMPT, 10)

    assert total_argv_bytes(command) < 4096
    prompt_path = Path(command[command.index("--prompt-file") + 1])
    assert prompt_path.read_text(encoding="utf-8") == f"sys\n\n{TWO_MEBIBYTE_PROMPT}\n\nMaximum tokens: 10"
    adapter.cleanup()
    assert not prompt_path.exists()


@pytest.mark.asyncio
async def test_grok_stream_removes_prompt_file_after_success(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(grok_module.tempfile, "gettempdir", lambda: str(tmp_path))
    staged: list[Path] = []

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdin, stdout, stderr, env
        prompt_path = Path(command[command.index("--prompt-file") + 1])
        staged.append(prompt_path)
        # The file must still exist at exec time -- the process reads it.
        assert prompt_path.read_text(encoding="utf-8") == f"sys\n\n{TWO_MEBIBYTE_PROMPT}\n\nMaximum tokens: 100"
        return FakeStreamingProcess(stdout=b"answer\n", returncode=0)

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    chunks = [chunk async for chunk in GrokCliAdapter().stream("sys", TWO_MEBIBYTE_PROMPT, 100)]

    assert "".join(chunks) == "answer\n"
    assert staged and not staged[0].exists()


@pytest.mark.asyncio
async def test_grok_stream_removes_prompt_file_when_process_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(grok_module.tempfile, "gettempdir", lambda: str(tmp_path))
    staged: list[Path] = []

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdin, stdout, stderr, env
        staged.append(Path(command[command.index("--prompt-file") + 1]))
        return FakeStreamingProcess(stdout=b"", stderr=b"grok exploded", returncode=1)

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    with pytest.raises(RuntimeError, match="grok exploded"):
        [chunk async for chunk in GrokCliAdapter().stream("sys", "user", 100)]

    assert staged and not staged[0].exists()


@pytest.mark.asyncio
async def test_grok_concurrent_streams_use_per_call_prompt_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # Adapters are built once and shared across jobs (see detect_adapters), so
    # two in-flight stream() calls must stage and clean up SEPARATE prompt
    # files -- one job's cleanup must never delete the other's prompt.
    monkeypatch.setattr(grok_module.tempfile, "gettempdir", lambda: str(tmp_path))
    barrier = asyncio.Event()
    staged: list[Path] = []

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdin, stdout, stderr, env
        staged.append(Path(command[command.index("--prompt-file") + 1]))
        if len(staged) == 2:
            barrier.set()
        return BarrierStreamingProcess(barrier, stdout=b"done\n", returncode=0)

    async def collect(chunks) -> str:
        return "".join([chunk async for chunk in chunks])

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    adapter = GrokCliAdapter()
    results = await asyncio.gather(
        collect(adapter.stream("sys", "first", 100)),
        collect(adapter.stream("sys", "second", 100)),
    )

    assert results == ["done\n", "done\n"]
    assert len(staged) == 2 and staged[0] != staged[1]
    assert all(not path.exists() for path in staged)


def test_gemini_command_refuses_prompt_past_exec_budget() -> None:
    # agy has no stdin or prompt-file channel (verified against the installed
    # binary 2026-07-26), so an oversized prompt must be refused with a typed
    # error BEFORE exec -- never the raw OSError E2BIG that killed the loop.
    with pytest.raises(subprocess_base.PromptTooLargeForCli, match="exec budget"):
        GeminiCliAdapter().command("sys", TWO_MEBIBYTE_PROMPT, 10)


def test_prompt_too_large_is_a_runtime_error() -> None:
    # Worker job handling fails jobs on RuntimeError; the typed refusal must
    # stay inside that contract so the job is reported failed, not crash the
    # worker loop.
    assert issubclass(subprocess_base.PromptTooLargeForCli, RuntimeError)


def test_codex_v2_planner_command_uses_strict_output_schema() -> None:
    command = CodexCliAdapter().command(
        "You are a Codex-backed Dialectical Engine V2 artifact worker.",
        'You are planning a Dialectical Engine debate. Required shape: {"agents":[],"skills":[]}',
        800,
    )

    assert "--output-schema" in command
    schema_path = command[command.index("--output-schema") + 1]
    assert schema_path.endswith("codex_v2_planner.schema.json")
    assert command.index("--output-schema") < command.index("--model")
    assert command[-1] == "-"


def test_codex_v2_pov_command_uses_strict_output_schema() -> None:
    command = CodexCliAdapter().command(
        "You are a Codex-backed Dialectical Engine V2 POV worker.",
        'Generate Scientific POV. Required shape: {"title":"...","content":"...","strongest_pro":{},"strongest_con":{}}',
        800,
    )

    assert "--output-schema" in command
    schema_path = command[command.index("--output-schema") + 1]
    assert schema_path.endswith("codex_v2_pov.schema.json")
    assert command[command.index("--model") + 1] == "gpt-5.6-sol"
    assert command[-1] == "-"


def test_codex_v2_synthesis_schema_has_no_optional_properties() -> None:
    schema = json.loads(codex_cli_module.CODEX_V2_SYNTHESIS_SCHEMA.read_text(encoding="utf-8"))

    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
    assert "contribution_summary" not in schema["properties"]


def test_codex_command_writes_last_message_file() -> None:
    adapter = CodexCliAdapter()
    command = adapter.command("sys", "user", 10)

    assert "--output-last-message" in command
    output_path = command[command.index("--output-last-message") + 1]
    assert output_path.endswith(".json")
    assert command.index("--output-last-message") < command.index("--model")


def test_codex_command_can_include_wrapper_arguments(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CODEX_COMMAND", "python -m codexshim")

    codex_command = CodexCliAdapter().command("sys", "user", 10)

    assert codex_command[:4] == ["python", "-m", "codexshim", "exec"]


def test_codex_command_defaults_to_cmd_shim_on_windows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CODEX_COMMAND", raising=False)
    monkeypatch.setattr(codex_cli_module.os, "name", "nt")
    monkeypatch.setattr(codex_cli_module.shutil, "which", lambda executable: "C:\\tools\\codex.cmd" if executable == "codex.cmd" else None)

    codex_command = CodexCliAdapter().command("sys", "user", 10)

    assert codex_command[:2] == ["C:\\tools\\codex.cmd", "exec"]


@pytest.mark.asyncio
async def test_codex_health_probes_spawnable_command(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, tuple[str, ...]] = {}

    async def fake_exec(*command: str, stdout, stderr) -> FakeCliProcess:
        captured["command"] = command
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=b"codex 1.0\n", returncode=0)

    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: f"/usr/local/bin/{executable}")
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    assert await CodexCliAdapter("python -m codexshim").health_check()
    assert captured["command"] == ("python", "-m", "codexshim", "--version")


@pytest.mark.asyncio
async def test_codex_health_accepts_absolute_wrapper_path(monkeypatch: pytest.MonkeyPatch) -> None:
    command_path = "C:\\tools\\codex-cli.cmd"

    async def fake_exec(*command: str, stdout, stderr) -> FakeCliProcess:
        assert command == (command_path, "--version")
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=b"codex 1.0\n", returncode=0)

    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: None)
    monkeypatch.setattr(subprocess_base.os.path, "isfile", lambda path: path == command_path)
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    assert await CodexCliAdapter(command_path).health_check()


@pytest.mark.asyncio
async def test_codex_health_rejects_unspawnable_windowsapps_alias(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_exec(*command: str, stdout, stderr) -> FakeCliProcess:
        del command, stdout, stderr
        raise PermissionError("[WinError 5] Access is denied")

    monkeypatch.setattr(
        subprocess_base.shutil,
        "which",
        lambda executable: f"C:\\Program Files\\WindowsApps\\OpenAI.Codex\\{executable}.exe",
    )
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    assert not await CodexCliAdapter().health_check()


def test_claude_stream_json_parser() -> None:
    # Legacy shapes (backward compat).
    line = '{"type":"content_block_delta","delta":{"text":"hello"}}'
    assert claude_stream_json_delta(line) == "hello"
    assert claude_stream_json_delta('{"completion":"done"}') == "done"
    assert claude_stream_json_delta('{"type":"other"}') == ""
    assert claude_stream_json_delta("plain") == "plain"
    # Current CLI schema (single-line, stateless per call).
    assert (
        claude_stream_json_delta(
            '{"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}'
        )
        == "OK"
    )
    assert claude_stream_json_delta('{"type":"result","result":"OK"}') == "OK"
    assert claude_stream_json_delta('{"type":"system","subtype":"init"}') == ""
    assert claude_stream_json_delta('{"type":"rate_limit_event","rate_limit_info":{}}') == ""


@pytest.mark.asyncio
async def test_claude_stream_parses_current_schema_fixture_end_to_end(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Reproduces the production soak failure: the CURRENT `claude ... --output-
    # format stream-json --verbose` stream (captured live, 2026-07) must parse to
    # exactly the model's answer text -- not "produced no output".
    fixture_bytes = CLAUDE_STREAM_JSON_FIXTURE.read_bytes()

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del command, stdin, stdout, stderr, env
        return FakeStreamingProcess(stdout=fixture_bytes, returncode=0)

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    chunks = [chunk async for chunk in ClaudeCliAdapter().stream("sys", "user", 100)]

    assert "".join(chunks) == "OK"  # exact answer text
    assert chunks == ["OK"]  # single emission: assistant text once, result envelope de-duped
    assert not any("{" in chunk for chunk in chunks)  # no raw envelope JSON leaked through


def test_claude_new_line_parser_parses_current_schema_fixture() -> None:
    lines = [line for line in CLAUDE_STREAM_JSON_FIXTURE.read_text().splitlines() if line.strip()]
    parse = ClaudeCliAdapter().new_line_parser()

    outputs = [parse(line) for line in lines]

    assert "".join(outputs) == "OK"
    assert outputs.count("OK") == 1  # assistant text once; result envelope de-duped to ""
    assert all(out in {"", "OK"} for out in outputs)  # no raw envelope JSON, no partial leakage


def test_claude_stream_json_parser_concatenates_text_blocks_and_dedupes_result() -> None:
    parse = ClaudeStreamJsonParser()
    assistant = (
        '{"type":"assistant","message":{"content":'
        '[{"type":"text","text":"Hello "},{"type":"thinking","text":"ignored"},{"type":"text","text":"world"}]}}'
    )
    assert parse(assistant) == "Hello world"  # only text blocks, concatenated
    # Precedence: assistant text already emitted -> the duplicate result envelope
    # contributes nothing.
    assert parse('{"type":"result","result":"Hello world"}') == ""


def test_claude_stream_json_parser_falls_back_to_result_without_assistant_text() -> None:
    parse = ClaudeStreamJsonParser()
    assert parse('{"type":"system","subtype":"init","cwd":"/x"}') == ""
    assert parse('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}') == ""
    # No assistant text this stream -> the result envelope is the answer.
    assert parse('{"type":"result","result":"fallback"}') == "fallback"


def test_claude_stream_json_parser_passes_through_non_json_line() -> None:
    parse = ClaudeStreamJsonParser()
    assert parse("network unreachable") == "network unreachable"  # genuine non-JSON stderr-on-stdout
    assert parse('{"type":"system"}') == ""  # but envelope JSON never passes through raw


def test_claude_new_line_parser_resets_state_per_stream() -> None:
    # The adapter is built once and reused across jobs; per-stream de-dup state
    # must NOT leak between stream() invocations.
    adapter = ClaudeCliAdapter()
    first = adapter.new_line_parser()
    assert first('{"type":"assistant","message":{"content":[{"type":"text","text":"one"}]}}') == "one"
    assert first('{"type":"result","result":"one"}') == ""  # de-duped within stream 1

    second = adapter.new_line_parser()
    assert second is not first
    # A fresh stream carrying ONLY a result envelope must still surface it --
    # proof the emitted flag reset rather than leaking from stream 1.
    assert second('{"type":"result","result":"two"}') == "two"


@pytest.mark.asyncio
async def test_claude_stream_raises_when_only_system_envelopes(monkeypatch: pytest.MonkeyPatch) -> None:
    system_only = (
        b'{"type":"system","subtype":"init","cwd":"/x"}\n'
        b'{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}\n'
        b'{"type":"system","subtype":"post_turn_summary"}\n'
    )

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del command, stdin, stdout, stderr, env
        return FakeStreamingProcess(stdout=system_only, returncode=0)

    monkeypatch.setattr(subprocess_base.asyncio, "create_subprocess_exec", fake_exec)

    with pytest.raises(RuntimeError, match="claude produced no output"):
        [chunk async for chunk in ClaudeCliAdapter().stream("sys", "user", 100)]


@pytest.mark.asyncio
async def test_xai_health_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    assert not await XaiApiAdapter().health_check()
    monkeypatch.setenv("XAI_API_KEY", "<optional-xai-api-key>")
    assert not await XaiApiAdapter().health_check()
    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    assert await XaiApiAdapter().health_check()


@pytest.mark.asyncio
async def test_gemini_api_health_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert not await GeminiApiAdapter().health_check()
    monkeypatch.setenv("GEMINI_API_KEY", "<optional-google-ai-studio-api-key>")
    assert not await GeminiApiAdapter().health_check()
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test")
    assert await GeminiApiAdapter().health_check()


@pytest.mark.asyncio
async def test_subprocess_health_uses_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: f"/usr/local/bin/{executable}")
    assert await ClaudeCliAdapter().health_check()


class FakeCliProcess:
    def __init__(self, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0) -> None:
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode

    async def communicate(self) -> tuple[bytes, bytes]:
        return self.stdout, self.stderr

    def kill(self) -> None:
        self.returncode = -9

    async def wait(self) -> int:
        return self.returncode


class FakeAsyncPipe:
    def __init__(self, payload: bytes = b"") -> None:
        self.payload = payload

    def __aiter__(self):
        self._lines = iter(self.payload.splitlines(keepends=True))
        return self

    async def __anext__(self) -> bytes:
        try:
            return next(self._lines)
        except StopIteration:
            raise StopAsyncIteration

    async def read(self) -> bytes:
        return self.payload


class FakeStdin:
    def write(self, payload: bytes) -> None:
        self.payload = payload

    async def drain(self) -> None:
        return None

    def close(self) -> None:
        return None


class FakeStreamingProcess:
    def __init__(self, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0) -> None:
        self.stdout = FakeAsyncPipe(stdout)
        self.stderr = FakeAsyncPipe(stderr)
        self.returncode = returncode
        self.stdin = FakeStdin()

    async def wait(self) -> int:
        return self.returncode


class BarrierStreamingProcess(FakeStreamingProcess):
    def __init__(self, barrier: asyncio.Event, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0) -> None:
        super().__init__(stdout=stdout, stderr=stderr, returncode=returncode)
        self.barrier = barrier

    async def wait(self) -> int:
        await self.barrier.wait()
        return self.returncode


@pytest.mark.asyncio
async def test_codex_stream_reads_last_message_when_stdout_empty(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    expected = {"title": "Synthesis", "content": "No winner.", "tensions": [], "agreements": [], "evidence_gaps": [], "key_takeaways": []}

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdin, stdout, stderr, env
        output_path = Path(command[command.index("--output-last-message") + 1])
        output_path.write_text(json.dumps(expected), encoding="utf-8")
        return FakeStreamingProcess(stdout=b"", returncode=0)

    monkeypatch.setattr(codex_cli_module.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    chunks = [chunk async for chunk in CodexCliAdapter().stream("sys", '"evidence_gaps"', 100)]

    assert "".join(chunks) == json.dumps(expected)


@pytest.mark.asyncio
async def test_codex_stream_uses_per_call_last_message_path(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    barrier = asyncio.Event()
    started_paths: list[Path] = []
    payloads = [json.dumps({"call": 1}), json.dumps({"call": 2})]

    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del stdin, stdout, stderr, env
        output_path = Path(command[command.index("--output-last-message") + 1])
        output_path.write_text(payloads[len(started_paths)], encoding="utf-8")
        started_paths.append(output_path)
        if len(started_paths) == 2:
            barrier.set()
        return BarrierStreamingProcess(barrier, stdout=b"", returncode=0)

    async def collect(chunks) -> str:
        return "".join([chunk async for chunk in chunks])

    monkeypatch.setattr(codex_cli_module.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    adapter = CodexCliAdapter()
    results = await asyncio.gather(
        collect(adapter.stream("sys", "first", 100)),
        collect(adapter.stream("sys", "second", 100)),
    )

    assert results == payloads
    assert all(not path.exists() for path in started_paths)


@pytest.mark.asyncio
async def test_subprocess_stream_raises_stderr_when_process_exits_zero_without_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_exec(*command: str, stdin, stdout, stderr, env=None) -> FakeStreamingProcess:
        del command, stdin, stdout, stderr, env
        return FakeStreamingProcess(stdout=b"", stderr=b"network unavailable", returncode=0)

    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", fake_exec)

    with pytest.raises(RuntimeError, match="network unavailable"):
        [chunk async for chunk in CodexCliAdapter().stream("sys", "user", 100)]


def grok_help_process(help_text: str, returncode: int = 0):
    async def fake_exec(*command: str, stdout, stderr) -> FakeCliProcess:
        assert command == ("grok", "--help")
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=help_text.encode(), returncode=returncode)

    return fake_exec


def gemini_probe_process(stdout_text: str = "OK\n", returncode: int = 0):
    async def fake_exec(*command: str, stdout, stderr) -> FakeCliProcess:
        assert command == (
            "agy",
            "--print",
            "Respond with exactly OK.",
            "--model",
            "gemini-3.5-flash-high",
            "--effort",
            "high",
        )
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=stdout_text.encode(), returncode=returncode)

    return fake_exec


@pytest.mark.asyncio
async def test_gemini_cli_health_requires_successful_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: "/usr/local/bin/agy")
    monkeypatch.setattr(gemini_cli_module.asyncio, "create_subprocess_exec", gemini_probe_process())

    assert await GeminiCliAdapter().health_check()

    monkeypatch.setattr(gemini_cli_module.asyncio, "create_subprocess_exec", gemini_probe_process("", returncode=0))
    assert not await GeminiCliAdapter().health_check()

    monkeypatch.setattr(gemini_cli_module.asyncio, "create_subprocess_exec", gemini_probe_process("auth required", returncode=1))
    assert not await GeminiCliAdapter().health_check()


@pytest.mark.asyncio
async def test_grok_health_requires_prompt_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: "/usr/local/bin/grok")
    monkeypatch.setattr(
        grok_module.asyncio,
        "create_subprocess_exec",
        grok_help_process("Usage: grok [options]\n  -p, --prompt <prompt>\n"),
    )

    assert await GrokCliAdapter().health_check()

    monkeypatch.setattr(
        grok_module.asyncio,
        "create_subprocess_exec",
        grok_help_process("Usage: grok [options]\n  --chat\n"),
    )

    assert not await GrokCliAdapter().health_check()


class FakeResponse:
    def __init__(self, lines: list[str] | None = None) -> None:
        self.lines = lines or []

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return {"models": [{"name": "qwen-3.6:latest"}]}

    async def aiter_lines(self):
        for line in self.lines:
            yield line


class FakeStream:
    def __init__(self, lines: list[str]) -> None:
        self.response = FakeResponse(lines)

    async def __aenter__(self) -> FakeResponse:
        return self.response

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


class FakeOllamaClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str) -> FakeResponse:
        assert url.endswith("/api/tags")
        return FakeResponse()

    def stream(self, method: str, url: str, json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/api/generate")
        assert json["model"] == "qwen-3.6"
        return FakeStream(['{"response":"hello ","done":false}', '{"response":"world","done":true}'])


class FakeTaggedOllamaClient(FakeOllamaClient):
    async def get(self, url: str) -> FakeResponse:
        assert url.endswith("/api/tags")
        response = FakeResponse()
        response.json = lambda: {"models": [{"name": "qwen-3.6:latest"}]}  # type: ignore[method-assign]
        return response


class FakeMalformedOllamaClient(FakeOllamaClient):
    def stream(self, method: str, url: str, json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/api/generate")
        return FakeStream(["{}", "not-json", '{"response":"ok"}'])


class FakeLMStudioResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self.payload


class FakeLMStudioClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str) -> FakeLMStudioResponse:
        assert url.endswith("/v1/models")
        return FakeLMStudioResponse({"data": [{"id": "google_gemma-4-e4b-it"}]})

    async def post(self, url: str, json: dict[str, object]) -> FakeLMStudioResponse:
        assert url.endswith("/v1/chat/completions")
        assert json["model"] == "google_gemma-4-e4b-it"
        assert json["messages"] == [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "user"},
        ]
        assert json["max_tokens"] == 20
        return FakeLMStudioResponse({"choices": [{"message": {"content": "hello"}}]})


@pytest.mark.asyncio
async def test_ollama_health_and_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", FakeOllamaClient)
    adapter = OllamaAdapter("qwen-3.6")

    assert await adapter.health_check()
    assert [chunk async for chunk in adapter.stream("sys", "user", 10)] == ["hello ", "world"]


@pytest.mark.asyncio
async def test_ollama_health_requires_exact_tag_when_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", FakeTaggedOllamaClient)

    assert not await OllamaAdapter("qwen-3.6:instruct").health_check()


@pytest.mark.asyncio
async def test_ollama_stream_skips_malformed_or_keepalive_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", FakeMalformedOllamaClient)

    assert [chunk async for chunk in OllamaAdapter("qwen-3.6").stream("sys", "user", 10)] == ["ok"]


def test_ollama_adapter_model_id_matches_routing_without_tag() -> None:
    adapter = OllamaAdapter("qwen-3.6:latest")

    assert adapter.model_id == "ollama:qwen-3.6"
    assert adapter.model_name == "qwen-3.6:latest"


@pytest.mark.asyncio
async def test_lmstudio_health_and_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lmstudio_module.httpx, "AsyncClient", FakeLMStudioClient)
    adapter = LMStudioAdapter("google_gemma-4-e4b-it")

    assert adapter.model_id == "lmstudio:google_gemma-4-e4b-it"
    assert await adapter.health_check()
    assert [chunk async for chunk in adapter.stream("sys", "user", 20)] == ["hello"]


class FakeXaiClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    def stream(self, method: str, url: str, headers: dict[str, str], json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/chat/completions")
        assert headers["Authorization"].startswith("Bearer ")
        return FakeStream(
            [
                "",
                'data: {"choices":[{"delta":{"content":"hello"}}]}',
                "data: [DONE]",
            ]
        )


class FakeMalformedXaiClient(FakeXaiClient):
    def stream(self, method: str, url: str, headers: dict[str, str], json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/chat/completions")
        return FakeStream(
            [
                "data: ",
                "data: not-json",
                "data: {}",
                'data: {"choices":[{"delta":{"content":"ok"}}]}',
                "data: [DONE]",
            ]
        )


@pytest.mark.asyncio
async def test_xai_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    monkeypatch.setattr(xai_module.httpx, "AsyncClient", FakeXaiClient)

    assert [chunk async for chunk in XaiApiAdapter().stream("sys", "user", 20)] == ["hello"]


@pytest.mark.asyncio
async def test_xai_stream_skips_malformed_or_keepalive_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    monkeypatch.setattr(xai_module.httpx, "AsyncClient", FakeMalformedXaiClient)

    assert [chunk async for chunk in XaiApiAdapter().stream("sys", "user", 20)] == ["ok"]


class FakeGeminiClient:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    def stream(self, method: str, url: str, headers: dict[str, str], json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/models/gemini-2.5-flash:streamGenerateContent?alt=sse")
        assert headers["x-goog-api-key"] == "gemini-test"
        assert json["systemInstruction"] == {"parts": [{"text": "sys"}]}
        assert json["contents"] == [{"role": "user", "parts": [{"text": "user"}]}]
        assert json["generationConfig"] == {"maxOutputTokens": 20}
        return FakeStream(
            [
                "",
                'data: {"candidates":[{"content":{"parts":[{"text":"hello "}]}}]}',
                'data: {"candidates":[{"content":{"parts":[{"text":"world"}]}}]}',
            ]
        )


class FakeMalformedGeminiClient(FakeGeminiClient):
    def stream(self, method: str, url: str, headers: dict[str, str], json: dict[str, object]) -> FakeStream:
        assert method == "POST"
        assert url.endswith("/models/gemini-2.5-flash:streamGenerateContent?alt=sse")
        return FakeStream(
            [
                "data:",
                "data: not-json",
                "data: {}",
                'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}',
            ]
        )


@pytest.mark.asyncio
async def test_gemini_api_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test")
    monkeypatch.setattr(gemini_api_module.httpx, "AsyncClient", FakeGeminiClient)

    assert [chunk async for chunk in GeminiApiAdapter().stream("sys", "user", 20)] == ["hello ", "world"]


@pytest.mark.asyncio
async def test_gemini_api_stream_skips_malformed_or_keepalive_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test")
    monkeypatch.setattr(gemini_api_module.httpx, "AsyncClient", FakeMalformedGeminiClient)

    assert [chunk async for chunk in GeminiApiAdapter().stream("sys", "user", 20)] == ["ok"]


@pytest.mark.asyncio
async def test_api_adapters_reject_placeholder_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "<optional-google-ai-studio-api-key>")
    with pytest.raises(RuntimeError, match="placeholder"):
        [chunk async for chunk in GeminiApiAdapter().stream("sys", "user", 20)]

    monkeypatch.setenv("XAI_API_KEY", "<optional-xai-api-key>")
    with pytest.raises(RuntimeError, match="placeholder"):
        [chunk async for chunk in XaiApiAdapter().stream("sys", "user", 20)]


def test_gemini_api_text_chunks_accepts_batched_payloads() -> None:
    payload = [
        {"candidates": [{"content": {"parts": [{"text": "hello"}]}}]},
        {"candidates": [{"content": {"parts": [{"text": " world"}]}}]},
    ]

    assert GeminiApiAdapter.text_chunks(payload) == ["hello", " world"]


@pytest.mark.asyncio
async def test_detect_adapters_prefers_gemini_api_over_cli_when_api_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test")
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setattr(
        subprocess_base.shutil,
        "which",
        lambda executable: "/usr/local/bin/gemini" if executable == "gemini" else None,
    )
    async def unexpected_gemini_cli_probe(*args, **kwargs):
        raise AssertionError("Gemini CLI should not be probed when API adapter already supplied the capability")

    monkeypatch.setattr(gemini_cli_module.asyncio, "create_subprocess_exec", unexpected_gemini_cli_probe)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert type(adapters["gemini-2.5-flash"]) is GeminiApiAdapter


@pytest.mark.asyncio
async def test_detect_adapters_requires_healthy_gemini_cli_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("DIALECTICAL_LMSTUDIO_MODELS", "")
    monkeypatch.setattr(
        subprocess_base.shutil,
        "which",
        lambda executable: "/usr/local/bin/gemini" if executable == "gemini" else None,
    )
    monkeypatch.setattr(gemini_cli_module.asyncio, "create_subprocess_exec", gemini_probe_process("", returncode=1))
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert adapters == {}


@pytest.mark.asyncio
async def test_detect_adapters_ignores_placeholder_api_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.setenv("GEMINI_API_KEY", "<optional-google-ai-studio-api-key>")
    monkeypatch.setenv("XAI_API_KEY", "<optional-xai-api-key>")
    monkeypatch.setenv("DIALECTICAL_LMSTUDIO_MODELS", "")
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: None)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert adapters == {}


@pytest.mark.asyncio
async def test_detect_adapters_keeps_grok_cli_primary_over_xai_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: "/usr/local/bin/grok" if executable == "grok" else None)
    monkeypatch.setattr(
        grok_module.asyncio,
        "create_subprocess_exec",
        grok_help_process("Usage: grok [options]\n  -p, --prompt <prompt>\n"),
    )
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert type(adapters["grok-4.5-high-loop"]) is GrokCliAdapter
    assert type(adapters["grok-4.5"]) is XaiApiAdapter


@pytest.mark.asyncio
async def test_detect_adapters_falls_back_to_xai_when_grok_cli_lacks_prompt_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: "/usr/local/bin/grok" if executable == "grok" else None)
    monkeypatch.setattr(
        grok_module.asyncio,
        "create_subprocess_exec",
        grok_help_process("Usage: grok [options]\n  --chat\n"),
    )
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert type(adapters["grok-4.5"]) is XaiApiAdapter


@pytest.mark.asyncio
async def test_detect_adapters_registers_ollama_capability_without_tag(monkeypatch: pytest.MonkeyPatch) -> None:
    async def tagged_ollama_models() -> list[str]:
        return ["qwen-3.6:latest"]

    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: None)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", tagged_ollama_models)
    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", FakeOllamaClient)

    adapters = await detect_adapters(WorkerConfig(enable_mock=False, enable_real_adapters=True))

    assert set(adapters) == {"ollama:qwen-3.6"}
    assert adapters["ollama:qwen-3.6"].model_name == "qwen-3.6:latest"


@pytest.mark.asyncio
async def test_detect_adapters_registers_allowed_lmstudio_model(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_ollama_models() -> list[str]:
        return []

    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: None)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)
    monkeypatch.setattr(lmstudio_module.httpx, "AsyncClient", FakeLMStudioClient)

    adapters = await detect_adapters(
        WorkerConfig(
            enable_mock=False,
            enable_real_adapters=True,
            allowed_models=["lmstudio:google_gemma-4-e4b-it"],
        )
    )

    assert set(adapters) == {"lmstudio:google_gemma-4-e4b-it"}
    assert isinstance(adapters["lmstudio:google_gemma-4-e4b-it"], LMStudioAdapter)


@pytest.mark.asyncio
async def test_detect_adapters_respects_allowed_models(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CODEX_COMMAND", "codex")

    async def no_ollama_models() -> list[str]:
        return []

    async def healthy_codex_probe(*command: str, stdout, stderr) -> FakeCliProcess:
        assert command == ("codex", "--version")
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=b"codex 1.0\n", returncode=0)

    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: f"/usr/local/bin/{executable}")
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", healthy_codex_probe)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(
        WorkerConfig(enable_mock=False, enable_real_adapters=True, allowed_models=["gpt-5.6sol-medium"])
    )

    assert set(adapters) == {"gpt-5.6sol-medium"}


@pytest.mark.asyncio
async def test_detect_adapters_allows_codex_scoring_alias(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CODEX_COMMAND", "codex")

    async def no_ollama_models() -> list[str]:
        return []

    async def healthy_codex_probe(*command: str, stdout, stderr) -> FakeCliProcess:
        assert command == ("codex", "--version")
        assert stdout == asyncio.subprocess.PIPE
        assert stderr == asyncio.subprocess.PIPE
        return FakeCliProcess(stdout=b"codex 1.0\n", returncode=0)

    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setattr(subprocess_base.shutil, "which", lambda executable: f"/usr/local/bin/{executable}")
    monkeypatch.setattr(codex_cli_module.asyncio, "create_subprocess_exec", healthy_codex_probe)
    monkeypatch.setattr("app.capabilities.discover_ollama_models", no_ollama_models)

    adapters = await detect_adapters(
        WorkerConfig(enable_mock=False, enable_real_adapters=True, allowed_models=["gpt-5.6-sol"])
    )

    assert set(adapters) == {"gpt-5.6-sol"}
    assert adapters["gpt-5.6-sol"].model_id == "gpt-5.6sol-medium"


@pytest.mark.asyncio
async def test_detect_adapters_can_register_multiple_mock_models() -> None:
    adapters = await detect_adapters(
        WorkerConfig(enable_mock=True, enable_real_adapters=False, mock_models=["mock-alpha", "mock-beta"])
    )

    assert set(adapters) == {"mock-alpha", "mock-beta"}
    assert all(isinstance(adapter, MockAdapter) for adapter in adapters.values())


class RecordingClient:
    def __init__(self) -> None:
        self.completed: dict[str, object] | None = None
        self.heartbeats: list[list[str]] = []

    async def stream_chunks(self, job_id, chunks) -> None:
        self.job_id = job_id
        self.streamed = "".join([chunk async for chunk in chunks])

    async def complete(self, job_id, result, started_at, tokens_in, tokens_out) -> None:
        del started_at
        self.completed = {
            "job_id": job_id,
            "result": result,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    async def fail(self, job_id, reason, retryable=True) -> None:
        raise AssertionError(f"unexpected failure for {job_id}: {reason}, retryable={retryable}")

    async def heartbeat(self, capabilities) -> None:
        self.heartbeats.append(list(capabilities))


class RecordingFailureClient(RecordingClient):
    def __init__(self) -> None:
        super().__init__()
        self.failure: dict[str, object] | None = None

    async def fail(self, job_id, reason, retryable=True) -> None:
        self.failure = {"job_id": job_id, "reason": reason, "retryable": retryable}


def coordinator_http_error(status_code: int, detail: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://coordinator/api/jobs/job-1/complete")
    response = httpx.Response(status_code, request=request, json={"detail": detail})
    return httpx.HTTPStatusError(detail, request=request, response=response)


class StaleCompleteClient(RecordingClient):
    async def complete(self, job_id, result, started_at, tokens_in, tokens_out) -> None:
        del job_id, result, started_at, tokens_in, tokens_out
        raise coordinator_http_error(409, "Job is complete and cannot be mutated")


class StaleFailClient(RecordingClient):
    async def fail(self, job_id, reason, retryable=True) -> None:
        del job_id, reason, retryable
        raise coordinator_http_error(403, "Job is not claimed by this worker")


class FlakyRegistrationClient:
    def __init__(self) -> None:
        self.register_attempts = 0
        self.heartbeats: list[list[str]] = []

    async def register(self, capabilities, *, rotate_token: bool = False) -> None:
        del capabilities, rotate_token
        self.register_attempts += 1
        if self.register_attempts == 1:
            raise httpx.ConnectError("coordinator offline")

    async def heartbeat(self, capabilities, status: str = "online") -> None:
        del status
        self.heartbeats.append(list(capabilities))


class ForbiddenRegistrationClient:
    async def register(self, capabilities, *, rotate_token: bool = False) -> None:
        del capabilities, rotate_token
        request = httpx.Request("POST", "http://coordinator/api/workers/register")
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError("forbidden", request=request, response=response)

    async def heartbeat(self, capabilities, status: str = "online") -> None:
        del capabilities, status
        raise AssertionError("heartbeat should not run after forbidden registration")


class TinyAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        yield "hello "
        yield "world"


class SlowAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        await asyncio.sleep(0.03)
        yield "hello "
        await asyncio.sleep(0.03)
        yield "world"


class FailingAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        raise RuntimeError("adapter failed")
        yield ""  # pragma: no cover - keeps this as an async generator.


class InvalidJsonAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        yield "This is not JSON."


def test_stale_job_error_classification_does_not_mask_auth_failures() -> None:
    assert stale_job_coordinator_error(coordinator_http_error(404, "Job not found"))
    assert stale_job_coordinator_error(coordinator_http_error(409, "Job is complete and cannot be mutated"))
    assert not stale_job_coordinator_error(coordinator_http_error(403, "Invalid worker token"))


def test_completion_400_is_nonretryable_contract_error() -> None:
    request = httpx.Request("POST", "http://coordinator/api/jobs/job-1/complete")
    response = httpx.Response(400, request=request, json={"detail": "bad contract"})
    exc = httpx.HTTPStatusError("400 Bad Request", request=request, response=response)

    assert nonretryable_coordinator_completion_error(exc)
    assert not nonretryable_coordinator_completion_error(coordinator_http_error(500, "server unhappy"))


@pytest.mark.asyncio
async def test_handle_job_reports_input_and_output_token_estimates() -> None:
    client = RecordingClient()
    job = {
        "id": "job-1",
        "job_type": "argue",
        "required_model": "tiny",
        "prompt": {"system": "system prompt", "user": "user prompt", "max_tokens": 20},
    }

    await handle_job(client, {"tiny": TinyAdapter()}, job)

    assert client.completed == {
        "job_id": "job-1",
        "result": {"argument": "hello world"},
        "tokens_in": estimate_tokens("system prompt", "user prompt"),
        "tokens_out": estimate_tokens("hello world"),
    }


@pytest.mark.asyncio
async def test_handle_job_ignores_stale_complete_rejection() -> None:
    client = StaleCompleteClient()
    job = {
        "id": "job-1",
        "job_type": "argue",
        "required_model": "tiny",
        "prompt": {"system": "system prompt", "user": "user prompt", "max_tokens": 20},
    }

    await handle_job(client, {"tiny": TinyAdapter()}, job)

    assert client.streamed == "hello world"
    assert client.completed is None


@pytest.mark.asyncio
async def test_handle_job_ignores_stale_fail_rejection_after_adapter_error() -> None:
    client = StaleFailClient()
    job = {
        "id": "job-1",
        "job_type": "argue",
        "required_model": "failing",
        "prompt": {"system": "system prompt", "user": "user prompt", "max_tokens": 20},
    }

    await handle_job(client, {"failing": FailingAdapter()}, job)


@pytest.mark.asyncio
async def test_handle_job_marks_malformed_structured_output_nonretryable() -> None:
    client = RecordingFailureClient()
    job = {
        "id": "job-1",
        "job_type": "decompose",
        "required_model": "invalid-json",
        "prompt": {"system": "Return JSON only", "user": "<topic>Vote?</topic>", "max_tokens": 20},
    }

    await handle_job(client, {"invalid-json": InvalidJsonAdapter()}, job)

    assert client.failure is not None
    assert client.failure["job_id"] == "job-1"
    assert client.failure["retryable"] is False
    assert "valid JSON object" in str(client.failure["reason"])


@pytest.mark.asyncio
async def test_handle_job_heartbeats_during_slow_generation() -> None:
    client = RecordingClient()
    job = {
        "id": "job-1",
        "job_type": "argue",
        "required_model": "slow",
        "prompt": {"system": "system prompt", "user": "user prompt", "max_tokens": 20},
    }

    await handle_job_with_heartbeats(
        client,
        {"slow": SlowAdapter()},
        job,
        capabilities=["slow"],
        heartbeat_seconds=0.01,
    )

    assert client.completed is not None
    assert client.heartbeats
    assert all(heartbeat == ["slow"] for heartbeat in client.heartbeats)


@pytest.mark.asyncio
async def test_register_with_backoff_retries_transient_coordinator_errors() -> None:
    client = FlakyRegistrationClient()

    await register_with_backoff(
        client,
        ["mock-local"],
        asyncio.Event(),
        initial_backoff_seconds=0,
        max_backoff_seconds=0,
    )

    assert client.register_attempts == 2
    assert client.heartbeats == [["mock-local"]]


@pytest.mark.asyncio
async def test_register_with_backoff_does_not_retry_auth_failures() -> None:
    with pytest.raises(httpx.HTTPStatusError):
        await register_with_backoff(
            ForbiddenRegistrationClient(),
            ["mock-local"],
            asyncio.Event(),
            initial_backoff_seconds=0,
            max_backoff_seconds=0,
        )


@pytest.mark.asyncio
async def test_coordinator_client_stream_chunks_retries_with_offsets() -> None:
    calls: list[dict[str, object]] = []

    async def chunks():
        yield "hello "
        yield "world"
        yield "!"

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode())
        calls.append(payload)
        if len(calls) == 1:
            raise httpx.ConnectError("tunnel rotated", request=request)
        return httpx.Response(200, request=request, json={"status": "ok"})

    client = CoordinatorClient(
        WorkerConfig(
            coordinator_url="http://coordinator",
            worker_id="worker-1",
            worker_token="worker-token",
        )
    )
    await client.client.aclose()
    client.client = httpx.AsyncClient(base_url="http://coordinator", transport=httpx.MockTransport(handler))
    try:
        await client.stream_chunks(
            "job-1",
            chunks(),
            initial_backoff_seconds=0,
            max_backoff_seconds=0,
            max_chunks_per_batch=2,
        )
    finally:
        await client.aclose()

    assert calls == [
        {"delta": "hello world", "offset": 0},
        {"delta": "hello world", "offset": 0},
        {"delta": "!", "offset": 11},
    ]


@pytest.mark.asyncio
async def test_coordinator_client_truncates_failure_reason_to_api_limit() -> None:
    calls: list[dict[str, object]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode())
        calls.append(payload)
        assert len(payload["reason"]) == 2000
        return httpx.Response(200, request=request, json={"status": "queued"})

    client = CoordinatorClient(
        WorkerConfig(
            coordinator_url="http://coordinator",
            worker_id="worker-1",
            worker_token="worker-token",
        )
    )
    await client.client.aclose()
    client.client = httpx.AsyncClient(base_url="http://coordinator", transport=httpx.MockTransport(handler))
    try:
        await client.fail("job-1", "x" * 5000, retryable=True)
    finally:
        await client.aclose()

    assert calls == [{"reason": "x" * 2000, "retryable": True}]


def test_parse_result_extracts_json_for_v2_evidence() -> None:
    """Regression: v2_evidence was missing from parse_result's JSON job-type
    set (the subscription loop's twin, scripts/subscription_loop.py
    parse_model_response, gained it in T10; this copy drifted). Worker A then
    shipped {"argument": "<prose>"} for evidence jobs and the coordinator's
    validate_evidence_contract correctly 400'd every completion -- observed
    live on 2026-07-26 as 5 of 6 evidence jobs failing on debate 0f688d87.

    The model output deliberately embeds the JSON inside prose, because that
    is exactly the shape the claude CLI produced in the live failure."""
    text = (
        "The polling loop found no queued job -- answering directly. "
        'Let me search for sources.{"sources":[{"url":"https://example.org/a",'
        '"quote":"q","publisher":"Example","date":null,"retrieval_query":"rq",'
        '"stance":"supports"}],"provenance":{"model_id":"m","worker_id":"w",'
        '"prompt_id":null,"job_id":"j"}}'
    )

    result = parse_result({"job_type": "v2_evidence"}, text)

    assert isinstance(result, dict)
    assert isinstance(result.get("sources"), list)
    assert result["sources"][0]["url"] == "https://example.org/a"
    assert "argument" not in result
