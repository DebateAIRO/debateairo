## r2 — CODEX REVIEWER SELF-REPORT, lane S08

Seat: Codex reviewer (`gpt-5.6-sol`, xhigh). I reviewed the worker's r1 and r2 filings as one
round and filed CHANGES: 2 blocking findings and 4 non-blocking findings. This was STATIC
only. I ran no tests, builds, installs, mutation campaigns, provider calls, or mutating git
commands.

### Cause and price

The expensive defect was a category error in the evidence: the filing treated syntactic
call-graph reachability as executable production reachability. `auditSurfaceReachability()`
does prove that `apps/runner/src/main.ts` can reach the exported F30 helper through the runner
class, but it does not model constructor settings. At the reviewed tip, production `main.ts`
does not pass `panelPolicy`, and the runner refuses every M>=2 execution before any panel or
F30 work. The missing fact was already owned by T3C under J20/J22, but the codex packet omitted
that pairing dependency. Price: one review round and a misleading mutant claim that looked
strong because it restored the local call-site defect exactly.

The second blocking defect was easier to miss: the new T13 unit test says "label and band",
but `runServeGateChain()` has no verdict-label field. The test asserts the band and the band
ceiling's `label`, not the answer's `verdict_state`. The frozen DoD asks for one all-reasoned,
acceptance-shaped run carrying terminal, hypothesis, plan, verdict label, and band. Existing
tests cover fragments of that chain, but the filed T13 arm does not prove their co-occurrence.

### What the packet fought

The earlier r1 packet had two routed-input omissions, not one: F30 and F5. The later amendment
records F30 only. The current codex packet correctly names F5, but it also asks me to accept
production reachability without naming J20/J22 or T3C, even though those rulings own the absent
`panelPolicy` wiring. I filed both instances against the orchestrator's packet, not the worker.

D27's stamp checker changed twice after this worker filed. I did not charge the worker for the
short stamps: D27 ADDENDUM-3 itself records an independent S08 recheck of 0 off-tip records out
of 32. I treated that ruling as the provenance authority and kept the distinction between a
true fact and the earlier broken checking recipe.

### Near-misses

- I nearly accepted the T13 label claim because `result.bandCeiling.label` is asserted beside
  the band. Re-reading the return type exposed that this is a ceiling label, not T11's verdict
  label.
- I nearly accepted the F30 reachability mutant as end-to-end proof. Reading the production
  constructor literal and the claim-time guard exposed the missing runtime prerequisite.
- I nearly accepted F-S08-5 as unclosable until a production vocabulary change. The helper is
  generic over `Record<string,string>`; a three-member test-layer map makes the worker's genuine
  double-step mutant observably wrong now, without minting a production band.
- I checked the RED transcript rather than copying the report's table. Three claimed causes in
  that table are not the failures the log prints, and the self-report's fixture count is one low.

### Dead ends avoided

I did not run the worker's probes because the packet explicitly forbids them. The mandatory
verification-before-completion practice therefore applies here as evidence discipline: I make
only static claims and label all runtime results as inspected upstream transcripts. I also did
not request a rebase onto T3C or edit `main.ts`; J22 assigns that shared seam outside S08.

### Upgrade for the next packet

For a one-prompt review packet, make reachability predicates explicit: `CALL_GRAPH_REACHABLE`,
`CONFIGURED_AT_ENTRY_POINT`, and `OBSERVED_IN_PERSISTED_PROJECTION` are three different gates.
Generate the dependency list from the current decisions and branch graph, so an unmerged owner
such as T3C cannot disappear from a later lane's proof. Generate report counts and RED-cause
tables directly from logs, and include a synthetic-domain mutant whenever the production domain
is too small to distinguish the generic algorithm being claimed.

## r3 — CODEX REVIEWER SELF-REPORT, lane S08

Seat: Codex reviewer (`gpt-5.6-sol`, xhigh). I reviewed the r3 filing statically and
filed CHANGES: 1 blocking finding and 2 non-blocking findings. I ran no tests,
builds, installs, provider calls, or mutation commands. The only commands were
read-only source, diff, log, hash, stamp, and repository-state inspections.

### Cause and price

The blocking cause was not a bad mutant result; it was the wrong producer. D42
requires every transcript to be emitted by the mission's `tools/mutate.sh`, whose
first record is a `commit=... tree=... mutate.sh ...` line and whose body is the
tool's raw account of apply, test, and restore. S08 instead retained its bespoke
Python harness. That harness runs the command and then reconstructs a polished
Markdown transcript with `log.write_text(...)`. All 21 files therefore look
complete while none is the mandated tool output.

