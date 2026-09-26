#!/usr/bin/env python3
"""gen-build-packet.py <S> <Cn> <lane-abs> <branch> [frame-log-abs] — packets/BUILD-<S>-<Cn>.md from templates/BUILD.md for mission
provider-env-selection (codex gpt-6-astra coding seat in the slice lane). Every anchor is grepped at write time from the file it cites:
PLAN step blocks, the §3 cluster row (the command is extracted from it), SPEC requirement + acceptance ranges, TOOLING-TRAPS headings,
the lane's README block boundaries, the price-code throw sites and the existing pin's regex line. A dependent cluster (C2, C3 …) MUST
receive the frame log the orchestrator captured AFTER its predecessors landed (TRAPS "A cluster's base moves when its predecessor lands")."""
import sys,re,pathlib
S,CN,LANE,BR=sys.argv[1:5]; FRAME=sys.argv[5] if len(sys.argv)>5 else ""
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
SCR=f"{R}/.claude/skills/heartbeat-orchestrator/scripts"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
n=S[1:].lstrip("0"); c=CN[1:]
SEAT=f"BUILD-PES-{S}-{CN}"; T=ids[f"B{n}{c}"]; ST=ids[S]
PLAN=pathlib.Path(f"{M}/slices/{S}/PLAN.md").read_text().splitlines()
SPECN=sorted(pathlib.Path(f"{M}/slices/{S}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1]))
SPECF=SPECN[-1].name if SPECN else "SPEC.md"; SPEC=pathlib.Path(f"{M}/slices/{S}/{SPECF}").read_text().splitlines()
def find(lines,pred,start=1):
    for i in range(start,len(lines)+1):
        if pred(lines[i-1]): return i
    return None
def need(v,what):
    if v is None: raise SystemExit(f"ANCHOR MISSING: {what}")
    return v
# ---- PLAN anchors
h_start=need(find(PLAN,lambda l:l.startswith("## 1.")),"PLAN §1"); h_1b=need(find(PLAN,lambda l:l.startswith("### 1b.")),"PLAN §1b")
h_2=need(find(PLAN,lambda l:l.startswith("## 2.")),"PLAN §2"); h_3=need(find(PLAN,lambda l:l.startswith("## 3.")),"PLAN §3"); h_4=need(find(PLAN,lambda l:l.startswith("## 4.")),"PLAN §4"); h_5=need(find(PLAN,lambda l:l.startswith("## 5.")),"PLAN §5")
cl_head=need(find(PLAN,lambda l:l.startswith(f"#### Cluster {S}-{CN}")),f"cluster block {S}-{CN}")
cl_end=(find(PLAN,lambda l:l.startswith("#### Cluster "),cl_head+1) or h_3)-1
steps=[(i,re.match(r"\*\*(C\d+-\d+) ·",PLAN[i-1]).group(1)) for i in range(cl_head,cl_end+1) if re.match(r"\*\*C\d+-\d+ ·",PLAN[i-1])]
if not steps: raise SystemExit("no steps in cluster block")
step_ids=", ".join(s for _,s in steps); first_step_line=steps[0][0]
row=need(find(PLAN,lambda l:l.startswith(f"| **{S}-{CN}** |")),f"§3 row {S}-{CN}")
rowtext=PLAN[row-1]
m=re.search(r"run-suites\.sh ((?:\S+:\d+:\d+\s*)+)",rowtext); pairs=need(m,"run-suites pairs in §3 row").group(1).strip()
cmd=f"LOG=<abs log path> zsh {SCR}/run-suites.sh {pairs}"
cells=[x.strip() for x in rowtext.strip().strip("|").split("|")]
write_surface=cells[2]; red_events=cells[4]; base_verdict=cells[5]
# ---- SPEC anchors
r_head=need(find(SPEC,lambda l:l.startswith("## 3. Requirements")),"SPEC §3"); v_head=need(find(SPEC,lambda l:l.startswith("## 4.")),"SPEC §4")
a_head=need(find(SPEC,lambda l:l.startswith("## 5. Acceptance")),"SPEC §5"); a_end=(find(SPEC,lambda l:l.startswith("## 6."),a_head+1) or len(SPEC)+1)-1
# requirements this cluster's steps trace to (from the PLAN's trace lines "C1-1 → R3.5 · …")
trace={}
for l in PLAN[h_2-1:h_2+40]:
    for mm in re.finditer(r"(C\d+-\d+) → ([^·]+)",l):
        trace[mm.group(1)]=[x.strip().rstrip(".") for x in mm.group(2).split(",") if x.strip().rstrip(".")]
reqs=sorted({r for _,sid in steps for r in trace.get(sid,[])}, key=lambda r:[int(x) for x in re.findall(r"\d+",r)]+[r])
req_lines=[]
for r in reqs:
    i=need(find(SPEC,lambda l:l.startswith(f"**{r}**")),f"SPEC {r}")
    j=(find(SPEC,lambda l:re.match(r"\*\*R\d+\.\d+",l),i+1) or v_head)-1
    req_lines.append(f"{r} :{i}-{j}")
# ---- lane anchors
def lane_hits(p,needle):
    ls=pathlib.Path(f"{LANE}/{p}").read_text().splitlines(); return [(i,ls[i-1].strip()) for i,l in enumerate(ls,1) if needle in l]
def one(p,needle):
    h=lane_hits(p,needle)
    if len(h)!=1: raise SystemExit(f"LANE ANCHOR {p} {needle!r}: {len(h)} hits")
    return h[0]
b_open=one("deploy/vps/README.md","### What the hosted mode refuses, in code"); b_close=one("deploy/vps/README.md","### The credential-file contract")
h11=one("deploy/vps/README.md","## 11. Providers and vendors"); h12=lane_hits("deploy/vps/README.md","## 12.")
stale=one("deploy/vps/README.md","## Known-stale sections")
pin_re=one("tests/unit/v9-provider-credential-files.test.ts",'/"([A-Z_]+)"/gu')
price_sites=lane_hits("packages/providers/src/index.ts","PROVIDER_TARGET_PRICE_REQUIRED:${")+[(f"apps/runner/src/main.ts:{i}",t) for i,t in lane_hits("apps/runner/src/main.ts","PROVIDER_TARGET_PRICE_REQUIRED:${")]
price_q=" · ".join((f"`{LANE}/packages/providers/src/index.ts:{i} — `{t}``" if isinstance(i,int) else f"`{LANE}/{i} — `{t}``") for i,t in price_sites)
v9_cases=sum(1 for l in pathlib.Path(f"{LANE}/tests/unit/v9-provider-credential-files.test.ts").read_text().splitlines() if re.match(r"\s*it\(",l))
# ---- TOOLING-TRAPS headings, by heading text, re-grepped
TR=pathlib.Path(f"{R}/.hermes/TOOLING-TRAPS.md").read_text().splitlines()
heads=["`grep -c` counts LINES, not occurrences","an acceptance pinned to ABSOLUTE LINE NUMBERS","Disjoint WRITE surfaces do not imply independent EFFECTS","a git-root-relative path matches NOTHING","A multi-path `vitest run` SILENTLY DROPS paths","vitest summary line shapes","`grep` on this Mac is ugrep","`grep` on this Mac is TWO binaries","A BUILD packet must list its RED events as their own ordered line","A cluster's base moves when its predecessor lands","`run-suites.sh` takes fuzzy Vitest filters","A surface derived from ONE idiom misses the assertion"]
trap_lines=[]
for hd in heads:
    i=need(find(TR,lambda l:l.startswith("## ") and hd in l),f"TRAPS heading {hd!r}"); trap_lines.append(f"`{R}/.hermes/TOOLING-TRAPS.md:{i}` ({TR[i-1][3:].split(' (')[0][:70]})")
# ---- allowed + block wording per cluster
readme=f"{LANE}/deploy/vps/README.md"; v9=f"{LANE}/tests/unit/v9-provider-credential-files.test.ts"
if CN=="C1":
    allowed=f"{v9} (in full) · {readme} as a NAMED BLOCK — lines :{b_open[0]} (`{b_open[1]}`) through :{b_close[0]-1} (the line before `{b_close[1]}`), re-measured by you before your first edit · {M}/slices/{S}/DECISIONS.md (APPEND ONLY, `V-ROW: NEW` blocks — never numbered by you) · {RP}/probes/{SEAT}/ (new — your run logs, one per run, named by step and attempt)"
    block_note=f"You own README §11's refusal-table block ONLY (between the two headings above); every other line of the README is C2's or nobody's — reading it is lawful, writing it is a contract breach."
elif CN=="C3":
    allowed=f"{v9} (append ONE `describe` — every earlier case byte-identical) · {readme} ONLY at the three regions PLAN §3 row :{row} names — (i) the support-chat note, (ii) the `COST_ENVELOPES_NOT_SEALED` refusal-table row (inside C1's block: this ONE row, no other line of the block), (iii) §10's production-maker bullet — every other README line byte-identical to the START sha (prove it: `git diff <START sha> -- deploy/vps/README.md` shows hunks at those three regions only, each hunk quoted) · {M}/slices/{S}/DECISIONS.md (APPEND ONLY, `V-ROW: NEW` blocks — never numbered by you) · {RP}/probes/{SEAT}/ (new — your run logs, one per run, named by step and attempt)"
    block_note=f"You inherit C1 and C2 on the branch. V ruled V-11 and V-14 (V-DECISIONS-PACKET.md, rows by id): C2-7's sentence is REPLACED by C3-4, and the refusal-table row C1 wrote for `COST_ENVELOPES_NOT_SEALED` is re-worded by C3-5 — those two are the only lines of the earlier clusters you change."
else:
    allowed=f"{v9} (in full) · {readme} EVERYWHERE EXCEPT the block :{b_open[0]}–:{b_close[0]-1} (`{b_open[1]}` … the line before `{b_close[1]}`, which C1 wrote and you leave byte-identical — prove it with `git diff <C1 sha> -- deploy/vps/README.md` showing no hunk inside that range) · {M}/slices/{S}/DECISIONS.md (APPEND ONLY, `V-ROW: NEW` blocks — never numbered by you) · {RP}/probes/{SEAT}/ (new — your run logs, one per run, named by step and attempt)"
    block_note=f"You inherit C1's commit(s) on the branch: the block :{b_open[0]}–:{b_close[0]-1} is frozen for you; the v9 suite already holds C1's added case (your START frame says how many cases it has) — add, never rewrite, and re-state every pair you change."
if CN!="C1" and not FRAME: raise SystemExit(f"{CN} is a DEPENDENT cluster: pass the frame log the orchestrator captured after its predecessors landed (measure it with run-capture.sh in the lane at the branch head)")
if FRAME:
    fl=pathlib.Path(FRAME).read_text().splitlines()
    summ=[l for l in fl if re.search(r"rc=|passed=|failed=|CLUSTER_|BROKEN|Test Files|Tests ",l)]
    base_frame=f"measured by the orchestrator at the branch head AFTER {('C1' if CN=='C2' else 'C1 and C2')} landed — `{FRAME}`, its summary lines verbatim: " + " ⏐ ".join(x.strip() for x in summ[:8])
    base_line=f"`origin/dev` @ 776359c3, plus the predecessor cluster's commit(s) on `{BR}` — the sha on the frame log's first line is your START"
else:
    base_frame=f"this cluster has NO predecessor, so the PLAN §3 row IS its frame — quoted: {base_verdict} — plus the base-pair run `{RP}/probes/ARCH-PES-{S}/c1-base.log` (CLUSTER_GREEN at `v9:{v9_cases}:0 baseline:31:0`)"
    base_line="`origin/dev` @ 776359c3 (the lane HEAD — no predecessor cluster)"
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/BUILD.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__CLUSTER__":CN,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__PASS__":"1","__MODEL__":"gpt-6-astra (Codex)",
     "__TRANSPORT__":f"`codex exec -c model='\"gpt-6-astra\"' -c sandbox_mode='\"danger-full-access\"' \"<pointer>\" </dev/null`, background, cwd = the lane (launcher {RP}/logs/launch-{SEAT}.sh (new — written by the orchestrator at dispatch))","__RESUME__":"`codex exec … resume <session id>` in the same lane — record the session id and the rollout path in your CLAIM",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all — superseded or re-dispatched tickets carry more than one)","__LANE__":f"{LANE} (the slice lane; `git status --porcelain` shows only YOUR paths, and ends empty after your commit)","__BRANCH__":BR,"__BASE__":base_line,
     "__STEP_IDS__":step_ids,"__STEP_LINES__":(f"{h_start}-{h_2-1} (§1 START frame + §1b the enumeration C1-1 reads) and {cl_head}-{cl_end}" if CN=="C1" else f"{h_start}-{h_1b-1} (§1 START frame) and {cl_head}-{cl_end}"),
     "__CLUSTER_LINES__":f"{h_3}-{h_4-1} (§3 — your row is :{row}) and {h_4}-{h_5-1} (§4, what REV runs)",
     "__ORACLE__":f"{M}/slices/{S}/{SPECF} §5 acceptance (:{a_head}-{a_end}) and the requirements your steps trace to ({'; '.join(req_lines)})","__TRAP_HEADINGS__":" · ".join(trap_lines),
     "__ALLOWED_FILES__":allowed,"__CLUSTER_COMMAND__":cmd,"__BASE_FRAME__":base_frame,"__MISSION_ROOT__":M,"__REPORTS__":RP}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"- inputs (read these and nothing else): {M}/INSTRUCTIONS.md", f"- inputs (read these and nothing else): {M}/INSTRUCTIONS.md · the V rows {M}/V-DECISIONS-PACKET.md (row V-8 binds §11's table: start-up refusals only, the four run-time spend codes stay out) · the ARCH seat's base runs {RP}/probes/ARCH-PES-{S}/ (read-only: `c1-base.log`, `c1-after-pair-at-base.log`, `c2-after-pair-at-base.log`, `enumeration.log`, `accept-base.log`, `typecheck-base.log`)",1)
