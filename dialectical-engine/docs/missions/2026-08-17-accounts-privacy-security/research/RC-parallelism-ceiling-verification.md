# R-C — Adversarial Verification of the Execution Topology (Wave 4)

Blind research seat, 2026-08-19. Read-only. Attacks the 3-lane parallelism ceiling and the file-contention matrix.

## VERDICT: **TOO OPTIMISTIC — hidden couplings**

The 3-lane ceiling is not conservative; it is **unreachable as specified**:

1. **Lane B is not disjoint from Lane A.** The single claimed "genuine parallel win" (S6 alongside S4→S5→S7) rests on a matrix cell asserting S6 does not edit `apps/api/src/index.ts`. **That cell is wrong** — S6's content-write path runs through that file.
2. **Three global serializers are absent from §4.2 entirely**, and two conflict *silently* (git merges clean, then the build or DB breaks). They bind harder than the named chokepoint.

Separately the paper is **too pessimistic** on the critical path (8 is a slicing artifact, not a codebase property — a free re-cut gives 7, arguably 6), and **§2's central factual premise is false**: the file is not 311 lines.

## 1. The chokepoint file as it actually is

`apps/api/src/index.ts` is **638 lines, not 311**. §2 conflates the file with `buildApi` (`:125-311`). The remaining ~330 lines are the application layer — exactly where the topology's reasoning fails.

| Region | Lines | Contents |
|---|---|---|
| Imports + interfaces | 1–96 | `AskApplication`, `ApiOptions`, `AskRefusal`, `MalformedRequestError` |
| Shared helpers | 97–123 | `parseRequest`, `markAskRefusal`, **`resolveSession` :113-123** |
| `buildApi` | 125–311 | error handler `:127-159`, then 15 inline route registrations |
| `HatchetDispatcher` | 313–337 | — |
| `RunCreationSettings` / `evaluateAskAdmission` | 339–406 | — |
| **`PostgresAskApplication`** | **408–638** | `submit`, `readAnswer`, `readRun`, `readDeployment`, `events` |

15 routes at `:161,167,178,184,212,220,231,243,257,264,271,279,293,299,305`; `resolveSession(...)` appears **exactly 15 times**, once per handler.

### 1.1 The conflict is one idiom × 15 sites, not one file — which guts S0

| Slice | Region | Conflict class |
|---|---|---|
| S3 / S4 / S10 | **append** new routes before `return api;` `:310` | Adjacent-append; trivial, mechanical |
| **S5** | **rewrites `resolveSession` :113-123** + all 15 call sites | Semantic, whole-file |
| **S7** | **deletes all 15 auth lines**, inserts one `preHandler` near `:127` | Semantic, whole-file |
| **S9** | **deletes `resolveSession`** and remnants | Semantic, whole-file |
| S8 | `:212-218`, `:220-229` filters | Localized, disjoint from S3/S4/S10 |

Splitting `buildApi` into five route modules converts "S5 and S7 both edit one file" into "S5 and S7 both edit **all five** files." **S0 helps only S3/S4/S10 — the cheap conflicts — and helps nothing expensive.**

### 1.2 S6 DOES edit `apps/api/src/index.ts` — the matrix's load-bearing error

Five of S6's eleven carriers are written from call sites inside this file:
`:428` `recordQuery(ask.question_line, …)` · `:430-432` `startRun({questionLine, …})` → `core.run.question_line` · `:447-454` `askContract{…steering_annotations}` → `core.run.ask_contract` · `:457-465` `recordMemoryQuestion({questionLine,…})` → `memory.question_key` · `:516-518` `recordInvestigationRequest({…userInput})`.

Even with ciphering inside `packages/db`/`serve`, **the DEK must be resolved from the session and threaded through these signatures** — an edit to `PostgresAskApplication` `:408-638`. S0 as scoped relocates only `buildApi`, leaving `PostgresAskApplication` in place, so **S0 does not decouple S6 either.**

**Consequence: Lane A and Lane B are not file-disjoint; §1.3's step-4 "first true parallelism" row is invalid as drawn.**

## 2. Corrected matrix — missed rows, by danger

