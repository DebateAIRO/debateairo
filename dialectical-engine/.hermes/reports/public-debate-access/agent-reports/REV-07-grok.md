SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, verification-before-completion, debateai-heartbeat-protocol (spine § read), grok-heartbeat-adapter, TOOLING-TRAPS

# REV-07 — Blind CODE REVIEW: `stranger_restatement` `.passthrough()` → `.strict()`

Seat: REV-07 (Grok). Mission: public-debate-access. Worktree: sanitized rev-07, detached at `ef8b746`. Reviewed surface is the three-file unstaged diff against that HEAD. No product code edited. Scratch mutants restored; porcelain for the three reviewed files only (plus this report / packet / one TOOLING-TRAPS append).

`comments read through:` no REV-07 ticket exists on board `public-debate-access` (searched; `NO_REV07_TICKET`). Author ticket `t_784057b0` (S01-STRICT) read for packet-review / skills gate only — status `ready`, **one** event (created), **zero** comments, no `SKILLS LOADED` on the board. Author self-report path outside this sanitized tree was sampled **only** for the skills line (absent); see N2 and the blindness note under Predictions.

---

## Packet review (before the diff)

| Check | Result |
| --- | --- |
| Packet path resolves from seat cwd | YES — absolute path in launch; file present |
| "three files" claim | YES — `packages/contract/src/index.ts`, `tests/unit/contract.test.ts`, `tests/unit/s8-publication.test.ts` |
| One-token claim on contract | YES — line 434 `.passthrough()` → `.strict()` only |
| Quoted hashes / counts / line numbers inside REV-07 packet | Packet quotes no false hash; line 434 matches |
| `allowed` list vs mandatory deliverables | REV-07 packet has **no** `allowed` list (review packet, OK). Author ticket `t_784057b0` body claimed surface "exactly" contract + `contract.test.ts`; the live diff **also** touches `s8-publication.test.ts`. That mismatch is already on the board as `t_cc34ba78` (STRICT-N1). Not re-litigated as a new packet invention — named under N3 as process residue. |
| REV-07 board ticket for verdict posting | **MISSING** — packet/router defect (N4) |

---

## What was verified (and HOW)

### 1. Does the new contract test pin the token?

**GREEN with change.** Focused run executed (not skipped):

- `admits recorded per-node maker lineage…` PASS
- `publishes the tree without leaking…` PASS
- `projects stranger_restatement…` PASS
- `nulls disagreement…` PASS

**Scratch revert of the one token** (`.strict()` → `.passthrough()` in a restored copy):

```
AssertionError: expected [Function] to throw an error
❯ tests/unit/contract.test.ts:178
```

Exit 1. Restored to `.strict()`. **The new assertions do not pass if the token is reverted.** They pin the change.

Neighbor control inside the same assertions (`check_status: "FAIL"` still parses) remains present in the diff; not separately mutated.

### 2. Is the s8 fixture/test still falsifiable after the cast?

**YES.** Mutated `redactNodeForPublic` to `stranger_restatement: node.stranger_restatement` (pass-through). Both:

- `publishes the tree without leaking owner-only fields`
- `projects stranger_restatement to its public check_status only`

failed with `ZodError` / `unrecognized_keys` for `secret_extra`, `owner_note` at `answer.nodes[0].stranger_restatement` inside `PublicDebateSchema.parse` at publish. Restored.

The `as Node["stranger_restatement"]` cast is **type-only**. Runtime fixture still carries `LEAK-ME-RESTATEMENT` / `do-not-publish`. Removing the cast makes `pnpm exec tsc --noEmit` report `TS2353` at `tests/unit/s8-publication.test.ts:126` (`secret_extra` excess). With the cast, `tsc --noEmit` exits 0 (captured without a pipe so `$?` is real).

**Oracle shift (observation, not a pass/fail of falsifiability):** after `.strict()`, a projection regression fails closed at schema parse **before** the soft `not.toContain("LEAK-ME-RESTATEMENT")` asserts run. The test still fails. It no longer reaches the leak-string oracle for that mutant; it reaches the schema gate instead. That is stricter for anonymous safety, weaker as a pure "projection stripped these bytes" witness.

