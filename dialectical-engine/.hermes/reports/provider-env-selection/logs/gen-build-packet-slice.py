#!/usr/bin/env python3
"""gen-build-packet-slice.py <S> <Cn> <lane-abs> <branch> [frame-log-abs] — packets/BUILD-<S>-<Cn>.md from templates/BUILD.md for the
S01/S02 PLAN shape of mission provider-env-selection (gen-build-packet.py is S03's: README-block specific). Every anchor is grepped at
write time: the cluster block `### <S>-<Cn> — …`, its step heads `**<S>-NN · …` / `**<S>-SNN · …`, the §3 row(s) `| <S>-<Cn> |`
(command pairs, write surface, RED event), the reverse trace (step → requirements), SPEC-v<n> requirement ranges, TOOLING-TRAPS
headings, the slice DECISIONS folds. A dependent cluster (C2+) MUST receive the frame log measured after its predecessors landed."""
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
DEC=pathlib.Path(f"{M}/slices/{S}/DECISIONS.md").read_text().splitlines()
def find(lines,pred,start=1):
    for i in range(start,len(lines)+1):
        if pred(lines[i-1]): return i
    return None
def need(v,what):
    if v is None: raise SystemExit(f"ANCHOR MISSING: {what}")
    return v
def cells(l): return [x.strip() for x in l.strip().strip("|").split("|")]
# ---- PLAN anchors
h1=need(find(PLAN,lambda l:l.startswith("## 1.")),"PLAN §1"); h2=need(find(PLAN,lambda l:l.startswith("## 2.")),"PLAN §2")
h3=need(find(PLAN,lambda l:l.startswith("## 3.")),"PLAN §3"); h4=need(find(PLAN,lambda l:l.startswith("## 4.")),"PLAN §4")
h5=need(find(PLAN,lambda l:l.startswith("## 5.")),"PLAN §5"); h6=need(find(PLAN,lambda l:l.startswith("## 6.")),"PLAN §6")
h7=need(find(PLAN,lambda l:l.startswith("## 7.")),"PLAN §7")
cl_head=need(find(PLAN,lambda l:l.startswith(f"### {S}-{CN} ")),f"cluster block ### {S}-{CN}")
pre_end=(find(PLAN,lambda l:l.startswith(f"### {S}-C"),h6) or cl_head)-1
cl_end=(find(PLAN,lambda l:l.startswith("### ") or l.startswith("## "),cl_head+1) or len(PLAN)+1)-1
step_re=re.compile(rf"\*\*({S}-S?\d+) ·")
steps=[(i,step_re.match(PLAN[i-1]).group(1)) for i in range(cl_head,cl_end+1) if step_re.match(PLAN[i-1])]
if not steps: raise SystemExit("no steps in cluster block")
step_ids=", ".join(s for _,s in steps)
rows=[i for i in range(h3,h6) if PLAN[i-1].startswith(f"| {S}-{CN} |")]
if not rows: raise SystemExit(f"ANCHOR MISSING: §3 row | {S}-{CN} |")
pairs=None
m=re.search(r"(?:run-suites\.sh|\$RS) ((?:\S+:\d+:\d+\s*)+)",PLAN[rows[0]-1])   # the cluster's OWN §3 row first
if m: pairs=m.group(1).strip()
if pairs is None:   # "<S>-<Cn> command (EXACT):" + a fenced block after the table (S02 shape)
    k=find(PLAN,lambda l:l.strip().startswith(f"{S}-{CN} command"),h3)
    if k and k<h4:
        txt=" ".join(PLAN[k:k+20]); end=txt.find("```",txt.find("```")+3)
        pairs=" ".join(re.findall(r"[\w./-]+:\d+:\d+",txt[:end if end>0 else len(txt)])) or None
