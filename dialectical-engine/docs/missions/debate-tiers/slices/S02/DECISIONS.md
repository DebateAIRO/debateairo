# DECISIONS — S02 · The tier picks the fleet (append-only)

One line per decision: date · question · choice · reason · who ruled. Checked before any question
goes to V — a question answered here is re-asked to nobody. Never rewritten, only appended.

## Decisions taken

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-09 | Where does the tier filter the panel? | Inside `evaluateAskAdmission`, straight after `resolveDiscoveredPanel` (`apps/api/src/index.ts:1205`) | That function is the single place where the panel becomes `makers`, maker admission and `panelSize` (`:1206-1225`), and the only place whose typed errors are already marked as refusals (`markAskRefusal`, `:299-302`). Filtering later would leave `panelSize` computed from the wrong panel. | REQ |
| 2026-09-09 | What is the filter key? | `model_id` on `DiscoveredPanelMember` (`packages/db/src/index.ts:973-979`) | It is the field the probe fills with the model the target actually answers as (`apps/api/src/provider-discovery.ts:143-153`), and it is the string V's goal names (`gpt-5.6-luna`, `claude-sonnet-5`, …). `provider_ref` names the bridge, not the model, and would break the day a bridge is renamed. | REQ |
| 2026-09-09 | What HTTP status does an unavailable roster member produce? | `422`, via `TypedDomainError` → `markAskRefusal` → `AskRefusal` | `400`/`MALFORMED_REQUEST` means the body did not parse — the body here is perfectly valid. The existing branch already maps a refusal to 422 with the typed code and the real message (`apps/api/src/index.ts:506, 512-520, 530-533`), so the message can name the missing model without new plumbing. | REQ |
| 2026-09-09 | Does the panel size change the composition math? | No | `packages/register/src/index.ts:185-199` computes nodes and reviews from `panelSize` for any size ≥ 1. Two-model Free and three-model Premium are both already covered (contradiction C7). | REQ, from the intake |
| 2026-09-09 | Does S02 add UI for the refusal? | No | The message already travels: `ContractHttpError` keeps the server `message` (`packages/contract/src/client.ts:82-83`) and `/new` renders `exc.message` (`apps/ui/app/new/page.tsx:134-135, 155`). Acceptance step 6 proves the path rather than a new component. | REQ |
| 2026-09-09 | Which slice declares the rosters? | S01 (see `slices/S01/DECISIONS.md`) | S01 must render the model names on the selector, so it needs the declaration first; a second declaration here would let the screen and the fleet disagree. | REQ (charge 4) |
| 2026-09-09 | WHERE in `evaluateAskAdmission` does the roster check fire? | Immediately after the R3 filter and BEFORE `assertMakerAdmission` (`apps/api/src/index.ts:1216`) | Placed after `:1216`, an empty filtered panel throws `MAKER_INVENTORY_UNSATISFIED` first (`packages/critique/src/index.ts:334-339` throws iff `configuredMakers` is empty), so `POST /v1/asks` answers 422 with the wrong code and a message naming no model — and that is the ONLY acceptance path runnable before row V-7 is answered, because today the whole Free roster is missing. In the other direction, a Premium ask missing only `grok-4.6` leaves 2 members from 2 makers, `assertMakerAdmission` does not throw, and the run starts shrunk — which R9 forbids. Both failures are closed by the order and by nothing else. | REQ-FIX pass 2 (finding B1) |
| 2026-09-09 | Who writes down the R12 read-back command V runs in acceptance step 9? | The implementing seat, in its own READY handoff and self-report; the orchestrator relays it into `PROGRESS.md` and the review package | `PROGRESS.md` has one writer, the orchestrator (`slices/S02/PROGRESS.md:1`, `.claude/skills/heartbeat-requirements/SKILL.md:44`, `.claude/skills/heartbeat-orchestrator/SKILL.md:78`). A requirement that ordered the BUILD seat to write it left the seat a choice between crossing its file contract and leaving the command unrecorded — and step 9 is the only verification of R11 and row V-11, the row that decides whether a migration happens. An artifact the seat owns has neither problem. | REQ-FIX pass 2 (finding B4) |
| 2026-09-09 | Does a one-maker filtered panel refuse the ask? | No — it serves, with `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE` marks and `confidenceBandCapRequired` | `assertMakerAdmission` throws only on an EMPTY set of makers (`packages/critique/src/index.ts:334-339`, comment at `:332-333`). The two-maker threshold lives in `applyCriticUnavailableCap` (`:342-357`, called at `apps/api/src/index.ts:1230`), and `classification` is computed in the API at `:1210`, not in the critique package. R5's conclusion is unaffected — both rosters span two makers — but a BUILD seat would have written a test against the mechanism R5 named, and that mechanism did not exist. | REQ-FIX pass 2 (finding N4) |

