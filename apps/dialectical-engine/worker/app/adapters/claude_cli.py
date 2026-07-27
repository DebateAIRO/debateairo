from __future__ import annotations

from collections.abc import Callable

from app.adapters.subprocess_base import ClaudeStreamJsonParser, SubprocessStreamingAdapter


class ClaudeCliAdapter(SubprocessStreamingAdapter):
    model_id = "claude-sonnet-5-high-loop"
    cli_model = "claude-sonnet-5"
    role_pool = {"decomposer", "proposer", "opponent", "synthesizer"}
    executable = "claude"

    def command(self, system: str, user: str, max_tokens: int) -> list[str]:
        # The prompt deliberately stays OFF argv: `claude -p` with no prompt
        # argument reads it from stdin ("useful for pipes", verified end to end
        # 2026-07-26), so big debate trees can never blow the execve ARG_MAX
        # budget the way an argv-borne prompt does. See stdin_text below.
        return [
            "claude",
            "-p",
            "--model",
            self.cli_model,
            "--effort",
            "high",
            "--output-format",
            "stream-json",
            "--verbose",
        ]

    def stdin_text(self, system: str, user: str, max_tokens: int) -> str:
        return f"{system}\n\n{user}"

    def new_line_parser(self) -> Callable[[str], str]:
        # Fresh stateful parser per stream() so the assistant/result de-dup flag
        # resets per job (this adapter instance is reused across jobs).
        return ClaudeStreamJsonParser()