need(pairs,"run-suites pairs for the cluster")
cmd=f"LOG=<abs log path> zsh {SCR}/run-suites.sh {pairs}"
path_re=re.compile(r"`((?:apps|packages|tests|acceptance|docs|tools|deploy)/[\w./-]+|package\.json)`([^`·|]*)")
surface=[]
for i in rows:
    for cell in cells(PLAN[i-1])[1:]:
        if "run-suites" in cell or "passed" in cell or "→" in cell: continue
        for pth,ann in path_re.findall(cell):
            if pth not in [p for p,_ in surface]: surface.append((pth,ann.strip()))
if not surface: raise SystemExit("no write surface in the §3 row(s)")
red_cell=None
for i in rows:
    cs=cells(PLAN[i-1])
    for cc in cs[1:]:
        if re.search(r"failed=|passed / \d+ failed|\d+ failed|CLUSTER_RED",cc): red_cell=cc
red_cell=red_cell or "the RED event named in each step's `TEST (RED)` block"
# ---- reverse trace: step → requirements
trace={}
for l in PLAN:
    for mm in re.finditer(rf"({S}-S?\d+) (R\d+\.\d+[^·]*)",l):
        trace.setdefault(mm.group(1),[]).extend(re.findall(r"R\d+\.\d+[a-z]?",mm.group(2)))
    if l.startswith("|"):   # table trace: | step | reqs | step | reqs |
        cs=cells(l)
        for a,b in zip(cs[0::2],cs[1::2]):
            if re.fullmatch(rf"{S}-S?\d+",a): trace.setdefault(a,[]).extend(re.findall(r"R\d+\.\d+[a-z]?",b))
reqs=sorted({r for _,sid in steps for r in trace.get(sid,[])}, key=lambda r:[int(x) for x in re.findall(r"\d+",r)])
req_lines=[]
for r in reqs:
    i=find(SPEC,lambda l:re.match(rf"(\*\*|#+ ){re.escape(r)}\b",l) is not None)
    if i is None: continue
    j=(find(SPEC,lambda l:re.match(r"(\*\*|#+ )R\d+\.\d+",l) is not None or l.startswith("## "),i+1) or len(SPEC)+1)-1
    req_lines.append(f"{r} :{i}-{j}")
a_head=find(SPEC,lambda l:l.startswith("## ") and "Acceptance" in l) or find(SPEC,lambda l:l.startswith("## 5."))
a_head=need(a_head,"SPEC acceptance heading"); a_end=(find(SPEC,lambda l:l.startswith("## "),a_head+1) or len(SPEC)+1)-1
# ---- DECISIONS folds the orchestrator appended after the plan closed
folds=[f":{i}" for i,l in enumerate(DEC,1) if l.startswith("## ") and ("folded by the orchestrator" in l or "orchestrator fold" in l)]
# ---- TOOLING-TRAPS headings, by heading text, re-grepped
TR=pathlib.Path(f"{R}/.hermes/TOOLING-TRAPS.md").read_text().splitlines()
heads=["`grep -c` counts LINES, not occurrences","an acceptance pinned to ABSOLUTE LINE NUMBERS","Disjoint WRITE surfaces do not imply independent EFFECTS","a git-root-relative path matches NOTHING","zsh does not word-split unquoted variables","zsh + vitest: an unquoted `$FILES` is ONE filter token","codex sandbox: pnpm exec tsx -e fails with listen EPERM","codex workspace-write blocks real loopback HTTP fixtures","The baseline that moves when you look at it","`git add -A` in a tree that two sessions are writing"]
trap_lines=[]
for hd in heads:
    i=need(find(TR,lambda l:l.startswith("## ") and hd in l),f"TRAPS heading {hd!r}"); trap_lines.append(f"`{R}/.hermes/TOOLING-TRAPS.md:{i}` ({TR[i-1][3:].split(' (')[0][:70]})")
