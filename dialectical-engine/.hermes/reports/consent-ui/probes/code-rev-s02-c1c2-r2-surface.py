#!/usr/bin/env python3
"""CODE-REV-S02-C1C2 r2 — my OWN exported-surface check (not the r1 probe).
Extracts every top-level `export` declaration's SIGNATURE (text up to the `;` or `{` that
ends it) from the module at both commits and from the PLAN's fenced contract block, then
compares them byte-for-byte with no whitespace normalisation."""
import hashlib, re, subprocess, sys, pathlib
LANE = pathlib.Path(sys.argv[1])
REL  = "dialectical-engine/apps/ui/components/consent/modalSemantics.ts"

def at(commit):
    return subprocess.run(["git","show",f"{commit}:{REL}"],cwd=LANE,capture_output=True,text=True,check=True).stdout

def sigs(src):
    out=[]
    for m in re.finditer(r"^export\b.*?(?=\{|;)", src, re.M|re.S):
        out.append(m.group(0))
    return out

before, after = at("91877847"), at("06ab1da4")
sb, sa = sigs(before), sigs(after)
print(f"exported declarations at 91877847 : {len(sb)}")
print(f"exported declarations at 06ab1da4 : {len(sa)}")
jb, ja = "\n@@\n".join(sb), "\n@@\n".join(sa)
print(f"sha256 of the joined signatures  before = {hashlib.sha256(jb.encode()).hexdigest()[:32]}")
print(f"sha256 of the joined signatures  after  = {hashlib.sha256(ja.encode()).hexdigest()[:32]}")
print(f"BYTE-IDENTICAL EXPORTED SURFACE ACROSS THE FIX COMMIT: {jb == ja}")
print(f"  (joined length before/after = {len(jb)}/{len(ja)} bytes)")
for s in sa:
    print("   *", s.strip().replace("\n","\\n")[:110])

plan = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/PLAN.md").read_text()
anchor = "The module's exported surface, fixed here so C5/C6 and S01 can be written against it:"
block = plan[plan.index(anchor):].split("```ts",1)[1].split("```",1)[0]
print("\nEach signature present BYTE-FOR-BYTE in the PLAN's fenced contract block:")
allok = True
for s in sa:
    hit = s in block
    allok &= hit
    print(f"   {str(hit):5s}  {s.strip().splitlines()[0][:90]}")
print(f"ALL PRESENT IN PLAN BLOCK: {allok}")

print("\nDISCRIMINATORS (each MUST be False, else the comparison is vacuous):")
for label, mut in [
    ("one space after a comma removed", ja.replace(", onClose", ",onClose")),
    ("HTMLElement | null reflowed",     ja.replace("HTMLElement | null","HTMLElement|null")),
    ("a single character dropped",      ja[:-1]),
]:
    print(f"   {str(mut == jb):5s}  {label}")

print("\nCROSS-CHECK of the r1 probe's disclosed broken negative control:")
probe_control = "export function openSurfaceCount(): number "
print(f"   {probe_control!r} in module -> {probe_control in after}  (author's 6.2 NOTE says True; a negative control must be False)")