### 3. Scope / siblings on the anonymous-reader path

Closed by this change: nested `stranger_restatement` was the nested `.passthrough()` hole inside an otherwise `.strict()` `NodeSchema` / `PublicDebateSchema` tree.

**Sibling still open — see N1:** `disagreement: z.record(z.string(), z.unknown()).nullable()` at `packages/contract/src/index.ts:437`. Mutated projection to `disagreement: node.disagreement`. Schema **accepted** the open record. Published JSON contained `LEAK-ME-DISAGREEMENT` and `secret-ptr-9f2a`. Tests failed on assertions (`toBeNull` / `not.toContain`), **not** on schema rejection. Fail-closed at the contract does **not** hold for this field the way it now holds for `stranger_restatement`.

Other `z.unknown()` / `z.record` sites in the contract (`would_have_suppressed`, `answer_form`, deployment rows, etc.) are outside the `PublicDebateSchema` answer projection exercised here; not claimed as live anonymous holes without a separate probe.

Projection that *does* strip `stranger_restatement` to `{ check_status }` remains at `apps/api/src/publications.ts:53` (read-only inspection; not part of the diff).

### 4. Compile-time type / consumers

`Node["stranger_restatement"]` narrows to `{ check_status: ... }` under `.strict()` the same as under `.passthrough()` for *known* keys; the behavioral change is runtime unknown-key rejection plus excess-property pressure on object literals. The only compile break found by removing the cast is the deliberate malformed fixture. `tsc --noEmit` GREEN with the three-file change as landed.

Owner `NodeSchema.parse` on `GET` node routes (`apps/api/src/index.ts`) and serve-side construction of `{ check_status }` only were inspected; no probe showed extra keys being fed through those paths. **UNVERIFIED** against live DB rows with unexpected JSON keys (no production data probe in this seat).

### 5. Load-bearing / absent

Load-bearing and appropriate: the one-token schema change; the smuggled-key + `unrecognized_keys` assertions; the type-only cast that keeps the malformed fixture legal for the redaction tests.

Absent and wanted (not blocking this merge): a schema-level fail-closed for `disagreement` (N1); a dedicated `it(...)` name for the strictness assertions (N3); author `SKILLS LOADED` (N2); a REV-07 ticket (N4).

---

## Findings

### N1 — NON-BLOCKING
**VERDICT:** NON-BLOCKING  
**CONFIDENCE:** high — would drop only if `PublicDebateSchema` were shown not to embed `NodeSchema.disagreement`, or if a separate strict public disagreement schema already wrapped the field (neither is true in this tree).  
**STRONGEST COUNTER:** Projection already forces `disagreement: null`, and s8 tests fail when that regresses; so anonymous readers are protected by projection+tests today. Closing the schema hole is defense-in-depth, not a proven live leak under the current producer.

**Evidence:** `packages/contract/src/index.ts:437` — `disagreement: z.record(z.string(), z.unknown()).nullable()`. Mutant: pass through `node.disagreement` → published envelope contains owner markers; Zod does not throw. Same class of defect the `.strict()` change closes for `stranger_restatement`, left open for this sibling.

**Ticket owed:** schema should not admit an open record into the anonymous envelope when non-null (literal `null` only, or a closed object). Same-day routing.

### N2 — NON-BLOCKING
**VERDICT:** NON-BLOCKING  
**CONFIDENCE:** high for "line absent"; skills *content* unread beyond that by design.  
**STRONGEST COUNTER:** Author may have loaded the floor and simply omitted the declaration line; board ticket never reached handoff so the line was never posted.

**Evidence:** `t_784057b0` has zero comments. Author report `S01-STRICT-codex.md` (s01-strict tree) has no `SKILLS LOADED:` line. Worker floor requires heartbeat-worker + Superpowers craft skills (`test-driven-development`, `systematic-debugging`, `verification-before-completion`, `receiving-code-review`) declared on handoff.

