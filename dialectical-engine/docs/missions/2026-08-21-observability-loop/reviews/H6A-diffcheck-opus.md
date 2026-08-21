# H6A — independent Slices→ticket diff check (board `observability-loop`)

- **Mission / stage:** `2026-08-21-observability-loop` · H6A (independent ticketization diff check; spine §6 — ticketization must not be self-certified).
- **Seat:** Claude Opus, a **DIFFERENT SDK session** from the H6 ticketizer. Read-only on everything; this file is the only artifact written.
- **Authority read:** `planning/VerticalSlices.md` (599 ln, APPROVED, H5 5/5 PASS) — the sole authority for what the tickets must say.
- **Subject read:** all **42** created cards, re-read out of the store via `hermes kanban --board observability-loop show <id>` (`--board` before the verb on 100% of calls; `boards switch` never run; every call wrapped, no hang).
- **Claims verified, not trusted:** `planning/H6-selfaudit.md` was read and every quantitative claim in it was independently re-derived from the cards and the slices. Where H6's claim and the store disagreed, the store won.
- **Scope discipline:** only the slices↔ticket diff. Spine §5.3/§9 was opened solely to read the tier→review-path mapping and the immutable-floor definition that this checklist names; no other planning artifact, no unrelated board state.
- **Method:** all 42 card bodies dumped to files and machine-diffed against the slice text; the shared boilerplate blocks hashed across cards; the dependency graph extracted from each card's `parents:` field and re-derived from §4 independently of H6's edge table; the test-glob partition re-checked programmatically for prefix containment.

---

## 0. Checklist results

| # | Checklist line | Result |
|---|---|---|
| 1 | every approved slice maps to exactly one ticket (no slice dropped, no ticket invented) | **PASS** — 32/32 bijective |
| 2 | allowed / readonly / forbidden / verification contract matches the slice VERBATIM (incl. the five named safety-critical anchors) | **PASS** — all five anchors character-exact |
| 3 | dependency IDs and lineage match §4 merge order (re-derived, not copied) | **PASS** — 60/60 edges, 1 LOW asymmetry (H6A-01) |
| 4 | create / modify / extend file labels match the slice | **PASS** — 32/32 |
| 5 | no ticket authorizes self-Done, ticket-splitting, push/merge, DB deletion, or worktree ops outside the approved plan | **PASS** — 0 authorizations across 42 bodies |
| 6 | the Ready set is the small intentional set the self-audit declared | **PASS** — exactly 3, all `[V]`, all unassigned |
| 7 | `risk_tier` + reason on every ticket; routed path matches tier; immutable floor holds; nothing tiered down | **PASS** — 42/42 |
| 8 | test-surface globs match the slices' `tests:` clauses and remain collision-free | **PASS** — 34/34, zero collisions |
| 9 | the ten non-slice cards each trace to a named act in §4/§5 or the spine's mandatory H6 gate | **PASS** — 10/10 warranted, zero invented scope |

---

## 1. Slice → ticket bijection — re-derived, PASS (32/32)

`VerticalSlices.md` §1 declares exactly 32 slices (S01, S02, S03a, S03b, S04–S18, S18b, S19–S30 — the count §8/R-02 itself states as "its own 32 contracts"). The board carries exactly 32 cards bearing `[codex@gpt-5.6-sol] S<id>`. Mapping is one-to-one in both directions. **No slice dropped. No implementation ticket invented.**

**Deliverable coverage re-extracted from the 42 card bodies (not from H6's or H5's claim):** the 32 slice cards' `Deliverable(s):` lines yield **26 distinct deliverables** — D01, D02, D03, D04, D05a, D05b, D05c, D05d, D05e, D06a, D06b, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, D17, D18, D19, D20, D21 — and each card's deliverable matches its slice's `Lands:` line exactly. The six two-card deliverables (D02 S03a/S03b · D08 S18/S18b · D12 S22/S28 · D15 S29/S30 · D18 S14/S25 · D21 S16/S26) are the plan's own declared partitions, each carrying the slice's own "(scaffold part)/(core part)/(G1 part)/(G2 part)/(G3 part)/(G4 part)/(G5 part)" label.

**Lane assignment** matches §3's lane table on 32/32 (L1×1, L2×5, L3×2, L4×2, L5×2, L6×2, L7×3, L8×2, L9×1, L10×2, L11–L13×1, L14×2, L15–L17×1, L18×2).

**Gate assignment** matches §1 on 32/32, including the two non-uniform ones: S02 `G1 code; CONTENT PINNED AT G0 via Pg0-a` and S17 `**G0** (the Pg0-a pin is DRILLED here) / **G2** (files land with D08)`.

---

## 2. Contracts verbatim — PASS, with the five named anchors checked character by character

The shared boilerplate is **byte-identical across all 32 slice cards** (verified by hashing the extracted blocks: GLOBAL-FORBID → 1 unique hash over 32 files; GUARD-RAILS → 1 unique hash over 32 files). No card carries a privately weakened copy. The 10 non-slice cards correctly carry neither block (see H6A-03).

