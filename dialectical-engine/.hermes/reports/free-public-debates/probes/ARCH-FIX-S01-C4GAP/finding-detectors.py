#!/usr/bin/env python3
"""G1 detector: erasure PRIVATE shape + trigger admission in C4-S4, not in 0067.
--mutant G1 re-introduces the gap (no f2, no trigger replace).
"""
import argparse, pathlib, sys

PLAN = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md")

def checks(plan: str):
    fails = []
    def need(name, cond, detail=""):
        if not cond:
            fails.append(f"{name}: {detail or 'missing'}")
    c4s4 = plan.split("#### C4-S4:")[1].split("#### C4-S5:")[0] if "#### C4-S4:" in plan else ""
    c4s2 = plan.split("#### C4-S2:")[1].split("#### C4-S4:")[0] if "#### C4-S2:" in plan else ""
    fmap = plan.split("### 1.1 Single-writer file map")[1].split("No cluster writes")[0]
    need("G1-f2-token", "00000000-0000-4000-8000-0000000000f2" in c4s4)
    need("G1-trigger-in-0068", "CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding" in c4s4)
    need("G1-no-edit-0067", "C2's `0067` is not edited" in c4s4 or "0067` is not edited" in plan)
    need("G1-cleanup-first", "cleanup intent must exist before the visibility INSERT" in c4s4)
    need("G1-no-binding", "Do NOT INSERT identity.publication_event_binding" in c4s4)
    need("G1-no-unpublish-grant", "Do NOT consume an UNPUBLISH grant" in c4s4)
    need("G1-private-state", "state = 'PRIVATE'" in c4s4 or "state='PRIVATE'" in c4s4)
    need("G1-warning", "COPIES_MAY_PERSIST_V1" in c4s4)
    need("G1-bound-check", "run_is_free_public_bound" in c4s4)
    need("G1-case9", "**G1 PRIVATE shape.**" in plan)
    need("G1-case10", "**G1 guard — not bound.**" in plan)
    need("G1-case11", "**G1 guard — no cleanup intent.**" in plan)
    need("G1-case12", "**G1 guard — system token on PRIVATE.**" in plan)
    need("G1-map-still-0068", "0068_bound_published_erasure.sql" in fmap)
    need("G1-map-not-0067-c4", "| `migrations/0067_system_run_publication.sql` | C2 |" in fmap
         or "0067_system_run_publication.sql` | C2" in fmap)
    return fails

def mutant(plan: str) -> str:
    # re-introduce G1: INSERT PRIVATE with no token/trigger admission
    plan = plan.replace("00000000-0000-4000-8000-0000000000f2", "TOKEN_REMOVED")
    plan = plan.replace("CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()", "TRIGGER_REPLACE_REMOVED")
    plan = plan.replace("**G1 PRIVATE shape**", "SHAPE_REMOVED")
    plan = plan.replace("**G1 guard — not bound**", "GUARD_REMOVED")
    return plan

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutant", default="")
    args = ap.parse_args()
    plan = PLAN.read_text()
    if args.mutant:
        fails = checks(mutant(plan))
        if fails:
            print("MUTANT G1 FAIL (detector caught):")
            print("\n".join(fails))
            return 0
        print("MUTANT G1 UNCAUGHT")
        return 1
    fails = checks(plan)
    if fails:
        print("DETECTOR FAIL")
        print("\n".join(fails))
        return 1
    print("DETECTOR PASS G1")
    return 0

if __name__ == "__main__":
    sys.exit(main())
