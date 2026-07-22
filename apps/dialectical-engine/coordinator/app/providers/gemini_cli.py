"""In-process Gemini CLI provider (Task 6: cross-family judge panel,
docs/improvement-plan-2026-07-22.md §P2.2). Coordinator-side sibling of
app.providers.codex_cli.CodexCliProvider / app.providers.claude_cli.
ClaudeCliProvider -- same LLMProvider shape and the same "ask the model to
emit JSON directly, take raw stdout" convention (app.scoring.parser.
parse_judge_json expects the raw text to already be a bare JSON document).

CLI invocation mirrors worker/app/adapters/gemini_cli.py's `agy --print
<prompt> --model <cli_model> --effort high` and scripts/subscription_loop.
py's build_gemini_command -- the agy CLI takes no --output-format flag (see
both references), unlike claude's/codex's CLIs.
"""
from __future__ import annotations

import shutil
import subprocess

from app.providers.base import LLMResponse, ProviderError
from app.providers.codex_cli import ProviderAvailability

# See app.providers.claude_cli's identical comment: DIALECTICAL_JUDGE_PANEL_
# MODELS lists loop-worker model ids (e.g. "gemini-3.5-flash-loop", matching
# worker/app/adapters/gemini_cli.py's GeminiCliAdapter.model_id); known ids
# translate to the CLI's own --model flag value (GeminiCliAdapter.
# cli_model). An unrecognized id passes straight through unchanged.
_CLI_MODEL_ALIASES: dict[str, str] = {
    "gemini-3.5-flash-loop": "gemini-3.5-flash-high",
}


class GeminiCliProvider:
    name = "gemini"

    def __init__(self, executable: str = "agy", timeout_seconds: int = 120) -> None:
        self.executable = executable
        self.timeout_seconds = timeout_seconds

    def availability(self) -> ProviderAvailability:
        if shutil.which(self.executable) is None:
            return ProviderAvailability(
                provider=self.name,
                available=False,
                reason=f"Gemini executable not found: {self.executable}",
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
        return [self.executable, "--print", prompt, "--model", cli_model, "--effort", "high"]

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
            raise ProviderError(f"Gemini executable not found: {self.executable}")
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
            raise TimeoutError(f"Gemini command timed out after {self.timeout_seconds} seconds.") from exc
        except OSError as exc:
            raise ProviderError(f"Gemini command failed to start: {exc}") from exc
        if completed.returncode != 0:
            error = self.compact_error(completed.stderr, completed.stdout)
            raise ProviderError(f"Gemini command exited with code {completed.returncode}: {error}"[:2_000])
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
            return "Gemini command failed"
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        return lines[-1][:500]
