#!/usr/bin/env python3
"""mutant-index.py v4 — DERIVES a campaign index from raw tools/mutate.sh transcripts (D46, D50, E1).

usage: mutant-index.py <transcript-glob-prefix> [expected-manifest]

Reads ONLY the raw transcripts. For each: the custody gates, the command's exit, and whether the
run FAILED AN ASSERTION or THREW BEFORE ANY ASSERTION — decided by the presence of a vitest
assertion frame in the captured output, never by prose.

THREE DEFECTS IN v1, all fixed here:
  1. v1's usage advertised an optional expected file and never read a second argument, so one
     product mutant turning GREEN while one neighbour turned RED left the tally identical and
     the tool still printed its confirmation. The manifest is REAL and mismatches FAIL.
  2. v1 counted ANY nonzero exit as a kill. Exit 127 is "command not found" — the mutant never
     ran — and v1 scored it as a dead mutant. Exits are CLASSIFIED; anything that is not a
     genuine test failure is INVALID, never a kill.
  3. v1 was a bash script using an associative array, which macOS bash 3.2 does not support:
     the manifest would have silently done nothing. That is the same defect as (1) wearing a
     different hat, which is why this is Python.

A FIFTH DEFECT, in v3 itself, found by codex r3 and fixed in v4:
  5. v3 admitted NOT-RUN for ANY `ABORT:` with no parsed applied gate. `mutate.sh` has FOUR
     pre-apply exits and only ONE of them is a legitimate refusal. A dirty-tree abort writes a
     single line — no stamp, no gates, no exit — and an apply failure writes a stamp and a pre
     gate but nothing else; v2 rejected both as malformed, and v3 blessed them as clean. Adding a
     class must not widen an existing one: v4 admits NOT-RUN ONLY for the PROVED pre-gate
     collision shape — a normal commit stamp, a POSITIVE `GATE pre`, no applied gate, and the
     specific "NEW token already present" refusal. Every other gate-less abort — dirty tree,
     apply failure, OLD-not-found, truncated, unstamped — stays INVALID. Fixtures for the valid
     shape and for each invalid one live beside the campaign logs.

A FOURTH DEFECT, found by the sealedrows seat and fixed in v3:
  4. There was NO CLASS for a mutation that never ran. `mutate.sh` refuses before applying when
     its pre-gate fails — the NEW token already occurs in the target, so substituting would not
     be a mutation — and it exits NONZERO. v2 had no NOT-RUN class, so such a transcript was
     reported as malformed custody plus a missing EXIT line: two problems and exit 1, for a tool
     behaving exactly as designed. Worse, the same transcript scored as a KILL in any driver that
     classifies on exit status, which is precisely what D46/D50 exist to prevent. A refused
     mutation is now its own NON-CREDITING class: never a kill, never a survivor, never a
     problem, and always visible in the tally.

Expected-manifest format: `<transcript-basename> <KILLED|SURVIVED|NOT-RUN>` per line; blank lines
and lines starting with # ignored.

Exit 0 only when every transcript is well-formed AND (with a manifest) every observed outcome
matches its expectation. Exit 1 on any problem. Exit 2 on unusable input.
"""
import glob, os, re, sys

if len(sys.argv) < 2:
    print(__doc__); raise SystemExit(2)
prefix = sys.argv[1]
manifest_path = sys.argv[2] if len(sys.argv) > 2 else None

expect = {}
if manifest_path:
    if not os.path.isfile(manifest_path):
        print(f"REFUSING: expected manifest '{manifest_path}' does not exist"); raise SystemExit(2)
    for raw in open(manifest_path):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2 or parts[1] not in ("KILLED", "SURVIVED", "NOT-RUN"):
            print(f"REFUSING: manifest line {line!r} must be '<name> KILLED|SURVIVED|NOT-RUN'"); raise SystemExit(2)
        expect[parts[0]] = parts[1]
    print(f"EXPECTED MANIFEST: {manifest_path} ({len(expect)} entries)")

# The manifest and the emitted index USUALLY SIT UNDER THE SAME PREFIX as the
# transcripts they describe, so the glob must exclude them or the tool reads its
# own inputs and outputs as campaign artifacts — v2 did exactly that and reported
# three problems against a well-formed manifest. Same defect family as the rest of
# this file: a matcher that matches more than the thing it is looking for.
_manifest_real = os.path.realpath(manifest_path) if manifest_path else None
def _is_transcript(f):
    if not os.path.isfile(f):
        return False
    if _manifest_real and os.path.realpath(f) == _manifest_real:
        return False
    b = os.path.basename(f)
    return "INDEX" not in b and not b.endswith((".md", ".manifest"))

files = [f for f in sorted(glob.glob(prefix + "*")) if _is_transcript(f)]
if not files:
    print(f"REFUSING: the glob '{prefix}*' matched no transcript — an empty result is not a pass")
    raise SystemExit(2)

def first(pat, text, grp=1):
    m = re.search(pat, text, re.M)
    return m.group(grp) if m else None

