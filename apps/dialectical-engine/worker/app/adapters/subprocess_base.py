from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
from collections.abc import AsyncIterator, Callable

# --- CLI prompt transport ----------------------------------------------------
# execve() charges argv AND envp against one kernel limit. On macOS/BSD that is
# ARG_MAX (1 048 576 here, `getconf ARG_MAX`); Linux adds a hard 128 KiB cap on
# any SINGLE argument (MAX_ARG_STRLEN). Passing a rendered debate prompt as one
# argv element therefore fails with
#   OSError: [Errno 7] Argument list too long
# once the tree is big enough -- which is exactly what took the gemini
# subscription loop down live on 2026-07-26 (debate 0f688d87 at 91 nodes).
# Mirrors scripts/subscription_loop.py, the reference implementation whose
# transports were verified against the installed CLIs that day.
ARGV_HEADROOM_BYTES = 64 * 1024
LINUX_MAX_SINGLE_ARG_BYTES = 128 * 1024  # MAX_ARG_STRLEN


class PromptTooLargeForCli(RuntimeError):
    """The prompt cannot be exec'd as an argv element and this CLI offers no
    off-argv channel for it. Raised instead of letting execve fail with E2BIG,
    so the worker reports a failed job rather than crashing mid-claim."""


def argv_bytes(command: list[str]) -> int:
    """Exec footprint of an argv list: each element plus its NUL terminator."""
    return sum(len(str(part).encode("utf-8")) + 1 for part in command)


def argv_capacity_bytes(extra_env: dict[str, str] | None = None) -> int:
    """How many argv bytes this machine can actually exec, after charging the
    environment (execve counts argv + envp together) and keeping headroom for
    the pointer array and the kernel's own bookkeeping."""
    try:
        limit = int(os.sysconf("SC_ARG_MAX"))
    except (ValueError, OSError, AttributeError):  # pragma: no cover - platform fallback
        limit = 256 * 1024
    merged = {**os.environ, **(extra_env or {})}
    env_bytes = sum(len(f"{key}={value}".encode()) + 1 for key, value in merged.items())
    capacity = limit - env_bytes - ARGV_HEADROOM_BYTES
    if sys.platform.startswith("linux"):
        capacity = min(capacity, LINUX_MAX_SINGLE_ARG_BYTES - 4096)
    return max(0, capacity)


def ensure_argv_fits(command: list[str], env: dict[str, str] | None = None, *, detail: str = "") -> None:
    size = argv_bytes(command)
    capacity = argv_capacity_bytes(env)
    if size > capacity:
        executable = command[0] if command else "command"
        raise PromptTooLargeForCli(
            f"{executable} argv is {size} bytes, past this machine's {capacity}-byte "
            f"exec budget (ARG_MAX covers argv and env together).{detail}"
        )


