#!/usr/bin/env python3
"""gen-rev-packet.py <S> <pass> <lens> <lens-worktree-abs> <freeze-prev> <freeze-latest> — packets/REV-<S>-p<pass>-<lens>.md from
templates/REV.md for mission provider-env-selection (grok-4.7 blind lens in its OWN detached worktree at the slice head).
lens ∈ correctness-tests | security-data-safety. The package README, the slice head and every anchor are read at write time."""
import sys,re,pathlib,subprocess
S,PASS,LENS,WT,FP,FL=sys.argv[1:7]
R="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"; M=f"{R}/docs/missions/provider-env-selection"; PK=f"{R}/.hermes/planning/provider-env-selection/packets"; RP=f"{R}/.hermes/reports/provider-env-selection"
ids=dict(l.split("=") for l in pathlib.Path(RP+"/logs/board-ids.env").read_text().split())
n=S[1:].lstrip("0"); key={"correctness-tests":f"RV{n}A","security-data-safety":f"RV{n}B"}[LENS]
SEAT=f"REV-PES-{S}-p{PASS}-{LENS}"; T=ids[key] if PASS=="1" else ids[f"{key}P{PASS}"]; ST=ids[S]
PKG=f"{RP}/review-packages/{S}-p{PASS}"; readme=pathlib.Path(PKG+"/README.md").read_text().splitlines()
head=re.search(r"slice head: `([0-9a-f]+)`",readme[2]).group(1)
wt_head=subprocess.run(["git","-C",WT,"rev-parse","--short","HEAD"],capture_output=True,text=True).stdout.strip()
if wt_head!=head: raise SystemExit(f"lens worktree {WT} is at {wt_head}, package head is {head}")
specs=sorted(pathlib.Path(f"{M}/slices/{S}").glob("SPEC-v*.md"), key=lambda q:int(q.stem.split("-v")[1])); SPECF=specs[-1].name if specs else "SPEC.md"
sp=pathlib.Path(f"{M}/slices/{S}/{SPECF}").read_text().splitlines()
def h(lines,needle,start=1):
    for i in range(start,len(lines)+1):
        if needle in lines[i-1]: return i
    raise SystemExit(f"ANCHOR MISSING {needle!r}")
a5=h(sp,"## 5. Acceptance"); a6=h(sp,"## 6.",a5+1); r3=h(sp,"## 3. Requirements"); r4=h(sp,"## 4. Verification")
oracle=f"the SPEC of record {M}/slices/{S}/{SPECF} — §5 acceptance :{a5}-{a6-1} (run end to end, every grep's answer compared to the base answers in {RP}/probes/ARCH-PES-{S}/accept-base.log), requirements :{r3}-{r4-1}, verification :{r4}-{a5-1} · the PLAN {M}/slices/{S}/PLAN.md §3 cluster table and §4 verification list · the V rows {M}/V-DECISIONS-PACKET.md (each default binds)"
BUILDPK=", ".join(str(q) for q in sorted(pathlib.Path(PK).glob(f"BUILD-{S}-C*.md"))+sorted(pathlib.Path(PK).glob(f"FIX-{S}-p*.md")))
s=pathlib.Path("/Users/vladmihaimiron/.claude/skills/heartbeat-orchestrator/templates/REV.md").read_text()
rep={"__SEAT__":SEAT,"__SLICE__":S,"__LENS__":LENS,"__PASS__":PASS,"__MISSION__":"provider-env-selection","__PACKET_DIR__":PK,"__MODEL__":"grok-4.7","__TRANSPORT__":f"grok -p headless, background (launcher {RP}/logs/launch-{SEAT}.sh (new — written by the orchestrator at dispatch))","__RESUME__":"`grok --resume <id>` in the same cwd",
     "__TICKET__":T,"__SLICE_TICKET__":ST,"__CURSOR__":"the orchestrator's DISPATCHED comment and every comment after it (read them all — superseded or re-dispatched tickets carry more than one)","__LANE__":f"{WT} (YOUR detached worktree at the slice head — no other seat writes there; `git status --porcelain` ends empty)","__BRANCH__":f"detached at {head} (the head of slice/provider-env-selection-{S.lower()})","__BASE__":"`origin/dev` @ 776359c3",
     "__REPORTS__":RP,"__SLICE_HEAD__":head,"__ORACLE__":oracle,"__FREEZE_PAIR__":f"{FP}..{FL}","__MISSION_ROOT__":M,"__SCRATCH__":f"{RP}/probes/{SEAT}/scratch"}