| File | Slices | Risk | Why it matters |
|---|---|---|---|
| **`tools/orphan-audit/src/index.ts:9-37`** | S1,S4,S6,S7,S10 | **CRITICAL** | The `rows` table (27 entries) is the allowed dependency-edge whitelist. `packages/crypto` needs a row **and** must join every consumer's allow-list (`:30` for `apps/api`, plus db/serve/memory/ledger/judgement/runner). Every crypto-consuming slice edits the same 28-line array |
| **`tests/architecture/scaffold.test.ts:23`** | S1 (+all above) | **CRITICAL** | `expect(report.edgeRowsChecked).toBe(27)` — hard-coded. Creating `packages/crypto` makes it 28. **Every lane's `pnpm test` goes red until one lane lands this one-line change** |
| **migration number allocation** | S2,S6,S7,S8 | **CRITICAL (silent)** | `packages/db/src/index.ts:125` discovers migrations by `readdir().sort()` — lexicographic, no manifest. Two worktrees both claiming `0031_*` produce **no git conflict**; apply order becomes alphabetical by suffix and the applied-set is keyed on filename (`:137-142`), so renumbering re-runs migrations. **Already happened in-tree: `0025_dr184_derived_standing.sql` and `0025_evaluator_domain_refusal_receipts.sql` both exist.** Wave 4's "migrations are new files → no contention" is its most dangerous claim |
| **`acceptance/seed-register.ts:298-323`** | S1,S4,S7 | **CRITICAL (runtime, worktree-proof)** | `register_version` written `ON CONFLICT DO NOTHING` with `row_count`; `:322-323` throws `ACCEPTANCE_REGISTER_VERSION_CONFLICT` if stored ≠ current. **Any slice adding a register row invalidates every other lane's seeded standing DB.** Shared *database state* — worktree isolation does not help |
| **`packages/liveness/src/index.ts:121-127`** | S6 | **HIGH (functional break)** | `SELECT run_id FROM core.run WHERE question_line = $1 AND asker_id = $2` — **equality match on plaintext**. Encrypting silently makes it never match. Package absent from the matrix *and* from Wave 3's S6 list |
| **`packages/memory/src/index.ts:285-296`** | S6,S7 | **HIGH (functional break)** | `canonical_question_text` inserted then self-JOINed for memory match tiers. Same destruction. Needs blind indexes → S6's real size exceeds "L" |
| `packages/evidence/src/index.ts:295,331,350` | S6 | MED | `excerpt`, `query_text` — covered by S6's text but absent from the matrix |
| **`web/lib/api.ts:28-44`** | S5,S9 | **HIGH** | Byte-identical duplicate of the vulnerability S5 removes at `apps/ui/lib/api.ts:98-116`. `web` **is a live workspace member** and an audited edge row. Fixing only `apps/ui` ships the hole |
| **`web/app/api/[...path]/route.ts:40-42`** | S5 | **HIGH** | Same blanket header copy forwarding `Cookie` upstream. The `web/` copy's test is **live**; `apps/ui`'s is `.disabled` |
| `packages/register/src/runtime-environment.ts` | S1 **and S6** | MED | S1 adds `KEK_PATH` to `loadApiEnvironment:34`; **S6 encrypts in `apps/runner`, so `loadRunnerEnvironment:54` needs the KEK too.** Matrix says `S1 | none` |
| root `vitest.config.ts:14` | Phase-1 infra **and Phase 4** | MED | Both need the same one-line `include` change |
| 9 further `x-user-dev-token` files | S9 | LOW–MED | 62 occurrences across 15 files; matrix names 6 |

**Rows the matrix got right:** `packages/serve` MED ✓ · `packages/contract/src/index.ts` MED ✓ (and `contractInventory` is additive-safe — `tests/unit/contract.test.ts:17` uses `arrayContaining`; only the `routes` array `:505-518` is adjacency-conflict) · `packages/contract/src/generate.ts` is **not** contention (40-line build script, outputs gitignored) · `next.config.mjs`, `AuthGate.tsx`, `client.ts` LOW cells ✓ · `tests/unit/api.test.ts:556-561` verified — really does assert an arbitrary string yields 200 + `caller_scope: "ASKER"`.

## 3. Architecture invariants — the real tripwires

- **"exactly one `ProviderGateway`"** (`orphan-audit:453,490`) — no risk; no identity slice declares it.
- **"no `process.env` outside `runtime-environment.ts`"** (`:455`) — raw substring test over `packages/`,`apps/`,`tools/` excluding `apps/ui` (`:112`). **Even a comment mentioning it goes red.** S1's design already honors this.
- **`edgeRowsChecked === 27`** — the real tripwire (above).
- **`auditMigrationReplaySafety`** (`:415-434`) scans all migrations every run: bare `ADD COLUMN`/`ADD CONSTRAINT`/`CREATE FUNCTION`/`CREATE UNIQUE INDEX` without idempotence guards are blocking. S2/S6/S7/S8 must comply — a shared gate, not a conflict.
- **Switch-exhaustiveness** (`:478`) — new `switch` needs `default:` + `exhaustive()`. Affects S3/S5/S7.

**Phase 4 is *mostly*, not *fully*, independent:** the only subprocess spawn is `acceptance/relay-core.ts:89` (so containment really is confined) — but `acceptance/review-catch-up.ts` is a declared production entry point feeding the reachability walk (`scaffold.test.ts:38-68`), and Phase 4's "acceptance suite in the default run" edits `vitest.config.ts:14`, after which **every Phase-1 lane runs `acceptance/ceremony.test.ts`, which authenticates by `x-user-dev-token` (`:475-480`) — so S9's token removal breaks the default test run on both boards simultaneously.**

## 4. Critical path: 8 is arithmetically right, wrong as a floor

