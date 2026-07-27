from __future__ import annotations

import asyncio
import contextvars
import os
import re
import tempfile
from pathlib import Path

from app.adapters.subprocess_base import SubprocessStreamingAdapter

PROMPT_FLAG_PATTERN = re.compile(r"(?<!\S)(?:-p|--prompt)(?:[=\s,]|$)")


class GrokCliAdapter(SubprocessStreamingAdapter):
    model_id = "grok-4.5-high-loop"
    cli_model = "grok-4.5"
    role_pool = {"proposer", "opponent"}
    executable = "grok"

    def __init__(self) -> None:
        # Per-call prompt-file path. A ContextVar (not an instance attribute)
        # because this adapter is built once and shared across jobs (see
        # detect_adapters): concurrent stream() calls each stage their own
        # prompt file, and one job's cleanup must never unlink another's.
        # Same pattern as CodexCliAdapter._last_message_path.
        self._prompt_path: contextvars.ContextVar[Path | None] = contextvars.ContextVar(
            "grok_prompt_path",
            default=None,
        )

    async def health_check(self) -> bool:
        if not await super().health_check():
            return False
        process: asyncio.subprocess.Process | None = None
        try:
            process = await asyncio.create_subprocess_exec(
                self.executable,
                "--help",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=5)
        except (OSError, asyncio.TimeoutError):
            if process is not None:
                try:
                    process.kill()
                    await process.wait()
                except ProcessLookupError:
                    pass
            return False

        if process.returncode != 0:
            return False
        help_text = (stdout + stderr).decode(errors="replace")
        return bool(PROMPT_FLAG_PATTERN.search(help_text))

    def command(self, system: str, user: str, max_tokens: int) -> list[str]:
        # The prompt goes to a file and only the path rides argv: grok
        # documents `--prompt-file <PATH>` ("Single-turn prompt from a file",
        # the exact peer of `--single <PROMPT>`, verified end to end
        # 2026-07-26), so big debate trees can never blow the execve ARG_MAX
        # budget the way an argv-borne prompt does. mkstemp gives 0600; the
        # file is removed by cleanup() from stream()'s finally.
        prompt = f"{system}\n\n{user}\n\nMaximum tokens: {max_tokens}"
        handle, raw_path = tempfile.mkstemp(
            prefix="dialectical-grok-prompt-",
            suffix=".txt",
            dir=tempfile.gettempdir(),
        )
        prompt_path = Path(raw_path)
        with os.fdopen(handle, "w", encoding="utf-8") as prompt_file:
            prompt_file.write(prompt)
        self._prompt_path.set(prompt_path)
        return [
            "grok",
            "--prompt-file",
            str(prompt_path),
            "--model",
            self.cli_model,
            "--reasoning-effort",
            "high",
            "--output-format",
            "plain",
        ]

    def cleanup(self) -> None:
        prompt_path = self._prompt_path.get()
        if prompt_path is None:
            return
        self._prompt_path.set(None)
        try:
            prompt_path.unlink(missing_ok=True)
        except OSError:  # never fail a finished job on prompt-file cleanup
            pass
