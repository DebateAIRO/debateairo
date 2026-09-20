#!/usr/bin/env python3
"""gen-build.py <CLUSTER e.g. C1> <TICKET> <BASE_SHA> <BASE_FRAME_FILE> — a BUILD packet for one cluster of S01.
Every line anchor into PLAN.md is COMPUTED here from the headings and the file map at write time (never typed):
the step range = the '### S01-<C> ' section; the cluster lines = the §1 table row and the §1.1 map;
allowed = the map rows this cluster owns, turned into absolute LANE paths ((new) where the map says so)."""
import sys,re,pathlib,subprocess
C,TICKET,BASE,FRAME=sys.argv[1:5]; CHARGES=sys.argv[5] if len(sys.argv)>5 else None
A="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine"
LANE="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine"
M="free-public-debates"; MR=f"{A}/docs/missions/{M}"; R=f"{A}/.hermes/reports/{M}"; PK=f"{A}/.hermes/planning/{M}/packets"
plan=pathlib.Path(f"{MR}/slices/S01/PLAN.md").read_text().split("\n")
heads=[(i+1,l) for i,l in enumerate(plan) if l.startswith("### ") or l.startswith("## ")]
start=next(n for n,l in heads if l.startswith(f"### S01-{C} "))
end=next(n for n,l in heads if n>start)-1
while plan[end-1].strip() in("","---"): end-=1
steps=[re.match(r"#### (C\d+-S\d+)",l).group(1) for l in plan[start-1:end] if re.match(r"#### C\d+-S\d+",l)]
row=next(i+1 for i,l in enumerate(plan) if l.startswith(f"| S01-{C} |"))
cmd=plan[row-1].split("|")[4].strip().strip("`")
ms=next(n for n,l in heads if l.startswith("### 1.1 ")); me=next(n for n,l in heads if n>ms)-1
while plan[me-1].strip() in("","---"): me-=1
allowed=[]
for l in plan[ms-1:me]:
    m=re.match(r"\| `([^`]+)`([^|]*)\| ([^|]+)\|",l)
    if not m: continue
    path,extra,owner=m.group(1),m.group(2),m.group(3)
    if not re.search(rf"\b{C}\b",owner) or "BUILD does not edit" in owner: continue
    new=" (new)" if ("(new)" in extra or not pathlib.Path(f"{LANE}/{path}").exists()) else ""
    note=extra.strip(); note=f" — {note}" if note and note!="(new)" else ""
    allowed.append(f"{LANE}/{path}{new}{note.replace('(new)','').rstrip(' —')}")
gs=next(n for n,l in heads if l.startswith("## Global Constraints")); ge=next(n for n,l in heads if n>gs)-1
while plan[ge-1].strip() in("","---"): ge-=1
frame=pathlib.Path(FRAME).read_text().strip().replace("\n"," ⏎ ")
traps='"zsh + vitest: an unquoted `$FILES` is ONE filter token — \\"No test files found\\" is BROKEN, not RED (2026-09-01, AUDIT-STATE)" · "`git diff/log/ls-tree -- <pathspec>` from inside `dialectical-engine/`: a git-root-relative path matches NOTHING and returns an EMPTY diff that reads as \\"unchanged\\" (2026-09-01, AUDIT-STATE)" · "`git add -A` in a tree that two sessions are writing (2026-09-02, cost: three files committed under wrong messages)"'
rep={"SEAT":f"BUILD-S01-{C}","SLICE":"S01","CLUSTER":C,"PASS":"1","MODEL":"codex gpt-5.6-sol",
 "TRANSPORT":f"codex exec, background process, log {R}/logs/seat-BUILD-S01-{C}.log (new)","RESUME":"codex exec resume <session id>",
 "TICKET":TICKET,"CURSOR":"0 comments","LANE":LANE,"BRANCH":"slice/free-public-debates-s01","BASE":BASE,
 "STEP_IDS":f"{steps[0]}…{steps[-1]} ({len(steps)} steps)","STEP_LINES":f"{start}-{end}","CLUSTER_LINES":f"{row}-{row} (the command row) and :{ms}-{me} (the single-writer file map)",
 "ORACLE":f"{MR}/slices/S01/SPEC-v2.md section \"## 4. Acceptance\" and the requirements your steps cite (read those R-n only)","TRAP_HEADINGS":traps,
 "ALLOWED_FILES":" · ".join(allowed)+f" · your run logs under {R}/probes/BUILD-S01-{C}/ (new)","CLUSTER_COMMAND":cmd.replace("$RUNNER","<run_suites>"),"BASE_FRAME":frame}
s=pathlib.Path(f"{A}/.claude/skills/heartbeat-orchestrator/templates/BUILD.md").read_text()
for k,v in rep.items(): s=s.replace(f"__{k}__",v)
for k,v in {"__MISSION_ROOT__":MR,"__PACKET_DIR__":PK,"__REPORTS__":R,"__SLICE_TICKET__":"t_2e15bf90","__MISSION__":M}.items(): s=s.replace(k,v)
DEC_SECTIONS=(" — ONLY these sections, by heading: '## 10. Orchestrator folds — REQ-REV pass 2 (PASS; N1-p2 … N3-p2), 2026-09-20', "
  "'## 20. Orchestrator folds — ARCH-REV(S01) pass 3 (PASS; N1-p3 … N3-p3), 2026-09-20', and the ARCH decision sections "
  "'## 11.', '## 14.' and '## 17.' where one of your steps cites a decision")
s=s.replace("PLAN.md steps","the plan's Global Constraints "+f"({MR}/slices/S01/PLAN.md:{gs}-{ge}) and PLAN.md steps")
s=s.replace("· DECISIONS.md ·",f"· {MR}/slices/S01/DECISIONS.md"+DEC_SECTIONS+f" · {A}/docs/architecture/01-decisions/ADR-0026-system-publication-without-grant.md ·")
CWD_RULE=("- cwd rule, stated once: every PRODUCT command and every code edit happens in the lane on the cwd line above; "
 "mission files (PLAN, DECISIONS, your self-report, your probe logs) live under the mission home that COMMON line 3 calls the repo root "
 "— you never run a product command there.")
s=s.replace("- inputs (read these",CWD_RULE+chr(10)+"- inputs (read these",1)
if CHARGES: s+=chr(10)+"### Charges"+chr(10)+pathlib.Path(CHARGES).read_text()
out=f"{PK}/BUILD-S01-{C}.md"; pathlib.Path(out).write_text(s); print("wrote",out,"steps",start,end,len(steps),"allowed",len(allowed))