for k,v in rep.items(): s=s.replace(k,v)
_il=[l for l in s.split("\n") if l.startswith("- inputs")][0]
s=s.replace(_il,_il+f" · your own artifact {M}/reviews/REV-{S}-p{PASS}-{LENS}.md (new — written by you, listed so the charges' path is on this line)",1)
if S!="S03": s=s.replace(_il+f" · your own artifact",_il+f" · the intake {M}/00-intake.md §5b (RED-at-base pairs) · your own artifact",1)
common=f"""
### Charges for THIS node (numbered; answer each or write UNVERIFIED) — lens `{LENS}`
1. Skills as markdown (COMMON §1 has the paths): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion`; `SKILLS LOADED:` names exactly the files you read. Read every comment on {T}, then CLAIM (seat, node, start `date`, grok session id + `chat_history.jsonl` path, cwd HEAD (must be {head}) + dirty count, `comments read through: 1`).
2. Review the package FIRST ({PKG}/README.md, `handoffs/*.md`, `frames/*.out`, `diff-stat.txt`, `diff.patch`, `commits.txt`, `listeners.txt`) and the BUILD and FIX packets that produced the code ({BUILDPK}): a packet or package defect is a finding against the orchestrator, numbered like any other.
3. Re-run EVERY cluster command of the PLAN §3 table in YOUR worktree from a `.sh` under `{RP}/probes/{SEAT}/` (new), captured (`LOG=<abs> zsh {R}/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh …`); a disagreement with a handoff's three-run table or with `frames/*-gate.out` is a finding.
"""
if S=="S03" and LENS=="correctness-tests":
    lens_ch=f"""4. Refute every case the slice ADDED to `tests/unit/v9-provider-credential-files.test.ts` (the diff names them): for each, a TEMPORARY mutant of `deploy/vps/README.md` in YOUR worktree that re-introduces the defect the case guards (a code removed from §11's table, a price member in one env form only, the daily-cap sentence restored, a cost number dropped, a known-stale bullet put back) is watched turning the case RED, then restored (`git status --porcelain` empty after every restore); a case no mutant can fail is a B. The widened pin (R3.5) is also tried against a RETYPED list: replace the source-read with the literal codes and show the pin cannot tell — or show it can.
5. Re-run the enumeration `{RP}/probes/ARCH-PES-{S}/enumeration.mjs` (or your own) at the head and compare its 12 codes to §11's table and to the pin's expected set; the guard-order sentence (step C1-3) is checked against the three call sites the plan names (`apps/api/src/main.ts`, `apps/runner/src/main.ts`, `packages/providers/src/index.ts` — the parse → hosted rules → price order); row V-8 (the four run-time spend codes stay OUT of the table) honoured.
6. The acceptance (§5) run end to end at the head, each grep's answer compared to `accept-base.log`; `git diff --stat origin/dev...HEAD -- apps packages` empty AND proved capable of printing; `tests/architecture/vps-deployment-baseline.test.ts` byte-identical to base; `pnpm typecheck` delta per file zero against the baseline; the four RED-at-base suites at their intake pairs; the handoffs' `## PROGRESS records` (R3.3 codes + source lines, R3.5 sweep member by member, R3.7 verdicts, R3.8 proof) checked against the tree — a record that names a line the tree does not have is a finding.
"""
elif S=="S03":
    lens_ch=f"""4. Secrets and paths: `diff.patch` and every added test fixture contain no real credential, no `Bearer <token>` that is not a documented placeholder, no absolute path of a credential file or its `0700` directory, no API key shape (`sk-`, `xai-`, `AIza`, 40+ char base64 runs) — grep the diff and the two changed files; the credential-file contract text (`### The credential-file contract` and the custody bullets) is byte-identical to base (`git diff origin/dev...HEAD -- deploy/vps/README.md` shows no hunk in that section); the sealed v1 row shape and the exact-set invariant are untouched (nothing under `apps/` or `packages/` in the diff).
5. Truth of the refusal table as an operator surface: every code §11's table names EXISTS in the lane's code at a throw site (grep each; an invented or misspelled code is a B), and every code the plan's enumeration yields as a START-UP refusal is in the table (row V-8 keeps the four run-time spend codes out — verify none of the four appears in the table, and that the table's heading still says what it refuses); the worked example's env forms carry no value an operator could paste as a live secret; the paid-probe cost paragraph recommends no value and names `max_tokens` and `probe_freshness_ms` as the SPEC's R3.6 requires.
6. No process, no port, no network: `listeners.txt` compared to your own `lsof` of the NO-TOUCH ports (COMMON §6) at your start and end — identical PIDs; no `pnpm install`; the lane and your worktree end byte-clean; the seats' handoffs claim no listener — a probe log that shows one is a finding.
"""
elif LENS=="correctness-tests":
    lens_ch=f"""4. Refute every case the slice ADDED (the diff names them): for each, a TEMPORARY mutant of the product line it pins, in YOUR worktree — watch it go RED, revert, print `git status --porcelain`; a case no mutant can turn RED is a finding with the mutant named. Every rejection case names its code AND the guards that fire before it (the slice's DECISIONS folds).
5. Re-run every cluster command at the head (compare to the package's `frames/*-gate.out`), every suite the SPEC of record's §4 names at its pair, and the RED-at-base suites at their intake pairs ({M}/00-intake.md §5b); a disagreement with a frame is a finding.
6. The acceptance (SPEC §5) run end to end at the head exactly as V would, each step's answer recorded; `git diff --stat origin/dev...HEAD -- <each path PLAN §5 says is untouched>` empty AND proved capable of printing.
"""
else:
    lens_ch=f"""4. Secrets and paths: `diff.patch` and every added fixture contain no real credential, no `Bearer <token>` that is not the PLAN's documented fake literal, no absolute path of a real credential file, no API key shape (`sk-`, `xai-`, `AIza`, 40+ char base64 runs), no real vendor host — grep the diff; a credential FILE PATH appears only where the SPEC allows it.
5. Hosted-mode truth: every refusal code the diff adds or relies on EXISTS at a throw site in the lane (grep each); hosted mode never reaches a loopback relay or a CLI; the fake endpoint refuses a missing and a wrong `Authorization: Bearer`; any database the slice touches is embedded, OS-assigned, stopped on every exit, and never :55432.
6. Processes and ports: `listeners.txt` compared to your own `lsof` of the NO-TOUCH ports (COMMON §6) at your start and end — identical PIDs; ports the PLAN assigns to fixtures free before and after; no `pnpm install`; your worktree ends byte-clean.
"""
tail=f"""7. Artifact {M}/reviews/REV-{S}-p{PASS}-{LENS}.md (new) — findings B/N with file:line and the concrete failure; `VERDICT PASS|REWORK|BLOCKED / CONFIDENCE / STRONGEST COUNTER` for THIS lens; one paragraph of predictions about the other lens; `## V-ROW` last (NEW rows or `None.`); `## UNVERIFIED`.
8. NEVER: a change to the slice's files that outlives your session · git writes · `pnpm install` · a listener on a NO-TOUCH port · a real key · another lens's output · `hermes kanban boards switch`.
"""
s=s.replace("\n## 4. Handoff", common+lens_ch+tail+"\n## 4. Handoff",1)
left=sorted(set(re.findall(r"__[A-Z_]+__",s)))
out=pathlib.Path(f"{PK}/REV-{S}-p{PASS}-{LENS}.md"); out.write_text(s); print(f"wrote {out} ({len(s.splitlines())} lines); head {head}; leftover {left}")