## Alternatives rejected (the brainstorming discharge — nobody re-derives these)

| Rejected | Why |
|---|---|
| Substitute a healthy model for a missing roster member | The honesty law and contradiction C1: a debate that claims to be Premium and is not is worse than a debate that does not start. V's goal names the models exactly. |
| Start the run with the roster members that ARE available | Same reason, plus it silently changes the panel size and therefore the composition the register computed. |
| Fall back to the full discovered panel when a tier's roster cannot be met | It makes the tier decorative — the case where the tier matters most is the one where it would be ignored. |
| Infer the tier from the persisted `discovered_panel` instead of recording it | Two tiers can share a roster the day the fleet changes, and a run whose panel was later edited would answer wrongly. Row V-8 says the run records its tier. |
| Put `plan_tier` inside `askContract` (no migration) | For a `server` principal the ask contract is replaced by `CONTENT_JSON_SENTINEL` and encrypted into `content_ciphertext` (`packages/db/src/index.ts:1156-1170, 1201`), so the tier would not be plaintext-readable — and billing reading it later is the whole stated reason for recording it (C2 / row V-6). Opened as row V-11. |
| Filter in the runner or dispatcher instead of at admission | The refusal must happen before a run row exists (SPEC R8); by the runner, the row is already there. |
| Give each tier its own discovery target set in provider config | `.local/**` is V's, never a seat's (row V-7), and it would move a product decision into an untracked environment file. |
| Let the roster be resolved at request time from a database table | No such table exists, and no requirement asks for the rosters to change without a deploy. YAGNI — a declaration is one grep away from the truth. |

## Rows opened for V (routed through the orchestrator, never to V directly)

`V-ROW: V-11 · S02 · Where the run records its tier · Recommended default: a plaintext `plan_tier`
column on `core.run` beside `composition_budget_tier` (`packages/db/src/schema.ts:120`), with the
migration and an update to `core.create_encrypted_run` (`packages/db/src/index.ts:1182`). Evidence
against the cheaper placement: `askContract` is sentinel-replaced and encrypted for server
principals (`packages/db/src/index.ts:1156-1170, 1201`), so a tier stored there cannot be read by
billing or by V. S02 is already HIGH risk (`00-intake.md:20`), so the migration does not change its
classification. Smallest yes/no for V: "Add a plan_tier column to the run table?" · VERDICT column /
CONFIDENCE high / STRONGEST COUNTER: a migration on a shared dev database is the one step in this
mission that cannot be undone by reverting a branch — if V wants zero schema change, the honest
fallback is to record the tier nowhere and say so, not to hide it inside encrypted content.`

`V-ROW: V-12 · S02 · How the S02 lane gets `plan_tier` and the rosters · Recommended default: S02's
BUILD nodes start after S01 merges to `dev`, and the lane rebases onto it. Evidence: both lanes were
cut from `7f89f7b7` (`BASELINE.md:7, 40`) and S01 owns `packages/contract/src/index.ts`
(`INSTRUCTIONS.md`); if both lanes edit that file the merge conflicts in the one file whose shape
every other file depends on. Smallest yes/no for V: "May S02's build wait for S01's merge?" ·
VERDICT serialize / CONFIDENCE medium / STRONGEST COUNTER: it costs the parallelism the two lanes
were cut for — S02's ARCH, its RED tests and everything that does not name `plan_tier` can still run
in parallel, and only the clusters that touch the field wait.`

## Corrections appended at REQ-FIX pass 2 (2026-09-09) — the rows above stand as written, never edited

