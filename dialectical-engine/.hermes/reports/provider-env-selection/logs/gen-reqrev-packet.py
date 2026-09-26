#!/usr/bin/env python3
"""gen-reqrev-packet.py <pass> <freeze-prev> <freeze-latest> — packets/REQ-REV-p<pass>.md from templates/REQ-REV.md for mission
provider-env-selection; the lens cwd is the detached planning lane (read-only); every mission path absolute; anchors grepped at write time."""
import sys,re,pathlib,subprocess
PASS,FP,FL=sys.argv[1],sys.argv[2],sys.argv[3]
SCOPE=sys.argv[4] if len(sys.argv)>4 else ""
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
LANE=f"{R}/.worktrees/pes-base/dialectical-engine"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
VMAX=max([int(x) for x in re.findall(r'^\| V-(\d+)', pathlib.Path(M+'/V-DECISIONS-PACKET.md').read_text(), re.M)] or [0])
SEAT=f"REQ-REV-PES-p{PASS}"; T=ids["RREV"] if PASS=="1" else ids[f"RREV{PASS}"]
slices=sorted(p.name for p in pathlib.Path(M+"/slices").iterdir() if p.is_dir())
if PASS!="1": slices=[x for x in slices if pathlib.Path(M+"/slices/"+x+"/SPEC-v"+PASS+".md").exists()]  # a scoped pass lists only the slices it reviews (REQ-REV-PES-p3 N1)
def spec_of_record(sl):
    vs=sorted(pathlib.Path(f"{M}/slices/{sl}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1]))
    return vs[-1].name if vs else "SPEC.md"
specs=" · ".join(f"{M}/slices/{s}/{spec_of_record(s)} (the SPEC of record) + PLAN.md + DECISIONS.md" for s in slices)
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/REQ-REV.md").read_text()
rep={"__SEAT__":SEAT,"__PASS__":PASS,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__MODEL__":"grok-4.7","__TRANSPORT__":"grok -p headless, background (launcher logs/launch-"+SEAT+".sh)","__RESUME__":"`grok --resume <id>` in the same cwd",
     "__TICKET__":T,"__SLICE_TICKET__":"the [V] TEST tickets the orchestrator creates from the slice table (none is yours)","__CURSOR__":"1 (the orchestrator's DISPATCHED comment)",
     "__LANE__":LANE+" (READ-ONLY detached checkout of the base; git status --porcelain must end empty)","__BRANCH__":"detached HEAD","__BASE__":"`origin/dev` @ 776359c3",
     "__MISSION_ROOT__":M,"__REPORTS__":RP}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace("every "+M+"/slices/<S>/SPEC.md and PLAN.md scaffold", "the slices, exhaustively: "+specs)
s=s.replace("the intake record", f"the intake record {M}/00-intake.md in FULL and the V rows {M}/V-DECISIONS-PACKET.md · the spike {M}/design/spike-2026-09-23.md (STALE by the intake's §7 — a requirement that repeats it is a finding) · your own artifact-to-be {M}/reviews/REQ-REV-p{PASS}.md (new)" + ("" if PASS=="1" else f" · the previous pass {M}/reviews/REQ-REV-p{int(PASS)-1}.md and its probes {RP}/probes/REQ-REV-PES-p{int(PASS)-1}/ · the REQ-FIX handoff (the READY comment by REQ-FIX-PES on the ticket the DISPATCHED comment names) quoted AS CLAIMS · the REQ-FIX seat's checkers {RP}/probes/REQ-FIX-PES/ (claims to refute: re-run them, and watch each one FAIL on the previous SPEC version before you credit its PASS)"))
s=s.replace("the freeze commits (COMMON §6 row `freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/provider-env-selection` is exactly what the seat under review changed)",
            (f"the freeze pair: `git -C {R} diff --stat {FP}..{FL} -- docs/missions/provider-env-selection` is EXACTLY what the seat under review wrote (INSTRUCTIONS.md + slices/**)" if PASS=="1" else
             "the freeze pair: `git -C "+R+" diff --stat "+FP+".."+FL+" -- "+" ".join(["docs/missions/provider-env-selection/INSTRUCTIONS.md"]+["docs/missions/provider-env-selection/slices/"+sl for sl in slices if pathlib.Path(M+"/slices/"+sl+"/SPEC-v"+PASS+".md").exists()])+"` is the REQ-FIX pass-"+PASS+" seat's SPEC-v"+PASS+" files, PLAN re-aims, DECISIONS appends and INSTRUCTIONS changes, plus the orchestrator's PROGRESS.md lines and one-line timestamp corrections to its own fold rows in DECISIONS.md (the orchestrator's, not under review)"))
charges=f"""
### Charges for THIS node (numbered; answer each or write UNVERIFIED)
1. Skills as markdown (COMMON §1 has the paths): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion`; `SKILLS LOADED:` names exactly the files you read. Read every comment on {T}, then CLAIM (seat, node, start `date`, grok session id + `chat_history.jsonl` path, cwd HEAD + dirty count, `comments read through: 1`).
2. Review the REQ packet FIRST ({PK}/REQ.md): a packet defect (a range that hid what the seat needed, a charge two seats would read differently) is a finding against the orchestrator, numbered like any other.
3. The gap table (intake §10 items (a)–(e), verdicts in the first slice's DECISIONS.md and INSTRUCTIONS.md): re-measure every BUILT verdict against the code in {LANE} at the lines cited and the test named — a BUILT that no test pins, or a GAP that the code already covers, is a B-finding. The spike ({M}/design/spike-2026-09-23.md) is STALE by the intake's §7 — a requirement that repeats a stale claim is a finding.
4. Per SPEC: numbered requirements mechanically checkable; zero banned words (improve, better, robust, handle, appropriate); `ui:` flag right for the acceptance surface; acceptance steps runnable by a STRANGER on this Mac with the commands named and the refusal codes verbatim; rows V-1..V-{VMAX} honoured as defaults (each default binds until V rules; a row V added after this packet was written is named in the orchestrator's comments); the four RED-at-base suites pinned at their pairs (intake §5b) unless a requirement says which and to what; the exact-set invariant and the credential-file contract untouched; no real key anywhere. One requirement two coders would build differently = B.
5. Vertical: each slice has a beginning and an end V can exercise alone; a slice that only refactors, or that cannot be accepted without another slice, is a B.
6. Your artifact {M}/reviews/REQ-REV-p{PASS}.md (new): findings B1…/N1… with file:line and the concrete failure; `VERDICT PASS|REWORK|BLOCKED / CONFIDENCE / STRONGEST COUNTER`; a `## V-ROW` section last (NEW rows or `None.`); `## UNVERIFIED`. Probes, if any, under {RP}/probes/{SEAT}/ (new).
7. NEVER: edit anything under review · git writes · product files · `pnpm install` · listeners on the NO-TOUCH ports (COMMON §6) · a real key · `hermes kanban boards switch`.
"""
if SCOPE:
    PP=int(PASS)-1
    charges+=f"\n8. **SCOPE of this pass:** {SCOPE} — the pass-{PP} artifact {M}/reviews/REQ-REV-p{PP}.md and its probes {RP}/probes/REQ-REV-PES-p{PP}/ are inputs; replay every pass-{PP} probe that touched a closed finding in YOUR probe dir (never edit the earlier one); a finding outside the scope is named, not re-reviewed. A REWORK at pass 3 is a V row — write it as a `## V-ROW` block with the smallest yes/no, not as a fourth pass.\n"
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/REQ-REV-p{PASS}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); slices {slices}; leftover {left}")
