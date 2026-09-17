FULLY DONE — opus-blind (T1) self-report · mission 2026-08-31-algorithm-correctness

# Self-report — opus-blind (T1), blind reconstruction lens

Answering the router §3 question as a case file: cause, price, near-misses, dead ends, and
exactly where the packet fought me.

## 1. The one finding that nearly did not happen

**Cause.** The mission's central truth (M8: every arrow contributes null, so every node's strength
collapses to its own τ) is *not visible from either of the two files that contain it*. It is the
join of `apps/runner/src/index.ts:1689-1690` (`strength: null, magnitudeStatus: "UNKNOWN"` on every
edge write) and `packages/propagation/src/index.ts:399` (`magnitudeStatus === "UNKNOWN"` ⇒
contribution null). They are 1,300 lines apart in different packages, and each reads as correct,
even careful, in isolation.

**Near-miss.** I read `packages/propagation` first and had already formed the sentence "a complete
argumentation calculus with cluster collapse, undercut reduction, lifts and rival-operator
sensitivity". That sentence is true about the code and false about the system. I only caught it
because I ran a *writer* sweep — `grep "magnitudeStatus:"` across `apps/` and `packages/` — rather
than continuing to read. If I had budgeted my remaining time on reading the two 2,000-line files
end to end instead, I would have filed a confident, well-cited, wrong report.

**Price of the correction:** about four tool calls. **Price if missed:** the entire report's
headline, and every downstream conclusion about scoring.

**Transferable rule:** for any state machine, the cheap decisive question is *who writes this
value*, not *who reads it*. Reader sweeps find architecture; writer sweeps find lies. Three of my
seven headline findings (`MEASURED` never written, `CONTESTED`/`UNSUPPORTED` never written, `RAN`
never surviving) came from one writer-sweep pattern in under ten minutes.

## 2. What repeatedly cost tokens

**(a) One 1,300-line method — the dominant cost of this mission.**
`WalkingSkeletonRunner.execute` runs from `apps/runner/src/index.ts:1223` to `:2530`. It has no
seams: the cooldown closure, the author closure, panel reconciliation, expansion, propagation,
condition-mark assembly, the serve chain and terminal drain are all one lexical scope sharing
mutable locals (`finalSegments`, `conditionMarkRecords`, `result`, `compositionAttempt`). I had to
pull ~1,100 lines of it into context in four reads, and I could not skip any chunk, because a
variable defined at :2097 is mutated at :2226 and read at :2479. That single method is the largest
token line item in my run, and it is a **code-structure cost, not a protocol cost** — no packet
wording could have made it cheaper.

*Upgrade:* extracting the five phases behind named functions with explicit inputs/outputs would let
any future lens read one phase and stop. It would also make X10 (`selectionScore` computed and
never compared) and X4 (`askContract` written and never read) visible at a glance, because the data
flow would be in signatures instead of in closure scope.

**(b) The orientation map omitted the package most able to refute me.**
The packet named ten packages; the tree has twenty-two. Among the twelve unnamed is
`packages/evaluator` at 3,652 lines — the single most plausible home for a writer of measured edge
magnitudes, i.e. the one place that could overturn M8. I left it as OPEN QUESTIONS Q6 rather than
burn the remaining budget, which is the honest outcome, but it means my strongest finding carries a
caveat that a two-line change to the packet would have removed.

*Upgrade:* an orientation map should be generated, not written — `find packages -maxdepth 1` with
line counts costs nothing and cannot go stale.

**(c) Endpoint discovery by guesswork.** I grepped `/ask` first; the route is `/v1/asks`
(`packages/contract/src/client.ts:504`). Two wasted calls. Trivial in isolation, but it is the
generic shape: **the packet gave me directories, and what I needed was the entry symbol.** "Start
at `AskApplication.submit`" would have saved more than the directory list did.

## 3. Dead ends, so nobody re-derives them

- **`RunRepository` arity.** The runner constructs it with one argument (`apps/runner/src/main.ts:64`)
  while the API uses two (`apps/api/src/index.ts:1213`). This looks like a wiring defect. It is not:
  `provisionPool: Pool = pool` is defaulted (`packages/db/src/index.ts:1018-1021`). Do not re-open.
- **`risk_tier` "never read".** My first grep showed zero reads in `apps/`+`packages/` for
  `effective_risk_tier`. That is true of that column name but *not* of the concept: `risk_tier` is
  read for display at `packages/serve/src/index.ts:1410`. I nearly filed "risk tier is never read"
  as certain. The correct, narrower claim — the *runner* never sees it, so it changes no behaviour
  below admission — is what I filed. Column-name greps under-report; check the schema mapping
  (`packages/db/src/schema.ts:116-117`) before claiming a field is unread.
