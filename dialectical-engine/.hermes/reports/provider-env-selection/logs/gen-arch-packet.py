#!/usr/bin/env python3
"""gen-arch-packet.py <S> <lane-abs> <branch> <freeze-prev> <freeze-latest> — packets/ARCH-<S>.md from templates/ARCH.md for mission
provider-env-selection (opus-5 subagent). Every anchor grepped at write time: the SPEC's own path:LINE citations become the code
inputs (file + range), section headings of SPEC/PLAN, the ADR files with ranges, the START-frame logs."""
import sys,re,pathlib
S,LANE,BR,FP,FL=sys.argv[1:6]; NOTE=sys.argv[6] if len(sys.argv)>6 else ""
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
n=S[1:].lstrip("0"); SEAT=f"ARCH-PES-{S}"; T=ids[f"A{n}"]; ST=ids[S]
SL=f"{M}/slices/{S}"
_vs=sorted(pathlib.Path(SL).glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1])); SPECF=_vs[-1].name if _vs else "SPEC.md"
spec=pathlib.Path(f"{SL}/{SPECF}").read_text().splitlines()
VMAX=max([int(x) for x in re.findall(r"^\| V-(\d+)", pathlib.Path(M+"/V-DECISIONS-PACKET.md").read_text(), re.M)] or [0]); plan=pathlib.Path(SL+"/PLAN.md").read_text().splitlines()
def h(lines,needle):
    for i,l in enumerate(lines,1):
        if needle in l: return i
    raise SystemExit(f"ANCHOR MISSING in {S}: {needle!r}")
sp={"req":h(spec,"## 3. Requirements"),"ver":h(spec,"## 4. Verification"),"acc":h(spec,"## 5. Acceptance"),"open":h(spec,"## 6. Open question")}
pl={"start":h(plan,"## 1. START frame"),"trace":h(plan,"## 2. SPEC"),"clusters":h(plan,"## 3. Cluster table"),"verify":h(plan,"## 4. Verification list"),"bound":h(plan,"## 5. Boundaries")}
# code surface = every path:LINE(-LINE) the SPEC cites, grouped per file, existence-checked in the lane
cites={}
for l in spec:
    for m in re.finditer(r"\b((?:apps|packages|deploy|tests|acceptance|docs)/[A-Za-z0-9_./-]+?\.(?:ts|mjs|md|json|yaml|example|service|sh)):(\d+)(?:-(\d+))?", l):
        p,a,b=m.group(1),int(m.group(2)),int(m.group(3) or m.group(2)); cites.setdefault(p,[]).append((a,b))
surface=[]; missing=[]
for p,rs in sorted(cites.items()):
    if not pathlib.Path(f"{LANE}/{p}").exists(): missing.append(p); continue
    rs=sorted(set(rs)); span=", ".join(f"{a}" if a==b else f"{a}-{b}" for a,b in rs)
    surface.append(f"`{LANE}/{p}:{span}`")
adrs=[]
for f,needle,before,after in [("docs/architecture/01-decisions/ADR-0011-register-mechanism-and-resolution-chains.md","### 6. The register-gated branch",0,40),("docs/architecture/01-decisions/ADR-0015-deployment-maker-inventory.md","**`deployment_maker_capability`**",0,45),("docs/architecture/01-decisions/ADR-0018-deployment-topology.md","*configured provider set*",18,6)]:
    ls=pathlib.Path(f"{LANE}/{f}").read_text().splitlines(); i=h(ls,needle); adrs.append(f"`{LANE}/{f}:{max(1,i-before)}-{min(len(ls),i+after)}`")

def _findings_naming(slice_id):
    out=[]
    for vf in sorted(pathlib.Path(M+"/reviews").glob("REQ-REV-p*.md")):
        lines=vf.read_text().splitlines(); cur=None; buf=[]; hits=[]
        def flush():
            if cur and (re.search(rf"\b{slice_id}\b", " ".join(buf)) or f"slices/{slice_id}/" in " ".join(buf)): hits.append(cur)
        for l in lines:
            mm=re.match(r"^(?:#{2,3} )?((?:B|N)\d+)\b", l)
            if mm or l.startswith("## "):
                flush(); cur=mm.group(1) if mm else None; buf=[l]
            else: buf.append(l)
        flush()
        out.append(f"{vf} ({'findings naming '+slice_id+': '+', '.join(hits) if hits else 'no finding names '+slice_id})")
    return " · ".join(out)