**Field completeness:** all 13 packet fields (`Lane / worktree / branch` · `Deliverable(s)` · `Gate (G0-G6)` · `contract.allowed` · `tests` · `contract.readonly` · `contract.forbidden` · `RED->GREEN …` · `Depends-on` · `Blocked-behind` · `risk_tier` · `Review path` · `Traceability`) present on **42/42** cards, including SPIKE-D1 whose omitted `RED->GREEN` line was appended as a labelled `H6 CONTRACT ADDENDUM` comment rather than left out — the addendum is present on `t_c1a85dfd` and is falsifiable in both directions (five RT-18 answers for PASS; three kill criteria; `SPIKE-D1-exit.md` must exist for a kill to exit).

### 2.1 `:193-235` zone-route-mount GLOBAL-FORBID — **EXACT**

Card text (identical on all 32):

> `apps/api/src/index.ts:193-235 — the ` + "`zone-route-mount region`" + ` (H5-01 BLOCKER): the ` + "`if (options.registration !== undefined)`" + ` block and the three zone route mounts inside it (/v1/auth/register :205-216 · /v1/auth/verify-email :217-225 · /v1/auth/resend-verification :226-234), each dispatching into ./registration.js (imported :45). NO slice may write inside this range; any new mount goes strictly after the block closes.`

Every load-bearing token matches §0 exactly: range `:193-235`, the three mount ranges `:205-216` / `:217-225` / `:226-234`, the import anchor `:45`, the syntactic block predicate, "no slice may write inside this range", "strictly after the block closes". The only clause not carried is §0's cross-reference sentence naming S04's manifest as enumerating the same three mounts — and that obligation is carried on S04's own card (`apps/api/src/index.ts:193-235 AS THE MOUNT-LIST SOURCE, READ-ONLY (the manifest enumerates these three routes; it never edits them)`). **Nothing operative was dropped.**

The correction propagated correctly to the two slices H5-01 named:
- **S08** `contract.forbidden:` → `the zone-route-mount region :193-235 (GLOBAL-FORBID; H5-01) · the obs-client-report-mount line (S09 / TP-4, post-:235) · apps/api/src/registration.ts.` — verbatim.
- **S09** `contract.forbidden:` → `the zone-route-mount region :193-235 (GLOBAL-FORBID; THIS IS THE H5-01 CORRECTION — round 0 wrongly granted ~:205-234 here) …` — verbatim.
- Independent grep across all 42 bodies: **`~:205-234` appears as a write grant in ZERO cards** — it appears only inside S09's forbid clause as the named historical error, exactly as the slice states.

### 2.2 S09's byte-identity assertion — **EXACT**

Slice: *"an architecture test asserts `apps/api/src/index.ts:193-235` is byte-identical to its pre-slice state."*
Card `t_3c54fdeb`: `**ZONE-INTEGRITY ASSERTION (new, H5-01):** an architecture test asserts apps/api/src/index.ts:193-235 is BYTE-IDENTICAL to its pre-slice state.`
Range, mechanism, and "pre-slice state" all exact. TP-4's grant on the same card is also exact, including the syntax-authoritative clause: `**STRICTLY AFTER the ` + "`if (options.registration !== undefined)`" + ` block closes** (:235 at dc9fd57) … **SYNTAX IS AUTHORITATIVE**: the insertion point is 'after the registration block's closing brace', NEVER a line number inside it.`

### 2.3 `:587-603` identity block — **EXACT**

GLOBAL-FORBID (all 32): `packages/db/src/identity.ts and its re-export block packages/db/src/index.ts:587-603 (:587 opens, :588 auditEvent, :589 channelBinding).` — the H5-09 two-line correction is carried with all three line anchors. Additionally present in S01's and S07's own `contract.forbidden:` as `the identity re-export block :587-603`. The card omits only §0's parenthetical explaining *why* round-0's `:590-603` under-covered — an explanation, not a contract term.

### 2.4 TP-2 EOF append after `:603` — **EXACT**

S01 `contract.allowed:` → `TP-2 packages/db/src/index.ts region ` + "`obs-reexport`" + ` — an APPEND after :603 (EOF; the file is exactly 603 lines), NEVER an edit inside the identity block :587-603 (H5-09).` Character-for-character against §1 S01 and §2's TP-2 row. S07's `contract.forbidden:` correctly names the same region as another slice's (`packages/db/src/index.ts region **obs-reexport** (S01 / TP-2, EOF append)`).

### 2.5 S11 whole-file + `:371-385` — **EXACT**

Card `t_7efcd635`: `packages/providers/src/index.ts — **THE WHOLE FILE, PER §P.2 (definitive)**. Working region is call() **:195-386**, which MUST INCLUDE the post-loop exhaustion throws :371-379 (ProviderContentUnacceptedError) and :380-385 (ProviderCallFailedError). (H5-02: round-0's :195-290 … EXCLUDED THE ONLY SITE … the attempt loop opens :213 and closes :370.)` — whole-file grant, working region, both exhaustion-throw ranges, the exception class names, and the loop bounds all exact. GREEN restates the emit site as `:371-385`, matching.

### 2.6 S05's `vitest.config.ts` forbid — **EXACT**

Card `t_6e99d607` `contract.forbidden:` → `package.json (S03a) · src/zone/** (S04) · src/registry/** (S02) · **vitest.config.ts** (§P grants it to no deliverable — R-01) · **inventing an apps/evaluator-worker/** surface** — §P grants none (see DECIDE-V row G5-V1, carried on the LANE PLAN card, NOT resolved by H6).` Both R-01 additions present. The R-01 "§P path deliberately left unused" reasoning is carried on the card. `vitest.config.ts` additionally appears as a GLOBAL-FORBID bullet on **all 32** slice cards, and S16's G1-acc-8 restates `**NO vitest.config.ts EDIT IS REQUIRED OR PERMITTED**, R-01`. **No card grants any write to `vitest.config.ts`.**

### 2.7 Full sweep of all 32 `forbidden:` lists

Every item in every slice's `forbidden:` clause is present on its card, with no item dropped, softened, or re-scoped. Spot-critical cases all hold: S07 (obs-reexport + `:587-603` + S06's two runner regions) · S06 (`buildSchemaRepairPacket :883-890`) · S12/S13 (the reciprocal root-`package.json` line forbids `:16`/`:12`) · S18 (dispatch-arm region + the six sibling subtrees) · S18b (every S18 region + any mutation/landing surface) · S21 (chain **write** keys; verify keyring only) · S22/S28 (reciprocal obsctl region forbids) · S23 (`SendmailMailSender` · ntfy) · S24 (any Hatchet log text · Hatchet on the capture path) · S27 (subagents · authoring the injection corpus) · S29/S30 (the entire OBS-R104 set; S30 additionally `main`).

