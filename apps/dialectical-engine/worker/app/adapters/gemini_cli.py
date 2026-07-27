from __future__ import annotations

import asyncio
from app.adapters.subprocess_base import SubprocessStreamingAdapter, ensure_argv_fits


class GeminiCliAdapter(SubprocessStreamingAdapter):
    model_id = "gemini-3.5-flash-loop"
    cli_model = "gemini-3.5-flash-high"
    role_pool = {"decomposer", "proposer", "opponent", "synthesizer"}
    executable = "agy"

    async def health_check(self) -> bool:
        if not await super().health_check():
            return False
        process: asyncio.subprocess.Process | None = None
        try:
            process = await asyncio.create_subprocess_exec(
                "agy",
                "--print",
                "Respond with exactly OK.",
                "--model",
                self.cli_model,
                "--effort",
                "high",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _stderr = await asyncio.wait_for(process.communicate(), timeout=30)
        except (OSError, asyncio.TimeoutError):
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()
            return False
        return process.returncode == 0 and bool(stdout.strip())

    def command(self, system: str, user: str, max_tokens: int) -> list[str]:
        # agy has no off-argv prompt channel -- verified against the installed
        # binary 2026-07-26: piped stdin is ignored entirely, `--print ""`
        # exits with "empty prompt", there is no --prompt-file/--input-file
        # flag, and the `@path` mention syntax routes through the agent's
        # read_file TOOL, which headless mode auto-denies. So the prompt stays
        # on argv, and an oversized one is refused BEFORE exec with a typed
        # error the worker turns into a failed job -- never the raw
        # OSError E2BIG that killed the gemini subscription loop live.
        prompt = f"{system}\n\n{user}\n\nMaximum tokens: {max_tokens}"
        command = ["agy", "--print", prompt, "--model", self.cli_model, "--effort", "high"]
        ensure_argv_fits(
            command,
            self.env(),
            detail=(
                f" The rendered prompt is {len(prompt.encode('utf-8'))} bytes, and agy has no"
                " stdin or prompt-file channel to deliver it off argv; this job needs a"
                " provider whose CLI reads the prompt from stdin (claude) or a file (grok)."
            ),
        )
        return command