def _latest_rev_ranges():
    vs=sorted(pathlib.Path(M+"/reviews").glob("REQ-REV-p*.md"), key=lambda q:int(q.stem.split("-p")[1]))
    if not vs: return ""
    last=vs[-1]; ls=last.read_text().splitlines(); heads=[(i,l) for i,l in enumerate(ls,1) if l.startswith("## ")]
    out=[]
    for k,(i,l) in enumerate(heads):
        if l.strip() in ("## PREDICTIONS","## UNVERIFIED"):
            j=(heads[k+1][0]-1) if k+1<len(heads) else len(ls); out.append(f"{l[3:].strip()} :{i}-{j}")
    return f"{last} ({' · '.join(out)})"
INTAKE_LINES=", ".join(sorted({m.group(1) for l in spec for m in re.finditer(r"00-intake\.md:(\d+(?:-\d+)?)", l)}, key=lambda x:int(x.split("-")[0]))) or "§5b"
REQREV_CLAUSE=("— CONTEXT ONLY: every finding they raised is CLOSED in the SPEC of record, so they do not bind your plan; read the latest pass's sections on what NO review executed, which your plan's commands must run: "
               + _latest_rev_ranges() + " · open an earlier finding only when a SPEC sentence's reason is unclear: " + _findings_naming(S))
T_=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/ARCH.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__PASS__":"1","__MODEL__":"the Agent tool's `opus` (a Claude subagent of the orchestrator's session — record the model your transcript shows; roster row V-3 names opus-5)",
     "__TRANSPORT__":f"Agent tool, background, model opus, seat `{SEAT}`","__RESUME__":"SendMessage to your agent id (the transcript file name you give at CLAIM) — same session, turn by turn","__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"1 (the orchestrator's DISPATCHED comment)",
     "__LANE__":f"{LANE} (the slice's own lane on branch `{BR}` @ 776359c3 — READ-ONLY for you: you run commands there and write NOTHING in it; git writes are forbidden)","__BRANCH__":BR,"__BASE__":"`origin/dev` @ 776359c3",
     "__MISSION_ROOT__":M,"__REPO_ROOT__":R,"__REPORTS__":RP}
s=T_
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"{R}/docs/architecture/01-decisions/ · the tooling-traps index · the code surface the SPEC names (read-only)",
            f"the ADRs, in the LANE at these ranges: {' · '.join(adrs)} · the tooling-traps index (`grep -n '^## ' {R}/.hermes/TOOLING-TRAPS.md`, read-only; open a heading only when a charge names it) · the code surface the SPEC cites, in the LANE, read-only, exactly these files and ranges: {' · '.join(surface)} · the REQ-REV verdicts {REQREV_CLAUSE} · the intake {M}/00-intake.md at the lines the SPEC cites ({INTAKE_LINES}) and the baselines `{RP}/logs/baselines.tsv` · the V rows {M}/V-DECISIONS-PACKET.md (defaults bind) · the scaffold you fill in place, {M}/slices/{S}/PLAN.md")
