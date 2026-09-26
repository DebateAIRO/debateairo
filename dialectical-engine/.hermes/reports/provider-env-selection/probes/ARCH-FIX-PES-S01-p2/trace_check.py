# ARCH-FIX-PES-S01-p2 trace checker (PLAN §4 V13). SPEC<->PLAN both ways, step<->reverse-trace both ways, and every
# `SPEC-v4.md:<line>` a §2 row cites equals the line where that requirement starts. Usage:
#   python3 trace_check.py            -> the real PLAN;   python3 trace_check.py --mutants -> each mutant must FAIL
import re, sys
M = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01"
SPEC = open(f"{M}/SPEC-v4.md", encoding="utf-8").read()
PLAN = open(f"{M}/PLAN.md", encoding="utf-8").read()

def check(plan):
    bad = []
    spec_lines = {m.group(1): n for n, l in enumerate(SPEC.splitlines(), 1) if (m := re.match(r"^\*\*(R\d+\.\d+)", l))}
    sec2 = plan[plan.index("## 2. "):plan.index("## 3. ")]
    rows = {m.group(1): m.group(2) for l in sec2.splitlines() if (m := re.match(r"^\| (R\d+\.\d+) \(`SPEC-v4\.md:(\d+)`\) ", l))}
    plain = {m.group(1) for l in sec2.splitlines() if (m := re.match(r"^\| (R\d+\.\d+) ", l))}
    for r in sorted(set(spec_lines) - plain): bad.append(f"requirement {r} has no §2 row")
    for r in sorted(plain - set(spec_lines)): bad.append(f"§2 row {r} traces to no requirement")
    for r, line in rows.items():
        if spec_lines.get(r) != int(line): bad.append(f"§2 row {r} cites SPEC-v4.md:{line}, requirement starts at :{spec_lines.get(r)}")
    for r in plain - set(rows): bad.append(f"§2 row {r} has no SPEC-v4.md line")
    sec6 = plan[plan.index("## 6. "):plan.index("## 7. ")]
    steps = set(re.findall(r"^\*\*(S01-\d\d) · ", sec6, re.M))
    rev = sec2[sec2.index("**Reverse trace"):]
    rev_ids = set(re.findall(r"(S01-\d\d) (?:R\d|§)", rev))
    for s in sorted(steps - rev_ids): bad.append(f"step {s} is missing from the reverse trace")
    for s in sorted(rev_ids - steps): bad.append(f"reverse trace names {s}, which §6 does not define")
    table = sec2[:sec2.index("**Reverse trace")]
    for s in sorted(set(re.findall(r"S01-\d\d", table)) - steps): bad.append(f"§2 table names {s}, which §6 does not define")
    return bad

def report(label, plan):
    bad = check(plan)
    print(f"{label}: TRACE: {'FAIL' if bad else 'PASS'}"); [print("   - " + b) for b in bad]
    return bool(bad)

if "--mutants" in sys.argv:
    r14 = next(l for l in PLAN.splitlines() if l.startswith("| R1.14 "))
    mutants = {
        "m-drop-R1.14-row": PLAN.replace(r14 + "\n", ""),
        "m-drop-S01-26-reverse": PLAN.replace(" · S01-26 R1.3, R1.14.", "."),
        "m-wrong-line": PLAN.replace("| R1.14 (`SPEC-v4.md:233`)", "| R1.14 (`SPEC-v4.md:220`)"),
        "m-undefined-step": PLAN.replace("S01-26 (the check), S01-14", "S01-27 (the check), S01-14"),
    }
    failed = [report(k, v) for k, v in mutants.items()]
    print("MUTANTS:", "ALL FAILED (checker live)" if all(failed) else "SOME PASSED (checker dead)"); sys.exit(0 if all(failed) else 1)
sys.exit(1 if report("PLAN.md", PLAN) else 0)
