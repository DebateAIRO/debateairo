#!/usr/bin/env python3
"""REV-S01-p1-correctness-tests — refutation duty (probe 3).

Mutate the PRODUCT in my own detached worktree, run the suite the C5 M-line matrix
names, record RED/GREEN, restore, and prove the worktree is byte-clean again.
Every mutant is reverted with `git checkout -- <file>`? NO — the worktree is READ-ONLY
for git. Restore is done by writing back the exact original bytes captured before the edit.
"""
import subprocess, sys, pathlib, re

W = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine")
LOG = pathlib.Path("/private/tmp/debate-tiers-REV-S01-p1-correctness-tests")

def dirty():
    return subprocess.run(["git", "status", "--porcelain"], cwd=W, capture_output=True, text=True).stdout.strip()

def run_suite(path):
    p = subprocess.run(["pnpm", "exec", "vitest", "run", path], cwd=W, capture_output=True, text=True)
    out = p.stdout + p.stderr
    m = [l for l in out.splitlines() if re.match(r"^\s*Tests\s+", l)]
    return (m[-1].strip() if m else "NO SUMMARY"), out

def mutate(rel, old, new, label, suites, expect):
    f = W / rel
    original = f.read_text()
    if old not in original:
        print(f"!! {label}: anchor NOT FOUND in {rel} — mutant skipped")
        return
    n = original.count(old)
    mutated = original.replace(old, new, 1)
    f.write_text(mutated)
    print(f"\n### {label}")
    print(f"    file {rel} (anchor occurrences: {n}, replaced first)")
    print(f"    -  {old.strip()[:120]}")
    print(f"    +  {new.strip()[:120] if new.strip() else '(line deleted)'}")
    try:
        for s in suites:
            summary, out = run_suite(s)
            red = "failed" in summary
            print(f"    {s}: {summary}   -> {'RED' if red else 'GREEN'}  (predicted {expect})")
            (LOG / f"mutant-{label}-{pathlib.Path(s).name}.log").write_text(out)
    finally:
        f.write_text(original)
    d = dirty()
    print(f"    restored; dirty now: {'CLEAN' if d == '' else d}")

print("baseline dirty:", repr(dirty()))

# ---- Mut-1 — M8 / S01-27, S01-28, S01-29, S01-34: the Risk-tier lock.
mutate("apps/ui/app/new/page.tsx",
       '              options={RISK_TIER_OPTIONS}\n              value={riskTier}\n              disabled={planTier === "free"}\n',
       '              options={RISK_TIER_OPTIONS}\n              value={riskTier}\n',
       "M8-risk-lock-removed", ["tests/render/tier01-new-plan-tier.test.tsx"], "RED")

# ---- Mut-2 — M7 / S01-26: roster ORDER (S01-25 uses toContain and must not notice).
mutate("packages/contract/src/plan-tiers.ts",
       'premium: Object.freeze(["gpt-5.6-sol", "claude-opus-5", "grok-4.6"])',
       'premium: Object.freeze(["claude-opus-5", "gpt-5.6-sol", "grok-4.6"])',
       "M7-roster-order-swapped", ["tests/render/tier01-new-plan-tier.test.tsx"], "RED")

# ---- Mut-3 — M10 / S01-23, S01-34: the pinned Free depth value.
mutate("apps/ui/app/new/page.tsx",
       "    setDepth(2);\n",
       "    setDepth(3);\n",
       "M10-free-depth-3", ["tests/render/tier01-new-plan-tier.test.tsx"], "RED")

# ---- Mut-4 — M8 / S01-42b: the ratified dim value.
mutate("apps/ui/app/globals.css",
       ".ndSelect:has(select:disabled) {\n  opacity: 0.45;",
       ".ndSelect:has(select:disabled) {\n  opacity: 0.5;",
       "M8-dim-0.5", ["tests/unit/tier01-style-contract.test.ts"], "RED")

# ---- Mut-5 — M2 VACUITY PROBE: change the chamber VALUE of --line-strong, keep the name.
#      DONE.md M2 measures rgba(242,234,217,.18). If the suite stays GREEN the M2 assertion
#      pins only that the token NAME is declared, not the measured value.
mutate("apps/ui/app/globals.css",
       "--line: rgba(242,234,217,.09); --line-2: rgba(242,234,217,.08); --line-strong: rgba(242,234,217,.18);",
       "--line: rgba(242,234,217,.09); --line-2: rgba(242,234,217,.08); --line-strong: rgba(255,0,0,.99);",
       "M2-chamber-line-strong-VALUE-changed", ["tests/unit/tier01-style-contract.test.ts"], "GREEN(vacuity)")

# ---- Mut-6 — M7/M15 VACUITY PROBE: change the model-dot token VALUE, keep the name.
mutate("apps/ui/app/globals.css",
       "  --m-grok: #5F6670; --m-qwen: #3F8E7C; --m-default: #888888;\n  --m-claude-bg: #EFE9F1;",
       "  --m-grok: #00FF00; --m-qwen: #3F8E7C; --m-default: #888888;\n  --m-claude-bg: #EFE9F1;",
       "M7-m-grok-VALUE-changed", ["tests/unit/tier01-style-contract.test.ts"], "GREEN(vacuity)")

print("\nFINAL dirty:", repr(dirty()))