- **A `BASELINE.md` line citation went stale under an append, and this is a class, not a typo.** Row
  V-12 above cites "both lanes were cut from `7f89f7b7` (`BASELINE.md:7, 40`)". Line 7 still reads
  the `tiers-s01` HEAD; **line 40 no longer reads the `tiers-s02` HEAD** — five suite rows were
  appended to the `tiers-s01` section on 2026-09-09 at 21:00–21:02 (findings N3 and B2) and pushed
  that line down to **`BASELINE.md:45`**. The row's claim is unchanged and true; only the pointer
  moved. The same drift hit R14, whose `BASELINE.md:43-65` is corrected to `:48-70` in `SPEC-v2.md`, the
  v2 supersession. Two other citations were re-verified and are still correct: `S01/SPEC-v2.md` R21's
  `BASELINE.md:10-32`, and `BASELINE.md:7`.
  **The rule this yields, for every seat after this pass:** a line citation into an append-only file
  (`BASELINE.md`, `V-DECISIONS-PACKET.md`, any `DECISIONS.md`) is re-measured at the moment it is
  used and never carried forward from an earlier pass. Where the value is what matters, cite the
  value and the file, not the line — which is why the two suites R19 gained at this pass carry
  `57/57` and `8/8` rather than a line range.
  *Still open, and not this seat's file:* `V-DECISIONS-PACKET.md:18` carries the same stale
  `BASELINE.md:7, 40` inside row V-12. Orchestrator's file, orchestrator's fix.

## Orchestrator folds after REQ-REV pass 2 PASS (2026-09-09 22:07) — SPEC-v2.md stays frozen; this is the record where it is silent

- **N2 (REQ-REV-p2).** `tests/unit/api.test.ts` is 24 passed (24) at base on both lanes (`BASELINE.md`, end section). Under R3's roster filter three of its direct `evaluateAskAdmission` cases turn RED — `:137-143` (expects a resolve with a risk match against a fixture panel whose `model_id`s are not roster members), `:159-167` (expects `SINGLE-LINEAGE` from `fixtureDiscoveredPanel(1)`), `:169-177` (expects `STRUCTURAL_CEILING_INPUTS_UNRESOLVED` from `resolveEnvelopeBasis`, which R6's pinned order now precedes); `:179-186` is unaffected. These are EXPECTED and CAUSED by S02: the cluster that implements R3/R6 re-fixtures the three cases in the same cluster (roster-member `model_id`s in the fixture panel; the third case asserts `ASK_PLAN_TIER_MODEL_UNAVAILABLE`) and its command ends `24/24` — never "3 failed, pre-existing". The other R20-A suites have rows too: `contract` 7/7, `load01-live-proof` 1/1, `s7-authorization` 31/31, `evaluator-database` 21/21.