### 2.8 The clauses H5's rework specifically produced — all carried

- **S12** GREEN carries the deleted-"clean tree" restatement with the real census `556 throw new · 176 catch · 56 bare catch {` and names the checked-in baseline as the gate's GREEN evidence.
- **S18** carries the full **FLAG-CONDITIONED DORMANCY** clause with the first-party-quantified maturity statement, and names the round-0 cross-source formulation as the forbidden silent narrowing.
- **S24** and **S26** carry the kill-path re-quantification, including S26's `**ALL SOURCE-QUANTIFIED STATEMENTS READ 'FIRST-PARTY SOURCES' WHILE THE ROW-14 DEFERRAL HOLDS.**`
- **S13** carries the H5-12 "EXPLICITLY NOT CLAIMED" root-`typecheck` caveat, and **S09** carries the same caveat as a labelled non-blocking NOTE.
- **S30** alone carries the RT-42 interim-honesty-stamp constraint (`this constrains S30 ALONE, not the G1 build slices`); grep confirms `UNTRACKED-DEV` appears on only two cards — S30 and P0, the latter as a forward-pointing note that names S30 as the constrained slice. Correct placement.
- **S17** carries the three deferred slots as declared-unset with their RP-1/RP-2/RP-3 gate ids, and forbids populating them.
- **S03a** carries the sole-owner scaffold framing and the H5-08 split rationale.

### 2.9 GLOBAL-FORBID consolidation (recorded, not a defect)

The card block has **nine** bullets where §0's GLOBAL-FORBID list has eight. The ninth is `vitest.config.ts`, which §0 states as law in its own sentence ("No slice edits `vitest.config.ts`") per R-01; and the tests bullet is merged with §0's GLOBAL-TEST-SURFACE rule that `tests/support/**` is readonly to all lanes. Both are **tightenings sourced from §0**, not additions. See H6A-08.

---

## 3. Dependency IDs and lineage — re-derived from §4, PASS (60/60)

The graph was extracted from each card's stored `parents:` field and independently re-derived from §4/§5, **without reference to H6's §3 table**. The two agree edge-for-edge; total in-degree summed over 42 cards = **60**, matching H6's claim.

Re-derivation, §4 locus → edge, all confirmed present in the store:

| §4 / §5 locus | Required edges | Store |
|---|---|---|
| spine LANE PLAN gate + `P0 … ← Lane 0`; §5 matrix row "all coding lanes" | V-LANEPLAN→S01, P0→S01 | ✓ |
| step 2 `[after L1, Pg0-a]`; §3 in-lane order S03a→S02→S03b→{S04∥S05} | S01→S03a, Pg0-a→S02, S03a→S02, S02→S03b, S03b→S04, S03b→S05 | ✓ |
| `RP-1 … [after L2]`, hashing what S04 **produces** (H5-04) | S04→RP-1 | ✓ |
| step 3 binding wave off the **L1+L2 base** (L2 terminals = S04, S05) | S04/S05→S06, →S08, →S10 | ✓ (6) |
| in-lane single-writer serialization L3/L4/L5 | S06→S07, S08→S09, S10→S11 | ✓ |
| step 4a **HARD** `Depends-on: L3,L4,L5` (lane terminals S07/S09/S11) | S07→S12, S09→S12, S11→S12 | ✓ |
| in-lane L6 (TP-6 `:16` vs TP-7 `:12`) | S12→S13 | ✓ |
| step 4 "G1 tail — fixed order" 4a→4b→4c + in-lane L7 | S13→S14, S14→S15, S15→S16 | ✓ (see H6A-06) |
| step 5, after `══ G1 COMPLETE ══` (S16 **is** the G1 gate) | S16→SPIKE-D1, SPIKE-D1→RP-2 | ✓ |
| step 6 `[after L2]` + Pg0-a reproduction + G2 opening | Pg0-a→S17, S05→S17, S16→S17 | ✓ |
| step 7 `[after L1, L9]` (L1 transitive through the L2 chain) | S17→S18 | ✓ |
| step 8 listener wave off the L10 base | S18→S19/S20/S21/S22/S23/S24 | ✓ (6) |
| step 8f "ONLY if SPIKE-D1 passed" + §5 matrix row S24 | RP-2→S24 | ✓ |
| step 9 `L7 S25 ∥ L8 S26`, in-lane L7 + the surfaces S25's plists supervise | S15→S25, S18→S25, S21→S25 | ✓ (see H6A-01) |
| S26 `readonly: listener surfaces S18–S24` | S19/S20/S21/S22/S23/S24→S26 | ✓ (6) |
| step 10 G3 entry, after `══ G2 COMPLETE ══` (S26 **is** the G2 gate) | S26→CORPUS, CORPUS→RP-3 | ✓ |
| §5 matrix row S27: corpus + RP-3 + G2 accepted | CORPUS→S27, RP-3→S27, S26→S27 | ✓ |
| step 11 "**MUST follow S27**"; §5 matrix row S18b | S27→S18b | ✓ |
| step 11 `∥ L14 S28`, in-lane after S22; §5 matrix row S28 | S22→S28, S26→S28 | ✓ |
| step 12 after `══ G3 COMPLETE ══` (= S18b + S28) | S18b→G4-ENTRY, S28→G4-ENTRY | ✓ |
| step 13 | G4-ENTRY→S29 | ✓ |
| steps 14/15 | S29→G5-ENTRY, G5-ENTRY→S30 | ✓ |

