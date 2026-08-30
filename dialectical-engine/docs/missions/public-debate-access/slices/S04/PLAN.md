# PLAN — S04 Anonymous-exposure review

> **For agentic workers:** Architecture seat fills verification clusters and
> any remediation steps. Requirements authored skeleton + quantifiability law
> only.

**Goal:** Prove the widened public envelope obeys standing security
invariants and file an explicit verdict on node-text identity risk.

**Spec:** `docs/missions/public-debate-access/slices/S04/SPEC.md`

**Status:** STEPS AUTHORED by ARCH-01 (Claude, 2026-08-29). R5's verdict
itself is QA's call, not Architecture's (SPEC: "QA records a written
verdict") — this PLAN sets up the evidence and the filing mechanism, it
does not pre-empt the verdict.

## Quantifiability law (binding on Architecture / QA)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- SPEC↔PLAN coverage complete; three-run law on automated clusters.
- R5 requires a labeled verdict — UNVERIFIED is not acceptable at mission close.

## MEASURED ground truth this PLAN rests on

- `tests/architecture/s8-publication-contract.test.ts:120-138` — the
  standing forbidden-carrier test operates on `PublicDebateSchema`'s
  TOP-LEVEL and `.answer`-level fields only (own read). **It has zero
  coverage of the WIDENED `nodes`/`edges` arrays S01 adds** — no existing
  test asserts anything about identity-shaped fields inside a `NodeSchema`
  or `EdgeSchema` instance. This is the actual NEW exposure surface S04
  exists to review; S04-C1 below is net-new work, not a regression check.
- `packages/contract/src/index.ts` (`NodeSchema`/`EdgeSchema`) and S01's
  S01-C2-0B field table — the value-provenance classification is SETTLED,
  not open for this seat to re-derive: the four reachable
  `provenance_ref` variants are REDACTED, while `MakerLineageSchema.*`
  (including `.provider_ref`) and the `AbstentionSchema.register_*` fields
  are COPIED (VERIFIED) from static deployment/policy-register producers.
  S04-C4's remaining sample-read is a QA implementation check against that
  classification, not a new classification decision. The current live-data
  gap is explicit: the sole published debate is a legacy publication without
  `tree_included`, so none of these node/edge values has yet been observed on
  the anonymous live path.
- `apps/api/src/index.ts:728` (own read) — `ResourceIdSchema.safeParse(request.params.id)`
  already gates the `{id}` path param before any lookup; unaffected by S01/S02.
- `apps/api/src/publications.ts:399-400` (own read) — `readPublicDebate`'s
  catch block returns bare `null`, never a caught error's `.message` —
  already non-leaky by construction; S01 adds no new catch/throw sites.

## Clusters

| Cluster | Steps | ONE verification command | File surface |
|---|---|---|---|
| S04-C1 | S04-C1-1..3 | `pnpm exec vitest run tests/unit/pda-s04-node-carrier-audit.test.ts` | new `tests/unit/pda-s04-node-carrier-audit.test.ts` |
| S04-C2 | S04-C2-1..2 | `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts` | none (regression-only; standing test already covers this) |
| S04-C3 | S04-C3-1..2 | `pnpm exec vitest run tests/unit/s8-publication-http.test.ts` | none (regression-only) |
| S04-C4 | S04-C4-1..3 | manual — QA renders the verdict; no automated command produces R5's output (see S04-C4 steps) | `docs/missions/public-debate-access/slices/S04/PROGRESS.md` (orchestrator-folded) or a QA report path recorded in DECISIONS.md |

**REWORK ROUND 4 (PLAN-03, blocking, `t_71699495`): every command above RUN,
not just edited.** S04 used `--reporter=basic` 7 times (all stripped). Own
reproduction of the underlying bug, as elsewhere: `npx vitest run
tests/unit/s8-publication.test.ts --reporter=basic` → `Startup Error:
Failed to load custom Reporter from basic`, exit 1. **No command-execution
vacuous pass was found in these S04 invocations**: S04-C1's cluster command
and its original `-t "fixture"` variant (S04-C1-2; replaced after its test
subject was found vacuous in S04-CODE rework round 1) both targeted a SINGLE
nonexistent file, which
fails cleanly (`No test files found`, exit 1 — the genuine-RED shape, not
the multi-file-argument vacuous-GREEN shape S01 had); S04-C2/C3 are
single-file, no-filter regression runs against files that exist today.
Run 2026-08-29:

| Cluster | Category | Observed pre-fix result |
|---|---|---|
| S04-C1 | FEATURE-ASSERTION | **RED, genuinely:** exit 1, `No test files found, exiting with code 1` — the file doesn't exist yet. |
| S04-C2 | REGRESSION-BASELINE | **GREEN, correctly:** exit 0, 5/5 passed — the standing forbidden-carrier/route-ban test, unaffected by any not-yet-implemented S01/S02 code, must stay green through this mission. |
| S04-C3 | REGRESSION-BASELINE | **GREEN, correctly:** exit 0, 4/4 passed — same reasoning as S04-C2. |
| S04-C4 | **Not applicable to this taxonomy — a human verdict, not an automated check.** | R5's output is QA's written label (`SAFE_UNDER_CURRENT_RULES` / `RISK_ACCEPTED_BY_V` / `BLOCKED_NEEDS_REDACTION_OR_POLICY`), not a command with a pass/fail exit code — FEATURE-ASSERTION/REGRESSION-BASELINE/VERIFICATION-ONLY describe automated acceptance tests, and this cluster deliberately has none (S04-C4-1's own "Acceptance test" line already says so). Recorded here so a reviewer doesn't read the taxonomy's absence as an oversight. |

**ACCEPTANCE-COMMAND THREAD, ROUND 2 (PLAN-04, blocking, `t_eade6007`):
checked, no fix needed here.** Same reasoning as S02/S03's equivalent
notes: S04 has zero `| grep -q` occurrences — every automated S04 command
is a bare single-file vitest run or a bare `grep -c` with its own exit
code; S04-C4 has no automated command at all. Re-run 2026-08-29: S04-C2
(`pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts`)
→ exit 0, 5/5 passed — same result as round 4, unaffected by this round's
fix.

## SPEC trace — R1 No user-linked identifiers in the public envelope

**SPEC:** S04 R1 · **Cluster:** S04-C1

### S04-C1-1 — New test: no `NodeSchema`/`EdgeSchema` field name matches the forbidden identity-carrier list

**Cluster:** S04-C1
**File surface:** new `tests/unit/pda-s04-node-carrier-audit.test.ts`
**Change:** Write a test that imports `NodeSchema`/`EdgeSchema` from
`@debateai/contract`, introspects their zod shape keys (`Object.keys((NodeSchema
as unknown as z.ZodObject<any>).shape)` and the same for `EdgeSchema` and
`MakerLineageSchema`/`NodeReviewSchema` nested inside), and asserts none of
the forbidden top-level names (`asker_id, owner_ref, user_id, run_ref,
answer_id, memory_disclosure, ledger_digest_handle, inspection_handle,
cost_envelope, tier_provenance_ref`) appear anywhere in that key set,
recursively.
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s04-node-carrier-audit.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
covered by cluster S04-C1's own verification command (see Clusters
section); observed pre-fix RED there (file does not exist).**
**Failure it CATCHES:** a future edit to `NodeSchema` that adds a field
literally named e.g. `owner_ref` (a copy-paste from `AnswerSchema`) — this
test's key-introspection approach catches it structurally, at the schema
level, before it ever reaches a live publish.
**Failure it MISSES:** does not catch a field that is NOT literally named
like the forbidden list but still functions as an identity carrier (e.g. a
hypothetical `session_hint` field) — that class of risk is exactly what
S04-C4's human/QA verdict exists to judge; a name-matching test cannot
substitute for it.

### S04-C1-2 — Product-path test: publish erases forbidden keys carried inside node `disagreement`

**Cluster:** S04-C1
**File surface:** `tests/unit/pda-s04-node-carrier-audit.test.ts` (same
file, second `it()`)
**Change:** Build an owner-side `Answer` with ≥2 nodes and ≥1 edge, place
all ten forbidden key names plus distinct marker values inside every
fixture node's open `disagreement` record, and call the real
`PostgresPublicationApplication.publish` method. Stub only its repository
and cipher boundaries, capture the `PublicDebate` passed to encryption,
and assert the real `redactNodeForPublic` projection sets every projected
node's `disagreement` to `null` and removes every planted key and value.
This is a targeted product-path guard for the open-record projection; it
is not a claim that an independent whole-envelope scanner exists.
**Acceptance test:** `pnpm exec vitest run tests/unit/pda-s04-node-carrier-audit.test.ts -t "real publish projection removes forbidden keys smuggled through node disagreement"`
exits 0 with that named test executed.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
observed pre-fix RED, correctly, without needing a `grep -qE` suffix.**
Run 2026-08-29: exit 1, `No test files found, exiting with code 1` — this
is a SINGLE-file target (only one path argument), so vitest checks file
existence before it ever applies the `-t` filter; the vacuous-pass defect
S01 found (a `-t` filter matching zero tests inside a file that DOES
exist, or a missing file silently dropped from a multi-file argument list)
does not apply here — there is only one argument and it is absent.
**Failure it CATCHES:** a projection regression that copies
`NodeSchema.disagreement: z.record(z.string(), z.unknown()).nullable()`
instead of nulling it. That regression lets arbitrary keys and values
cross the anonymous boundary while `PublicDebateSchema.parse` still
accepts the result; the test's deliberate `disagreement:
node.disagreement` product mutant makes this named test RED.
**Failure it MISSES:** identity carried only in a VALUE under an allowed,
copied field name (for example `maker_lineage.provider_ref: "owner:..."`).
The neighboring value mutant stays GREEN by design. S01-C2-0B's settled
producer-trace table supplies the classification for those copied fields,
and S04-C4's tree-bearing anonymous sample remains QA's implementation
check; C1 alone does not close R1.

### S04-C1-3 — Confirm `author_pseudonym` remains the only human-facing publisher label

**Cluster:** S04-C1
**File surface:** none (regression-only step)
**Change:** none.
**Acceptance test:** `grep -c "author_pseudonym" packages/contract/src/index.ts`
returns the SAME count before and after S01's implementation (worker
records both) — proving S01 didn't introduce a second publisher-identity
field.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix baseline GREEN=2, recorded, must stay 2.** Run
2026-08-29: `grep -c "author_pseudonym" packages/contract/src/index.ts` →
`2` (the field declaration plus its one other reference in the same file)
— the worker's post-S01 count must match this.
**Failure it CATCHES:** a hypothetical S01 implementation choice that adds
e.g. a `publisher_display_name` field alongside `author_pseudonym` —
explicitly out of scope per S04 R1's "unless V ratifies otherwise."
**Failure it MISSES:** does not catch `author_pseudonym`'s VALUE ever
being generated in a way that's reversible to a real identity (a
generation-algorithm concern, pre-existing, out of this mission's scope —
already shipped by the prior security mission per INTAKE).

## SPEC trace — R2 Standing public-route bans remain unless deliberately replaced

**SPEC:** S04 R2 · **Cluster:** S04-C2

### S04-C2-1 — Regression: standing route-ban assertions still pass after S01/S02

**Cluster:** S04-C2
**File surface:** none (regression-only; the assertions already exist at
`tests/architecture/s8-publication-contract.test.ts:134-137`)
**Change:** none.
**Acceptance test:** `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts`
exits 0, run three times.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
covered by cluster S04-C2's own verification command (see Clusters
section); observed pre-fix GREEN there (5/5 passed).**
**Failure it CATCHES:** S01 or S02 accidentally reintroducing a route
matching `GET /v1/public/debates/{id}/inspection`,
`/ledger-digest`, or `/events` — none of this mission's PLANs add any new
route, so this is a pure regression guard, not new work.
**Failure it MISSES:** a route added under a DIFFERENT literal path string
that doesn't match these exact three greps (e.g. a typo'd or
differently-cased path) — the test's exact-string matching is only as
strong as the three strings it checks.

### S04-C2-2 — Confirm no PLAN in this mission introduces a new anonymous route

**Cluster:** S04-C2
**File surface:** none (verification-only, cross-references the other
three PLANs this same seat authored)
**Change:** none.
**Acceptance test:** `grep -rn 'api\.\(get\|post\|put\|delete\)' docs/missions/public-debate-access/slices/S0{1,2,3}/PLAN.md`
returns no match (none of S01/S02/S03's PLAN steps add a new Fastify
route handler — confirmed by this seat's own authorship of all three).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY —
observed pre-fix GREEN, correctly.** Run 2026-08-29: no match, exit 1 —
confirmed against the CURRENT state of all three sibling PLANs, including
this round's own edits to them (none of which add a route handler either).
**Failure it CATCHES:** scope creep introduced by a later PLAN revision
that adds a convenience endpoint without routing the decision through
S04's review gate (SPEC R6: "S01 and S02 are not mission-closed while S04
R1-R5 are unmet").
**Failure it MISSES:** a new route added at CODING time that was never in
any PLAN (a worker going off-plan) — out of this step's reach; that is a
peer-review/QA catch, not a planning-time one.

## SPEC trace — R3 Error responses stay non-leaky

**SPEC:** S04 R3 · **Cluster:** S04-C3

### S04-C3-1 — Regression: public HTTP boundary test still passes

**Cluster:** S04-C3
**File surface:** none (regression-only)
**Change:** none.
**Acceptance test:** `pnpm exec vitest run tests/unit/s8-publication-http.test.ts`
exits 0.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
covered by cluster S04-C3's own verification command (see Clusters
section); observed pre-fix GREEN there (4/4 passed).**
**Failure it CATCHES:** S01's `readPublicDebate` catch-block (`publications.ts:399-400`,
already `catch { return null }`, no message forwarded) regressing to leak
a caught error's `.message` into the 404 body — this mission's PLANs make
no edit to that catch block's body, only to what it parses, so this is a
regression guard confirming that stays true.
**Failure it MISSES:** a NEW error path introduced inside the widened
`answer` object's own zod refinements (S01 doesn't add any
`.superRefine()` to `PublicDebateSchema`, so none exists to leak from —
confirmed by this seat's own S01 PLAN, which adds only `.optional()`
fields, no refinement).

### S04-C3-2 — Confirm `{id}`/`public_ref` params stay declared-kind validated

**Cluster:** S04-C3
**File surface:** none (regression-only)
**Change:** none.
**Acceptance test:** `grep -c "ResourceIdSchema.safeParse(request.params.id)"
apps/api/src/index.ts` returns `≥14` after S01/S02 land (worker confirms
line 728's call site specifically is still present, unremoved, and that
no PLAN in this mission touches that line).
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): REGRESSION-BASELINE —
observed pre-fix GREEN=14, correcting this step's own stale baseline
claim.** Run 2026-08-29: `grep -c "ResourceIdSchema.safeParse(request.params.id)"
apps/api/src/index.ts` → `14`, not the `1` this step's round-0 text
claimed — round 0's "returns `1` today at line 728" undercounted by only
checking the one line it had already cited for a different reason, rather
than actually running the grep against the whole file. Corrected here by
running it, per this round's own rule: every acceptance line is checked
against what the command ACTUALLY returns, not what a prior round assumed
it would. All 14 sites, including line 728, are confirmed present by the
same grep; the pass condition is corrected to `≥14` so a worker checking
against this PLAN's own stated baseline gets the true number, not a wrong
one three times too low.
**Failure it CATCHES:** an edit that replaces strict UUID/id-kind
validation with a permissive passthrough while widening the read path —
no PLAN in this mission does this, but the check exists because S01/S02
both touch the surrounding file/function.
**Failure it MISSES:** a NEW id-shaped parameter introduced elsewhere
(none exists in this mission's scope).

## SPEC trace — R4 Id parameters stay declared kinds

**SPEC:** S04 R4 · **Cluster:** S04-C3 · **Steps:** S04-C3-2 above covers
both R3's and R4's concerns via the same grep (the SPEC's own two
requirements point at the same code path: `ResourceIdSchema` validation
immediately followed by the non-leaky 404).

## SPEC trace — R5 Node/edge plaintext exposure verdict (explicit)

**SPEC:** S04 R5 · **Cluster:** S04-C4 · **This requirement's OUTPUT is a
verdict — QA's call, not Architecture's (SPEC: "QA records a written
verdict... UNVERIFIED is not acceptable for mission close on this
requirement — the review must run").** Architecture's job here is to make
the review MECHANICALLY RUNNABLE, not to pre-empt its answer.

### S04-C4-1 — Assemble the review evidence set QA needs

**Cluster:** S04-C4
**File surface:** none (this step is a checklist of what QA must gather,
not new code)
**Change:** none — this PLAN step names the exact inputs S04-C4-2's
verdict depends on, so QA does not have to re-derive them:
1. The full `NodeSchema`/`EdgeSchema` field list (current bodies at
   `packages/contract/src/index.ts:424-442` and `:445-457`).
2 (**RESOLVED, round 2, B2 `t_9322ae7b` — not open, listed for QA's
   positive record**). `NodeSchema.disagreement: z.record(z.string(),
   z.unknown())` — an untyped bag QA does NOT need to sample, because it
   is no longer copied at all: S01-C2-1's `redactNodeForPublic` sets
   `disagreement: null` unconditionally for every published node,
   regardless of the real value, verified by S01-C2-8's residual test.
   Own trace of its producer (`packages/judgement/src/index.ts:352`, a
   `ledger.reduced_judgement` jsonb column alongside `panel_contract_hashes`/
   `dispersion`) and consumer (`apps/ui/components/NodeDetailDrawer.tsx:402`,
   rendered to the OWNER as a blind `JSON.stringify` dump with no semantic
   label) found it is an internal judge-panel diagnostic with zero
   contract anywhere in this codebase — the evidence FOR excluding it, not
   evidence of safety to include. QA may still spot-check S04-C1's
   node-carrier audit confirms no real `disagreement` content reaches a
   published debate, but the open QUESTION this checklist item originally
   posed is closed.
3 (**CLASSIFICATION RESOLVED upstream; QA implementation sample remains**).
   Follow S01/PLAN.md's S01-C2-0B value-provenance rule and field table:
   `NodeSchema.provenance_ref`, `EdgeSchema.provenance_ref`,
   `LabeledNumberSchema.provenance_ref` (all three reachable sites), and
   `NodeReviewSchema.provenance_ref` are REDACTED; `MakerLineageSchema.*`
   (including `.provider_ref`) is COPIED (VERIFIED) after producer traces
   to static per-deployment provider-slot identifiers. QA reads ACTUAL
   values from a tree-bearing published sample only to verify the shipped
   anonymous projection matches that settled classification; it does not
   re-open or repeat S01's producer trace. The current database's sole
   publication is legacy and lacks `tree_included`, so it cannot satisfy
   this live sample check; QA must record that product-truth gap rather than
   infer the widened path from the legacy response.
3b (**CLASSIFICATION RESOLVED upstream; QA implementation sample remains**).
   Follow the same S01-C2-0B table for
   `node.abstention.register_row_key` / `register_version` /
   `register_source_ref`: all three are COPIED (VERIFIED) policy/deployment-
   register citations, while the sibling `ledger_unknown_ref` is REDACTED.
   QA's sample-read checks that a tree-bearing anonymous publication matches
   those settled dispositions in practice; it does not re-derive whether
   the register fields are safe from schema names or a new producer trace.
   The legacy-only live database means this check is not yet observable
   end-to-end and remains QA's product-truth evidence gap, not this coding
   seat's verdict.
3c (**RESOLVED, round 2 — not open, listed for QA's positive record**).
   `node.locator` and `node.defeater_refs` — round 1 left both UNVERIFIED
   ("presumed intra-tree" / "could not verify"). The rework brief for B2
   explicitly rejected "presumed" as a shipping state, so both were traced
   to their real producers this round, not merely re-asserted: `locator`
   is the LLM prompt schema's citation field (`packages/judgement/src/index.ts:120-131`,
   *"Never invent evidence, citations, or sources... LOOKED_UP requires a
   resolving locator"*) — model-generated free text, never populated from
   an internal path anywhere in `packages/judgement`/`packages/graph`/`packages/serve`.
   `defeater_refs` is SQL-confirmed (`packages/serve/src/index.ts:2085-2093`,
   `ARRAY(SELECT incoming.source_node_id::text FROM core.edge ...)`) to be
   other nodes' `node_id` values from the SAME published tree — no new
   information beyond what the node array already discloses. Both COPIED,
   with evidence, not presumption; no residual test needed since neither
   is redacted or projected (see S01-C2-0B's table).
3d (**RESOLVED, round 2, B2 `t_9322ae7b` — not open, listed for QA's
   positive record**). `node.stranger_restatement` (`{check_status}.passthrough()`)
   — QA does NOT need to sample real data here, because the field is no
   longer copied wholesale: S01-C2-1's `redactNodeForPublic` rebuilds it
   as `{ check_status: node.stranger_restatement.check_status }` for every
   published node, discarding any other key by construction (a fresh
   object naming one field, never a spread), verified by S01-C2-7's
   residual test. This is the SAME closure mechanism used for a
   `.strict()` field's forbidden-key check, applied to a `.passthrough()`
   field by projecting instead of relying on the schema to reject extras
   (which `.passthrough()` never will).
3e (**CONFIRMED REDACTED, not open — B1, `t_70805572`**). `base_score.replay_handle`,
   `final_strength.replay_handle` (node-level) and `strength.number.replay_handle`
   (edge-level PRESENT arm), plus `abstention.ledger_unknown_ref` — all
   FOUR now redacted to a fixed constant by S01-C2-1's `redactLabeledNumber`/
   `redactNodeForPublic`/`redactEdgeForPublic`, verified by S01-C2-4/C2-5/C2-6's
   tests (the last a residual-handle sweep asserting none of the four
   original secret values survive into the published JSON). **Listed here
   per the rework brief's explicit instruction ("the field listed on the
   S04 anonymous-exposure checklist") so QA's R5 audit has a positive
   record of what was already closed, not just what remains open** — QA
   may still spot-check this in S04-C1 (the node-carrier audit test), but
   it is not a new classification question. Items 3/3b retain only QA's
   implementation sample check against S01's settled table; items 3c/3d
   are resolved outright.
4. `claim` (node) and any composed prose fields — the plain free-text
   content V's brief explicitly wants public ("you can see... the
   arguments"), which is the field SPEC R5 exists to adjudicate: can a
   debate participant's argument TEXT itself encode identifying
   information (e.g. a claim that quotes a real name, a real case
   number, a real address as part of the ARGUMENT'S SUBSTANCE)? This is
   inherent to what a debate about real-world claims contains, not a bug
   in this mission's schema design — flagged so QA judges it as a
   PRODUCT/CONTENT question, not a schema-shape question S04-C1 could
   have caught.
**Acceptance test:** this checklist exists in this PLAN file (it does,
above) — no further mechanical test; QA's own verdict-filing (S04-C4-2)
is the actual acceptance gate for R5.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): VERIFICATION-ONLY,
not mechanically runnable — self-checked by re-reading this PLAN's own
checklist rather than left undeclared.** Confirmed 2026-08-29: the
checklist (items 1-4 above, including 2/3c/3d marked RESOLVED and 3/3b
pointing to S01's settled classification plus QA's implementation sample)
is present in this file, above this line — GREEN, trivially,
since this step's "test" is the checklist's own existence in a document
this seat is actively editing.
**Failure it CATCHES:** QA re-deriving the same field inventory
independently (a token/time cost the packet explicitly asks to avoid
repeating) — this step exists to prevent exactly that.
**Failure it MISSES:** nothing — this step is preparatory, not a
verification in itself.

### S04-C4-2 — QA records the verdict with evidence

**Cluster:** S04-C4
**File surface:** a QA report path QA chooses and records in
`docs/missions/public-debate-access/slices/S04/DECISIONS.md` (per SPEC's
acceptance sketch item 3: "filed under this slice's PROGRESS or a linked
QA report path named in DECISIONS.md")
**Change:** (QA's, not Architecture's) — QA writes one of the three
allowed labels (`SAFE_UNDER_CURRENT_RULES`, `RISK_ACCEPTED_BY_V`,
`BLOCKED_NEEDS_REDACTION_OR_POLICY`) with evidence citing the S04-C4-1
checklist items.
**Acceptance test:** `grep -c "SAFE_UNDER_CURRENT_RULES\|RISK_ACCEPTED_BY_V\|BLOCKED_NEEDS_REDACTION_OR_POLICY"`
against whatever path DECISIONS.md names returns `≥1`.
**Category (REWORK ROUND 4, PLAN-03, `t_71699495`): FEATURE-ASSERTION —
pre-fix result UNVERIFIED by this seat, honestly, not fabricated.** This
command targets "whatever path DECISIONS.md names" a QA report — QA has
not yet chosen or created that path (this is QA's own future action per
S04-C4-2's own "Change: (QA's, not Architecture's)"), so there is no
target file for Architecture to run this grep against yet. Recording a
result here would require either guessing a path that doesn't exist or
running verification work outside Architecture's bounds — UNVERIFIED is
the correct, respected answer per `heartbeat-protocol` §2.7.
**Failure it CATCHES:** mission close being claimed while R5 is still
UNVERIFIED — SPEC explicitly forbids that; R6 (below) makes it a hard
gate, not a soft one.
**Failure it MISSES:** does not catch a RUSHED or shallow verdict that
technically files a label without real evidence review — the acceptance
test only checks a label string exists, not evidence quality; that is a
peer-review concern for whoever reviews QA's own work (§2.1: QA does not
review its own SPEC, and by the same law should not be the sole judge of
its own verdict's rigor without a check from elsewhere in the lattice).

### S04-C4-3 — If the verdict is `BLOCKED_NEEDS_REDACTION_OR_POLICY`, this PLAN does not itself resolve it

**Cluster:** S04-C4
**File surface:** none
**Change:** none.
**Acceptance test:** N/A — this step exists to state a boundary
explicitly: if S04-C4-2's verdict comes back BLOCKED, that outcome
reopens a PRODUCT/scope question (redaction design, or a policy decision)
that belongs on the V DECISIONS PACKET, not inside this Architecture PLAN
— Architecture's bound is "you decide HOW, never WHAT," and a redaction
POLICY is a WHAT. If this happens, the orchestrator adds a new row to
`docs/missions/public-debate-access/V-DECISIONS-PACKET.md`; this PLAN is
not the place that row gets resolved.
**Category (SCOPE-BOUNDARY thread, round 1, Finding 1, `t_5560836d`):
SCOPE-BOUNDARY.** Same shape as S03-C1-5 (`docs/missions/public-debate-access/slices/S03/PLAN.md`)
— a deliberate boundary statement, `Change: none`, no automated pass/fail
signal to categorize under the three test categories. Same remedy applied
to the class, not decided independently per instance — see this slice's
DECISIONS.md.
**Failure it CATCHES:** a future session trying to silently implement
redaction logic without a recorded V decision, reading this PLAN's
silence on the topic as license — this step exists to remove that
silence.
**Failure it MISSES:** nothing — it is a boundary statement, not a test.

## SPEC trace — R6 Mission close gate

**SPEC:** S04 R6 · **Cluster:** all · **Steps:** Orchestrator-enforced per
SPEC (not an Architecture or coding step) — S01/S02 are not
mission-closed while S04-C1 through S04-C4 are outstanding; S03 may ship
independently (SPEC's own carve-out, matching this PLAN's Single-writer
finding that S03 has no dependency on S01/S02/S04).

## Boundaries / ADRs

- **No ADR filed for S04.** All findings are mission-local; the one
  candidate for outliving the mission — whether `NodeSchema.disagreement`'s
  `z.unknown()` shape should ever be typed/validated — is explicitly a
  QA/V decision (S04-C4-3), not resolved here, so no ADR is warranted YET.
- Whether claim-text risk is accepted product behavior vs requires
  redaction: **not decided by this PLAN** — S04-C4-2/3 route it to QA
  then, if needed, to V. Any public-safe scoring/honesty projection: none
  introduced by S01/S02 (both PLANs explicitly avoid adding
  `cost_envelope`/`tier_provenance_ref`/scoring plumbing), so nothing new
  requires listing here.

## Single-writer check

S04 touches: new `tests/unit/pda-s04-node-carrier-audit.test.ts`, and a
QA-chosen report path (not yet named — QA names it in DECISIONS.md per
S04-C4-2). **No collision with S01 (`packages/contract/**`,
`apps/api/**`), S02 (`apps/ui/**` excluding `page.tsx`), or S03
(`apps/ui/app/page.tsx` only).** S04 reads (does not write)
`tests/architecture/s8-publication-contract.test.ts` for its regression
clusters (S04-C2/C3 run it, neither edits it). **S04 is blocked on S01**
(cannot audit fields that don't exist yet) but not on S02 or S03.
