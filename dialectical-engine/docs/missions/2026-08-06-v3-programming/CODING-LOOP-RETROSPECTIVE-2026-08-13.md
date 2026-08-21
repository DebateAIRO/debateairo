# Coding-loop retrospective — the DR-153 run (2026-08-11 → 08-13)

Scope: the Codex-codes / dual-diamond (Opus 5 + Grok) / Fable-orchestrates
loop, from EXEC-01 through PROV-01 rev2. 18 tickets closed by dual greenlight,
~45 diamond verdicts, ~25 blocking findings caught pre-ship, suite 385 → 529
tests. Every claim below is traceable to a board comment, verdict file, or
ledger row.

---

## WHAT WENT WELL

### W1 · The dual diamond caught what would have shipped
~25 blocking findings, none reached V unfixed. The heaviest: internal DB
faults dressed as client errors (POL-01); a crash that killed the whole stack
three times, plus its sibling one layer down found *before* it fired
(POL-02/03); a loading screen fabricating 40% progress on V's own gate page
(LOAD-01); a debate engine whose disclosure layer was silently one-house
(PANEL-01); a mono-maker run serving 100% unjudged opinions via the
production bootstrap (XREV-01); a form defaulting from a table with zero
production writers, live-broken (UX-01); cost tables that would have refused
real runs (DEPTH-01).

### W2 · Split verdicts were information, not noise
Every split had the same anatomy: the approving lens read the code; the
blocking lens **ran it** — against the live stack, the rendered DOM, real
Postgres, or by mutating the files. The lenses were genuinely complementary
(Grok strongest on production-path causality; Opus on mutation testing and
live rendering). The orchestrator's rule — reproduce the disputed claim,
never pick a favourite — resolved all five splits by evidence.

### W3 · Mutation-proof review became the culture, then propagated to coders
"State which mutation each assertion kills" started as a review demand and by
mid-run workers were pre-emptively mutation-proving their own tests (UI-02c
deleted its own guard to watch the test fail before submitting). Reviewer
lenses ran full mutation ledgers with md5-verified restores; one
property-tested a formatter over two million random doubles.

### W4 · Same-session rework was lossless and fast
`codex exec resume` on the recorded session id kept every rev's context.
Typical rework turnaround: 5–15 minutes. Reproduce-first held — each rev's
RED demonstrated the reviewer's exact finding before the fix (DR-151's live
incident literally became a test case).

### W5 · Typed-loud-failure discipline paid off operationally
V typed Agent Count 3: the M-guard refused with a named code, recorded FAILED,
spent zero calls. The envelope refuses before spend (measured 0 vs 33 charged
attempts). The seed-freshness guard stopped stale-register serves. When the
engine said no, it said why.

### W6 · Independent orchestrator gate runs caught claimed-green gates
The worker's "root typecheck green" claim was false once (vitest does not
typecheck; 411 passing tests hid two TS errors). Caught only because the
orchestrator re-ran every gate on every handoff. The worker corrected its own
log honestly when confronted — and the fleet's honesty stayed good under
challenge throughout.

### W7 · Durable artifacts made every pause/restart lossless
Board comments as the spec trail, goal packets off argv, progress logs,
session ids recorded at claim, verdicts as files. V stopped the loop three
times; nothing was ever lost, including a kill mid-rev (the work had already
landed).

### W8 · Workers refused to fake evidence
UI-02a ended BLOCKED rather than claim browser evidence it couldn't capture.
DEPTH-01 refused to pick V's numbers. PANEL-01's worker stopped at the
serve-shape question instead of deciding V's values. The DR-115 culture held
under deadline pressure.

---

## WHAT WENT WRONG

### F1 · THE defect class: checks that cannot fail for their believed reason
The single most expensive pattern — roughly **15 instances**, costing most
rework revisions: source-text assertions surviving behaviour drift;
assertions satisfiable by an import line; predicate-only tests while the
wiring drifts; guards whose only witness is themselves (a length check on a
one-element literal — structurally dead); IEEE-754-luck assertions;
timezone-locked tests; cardinality pins that a hardcoded value satisfies.
Six tickets needed 2–4 revisions each almost entirely because of this class.