# ---- allowed
allowed=" · ".join(f"{LANE}/{p}{(' '+a) if a else ''}" + ("" if pathlib.Path(f"{LANE}/{p}").exists() else (" (new)" if "(new" not in a else "")) for p,a in surface)
allowed+=f" · {M}/slices/{S}/DECISIONS.md (APPEND ONLY, `V-ROW: NEW` blocks — never numbered by you) · {RP}/probes/{SEAT}/ (new — your run logs, one per run, named by step and attempt)"
if CN!="C1" and not FRAME: raise SystemExit(f"{CN} is a DEPENDENT cluster: pass the frame log measured after its predecessors landed")
if FRAME:
    fl=pathlib.Path(FRAME).read_text().splitlines()
    summ=[l for l in fl if re.search(r"rc=|passed=|failed=|CLUSTER_|BROKEN|diagnostics=",l)]
    base_frame=f"measured by the orchestrator at the branch head AFTER its predecessors landed — `{FRAME}` (sha on its first line), its summary lines verbatim: " + " ⏐ ".join(x.strip() for x in summ[:12])
    base_line=f"`origin/dev` @ 776359c3 plus the predecessor clusters' commits on `{BR}` — the sha on the frame log's first line is your START"
else:
    pd=pathlib.Path(f"{RP}/probes/ARCH-PES-{S}")
    cand=sorted([q for q in pd.glob("*") if q.suffix in (".log",".sh") and (q.name.startswith(f"base-{CN}.") or q.name.startswith(f"{CN}-base"))])
    if not cand: raise SystemExit(f"no ARCH base probe for {CN} under {pd}")
    base_frame=f"this cluster has NO predecessor, so the PLAN §3 row :{rows[0]} IS its frame (created paths omitted), with the ARCH seat's base runs " + " · ".join(f"`{q}`" for q in cand)
    base_line="`origin/dev` @ 776359c3 (the lane HEAD — no predecessor cluster)"
_pd=pathlib.Path(f"{RP}/probes/ARCH-PES-{S}")
_pc=sorted(q for q in _pd.glob("*") if (q.name.startswith(f"base-{CN}.") or q.name.startswith(f"{CN}-base") or (q.name.startswith("C2-C3-base") and CN in ("C2","C3"))))
PROBES_IN=(" · ".join(str(q) for q in _pc)) if _pc else f"none exists for {CN} — its created paths are ABSENT-AT-BASE; the START frame above is the measurement"
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/BUILD.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__CLUSTER__":CN,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__PASS__":"1","__MODEL__":"gpt-6-astra (Codex)",
     "__TRANSPORT__":f"`codex exec -c model='\"gpt-6-astra\"' -c sandbox_mode='\"danger-full-access\"' \"<pointer>\" </dev/null`, background, cwd = the lane (launcher {RP}/logs/launch-{SEAT}.sh (new — written by the orchestrator at dispatch))","__RESUME__":"`codex exec … resume <session id>` in the same lane — record the session id and the rollout path in your CLAIM",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all — superseded or re-dispatched tickets carry more than one)","__LANE__":f"{LANE} (the slice lane; `git status --porcelain` shows only YOUR paths, and ends empty after your commit)","__BRANCH__":BR,"__BASE__":base_line,
     "__STEP_IDS__":step_ids,"__STEP_LINES__":f"{h1}-{h2-1} (§1 START frame), {h6}-{pre_end} (§6 preamble: the guard chain every rejection criterion cites — ends before the first cluster block) and {cl_head}-{cl_end} (your cluster)",
     "__CLUSTER_LINES__":f"{h3}-{h4-1} (§3 — your row :{', :'.join(map(str,rows))}), {h4}-{h5-1} (§4, what REV runs) and {h5}-{h6-1} (§5 boundaries)",
     "__ORACLE__":f"{M}/slices/{S}/{SPECF} acceptance (:{a_head}-{a_end}) and the requirements your steps trace to ({'; '.join(req_lines) or 'see the PLAN §2 trace'})","__TRAP_HEADINGS__":" · ".join(trap_lines),
     "__ALLOWED_FILES__":allowed,"__CLUSTER_COMMAND__":cmd,"__BASE_FRAME__":base_frame,"__MISSION_ROOT__":M,"__REPORTS__":RP}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"- inputs (read these and nothing else): {M}/INSTRUCTIONS.md", f"- inputs (read these and nothing else): {M}/INSTRUCTIONS.md · the V rows {M}/V-DECISIONS-PACKET.md (defaults bind until V rules) · the ARCH seat's base probes {PROBES_IN} (read-only)"+(f" · the orchestrator's review folds in DECISIONS.md at {', '.join(folds)} (they bind your steps)" if folds else ""),1)
