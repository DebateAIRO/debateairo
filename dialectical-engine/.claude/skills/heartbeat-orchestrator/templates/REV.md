# PACKET __SEAT__ — REV(__SLICE__) lens __LENS__ (blind slice review, pass __PASS__) · mission `__MISSION__`

Read FIRST, in full: this packet · then __PACKET_DIR__/COMMON.md · then ONLY the files they name, at the lines they name — plus a named skill's own `references/*.md` when that skill sends you there, each listed in your `SKILLS LOADED` line. The spine (`docs/agent-protocols/…`) is the authority for a DISPUTE, not floor reading — open it only for a section a packet or a conflict names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: REV(__SLICE__) lens __LENS__ (blind slice review, pass __PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the review package __REPORTS__/review-packages/__SLICE__-p__PASS__/ (pass 1: the diff vs base, every cluster command + three-run table, the cluster map, the acceptance oracle, the dev-stack recipe; a later pass: the diff since the previous head, the FIX handoffs, the scope, the orchestrator's re-verification, and a pointer to the pass-1 package for the rest) · the slice head __SLICE_HEAD__ checked out READ-ONLY in your detached worktree __LANE__ · __ORACLE__ · the freeze commits (COMMON §6 row `freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/__MISSION__` is exactly what the seat under review changed)
- output (the ONE artifact this node produces): __MISSION_ROOT__/reviews/REV-__SLICE__-p__PASS__-__LENS__.md (new) + ONE verdict comment on __TICKET__
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/reviews/REV-__SLICE__-p__PASS__-__LENS__.md (new) · probes under __SCRATCH__ (new) · __REPORTS__/probes/ (new, promoted probes only — runnable from ANY worktree: the root from `$WORKTREE` or argv, never hard-coded; logs and evidence text sit beside them, not as probes) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular any change to the slice's files that outlives your session (a temporary mutant in YOUR worktree, restored before you hand off, is the refutation duty, not a write), every other lens's output, git writes of any kind
- verification: your OWN fixtures for the whole slice, both modes on UI · every cluster command re-run by you · one mount of every surface this slice shares with another slice or with the app shell · on UI: rendered DOM with the real compiled CSS measured against the oracle's artboards (geometry, colour, both modes) — a scoped pass's README may narrow this line per lens, and wins where it narrows

## 3. The work
Review the packet FIRST (a packet defect is a finding against the orchestrator). Your lens is __LENS__ and only that lens; probe, never read — build from the CLAIM, exceed the author's parameters, refute. Number findings B/N with file:line and the concrete failure; every N gets a ticket through the orchestrator. Verdict PASS / REWORK / BLOCKED for THIS lens with the pass number; the orchestrator unions the lenses. End with one paragraph of predictions about the other lenses. A REWORK at pass 3 is a V row. A row for V (`V-ROW: NEW` block) goes in the LAST section of your artifact — the orchestrator transcribes and numbers it; you never write DECISIONS.md.

## 4. Handoff
`PASS | REWORK | BLOCKED` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
