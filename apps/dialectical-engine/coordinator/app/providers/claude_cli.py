"""In-process Claude CLI provider (Task 6: cross-family judge panel,
docs/improvement-plan-2026-07-22.md §P2.2). Coordinator-side sibling of
app.providers.codex_cli.CodexCliProvider -- same LLMProvider shape
(.generate(messages, model=..., ...) -> LLMResponse) and the same "ask the
model to emit JSON directly, take raw stdout" convention (there is no
`--output-format json` wrapper to unwrap -- app.scoring.parser.
parse_judge_json expects the raw text to already be a bare JSON document, so
this provider's own prompt tail asks for exactly that, same as Codex's).

CLI invocation mirrors worker/app/adapters/claude_cli.py's --model/--effort
flags and scripts/subscription_loop.py's build_claude_command's
`--output-format text` -- a single plain-text response, NOT the worker's
streaming `--output-format stream-json` delta feed (the coordinator wants
one complete judge output per call, exactly like CodexCliProvider).
"""
from __future__ import annotations

import shutil
import subprocess

from app.providers.base import LLMResponse, ProviderError
from app.providers.codex_cli import ProviderAvailability

# DIALECTICAL_JUDGE_PANEL_MODELS (app.scoring.judge_panel) lists loop-worker
# model ids -- e.g. "claude-sonnet-5-high-loop", matching worker/app/
# adapters/claude_cli.py's ClaudeCliAdapter.model_id -- so ops can reuse the
# same id vocabulary already advertised by loop workers. The CLI's own
# --model flag wants the bare model name (ClaudeCliAdapter.cli_model);
# known loop ids are translated here. An unrecognized id is passed straight
# through to --model rather than rejected: a future/ops-configured model id
# this table doesn't know about yet may still be valid for the CLI.
_CLI_MODEL_ALIASES: dict[str, str] = {
    "claude-sonnet-5-high-loop": "claude-sonnet-5",
}


class ClaudeCliProvider:
    name = "claude"

    def __init__(self, executable: str = "claude", timeout_seconds: int = 120) -> None:
        self.executable = executable
        self.timeout_seconds = timeout_seconds

    def availability(self) -> ProviderAvailability:
        if shutil.which(self.executable) is None:
            return ProviderAvailability(
                provider=self.name,
                available=False,
                reason=f"Claude executable not found: {self.executable}",
            )
        return ProviderAvailability(provider=self.name, available=True)

    def command(
        self,
        messages: list[dict],
        *,
        model: str,
        max_tokens: int | None = None,
        response_format: str | None = None,
    ) -> list[str]:
        prompt = self.prompt_from_messages(messages)
        if response_format == "json":
            prompt = f"{prompt}\n\nReturn only valid JSON."
        if max_tokens is not None:
            prompt = f"{prompt}\n\nKeep the answer under {max_tokens} tokens."
        cli_model = _CLI_MODEL_ALIASES.get(model, model)
        return [
            self.executable,
            "-p",
            prompt,
            "--model",
            cli_model,
            "--effort",
            "high",
            "--output-format",
            "text",
        ]

    def generate(
        self,
        messages: list[dict],
        *,
        model: str,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        response_format: str | None = None,
        role: str | None = None,
    ) -> LLMResponse:
        resolved_executable = shutil.which(self.executable)
        if resolved_executable is None:
            raise ProviderError(f"Claude executable not found: {self.executable}")
        command = self.command(messages, model=model, max_tokens=max_tokens, response_format=response_format)
        command[0] = resolved_executable
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(f"Claude command timed out after {self.timeout_seconds} seconds.") from exc
        except OSError as exc:
            raise ProviderError(f"Claude command failed to start: {exc}") from exc
        if completed.returncode != 0:
            error = self.compact_error(completed.stderr, completed.stdout)
            raise ProviderError(f"Claude command exited with code {completed.returncode}: {error}"[:2_000])
        return LLMResponse(
            text=completed.stdout.strip(),
            raw={
                "provider": self.name,
                "returncode": completed.returncode,
                "stderr": completed.stderr,
                "stdout": completed.stdout,
            },
            usage=None,
        )

    @staticmethod
    def prompt_from_messages(messages: list[dict]) -> str:
        parts: list[str] = []
        for message in messages:
            role = str(message.get("role", "user")).strip() or "user"
            content = str(message.get("content", ""))
            parts.append(f"{role.upper()}:\n{content}")
        return "\n\n".join(parts)

    @staticmethod
    def compact_error(stderr: str, stdout: str) -> str:
        output = stderr.strip() or stdout.strip()
        if not output:
            return "Claude command failed"
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        return lines[-1][:500]