### F2 · Dead runners, three times
Tests that exist but that no gate executes: the v2-ui `test` script pointing
at a nonexistent directory (31KB of tests, flagged in four reviews before
being owned); LOAD-01's `.tsx` render config outside the root include; the
same near-miss again one ticket later. "A test exists" and "a gate runs it"
are different claims, and nothing enforced the second.

### F3 · The fixture/live gap
Every split verdict traced to it. UX-01's default read from a table with
zero production writers — perfect in fixtures, Start-disabled live. POL-02's
crash lived only on the production Hatchet path. LOAD-01's terminal pipe
cited a catch that exists only in the acceptance harness. Reviews that did
not touch the live world approved things the live world broke.

### F4 · Orchestrator own-goals (mine, each recorded when made)
- Over-broad reaper pattern (`codex exec`) killed a live review lens and
  nearly a live ceremony maker call; the launch guard false-positived on the
  ceremony's own judge subprocess.
- A blunt `pkill` corrupted embedded Postgres mid-checkpoint (one wasted
  ceremony + recovery).
- Three concurrent `codex exec resume` calls on one session wedged it (the
  origin of the concurrency guard).
- Dispatched workers against goal-packet files I had not written — four
  times — until the launcher gained an existence check.
- Misread "REFUSING: seat busy" as a successful launch once (rev3 "running"
  that never started).
- Watchers with predicates that could not fail: a shell NUL test that tests
  nothing; status-field watches when the progress marker was the truth.
- The six-hour night stall: pure event-driven waiting with no self-wake left
  a finished handoff unconfirmed all night.
- NUL bytes propagated through MY OWN directive document while ordering
  their removal.

### F5 · Shared-tree races
Grok lenses mutated the shared working tree twice despite instructions
(DR-163 was minted mid-run); an implementer compiled mutated states into the
live gate server during a review window; concurrent-lane churn contaminated
one review's baseline. Root cause: eight-plus tickets of work lived
uncommitted in ONE working tree for days — no commits, no worktrees, no
recovery floor under any race.

### F6 · The reporting layer lapsed (V's own finding)
No per-ticket loop reports, no per-agent token tables, no agent self-reports,
no V DECISIONS PACKET assembly. The decision/verdict trail was strong; the
protocol's §6 reporting fashion was not followed. Partially backfillable;
self-reports of dead sessions are lost.

### F7 · Review latency dominated wall-clock
Coding: 5–15 min per rev. Diamonds: 20–40 min per lens, serialized coder +
confirmation rounds on top. With one coder seat and multi-rev tickets, V
looked at the board twice and saw "nothing being coded." Throughput was
bounded by review, not by code.

