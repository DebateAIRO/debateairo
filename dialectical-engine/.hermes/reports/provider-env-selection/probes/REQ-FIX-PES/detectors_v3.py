#!/usr/bin/env python3
"""Re-runs the PASS-2 detectors (detectors.py, unchanged, cited by reviews/REQ-REV-p2.md) on the
pass-3 documents: SPEC-v3.md of S01 and S02, and INSTRUCTIONS.md and both PLANs as they stand.

detectors.py knows only v1 and v2, and a verdict cites it, so it is imported and never rewritten.
This wrapper swaps in the v3 documents and runs the same CHECKS list, in the same order.

    python3 detectors.py v1     # the documents the pass-1 lens reviewed — MUST report FAIL
    python3 detectors_v3.py     # the pass-3 documents                    — MUST report PASS
"""
import sys

import detectors


def documents_v3():
    mission = detectors.MISSION
    return {
        "S01": detectors.read(f"{mission}/slices/S01/SPEC-v3.md"),
        "S02": detectors.read(f"{mission}/slices/S02/SPEC-v3.md"),
        "INSTRUCTIONS": detectors.read(f"{mission}/INSTRUCTIONS.md"),
        "S02PLAN": detectors.read(f"{mission}/slices/S02/PLAN.md"),
        "S01PLAN": detectors.read(f"{mission}/slices/S01/PLAN.md"),
    }


def main():
    docs = documents_v3()
    failed = 0
    print("REQ-FIX-PES pass-2 detectors (detectors.py, unchanged) against the pass-3 documents")
    for label, check in detectors.CHECKS:
        problems = check(docs)
        if problems:
            failed += 1
            print(f"  FAIL  {label}")
            for problem in problems:
                print(f"          - {problem}")
        else:
            print(f"  pass  {label}")
    print(f"v3: {'FAIL' if failed else 'PASS'} ({failed} failing checks)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
