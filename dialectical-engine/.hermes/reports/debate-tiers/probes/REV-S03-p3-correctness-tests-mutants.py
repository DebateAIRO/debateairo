#!/usr/bin/env python3
"""REV-S03-p3-correctness-tests — mutants at head 3f488b3f.

Every mutant is CONTENT-MATCHED (never line-numbered), applied only after asserting the
literal occurs EXACTLY ONCE in the file, and restored from a byte copy captured in this
run, verified by sha256. A mutant's direction can invert between heads: this file states
the head it was written against and restores FROM the captured state, never to a literal.

Refuses to start on a dirty tree (other than this seat's own temporary probe file).
"""
import hashlib
import os
import subprocess
import sys

WT = os.environ.get("WORKTREE") or (sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
OUT = os.environ.get("OUTDIR") or "/tmp"
HEAD_WRITTEN_AGAINST = "3f488b3f"
PROBE = "tests/unit/REV-S03-p3-correctness-tests-probe.test.ts"


def sh(args, cwd=WT):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


def sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def porcelain():
    out = sh(["git", "status", "--porcelain"]).stdout.strip().splitlines()
    return [line for line in out if PROBE not in line]


def vitest(files, tag):
    res = sh(["env", "LANG=en_US.UTF-8", "npx", "vitest", "run"] + files)
    log = os.path.join(OUT, f"mutant-{tag}.log")
    with open(log, "w") as fh:
        fh.write(res.stdout + "\n" + res.stderr)
    text = res.stdout + res.stderr
    summary = [ln.strip() for ln in text.splitlines()
               if ln.strip().startswith(("Test Files", "Tests "))]
    failing = [ln.strip() for ln in text.splitlines() if ln.strip().startswith("×")]
    return res.returncode, summary, failing, log


class Mutant:
    def __init__(self, tag, relpath, old, new, files, note):
        self.tag, self.relpath, self.old, self.new = tag, relpath, old, new
        self.files, self.note = files, note

    def run(self):
        path = os.path.join(WT, self.relpath)
        with open(path, "rb") as fh:
            original = fh.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode("utf-8")
        count = text.count(self.old)
        print(f"\n=== MUTANT {self.tag} — {self.note}")
        print(f"    file {self.relpath} · literal occurrences: {count}")
        if count != 1:
            print(f"    SKIPPED — expected exactly 1 occurrence, found {count}")
            return
        with open(path, "w") as fh:
            fh.write(text.replace(self.old, self.new, 1))
        applied = sha(path)
        print(f"    applied: sha {before[:8]} -> {applied[:8]} (changed: {applied != before})")
        try:
            rc, summary, failing, log = vitest(self.files, self.tag)
            print(f"    rc={rc}")
            for line in summary:
                print(f"    {line}")
            for line in failing[:6]:
                print(f"    {line[:160]}")
            print(f"    log={log}")
        finally:
            with open(path, "wb") as fh:
                fh.write(original)
            restored = sha(path)
            print(f"    restored: sha {restored[:8]} · matches original: {restored == before}")
            assert restored == before, f"RESTORE FAILED for {self.relpath}"


READER_FIXED = """    const value = row?.value as Readonly<{
      free?: unknown;
      premium?: unknown;
    }> | null | undefined;
    return PlanTierRostersSchema.parse({
      free: value?.free,
      premium: value?.premium
    });"""
READER_PRE_F1 = """    return PlanTierRostersSchema.parse(row?.value);"""

OBS_CONTRACT_ANCHOR = """    "GET /v1/support/status",
    "POST /v1/asks","""
OBS_CONTRACT_PATCHED = """    "GET /v1/support/status",
    "GET /v1/obs/client-report/enums",
    "POST /v1/obs/client-report",
    "POST /v1/asks","""

OBS_MATRIX_ANCHOR = """  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },"""
OBS_MATRIX_PATCHED = """  { route: "GET /v1/obs/client-report/enums", auth: "public", resource: "observability", action: "read-client-enums" },
  { route: "POST /v1/obs/client-report", auth: "public", resource: "observability", action: "write-client-report" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },"""

C4 = ["tests/render/tier01-new-plan-tier.test.tsx", "tests/unit/tiers-s02-admission.test.ts",
      "tests/unit/tiers-s02-wire.test.ts", "tests/unit/api.test.ts",
      "tests/architecture/tiers-s02-rosters.test.ts"]
PINS = ["tests/unit/s7-authorization.test.ts", "tests/unit/contract.test.ts"]

MUTANTS = [
    Mutant("A-reader-pre-f1", "apps/api/src/index.ts", READER_FIXED, READER_PRE_F1,
           C4 + [PROBE],
           "revert the reader to the pre-F1 whole-row parse: re-derives the RED the F1 handoff "
           "claims at cd043907 — the joining case must fail on the published `kind`"),
    Mutant("B-publisher-rowkey", "apps/runner/src/dev-deployment-register.ts",
           'rowKey: "planTierRosters",', 'rowKey: "planTierRostersMUTANT",', C4,
           "rename the PUBLISHER's row key: the joining case must break, which proves it is "
           "built from the publisher's shape and not from a hand-written row"),
    Mutant("C-publisher-kind", "apps/runner/src/dev-deployment-register.ts",
           'kind: "PLAN_TIER_ROSTERS" as const,', 'kind: "PLAN_TIER_ROSTERS_MUTANT" as const,',
           C4, "corrupt the PUBLISHER's discriminant: does any suite of record notice?"),
    Mutant("D-drift-s03-row", "apps/api/src/index.ts",
           '  { route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" },',
           '  { route: "GET /v1/plan-tiers", auth: "operator", resource: "plan-tier-rosters", action: "read" },',
           PINS, "drift S03's OWN policy row at the merged head: is the drift detector alive?"),
]


def mutant_e():
    """Two files at once: supply the observability pair to both lists, then re-run the pins."""
    print("\n=== MUTANT E-supply-obs-pair — add the inherited obs pair to contractInventory AND "
          "the expected matrix: isolates the cause of the RED at this head")
    targets = [("packages/contract/src/index.ts", OBS_CONTRACT_ANCHOR, OBS_CONTRACT_PATCHED),
               ("tests/unit/s7-authorization.test.ts", OBS_MATRIX_ANCHOR, OBS_MATRIX_PATCHED)]
    saved = []
    ok = True
    for relpath, old, new in targets:
        path = os.path.join(WT, relpath)
        with open(path, "rb") as fh:
            original = fh.read()
        saved.append((path, original))
        text = original.decode("utf-8")
        count = text.count(old)
        print(f"    {relpath} · occurrences: {count}")
        if count != 1:
            ok = False
            break
        with open(path, "w") as fh:
            fh.write(text.replace(old, new, 1))
    try:
        if ok:
            rc, summary, failing, log = vitest(PINS, "E-supply-obs-pair")
            print(f"    rc={rc}")
            for line in summary:
                print(f"    {line}")
            for line in failing[:6]:
                print(f"    {line[:160]}")
            print(f"    log={log}")
        else:
            print("    SKIPPED — an anchor did not occur exactly once")
    finally:
        for path, original in saved:
            with open(path, "wb") as fh:
                fh.write(original)
        print("    restored both files; porcelain now:", len(porcelain()), "entries")


if __name__ == "__main__":
    print(f"worktree: {WT}")
    print("HEAD:", sh(["git", "rev-parse", "--short", "HEAD"]).stdout.strip())
    print("written against head:", HEAD_WRITTEN_AGAINST)
    dirty = porcelain()
    if dirty:
        print("REFUSING: tree is dirty:", dirty)
        sys.exit(9)
    print("porcelain before (excluding this seat's probe): 0 entries")
    for mutant in MUTANTS:
        mutant.run()
    mutant_e()
    print("\nporcelain after all mutants (excluding this seat's probe):", len(porcelain()), "entries")