### F8 · Stack lifecycle friction was V-visible
The standing services repeatedly ran older code than the tree (INVALID_
RESPONSE, 404s V personally hit); every contract-hash change forced a fresh
database (wiping V's own debates, backed up but gone from the UI); every
ceremony restart cost ~6–24 real model calls; a stale browser tab was a
stack-killer until POL-02. Version skew had no detector — only symptoms.

### F9 · Zombie sessions
The protocol's self-exit guard (DR-123-op) repeatedly failed to fire; idle
pollers 2–6 hours old blocked launches and confused liveness reads until the
reaper existed — and the reaper itself caused F4's first item.

---

## HOW TO IMPROVE THE LOOP (proposals for V's protocol revision)

### P1 · Make the mutation ledger a handoff REQUIREMENT (kills F1)
Every load-bearing assertion ships with the named mutation it kills; the
confirming lens re-runs the ledger. This ended F1 wherever it was applied —
make it law, not culture.

### P2 · "A gate runs it" needs proof (kills F2)
Any handoff adding test files must paste `vitest list` (or equivalent)
showing collection by the ENFORCED suite, plus the manifest-completeness
pattern for sidecar runners. One line of proof; three dead runners' worth of
savings.

### P3 · Live verification is a review-packet constant (kills F3)
Every packet names what must be verified against the RUNNING system (or the
production composition root), not fixtures alone. Where live isn't possible,
the packet says so and the verdict discloses it.

### P4 · Worktrees per seat — actually use the spine's own law (kills F5)
The heartbeat spine already prescribes worktrees; this run never used them.
Give the coder seat its own worktree; keep mutating lenses in clones
(DR-163); merge on dual-greenlight. Eliminates every shared-tree race class
at the cost of a merge step.

### P5 · A commit floor (V's law to change — proposal only)
Days of work lived uncommitted with no recovery point. Proposal: local
micro-commits at each dual-greenlit ticket close (push stays V-gated,
V-personal). Gives races and corruption a floor; costs nothing V controls
today. The tests/render-plus-vitest.config coupling bug class disappears.

### P6 · Supervise the supervisor (kills F4's stall + F9)
- Orchestrator self-wake on a timer during autonomous runs (the 6-hour stall
  was pure event-starvation).
- Worker sessions get a hard idle-exit (the DR-123-op guard enforced by the
  launcher: kill after N minutes past handoff).
- Launcher preconditions (packet exists, seat pattern exact-match) — landed
  this run; keep them.

### P7 · Generate the reports at close, don't remember them (kills F6)
The ticket-close step emits the loop report skeleton (revisions, findings
counts, wall-clock, spend) and captures token figures from session footers
mechanically. Self-reports become part of the worker's DONE-WHEN.

### P8 · Cut review latency without cutting rigor (mitigates F7)
Adopted mid-run and worth keeping: finder-confirms-own-finding for rework
deltas; reviewers overlapping the next ticket's coding when files are
disjoint. Worth V's ruling: a single-lens + orchestrator-gates fast path for
TESTS-ONLY tickets (the second lens added little on those); and/or a second
coder seat once worktrees (P4) make it safe.

### P9 · Stack lifecycle automation (kills F8)
One "restart the stack" script: graceful INT → checkpoint wait → optional
reseed-with-backup → ceremony → health probe. A version-skew detector (API
reports its build hash; the UI compares) turning silent skew into a banner.
Never a raw pkill near Postgres.

### P10 · One source of truth per ticket (hygiene)
Packet and board body drifted twice. Generate the board body from the packet
file (or vice versa); V-steer amendments continue as board comments the
worker must re-scan — that mechanism worked every time it was used.

---

## The one-line summary

**The loop's strength was that nothing shipped on trust; its cost was that
trust-verification was serialized and hand-carried.** The fixes are mostly
mechanical: prove tests run, prove claims live, isolate writers, commit a
floor, automate the reports, and let the paranoia overlap instead of queue.

---

## V's ratification — 2026-08-13 (DR-167..DR-171)

All ten proposals APPROVED, exception P6, which V rejected as designed ("a
healthier way to wake the orchestrator... that does not require another
orchestrator") and replaced with DR-168: **dependency lanes** (every ticket
points to its previous and next ticket; DONE's next-pointer is the dispatch
route) plus **worker-completion notification** — amended same day by
DR-168-A after V weighed both mechanisms: workers launch DIRECTLY as the
orchestrator's harness-tracked background processes (the worker's own exit,
finish or crash, is the wake; progress is a direct read), and V's visible
windows become `tail -f` VIEWERS (`logs/open-viewer.sh`) decoupled from the
processes, so closing a window kills nothing. The paired-watcher design was
retired before ever being built.

Three further laws minted in the same ruling:
- **DR-169** — DONE means work-done, not V-verified: dual-greenlit tickets
  move to DONE immediately; V verifies at end-of-process; defects become
  fresh [bug] tickets. (Applied same day: UI-01 → done.)
- **DR-170** — terminal lifecycle: a finished terminal is closed at once;
  only question-bearing windows the orchestrator can point to stay open.
- **DR-171** — architecture-consult: architecture-confounding blockers fire
  one Opus architect (reads the docs, briefed, plans) whose plan GROK must
  authorize before it binds.

The binding text lives in CODING-LOOP-PROTOCOL.md §"v2 amendments".