charges=f"""
### Charges for THIS node (numbered; answer each in the handoff or write UNVERIFIED)
1. Skills as markdown (COMMON §1 has the paths): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `superpowers:test-driven-development` · `superpowers:verification-before-completion` (+ `superpowers:systematic-debugging` on any bug); `SKILLS LOADED:` names exactly the files you read. Read every comment on {T}, then CLAIM (seat, node, start `date`, the codex session id AND your rollout path under `~/.codex/sessions/<Y>/<M>/<D>/`, lane HEAD + branch + dirty count, `comments read through: 1`, and the START frame RE-MEASURED by you with the cluster command at its BASE pairs and at ITS pairs — both markers quoted).
2. **RED events, as their own ordered line** (TRAPS "A BUILD packet must list its RED events as their own ordered line"): {red_events}. Each RED is watched failing with the cluster command BEFORE the step that turns it green; the PLAN step text says which assertion and which pair.
3. **Facts about the surface you extend** (the PLAN's steps say what to do; these are the measured lines): the existing pin's extractor is `{pin_re[0]}` of `{v9}` — `{pin_re[1]}` (double quotes only); the price code is raised from BACKTICK templates at {price_q}; the README's §11 heading is `:{h11[0]}`, its refusal-table block opens at `:{b_open[0]}` and the next heading is `:{b_close[0]}`; the known-stale list opens at `:{stale[0]}`. {block_note}
4. **PROGRESS records** (ruling on ARCH-PES-{S} F1): every item the SPEC says is "recorded in PROGRESS.md" (R3.5's sweep member by member with each anchor's `path:line` measured in the lane and the codes it yielded; R3.3's six codes with their source lines; R3.7's three-bullet verdicts; R3.8's diff proof) goes into a `## PROGRESS records` section of your READY handoff — PROGRESS.md itself is the orchestrator's file and is NOT in your allowed list; the orchestrator transcribes your section verbatim.
5. **Commit law**: after the third GREEN run, ONE commit per cluster on `{BR}` with `git add -- <each allowed lane path>` (never `-A`, never a path outside `allowed`, never the mission docs — they live in the MAIN tree and the orchestrator freezes them), message `feat(provider-env-selection/{S}-{CN}): <what the cluster proves>`; quote the sha in the handoff. No housekeeping path on the branch.
6. **Boundaries** (PLAN §5): nothing under `apps/` or `packages/` changes — `git diff --stat origin/dev...HEAD -- apps packages` run from the lane's `dialectical-engine/` prints nothing, and you prove the command CAN print (TRAPS "a git-root-relative path matches NOTHING"): the same pathspec over `origin/dev~200...origin/dev` prints a stat. `tests/architecture/vps-deployment-baseline.test.ts` is read, never written. No PERSISTENT listener (a suite's own ephemeral loopback bind is lawful — name it with its test lines), no `pnpm install`, no NO-TOUCH port (COMMON §6), no real key, no process left running.
7. NEVER: a file outside `allowed` · another cluster's block · `git add -A` · `git stash` · push · merge · Done · `hermes kanban boards switch` · a terminal or window on V's desktop.
8. Handoff: self-report FIRST at `{RP}/agent-reports/{SEAT}.md` (new), then `READY` on {T} opening with `SKILLS LOADED:`, eight-line shape (`heartbeat-protocol` §5), the three-run table (run · marker · v9 pair · baseline pair · log path), every pair you changed (from → to), the refutation matrix (property · mutant · target suite · neighbour · restore, with `git status --porcelain` after every restore), the commit sha, `## PROGRESS records`, `V-ROW: NEW` blocks last if any, `comments read through: <n>`. Print the READY text as your final output, then stop.
"""
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/BUILD-{S}-{CN}.md"); out.write_text(s)
print(f"wrote {out} ({len(s.splitlines())} lines); steps {step_ids} (:{cl_head}-{cl_end}); §3 row :{row}; pairs `{pairs}`; reqs {req_lines}; block :{b_open[0]}-{b_close[0]-1}; v9 cases at lane HEAD {v9_cases}; leftover {left}")
