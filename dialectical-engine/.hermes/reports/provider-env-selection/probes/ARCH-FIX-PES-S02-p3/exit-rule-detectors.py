#!/usr/bin/env python3
# ARCH-FIX-PES-S02-p3 — detectors for the V-12/V-13 amendment (SPEC-v4 §5 steps 4 and 8) and the SPEC-of-record re-point.
# Usage: exit-rule-detectors.py <PLAN.md>. One line per check, then ALL-PASS / FAILED:<ids>.
import hashlib, re, sys
plan = open(sys.argv[1], encoding="utf-8").read()
spec = open("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/SPEC-v4.md", encoding="utf-8").read().split("\n")
lines = plan.split("\n")
fails = []
def check(cid, ok, detail):
    print(f"{cid} {'PASS' if ok else 'FAIL'} {detail}")
    if not ok: fails.append(cid)
n = plan.count("process.exitCode = 0")
check("E1", n == 0, f"'process.exitCode = 0' (the overruled exit-0 mapping) anywhere: {n} (want 0)")
n = plan.count('process.exitCode = result.outcome === "PASS" ? 0 : 1;')
check("E2", n == 2, f"the ruled mapping line (code block + gate): {n} (want 2)")
n = len(re.findall(r"for EVERY outcome|exit 0 on every outcome|exits 0 on every outcome", plan))
check("E3", n == 0, f"sentences keeping the exit-0 default: {n} (want 0)")
hist = ("re-aimed", "withdrew", "SPEC-v4", "frozen history", "byte-identical to `SPEC-v3.md:8-230`", "after REQ-REV pass 2")  # lines 8 and 11 continue the history sentence and the SPEC-v4 sentence; line 11 continues the SPEC-v4 sentence of line 9-10
bad = [i + 1 for i, l in enumerate(lines) if "SPEC-v3" in l and not any(h in l for h in hist)]
check("E4", not bad, f"lines citing SPEC-v3 as live (not history, not beside SPEC-v4): {bad} (want [])")
v6 = plan[plan.index("**V6"):plan.index("What no review has executed until V6")]
ok = ("It prints EXACT `exit=0`" in v6) and ("`tee` target of steps 3 and 4" not in v6) and ("merged log's last line is the verdict" not in v6) and ("$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts" in v6)
check("E5", ok, "§4 V6 checks step 4's exit=0 and the pnpm echo line, and no longer tees step 4 or calls the log's last line the verdict unconditionally")
s8 = plan[plan.index("## 8."):plan.index("## 9.")]
check("E6", "V-ROW" not in s8 and "exit 1 on FAIL and UNVERIFIED" in s8, "§8 item 4 states the ruled rule, not a pending V-ROW")
s17 = plan[plan.index("**S02-S17 ·"):plan.index("**S02-S18 ·")]
u, f = s17.count('outcome === "UNVERIFIED"'), s17.count('outcome === "FAIL"')
check("E7", u >= 2 and f >= 2, f"S02-S17 outcome assertions: UNVERIFIED {u} (want >=2: cases 6, 7), FAIL {f} (want >=2: cases 4, 5)")
check("E8", plan.count("**Revision 3** — ARCH-FIX-PES-S02-p3") == 1, "the Revision 3 line under the title")
try:
    start = plan.index("```ts\nimport { runHostedAcceptance }") + len("```ts\n"); end = plan.index("```", start)
    h = hashlib.sha256(plan[start:end].encode()).hexdigest()[:16]
except ValueError:
    h = "absent"
check("E9", h == "4a2b73be7c2d6eb1", f"the S02-S19 CLI block is the one cli-block-run.out ran (sha256 prefix {h}, want 4a2b73be7c2d6eb1)")
m = re.search(r"Anchors in `SPEC-v4\.md` \(Revision 3\): (.*)", plan)
bad = []
if m:
    for rid, ln in re.findall(r"(R2\.\d+b?) `:(\d+)`", m.group(1)):
        if not spec[int(ln) - 1].startswith(f"**{rid}"): bad.append(f"{rid}:{ln}")
    for label, a, b, needle in (("step 2", 223, 226, "2. Read the declared"), ("step 4", 230, 234, "4. Run the hosted"), ("step 8", 253, 259, "8. The verdict is the LAST line")):
        if f"{label} `:{a}-{b}`" not in m.group(1) or not spec[a - 1].startswith(needle): bad.append(label)
    if "§4 `:201`" not in m.group(1) or spec[200] != "## 4. Verification": bad.append("§4")
    if "§5 `:217`" not in m.group(1) or not spec[216].startswith("## 5."): bad.append("§5")
check("E10", bool(m) and not bad, f"§2 SPEC-v4 anchors resolve to their requirement lines: {'no anchor line' if not m else (bad or 'all 16')}")
print("ALL-PASS" if not fails else "FAILED:" + ",".join(fails))