**Sum = 60. Zero cycles** (the graph is a DAG; topological consistency confirmed by walking it). **Zero invented edges** — every edge traces to a §4 step, a §5 blocked-matrix row, an in-lane single-writer rule, or a stated readonly surface.

**Parallelism preserved exactly where §4 grants it:** no edge exists between S04↔S05 (`{S04 ∥ S05}`), between L3/L4/L5 (step 3a/3b/3c), among S19–S24 (step 8a–8f), or between S25↔S26 (step 9 `∥`), or between the S27→S18b chain and S28 (step 11 `∥`).

**Every §5 blocked-slice-matrix row is encoded:** all 32 slice cards are transitively downstream of S01, which is downstream of P0 (the "all coding lanes behind P0 ROW-GIT" row) — verified by walking the graph, not asserted. S02/S17 behind Pg0-a ✓. S04 correctly carries **no** Pg0-a block (it *produces*, per H5-04) ✓. S18 correctly carries **no** SPIKE-D1 edge (it ships; it is flag-conditioned, not blocked) ✓ — this is the row H5-07 rewrote, and H6 got it right.

**Status set matches the blocked-matrix hard gates:** the 9 `blocked` cards are exactly S24, S27, S29, S30, RP-1, RP-2, RP-3, G4-ENTRY, G5-ENTRY.

---

## 4. Create / modify / extend labels — PASS (32/32)