## Decisions taken at ARCH(S02) pass 1 (2026-09-09, seat ARCH-S02, ticket `t_57d602a5`) — appended, never rewritten

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-09 | Does the migration DROP and re-create `core.create_encrypted_run`? | No — `CREATE OR REPLACE` with the signature unchanged, and no `DROP FUNCTION` line | `migrations/0040_account_erasure.sql:6366-6369` grants EXECUTE on `core.create_encrypted_run(jsonb,uuid,uuid,jsonb)` to `debateai_content_provision`. A DROP discards that grant and every server-principal run creation then fails on a permission error — and no embedded-postgres test catches it, because those run as the schema owner. `0040:4255` drops only the older THREE-argument signature, which is why grants survived there. | ARCH (D-A1) |
| 2026-09-09 | Does the SQL function's key allow-list need the new key? | Yes — `'planTier'` joins the array at `migrations/0040_account_erasure.sql:4270-4275` | `p_run - ARRAY[…] <> '{}'::jsonb` returns false for ANY extra key. A payload carrying `planTier` against the old allow-list returns `created=false`, which `packages/db/src/index.ts:1214-1219` reports as `TypedDomainError("RUN_OWNER_INVALID", "The encrypted run intent is no longer active")` — an error that reads as an authorization fault and hides a schema fault. | ARCH (D-A2) |
| 2026-09-09 | Which write paths carry the tier? | BOTH — the encrypted path (`packages/db/src/index.ts:1184-1207` → the SQL function) and the LEGACY direct insert (`packages/db/src/index.ts:1242-1252`) | Row V-11 and SPEC R11 name only `core.create_encrypted_run` (`packages/db/src/index.ts:1182`). There is a second writer: for a non-`server` principal, `contentEnvelope` is null and `startRun` inserts into `core.run` directly. A single-path build leaves every legacy run's `plan_tier` NULL, and `tests/integration/evaluator-database.test.ts:1378-1384` submits exactly such a run. | ARCH (D-A3) |
| 2026-09-09 | Is the `plan_tier` column NOT NULL with a backfill, or nullable? | Nullable, no backfill, plus `CHECK (plan_tier IS NULL OR plan_tier IN ('free','premium'))` | `NOT NULL DEFAULT 'free'` would label every run already in the dev database as Free — a fabricated record in the one column billing is meant to read (C2 / row V-6), against the honesty law. Nullable also keeps cluster S02-C1 non-breaking for the 49 `startRun(` call sites measured at base. Routed to V as row **V-16** with this as the binding default. | ARCH (D-A4) |
| 2026-09-09 | Is `StartRunInput.planTier` required or optional? | Optional (`readonly planTier?: "free" \| "premium"`) | Required costs an edit at every one of the 49 `startRun(` call sites measured at base (14 test files plus `acceptance/dual-maker-proof.ts:139`), most in suites with no `BASELINE.md` row, inside a HIGH-risk slice. The loudness is bought back at the boundary instead: `AskRequestSchema` makes `plan_tier` required on the wire (S01 R12), there is exactly ONE production caller of `RunRepository.startRun` (`apps/api/src/index.ts:1293`, measured), and step S02-C4-S3 asserts both facts mechanically. | ARCH (D-A5) |
| 2026-09-09 | Does `packages/db` import the tier type from `@debateai/contract`? | No — an inline literal union in `StartRunInput`, and a test that compares it to the roster export | `packages/db/package.json` depends on `@debateai/crypto`, `@debateai/kernel`, `drizzle-orm` and `pg`; nothing in the repository points the store at the wire. The house seam for a shared value vocabulary is `@debateai/kernel` (`packages/kernel/src/index.ts:114-132` mints `RISK_TIERS`, `TIER_SOURCES`, `COMPOSITION_BUDGET_TIERS` with the comment "these vocabularies are minted once here"), and a kernel line is S01's to write, not S02's. Recorded durably as `ADR-0024`. | ARCH (D-A6) |
| 2026-09-09 | Where does the `api.test.ts` re-fixture live? | A local helper inside `tests/unit/api.test.ts`; `tests/support/discoveredPanel.ts` is NOT edited | 23 test files import that fixture (measured in the lane at `7f89f7b7`). Changing its `model_id`s would reach 22 suites unrelated to tiers, most without a `BASELINE.md` row. | ARCH (D-A7) |
| 2026-09-09 | Which cluster starts before S01 merges? | Exactly one — S02-C1, the migration and the store | It never reads `ask.plan_tier` and never names a model id, so it needs neither of S01's two exports. C2, C3 and C4 all do. Putting the longest, highest-risk cluster on the pre-merge path is what buys the parallelism row V-12's counter asks for. | ARCH (D-A8) |
| 2026-09-09 | Who applies migration 0061 to the LIVE dev database? | Nobody, as a step — the dev stack applies it at boot (`apps/runner/src/dev-auth-data-plane.ts:100` runs `operations.migrate()`) | Row V-11's strongest counter: a migration on a shared dev database is the one step in this mission that reverting a branch cannot undo. No seat runs `pnpm db:migrate` against `:55432`; every cluster verifies against a fresh embedded Postgres (`tests/support/testDatabase.ts:31-38`), and `.hermes/TOOLING-TRAPS.md:1041` records that pointing an acceptance harness at 55432 migrates the live database. | ARCH (D-A9) |
| 2026-09-09 | Does the third `api.test.ts` admission case change its assertion, as the N2 fold's parenthetical says? | No — it keeps `STRUCTURAL_CEILING_INPUTS_UNRESOLVED` and gains a complete roster panel; the new code is asserted in a NEW case instead | That case (`tests/unit/api.test.ts:169-177`) is the only test proving an ENVELOPE refusal reaches the 422 face. The fold's binding part — the cluster ends 24/24 and no seat dates these failures pre-existing — is met either way. Raised as finding **F-2** so `ARCH-REV` rules rather than a BUILD seat choosing in silence. | ARCH (D-A10) |

