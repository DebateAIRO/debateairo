# ARCH-FIX-PES-S01-p2 — exact-string editor for PLAN.md: every old string must occur EXACTLY once, else nothing is written.
import sys
P = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01/PLAN.md"
def apply(pairs):
    s = open(P, encoding="utf-8").read()
    for i, (old, new) in enumerate(pairs):
        n = s.count(old)
        if n != 1:
            sys.exit(f"edit {i}: old string occurs {n} times: {old[:90]!r}")
        s = s.replace(old, new)
    open(P, "w", encoding="utf-8").write(s)
    print(f"applied {len(pairs)} edits")