Every granted path carries an explicit disposition in the slice's own wording. Creates: `(new)` on S01 (`migrations/0034_obs_foundation.sql`, `packages/db/src/obs-schema.ts`), S02, S03a, S03b, S04, S05, S09 (`global-error.tsx`, `error.tsx`, `lib/obs/**`, `obs-client-report.ts`), S12, S16. Modifies: `single ... linkage line` (TP-1), `single edit` (TP-6, TP-7), `first-import line` (TP-3, TP-5), `single registration line` (TP-8), `ONE NEW MOUNT LINE` (TP-4), `rewire, 38 ln` (ScoringErrorBoundary), `18 ln — amendment paragraph` (S15), `WHOLE FILE, 24 ln` (S10), `THE WHOLE FILE, PER §P.2` (S11), named regions with line anchors (S06, S07, S08). Extends: `APPEND after :603 (EOF)` (TP-2), `additive REGION ownership` (S18b, S28, S30), `ADDITIVE TO S16` (S26), `DISTINCT FILES from S14's` (S25). **No card labels an edit as a create or a create as an edit.**

---

## 5. Prohibitions — PASS (independently scanned across all 42 bodies)

Independent regex sweep for authorization-shaped language over all 42 card bodies:

| Pattern | Hits |
|---|---|
| `git push`, `may push`, `may merge`, `mark it/this done`, `split this ticket`, `decompose`, `DROP TABLE`, `DELETE FROM`, `--force` | **ZERO** |
| `TRUNCATE` | 1 — S01, in the **assertion** `reject_mutation + BEFORE TRUNCATE triggers reject update/delete/truncate (RT-06)` |
| `DELETE` | 1 — S01, in the **assertion** `NO role holds DELETE (RT-28)` |
| `self-Done` | 1 — S15, in the **prohibition** `The worker never self-sends and never self-Dones.` |
| `git worktree add`, `force push` | 1 card — LANE PLAN, in **prohibitions**: `no agent may run git worktree add for ANY lane before this row is approved`; `destructive git ops (worktree remove, branch delete, history rewrite, force push) are NEVER covered by this approval` |

The GUARD-RAILS clause is byte-identical on all 32 slice cards and states in full: no push, no merge, no marking its own work Done, no database deletion, no ticket-splitting, no worktree/branch operation outside the V-approved LANE PLAN at `authority_epoch 1`; V performs every merge (OBS-R129); with no approved lane plan covering the lane, STOP and post a blocker — never create a worktree speculatively.

**S29/S30 push/auto-merge machinery correctly bounded:** both carry an `IMPORTANT SCOPE NOTE (VerticalSlices.md §7)` stating the pipeline is the **product's runtime behaviour**, built but not exercised by any mission lane, and explicitly not an authorization for the Codex lane to push, merge, or auto-merge its own work. S30 additionally forbids `main`.

**Worktree containment verified at the store level, not just in prose:** all 42 cards carry `workspace: scratch` and `assignee: -`. No card resolves to a `.worktrees/obs-lane-*` path, so a claim cannot materialize a lane worktree, and no dispatcher can spawn a worker before the LANE PLAN row is approved.

---

## 6. Ready set — PASS (exactly the declared set)

Store state at this check: `ready` **3** · `todo` **30** · `blocked` **9** · `running` **0** · `done` **0** (of the 42 created). The three `ready` cards are exactly the three the self-audit declared — `t_24c2f95d` LANE PLAN APPROVAL, `t_e909faf2` P0 ROW-GIT, `t_192aaea9` Pg0-a — all `[V]`, all human-ops, all parentless, all **unassigned**. The self-audit's honest record of the dispatcher auto-promoting these three (`--initial-status blocked` overridden because they have no open parents) is consistent with the store; H6 did not use the `promote` recovery path.

The designed post-gate Ready set is **one** card, `t_1fde033d` S01 — confirmed by graph walk: S01's only parents are the two V cards, and every other slice sits behind at least one real edge.

*(The pre-existing H6 card `t_8677d3d6` now reads `done` in the store, so it is no longer in the ready set; the self-audit §6's parenthetical describing it as `ready` is stale but was true when written. Pre-existing card, not H6's write, not a finding.)*

**Pre-existing cards untouched:** 12 done planning cards were read only; none appears in the created set; none was edited, completed, archived, or re-linked by anything in this diff.

---

## 7. `risk_tier`, review path, and the immutable floor — PASS (42/42)

**Tier set with reason on 42/42.** Distribution: **high 39 · medium 2 · low 1 · missing 0.**

**Routed path matches tier on 42/42**, against spine §5.3's mapping:
- 29 high slice cards + SPIKE-D1 + CORPUS → full review diamond (§7) + product-truth gate + V acceptance, peer-review-first in a distinct session. (31 high, agent-worked.)
- 8 `[V]` cards → V's own act / V gate / dual-custody custodian act, **no agent verdict**. (8 high, human-worked.) 31 + 8 = 39 high. ✓
- 2 medium (S14, S25) → one independent reviewer (peer-review-first, §9) then the Claude Opus verifier seat.
- 1 low (S15) → direct verifier diff review, same-cycle Done by the verifier seat (§9 triage case (a)); worker never self-sends and never self-Dones.

**No high card is routed to a medium or low path; no card is routed below its tier.**

**Immutable floor holds; nothing tiered down.** Spine §9 states the floor **per ticket** ("any ticket touching persistence or migrations, provider spend, security/auth, scoring semantics, live/product data, or destructive/architectural work is `risk_tier: high` and was NOT tiered down") — so a ticket firing no category may lawfully be medium or low. I re-tested each of the three non-high cards against all six categories from its own `contract.allowed` rather than from H6's reasoning:

- **S14 (medium)** — `tools/obs-listener/launchd/**` plist templates + install doc. No schema, no migration, no model call, no credential/key/switch/policy-bundle surface, no product data read or written, no architectural boundary moved (launchd-as-external-liveness-owner was settled upstream at §H.2 / SPIKE-U06). **No category fires.** The card carries the explicit six-category check and states why it is not `low` (these plists supervise long-lived *product* runtimes).
- **S25 (medium)** — same artifact class, disjoint files (`obs-daemon`, `watchdog` plists). **No category fires.** Card carries the six-category check and the not-low reason (the watchdog↔daemon mutual heartbeat is a named G2 acceptance item).
- **S15 (low)** — one 18-line markdown amendment paragraph in an existing README, `tests: none`, zero runtime effect. **No category fires.**

**No file path contradicts its tier.** The only cards granted `migrations/**` (S01), `packages/db/**` (S01, S07), `packages/providers/**` (S11), `apps/api/**` (S08, S09), `apps/runner/**` (S06, S07), `apps/scheduler/**` (S10), `apps/ui/**` code (S09), `packages/kernel/**` (S07), root `package.json` (S12, S13), `tools/obs-listener/policy/**` (S17), `…/obsctl/**` (S22, S28), `…/watchdog/**` (S21), `…/worker-diagnosis/**` (S27), and `…/{worker-fix,landing}/**` (S29, S30) are **all `high`**. The two medium cards write only `tools/obs-listener/launchd/**`; the one low card writes only a `.md` file.

**Coder roster:** all 32 implementation cards carry `[codex@gpt-5.6-sol]`; the two agent-run gate cards carry `[claude-opus]` (SPIKE-D1 read-only; CORPUS independence-constrained); eight carry `[V]`. **No implementation ticket is routed to a non-Codex seat and no gate/spike/precondition ticket is routed to Codex.**

---

## 8. Test-surface partition — PASS (34/34, collision-free)

Programmatically re-extracted from the cards' `tests:` fields and diffed against §1's per-slice `tests:` clauses:

- **34 declared glob entries, all 34 distinct**; every entry matches its slice's `tests:` clause verbatim, suite for suite.
- **Cross-slice prefix containment: NONE.** Machine-checked every ordered pair: no slice's `obs-l<LANE>-<SLICE>-` prefix is a prefix of another slice's. The two adversarial cases both hold — `obs-l1-s01-` ∌ `obs-l10-s18-…` and `obs-l10-s18-` ∌ `obs-l10-s18b-…` — because the delimiter is a hyphen; the S18 and S18b cards each state this explicitly.
- **Lane segment matches the owning card's lane on 34/34; slice segment matches the owning card's slice on 34/34.**
- **Exactly two `tests: none`, each with the slice's own reason** — S03a (scaffold; correctness proven by S02/S03b/S04/S05 resolving their imports) and S15 (documentation).
- **S05's two entries** are both `architecture` and the first (`obs-l2-s05-import-graph.test.ts`, the IC-1 home) is a named instance nested inside the second's glob — same slice, so no cross-slice conflict. The card states this precisely and flags that §0's "spans suites" enumeration (S09, S18, S21) is non-exhaustive of multi-*entry* slices. This is the cosmetic item H5 routed to H6 as explicitly non-blocking; it is absorbed on the card with **no slice text changed**.
- **No card declares a test path outside its glob**, and no card grants a write to any of the 110 pre-existing test files or to `tests/support/**` — both are in the byte-identical GLOBAL-FORBID on all 32.

---

## 9. The ten non-slice cards — PASS (10/10 warranted, zero invented scope)

| Card | Warrant re-verified in the slices / spine |
|---|---|
| `t_24c2f95d` `[V]` LANE PLAN APPROVAL + planning-graph image | Spine's mandatory H6 gate (`LANE PLAN APPROVAL (H6)`; worktree create/use is V-gated, one packet row per mission) + intake A4's planning-graph IMAGE gate. Card grants only V's decision, forbids `git worktree add` before approval, and excludes destructive git ops from the approval's coverage. Also carries the mission's single open DECIDE-V row **G5-V1** with all three of §6's options and no H6 resolution. |
| `t_e909faf2` `[V]` P0 ROW-GIT reconciliation commit | §4 `P0 … ← Lane 0`; §0 closure target & push law; §5 matrix row "all coding lanes". Acceptance = orchestrator verifies HEAD ancestry before dispatching L1, exactly as §4 requires. |
| `t_192aaea9` `[V]` Pg0-a G0-COMPLETE pin set | §4 `Pg0-a G0-COMPLETE PINS (dual-custody)` + H5-04 adj. (b). Its input list matches §4's enumeration item for item; forbids pinning any of the three deferred slots. |
| `t_850d02f6` `[V]` RP-1 zone-manifest re-pin | §4 `RP-1 ZONE-MANIFEST RE-PIN … [after L2]`; §5 matrix row S04 (**produces**, never reproduces). |
| `t_c1a85dfd` `[claude-opus]` SPIKE-D1 | §4 step 5 + §5 "**Never a coding lane**". Carries all five RT-18 questions, the three kill criteria, the three ordered kill acts with the declared output path `research/SPIKE-D1-exit.md` and the "a kill CANNOT exit without this artifact" rule, and §5's full blast-radius table. |
| `t_fbefa222` `[V]` RP-2 hatchet_ingest slot set | §4 step 5 `RP-2`; §P.3's `SPIKE-D1 → D06b pin` edge; forbids setting the slot at G0 as the row-14 silent narrowing. |
| `t_62bb1131` `[claude-opus]` INJECTION CORPUS | §4 step 10 (independent adversarial QA seat); S27's `readonly:`/`forbidden:` make the independence a contract term, and the card forbids authorship by any Codex lane or by S27's implementer. |
| `t_16fe7321` `[V]` RP-3 injection_corpus_hash pinned | §4 step 10 `RP-3`. |
| `t_e22e5562` `[V]` G4 ENTRY hard gates | §4 step 12 — all three enumerated conditions carried as separately falsifiable items; §5 matrix row S29. |
| `t_39ca2ba7` `[V]` G5 ENTRY | §4 step 14 — the four register values + the allowlist-growth dual-custody drill; §5 matrix row S30. |

**Every §4/§5 named act is accounted for.** The acts deliberately not given their own card are each carried inside a card body or are structurally covered:
- The SPIKE-D1 kill-exit **new-mission intake candidate** (§4 step 5 act (ii)) is carried, with owner and declared output path and the "cannot exit without it" rule, on **three** cards — SPIKE-D1, RP-2, and S24. Verified present on all three.
- `G1/G2/G3 COMPLETE` markers get no cards because S16 and S26 **are** those gates; both cards say so on their `Gate` line, and the graph confirms G2 entry hangs off S16 and G3 entry off S26.
- The `dialectical-engine-v2ui` rename is correctly **not** minted (OBS-R100 separate micro-ticket); S13's `forbidden:` bars bundling it.
- §5's **SPIKE-U06** containerized-topology gate is correctly not minted (§5: "in no G-gate ship list", "blocks NOTHING", closed today on the interim binding); it is referenced on the S14 and S25 cards. See H6A-07 for the bookkeeping gap.

**Nothing exists on the board without a warrant. No card is a slice in disguise, and no non-slice card carries a code obligation.**

---

## 10. Findings

### H6A-01 — LOW — S25's step-8→step-9 ordering is only partially encoded

**Cards:** `t_af6161bf` (S25). **Slice locus:** §4 step 9 `9.  L7  S25   ∥   L8  S26`, following step 8's six listener lanes.

**Mismatch:** §4's numbered steps are the **merge order**, and step 9 follows step 8 in that order. For S26 H6 encoded this fully (all six of S19–S24 are parents). For S25 it encoded only three parents — S15 (in-lane L7), S18 (the daemon its plists supervise), S21 (the watchdog its plists supervise) — leaving **S19, S20, S22, S23, S24 as non-ancestors**. S25 can therefore become ready, and be merged, ahead of five lanes that §4 lists before it.

**Why LOW, not higher:** S25's file contract (`tools/obs-listener/launchd/**`, distinct files from S14's) is disjoint from all five, so no write collision is possible; its GREEN needs only the daemon and watchdog, which it has edges to; §4 itself separates "may run in parallel" from "merge in the listed order", and merge order is V's to enforce per §0; and the S25 card records its position as `Merge order §4 step 9`. The defect is the **asymmetry** with S26's full encoding, not a reachable hazard.

**Suggested resolution (orchestrator's call, no rework required):** either add S19/S20/S22/S23/S24→S25 for symmetry with S26, or record in the LANE PLAN that S25's merge position is enforced by V rather than by the edge set.

### H6A-02 — LOW — two card bodies undercount the actionable human-ops set

**Cards:** `t_24c2f95d` (LANE PLAN), `t_e909faf2` (P0). Both `Depends-on:` lines read *"none — this is one of the **two** immediately actionable human-ops cards on this board."*

**Mismatch:** there are **three** parentless, `ready`, unassigned `[V]` cards — LANE PLAN, P0, **and Pg0-a** (`t_192aaea9`, which itself declares `Depends-on: none` and `Blocked-behind: human ops (V + second custodian)`). The self-audit §6 correctly says three; two card bodies say two. Card text only; the store state and the Ready-set check both pass. Risk: a reader of either card alone could miss that Pg0-a is actionable now.

### H6A-03 — LOW — the two agent-run gate cards carry neither GUARD-RAILS nor a "no agent verdict" clause

**Cards:** `t_c1a85dfd` (SPIKE-D1), `t_62bb1131` (INJECTION CORPUS).

**Mismatch:** the GUARD-RAILS block (which carries the explicit "NO marking its own work Done" prohibition) is on 32/32 slice cards and 0/10 gate cards. For the eight `[V]` cards that is correct — they are human acts and each states "No agent verdict" / "V's own act". But SPIKE-D1 and CORPUS are **agent-worked** cards, and neither states "No agent verdict", nor carries any self-Done prohibition. The self-audit §5's blanket claim *"Gate cards state 'No agent verdict' / 'V's own act'"* holds for **8 of 10**, not 10 of 10.

**Neither card authorizes a prohibited act** — both are routed to "full review diamond + V acceptance", which puts Done outside the worker's reach, and both carry tight `forbidden:` lists (SPIKE-D1: no code, migration, config, worktree, branch, no writes to Hatchet; CORPUS: no product code, no policy-bundle write). So the checklist line passes on substance. The gap is that the prohibition is implied by routing rather than stated, on exactly the two non-slice cards where an agent does the work.

**Suggested resolution:** append the GUARD-RAILS clause (or at minimum "the seat never marks this card Done; V accepts") to those two cards.

### H6A-04 — LOW — LANE PLAN card body states a status the store does not hold

**Card:** `t_24c2f95d`. Body: *"Blocked-behind: human ops (V). Status `blocked` per the CLI's R3-gate convention."* Store status: **`ready`** (dispatcher auto-promotion, since the card has no open parents).

The self-audit §6 records the auto-promotion honestly and argues the outcome is correct (ready + unassigned cannot spawn a worker — confirmed here: `assignee: -` on 42/42, `workspace: scratch` on 42/42). The card body simply was not updated to match. Cosmetic; no authority consequence.

### H6A-05 — INFO — self-audit §10 overstates the low/medium path exclusion

Self-audit §10 asserts: *"No `low` or `medium` card touches `apps/`, `packages/`, `migrations/`, root config, or any OBS-R104-set path."* S15 (`low`) writes `apps/ui/lib/observability/README.md`, which is under `apps/`. The **tier is still correct** — an 18-line markdown amendment is not code and fires no floor category, as the card's own six-category check states — but the sentence as written is false. Recorded because H6A exists to catch unverified self-claims; no ticket change needed.

### H6A-06 — INFO — the G1 tail is serialized where §4 grants no explicit parallelism

Edges S13→S14→S15→S16 chain L6→L7→L8. §4 step 4 reads "G1 tail — **fixed order**" and, unlike steps 3, 8, 9 and 11, carries neither the `∥` marker nor the phrase "parallel worktrees". H6's chaining is therefore the **conservative literal reading** — it forfeits potential L7∥L8 parallelism but cannot cause a collision, and it satisfies S16's transitive readonly dependency on S01–S11 through S12's hard L3/L4/L5 edges. Recorded as a deliberate tightening, not a mismatch.

### H6A-07 — INFO — SPIKE-U06 is absent from the "deliberately NOT minted" ledger

§5 names a standalone **"containerized-topology binding"** gate (owner: the L7 ops family) that must close before any obs component runs inside a container. It correctly received **no card** — §5 places it "in no G-gate ship list", says it "blocks NOTHING", and records U-06 as CLOSED today on the interim binding, so minting a card would have invented mission scope. But the self-audit §2's "Deliberately NOT minted" ledger enumerates only the kill-exit intake candidate, the G1/G2/G3 COMPLETE markers, and the v2ui rename — it does not account for SPIKE-U06. Bookkeeping gap in the self-audit only; the ticket set is right. (SPIKE-U06 *is* cited on the S14 and S25 card bodies.)

### H6A-08 — INFO — GLOBAL-FORBID on the cards is a nine-bullet consolidation of §0's eight

The card block adds `vitest.config.ts` as its own bullet and folds `tests/support/**` into the pre-existing-tests bullet. Both come from §0 itself (`vitest.config.ts` from R-01's "No slice edits `vitest.config.ts`" law; `tests/support/**` from §0's GLOBAL-TEST-SURFACE). Strictly a **tightening sourced from the authority**, byte-identical across all 32 slice cards. Recorded so the count difference (9 vs 8) is not mistaken for drift on a later read.

### Also verified and clean (no finding)

- **RP-1/RP-2 preceding the bundle's landing (S17 at §4 step 6).** §4 places RP-1 `[after L2]` and RP-2 at step 5, both before S17's files land, while S17 must ship all three slots **declared-unset** and is forbidden from populating them. This tension lives in the **approved artifact**; H5's round-2 explicitly cleared "RP-1 placement" and "RP-3 editing the landed bundle" as non-regressions carried forward untouched. H6 wired no RP→S17 edge, which is the reading consistent with S17's own contract, and the RP-1 card says so in terms: *"the physical write ordering is the custodian's to sequence"*. Correct handling; no ticket defect.
- **DECIDE-V G5-V1** — exactly one row, unresolved, carried on the LANE PLAN card body with all three of §6's options and an explicit "H6 did NOT resolve it and did NOT contact V". No second row minted. S05's `forbidden:` bars inventing the `apps/evaluator-worker/**` surface, exactly as §6/H5-11 require.
- **Board hygiene** — every call in this check used `--board observability-loop` **before** the verb; `boards switch` was never run; the global pointer (live sibling mission) is untouched; nothing was created, edited, completed, archived, linked, unlinked, or promoted by H6A.

---

## VERDICT

Independent, session-distinct re-derivation of all 42 cards against `planning/VerticalSlices.md`: slice→ticket coverage is bijective at 32/32 with 26/26 deliverables and no invented scope; the ten non-slice cards each trace to a named §4/§5 act or the spine's mandatory H6 gate; all 60 dependency edges re-derived from §4 independently of H6's table match the store edge for edge with zero cycles and parallelism preserved wherever §4 grants it; every `allowed`/`readonly`/`forbidden`/verification contract is verbatim, with all five named safety-critical anchors verified character by character — `:193-235` GLOBAL-FORBID (byte-identical on 32/32, `~:205-234` appearing as a write grant on **zero** cards), S09's byte-identity assertion, the `:587-603` identity block with all three line anchors, TP-2's EOF append after `:603`, S11's whole-file grant including `:371-379`/`:380-385`, and S05's `vitest.config.ts` forbid; zero prohibition breaches across 42 bodies with GUARD-RAILS byte-identical on 32/32 and `workspace: scratch` + `assignee: -` on 42/42; the Ready set is exactly the three declared `[V]` human-ops cards resolving to a one-card designed set; `risk_tier` + reason on 42/42 with the six-category floor re-tested per ticket and nothing tiered down; and 34/34 test globs matching the slices with machine-verified zero prefix collisions.

Findings: **0 BLOCKER · 0 MAJOR · 0 MEDIUM · 4 LOW (H6A-01..04) · 4 INFO (H6A-05..08)**. No LOW finding touches a file contract, a forbid boundary, a tier, a review route, or the authority model; none blocks a Codex launch. H6A-01 through H6A-04 are card-text and edge-symmetry improvements the orchestrator may apply at its discretion without re-gating.

```
H6A PASS
```

Precise mismatch, for the record: the only divergences from the authority are (1) **H6A-01** — S25 (`t_af6161bf`) carries parents S15/S18/S21 but not S19/S20/S22/S23/S24, so §4 step 9's position after step 8 is enforced for S26 but only partially for S25; (2) **H6A-02** — `t_24c2f95d` and `t_e909faf2` say "one of the **two** immediately actionable human-ops cards" where the board holds **three** parentless ready `[V]` cards; (3) **H6A-03** — `t_c1a85dfd` and `t_62bb1131`, the two agent-worked gate cards, carry neither the GUARD-RAILS clause nor a "no agent verdict" statement, making the self-audit §5's blanket gate-card claim true for 8 of 10; (4) **H6A-04** — `t_24c2f95d`'s body says "Status `blocked`" while the store holds `ready`. None of the four is a slice↔ticket contract mismatch.

---

*H6A complete. Both `HERMES STEP 6 SELF-AUDIT PASS` and `H6A PASS` are now recorded. No worktree may be created until V approves the LANE PLAN row at `authority_epoch: 1`, and P0's HEAD ancestry must be verified before L1 is dispatched.*