- **`tools/orphan-audit` is not a finding.** It legitimately references the dead symbols; it is the
  detector, not the disease. It cost me one call to rule out.

## 4. Where this packet was unclear — exact locations

**(a) §0 protocol vs the deliverable: a genuine method conflict.** §0 sends me to
`heartbeat-reviewer`, whose §2 is titled "Probe, never read" and whose §4 requires a verdict of
PASS / REWORK / BLOCKED. The packet's §2 requires reconstruction "from code alone" and its §3
skeleton has **no VERDICT section at all**; §4's stopping rule is about tracing, not probing. These
cannot both be satisfied. I resolved it by treating the packet as controlling on method (static
reconstruction) and the reviewer contract as controlling on posture (refute-first, state what I did
*not* verify, end with falsifiable predictions) — and I folded the predictions paragraph into
OPEN QUESTIONS rather than add a heading the skeleton forbids. That resolution took real deliberation
and another lens may have resolved it differently, which makes cross-lens comparison noisier.
*Fix:* when a packet dispatches a reading lens, say so explicitly — "you are a reviewer in posture,
not in method; no probe is expected; no PASS/REWORK verdict is owed."

**(b) The marker vocabulary has no entry for this seat.** §0 requires CLAIM / HEARTBEAT / BLOCKED /
FULLY DONE as the first line of the findings file, but a reading lens produces neither a passing
review nor a rework list, and §6 forbids me from saying anything but `FILED:` + ABSTRACT. I used
`FULLY DONE`. If the orchestrator expected `READY FOR HERMES STAGE REVIEW`, that is a silent
mismatch neither of us can detect.

**(c) Write law vs. working method.** "Exactly two files" (§1) means no scratch file for a
1,300-line trace. I held the outline in context instead, which is more expensive than a scratchpad
note and more fragile. The intent — do not litter the worktree, do not touch the board — is right;
the wording forbids more than it needs to.
*Fix:* "exactly two files **as deliverables**; scratch files under your scratchpad directory are
unrestricted."

**(d) §4's 90-minute stopping rule has no companion budget.** Wall-clock is not the binding
constraint for a reading lens on a 60k-line tree; context is. I self-managed by reading targeted
ranges and using greps as the primary instrument, but the packet never said which resource to
optimise. *Fix:* state the real budget — "read no more than ~N lines; prefer greps; a long OPEN
QUESTIONS section is the expected shape."

## 5. How to make this closer to a one-prompt machine

1. **Ship the orphan audit as a gate, not a tool.** `tools/orphan-audit` already exists and already
   knows the dead symbols. Run it in CI with a required, dated justification per allowlist entry.
   Findings X5, X6 and X7 (the entire multi-judge apparatus, the value overlay, review catch-up —
   all reachable only from tests) would then be a standing report instead of a discovery, and the
   next lens spends its budget on something new.
2. **Add a reachability lint for closed vocabularies.** Every member of a declared enum should have
   either a production writer or an explicit `@unreachable(reason)` annotation. Four separate
   findings — `MEASURED`, `RAN`, `CONTESTED`, `UNSUPPORTED` — are one bug class, and the class is
   mechanically checkable. This is the highest-leverage single upgrade I found.
3. **Add a "stored and never read" check for persisted columns.** `core.run.ask_contract` carries
   the asker's own steering text, labelled "logged verbatim" in the UI, and nothing reads it back
   (`packages/db/src/index.ts:1461-1463`). A schema-to-SELECT diff would catch this and the
   `criticUnavailableCap` case together.
4. **Give every lens the entry symbol, not the directory.** One line — "trace from
   `PostgresAskApplication.submit` to `ServeRepository.persist`" — is worth more than the whole
   orientation map, and it makes independent lenses comparable because they start at the same door.
5. **Keep the blind-lens pattern; it worked.** The value of this seat was entirely in not having
   read anyone else's account of this pipeline. The predictions paragraph is cheap insurance that
   blindness held, and it cost me under five minutes to write.

## 6. What I did not do, plainly

No probe was run: no build, no test suite, no database, no process. Every claim in the findings
file is a static citation, and the four claims that need runtime to settle are named in OPEN
QUESTIONS Q1–Q2 and Q4–Q6. I read no board input, no other seat's report, and nothing outside my
worktree except the packet. I wrote exactly two files, both under
`.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/` inside my worktree. I made no
code edit and ran no git mutation — the only git commands issued were `rev-parse`, `branch
--show-current` and `status --porcelain`, all read-only.
