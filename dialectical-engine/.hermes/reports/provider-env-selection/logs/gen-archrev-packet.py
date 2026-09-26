#!/usr/bin/env python3
"""gen-archrev-packet.py <S> <pass> <lane-abs> <freeze-prev> <freeze-latest> — packets/ARCH-REV-<S>-p<pass>.md from templates/ARCH-REV.md
for mission provider-env-selection (grok-4.7 lens in the slice lane, read-only)."""
import sys,re,pathlib
import re as _re
def _vmax(path):
    ids=[int(m) for m in _re.findall(r'^\| V-(\d+)', open(path).read(), _re.M)]
    return max(ids) if ids else 0
S,PASS,LANE,FP,FL=sys.argv[1:6]
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
VMAX=_vmax(f"{M}/V-DECISIONS-PACKET.md")
n=S[1:].lstrip("0"); SEAT=f"ARCH-REV-PES-{S}-p{PASS}"; T=ids[f"AR{n}"] if PASS=="1" else ids[f"AR{n}P{PASS}"]; ST=ids[S]; AT=ids[f"A{n}"]; PP=int(PASS)-1
PAIR_WHAT=("is the ARCH seat's PLAN.md (filled) + DECISIONS.md (appended lines) plus ONE orchestrator line in PROGRESS.md (the orchestrator's file, not under review)" if PASS=="1" else
           f"is the ARCH-FIX seat's PLAN.md revision (its `Revision {PASS}` line names every step it changed) + its DECISIONS.md lines, plus the orchestrator's pass-{PP} folds in DECISIONS.md and PROGRESS.md lines (the orchestrator's, not under review)")
