import re, sys, pathlib
root = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02")
spec = (root/"SPEC.md").read_text()
plan = (root/"PLAN.md").read_text()
dec  = (root/"DECISIONS.md").read_text()
plines = plan.splitlines()

# ---- 1. R-ids ------------------------------------------------------------
spec_r = re.findall(r'^\*\*(S02-R\d{2}) ', spec, re.M)
print("SPEC R-ids defined:", len(spec_r), "unique:", len(set(spec_r)))
# trace table rows
trace_rows = {}
for ln in plines:
    m = re.match(r'^\| (S02-R\d{2}) \| (.*?) \| (.*?) \| (.*?) \|\s*$', ln)
    if m: trace_rows[m.group(1)] = (m.group(3), m.group(4))
print("PLAN trace rows:", len(trace_rows))
print("R-ids in SPEC missing a trace row:", sorted(set(spec_r) - set(trace_rows)))
print("trace rows with no SPEC R-id     :", sorted(set(trace_rows) - set(spec_r)))

# ---- 2. step ids ---------------------------------------------------------
defined = re.findall(r'^- \*\*(S02-S\d{2}) ', plan, re.M)
print("\nsteps DEFINED as '- **S02-Snn ' headers:", len(defined), "unique:", len(set(defined)))
dup = [s for s in set(defined) if defined.count(s) > 1]
print("duplicate step definitions:", sorted(dup))
allids = set(re.findall(r'S02-S\d{2}', plan))
print("distinct S02-Snn tokens anywhere in PLAN:", len(allids))
print("tokens referenced but never DEFINED:", sorted(allids - set(defined)))

# ---- 3. every step in >=1 trace row? ------------------------------------
trace_ids = set()
for r,(steps,cl) in trace_rows.items():
    trace_ids |= set(re.findall(r'S02-S\d{2}', steps))
print("\ndistinct step ids appearing in the trace table:", len(trace_ids))
missing_from_trace = sorted(set(defined) - trace_ids)
print("DEFINED steps that appear in NO trace row (range '...' not expanded):", missing_from_trace)

# ---- 4. refutation table ------------------------------------------------
ref_ids = re.findall(r'^\| (S02-S\d{2}) \|', plan, re.M)
print("\nrefutation-table rows:", len(ref_ids), "unique:", len(set(ref_ids)))
print("DEFINED steps with no refutation row:", sorted(set(defined) - set(ref_ids)))
print("refutation rows for undefined steps  :", sorted(set(ref_ids) - set(defined)))

# ---- 5. cluster membership ----------------------------------------------
clusters = {}
cur = None
for ln in plines:
    m = re.match(r'^### Cluster (S02-C\d) ', ln)
    if m: cur = m.group(1)
    m2 = re.match(r'^- \*\*(S02-S\d{2}) ', ln)
    if m2 and cur: clusters.setdefault(cur, []).append(m2.group(1))
print("\nsteps per cluster (by document position):")
for c in sorted(clusters): print("   ", c, len(clusters[c]), clusters[c][0], "..", clusters[c][-1])
tot = sum(len(v) for v in clusters.values()); print("    total:", tot)

# ---- 6. DECISIONS step references ---------------------------------------
print("\n--- DECISIONS.md step references vs PLAN.md step definitions ---")
step_title = {}
for i, ln in enumerate(plines):
    m = re.match(r'^- \*\*(S02-S\d{2}) · (.*?)\*\*', ln)
    if m: step_title[m.group(1)] = m.group(2)
for i, ln in enumerate(dec.splitlines(), 1):
    for sid in sorted(set(re.findall(r'S02-S\d{2}', ln))):
        print(f"  DECISIONS:{i}  cites {sid}  -> PLAN defines it as: {step_title.get(sid,'<UNDEFINED>')!r}")

# ---- 7. banned words ----------------------------------------------------
print("\n--- banned words in PLAN.md (improve|better|robust|handle|appropriate) ---")
for i, ln in enumerate(plines, 1):
    for w in ("improve","better","robust","handle","appropriate"):
        if re.search(r'\b'+w, ln, re.I):
            print(f"  PLAN:{i}: ...{ln.strip()[:150]}")
            break