## Alternatives rejected at ARCH (the brainstorming discharge — nobody re-derives these)

| Rejected | Why |
|---|---|
| Filter inside `resolveDiscoveredPanel` (`apps/api/src/provider-discovery.ts:126-152`) instead of in `evaluateAskAdmission` | The resolver is memoised and shared across asks (`:155-165` keeps one in-flight promise), so it has no ask and therefore no tier. Filtering there would either break the sharing or filter every ask by the last ask's tier. |
| Add `PLAN_TIERS` / `PlanTier` to `packages/kernel/src/index.ts` beside `COMPOSITION_BUDGET_TIERS` | It is the right long-term home and this is why `ADR-0024` records it — but the tier vocabulary is inseparable from the roster keys, S01 owns the declaration, and S01's `SPEC-v2.md` R11 is frozen. Moving it mid-mission is a supersession plus a V ratification for one saved import. |
| Give `packages/db` a dependency on `@debateai/contract` so `StartRunInput` can import the tier type | It points the store at the wire; nothing in the repository does that today, and `contract` already depends on `kernel`, so the edge would be redundant as well as inverted. |
| `ALTER TABLE core.run ADD COLUMN plan_tier text NOT NULL DEFAULT 'free'`, then `DROP DEFAULT` | It writes `free` onto every historical run. See D-A4. |
| Edit `tests/support/discoveredPanel.ts` so its members are roster ids | 23 importers. See D-A7. |
| Assert R5's maker span by reading `.local/dev-auth/api.env` | The file is V's, carries authorization headers, and no seat reads or prints it (row V-7, `INSTRUCTIONS.md` §no-touch surface). |
| Compute the maker span from a model-id prefix (`gpt-*`, `claude-*`, `grok-*`) | It invents a mapping the repository does not have, and it would answer wrongly the first time one maker serves two families. See finding **F-1**. |
| Fold cluster S02-C4 into S02-C2 to save a node | C4 needs `StartRunInput.planTier` from C1; folding it into C2 would make C2 depend on C1 and serialise the only cluster that starts before S01's merge. |
| One cluster per SPEC requirement | R3, R4, R6, R7 and R8 are one control-flow change in one function verified by one command; splitting them would create five clusters that cannot each be green alone. |

## Rows opened for V at ARCH(S02) pass 1 (routed through the orchestrator, never to V directly)

`V-ROW: V-15 · S02 · How SPEC R5's "at least two distinct makers" is checked, given that the maker is
environment data and the roster declaration is model ids only · Recommended default: S02 asserts the
repo-side half (every roster has at least two members) beside the roster's consumer in
`tests/architecture/tiers-s02-rosters.test.ts`, and records that the maker span is
deployment-determined and already marked at runtime by `applyCriticUnavailableCap`
(`packages/critique/src/index.ts:342-357`) rather than refused. Evidence:
`packages/providers/src/index.ts:156-188` builds `providerRef → maker` from the configured target set
and `apps/api/src/provider-discovery.ts:143-150` copies it onto the panel member — there is no
model-id → maker map anywhere in `apps/` or `packages/`, so the check R5 places "next to the
declaration" has no repo data to read. Smallest yes/no for V: "Is 'every roster has at least two
members' the whole repo-side check?" · VERDICT build the repo-side half / CONFIDENCE high /
STRONGEST COUNTER: if V wants the maker span guaranteed rather than observed, the roster declaration
has to carry an expected maker per model id — that is S01's frozen R11, so a supersession plus a V
ratification, never an S02 step.`

