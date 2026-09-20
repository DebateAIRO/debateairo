#!/usr/bin/env python3
"""ARCH-FIX-S01-02 finding detectors. Exit 0 iff every assigned finding's repair is present.
Also --mutant <id> to re-introduce one defect and expect a FAIL (non-zero).
"""
import argparse, pathlib, re, sys, tempfile, shutil

PLAN = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md")
ADR = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/architecture/01-decisions/ADR-0026-system-publication-without-grant.md")

def checks(plan: str, adr: str):
    fails = []
    def need(name, cond, detail=""):
        if not cond:
            fails.append(f"{name}: {detail or 'missing'}")
    c2s6 = plan.split("#### C2-S6:")[1].split("#### C2-S7:")[0] if "#### C2-S6:" in plan else ""
    c3intro = plan.split("### S01-C3")[1].split("#### C3-S1:")[0] if "### S01-C3" in plan else ""
    c1s3 = plan.split("#### C1-S3:")[1].split("#### C1-S4:")[0] if "#### C1-S3:" in plan else ""
    c1s9 = plan.split("#### C1-S9:")[1].split("#### C1-S10:")[0] if "#### C1-S9:" in plan else ""
    c2s4 = plan.split("#### C2-S4:")[1].split("#### C2-S5:")[0] if "#### C2-S4:" in plan else ""
    c2s10 = plan.split("#### C2-S10:")[1].split("#### C2-S11:")[0] if "#### C2-S10:" in plan else ""
    c2s18 = plan.split("#### C2-S18:")[1].split("#### C2-S19:")[0] if "#### C2-S18:" in plan else ""
    c4s1 = plan.split("#### C4-S1:")[1].split("#### C4-S2:")[0] if "#### C4-S1:" in plan else ""
    c4s4 = plan.split("#### C4-S4:")[1].split("#### C4-S5:")[0] if "#### C4-S4:" in plan else ""
    sv = plan.split("## 6. Slice verification")[1].split("## 7.")[0] if "## 6. Slice verification" in plan else ""
    fmap = plan.split("### 1.1 Single-writer file map")[1].split("## 2. Steps")[0] if "### 1.1 Single-writer file map" in plan else ""

    # B1
    need("B1-wrapper", "identity.audit_system_publication_attempt" in c2s4, "wrapper not in C2-S4")
    need("B1-ts-path", "auditSystemPublicationAttempt" in c2s6, "C2-S6 does not call the wrapper")
    need("B1-no-direct", "Do **not** call `identity.append_audit_event_internal`" in c2s6,
         "C2-S6 does not forbid the direct call")
    need("B1-s10", "audit_system_publication_attempt" in c2s10)
    need("B1-adr", "audit_system_publication_attempt" in adr)
    # B2
    need("B2-userid", "userId: string; ownerRef: string" in c2s6.replace(" ", "") or "userId: string" in c2s6)
    need("B2-no-session-arg", "AuthenticatedSession" not in c2s6.split("tryAutoPublish(input:")[1].split("Promise<void>")[0] if "tryAutoPublish(input:" in c2s6 else False,
         "tryAutoPublish still takes AuthenticatedSession")
    need("B2-main-map", "apps/api/src/main.ts" in fmap)
    need("B2-interval", "reconcileFreePublicAutoPublish" in c2s18 and "main.ts" in c2s18)
    # B3
    need("B3-c2s6-list", "isFreePublicBound(runId: string): Promise<boolean>" in c2s6 or "isFreePublicBound(runId: string)" in c2s6)
    need("B3-c2s6-done", "isFreePublicBound" in c2s6.split("Done:")[1] if "Done:" in c2s6 else False)
    need("B3-c3-no-add", "C3 adds `isFreePublicBound`" not in c3intro and "if C2 did not put it" not in c3intro)
    # B4
    need("B4-for-update", "FOR UPDATE" in c2s4)
    need("B4-live", "run_private_content_is_live" in c2s4)
    need("B4a-cases", "B4(a) Premium" in plan and "B4(a) NULL tier" in plan and "B4(a) pre-rule" in plan)
    need("B4b-erased", "B4(b) erased" in plan)
    need("B4b-gate", "system_publication_key_provision_intent" in c4s4)
    need("B4c-race", "B4(c) race" in plan)
    need("B4c-lock", "under the run row lock" in plan or "FOR UPDATE" in c2s4)
    # B5
    need("B5-coalesce", "COALESCE((p_run->>'freePublicRule')::boolean, false)" in c1s3)
    need("B5-s9", "extra-key" in c1s9 or "extra payload key" in c1s9 or "extra key" in c1s9)
    need("B5-not-missing-null", "hits `NOT NULL`" not in c1s3)
    # N1
    need("N1-no-agg", "Test Files` count equals" not in plan and "Test Files count equals" not in plan)
    need("N1-rc-line", "rc=… passed=… failed=…" in plan)
    # N2
    need("N2-tombstone", "private_run_erasure_tombstone" in c4s1)
    # N3
    need("N3-c1-titles", '"pre-rule free row is not bound"' in plan)
    need("N3-sv1-members", "POST /v1/runs/{id}/unpublish" in sv and "POST /v1/auth/register" in sv)
    # N4
    need("N4-sv0", "generate:contract" in sv and "packages/contract/generated/client.ts" in sv)
    # N5
    need("N5-version", "actor_ref_version=2" in c2s4 or "actor_ref_version=2" in plan or "`actor_ref_version=2`" in c2s4)
    return fails

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutant", default="")
    args = ap.parse_args()
    plan = PLAN.read_text()
    adr = ADR.read_text()
    if args.mutant == "B3":
        plan = plan.replace("  - `isFreePublicBound(runId: string): Promise<boolean>` — delegates to `core.run_is_free_public_bound` (B3). Present on the interface in **this** step's list and in this step's done-criterion. C3 does not add it and does not edit `publications.ts`.\n", "")
        plan = re.sub(r"\*\*and\*\* `isFreePublicBound` are on the interface", "are on the interface", plan)
    elif args.mutant == "B5":
        plan = plan.replace("COALESCE((p_run->>'freePublicRule')::boolean, false)", "(p_run->>'freePublicRule')::boolean")
        plan = plan.replace("A missing key writes `false`", "A missing `freePublicRule` key yields NULL, hits `NOT NULL`")
    elif args.mutant == "B1":
        plan = plan.replace("identity.audit_system_publication_attempt", "identity.append_audit_event_internal")
        plan = plan.replace("auditSystemPublicationAttempt", "append_audit_event_internal")
    fails = checks(plan, adr)
    if args.mutant:
        if fails:
            print("MUTANT %s FAIL (detector caught):" % args.mutant)
            print("\n".join(fails))
            return 0  # watched failing = success of the checker
        print("MUTANT %s UNCAUGHT" % args.mutant)
        return 1
    if fails:
        print("DETECTOR FAIL")
        print("\n".join(fails))
        return 1
    print("DETECTOR PASS all of B1 B2 B3 B4 B5 N1 N2 N3 N4 N5")
    return 0

if __name__ == "__main__":
    sys.exit(main())