print(f"{'TRANSCRIPT':<44}{'EXIT':<6}{'GATES':<9}{'OUTCOME':<11}FIRST FAILING FRAME")
killed = survived = invalid = not_run = 0
problems = []
seen = set()
for f in files:
    b = os.path.basename(f); seen.add(b)
    text = open(f, errors="replace").read()
    ex = first(r"^EXIT = (\d+)", text)
    pre = first(r"GATE pre\s+= (\d+)", text)
    app = first(r"GATE applied\s+= (\d+)", text)
    res = first(r"GATE restored\s+= (\d+)", text)
    gates = f"{pre or '?'}/{app or '?'}/{res or '?'}"
    abort = first(r"^ABORT: (.*)", text)
    # A REFUSED MUTATION IS NOT A RESULT — but only ONE of mutate.sh's four
    # pre-apply exits is a legitimate refusal, and v3 admitted all of them.
    #
    # NOT-RUN requires ALL FOUR marks of the proved pre-gate collision:
    #   (a) a normal commit stamp — a dirty-tree abort has none, because
    #       mutate.sh bails before it writes the header at all;
    #   (b) a POSITIVE `GATE pre` — the collision IS "the token already occurs",
    #       so pre>0 is the evidence; an apply failure carries pre=0;
    #   (c) no applied gate — the run stopped before mutating anything;
    #   (d) the specific NEW-token refusal, not merely some abort.
    # Anything short of all four stays INVALID and is reported as a problem.
    # Detected before the custody check, because a run that never applied cannot
    # satisfy a custody contract about applying. Never a kill — a driver reading
    # exit status alone scores this as one, which is why the class exists.
    stamped = re.search(r"^commit=[0-9a-f]{40}\b", text, re.M) is not None
    collision = abort is not None and "NEW token already present" in abort
    pre_positive = pre is not None and pre.isdigit() and int(pre) > 0
    if collision and stamped and pre_positive and app is None:
        not_run += 1
        print(f"{b:<44}{'n/a':<6}{gates:<9}{'NOT-RUN':<11}{abort.strip()[:70]}")
        if manifest_path:
            want = expect.get(b)
            if want is None:
                problems.append(f"{b}: no entry in the expected manifest")
            elif want != "NOT-RUN":
                problems.append(f"{b}: expected {want}, observed NOT-RUN (the mutation never applied)")
        continue
    # D42 custody contract: token absent, then applied, then gone again
    if pre != "0" or res != "0" or not app or int(app) < 1:
        problems.append(f"{b}: malformed custody gates {gates} (D42 requires pre=0, applied>=1, restored=0)")
    fm = re.search(r"^.*(?:AssertionError|expected .* to |Error:|error TS\d+).*$", text, re.M)
    frame = fm.group(0).strip()[:70] if fm else "(none captured)"
    asserted = re.search(r"AssertionError|expected .* to ", text) is not None
    if abort is not None:
        outcome, got = "ABORTED", "INVALID"; invalid += 1
        why = []
        if not stamped: why.append("no commit stamp")
        if not pre_positive: why.append(f"GATE pre = {pre if pre is not None else 'absent'} (a collision has pre>0)")
        if not collision: why.append("not the NEW-token-already-present refusal")
        if app is not None: why.append(f"GATE applied = {app} (it did apply, or tried)")
        problems.append(
            f"{b}: aborted before applying but does NOT match the pre-gate collision shape "
            f"({'; '.join(why)}) — INVALID, not NOT-RUN")
    elif ex is None:
        outcome, got = "NO-EXIT", "INVALID"; invalid += 1
        problems.append(f"{b}: transcript carries no EXIT line")
    elif ex == "0":
        outcome, got = "SURVIVED", "SURVIVED"; survived += 1
    elif ex == "1":
        outcome, got = ("ASSERTION" if asserted else "THREW"), "KILLED"; killed += 1
    elif ex in ("126", "127"):
        outcome, got = "INVALID", "INVALID"; invalid += 1
        problems.append(f"{b}: exit {ex} means the command never ran (not found / not executable) — this is NOT a kill")
    else:
        outcome, got = "SUSPECT", "INVALID"; invalid += 1
        problems.append(f"{b}: exit {ex} is neither a clean pass nor a vitest failure — classify it before crediting it")
    print(f"{b:<44}{ex or 'MISSING':<6}{gates:<9}{outcome:<11}{frame}")
    if manifest_path:
        want = expect.get(b)
        if want is None:
            problems.append(f"{b}: no entry in the expected manifest")
        elif want != got:
            problems.append(f"{b}: expected {want}, observed {got}")

for name in expect:
    if name not in seen:
        problems.append(f"{name}: in the manifest but no transcript found")

print()
print(f"TALLY: transcripts={len(files)}  killed={killed}  survived={survived}  "
      f"invalid={invalid}  not-run={not_run}")
print(f"CREDITED: {killed + survived} of {len(files)} transcripts carry an outcome; "
      f"{not_run} refused before applying and {invalid} are unclassifiable")
print("DERIVED BY: tools/mutant-index.py v4 reading raw transcripts only — no prose input")
if problems:
    print(f"\nPROBLEMS ({len(problems)}) — this index is NOT a clean derivation:")
    for p in problems:
        print(f"  - {p}")
    raise SystemExit(1)
print("CLEAN: every transcript well-formed" + (", every outcome matches the manifest" if manifest_path else ""))
