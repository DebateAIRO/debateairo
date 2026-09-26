#!/usr/bin/env python3
"""Temporary README mutants. Restores the original bytes in finally."""
from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

WT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine")
OUT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-security-data-safety")
README = WT / "deploy/vps/README.md"
orig = README.read_bytes()
digest = hashlib.sha256(orig).hexdigest()
text = orig.decode()

ROW_A = (
    "| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, "
    "and a debate target declares no price pair. |\n"
)
ROW_B = (
    "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | hosted mode, and the `admissionPolicy` "
    "row in force at the resolved `REGISTER_VERSION` lacks at least one of the three "
    "support budgets: `support_reads`, `support_sessions`, `support_model_calls`. |\n"
)
assert text.count(ROW_A) == 1, text.count(ROW_A)
assert text.count(ROW_B) == 1, text.count(ROW_B)

env = os.environ.copy()
env["PATH"] = "/opt/homebrew/bin:" + env.get("PATH", "")
log_parts: list[str] = [f"sha256_before {digest}\n"]

def run(label: str) -> None:
    proc = subprocess.run(
        ["pnpm", "exec", "vitest", "run", "tests/unit/v9-provider-credential-files.test.ts",
         "-t", "names every start-up refusal"],
        cwd=WT, env=env, capture_output=True, text=True,
    )
    tail = "\n".join(proc.stdout.splitlines()[-25:])
    log_parts.append(f"\n===== {label} rc={proc.returncode} =====\n{tail}\n")
    if proc.returncode != 0 and "FAIL" not in proc.stdout and "failed" not in proc.stdout:
        log_parts.append(proc.stderr[-2000:])

try:
    README.write_text(text.replace(ROW_A, "", 1))
    run("A drop PROVIDER_TARGET_PRICE_REQUIRED row; order sentence kept")
    README.write_bytes(orig)
    README.write_text(text.replace(ROW_B, "", 1))
    run("B drop SUPPORT_ADMISSION_SCOPES_NOT_SEALED row")
finally:
    README.write_bytes(orig)
    after = hashlib.sha256(README.read_bytes()).hexdigest()
    log_parts.append(f"\nsha256_after {after}\nrestored {after == digest}\n")

(OUT / "mutant-pin.log").write_text("".join(log_parts))
print("".join(log_parts))
if hashlib.sha256(README.read_bytes()).hexdigest() != digest:
    raise SystemExit("RESTORE FAILED")
