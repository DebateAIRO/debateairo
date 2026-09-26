#!/usr/bin/env python3
"""gen-archfix-vruling-packet.py <S> <pass> <lane-abs> <agent-id> — packets/ARCH-FIX-<S>-p<pass>.md from templates/ARCH-FIX.md for an
ARCH-FIX whose input is V's RULINGS applied by REQ-FIX p4 (a new SPEC version), not a review verdict (gen-archfix-packet.py is verdict-shaped).
The ARCH agent is resumed by 2c3aeba2 (its parent session) on behalf of orchestrator b40ffbd3. Anchors resolved at write time: the V rulings
section, the REQ-FIX p4 self-report, the SPEC of record (highest SPEC-v<n>) and the one it superseded, the lane HEAD."""
import sys,re,pathlib,subprocess
S,PASS,LANE,AGENT=sys.argv[1:5]
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
n=S[1:].lstrip("0"); SEAT=f"ARCH-FIX-PES-{S}-p{PASS}"; _k=f"AF{n}" if PASS=="2" else f"AF{n}P{PASS}"; T=ids.get(_k) or sys.exit(f"board key {_k} missing")
ST=ids[S]; RF=ids["RFIX5"] if S=="S03" else ids["RFIX4"]
VP=pathlib.Path(M+"/V-DECISIONS-PACKET.md").read_text().splitlines()
vr=next(i for i,l in enumerate(VP,1) if l.startswith("## V's rulings"))
specs=sorted(pathlib.Path(f"{M}/slices/{S}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1]))
SPECF=specs[-1].name if specs else sys.exit("no SPEC-v<n> — REQ-FIX p4 not consumed?")
PREVF=specs[-2].name if len(specs)>1 else "SPEC.md"
rq=f"{RP}/agent-reports/REQ-FIX-PES-p5.md" if S=="S03" else f"{RP}/agent-reports/REQ-FIX-PES-p4.md"
if not pathlib.Path(rq).exists(): sys.exit("REQ-FIX-PES-p4 self-report missing")
head=subprocess.run(["git","-C",LANE,"rev-parse","--short","HEAD"],capture_output=True,text=True).stdout.strip()
built=subprocess.run(["git","-C",LANE,"log","--format=%h %s","776359c3..HEAD"],capture_output=True,text=True).stdout.strip().replace("\n"," · ") or "none"
rulings={"S01":"V-10 (hosted publish refuses a set dropping a role provider) and V-12+V-13 (exit 1 on FAIL, the verdict is the acceptance's own last line)",
         "S02":"V-12+V-13 (exit 1 on FAIL, the verdict is the acceptance's own last line)",
         "S03":"V-11 + V-14 (every README mention of COST_ENVELOPES_NOT_SEALED re-worded: the live start-up refusal is COST_ENVELOPE_POLICY_UNRESOLVED / _INVALID, COST_ENVELOPES_NOT_SEALED is a build-integrity check — SPEC-v3 R3.4 and R3.4b)"}[S]
extra={"S01":f"C1 is BUILT (lane HEAD {head}: {built}) and untouched by V-10 — do not re-plan it. Place V-10's new steps in the clusters it belongs to (the library C2, the command's suites C3, the acceptance C4 if §5 gains a step), with their RED events and pairs updated in §3; renumber nothing that is already cited elsewhere — append step ids.",
       "S02":f"No cluster is built yet (lane HEAD {head}). ARCH-REV S02 p2 has NOT reviewed Revision 2 yet: it reviews Revision 2 and this revision together, so keep Revision 2's text intact except where the exit rule forces a change, and name every step this revision touches.",
       "S03":f"C1 and C2 are BUILT (lane HEAD {head}: {built}); C2-7 wrote the sentence V-11 overrules. Do NOT rewrite C1/C2's blocks: add ONE fix cluster in the existing shape — a `#### Cluster S03-C3` block with `**C3-n · …**` steps (RED first) and a `| **S03-C3** |` row in §3 whose command is `run-suites.sh` pairs — that changes the README sentence and its pin, and whose START state is the post-C2 head {head} (the orchestrator measures its frame). S03's ARCH-REV passes are spent, so REV(S03) is the next reviewer of this change: make each step's criterion EXACT and self-checking."}[S]
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/ARCH-FIX.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__PREV_PASS__":f"{int(PASS)-1} — here: V's rulings applied by REQ-FIX p4","__PASS__":PASS,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,
     "__MODEL__":f"the SAME ARCH subagent session of {S} (agent {AGENT}), resumed (§7 same-session-first) — its turns run on its parent session's current model; record the model your transcript shows",
     "__TRANSPORT__":"SendMessage from orchestrator session 2c3aeba2 (the agent's parent; it acts for the orchestrator of record b40ffbd3 on THIS node only)","__RESUME__":"another SendMessage, turn by turn",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all)",
     "__LANE__":f"{LANE} (the slice lane — READ-ONLY for you: `git status --porcelain` must end empty; cluster commands run from a `.sh` under your probes dir)","__BRANCH__":f"slice/provider-env-selection-{S.lower()}","__BASE__":f"`origin/dev` @ 776359c3; lane HEAD {head}",
     "__VERDICT__":f"V's rulings in {M}/V-DECISIONS-PACKET.md, section `## V's rulings` (:{vr}), cited BY ROW ID (V-10, V-11, V-12/V-13, V-14) — its line numbers move as rows are added, see its `## Pointer note` (verbatim, the authority) and the SPEC change they produced: {M}/slices/{S}/{PREVF} → {M}/slices/{S}/{SPECF} (read the diff: `diff {M}/slices/{S}/{PREVF} {M}/slices/{S}/{SPECF}`), with the requirements seat's self-report {rq} and its READY comment on {RF} (its PLAN-step list for your slice is your starting list — REQ-FIX p4's too, for S03's R3.4, on t_aad48581)",
     "__PROBES__":f"{RP}/probes/REQ-FIX-PES-p4/ (if present — the requirements seat's checks)",
     "__FINDING_IDS__":f"the amendments for {rulings}",
     "__PREDECESSOR__":"n/a — this IS your session, resumed; your earlier READY and self-report are in your transcript",
     "__SPEC__":f"{M}/slices/{S}/{SPECF} (frozen — byte-identical at your READY)","__MISSION_ROOT__":M,"__REPORTS__":RP}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"the V rows and {M}/BASELINE.md", f"the V rows {M}/V-DECISIONS-PACKET.md (each default binds, V's rulings override) and the baselines `{RP}/logs/baselines.tsv` + the intake table {M}/00-intake.md §5b")