class SubprocessStreamingAdapter:
    model_id: str
    role_pool: set[str]
    executable: str

    def command(self, system: str, user: str, max_tokens: int) -> list[str]:
        raise NotImplementedError

    def stdin_text(self, system: str, user: str, max_tokens: int) -> str | None:
        return None

    def final_output_text(self) -> str | None:
        return None

    def env(self) -> dict[str, str] | None:
        return None

    def cleanup(self) -> None:
        """Per-stream() cleanup hook, called from stream()'s finally once the
        run is over (success, process failure, or spawn error). Adapters that
        stage the prompt on disk (grok) override this to remove the file; the
        default no-op keeps every other adapter unchanged."""

    async def health_check(self) -> bool:
        return shutil.which(self.executable) is not None or os.path.isfile(self.executable)

    async def stream(self, system: str, user: str, max_tokens: int) -> AsyncIterator[str]:
        try:
            stdin_text = self.stdin_text(system, user, max_tokens)
            process = await asyncio.create_subprocess_exec(
                *self.command(system, user, max_tokens),
                stdin=asyncio.subprocess.PIPE if stdin_text is not None else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, **extra_env} if (extra_env := self.env()) else None,
            )
            if stdin_text is not None:
                assert process.stdin is not None
                process.stdin.write(stdin_text.encode())
                await process.stdin.drain()
                process.stdin.close()
            assert process.stdout is not None
            parse_line = self.new_line_parser()
            emitted_output = False
            async for raw_line in process.stdout:
                text = parse_line(raw_line.decode(errors="replace"))
                if text:
                    emitted_output = True
                    yield text
            stderr = await process.stderr.read() if process.stderr else b""
            code = await process.wait()
            if code != 0:
                raise RuntimeError(stderr.decode(errors="replace") or f"{self.executable} exited with {code}")
            if not emitted_output:
                final_text = self.final_output_text()
                if final_text:
                    yield final_text
                    return
                stderr_text = stderr.decode(errors="replace").strip()
                if stderr_text:
                    raise RuntimeError(stderr_text)
                raise RuntimeError(f"{self.executable} produced no output")
        finally:
            self.cleanup()

    def parse_stdout_line(self, line: str) -> str:
        return line

    def new_line_parser(self) -> Callable[[str], str]:
        """Per-stream() line parser callable.

        A FRESH callable is created for every stream() invocation so any
        per-stream parser state (e.g. the assistant/result de-dup flag in
        ClaudeStreamJsonParser) resets cleanly between jobs and concurrent
        stream() calls on a REUSED adapter never share state -- adapters are
        built once in detect_adapters and shared across jobs (see
        worker/app/main.py), so holding such state on the adapter itself would
        leak across jobs. Default: the stateless parse_stdout_line hook, so
        every non-claude subprocess adapter is byte-for-byte unchanged.
        """
        return self.parse_stdout_line


def _assistant_message_text(message: object) -> str:
    """Concatenated text of an assistant envelope's text content blocks."""
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "".join(parts)


class ClaudeStreamJsonParser:
    """Stateful, per-stream() parser for ``claude ... --output-format
    stream-json --verbose``.

    Instantiate one per stream() invocation (see
    SubprocessStreamingAdapter.new_line_parser): the de-dup flag below is
    per-stream state. Extracts the model's answer text from the CURRENT CLI
    schema and the legacy shapes, and NEVER lets raw envelope JSON pass
    through:

      - ``{"type":"assistant","message":{"content":[{"type":"text","text":T},
        ...]}}`` -> the concatenated text blocks T.
      - ``{"type":"result","result":R}`` -> R, but ONLY when no answer text has
        already been emitted this stream. The terminal result envelope
        duplicates the assistant content, so precedence is: assistant/delta
        text wins; the result envelope is a fallback for a stream that carried
        no assistant text at all (avoids double-emitting the answer).
      - legacy ``{"type":"content_block_delta","delta":{"text":T}}`` -> T.
      - legacy ``{"completion":C}`` -> C.
      - ``system`` / ``rate_limit_event`` / any other envelope -> "".

    A line that is not valid JSON is returned unchanged, preserving the base
    adapter's passthrough for genuinely non-JSON CLI output (e.g. a plain-text
    error line).
    """

    def __init__(self) -> None:
        self._emitted_text = False

    def __call__(self, line: str) -> str:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            return line
        if not isinstance(payload, dict):
            return ""
        payload_type = payload.get("type")
        if payload_type == "assistant":
            return self._emit(_assistant_message_text(payload.get("message")))
        if payload_type == "content_block_delta":
            delta = payload.get("delta")
            return self._emit(str(delta.get("text", "")) if isinstance(delta, dict) else "")
        if payload_type == "result":
            # De-dup: the result envelope repeats the assistant answer. Only use
            # it when the stream carried no assistant/delta text of its own.
            if self._emitted_text:
                return ""
            return self._emit(str(payload.get("result", "")))
        if payload_type in {"system", "rate_limit_event"}:
            return ""
        if "completion" in payload:
            return self._emit(str(payload["completion"]))
        return ""

    def _emit(self, text: str) -> str:
        if text:
            self._emitted_text = True
        return text


def claude_stream_json_delta(line: str) -> str:
    """Stateless single-line parse of a claude stream-json line.

    Kept for backward compatibility and single-line use. Multi-line streams
    must use ClaudeStreamJsonParser (via the adapter's new_line_parser) so the
    assistant/result duplication is de-duplicated across the stream.
    """
    return ClaudeStreamJsonParser()(line)