Longest chain is genuinely 8; alternatives are 6 and 7. But **"no number of agents shortens it" is false — a re-cut does:**
- **`S4→S5` is not a real edge.** Sessions/cookies/CSRF/headers need users (S3), not enrolled factors; only the MFA challenge *inside login* needs S4. Split **S5a** (sessions/CSRF/headers; deps S2,S3) from **S5b** (MFA step-up). S4 then runs parallel to S5a → **depth 7**.
- **`S5→S7` is questionable.** Wave 3's own S7 rollback note says runs stay reachable via the dev token until S9 — i.e. S7 works under the *old* auth. Policy table, `preHandler` skeleton and `owner_user_id` need S3, not S5; only "`caller_scope` from session" needs S5 → split as S7b → **depth 6**.

**True minimum ≈ 6–7.** The document presents a slicing artifact as a codebase property — the same error it warns against.

## 5. Attacking from the optimistic side

- **S6 decomposes by package** — once `packages/crypto` exists and the edge-row/scaffold change lands **once**, S6a (`ledger`+`judgement`), S6b (`runner`), S6c (`memory`+`liveness` blind indexes) are file-disjoint → 3 concurrent sub-lanes. **S6c is the big one and the plan doesn't know it exists.**
- **UI splits cleanly from API** — register pages, enrolment screens, `AuthGate`/`next.config.mjs`, delete flow all under `apps/ui/`, a tree excluded from the source-rule audit and touched by no engine slice. A dedicated UI lane can work against contract schemas ahead of handlers.
- **`tests/security/` is greenfield** — zero contention; writable against the spec before implementation.

**Instantaneous ceiling is 5–6, not 3** — but only if the three unlisted serializers are managed out-of-band. **The binding constraint is not a lane count; it is that three files nobody listed must be edited by one lane, first, alone.**

## 6. Recommendation: do NOT take S0 as specified — take S0′

**Safety of S0 is better than expected:** audit `entryPoints` are hard-coded literals (`orphan-audit:593-596`), not route-derived, so moving routes won't break `scaffold.test.ts:100-102`; `apps/api/package.json` exports `./src/index.ts` and all 30+ importers take `buildApi`/`PostgresAskApplication` from the package root, so re-exports keep them working; no test asserts a route count. Real size **S-to-M, ~190 lines moved**.

**But the benefit is largely illusory** (§1.1) — and it doesn't decouple S6 (§1.2).

**S0′ — genuinely enabling, similar size:**
1. **Land the deny-by-default `preHandler` FIRST**, before S3, replacing all 15 `resolveSession(...)` sites with one hook under *existing* dev-token semantics. This is the actual serializer; collapsing 15 sites to 1 makes S5/S7/S9 small and non-overlapping, and pulls S7's hardest mechanical work off the critical path.
2. **Land `packages/crypto` skeleton + its edge row + `scaffold.test.ts:23` → 28** as a standalone first commit, so no lane trips the gate.
3. **Establish a migration-number allocator** (claimed-numbers ledger, or one lane owns `migrations/`). Non-negotiable — the `0025` duplicate proves the failure mode is live.
4. **Establish a register-row freeze window** and re-baseline protocol before S1/S4/S7 touch `register.register_row`.

Only after (1) does splitting into route modules become worth doing, and by then it is cosmetic.

## 7. What Wave 4 got wrong — itemized

1. **§2:** the file is **638 lines, not 311** — describes `buildApi` only, and the omission is load-bearing.
2. **§1.2/§4.2:** the S6 row for `apps/api/src/index.ts` is blank and **should be ✎** — invalidates "Lane B is the one genuine parallel win" and the schedule's step 4.
3. **§1.2:** "migrations are new files per slice → no contention" — **false and dangerous** (readdir ordering, no manifest, duplicate `0025` already in tree, invisible to git).
4. **§4.2:** `tools/orphan-audit/src/index.ts` and `tests/architecture/scaffold.test.ts` absent — the highest-contention files once `packages/crypto` exists.
5. **§4.2:** `acceptance/seed-register.ts` absent; `packages/register/src/index.ts` rated `none` when it is a cross-lane runtime serializer.
6. **§4.2:** `packages/liveness` and `packages/evidence` missing entirely; `liveness:121-127` is a *functional* break, not a merge conflict.
7. **§4.2:** `runtime-environment.ts` is S1 **and S6**.
8. **§4.2/§3:** `web/` invisible, yet it duplicates exactly the two vulnerabilities S5 exists to remove, in a live workspace member with live tests.
9. **§3/§5:** Phase 4 is *mostly*, not *fully*, independent (`vitest.config.ts`, `review-catch-up.ts` reachability, and the S9↔ceremony collision).
10. **§1.1:** "eight deep, nothing shortens it" — a slicing artifact; 7 with a free re-cut, arguably 6.
11. **§2:** "S0 pays for itself immediately" — it helps only the three cheapest conflicts and doubles the file count for the three expensive ones.