s=s.replace("PROGRESS.md, BASELINE.md, the intake record","PROGRESS.md, the intake record")
s=s.replace(f"- allowed (exhaustive): {M}/slices/{S}/PLAN.md", f"- allowed (exhaustive): {RP}/probes/{SEAT}/ (new — your re-runs and checkers) · {M}/slices/{S}/PLAN.md")
charges=f"""
### Charges for THIS node (numbered; answer each in the handoff or write UNVERIFIED)
1. Skills through the Skill tool in the order line 4 names; `SKILLS LOADED:` names the files the tool reported. Read every comment on {T}, then CLAIM (seat, node, start `date`, transcript = your own `agent-{AGENT}.jsonl`, lane HEAD + dirty 0, `comments read through: <n>`).
2. The plan follows {SPECF} now. For each amended requirement: name the PLAN steps it touches (start from REQ-FIX p4's list and CHECK it — a step it missed is yours to name), revise the fewest steps that leave one build true, RED-before-GREEN order kept; the SPEC↔PLAN trace re-pointed at {SPECF}'s line numbers. A `Revision {PASS}` line under the title names the pass, V's rulings and every cluster/step changed.
3. {extra}
4. Re-run every cluster command AS IT NOW STANDS in the lane from a `.sh` under `{RP}/probes/{SEAT}/` (new) (captured with `LOG=<abs> zsh {R}/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh …`); record each verdict in §3; a checker your revision relies on is watched FAILING on a mutant before its PASS is quoted. Trace both ways with zero gaps; every `path:line` your revision touches re-measured in the LANE; zero banned words.
5. A ruling that cannot hold as the SPEC words it is CONTESTED with a measurement and a `V-ROW: NEW` block — never patched around.
6. NEVER: any SPEC version · product or test files · git writes · `pnpm install` · listeners · the NO-TOUCH ports (COMMON §6) · a real key · PROGRESS.md · the intake · the V packet · other slices' files · `hermes kanban boards switch`.
7. Handoff: self-report FIRST at `{RP}/agent-reports/{SEAT}.md` (new), then `READY` on {T} opening with `SKILLS LOADED:`, eight-line shape, each amendment APPLIED (the step text added or changed, quoted, with its new PLAN.md line) or CONTESTED, the §3 verdicts, `comments read through: <n>`. Print the READY text as your final message, then stop.
"""
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/ARCH-FIX-{S}-p{PASS}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); SPEC {PREVF}→{SPECF}; lane HEAD {head}; agent {AGENT}; leftover {left}")
