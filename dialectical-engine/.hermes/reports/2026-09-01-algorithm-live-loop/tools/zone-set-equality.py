#!/usr/bin/env python3
"""The mission's ONE zone comparator (D48).

Replaces a per-lane throwaway that lived in private temporary storage and whose exit
predicate did not match its name: it exited 0 whenever there were no NEW failures, so a head
that FIXED a baseline failure still passed a gate called "set-equality".

Contract, enforced by the exit code:
  exit 0  <=>  the failure-NAME sets are EQUAL in both directions
               (and, when --expect-count-delta is given, the total-test delta matches)
  exit 1  <=>  any set difference, in either direction
  exit 2  <=>  the input cannot be trusted (missing file, unparseable, zero tests)

A fixed baseline failure is NOT silently good news here. It may be real progress, but it is a
change to the authority set and it must be RULED, not absorbed by a green gate. Rerun with
--allow-fixed to declare that you have ruled on it; the names are still printed and the record
still says it happened.

usage:
  zone-set-equality.py <head.json> <base.json> <head-label> <base-label>
                       [--expect-count-delta N] [--allow-fixed]

Inputs are vitest --reporter=json payloads.
"""
import json, sys

def load(path):
    try:
        with open(path) as fh:
            j = json.load(fh)
    except Exception as exc:
        print(f"REFUSING: cannot read {path}: {exc}")
        raise SystemExit(2)
    names = set()
    for tr in j.get("testResults", []):
        for a in tr.get("assertionResults", []):
            if a.get("status") == "failed":
                names.add(a.get("fullName"))
    total = j.get("numTotalTests")
    if not total:
        print(f"REFUSING: {path} reports {total!r} total tests — an empty result is not a pass")
        raise SystemExit(2)
    # The same trap D15's comparator names: vitest does not always emit a name for every
    # failure it counts. If the count and the names disagree, no set verdict is trustworthy.
    counted = j.get("numFailedTests")
    if counted is not None and counted != len(names):
        print(f"REFUSING: {path} counts {counted} failed but names {len(names)} — "
              "fix the payload before trusting any set verdict")
        raise SystemExit(2)
    return j, names

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = [a for a in sys.argv[1:] if a.startswith("--")]
if len(args) < 4:
    print(__doc__)
    raise SystemExit(2)
head_p, base_p, head_label, base_label = args[:4]
allow_fixed = "--allow-fixed" in flags
expect_delta = None
for f in flags:
    if f.startswith("--expect-count-delta="):
        expect_delta = int(f.split("=", 1)[1])

jh, head = load(head_p)
jb, base = load(base_p)

print(f"head @{head_label} : total={jh.get('numTotalTests')} passed={jh.get('numPassedTests')} failed={jh.get('numFailedTests')}")
print(f"base @{base_label} : total={jb.get('numTotalTests')} passed={jb.get('numPassedTests')} failed={jb.get('numFailedTests')}")
delta = jh.get("numTotalTests") - jb.get("numTotalTests")
print(f"count delta      : {delta:+d}" + (f" (expected {expect_delta:+d})" if expect_delta is not None else ""))
print()

new = sorted(head - base)
fixed = sorted(base - head)
print("NEW at head (regressions owned by this lane):")
print("\n".join("  + " + x for x in new) if new else "  (none)")
print("FIXED at head (a change to the authority set — must be ruled, not absorbed):")
print("\n".join("  - " + x for x in fixed) if fixed else "  (none)")
print(f"shared pre-existing: {len(head & base)}")
print()

bad = []
if new:
    bad.append(f"{len(new)} NEW failure(s)")
if fixed and not allow_fixed:
    bad.append(f"{len(fixed)} FIXED failure(s) without --allow-fixed")
if expect_delta is not None and delta != expect_delta:
    bad.append(f"count delta {delta:+d} != expected {expect_delta:+d}")

if bad:
    print("SET-EQUALITY: FAIL — " + "; ".join(bad))
    raise SystemExit(1)
print("SET-EQUALITY: PASS — failure-name sets are equal in both directions"
      + (" (fixed names ruled via --allow-fixed)" if fixed else ""))