s=s.replace(f"- allowed (exhaustive): {M}/slices/{S}/PLAN.md",f"- allowed (exhaustive): {RP}/probes/{SEAT}/ (new — every `.sh` you run a cluster command from, and its captured output) · {M}/slices/{S}/PLAN.md")
charges=f"""
### Charges for THIS node (numbered; answer each in the handoff or write UNVERIFIED)
1. **Skills through the Skill tool** in the order line 4 names; `SKILLS LOADED:` names the SKILL.md files the tool reported. Then read every comment on {T} (`~/.local/bin/hermes kanban --board provider-env-selection show {T} --json`), then CLAIM (`… comment {T} "<body>" --author {SEAT}`): seat, node, start `date`, your transcript = the newest `agent-*.jsonl` under `/Users/vladmihaimiron/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/2c3aeba2-8ae1-471b-80a1-30324a7327af/subagents/` (new — the harness writes it) at CLAIM time (directory + that file's mtime), lane HEAD + dirty count (expected 0), `comments read through: 1`.
2. **Read the SPEC in full** (the SPEC of record {SL}/{SPECF}: requirements :{sp['req']}-{sp['ver']-1}, verification :{sp['ver']}-{sp['acc']-1}, acceptance :{sp['acc']}-{sp['open']-1}, the open question :{sp['open']}-{len(spec)}) and the scaffold ({SL}/PLAN.md: START frame :{pl['start']}-{pl['trace']-1}, trace skeleton :{pl['trace']}-{pl['clusters']-1}, cluster table :{pl['clusters']}-{pl['verify']-1}, verification list :{pl['verify']}-{pl['bound']-1}, boundaries :{pl['bound']}-{len(plan)}) and {SL}/DECISIONS.md in full. The SPEC is FROZEN: a requirement you cannot plan is a `V-ROW: NEW` in your handoff, never an edit.
3. **Fill PLAN.md in place** (the scaffold's sections keep their headings and order): every step finite, categoric, quantifiable, with `path:LINE` anchors re-grepped in the LANE (never from the SPEC's citations by habit — the lane is the truth); every requirement R{n}.x traced to ≥ 1 step and every step to a requirement; the cluster table = BUILD units with ONE verification command each (a `run-suites.sh` pair list or a single captured command), disjoint write surfaces where they run in parallel; the slice verification list `REV({S})` runs; boundaries; DDD impact; ADR only if a decision outlives the mission (next free number by `ls` at write time).
4. **Run every cluster command at base** from a `.sh` under `{RP}/probes/{SEAT}/` (new) in the LANE, output captured (`LOG=<abs path under that dir> zsh {R}/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh <cmd…>` or `run-suites.sh`), and record the verdict per command in PLAN.md §3: RED-for-TDD is expected, BROKEN (module load, missing binary, a port in use) is a defect you fix in the plan; a test path a step CREATES is omitted from the base run and said so. Never `pnpm install`; never a listener on the NO-TOUCH ports (COMMON §6); a fixture endpoint a cluster needs is a STEP that creates it under `tests/` or `acceptance/`, on a port above 4400 measured free with `lsof`.
5. **What binds you**: rows V-1..V-{VMAX} (`{M}/V-DECISIONS-PACKET.md`) as defaults — the switch is `DEBATEAI_DEPLOYMENT_MODE` at launch, keys stay credential FILES, no real key anywhere, no probe-freshness floor (V-7) · the exact-set invariant and the sealed v1 row shape untouched · the four RED-at-base suites pinned at their pairs unless the SPEC names one · `pnpm typecheck` judged by per-file delta · a rejection oracle names the guard it expects AND every guard that fires before it · every production step names the case that goes RED when the step is omitted · every JSON example labelled EXACT or CONTAINS.
6. **DECISIONS.md** append-only: `date · question · choice · reason · who ruled`, every rejected alternative included (brainstorming's "explicit yes" is discharged by this record).
7. **NEVER**: every SPEC version (SPEC.md and each SPEC-v<n>.md — frozen) · any product or test file · any git write · another slice's files · the main tree's uncommitted work · `hermes kanban boards switch` · anything on V's desktop.
8. **Handoff**: self-report FIRST at `{RP}/agent-reports/{SEAT}.md` (new), then `READY` on {T} opening with `SKILLS LOADED:` in the eight-line shape (`heartbeat-protocol` §5): the step count, the cluster table (id · write surface · command · base verdict), the trace both ways (zero gaps), ADRs written (or none), `V-ROW: NEW` blocks last, `comments read through: <n>`. Print the READY text as your final message, then stop.
"""
s=s.replace(f"{M}/slices/{S}/SPEC.md (frozen; never edit)", f"{M}/slices/{S}/{SPECF} (the SPEC of record; frozen; never edit" + (" — SPEC.md and every earlier SPEC-v<n> are superseded history, NOT inputs)" if SPECF!="SPEC.md" else ")"))
if NOTE: charges+=f"9. **Standing facts for this slice (the orchestrator's):** {NOTE}\n"
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/ARCH-{S}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); SPEC of record {SPECF}; V rows 1..{VMAX}; surface files {len(surface)}; missing in lane {missing}; leftover {left}")