### N3 — NON-BLOCKING
**VERDICT:** NON-BLOCKING  
**CONFIDENCE:** medium — hygiene, not false safety.  
**STRONGEST COUNTER:** Co-locating with other `NodeSchema` strictness checks is coherent; the assertions execute inside the same `it` and were shown to run under a title filter that includes that test name.

**Evidence:** New smuggled-key asserts live inside `it("admits recorded per-node maker lineage…")` in `tests/unit/contract.test.ts` rather than a dedicated title naming `stranger_restatement` / unrecognized keys. A future `-t stranger_restatement` harness would miss them.

### N4 — NON-BLOCKING (packet / router)
**VERDICT:** NON-BLOCKING  
**CONFIDENCE:** high.  
**STRONGEST COUNTER:** Blind seats sometimes deliver only the agent-report file and the Router collects it; a ticket is optional.

**Evidence:** `hermes kanban --board public-debate-access list` has no REV-07 row. Reviewer contract wants a ticket comment with `comments read through`. Report filed at this path instead.

### O1 — OBSERVATION (eleventh-variant hunt)
Hypothesis that the `as Node["stranger_restatement"]` cast made the s8 test unfalsifiable: **REFUTED** by the projection pass-through mutant (tests went RED via Zod).

Near-miss class still real in this stack: **Vitest green does not imply typecheck green** for excess properties on fixtures. This change closes that near-miss with the cast + typecheck. Not filed as an open defect in the landed diff.

Secondary near-miss (pre-existing, not introduced): architecture text checks that the `PublicDebateSchema` source slice `toContain(".strict()")` would still pass if nested `stranger_restatement` were `.passthrough()`, because outer `.strict()` tokens satisfy the substring. That guard does not pin *this* hole.

---

## Overall judgement

**Safe to merge as it stands**, with N1–N4 ticketed the same day. No BLOCKING findings against the one-token contract change or its pinning test. The s8 cast does not render the redaction tests unfalsifiable.

**REWORK?** No — verdict is **PASS** on the code change, with non-blocking findings that do not reopen an implementation round on S01-STRICT itself. Round count for S01-STRICT: this is review of rework that already included the cast; opening a fourth implementation round is not warranted for N-findings.

---

## Self-report

- Role floor loaded (heartbeat-protocol, heartbeat-reviewer, verification-before-completion). Spine + adapter + TOOLING-TRAPS read.
- Packet reviewed first; missing REV-07 ticket and author-surface mismatch noted.
- Probes run by this seat: GREEN focused tests; token revert → RED; stranger_restatement projection mutant → RED; disagreement projection mutant → RED with leak bytes admitted by schema; cast removal → TS2353; restores verified; `tsc --noEmit` exit 0.
- Did **not** verify live production node rows, browser/anonymous HTTP surfaces, or full `vitest` suites beyond the focused filters (confirmed those filters **executed** the named tests).
- Where the packet fought me: "assume an eleventh" pushed hard at the cast; the cast looked like false safety until the mutant was run. Blindness pressure from board list titles (`STRICT-N1`, `ROUTER-N1`) was visible; code conclusions were formed from local probes before sampling the author skills line.
- TOOLING-TRAPS append: `$?` after a pipe is the pipe consumer's exit, not `tsc`'s.

## Predictions (blindness check)

I expect other lenses to either (a) over-weight the cast as BLOCKING "test made unfalsifiable" without running the projection mutant, or (b) miss N1 (`disagreement` open record) because the landed diff does not touch that line. I would check first whether anyone claimed the s8 test can no longer fail, and whether anyone filed the `z.record` sibling. I also expect someone to treat author-report reasoning as evidence; this seat discounts that — probes above are the evidence. Partial blindness break: board titles and a skills-line sample of the author report were visible; predictions above are the falsifiable check that independent probes still drove the verdict.

---

READY FOR ROUTER