import subprocess as _sp
def _git(*a): return _sp.run(["git","-C",R,*a],capture_output=True,text=True,check=True).stdout
_SPECS=sorted(pathlib.Path(f"{M}/slices/{S}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1]))
SPECF=_SPECS[-1].name if _SPECS else "SPEC.md"
_changed=_git("diff","--relative","--name-only",f"{FP}..{FL}","--",f"docs/missions/provider-env-selection/slices/{S}").split()
if PASS=="1":
    PAIR_WHAT=("is the ARCH seat's PLAN.md (filled) + DECISIONS.md (appended lines)"
               + (" plus orchestrator lines in PROGRESS.md (the orchestrator's file, not under review)" if any(c.endswith("/PROGRESS.md") for c in _changed) else "")
               + " — measured: " + ", ".join(pathlib.Path(c).name for c in _changed))
# the seat's own V rows: rows whose source column names the node's ticket (ARCH on pass 1, the ARCH-FIX on later passes)
_own_t=AT if PASS=="1" else (ids[f"AF{n}"] if PASS=="2" else ids[f"AF{n}P{PASS}"])
_own=[m for m in _re.findall(r'^\| (V-\d+) \| ([^|]*)\|', open(f"{M}/V-DECISIONS-PACKET.md").read(), _re.M) if _own_t in m[1]]
OWNV=("the seat under review raised " + ", ".join(v for v,_ in _own) + " (default applied)") if _own else "the seat under review raised no V row"
# ADRs the pair ADDED that the PLAN names
_adrs=[a for a in _git("diff","--relative","--name-only","--diff-filter=A",f"{FP}..{FL}","--","docs/architecture/01-decisions").split()
       if _re.search(r"ADR-(\d{4})",a) and _re.search(r"ADR-(\d{4})",a).group(0) in pathlib.Path(f"{M}/slices/{S}/PLAN.md").read_text()]
ADR_IN="".join(f" · the ADR the plan adds {R}/{a} (new in the freeze pair; review it with the plan)" for a in _adrs)
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/ARCH-REV.md").read_text()
_o=" · SPEC.md · DECISIONS.md · "
assert s.count(_o)==1, "template SPEC anchor moved"
s=s.replace(_o, f" · {M}/slices/{S}/{SPECF} (the SPEC of record — every other SPEC*.md in the slice is frozen history, not an input) · {M}/slices/{S}/DECISIONS.md{ADR_IN} · ",1)
rep={"__SEAT__":SEAT,"__SLICE__":S,"__PASS__":PASS,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__MODEL__":"grok-4.7","__TRANSPORT__":f"grok -p headless, background (launcher logs/launch-{SEAT}.sh)","__RESUME__":"`grok --resume <id>` in the same cwd",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all — superseded or re-dispatched tickets carry more than one)","__LANE__":f"{LANE} (the slice lane, READ-ONLY for git; `git status --porcelain` must end empty)","__BRANCH__":f"slice/provider-env-selection-{S.lower()}","__BASE__":"`origin/dev` @ 776359c3",
     "__MISSION_ROOT__":M,"__REPORTS__":RP,"__SCRATCH__":f"{RP}/probes/{SEAT}/scratch"}
for k,v in rep.items(): s=s.replace(k,v)
s=s.replace(f"the freeze commits (COMMON §6 row `freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/provider-env-selection` is exactly what the seat under review changed)",
            f"the freeze pair: `git -C {R} diff --stat {FP}..{FL} -- docs/missions/provider-env-selection/slices/{S}` {PAIR_WHAT} · the ARCH seat's probes `{RP}/probes/ARCH-PES-{S}/` (its `.sh` files and captured base runs — re-run them, never trust them) · the intake baselines {M}/00-intake.md §5b and `{RP}/logs/baselines.tsv` · the V rows {M}/V-DECISIONS-PACKET.md · your own artifact-to-be {M}/reviews/ARCH-REV-{S}-p{PASS}.md (new)" + ("" if PASS=="1" else f" · the pass-{PP} verdict {M}/reviews/ARCH-REV-{S}-p{PP}.md and its probes {RP}/probes/ARCH-REV-PES-{S}-p{PP}/ · the ARCH-FIX re-runs {RP}/probes/ARCH-FIX-PES-{S}-p{PASS}/ (claims) · the ARCH-FIX packet {PK}/ARCH-FIX-{S}-p{PASS}.md"))
charges=f"""
### Charges for THIS node (numbered; answer each or write UNVERIFIED)
1. Skills as markdown (COMMON §1): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion`; `SKILLS LOADED:` names exactly the files you read. Read every comment on {T}, then CLAIM (seat, node, start `date`, grok session id + `chat_history.jsonl` path, cwd HEAD + dirty count, `comments read through: 1`).
2. Review the ARCH packet FIRST ({PK}/ARCH-{S}.md): a packet defect is a finding against the orchestrator.
3. Re-run EVERY cluster command of PLAN.md §3 at base yourself, from a `.sh` under `{RP}/probes/{SEAT}/` (new), captured (`LOG=<abs> zsh {R}/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh …` / `run-suites.sh`); a disagreement with the ARCH seat's recorded verdict is a finding; BROKEN at base is a B unless the plan creates what is missing.
4. Trace both ways with your own parser: every SPEC requirement → a step, every step → a requirement; a step a stranger cannot mark done, a done-criterion that needs a later step or a later cluster, a rejection oracle without its guard and the guards that fire first, a production step with no named RED-when-omitted case, an unlabelled JSON example, a raw count used as an oracle — each a finding with file:line.
5. Rows V-1..V-{VMAX} honoured ({OWNV}); the four RED-at-base suites pinned; no real key; no listener on the NO-TOUCH ports (COMMON §6); a fixture endpoint planned on a port above 4400.
6. Artifact {M}/reviews/ARCH-REV-{S}-p{PASS}.md (new): findings B/N with file:line and the concrete failure; `VERDICT PASS|REWORK|BLOCKED / CONFIDENCE / STRONGEST COUNTER`; `## V-ROW` last (NEW rows or `None.`); `## UNVERIFIED`.
7. NEVER: edit anything under review · git writes · product files · `pnpm install` · `hermes kanban boards switch`.
"""
if PASS!="1":
    AFT=ids[f"AF{n}"] if PASS=="2" else ids[f"AF{n}P{PASS}"]
    charges+=f"""8. **SCOPE of this pass (pass {PASS} of 3):** the closures of pass {PP} — every finding the ARCH-FIX node was assigned (its READY comment by ARCH-FIX-PES-{S}-p{PASS} on {AFT} lists them, quoted AS CLAIMS) re-walked against the revised PLAN.md; the pass-{PP} artifact {M}/reviews/ARCH-REV-{S}-p{PP}.md and its probes {RP}/probes/ARCH-REV-PES-{S}-p{PP}/ are inputs: replay every pass-{PP} probe that touched a closed finding in YOUR probe dir (never edit the earlier one: a probe that deletes or rewrites files beside itself — the pass-2 `closure.sh` `rm -rf`s its own `scratch/states` — is COPIED into your dir and run from there) and quote its result on the revision; the ARCH-FIX seat's re-runs {RP}/probes/ARCH-FIX-PES-{S}-p{PASS}/ are claims to refute, not evidence. A step the revision changed that the pass-{PP} findings did not name is in scope (a fix can break a neighbour); a finding outside the closures and the changed steps is named, not re-reviewed. A REWORK at pass 3 is a V row — write it as a `## V-ROW` block with the smallest yes/no, not as a fourth pass.
"""
s=s.replace("\n## 4. Handoff", charges+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/ARCH-REV-{S}-p{PASS}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); leftover {left}")
