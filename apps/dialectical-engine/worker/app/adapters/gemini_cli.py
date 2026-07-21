from __future__ import annotations

import asyncio
from app.adapters.subprocess_base import SubprocessStreamingAdapter


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
        prompt = f"{system}\n\n{user}\n\nMaximum tokens: {max_tokens}"
        return ["agy", "--print", prompt, "--model", self.cli_model, "--effort", "high"]
