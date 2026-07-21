from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.providers.base import LLMResponse, ProviderError


@dataclass(frozen=True)
class ProviderAvailability:
    provider: str
    available: bool
    reason: str | None = None


class CodexCliProvider:
    name = "codex"

    def __init__(self, executable: str = "codex", timeout_seconds: int = 120) -> None:
        self.executable = executable
        self.timeout_seconds = timeout_seconds

    def availability(self) -> ProviderAvailability:
        if shutil.which(self.executable) is None:
            return ProviderAvailability(
                provider=self.name,
                available=False,
                reason=f"Codex executable not found: {self.executable}",
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
        cli_model = "gpt-5.6-sol" if model == "gpt-5.6sol-medium" else model
        command = [
            self.executable,
            "exec",
            "--skip-git-repo-check",
            "--ignore-rules",
            "--sandbox",
            "read-only",
            "--model",
            cli_model,
            prompt,
        ]
        if model == "gpt-5.6sol-medium":
            command[-1:-1] = ["--config", "model_reasoning_effort=medium"]
        return command

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
            raise ProviderError(f"Codex executable not found: {self.executable}")
        command = self.command(
            messages,
            model=model,
            max_tokens=max_tokens,
            response_format=response_format,
        )
        command[0] = resolved_executable
        prompt = command[-1]
        command[-1] = "-"
        with tempfile.TemporaryDirectory(prefix="dialectical-codex-") as tempdir:
            output_path = Path(tempdir) / "last-message.txt"
            command[-1:-1] = ["--cd", tempdir, "--output-last-message", str(output_path)]
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    input=prompt,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=self.timeout_seconds,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise TimeoutError(f"Codex command timed out after {self.timeout_seconds} seconds.") from exc
            except OSError as exc:
                raise ProviderError(f"Codex command failed to start: {exc}") from exc
            final_text = output_path.read_text(encoding="utf-8").strip() if output_path.exists() else ""
        if completed.returncode != 0:
            error = self.compact_error(completed.stderr, completed.stdout)
            raise ProviderError(f"Codex command exited with code {completed.returncode}: {error}"[:2_000])
        return LLMResponse(
            text=final_text or completed.stdout.strip(),
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
            return "Codex command failed"
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        for line in reversed(lines):
            if line.startswith("ERROR: Reconnecting"):
                continue
            if line.startswith("ERROR:"):
                return line.removeprefix("ERROR:").strip() or "Codex command failed"
        return lines[-1][:500]
