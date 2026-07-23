from __future__ import annotations

from collections.abc import Callable

from app.adapters.subprocess_base import ClaudeStreamJsonParser, SubprocessStreamingAdapter


class ClaudeCliAdapter(SubprocessStreamingAdapter):
    model_id = "claude-sonnet-5-high-loop"
    cli_model = "claude-sonnet-5"
    role_pool = {"decomposer", "proposer", "opponent", "synthesizer"}
    executable = "claude"

    def command(self, system: str, user: str, max_tokens: int) -> list[str]:
        prompt = f"{system}\n\n{user}"
        return [
            "claude",
            "-p",
            prompt,
            "--model",
            self.cli_model,
            "--effort",
            "high",
            "--output-format",
            "stream-json",
            "--verbose",
        ]

    def new_line_parser(self) -> Callable[[str], str]:
        # Fresh stateful parser per stream() so the assistant/result de-dup flag
        # resets per job (this adapter instance is reused across jobs).
        return ClaudeStreamJsonParser()
