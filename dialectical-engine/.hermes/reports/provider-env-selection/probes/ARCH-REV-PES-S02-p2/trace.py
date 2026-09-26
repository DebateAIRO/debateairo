#!/usr/bin/env python3
"""ARCH-REV-PES-S02-p2 own both-ways trace. Not the author's parser."""
import re, pathlib, sys
root = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection")
spec = (root / "slices/S02/SPEC-v4.md").read_text()
plan = (root / "slices/S02/PLAN.md").read_text()
spec_lines = spec.splitlines()
plan_lines = plan.splitlines()

reqs = re.findall(r"\*\*(R2\.\d+b?)\*\*", spec)
# unique, keep order
seen = []
for r in reqs:
    if r not in seen:
        seen.append(r)
print("SPEC requirements", len(seen), seen)

# §2 table rows: requirement in col 1
sec2 = plan.split("## 3. Cluster table")[0].split("## 2. SPEC")[1]
forward = {}
for line in sec2.splitlines():
    if not line.startswith("| R") and not line.startswith("| §"):
        continue
    cols = [c.strip() for c in line.strip("|").split("|")]
    if len(cols) < 3:
        continue
    rid = cols[0]
    steps = re.findall(r"S02-S\d+", cols[2])
    forward[rid] = steps
print("§2 rows", list(forward))

# §10 reverse
sec10 = plan.split("## 10.")[1]
reverse = {}
for m in re.finditer(r"\| (S02-S\d+) \| ([^|]+) \| (S02-S\d+) \| ([^|]+) \|", sec10):
    reverse[m.group(1)] = m.group(2).strip()
    reverse[m.group(3)] = m.group(4).strip()
print("§10 steps", len(reverse), sorted(reverse))

gaps = []
for r in seen:
    if r not in forward or not forward[r]:
        gaps.append(f"req-without-step {r}")
if "§5 acceptance, steps 1–10" not in forward and "§5" not in "".join(forward):
    # the row id is the whole first cell
    if not any(k.startswith("§5") for k in forward):
        gaps.append("§5-without-step")
for sid in [f"S02-S{i:02d}" for i in range(1, 21)]:
    if sid not in reverse:
        gaps.append(f"step-without-req {sid}")
# every §2 step id appears in §10
for rid, steps in forward.items():
    for s in steps:
        if s not in reverse:
            gaps.append(f"§2-step-missing-from-§10 {rid} {s}")
print("GAPS", gaps or "zero")

# anchors
anchor = re.search(r"Anchors in `SPEC-v4\.md` \(Revision 3\): (.*)", plan)
bad = []
if not anchor:
    bad.append("no-anchor-line")
else:
    text = anchor.group(1)
    for rid, ln in re.findall(r"(R2\.\d+b?) `:(\d+)`", text):
        line = spec_lines[int(ln) - 1]
        if not line.startswith(f"**{rid}"):
            bad.append(f"{rid}:{ln}={line[:60]!r}")
    checks = [
        ("step 2", 223, "2. Read the declared"),
        ("step 4", 230, "4. Run the hosted"),
        ("step 8", 253, "8. The verdict is the LAST line"),
    ]
    for label, a, needle in checks:
        if not spec_lines[a - 1].startswith(needle):
            bad.append(f"{label}:{a}={spec_lines[a-1][:60]!r}")
    if spec_lines[200] != "## 4. Verification":
        bad.append(f"§4={spec_lines[200]!r}")
    if not spec_lines[216].startswith("## 5."):
        bad.append(f"§5={spec_lines[216]!r}")
print("ANCHORS", bad or "all-resolve")

# fixture JSON equality SPEC table vs PLAN table
def targets(text, start_mark):
    # grab JSON objects that contain provider_ref
    return re.findall(r"\{[^{}]*\"provider_ref\"[^{}]*\}", text)
spec_t = targets(spec, "")
# only the five in the R2.7 table: between the table header and "Each refusal"
chunk_s = spec.split("## 4. Verification")[0].split("| case | target |")[1]
chunk_p = plan.split("**Each refusal's guard")[0].split("| id | target")[1]
st = re.findall(r"\{[^{}]*provider_ref[^{}]*\}", chunk_s)
pt = re.findall(r"\{[^{}]*provider_ref[^{}]*\}", chunk_p)
print("fixture count spec", len(st), "plan", len(pt), "equal", st == pt)
if st != pt:
    for i, (a, b) in enumerate(zip(st, pt)):
        if a != b:
            print(" DIFF", i, a, "VS", b)
    if len(st) != len(pt):
        print(" len mismatch")

# SPEC-v3 citations
hist_needles = ("re-aimed", "withdrew", "SPEC-v4", "frozen history", "byte-identical to `SPEC-v3.md:8-230`", "after REQ-REV pass 2")
print("-- SPEC-v3 lines --")
for i, l in enumerate(plan_lines, 1):
    if "SPEC-v3" in l:
        masked = any(h in l for h in hist_needles)
        print(f"{i} masked={masked} {l[:180]}")

# JSON examples
print("-- JSON lines without EXACT/CONTAINS on the line or 3 above --")
for i, l in enumerate(plan_lines):
    if '{"' in l:
        window = plan_lines[max(0, i - 3): i + 1]
        if not any(("EXACT" in x or "CONTAINS" in x) for x in window):
            print(i + 1, l[:160])

# resolveAll body has no timer
m = re.search(r"function resolveAll\(lookup: LookupFunction, hostname: string\): Promise<LookupAddress\[\]> \{\n(?:.*\n){0,12}\}", plan)
body = m.group(0) if m else ""
print("resolveAll found", bool(m))
print("resolveAll has timeout token", bool(re.search(r"setTimeout|AbortSignal|timeout", body)))
print("resolveAll body lines", body.count("\n") + 1 if body else 0)

# exit mapping
print("exitCode = 0 count", plan.count("process.exitCode = 0"))
print("ruled mapping count", plan.count('process.exitCode = result.outcome === "PASS" ? 0 : 1;'))
print("V-DECISIONS :24 cites", [i + 1 for i, l in enumerate(plan_lines) if "V-DECISIONS-PACKET.md:24" in l])

# dependency paragraph compare is done outside
print("PLAN:34", plan_lines[33])
