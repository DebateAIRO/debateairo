#!/usr/bin/env python3
"""ARCH-FIX-S01-03 detectors for B1-p2 N1-p2 N2-p2 N3-p2.
--mutant B1-p2|N1-p2|N2-p2|N3-p2 re-introduces the defect; exit 0 means the detector caught it.
"""
import argparse, pathlib, sys

PLAN = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md")

def checks(plan: str):
    fails = []
    def need(name, cond, detail=""):
        if not cond:
            fails.append(f"{name}: {detail or 'missing'}")
    c2s3 = plan.split("#### C2-S3:")[1].split("#### C2-S4:")[0] if "#### C2-S3:" in plan else ""
    c2s4 = plan.split("#### C2-S4:")[1].split("#### C2-S5:")[0] if "#### C2-S4:" in plan else ""
    c2s5 = plan.split("#### C2-S5:")[1].split("#### C2-S6:")[0] if "#### C2-S5:" in plan else ""
    c2s6 = plan.split("#### C2-S6:")[1].split("#### C2-S7:")[0] if "#### C2-S6:" in plan else ""
    c2s18 = plan.split("#### C2-S18:")[1].split("#### C2-S19:")[0] if "#### C2-S18:" in plan else ""
    c2s19 = plan.split("#### C2-S19:")[1].split("#### C2-S20:")[0] if "#### C2-S19:" in plan else ""
    c4s2 = plan.split("#### C4-S2:")[1].split("#### C4-S3:")[0] if "#### C4-S2:" in plan else ""
    # B1-p2
    need("B1p2-claim-sig", "serve.claim_system_publication_key_provision_cleanup(p_limit integer)" in c2s4
         or "serve.claim_system_publication_key_provision_cleanup(integer)" in c2s4)
    need("B1p2-complete-sig", "serve.complete_system_publication_key_provision_cleanup(p_publication_ref uuid, p_claim_token uuid)" in c2s4
         or "serve.complete_system_publication_key_provision_cleanup(uuid,uuid)" in c2s4)
    need("B1p2-grant-sig", "claim_system_publication_key_provision_cleanup(integer)" in c2s4
         and "complete_system_publication_key_provision_cleanup(uuid,uuid)" in c2s4)
    need("B1p2-repo", "claimSystemKeyProvisionCleanup" in c2s5 and "completeSystemKeyProvisionCleanup" in c2s5)
    need("B1p2-app", "reconcileSystemKeyProvisionCleanup" in c2s6)
    need("B1p2-main", "reconcileSystemKeyProvisionCleanup" in c2s18)
    need("B1p2-case16", "B1-p2 orphan cleanup" in c2s3)
    need("B1p2-c4-case8", "B1-p2 expired orphan" in c4s2)
    # N1-p2
    need("N1p2-ctor", "readServedAnswer" in c2s6)
    need("N1p2-not-boot", "Do not** read an answer on the boot path" in c2s6 or "Do not**" in c2s6 and "boot path" in c2s6
         or "Do **not** read an answer on the boot path" in c2s6)
    need("N1p2-reconcile-calls", "this.readServedAnswer" in c2s6)
    need("N1p2-case", "no subsequent `GET /v1/runs/:id/answer`" in c2s19 or "no further GET" in c2s19
         or "Reconciler publishes without a further GET" in c2s19)
    # N2-p2
    need("N2p2-one-rule", "tryAutoPublish` step 8 never writes a DENY" in c2s4 or "Never write DENY" in c2s6)
    need("N2p2-step8", "Never write DENY" in c2s6)
    need("N2p2-no-conditional", "if the call never entered the function, write DENY" not in plan)
    need("N2p2-case10", "equals **1**" in c2s3 or "equals **1** (N2-p2" in c2s3)
    # N3-p2
    need("N3p2-two-pools", "Two database connections" in c2s3)
    need("N3p2-prepare-first", "before** either calls `systemPublish`" in c2s3 or "before** either" in c2s3)
    need("N3p2-not-sequential", "Sequential `tryAutoPublish`" in c2s3 and "not** this case" in c2s3)
    need("N3p2-watched-fail", "watched FAILING with C2-S4 body item 4" in c2s3)
    return fails

def mutant(plan: str, which: str) -> str:
    if which == "B1-p2":
        plan = plan.replace("serve.claim_system_publication_key_provision_cleanup", "SERVE_CLAIM_REMOVED")
        plan = plan.replace("reconcileSystemKeyProvisionCleanup", "RECONCILE_CLEANUP_REMOVED")
    elif which == "N1-p2":
        plan = plan.replace("readServedAnswer", "READ_ANSWER_REMOVED")
        plan = plan.replace("Reconciler publishes without a further GET", "GET-only")
    elif which == "N2-p2":
        plan = plan.replace("Never write DENY", "Do not write a second DENY here if the DEFINER function already wrote one; if the call never entered the function, write DENY via the wrapper")
        plan = plan.replace("tryAutoPublish` step 8 never writes a DENY", "or the same append_audit_event_internal DENY shape")
        plan = plan.replace("equals **1** (N2-p2: the transition writes DENY for every NULL it returns after taking the lock).", "")
    elif which == "N3-p2":
        plan = plan.replace("Two database connections (two pools). Both call `prepareSystemKeyProvision` to completion — two PREPARED intents, two `publication_ref`s — **before** either calls `systemPublish`. Then both call `systemPublish`.",
                            "Two overlapping `tryAutoPublish` calls on one bound publishable run;")
        plan = plan.replace("Sequential `tryAutoPublish` (application step 3) is **not** this case. This case must be watched FAILING with C2-S4 body item 4 (`IF v_latest_state='PUBLISHED' return NULL`) removed before its GREEN is quoted.",
                            "")
    return plan

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutant", default="")
    args = ap.parse_args()
    plan = PLAN.read_text()
    if args.mutant:
        fails = checks(mutant(plan, args.mutant))
        if fails:
            print("MUTANT %s FAIL (detector caught):" % args.mutant)
            print("\n".join(fails))
            return 0
        print("MUTANT %s UNCAUGHT" % args.mutant)
        return 1
    fails = checks(plan)
    if fails:
        print("DETECTOR FAIL")
        print("\n".join(fails))
        return 1
    print("DETECTOR PASS all of B1-p2 N1-p2 N2-p2 N3-p2")
    return 0

if __name__ == "__main__":
    sys.exit(main())
