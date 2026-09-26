#!/usr/bin/env python3
"""gen-archfix-packet.py <S> <pass> <prev-pass> <lane-abs> "<assigned finding ids>" — packets/ARCH-FIX-<S>-p<pass>.md from templates/ARCH-FIX.md
for mission provider-env-selection: the ARCH-PES-<S> subagent session RESUMED (same-session-first), reworking PLAN.md after the blind
ARCH-REV pass <prev>. Verdict headings, its probes dir, the SPEC of record and every mission path are grepped/resolved at write time.
Board key AF<n> (the ARCH-FIX node) must exist in logs/board-ids.env; the ARCH seat's agent id is read from its CLAIM comment on A<n>."""
import sys,re,pathlib,subprocess,json
S,PASS,PREV,LANE,ASSIGNED=sys.argv[1:6]
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
n=S[1:].lstrip("0"); SEAT=f"ARCH-FIX-PES-{S}-p{PASS}"; _k=f"AF{n}" if PASS=="2" else f"AF{n}P{PASS}"; T=ids.get(_k) or sys.exit(f"board key {_k} missing — create the ARCH-FIX node first"); ST=ids[S]; AT=ids[f"A{n}"]
V=f"{M}/reviews/ARCH-REV-{S}-p{PREV}.md"; vl=pathlib.Path(V).read_text().splitlines()
heads=[(i,l) for i,l in enumerate(vl,1) if l.startswith("## ")]
ranges=[]
for k,(i,l) in enumerate(heads):
    j=(heads[k+1][0]-1) if k+1<len(heads) else len(vl); ranges.append(f"`{l[3:].strip()[:60]}` :{i}-{j}")
probes=f"{RP}/probes/ARCH-REV-PES-{S}-p{PREV}/"
specs=sorted(pathlib.Path(f"{M}/slices/{S}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1])); SPECF=specs[-1].name if specs else "SPEC.md"
# the ARCH seat's transcript (agent id) from its CLAIM on the ARCH ticket
show=subprocess.run(["/Users/vladmihaimiron/.local/bin/hermes","kanban","--board","provider-env-selection","show",AT,"--json"],capture_output=True,text=True).stdout
agent="(read the CLAIM comment on "+AT+")"
try:
    for c in json.loads(show).get("comments",[]):
        m=re.search(r"subagents/agent-([0-9a-f]+)\.jsonl",str(c.get("body","")))
        if m: agent=m.group(1); break
except Exception: pass
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/ARCH-FIX.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__PREV_PASS__":PREV,"__PASS__":PASS,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,
     "__MODEL__":f"the SAME ARCH-PES-{S} subagent session (agent {agent}), resumed (§7 same-session-first) — its turns run on the orchestrator session's current model; record the model your transcript shows (roster row V-3 names opus-5)","__TRANSPORT__":"SendMessage from the orchestrator to that agent (its transcript is its memory)","__RESUME__":"another SendMessage, turn by turn",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all — superseded or re-dispatched tickets carry more than one)","__LANE__":f"{LANE} (the slice lane — READ-ONLY for you: `git status --porcelain` must end empty; cluster commands run from a `.sh` under your probes dir)","__BRANCH__":f"slice/provider-env-selection-{S.lower()}","__BASE__":"`origin/dev` @ 776359c3",
     "__VERDICT__":f"{V} (sections: {' · '.join(ranges)})","__PROBES__":f"{probes} (its `.sh`/`.mjs`/`.py` files and logs — re-run them; a reviewer's detector is the first thing your revision is measured against)",
     "__FINDING_IDS__":ASSIGNED,"__PREDECESSOR__":f"n/a — this IS your session, resumed; your own READY on {AT} and your self-report are in your transcript",
     "__SPEC__":f"{M}/slices/{S}/{SPECF} (frozen — byte-identical at your READY)","__MISSION_ROOT__":M,"__REPORTS__":RP}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"the V rows and {M}/BASELINE.md", f"the V rows {M}/V-DECISIONS-PACKET.md (each default binds) and the baselines `{RP}/logs/baselines.tsv` + the intake table {M}/00-intake.md §5b")
s=s.replace("PROGRESS.md, BASELINE.md, the intake record","PROGRESS.md, the intake record")
s=s.replace(f"- allowed (exhaustive): {M}/slices/{S}/PLAN.md", f"- allowed (exhaustive): {RP}/probes/{SEAT}/ (new — your re-runs and checkers) · {M}/slices/{S}/PLAN.md")
charges=f"""
### Charges for THIS node (numbered; answer each in the handoff or write UNVERIFIED)
1. Skills through the Skill tool in the order line 4 names (`receiving-code-review` before you touch a step); `SKILLS LOADED:` names the files the tool reported. Read every comment on {T}, then CLAIM (seat, node, start `date`, transcript = your own `agent-{agent}.jsonl` under the orchestrator's `subagents/` dir, lane HEAD + dirty 0, `comments read through: 1`).
2. For each assigned finding: reproduce it against PLAN.md as it stands (quote the step and the line the verdict names), then revise the fewest steps that leave one build true, RED-before-GREEN order kept; the `Revision {PASS}` line under the title names the pass, the verdict file and every cluster/step changed. The SPEC is frozen: a finding that needs a SPEC change is CONTESTED with a `V-ROW: NEW` block, never patched around.
3. Re-run every cluster command AS IT NOW STANDS at base in the lane from a `.sh` under `{RP}/probes/{SEAT}/` (new) (captured with `LOG=<abs> zsh {R}/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh …`); record each verdict in PLAN.md §3's verdict column; re-run the reviewer's detectors from {probes} and quote their result on your revision; a checker your revision relies on is watched FAILING on a mutant before its PASS is quoted.
4. Trace both ways again (your parser or the reviewer's) with zero gaps; every `path:line` your revision touches re-measured in the LANE; zero banned words.
5. NEVER: the SPEC · product or test files · git writes · `pnpm install` · listeners · the NO-TOUCH ports (COMMON §6) · a real key · PROGRESS.md · the intake · the V packet · other slices' files · `hermes kanban boards switch`.
6. Handoff: self-report FIRST at `{RP}/agent-reports/{SEAT}.md` (new), then `READY` on {T} opening with `SKILLS LOADED:`, eight-line shape, every assigned finding ADDRESSED (the step text added or changed, quoted, with its new PLAN.md line) or CONTESTED (with the measurement and a `V-ROW: NEW` block), the sweep member-by-member, `comments read through: <n>`. Print the READY text as your final message, then stop.
"""
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/ARCH-FIX-{S}-p{PASS}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); verdict sections {len(ranges)}; agent {agent}; leftover {left}")