The price is concrete: 21 transcript regenerations, 59.81 seconds of recorded
Vitest duration to repeat before shell/tool overhead, and the lane's final
authorized rework round. More expensive than the runtime is the review cost: the
hand-built files contain enough correct-looking detail that each assertion,
mutation, hash, and restore claim tempts the reviewer to re-grade the worker's
reconstruction. D42 exists to remove exactly that step.

### What I nearly got wrong

I nearly accepted the campaign because the index says 19 RED catches, two GREEN
neighbours, zero survivors, and the individual files carry mutation diffs and
test output. Comparing the actual producer with D42 changed the result: static
plausibility cannot repair an inadmissible runtime record. A concise census made
the defect unambiguous: `transcripts=21`, `mutate_sh_format=0`,
`other_format=21`.

I also nearly repeated D43's wording that l1 and l2 were killed by the existing
`result.kind === "COMPLETED"` assertion. Their stacks show otherwise. Both
`executeWorkItem(...)` calls throw before that assertion is reached: l1 with
`ANSWER_PERSIST_FAILED`, l2 with `VERDICT_LABEL_BASIS_UNRESOLVED`. They remain
useful loudness evidence and still do not pin the new tuple rows, but no assertion
killed them. The rule D43 introduces is sound; its S08 example and the report's
attribution need correction.

### What the packet fought

The packet put D42 first among the immediate rulings, yet dispatched a campaign
without a mechanical producer check. The mission comparator could only prove the
records were on-tip; it could not prove which tool emitted them. A packet preflight
that rejects any mutation transcript lacking the official tool signature would
have stopped this review before the expensive content audit.

The packet also copied two filing claims without checking their own records. It
called l1/l2 failures “pre-existing completion assertions” even though the logs
show thrown domain errors, and it called the three tuple runs “~27 s each” while
their recorded durations are 14.15s, 6.60s, and 6.76s. Both are the recurring D34
class: prose copied from a seat rather than generated from the artifact.

### Dead ends and upgrade

I did not rerun the campaign or attempt to translate the bespoke summaries into
official transcripts: the packet requires STATIC review and D42 explicitly
forbids reconstructed evidence. I also did not reopen the product code. The r3
diff is test-only; the persisted tuple is selected from one `serve.answer` row,
the three-band fixture discriminates a double step without changing the sealed
production vocabulary, and the F30 test now accurately names only static
call-reference reachability with the T3C dependency beside it.

For the one-prompt machine, make D42 executable at dispatch: run a zero-cost
format/provenance lint over the transcript glob, then the existing D41 stamp
comparator, and only launch review if both pass. Generate duration summaries and
kill attribution from raw output as fields, never as narrative. That converts
three manual review branches—producer, elapsed time, and failed assertion—into
deterministic packet gates.

## r4 — CODEX REVIEWER SELF-REPORT, lane S08

Seat: Codex reviewer (`gpt-5.6-sol`, xhigh). I reviewed the evidence-only r4
statically and filed CHANGES: 1 blocking finding and 3 non-blocking record
findings. The blocking item is a V DECISIONS PACKET row because worker rework
3/3 is spent; I did not authorize or imply another worker round. I ran no tests,
builds, installs, mutation commands, provider calls, or mutating git commands.

### Cause and price

The raw evidence is better than r3: all 21 transcripts have the mission tool's
header and custody fields, the four I read completely carry the claimed failures,
and a static census reproduces 19 RED catches plus two GREEN neighbours. The
remaining blocker is the exact D34 boundary one level later. The filing says the
index is generated mechanically from those transcripts, but no index generator
or producing command is retained. The only filed driver calls `mutate.sh`; it
does not read `meta`, parse outcomes, generate the index, or check expected versus
observed. A changed transcript can therefore leave the index stale while the
driver still exits successfully.

Price: one evidence-only V row after the cap, not a product correction and not a
repeat of the 21 mutation executions. The cheapest resolution is a retained
index command that reads the raw records and pair metadata, emits the table, and
refuses any unclassified failure or expected/observed mismatch. The current
index content is accurate; what is missing is evidence of its derivation.

### What I nearly got wrong

I nearly promoted exact content agreement into provenance. My independent count
matched every raw `AssertionError`/`TypedDomainError` split in the index,
including l1/l2 and m3. That proves the present table is correct. It does not
prove the table was generated, any more than D44's passing stamp check proves a
file lives in the durable directory. The absent producer only became obvious
when I followed the driver's data flow: it never opens the index or the `meta`
files.

I also nearly treated the stable report's corrected l1/l2 paragraph as closure
of the entire r3 N1. The worker self-report still teaches the false completion-
assertion cause in its original r3 section and only retracts it later. The r3
verdict explicitly required both filing and self-report to be corrected in
place. Likewise, the stable filing still says the tuple runs took about 27
seconds each even though r3 N2 quoted 14.15, 6.60 and 6.76 seconds.

