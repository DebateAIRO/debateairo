# REQ-SYNTH case file — observability-agents

Ticket: `t_63e08f55` · seat: REQ-SYNTH · role: requirements synthesis · 2026-09-02.

## Scope and operative evidence

The synthesis uses the latest authorized closure only: `REQ-REV-FIX-r3.md`, `REQ-REV-SUP-r3.md`, `REQ-REV-OBS-r3.md`, and `REQ-REV-PACKETS-r2.md` all say PASS. Earlier REWORK verdicts remain history, not active blockers. The controller stated that the ticket had exactly one authorization comment at dispatch and retained all later board writes; this seat made no board call.

Skills actually loaded: `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`, `superpowers:brainstorming`, `superpowers:verification-before-completion`.

Read in full: COMMON and REQ-SYNTH packets; H0; the four operative review verdicts; all three product requirements and compass blocks; all 30 SPECs; `V-DECISIONS-PACKET.md`; and the reference `ui-overhaul/INSTRUCTIONS.md`.

## Cause findings and price

1. **Two products froze opposite halves of one detector interface.** FIX requires the ObservationAgent to write a registry-coded `obs.occurrence` with a code-location component, while OBS forbids that write and exposes a view whose component is a runtime enum. Price if left open: an architecture seat can implement either contract and still fail the other; one whole interface implementation and review round can be discarded. Disposition: X-01 and one controller ticket.
2. **Support's “identical” standalone definition changes the unit.** H0 requires independently deployable/startable/killable processes; Support specifies a switch-gated module mounted in the main API. Price: Support behavior can turn off independently, but it cannot be deployed, failed or restarted independently, leaving architecture to guess whether to add a service or weaken C3. Disposition: X-02 and a controller/V successor ruling.
3. **Historical working-tree state escaped into a permanent dispatch gate.** FIX-06 still waits on 111 uncommitted UI entries even though H0 records their consolidation into a commit. Price: a runnable slice can remain parked indefinitely for a condition that no longer exists. Disposition: X-03 and one controller ticket; do not rewrite the frozen SPEC in synthesis.
4. **A future-work provider was frozen as an authoring requirement.** Support's corpus/eval seats are pinned to Fable 5.1, while the active route now assigns requirements work to GPT-5.6-sol. Price: dispatch either violates current policy or falsely rewrites historical identity. Disposition: X-04; retain old authorship labels, route only future work under current policy.
5. **Single-writer reasoning stopped at product boundaries.** FIX and SUP both claim `apps/api/src/index.ts`; FIX and SUP both claim root `package.json`. Price: parallel worktrees can both be locally correct but produce merge-order-dependent policy/script wiring. Disposition: X-05/X-06 and controller-owned serialization or additive-fragment seams.

## Nearly wrong

- I nearly counted the Support incident interface as an automatic ObservationAgent publication contract. It is not: phase 1 names only the V-owned publish/resolve CLI, while OBS publishes internal signals to ops channels and forbids product-table writes. The future “may later” sentence creates no current writer.
- I nearly accepted Support's kill switch as proof of the whole standalone contract. It proves independent behavioral control, not H0's separate deployment and process lifecycle. The contradiction therefore remains, but its disposition is a successor V ruling rather than an edit to frozen history.
- I nearly treated every shared directory as a collision. The packet says the same file surface is the finding. Orchestrator-numbered migration filenames, slice-prefixed tests, OBS target fragments, and module directories remain distinct when their allocation rule is obeyed.
- I nearly propagated the stale “Fable reviewers / Opus architecture” reference compass roster. COMMON's current policy is authoritative for new work; already-produced artifact identities remain untouched.

## Dead ends and repeat costs

- A combined full-file dump was truncated and hid the middle of FIX and OBS artifacts. Recovery required bounded per-file reads. Future one-prompt runs should route large Markdown inputs by `wc -l`, then read each file or bounded group with an explicit output budget.
- A shell probe that mirrored output through `tee /dev/stderr` was denied by the environment. It was not material and does not justify a TOOLING-TRAPS append; focused reads and direct output suffice.
- Product-local “parallel-safe” statements do not answer mission-wide writer safety. The synthesis packet should make the cross-product surface inventory a mandatory machine-generated table, not a prose reminder.

## Packet clarity

- `REQ-SYNTH.md:26` correctly demands field-by-field and cross-product checks, but does not say whether S3 belongs in `INSTRUCTIONS.md` or the detail ledger. The controller resolved this run: keep `INSTRUCTIONS.md` pointer-oriented and place the full 30-row S3 table in `cross-product-contradictions.md`.
- `REQ-SYNTH.md:21` normally requires V-ticket comment reads, while the bounded dispatch explicitly said the board has one authorization comment and the controller owns later board writes. The controller override was followed; comment count is recorded as 1 without a board call.
- “Depends-on” in S3 does not distinguish implementation dispatch dependencies from acceptance-only dependencies. This synthesis uses the SPEC's dispatch dependency where explicit, and records acceptance gates in the first-V-test text rather than over-serializing day-one work.

## Outputs and closing checks

Allowed outputs only:

- `docs/missions/observability-agents/INSTRUCTIONS.md`
- `docs/missions/observability-agents/requirements/cross-product-contradictions.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-SYNTH.md`

Fresh focused evidence after the final edits:

- `wc -l` reports **68** for `INSTRUCTIONS.md`, below the 100-line cap.
- Compass and S3 probes each report **30/30 unique slice codes**: 16 FIX, 7 OBS, 7 SUP; both code sets exactly match the 30 slice directories.
- Pointer probes report 20 table-of-contents targets and all 30 per-slice links exist. The 25 explicit source ranges used by contradiction sides are within file bounds; each of six Side A and six Side B lines carries a `path:line` citation.
- Contradiction structure reports **6 ids, X-01 through X-06**, six recommendations and six controller same-day ticket seeds. Roster probe finds GPT-5.6-sol requirements/code, Grok 4.6 review, controller-assigned architecture and V-personal QA. Banned requirement-word probe reports zero hits.
- `git diff --check` exits 0 with no output. Because all three allowed outputs are new/untracked, `git diff --no-index --check /dev/null <file>` was also run for each and produced no whitespace errors; scoped status names exactly the three allowed paths. No product/runtime suite was run for this documentation-only synthesis.

## Handoff

SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements, superpowers:brainstorming, superpowers:verification-before-completion

Status: **READY FOR PEER REVIEW**. `INSTRUCTIONS.md`: **68 lines**. Full 30-row S3 table: `docs/missions/observability-agents/requirements/cross-product-contradictions.md`. Contradictions: **6 — X-01, X-02, X-03, X-04, X-05, X-06**. Comments read through: **1** (controller-provided dispatch fact; no board call by this seat).