`V-ROW: V-16 · S02 · What `plan_tier` says about the runs that already exist · Recommended default:
the column is NULLABLE and no backfill value is written, so a run started before migration 0061
answers empty rather than claiming a tier it never had. Evidence: the honesty law
(`INSTRUCTIONS.md`) — `ADD COLUMN … NOT NULL DEFAULT 'free'` would label every historical run in the
dev database as Free, a fabricated record in the one column billing is meant to read (C2 / row V-6).
Smallest yes/no for V: "Should pre-tier runs read empty rather than 'free'?" · VERDICT nullable, no
backfill / CONFIDENCE high / STRONGEST COUNTER: a nullable column cannot be enforced by the database
for new rows either, so "every product run carries a tier" rests on `AskRequestSchema` making
`plan_tier` required (S01 R12) plus the single-production-caller guard of PLAN step S02-C4-S3 — if V
wants the database itself to refuse a tier-less run, that is `NOT NULL` plus a decision about what
the existing rows are called, and it is a second migration.`

## Orchestrator corrections to its own N2 fold (2026-09-09 22:32, after ARCH(S02) F-2/F-3) — appended, the fold above stands as written

- **F-2.** The fold's parenthetical "the third case asserts `ASK_PLAN_TIER_MODEL_UNAVAILABLE`" was the orchestrator prescribing a remedy; it is WITHDRAWN. `tests/unit/api.test.ts:169-177` is the only test proving an envelope refusal reaches the 422 face; the plan keeps that assertion and puts the new code in a NEW case (PLAN.md §9 F-2). ARCH-REV(S02) rules on the design; the fold's binding part — `api.test.ts` ends 24/24 in the R3/R6 cluster with nothing dated "pre-existing" — is unchanged, with the count now 25 if a case is added.
- **F-3.** The fold under-counted by one case: `tests/unit/api.test.ts:283-405` also turns RED under R3 — it calls the real `PostgresAskApplication.submit`, and the roster refusal fires at `apps/api/src/index.ts:1284`, before the admission lease at `:1289`, so `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens and the `connectCalls`/`leaseQueries` assertions at `:355-366` break. Same cause, same cluster, same default-panel change (PLAN.md §9 F-3).
- **F-5 (packet defect, orchestrator).** ARCH-S02 charge 7's "roster-member `model_id`s in `fixtureDiscoveredPanel`" read as an order to edit `tests/support/discoveredPanel.ts`, imported by 23 test files; the plan keeps the helper local to `api.test.ts`. A packet relays a finding's facts; the remedy is the seat's.

## Orchestrator folds after ARCH-REV(S02) pass 1 (2026-09-09 23:04) — appended; PLAN.md is the ARCH-FIX seat's to revise

- **N3.** `PLAN.md:207` and this file's D-A9 cite `.hermes/TOOLING-TRAPS.md:1041`; that line exists only in the MAIN tree (3016 lines, dirty) — the lane copy at `7f89f7b7` has 1034 lines. TRAPS entries are cited by HEADING (`heartbeat-protocol` §3.8). The guard, verbatim from the main tree under the heading "2026-09-02 — orchestrator (war-plan session, Fable 5.1)":
  > - **`acceptance/standing-db.ts` adopts and MIGRATES any server answering on its port.** `acceptance/runtime-policy.test.ts` passes `ACCEPTANCE_DB_PORT=55432`. With compose up, that migrates the live dev database. Treat as a hazard until the Foundry fence (FIX-17) lands.
  Every seat in the S02 lane reads it HERE. The decision stands: nobody applies migration 0061 to the live dev database; the migration cluster proves itself on the embedded-postgres fixture only.
- **N5.** This slice's ADR is `docs/architecture/01-decisions/ADR-0024-plan-tier-storage-and-layering.md` (renumbered by the orchestrator at 22:32 from the packet-assigned 0023, which ARCH(S01) holds for `ADR-0023-globals-css-append-fence.md`). `PLAN.md:668` ("0023 is free") is false and is ARCH-FIX's to fix; the ARCH handoff and self-report carry an orchestrator annotation instead of an edit (verbatim records).
- **N10.** The three remaining members of SPEC R13's grep class — `dr181-ceiling` 3/3, `dr184-review-resilience` 6/6, `register-s09` 3/3 — now have BASELINE.md rows (both lanes); `register-version-boundaries` 6/6 had one since 22:32. PLAN.md §9's F-4 is discharged; the "run once to confirm" of `:542-544` compares against these rows.

