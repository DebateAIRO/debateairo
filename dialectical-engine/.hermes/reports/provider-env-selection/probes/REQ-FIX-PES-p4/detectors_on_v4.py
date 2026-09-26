import sys; sys.path.insert(0, "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/REQ-FIX-PES")
import detectors as d
M = d.MISSION
docs = {"S01": d.read(f"{M}/slices/S01/SPEC-v4.md"), "S02": d.read(f"{M}/slices/S02/SPEC-v4.md"),
        "INSTRUCTIONS": d.read(f"{M}/INSTRUCTIONS.md"), "S02PLAN": d.read(f"{M}/slices/S02/PLAN.md"),
        "S01PLAN": d.read(f"{M}/slices/S01/PLAN.md")}
bad = 0
for label, check in d.CHECKS:
    p = check(docs); bad += bool(p); print(("  FAIL  " if p else "  pass  ") + label); [print("          - " + x) for x in p]
print("v4:", "FAIL" if bad else "PASS", f"({bad} failing checks)"); sys.exit(1 if bad else 0)