charges=f"""
### Charges for THIS node (numbered; answer each in the handoff or write UNVERIFIED)
1. Skills as markdown (COMMON §1 has the paths): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `superpowers:test-driven-development` · `superpowers:verification-before-completion` (+ `superpowers:systematic-debugging` on any bug); `SKILLS LOADED:` names exactly the files you read. Read every comment on {T}, then CLAIM (seat, node, start `date`, the codex session id AND your rollout path under `~/.codex/sessions/<Y>/<M>/<D>/`, lane HEAD + branch + dirty count, `comments read through: 1`, and the START frame RE-MEASURED by you with the cluster command — its marker quoted).
2. **RED events, as their own ordered line** (TRAPS "A BUILD packet must list its RED events as their own ordered line"): {red_cell}. Each RED is watched failing with the cluster command BEFORE the step that turns it green; the PLAN step text says which assertion and which pair.
3. **Steps are the contract**: execute {step_ids} in order, each criterion as the PLAN states it (EXACT means byte-exact; a rejection criterion names the guard AND every guard before it — §6 preamble). A step whose text disagrees with the code at the lines it cites is a packet/plan finding: stop and say so (3.7), never improvise the remedy.
4. **PROGRESS records**: every item the SPEC or PLAN says is "recorded in PROGRESS.md" goes into a `## PROGRESS records` section of your READY handoff — PROGRESS.md is the orchestrator's file and is NOT in your allowed list; the orchestrator transcribes your section verbatim.
5. **Commit law**: after the third GREEN run, ONE commit on `{BR}` with `git add -- <each allowed lane path>` (never `-A`, never a path outside `allowed`, never the mission docs — they live in the MAIN tree and the orchestrator freezes them), message `feat(provider-env-selection/{S}-{CN}): <what the cluster proves>`; quote the sha in the handoff.
6. **Boundaries**: PLAN §5 (:{h5}-{h6-1}) binds; prove each "untouched" claim with `git diff` from the lane's `dialectical-engine/` AND prove the pathspec CAN print (TRAPS "a git-root-relative path matches NOTHING"). No `pnpm install`, no NO-TOUCH port (COMMON §6), no real key (a fake Bearer literal only where the PLAN names one), no process left running, embedded PostgreSQL only on an OS-assigned port and stopped on every exit.
7. NEVER: a file outside `allowed` · another cluster's surface · `git add -A` · `git stash` · push · merge · Done · `hermes kanban boards switch` · a terminal or window on V's desktop.
8. Handoff: self-report FIRST at `{RP}/agent-reports/{SEAT}.md` (new), then `READY` on {T} opening with `SKILLS LOADED:`, eight-line shape (`heartbeat-protocol` §5), the three-run table (run · marker · every pair · log path), every pair you changed (from → to), the refutation matrix (property · mutant · target suite · neighbour · restore, with `git status --porcelain` after every restore), the commit sha, `## PROGRESS records`, `V-ROW: NEW` blocks last if any, `comments read through: <n>`. Print the READY text as your final output, then stop.
"""
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/BUILD-{S}-{CN}.md"); out.write_text(s)
print(f"wrote {out} ({len(s.splitlines())} lines); steps {step_ids} (:{cl_head}-{cl_end}); §3 rows {rows}; pairs `{pairs}`; surface {[p for p,_ in surface]}; reqs {req_lines}; folds {folds}; leftover {left}")