The last count trap was m3. The packet and stable prose say two throws plus one
assertion, while the raw transcript and its own index contain four failed tests:
three throws plus one assertion. I nearly repeated the shorthand after checking
only the first three index rows; counting the raw `FAIL` blocks exposed it.

### Where the packet fought

The packet says the index is generated and asks me to verify that it derives
failure classes mechanically, but names no generator or check. It also says the
driver is the only seat-authored file even though the 105 pair-input files and
the index are essential seat-selected artifacts; the defensible narrower claim
is that the driver is the only seat-authored executable in the transcript path.
Finally, its checklist carries r3 N1 but drops r3 N2 entirely, despite saying the
r3 verdict defines scope, and it asks me to confirm an in-place correction that
exists in the stable report but not the self-report. Its m3 parenthetical also
copies the stable report's false three-failure count instead of the four rows in
the generated index.

### Dead ends and upgrade

I did not rerun the campaign: the packet forbids it and the raw records already
contain the relevant runtime outcomes. I did not reject the token fits merely
because the mission tool was fixed afterward; the five folds preserve the
targeted mutations on the sealed/test mappings, f6 still changes the observation
actually returned, and all 21 current pairs contain none of the four forbidden
characters. I also did not reopen the r3 product findings, because the tip, tree
and five-file diff are unchanged.

For the one-prompt machine, make the mutation driver own the whole evidence
projection: read `meta`, call the transcript emitter, parse each raw result,
classify assertion versus pre-assertion throw, compare expected/observed, write
the index, and fail unless the declared campaign totals match. Then have the
packet run that same command in check-only mode. Also carry every unresolved
row from the preceding verdict into the next packet mechanically; N2 disappeared
because the checklist was reconstructed from memory.

## 2026-09-02 — CODEX MERGE REVIEW 1 SELF-REPORT, lane S08

Seat: Codex reviewer (`gpt-5.6-sol`, xhigh). I reviewed merge
`f3c7f74fd449ec58ca77f69bac6d35862639d18c` statically and filed APPROVE with
zero product/blocking findings and two non-blocking tickets. I ran no tests,
builds, installs, migrations, mutation commands, provider calls or mutating git
commands.

### Causes and prices

The merge itself is sound. The three shared files are a direct semantic union:
T7 changes expansion and condition-mark production upstream; S08 still selects
its served root, maps `node_refs`, applies the band chain, and derives its cited
set through the same seams. No landed test assertion was removed or weakened.

The first residual cause is evidence language confusing provisioning with
execution. The worker saw `stoppingPolicy` in the common `runnerSettings()` and
called T7 live in TERM-01. TERM-01 reaches `createRun` with the default
`agentCount = 1`, while
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08/dialectical-engine/apps/runner/src/index.ts:2926`
builds no expansion plan for one maker. Price: one same-day sentence correction
in
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s08-band-downgrade.md`,
with no code change or rerun.

The second residual is in mission tooling. The derived-index script advertises
an expected-file input but ignores it, so its 19/2 total cannot detect a product
mutant and neighbour exchanging outcomes. The current campaign is sound because
I matched all 19 product names to non-zero exits and the two neighbour names to
zero exits. Price: harden
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.sh`
before the next campaign; S08 owes no repeat execution.

### Near misses

The first near miss was accepting “configured” as “executed.” Tracing the
fixture's maker count to the runner's empty-plan branch changed the evidence
classification without changing the product verdict.

The second was treating the unstamped derived index as either automatically
invalid or automatically authoritative. Its exclusion from the 29-record stamp
prefix is honest: it is a projection, and all 21 named sources stamp the merged
commit and tree. But the projection is descriptive, not a complete expectation
gate. Both halves matter.

### What the packet fought, and the upgrade

The packet itself repeated the “live in every fixture” premise, so following its
requested check rather than inheriting its wording was decisive. Future merge
packets should name the observable that proves a shared policy executed—for T7,
a `STOPPING:round:*` ledger record—not merely the settings object that carries
the policy.

The derived-index upgrade is equally mechanical: consume a filed expectation
manifest, reject missing or malformed transcript fields, fail any role mismatch,
and pin locale-sensitive rendering. Then a reviewer can verify both custody and
meaning without reconstructing the campaign by hand.

### Dead ends

I did not rerun the focused cluster, persisted tuple or mutants; the packet
forbids it and the raw records are sufficient for a static custody audit. I did
not reopen T7's already-landed design or S08's already-judged product findings.
The only interaction question I followed beyond text presence was the call flow
that could have changed S08's cited set, label or band, and none was bypassed or
reordered by the merge.
