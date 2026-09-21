# PLAN — S01 · A Free debate is made public by the server and cannot be made private again

**Revision 2** — ARCH-FIX-S01-02 after ARCH-REV-S01-p1 REWORK (`docs/missions/free-public-debates/reviews/ARCH-REV-S01-p1.md`). Assigned findings B1 B2 B3 B4 B5 N1 N2 N3 N4 N5. Steps changed: C1-S1, C1-S3, C1-S9, C1-S12 · C2-S1, C2-S3, C2-S4, C2-S5, C2-S6, C2-S7, C2-S10, C2-S12, C2-S15, C2-S18, C2-S19, C2-S20 · C3 Files/intro · C4-S1, C4-S2, C4-S4 · §1.1 (`apps/api/src/main.ts`) · §6 SV-0, SV-1 · §7 N1/N3 rows · ADR-0026 decision 4. P1–P8 named, not fixed.

**Revision 3** — ARCH-FIX-S01-03 after ARCH-REV-S01-p2 REWORK (`docs/missions/free-public-debates/reviews/ARCH-REV-S01-p2.md`). Assigned findings B1-p2, N1-p2, N2-p2, N3-p2 (last lawful pass). Steps changed: C2-S3, C2-S4, C2-S5, C2-S6, C2-S18, C2-S19 · C4-S2 · §1 parallelism (C4 waits on C2). P1–P8 named, not fixed.

**Revision 4** — ARCH-FIX-S01-C4GAP after BUILD-S01-C4 PLAN-GAP (`docs/missions/free-public-debates/reviews/BUILD-S01-C4-PLAN-GAP.md`). Assigned finding G1. Steps changed: C4-S2, C4-S4. File map: still only `migrations/0068_bound_published_erasure.sql` plus the two C4 test files (0068 now also `CREATE OR REPLACE`s `core.enforce_publication_v2_ref_binding`; C2's `0067` is not edited). C1/C2/C3 steps untouched.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development`. RED first on every cluster. The coder is Codex gpt-5.6-sol. Clusters are BUILD units, not review units; `REV(S01)` runs once, after every cluster is green three times (worst run counts).

**Goal:** A Free run created after this slice ships is published by the server when its answer is served, cannot be unpublished, and can be deleted by its creator while public. Premium and every run that exists at deploy keep today's behaviour.

**Architecture:** A boolean `core.run.free_public_rule` (DEFAULT false; both create paths write true for new runs) plus `plan_tier='free'` is `bound`. System publish is a new `SECURITY DEFINER` function that takes no session and no grant (ADR-0026). Unpublish 409 is an HTTP-layer refusal after a live grant, so the grant is not consumed. Delete-while-public is a carve-out inside `core.prepare_private_run_erasure` with the signature unchanged.

**Tech Stack:** TypeScript, Fastify, PostgreSQL `SECURITY DEFINER` functions, Drizzle column on `core.run`, Vitest + Testcontainers/embedded postgres, `run-suites.sh`.

**Spec:** `docs/missions/free-public-debates/slices/S01/SPEC-v3.md` (**SPEC of record**, frozen at REQ-FIX-03's READY, pass 3 — the cap). `SPEC.md` and `SPEC-v2.md` are superseded and stay byte-identical. Binding set: I-1…I-4 and **V-1…V-10**. What changed at v3, and is therefore the only part of this plan that needs re-reading: §1's definition of the **served answer** (row **V-10** — *any* answer-serving route, not one named route), R-4's and R-9's Checks (swept off a single route), R-6's Check (rewritten), and acceptance steps 3b/3c/11b/11. Requirement ids are unchanged: exactly R-1…R-25.

## Global Constraints

- `ui: no` — no file under `apps/ui` is written (R-24). No `## Screens` block.
- No new contract route (R-23). Policy table stays at 52 entries. `s7-authorization` stays RED on the named test with the same expected/actual pair (expects 50, finds 52).
- No REQUIRED key on `PublicDebateSchema` (R-22.1). `published_at` in the envelope equals the snapshot row's `createdAt` ISO string (R-22.2).
- Owner-driven `core.transition_run_publication` signature stays 14 parameters. Redefinitions are `CREATE OR REPLACE`, never `DROP` then `CREATE` (ADR-0024, ADR-0026).
- New SQL is measured under `SET ROLE debateai_runtime` (system publish, bound predicate) or `SET ROLE debateai_erasure_runtime` (erasure). Superuser-pool green is not evidence (TOOLING-TRAPS: "Embedded postgres with a superuser pool is privilege-blind").
- Lane cwd for every product command: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine`. Shared runner: `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh` (never restate its contract). Exact repository paths, never fuzzy Vitest filters.
- A test path a step CREATES is omitted from the ARCH base run. A missing path in a BUILD command that nothing in this plan creates is BROKEN.
- Banned in any done-criterion: improve, better, robust, handle, appropriate.
- JSON bodies below are labelled EXACT or CONTAINS.

---

## 1. Clusters — build units, one verification command each

A cluster is the smallest group of steps that is verifiable on its own. It is a BUILD node; it is not a review unit. The review unit is the whole slice, once, at `REV(S01)`. Each cluster's command is run three times and the worst run is the one that counts.

Parallelism: **C1 first. Then C2. Then C3 ∥ C4.** C3 waits on C2 because both write `apps/api/src/index.ts`. C4 waits on C2 because `0068`'s contention gate and C4-S2 cases 7–8 read `serve.system_publication_key_provision_intent` (created in `0067`) and C2-S4's claim/complete cleanup (B1-p2).

`RUNNER` below means:

```text
LOG=<abs log, one file per run, never overwritten> \
  /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh
```

cwd = the S01 lane. `N` / `P` / `M` / `Q` / `U` / `E` / `D` are the passed counts of the new files after that cluster is green; BUILD updates the pair as tests land. ARCH base omits those files.

| cluster | name | steps | verification command (one) | notes |
|---|---|---|---|---|
| S01-C1 | Binding column and predicate | C1-S1…C1-S14 | `$RUNNER tests/integration/fpd-s01-c1-binding.test.ts:N:0 tests/integration/fpd-s01-c1-privileges.test.ts:P:0 tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0` | New files omitted at ARCH base. Regression suites asserted GREEN at their intake counts. |
| S01-C2 | System publish, outstanding, `publish_pending` | C2-S1…C2-S22 | `$RUNNER tests/unit/fpd-s01-c2-auto-publish.test.ts:M:0 tests/integration/fpd-s01-c2-system-publication.test.ts:Q:0 tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1` | Database suite is a DELTA: the named corpus-key test stays the only failure. |
| S01-C3 | Unpublish 409 after a live grant | C3-S1…C3-S10 | `$RUNNER tests/unit/fpd-s01-c3-unpublish-http.test.ts:U:0 tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1` | `s7` DELTA: named test stays the only failure, expected 50 actual 52. Depends on C2 (`index.ts`). |
| S01-C4 | Delete a bound published run | C4-S1…C4-S12 | `$RUNNER tests/unit/fpd-s01-c4-erasure-http.test.ts:E:0 tests/integration/fpd-s01-c4-delete-published.test.ts:D:0 tests/unit/s10-erasure-http.test.ts:8:0` | After C2 (0067 table + cleanup). Erasure role `debateai_erasure_runtime`. |

ARCH base-run scripts (new files omitted) live under `.hermes/reports/free-public-debates/probes/ARCH-S01/`. Verdicts: §8.

Mutant class each command detects: §7.

### 1.1 Single-writer file map

| file | owner |
|---|---|
| `migrations/0066_free_public_rule.sql` | C1 |
| `packages/db/src/schema.ts` | C1 |
| `packages/db/src/index.ts` (`startRun`, `migrate` untouched, new export) | C1 |
| `packages/db/src/free-public-binding.ts` (new) | C1 |
| `tests/integration/fpd-s01-c1-binding.test.ts` (new) | C1 |
| `tests/integration/fpd-s01-c1-privileges.test.ts` (new) | C1 |
| `docs/architecture/01-decisions/ADR-0026-system-publication-without-grant.md` | already written by ARCH-S01; BUILD does not edit |
| `migrations/0067_system_run_publication.sql` | C2 |
| `packages/db/src/publication.ts` | C2 |
| `apps/api/src/publications.ts` | C2 |
| `apps/api/src/main.ts` (interval: add `reconcileFreePublicAutoPublish` next to the existing `reconcileKeyCleanup` call at `:297-305`) | C2 |
| `apps/api/src/index.ts` | C2 first (answer-route hook), then C3 (unpublish 409). Not parallel. |
| `packages/contract/src/index.ts` (`PublicationTransitionSchema`) | C2 |
| `packages/contract/src/client.ts` (optional `publish_pending` on the visibility type) | C2 |
| `tests/unit/fpd-s01-c2-auto-publish.test.ts` (new) | C2 |
| `tests/integration/fpd-s01-c2-system-publication.test.ts` (new) | C2 |
| `tests/unit/fpd-s01-c3-unpublish-http.test.ts` (new) | C3 |
| `migrations/0068_bound_published_erasure.sql` (also `CREATE OR REPLACE` `core.enforce_publication_v2_ref_binding`; does not edit `0067`) | C4 |
| `tests/unit/fpd-s01-c4-erasure-http.test.ts` (new) | C4 |
| `tests/integration/fpd-s01-c4-delete-published.test.ts` (new) | C4 |

No cluster writes `apps/ui/**`. No cluster adds a row to `authorizationPolicyInventory`.

---

## 2. Steps

### S01-C1 Binding column and predicate (R-1, R-2, R-3)

**Files:**
- Create: `migrations/0066_free_public_rule.sql`, `packages/db/src/free-public-binding.ts`, `tests/integration/fpd-s01-c1-binding.test.ts`, `tests/integration/fpd-s01-c1-privileges.test.ts`
- Modify: `packages/db/src/schema.ts:109-134` (add `freePublicRule` next to `planTier`), `packages/db/src/index.ts` (`startRun` encrypted JSON + legacy `INSERT`, plus `export { runIsFreePublicBound } from "./free-public-binding.js"`)
- Test: the two new files. Regression: `tests/integration/tiers-s02-run-plan-tier.test.ts`, `tests/integration/plan-tiers-route-privileges.test.ts`

**Interfaces:**
- Consumes: `StartRunInput.planTier`, `core.create_encrypted_run(jsonb,uuid,uuid,jsonb)` 4-parameter signature, `planTierColumnIsApplied` probe pattern at `packages/db/src/index.ts:652-662`.
- Produces: column `core.run.free_public_rule boolean NOT NULL DEFAULT false`; `core.run_is_free_public_bound(uuid) RETURNS boolean`; `runIsFreePublicBound(pool, runId): Promise<boolean>`.

#### C1-S1: Write the failing binding tests

`tests/integration/fpd-s01-c1-binding.test.ts` starts a test database, `migrate`s, then:

1. **Pre-rule row (R-1, R-3).** Insert a `core.run` the way a pre-0066 row reads after `ADD COLUMN … DEFAULT false`: `plan_tier='free'`, `free_public_rule` omitted (DEFAULT false) or explicit false. `SELECT core.run_is_free_public_bound($id)` is `false`.
2. **Post-rule Free (R-1, R-2).** `RunRepository.startRun` with `principal.kind==="server"` and `planTier:"free"`. `runIsFreePublicBound` is `true`. The run row's own `free_public_rule` is `true` and `plan_tier` is `free`. No clock argument is passed to the predicate.
3. **Post-rule Premium (R-2).** `startRun` with `planTier:"premium"`. `free_public_rule` is `true` (created after the rule) and `run_is_free_public_bound` is `false`.
4. **Post-rule NULL tier (R-2).** `startRun` with `planTier` undefined/null. `run_is_free_public_bound` is `false`.
5. **Legacy path (ADR-0024 decision 2).** `startRun` with `principal.kind==="legacy"` and `planTier:"free"` after the column exists. `free_public_rule` is `true`; bound is `true` iff `plan_tier='free'`.
6. **R-3 visibility freeze.** On the pre-rule row, insert one `core.run_visibility_event` `PRIVATE`. Count of visibility events for that `run_id` is 1. Calling `run_is_free_public_bound` does not insert a visibility event; count stays 1.

Done when the file exists and contains these six `it(` titles (N3 — existence is not membership):

1. `"pre-rule free row is not bound"`
2. `"post-rule free startRun is bound"`
3. `"post-rule premium startRun is not bound"`
4. `"post-rule null plan_tier startRun is not bound"`
5. `"legacy startRun writes free_public_rule true"`
6. `"pre-rule visibility event count is unchanged by the predicate"`

Command that decides it: `grep -F` each of those six strings in `tests/integration/fpd-s01-c1-binding.test.ts` returns 1, and `test -f` is true.

If this step is omitted, C1-S2 cannot go RED on `run_is_free_public_bound` — there is no test.

#### C1-S2: Run the binding file; expect RED

```zsh
LOG=…/probes/BUILD-S01-C1/c1-s2.log
$RUNNER tests/integration/fpd-s01-c1-binding.test.ts:0:6
```

Expected: `CLUSTER_RED` (or RED tests; not BROKEN). Failure names `core.run_is_free_public_bound` does not exist, or column `free_public_rule` does not exist.

If the file is missing, the runner prints `BROKEN` (single-path "No test files found"). That is a defect of C1-S1, not a TDD-RED.

#### C1-S3: Migration `0066_free_public_rule.sql`

The file name sorts after `0065_fix11_trace.sql`. Contents, in order:

1. `ALTER TABLE core.run ADD COLUMN IF NOT EXISTS free_public_rule boolean NOT NULL DEFAULT false;`
2. `CREATE OR REPLACE FUNCTION core.run_is_free_public_bound(p_run_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$ SELECT COALESCE(run.plan_tier='free' AND run.free_public_rule=true, false) FROM core.run AS run WHERE run.run_id=p_run_id; $$;`
   Zero-row → SQL NULL → caller treats as false.
3. `REVOKE ALL ON FUNCTION core.run_is_free_public_bound(uuid) FROM PUBLIC;`
4. `GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_runtime;`
5. `GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_erasure_runtime;`
6. `CREATE OR REPLACE FUNCTION core.create_encrypted_run(p_run jsonb,p_user_id uuid,p_owner_ref uuid,p_battery_rows jsonb) RETURNS boolean` — **the 4-parameter signature is unchanged**. Copy the body from `migrations/0061_plan_tier_on_run.sql:7-103` and:
   - add `'freePublicRule'` to the allow-list array next to `'planTier'`;
   - add `free_public_rule` to the `INSERT INTO core.run (…)` column list;
   - add `COALESCE((p_run->>'freePublicRule')::boolean, false)` to the VALUES list (B5). A missing key writes `false` (unbound, which is R-3), so a migrated database with a pre-deploy API process still creates debates. Do **not** let a missing key hit `NOT NULL`.

Done: `ls migrations/0066_free_public_rule.sql` exists; these three strings are each present once: `ADD COLUMN IF NOT EXISTS free_public_rule`, `free_public_rule` on the `INSERT INTO core.run` column list, `COALESCE((p_run->>'freePublicRule')::boolean, false)`. The `create_encrypted_run` signature line still matches `(jsonb,uuid,uuid,jsonb)`.

If this step is omitted, C1-S2 stays RED on "function does not exist".

#### C1-S4: Drizzle column

In `packages/db/src/schema.ts` on `run`, immediately after `planTier: text("plan_tier"),`:

```ts
freePublicRule: boolean("free_public_rule").notNull().default(false),
```

Done: `grep -n 'free_public_rule' packages/db/src/schema.ts` prints one line inside the `run` table. No other table gains the column.

If omitted, C1-S2 may still pass via SQL while later TypeScript inserts omit the field; C1-S5's explicit write is the production case that goes RED.

#### C1-S5: Encrypted create path writes `freePublicRule: true`

In `packages/db/src/index.ts` `startRun`, the `core.create_encrypted_run` JSON (today `:1241-1263`) gains `freePublicRule: true` next to `planTier`.

The capability probe (today `pg_get_functiondef(…create_encrypted_run…) LIKE '%''planTier''%'`) gains a sibling `free_public_rule_supported` using `LIKE '%''freePublicRule''%'`. When false, the JSON is sent with `-'freePublicRule'` (same shape as `-'planTier'`). When true, the key is present and `true` for every new encrypted run, including Premium and NULL-tier — the column means "created after the rule", not "is Free".

Done: the encrypted `startRun` path, on a migrated database, inserts `free_public_rule=true` for `planTier:"premium"` and for `planTier:"free"`. Criterion: the C1-S1 cases 2 and 3 pass on the encrypted path.

If omitted, new encrypted Free runs keep DEFAULT false, C1-S1 case 2 stays RED, and the slice never binds anyone.

#### C1-S6: Legacy `INSERT` writes the column

The legacy `INSERT INTO core.run` at `packages/db/src/index.ts:1312-1328` currently gates `plan_tier` on `planTierColumnApplied`. Add `freePublicRuleColumnIsApplied` (information_schema, `column_name='free_public_rule'`). When applied, the INSERT lists `free_public_rule` and binds `true`.

Done: C1-S1 case 5 passes.

If omitted, legacy-principal Free runs created after ship are unbound (R-1 false for half the create paths — the ADR-0024 miss).

#### C1-S7: TypeScript helper

`packages/db/src/free-public-binding.ts`:

```ts
export async function runIsFreePublicBound(
  pool: Pick<Pool, "query">,
  runId: string
): Promise<boolean> {
  const result = await pool.query<{ bound: boolean | null }>(
    "SELECT core.run_is_free_public_bound($1::uuid) AS bound",
    [runId]
  );
  return result.rows[0]?.bound === true;
}
```

Re-export from `packages/db/src/index.ts`. Done: `runIsFreePublicBound` is an exported binding of `@debateai/db`. C1-S1 uses it rather than inlined SQL in four of the six cases (the pre-rule INSERT case may use SQL).

If omitted, C2/C3/C4 each inline a different predicate.

#### C1-S8: Privilege test RED then GREEN

`tests/integration/fpd-s01-c1-privileges.test.ts`, copied from the `SET ROLE` shape of `tests/integration/plan-tiers-route-privileges.test.ts`:

- Pool A: `SET ROLE debateai_runtime`; `SELECT core.run_is_free_public_bound($1)` on a bound Free run returns `true` (not SQLSTATE 42501).
- Pool B: `SET ROLE debateai_erasure_runtime`; same SELECT returns the same boolean (not 42501).
- Pool C: `SET ROLE` a role that has no GRANT (the test creates a throwaway `NOINHERIT` login/`debateai_fpd_s01_nobody` or uses an existing unprivileged role already fixtured). The same SELECT rejects with SQLSTATE `42501`.

Done: three assertions as above. Command: `$RUNNER tests/integration/fpd-s01-c1-privileges.test.ts:3:0` after C1-S3 GRANTs land; RED before C1-S3.

If omitted, C1 can pass as superuser and fail 42501 on the served database.

#### C1-S9: Allow-list extra key is false, not an exception leak (B5)

A missing `freePublicRule` key is legal and writes `false` (C1-S3 COALESCE). The behaviour this step pins is the allow-list's *extra-key* rejection (`migrations/0061_plan_tier_on_run.sql:21-30`: `p_run-ARRAY[…] <> '{}'::jsonb` then `RETURN false`).

Case, in `fpd-s01-c1-binding.test.ts`, title `"create_encrypted_run rejects an extra payload key"`: call `core.create_encrypted_run` with every current key **plus** `'notAColumn': true`. Returns `false`. Does not raise.

Done: that `it(` title is present and the case passes. A missing-`freePublicRule` call on a migrated database returns `true` (run created, `free_public_rule=false`) — that is C1-S3, not this step.

If omitted, a caller that sends an unknown key can raise instead of returning false, and a missing-key test would pin the B5 outage as correct.

#### C1-S10: Pre-rule Free row is not bound even if `plan_tier='free'`

Explicit: `INSERT … plan_tier='free', free_public_rule=false` (or DEFAULT). `run_is_free_public_bound` is `false`. This is R-3's mechanical boundary: existing Free debates stay private unless the owner publishes them on the owner-driven path.

Done: C1-S1 case 1 passes. Distinct from C1-S1 case 3 (Premium after the rule).

If omitted, a DEFAULT-true mutant of C1-S3 would still pass cases 2–5.

#### C1-S11: `create_encrypted_run` is not dropped

`0066_free_public_rule.sql` contains `CREATE OR REPLACE FUNCTION core.create_encrypted_run` and does not contain `DROP FUNCTION`. `grep -n 'DROP FUNCTION' migrations/0066_free_public_rule.sql` is empty.

Done: that grep is empty. The EXECUTE grant to `debateai_content_provision` at `0040_account_erasure.sql:6363-6369` still holds after migrate (asserted in C1-S8's runtime role? content provision is a different role — add: after migrate, `has_function_privilege('debateai_content_provision', 'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)', 'execute')` is true).

If omitted, a DROP would pass every superuser test and fail the served stack.

#### C1-S12: Re-run C1 command three times

BUILD command (update `N`,`P` to the landed passed counts; at first green `N≥7`, `P=3`):

```zsh
$RUNNER \
  tests/integration/fpd-s01-c1-binding.test.ts:N:0 \
  tests/integration/fpd-s01-c1-privileges.test.ts:P:0 \
  tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 \
  tests/integration/plan-tiers-route-privileges.test.ts:1:0
```

Also assert, on each run, that the runner printed one `rc=… passed=… failed=…` line per path passed (four lines). `run-suites.sh:15` runs vitest once per path, so every suite prints `Test Files 1` and an aggregate count of 4 is not a number the runner emits (N1). A missing path is `BROKEN` per suite (`run-suites.sh:18-19`). Worst of three is the verdict. Expected: `CLUSTER_GREEN`.

#### C1-S13: Production case that goes RED if C1-S5 is omitted

Named: C1-S1 case 2 (`startRun` server + `planTier:"free"` → bound true). If C1-S5 is omitted that case is RED.

#### C1-S14: Commit on the slice branch

Only after C1-S12's worst run is GREEN. Message names C1. No commit if dirty outside the C1 file map.

---

### S01-C2 System publish, outstanding, `publish_pending` (R-4…R-11, R-20, R-21, R-22)

**Files:** as the map. C2 does not edit `apps/ui/**`. C2 may edit `apps/api/src/index.ts` only at `GET /v1/runs/:id/answer` (`:1097-1102`) to call `tryAutoPublish`. Visibility handler (`:1078-1095`) is left parsing `PublicationTransitionSchema` — C2 changes the schema and `readOwnedVisibility`'s return, not the handler. C2 also edits `apps/api/src/main.ts:297-305` (B2).

**Interfaces:**
- Consumes: `core.run_is_free_public_bound`, `PublicationCipher.create/open`, `readAuthorPseudonym`, `PublicDebateSchema` (unchanged required keys), `readRunAnswer` returning `Answer | null`.
- Produces: `core.transition_system_run_publication(...)`; `serve.prepare_system_publication_key_provision(uuid,uuid,uuid,uuid)`; `identity.audit_system_publication_attempt(uuid,uuid,text,timestamptz,text)`; `core.free_public_auto_publish_work`; `PublicationApplication.tryAutoPublish`, `reconcileFreePublicAutoPublish`, `isFreePublicBound`; optional `publish_pending` on `PublicationTransitionSchema`.

Constants (EXACT):

- `SYSTEM_ACTOR_KEY_REF = "system:free-public-auto-publish"`
- `SYSTEM_VISIBILITY_ACTOR_TOKEN = "00000000-0000-4000-8000-0000000000f1"`
- Outstanding reasons (justification / work.reason): `AUTO_PUBLISH_NULL_PSEUDONYM`, `AUTO_PUBLISH_CIPHER_FAILED`, `AUTO_PUBLISH_TRANSITION_NULL`, `AUTO_PUBLISH_KEY_PROVISION_FAILED`, `AUTO_PUBLISH_BLOCKED` is **not** a stored outstanding reason (R-8: count 0).

#### C2-S1: Write failing unit tests for tryAutoPublish

`tests/unit/fpd-s01-c2-auto-publish.test.ts` (mocks the repository, no database):

1. `answer.terminal === "BLOCKED"` → `tryAutoPublish` does not call system publish; outstanding count for that run is 0; calling `reconcileFreePublicAutoPublish` twice leaves 0 (R-8).
2. Publishable bound answer + live pseudonym + cipher ok → one system publish; no `preflightGrant`; no `step_up_grant` row for `PUBLISH` (R-4).
3. Cipher `create` throws → GET/tryAutoPublish does not throw; outstanding row exists with reason `AUTO_PUBLISH_CIPHER_FAILED` (R-9).
4. Pseudonym null → no publish; outstanding `AUTO_PUBLISH_NULL_PSEUDONYM` (R-7).
5. `reconcileFreePublicAutoPublish` on case 3, with cipher now succeeding → state `PUBLISHED`, outstanding cleared, still no PUBLISH grant (R-10). The call takes **no** `AuthenticatedSession` (B2).
6. `readOwnedVisibility` on case 3 returns CONTAINS keys `state=PRIVATE`, `public_ref=null`, `publish_pending=true`. On a never-published Premium mock, EXACT `{"state":"PRIVATE","public_ref":null}` — no third key (R-11).

Done: file exists with these six `it(` titles (N3):

1. `"BLOCKED answer does not publish and outstanding stays 0 across two reconcilers"`
2. `"publishable bound answer system-publishes with no PUBLISH grant"`
3. `"cipher create throw leaves outstanding AUTO_PUBLISH_CIPHER_FAILED and does not throw"`
4. `"null pseudonym leaves outstanding AUTO_PUBLISH_NULL_PSEUDONYM"`
5. `"reconcileFreePublicAutoPublish retries without AuthenticatedSession"`
6. `"outstanding visibility carries publish_pending true; premium never-published does not"`

Command: `grep -F` each of those six strings returns 1.

If omitted, C2-S2 is BROKEN not RED.

#### C2-S2: Run the unit file; expect RED

`$RUNNER tests/unit/fpd-s01-c2-auto-publish.test.ts:0:6` → `CLUSTER_RED`, not BROKEN.

#### C2-S3: Write failing integration tests for the SQL function

`tests/integration/fpd-s01-c2-system-publication.test.ts` (embedded postgres, `SET ROLE debateai_runtime` for the executing pool):

1. Bound Free run, served `SERVED` answer, no session passed into the system function → latest `core.run_visibility_event.state='PUBLISHED'`; `SELECT count(*) FROM identity.step_up_grant WHERE target_run_id=$run AND action='PUBLISH'` is 0 (R-4).
2. Public list full pagination: that run's `public_ref` occurs once (R-5).
3. Snapshot decrypt: `author_pseudonym` equals `identity."user".pseudonym`; ciphertext/plaintext contains none of the owner's `user_id`, `owner_ref`, `session_id`, email (R-6). Scan the decrypted JSON keys and string values.
4. Audit ALLOW row: `actor_key_ref = 'system:free-public-auto-publish'`; `decision='ALLOW'`; `success=true`; `event_type='debate.publication.published'` (R-20.1–R-20.3). `warning_version='PUBLIC_INDEXED_V1'` on the visibility row (R-20.1).
5. That audit row's `source_context` has no session id key; `SELECT 1 FROM identity.session WHERE session_id::text = ANY (source_context::text …)` is not the oracle — oracle is: no `identity.session` row was inserted by the publish, and `step_up_grant` count for PUBLISH stays 0 (R-20.4).
6. Force two system-publish failures (cipher down / provision returns false): `SELECT count(*) FROM identity.audit_event WHERE actor_key_ref='system:free-public-auto-publish' AND decision='DENY' AND target_id=$run_id::text` equals 2 (R-21). `target_type='debate.publication_attempt'`.
7. `PublicDebateSchema.parse` of a snapshot written before this slice (fixture: today's owner-driven snapshot shape) still succeeds; a system-publish snapshot's `published_at` EXACT-equals `created_at.toISOString()` of `serve.publication_snapshot` (R-22).
8. `SET ROLE debateai_runtime` EXECUTE on `core.transition_system_run_publication` succeeds; a role without GRANT gets SQLSTATE `42501`.
9. Calling `core.transition_run_publication` with the owner's live grant still publishes a Premium run (R-25 / owner path unchanged).
10. **B4(a) Premium.** Call `core.transition_system_run_publication` directly with a Premium run id and a PREPARED system intent → returns NULL, `SELECT count(*) FROM serve.publication_snapshot WHERE run_id=$1` is 0, no new `core.run_visibility_event` row. `SELECT count(*) FROM identity.audit_event WHERE actor_key_ref='system:free-public-auto-publish' AND decision='DENY' AND target_id=$run_id::text` equals **1** (N2-p2: the transition writes DENY for every NULL it returns after taking the lock).
11. **B4(a) NULL tier.** Same call with `plan_tier IS NULL` → same NULLs.
12. **B4(a) pre-rule.** Same call with `free_public_rule=false` and `plan_tier='free'` → same NULLs.
13. **B4(b) erased.** After `core.run_private_content_is_live(p_run_id)` is false for a bound Free run, the same direct call returns NULL, no snapshot, no `PUBLISHED` visibility.
14. **B4(c) race (N3-p2).** Two database connections (two pools). Both call `prepareSystemKeyProvision` to completion — two PREPARED intents, two `publication_ref`s — **before** either calls `systemPublish`. Then both call `systemPublish`. After both settle, `SELECT count(*) FROM serve.publication_snapshot WHERE run_id=$1` = 1. Sequential `tryAutoPublish` (application step 3) is **not** this case. This case must be watched FAILING with C2-S4 body item 4 (`IF v_latest_state='PUBLISHED' return NULL`) removed before its GREEN is quoted.
15. **B1 wrapper GRANT.** `SET ROLE debateai_runtime` then `SELECT identity.audit_system_publication_attempt(...)` is not 42501; an unprivileged role gets SQLSTATE `42501`.
16. **B1-p2 orphan cleanup.** Insert a PREPARED `serve.system_publication_key_provision_intent` with `expires_at` in the past. `serve.claim_system_publication_key_provision_cleanup(100)` returns that row; `serve.complete_system_publication_key_provision_cleanup(publication_ref, claim_token)` returns true; `SELECT count(*) FROM serve.system_publication_key_provision_intent WHERE run_id=$1` is 0. The case goes RED if either function is omitted from `0067`.

Done: file exists with cases 1–16. RED until C2-S4…C2-S10. Cases 10–12 going GREEN after deleting `require core.run_is_free_public_bound` from the migration is a C2-S4 defect. Case 14 going GREEN after deleting body item 4 is a C2-S4 defect (N3-p2). Case 16 going GREEN after deleting the claim/complete functions is a C2-S4 defect (B1-p2).

#### C2-S4: Migration `0067_system_run_publication.sql`

New table `serve.system_publication_key_provision_intent`:

- `publication_ref uuid PRIMARY KEY`
- `run_id uuid NOT NULL REFERENCES core.run(run_id)`
- `user_id uuid NOT NULL`
- `owner_ref uuid NOT NULL`
- `requested_at`, `expires_at`, `cleanup_state` matching the owner table's cleanup states
- **no** `session_id`, **no** `grant_token_hash`

New table `core.free_public_auto_publish_work`:

- `run_id uuid PRIMARY KEY REFERENCES core.run(run_id)`
- `user_id uuid NOT NULL`
- `owner_ref uuid NOT NULL`
- `reason text NOT NULL CHECK (reason IN ('AUTO_PUBLISH_NULL_PSEUDONYM','AUTO_PUBLISH_CIPHER_FAILED','AUTO_PUBLISH_TRANSITION_NULL','AUTO_PUBLISH_KEY_PROVISION_FAILED'))`
- `attempt_count integer NOT NULL DEFAULT 0`
- `next_attempt_at timestamptz NOT NULL`
- `claim_token uuid`, `claimed_at timestamptz`, `claim_expires_at timestamptz`
- `cleared_at timestamptz` NULL while outstanding
- outstanding predicate: `cleared_at IS NULL`

Functions (all `SECURITY DEFINER`, `SET search_path = pg_catalog`, `REVOKE ALL FROM PUBLIC`):

- `serve.prepare_system_publication_key_provision(p_publication_ref uuid, p_run_id uuid, p_user_id uuid, p_owner_ref uuid) RETURNS boolean` — lock run, lock account, `run_is_owned_by`, `run_private_content_is_live`, latest visibility not already PUBLISHED, insert tombstone + system intent. No session. No grant.
- `serve.abandon_system_publication_key_provision(p_publication_ref uuid, p_user_id uuid) RETURNS boolean`
- `serve.claim_system_publication_key_provision_cleanup(p_limit integer)` (B1-p2) — `RETURNS TABLE(publication_ref uuid, run_id uuid, user_id uuid, owner_ref uuid, claim_token uuid)`. Claims rows where `cleanup_state='PREPARED' AND expires_at<=clock_timestamp()` **or** a stale `RECONCILING` claim, `FOR UPDATE SKIP LOCKED`, matching `serve.claim_publication_key_provision_cleanup` at `0040_account_erasure.sql:1355-1404`. Sets `cleanup_state='RECONCILING'`. `REVOKE ALL FROM PUBLIC`.
- `serve.complete_system_publication_key_provision_cleanup(p_publication_ref uuid, p_claim_token uuid) RETURNS boolean` (B1-p2) — deletes the intent where `publication_ref` and `cleanup_claim_token` match. Does not insert a snapshot. `REVOKE ALL FROM PUBLIC`.
- `identity.audit_system_publication_attempt(p_audit_id uuid, p_run_id uuid, p_reason text, p_occurred_at timestamptz, p_decision text) RETURNS boolean` (B1) — the **only** path `debateai_runtime` has to write a system-publish audit row from TypeScript. Calls `identity.append_audit_event_internal` with `actor_key_ref='system:free-public-auto-publish'`. For `p_decision='DENY'`: `event_type='debate.publication.denied'`, `target_type='debate.publication_attempt'`, `target_id=p_run_id::text`, `success=false`, `justification=p_reason`. For `p_decision='ALLOW'`: not used (ALLOW is written inside the transition). No `identity.session` read, no `identity.publication_event_binding` row, no grant. `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO debateai_runtime`. Direct `append_audit_event_internal` from the application is SQLSTATE 42501 (`0040_account_erasure.sql:6211-6213`).
- `core.transition_system_run_publication` parameters (signature pinned here; BUILD does not add a 15th):
  `p_event_id uuid, p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_publication_ref uuid, p_expected_pseudonym text, p_content_ciphertext jsonb, p_presented_at timestamptz, p_audit_id uuid, p_denied_audit_id uuid`
  Body, in order:
  1. `SELECT run.content_encryption_version FROM core.run WHERE run.run_id=p_run_id FOR UPDATE` (owner function `:3996-3997`). If not found, return NULL.
  2. If `NOT core.run_is_free_public_bound(p_run_id)` return NULL (B4(a); C2-S3 cases 10–12 go RED if this line is deleted).
  3. If `NOT core.run_private_content_is_live(p_run_id)` return NULL (B4(b); owner `:4003-4004`; C2-S3 case 13).
  4. `SELECT event.state … FROM core.run_visibility_event WHERE run_id=p_run_id ORDER BY at_seq DESC LIMIT 1`. If `v_latest_state='PUBLISHED'` return NULL without inserting a second snapshot (B4(c); owner `:4061-4062`; the prepare-time check is a different transaction and is not this guard).
  5. Require system key-provision intent PREPARED. No session/grant/binding reads.
  6. Insert snapshot with `created_at=p_presented_at`. Insert visibility `PUBLISHED`, `warning_version='PUBLIC_INDEXED_V1'`, `actor_audit_token='00000000-0000-4000-8000-0000000000f1'`, **`actor_ref_version=2`** (N5; owner writes the literal `2` at `:4112`; DEFAULT 1 is the silent miss).
  7. `append_audit_event_internal(p_audit_id, 'system:free-public-auto-publish', 'debate.publication.published', 'debate.publication_event_ref', p_publication_ref::text, p_presented_at, '{"schema":"s10-publication-event-v2"}'::jsonb, 'ALLOW', true, NULL)` — legal here because this function is `SECURITY DEFINER`.
  8. Delete the system intent; return `p_publication_ref`. **One DENY rule (N2-p2):** every NULL this function returns *after taking the run lock* (items 2–5 failing) writes exactly one DENY via `identity.audit_system_publication_attempt` inside this DEFINER body, then returns NULL. `tryAutoPublish` step 8 never writes a DENY. C2-S3 case 10 pins the count at 1.
- `core.claim_free_public_auto_publish_work(p_limit integer)` — `FOR UPDATE SKIP LOCKED` where `cleared_at IS NULL AND next_attempt_at <= clock_timestamp()`. Returns `run_id, user_id, owner_ref, reason`.
- `core.clear_free_public_auto_publish_work(p_run_id uuid)` — set `cleared_at`.
- `core.upsert_free_public_auto_publish_work(p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_reason text)` — insert or increment `attempt_count`, storing the owner identity the reconciler will reuse (B2).

GRANTs:

- prepare/abandon/transition/claim-work/clear/upsert/`identity.audit_system_publication_attempt` → `debateai_runtime`
- `GRANT EXECUTE ON FUNCTION serve.claim_system_publication_key_provision_cleanup(integer), serve.complete_system_publication_key_provision_cleanup(uuid,uuid) TO debateai_publication_cleanup` (B1-p2; signatures named, matching `0040_account_erasure.sql:6373-6374`)

`0067` does **not** contain `DROP FUNCTION` for `core.transition_run_publication` or `core.create_encrypted_run`.

Done: file exists; `grep DROP FUNCTION migrations/0067_system_run_publication.sql` is empty; GRANT lines name `debateai_runtime`; `grep -F 'claim_system_publication_key_provision_cleanup(integer)' migrations/0067_system_run_publication.sql` is ≥ 1 (the GRANT names the signature, not only the name — B1-p2).

If omitted, C2-S3 cases 1 and 8 stay RED.

#### C2-S5: Repository methods

`packages/db/src/publication.ts` adds:

- `prepareSystemKeyProvision(...)`
- `abandonSystemKeyProvision(...)`
- `claimSystemKeyProvisionCleanup(limit)` → `SELECT * FROM serve.claim_system_publication_key_provision_cleanup($1)` (B1-p2)
- `completeSystemKeyProvisionCleanup(publicationRef, claimToken)` → `SELECT serve.complete_system_publication_key_provision_cleanup($1,$2)` (B1-p2)
- `systemPublish(...)` → `SELECT core.transition_system_run_publication(...)`
- `auditSystemPublicationAttempt(auditId, runId, reason, occurredAt, decision)` → `SELECT identity.audit_system_publication_attempt(...)` (B1)
- `upsertAutoPublishWork(runId, userId, ownerRef, reason)`
- `clearAutoPublishWork(runId)`
- `claimAutoPublishWork(limit)` — rows include `userId` and `ownerRef`
- `countAutoPublishWork(runId)` → `SELECT count(*) FROM core.free_public_auto_publish_work WHERE run_id=$1 AND cleared_at IS NULL`
- `runIsFreePublicBound(runId)` → `SELECT core.run_is_free_public_bound($1)`
- `readOwnedVisibility` gains `publishPending: boolean` derived from `countAutoPublishWork>0`, **omitted from the returned object when false** (do not send `publish_pending: false`).

`readAuthorPseudonym` stays; system path reuses it.

Done: `grep -n 'transition_system_run_publication' packages/db/src/publication.ts` is ≥ 1. Owner `transition(` at `:367-404` still calls `core.transition_run_publication` with 14 arguments.

If omitted, C2-S3 cannot go GREEN.

#### C2-S6: Application `tryAutoPublish` / `reconcileFreePublicAutoPublish`

`apps/api/src/publications.ts`:

- Constructor gains a fifth argument (N1-p2), after `cleanupRepository`:
  `readServedAnswer: (runId: string, ownership: RunOwnershipAccess) => Promise<Answer | null>`
  Wired in `apps/api/src/main.ts` (C2 already owns that file) as a closure over the existing `PostgresAskApplication.readRunAnswer` (`apps/api/src/index.ts:1448-1449`, which ignores its session parameter). `RunOwnershipAccess` is `{ ownerRef, legacyAskerId }` (`packages/db/src/index.ts:901-904`), built from the work row's `owner_ref`. **Do not** read an answer on the boot path. The reader is called only from `reconcileFreePublicAutoPublish`.
- Extend `PublicationApplication` with:
  - `tryAutoPublish(input: { runId: string; answer: Answer; userId: string; ownerRef: string }): Promise<void>` — **no** `AuthenticatedSession` (B2). The HTTP hook passes `request.authenticatedSession.userId` / `.ownerRef`. The reconciler passes the two columns stored on the work row.
  - `reconcileFreePublicAutoPublish(limit?: number): Promise<number>`
  - `reconcileSystemKeyProvisionCleanup(limit?: number): Promise<number>` (B1-p2) — same loop shape as `reconcileKeyProvisionCleanup` (`apps/api/src/publications.ts:360-380`): claim, destroy the publication-key material if present, complete. Called from the same `main.ts` boot list and interval.
  - `isFreePublicBound(runId: string): Promise<boolean>` — delegates to `core.run_is_free_public_bound` (B3). Present on the interface in **this** step's list and in this step's done-criterion. C3 does not add it and does not edit `publications.ts`.
- `tryAutoPublish` algorithm (no throw to the caller):
  1. If `answer.terminal === "BLOCKED"`: `clearAutoPublishWork(runId)`; return. Do not publish (R-8).
  2. If `!await this.isFreePublicBound(runId)`: return. Premium / pre-rule / NULL tier are no-ops (R-2, R-25).
  3. If latest visibility is already `PUBLISHED`: `clearAutoPublishWork`; return.
  4. `readAuthorPseudonym`; if null: `upsertAutoPublishWork(runId, userId, ownerRef, 'AUTO_PUBLISH_NULL_PSEUDONYM')` and `auditSystemPublicationAttempt(..., 'DENY')` (B1; R-7, R-21); return. Do **not** call `identity.append_audit_event_internal` from TypeScript.
  5. `randomUUID()` publicationRef; `occurredAt = this.clock()`; `published_at: occurredAt.toISOString()` in `PublicDebateSchema.parse({…})` — **the same `occurredAt` is passed as `p_presented_at`** (R-22.2).
  6. `prepareSystemKeyProvision`; on false: upsert `AUTO_PUBLISH_KEY_PROVISION_FAILED` + `auditSystemPublicationAttempt(..., 'DENY')`; return.
  7. `cipher.create`; on throw: abandon provision, upsert `AUTO_PUBLISH_CIPHER_FAILED` + `auditSystemPublicationAttempt(..., 'DENY')`; return. Do not rethrow.
  8. `systemPublish`; on null: abandon, upsert `AUTO_PUBLISH_TRANSITION_NULL`. **Never write DENY** (N2-p2). The transition wrote DENY for every NULL after the lock; a NULL that never entered the function is provision/cipher/pseudonym, already audited at steps 4/6/7.
  9. `clearAutoPublishWork`; return.
- Never call `preflightGrant`. Never mint a step-up grant. Never construct an `AuthenticatedSession`.
- `reconcileFreePublicAutoPublish`: claim work SKIP LOCKED; for each row, `const answer = await this.readServedAnswer(row.runId, { ownerRef: row.ownerRef, legacyAskerId: null })`; if `answer === null`, skip (not yet served); else `tryAutoPublish({ runId: row.runId, answer, userId: row.userId, ownerRef: row.ownerRef })`; return processed count. The reader is the constructor argument named above (N1-p2).

Done: `tryAutoPublish`, `reconcileFreePublicAutoPublish`, `reconcileSystemKeyProvisionCleanup` **and** `isFreePublicBound` are on the interface; constructor takes `readServedAnswer`; `tryAutoPublish`'s input type has `userId` and `ownerRef` and does not mention `AuthenticatedSession`; unit tests C2-S1 1–5 go GREEN.

If omitted, GET answer will 200 and the run stays PRIVATE with nothing outstanding — R-9 RED.

#### C2-S7: Hook GET answer, never fail the GET

`apps/api/src/index.ts` `GET /v1/runs/:id/answer` (`:1097-1102`):

```ts
const answer = await options.application.readRunAnswer(runId.data, request.session, ownershipFor(request));
if (answer !== null && options.publications !== undefined && request.authenticatedSession !== undefined) {
  try {
    await options.publications.tryAutoPublish({
      runId: runId.data,
      answer,
      userId: request.authenticatedSession.userId,
      ownerRef: request.authenticatedSession.ownerRef
    });
  } catch {
    // R-9: a publish failure does not fail the GET
  }
}
return answer === null
  ? reply.status(404).send({ error: "ANSWER_NOT_SERVED" })
  : reply.send(AnswerSchema.parse(answer));
```

Done: the hook is present; a unit HTTP test (in the C2 unit file, using `buildApi`) returns 200 for the owner when `tryAutoPublish` throws.

If omitted, auto-publish never runs in production unless a test calls it. V's walk step 3 then 4 would fail R-4.

#### C2-S8: `publish_pending` on the wire schema

`packages/contract/src/index.ts:249-252` becomes:

```ts
export const PublicationTransitionSchema = z.object({
  state: z.enum(["PRIVATE", "PUBLISHED"]),
  public_ref: z.uuid().nullable(),
  publish_pending: z.literal(true).optional()
}).strict();
```

`publish_pending` is present only as the boolean literal `true`. Absent otherwise. No `false`. The two `state` values are unchanged (R-11.1).

`packages/contract/src/client.ts:271` visibility return type adds `publish_pending?: true`.

Done: `PublicationTransitionSchema.parse({state:"PRIVATE",public_ref:null})` succeeds; `.parse({state:"PRIVATE",public_ref:null,publish_pending:true})` succeeds; `.parse({state:"PRIVATE",public_ref:null,publish_pending:false})` throws; `.parse({state:"PENDING",…})` throws.

HTTP `GET /v1/runs/{id}/visibility` already `PublicationTransitionSchema.parse(visibility)` (`index.ts:1094`). C2's `readOwnedVisibility` must return a plain object **without** the key when not outstanding (R-11.2 byte-identical). Implementation: build `{state, public_ref}` then `if (pending) Object.assign(out, {publish_pending: true})`.

If omitted, R-11's EXACT outstanding body cannot parse (`.strict()` drops unknown keys by throwing).

#### C2-S9: Owner-driven publish path is byte-stable

`PostgresPublicationApplication.publish` still calls `preflightGrant` and `repository.publish` → `core.transition_run_publication`. No call to the system function. C2-S3 case 9 plus existing `tests/unit/s8-publication.test.ts` 26/26 stay GREEN.

If omitted, Premium publish (R-25) is a system publish without a grant — wrong function.

#### C2-S10: Failed-attempt audit goes through `identity.audit_system_publication_attempt` (B1)

Each failed `tryAutoPublish` attempt that never enters `core.transition_system_run_publication` (null pseudonym, provision false, cipher throw) calls `identity.audit_system_publication_attempt` via `auditSystemPublicationAttempt`. The wrapper writes `decision='DENY'`, `success=false`, `event_type='debate.publication.denied'`, `target_type='debate.publication_attempt'`, `target_id=runId`, `actor_key_ref='system:free-public-auto-publish'`, `justification` one of the four `AUTO_PUBLISH_*` reasons (R-21 cites `0040_account_erasure.sql:4136-4141` for the *shape*; the callable path is the new wrapper because `append_audit_event_internal` is revoked from `debateai_runtime` at `:6211-6213`).

Two forced failures (cipher down / provision false) ⇒ exactly two such rows (R-21 / C2-S3 case 6). A BLOCKED run produces **zero** such rows and zero work rows (R-8). `grep append_audit_event_internal apps/api/src/publications.ts` is empty.

If omitted, a silent retry loop is invisible.

#### C2-S11: No REQUIRED key on `PublicDebateSchema`

`grep -n "PublicDebateSchema" packages/contract/src/index.ts` — the schema object does not gain a new `.min(1)` / non-optional field. Optional keys are also forbidden on that schema for this slice (R-22.1 is specifically REQUIRED; do not add optional system-publish markers either — the marker is the audit row, R-20).

Done: `tests/architecture/s8-publication-contract.test.ts` case "exposes a dedicated strict public contract…" still passes; the UI case stays the only failure of that file (DELTA, R-24).

If omitted, pre-slice snapshots 404.

#### C2-S12: List membership exactly once

After a successful system publish, `GET /v1/public/debates` across `limit=100` pages contains the `public_ref` once (R-5). A second `tryAutoPublish` on the same run does not insert a second snapshot because C2-S4 step 4 re-checks latest visibility **under the run row lock inside the transition** (B4(c)). The prepare-time "not already PUBLISHED" check is a different transaction and is not this guard. The detector is C2-S3 case 14 (two pools, both prepares complete before either `systemPublish` — N3-p2), not sequential `tryAutoPublish`.

Done: C2-S3 case 2 plus C2-S3 case 14.

If omitted, retries could duplicate list entries.

#### C2-S13: BLOCKED is not retried forever

After a bound run's answer is BLOCKED: work count 0; after `reconcileFreePublicAutoPublish` once; after it twice; still 0 (R-8). R-9's "PRIVATE with nothing outstanding is a violation" does **not** apply (SPEC: R-9 scoped off BLOCKED).

Done: C2-S1 case 1 green.

If omitted, a BLOCKED run could upsert work on every GET poll.

#### C2-S14: Outstanding visibility body (EXACT)

Owner `GET /v1/runs/{id}/visibility` while work is outstanding:

EXACT `{"state":"PRIVATE","public_ref":null,"publish_pending":true}`

After success, EXACT `{"state":"PUBLISHED","public_ref":"<uuid>"}` — no `publish_pending` key (R-11, SPEC §4.1 step 5).

Premium never-published: EXACT `{"state":"PRIVATE","public_ref":null}`.

Done: HTTP or application-level assertion in C2 tests.

If omitted, the owner's read cannot distinguish outstanding from private-by-choice (V-2 / R-11).

#### C2-S15: Runtime role proof for the system function

In `fpd-s01-c2-system-publication.test.ts`: `SET ROLE debateai_runtime` then `SELECT core.transition_system_run_publication(...)` is not 42501. Same for `identity.audit_system_publication_attempt`. `SET ROLE` an unprivileged role → SQLSTATE `42501` on both (C2-S3 cases 8 and 15). Superuser pool is used only to `SET ROLE`.

Done: C2-S3 cases 8 and 15 green.

If omitted, the function can exist without a GRANT and fail on the served database.

#### C2-S16: `s8-publication-database` DELTA preserved

Named failure `"preserves a committed corpus key when the publish result is transport-ambiguous"` remains the only failure of `tests/integration/s8-publication-database.test.ts`. Command pair `:25:1` until C2 adds passing tests to **its own** integration file, not this one (C2 does not edit this file). If a C2 change moves this suite, C2 fixes the cause; it does not re-declare the baseline.

#### C2-S17: `s8-publication.test.ts` stays 26/26

C2 does not edit this file. Command pair `:26:0`. A C2 change that fails an existing case is a C2 defect.

#### C2-S18: Reconcile is not a new HTTP route; production caller is `main.ts` (B2)

No new `{ route: "` line in `apps/api/src/index.ts:113-166`. `awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'` is 52 (R-23).

`apps/api/src/main.ts:297-305` today:

```
await publications.reconcileKeyProvisionCleanup();
await publications.reconcileKeyCleanup();
publicationCleanupTimer = setInterval(() => {
  void Promise.all([
    publications.reconcileKeyProvisionCleanup(),
    publications.reconcileKeyCleanup()
  ]).catch(() => console.error("[PUBLICATION_KEY_CLEANUP_PENDING]"));
},30_000);
```

C2 adds `publications.reconcileFreePublicAutoPublish()` **and** `publications.reconcileSystemKeyProvisionCleanup()` (B1-p2) to the boot `await` list and to the `Promise.all` array. No new timer, no new route. Tests still call both methods directly. The `PostgresPublicationApplication` constructed here receives `readServedAnswer` (N1-p2). Boot does **not** call `readServedAnswer`.

Done: `grep -n 'reconcileFreePublicAutoPublish' apps/api/src/main.ts` prints two lines (boot + interval). `grep -n 'reconcileSystemKeyProvisionCleanup' apps/api/src/main.ts` prints two lines. Route count 52; no `app.(get|post|delete)` added.

If omitted as a new route, R-23 and the s7 pair both move. If the two `reconcileFreePublicAutoPublish` `main.ts` calls are omitted, C2-S19.2 is RED. If the two `reconcileSystemKeyProvisionCleanup` calls are omitted, C2-S19.4 is RED.

#### C2-S19: Production cases that go RED if the hook, the interval, the reader, or the cleanup is omitted

Named:

1. GET hook (C2-S7): `buildApi` GET `/v1/runs/:id/answer` on a bound Free run with a served non-BLOCKED answer, then visibility is `PUBLISHED`, with no `POST /v1/runs/:id/publish`. If the hook is omitted, this test is RED.
2. Interval (B2 / C2-S18): `grep -F 'reconcileFreePublicAutoPublish' apps/api/src/main.ts` returns 2. If either the boot `await` or the `setInterval` `Promise.all` member is removed, this grep is RED.
3. Reconciler publishes without a further GET (N1-p2 / R-10): a bound publishable run with a served answer, outstanding work row present, **no** subsequent read through any answer-serving route (`GET /v1/runs/:id/answer` or `GET /v1/answers/:id` — SPEC-v3 §1); one `reconcileFreePublicAutoPublish()`; latest visibility is `PUBLISHED`. If `readServedAnswer` is omitted or the method returns 0 without reading, this case is RED.
4. Orphan-intent cleanup in production (B1-p2): `grep -F 'reconcileSystemKeyProvisionCleanup' apps/api/src/main.ts` returns 2. If either the boot `await` or the interval member is removed, this grep is RED. C2-S3 case 16 is RED if the SQL functions are omitted.

#### C2-S20: Three-run C2 command

```zsh
$RUNNER \
  tests/unit/fpd-s01-c2-auto-publish.test.ts:M:0 \
  tests/integration/fpd-s01-c2-system-publication.test.ts:Q:0 \
  tests/unit/s8-publication.test.ts:26:0 \
  tests/integration/s8-publication-database.test.ts:25:1
```

Assert four `rc=… passed=… failed=…` lines (N1 — one per path; `Test Files` is always 1 per invocation). Worst of three. Expected `CLUSTER_GREEN` (the database suite's 1 failure is expected).

#### C2-S21: Typecheck DELTA

`pnpm exec tsc --noEmit` diagnostic count ≤ 70, and no diagnostic names a file C2 wrote. Never asserted as zero (SPEC §3).

#### C2-S22: Commit on the slice branch

After C2-S20 worst GREEN. C2 file map only.

---

### S01-C3 Unpublish 409 after a live grant (R-12, R-13, R-14, R-15)

Depends on C2 because `apps/api/src/index.ts` is single-writer. C3 calls `options.publications.isFreePublicBound(runId)` which C2-S6 puts on `PublicationApplication`. C3 does not edit `publications.ts`. C3 does not add the method.

**Files:** `apps/api/src/index.ts` unpublish handler (`:1148-1188`); `tests/unit/fpd-s01-c3-unpublish-http.test.ts`.

#### C3-S1: Write failing HTTP tests

`tests/unit/fpd-s01-c3-unpublish-http.test.ts` uses `buildApi` as `tests/unit/s8-publication-http.test.ts` does.

Guards that fire **before** the 409 on the same operation, in order, each with its own `it`:

| # | condition | status | body (EXACT) |
|---|---|---|---|
| G1 | no session cookie | 401 | `{"error":"SESSION_REQUIRED"}` (`index.ts:515`) |
| G2 | session present, missing/foreign `origin` or CSRF mismatch | 403 | `{"error":"CSRF_VALIDATION_FAILED"}` (`index.ts:500-506`) |
| G3 | body missing `copies_may_persist_acknowledged` | 400 | `{"error":"MALFORMED_REQUEST"}` |
| G4 | `options.publications === undefined` | 503 | `{"error":"PUBLICATION_UNAVAILABLE"}` (`index.ts:1158-1159`) |
| G5 | `preflightGrant` false (no live UNPUBLISH grant, or not owner as far as the grant is concerned) | 404 | `{"error":"RUN_NOT_FOUND"}` (`index.ts:1161-1171`) |
| G6 | `readRun` null after a live grant | 404 | `{"error":"RUN_NOT_FOUND"}` (`index.ts:1178`) |

Then the new oracle, only when G1–G6 have not fired:

| # | condition | status | body (EXACT) |
|---|---|---|---|
| R-12 | bound + published + live UNPUBLISH grant + valid body + CSRF | 409 | `{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}` |
| R-14 | same grant token presented a second time | 409 | same body; `unpublish()` was not called (spy count 0); grant still live |
| R-13 | second signed-in user, even with a well-formed body | 404 | `{"error":"RUN_NOT_FOUND"}`, byte-identical to a run id that exists nowhere |
| R-15 | Premium published + live grant | 200 | CONTAINS `{"state":"PRIVATE","public_ref":null}` (no `publish_pending`) |

R-12 test spies `publications.unpublish` and expects 0 calls.

Done: file exists with G1–G6, R-12, R-13, R-14, R-15. RED until C3-S3.

If omitted, C3-S2 is BROKEN.

#### C3-S2: Run the file; expect RED

`$RUNNER tests/unit/fpd-s01-c3-unpublish-http.test.ts:0:U0` → RED on R-12 (today a bound published run with a live grant would call `unpublish()` and return 200 or 404, not 409).

#### C3-S3: Insert the refusal after preflight, before `unpublish()`

In `apps/api/src/index.ts` unpublish handler, after the existing `readRun` null check (`:1178`) and before `options.publications.unpublish(...)` (`:1179`):

```ts
const visibility = await options.publications.readOwnedVisibility({
  runId: runId.data,
  authenticated
});
if (visibility !== null
  && visibility.state === "PUBLISHED"
  && await options.publications.isFreePublicBound(runId.data)) {
  return reply.status(409).send({ error: "FREE_DEBATE_CANNOT_BE_UNPUBLISHED" });
}
```

`isFreePublicBound` uses `core.run_is_free_public_bound` (C1). Do not call `unpublish()`. Do not consume the grant.

Done: R-12, R-14 tests GREEN; spy on `unpublish` is 0 for those cases.

If omitted, C3-S2 stays RED.

#### C3-S4: Second user is still 404, not 409

`preflightGrant` / `readRun` for a non-owner fail before the new branch. R-13 test: response equals the response for `runId=00000000-0000-4000-8000-000000000000`.

If omitted, a non-owner could learn the run is a bound published Free debate (R-13).

#### C3-S5: Premium unpublish still 200

The new branch requires `isFreePublicBound`. Premium is false. Existing `unpublish()` runs. R-15 GREEN. Existing `tests/unit/s8-publication-http.test.ts` 4/4 stays GREEN.

If omitted, every published unpublish 409s — R-15 / R-25 RED.

#### C3-S6: Grant remains live after 409

R-14: two sequential unpublish calls with the same token both 409. Implementation: never reach `repository.unpublish` / `transition_run_publication` (which consumes at `:4088-4090`). Preflight uses `identity.publication_grant_is_live` (non-consuming).

If omitted, the second call 404s (consumed grant) and V's walk step 8 fails.

#### C3-S7: s7 DELTA pair unmoved

`$RUNNER tests/unit/s7-authorization.test.ts:30:1` — the named test `"keeps one complete, duplicate-free policy row per contract route"` is the only failure, expected 50 actual 52. C3 adds no policy row.

If omitted (a new route), the pair moves and R-23 fails.

#### C3-S8: Production case that goes RED if C3-S3 is omitted

Named: the R-12 HTTP test (409 + EXACT typed error + `unpublish` spy 0).

#### C3-S9: Three-run C3 command

```zsh
$RUNNER \
  tests/unit/fpd-s01-c3-unpublish-http.test.ts:U:0 \
  tests/unit/s8-publication-http.test.ts:4:0 \
  tests/unit/s7-authorization.test.ts:30:1
```

Assert three `rc=… passed=… failed=…` lines (N1). Worst of three `CLUSTER_GREEN`.

#### C3-S10: Commit on the slice branch

C3 file map only, after C3-S9 GREEN.

---

### S01-C4 Delete a bound published run (R-16, R-17, R-18, R-19)

Waits on C2. Does not edit `apps/api/src/index.ts` (the route already maps `outcome==="PUBLISHED"` to 409 `DEBATE_MUST_BE_PRIVATE` at `:787-788`, and `CLEANED`/`PENDING` to 200/202 at `:793-794`). The change is inside `core.prepare_private_run_erasure` so a bound published run no longer returns `'PUBLISHED'`, and inside `core.enforce_publication_v2_ref_binding` so that PRIVATE insert is admitted (G1).

**Files:** `migrations/0068_bound_published_erasure.sql` (the only production file; it `CREATE OR REPLACE`s both `core.prepare_private_run_erasure` and `core.enforce_publication_v2_ref_binding`); the two new test files. `migrations/0067_system_run_publication.sql` is not edited. `apps/api/src/account-erasure.ts:95-117` is **not** edited unless a new outcome string is introduced — it is not; outcomes stay `CLEANED|PENDING|PUBLISHED|LEGACY_RESIDUAL|NOT_FOUND`.

Constants (EXACT):

- `ERASURE_VISIBILITY_ACTOR_TOKEN = "00000000-0000-4000-8000-0000000000f2"` — distinct from the system-publish token `…00f1` (`0067` / ADR-0026).
- Visibility warning on the folded PRIVATE row: `COPIES_MAY_PERSIST_V1` (owner UNPUBLISH at `0040_account_erasure.sql:4086`).
- `actor_ref_version=2`.

#### C4-S1: Write failing HTTP tests

`tests/unit/fpd-s01-c4-erasure-http.test.ts`:

Guards before the delete oracle, same operation `DELETE /v1/debates/{id}`:

| # | condition | status | body (EXACT) |
|---|---|---|---|
| G1 | no session | 401 | `{"error":"SESSION_REQUIRED"}` (`index.ts:515`) — before lookup (R-18) |
| G2 | CSRF / origin | 403 | `{"error":"CSRF_VALIDATION_FAILED"}` |
| G3 | extra key on body | 400 | `{"error":"MALFORMED_REQUEST"}` (`PrivateDebateErasureRequestSchema.strict()`) |
| G4 | `accountErasure===undefined` | 503 | `{"error":"ACCOUNT_ERASURE_UNAVAILABLE"}` (`index.ts:779-780`) |
| G5 | second signed-in user | 404 | `{"error":"NOT_FOUND"}` (`index.ts:786`) — R-18 |

Oracle:

| # | condition | status | body |
|---|---|---|---|
| R-16 | bound published + live `DELETE_PRIVATE_DEBATE` grant | 200 EXACT `{"status":"CLEANED"}` **or** (202 EXACT `{"status":"PENDING"}` **and** a `serve.private_run_erasure_tombstone` row exists for the run) — **not** 409. 202 without a tombstone is `CONTENDED` mapped at `account-erasure.ts:110-112` and is not success (N2). |
| R-19 | Premium published + live grant | 409 EXACT `{"error":"DEBATE_MUST_BE_PRIVATE"}` |

The unit file mocks `deletePrivateDebate` return values (like `s10-erasure-http.test.ts`) to pin the HTTP mapping. The integration file (C4-S2) pins the SQL outcome.

If omitted, C4-S3 is BROKEN.

#### C4-S2: Write failing integration tests

`tests/integration/fpd-s01-c4-delete-published.test.ts` (embedded postgres, executing pool `SET ROLE debateai_erasure_runtime`):

1. Bound Free run, owner-driven **or** (if C2 already merged) system-published: call `prepare_private_run_erasure` with a live `DELETE_PRIVATE_DEBATE` grant. Outcome is not `'PUBLISHED'` and not `'CONTENDED'`. It is `'PREPARED'` / `'COMMITTED'` / `'ERASED'` / `'CLEANED'` as today's success path already returns (R-16). If the HTTP mapping is 202, a `serve.private_run_erasure_tombstone` row exists for the run (N2).
2. After that call, latest visibility is not `PUBLISHED`; `GET` public read of the old `public_ref` is 404 `DEBATE_NOT_FOUND` equivalent at the repository (`readPublic` / `revalidatePublic` returns null) (R-17).
3. Unbound Premium published run: outcome `'PUBLISHED'` (R-19).
4. Pre-rule Free (`free_public_rule=false`) published via owner path: outcome `'PUBLISHED'` (R-3 + R-19 class: not bound).
5. `SET ROLE debateai_erasure_runtime` EXECUTE is not 42501; unprivileged role is 42501.
6. Signature still `core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)` — `has_function_privilege` / `to_regprocedure` of that signature is non-null. No `DROP FUNCTION`.
7. **B4(b) contention.** A PREPARED row in `serve.system_publication_key_provision_intent` for the run makes `prepare_private_run_erasure` return `'CONTENDED'` (same as the owner intent table at `:4524-4526`), not `'CLEANED'` and not `'PUBLISHED'`.
8. **B1-p2 expired orphan.** A PREPARED system intent with `expires_at` in the past, after `claim_system_publication_key_provision_cleanup` + `complete_…`, makes `prepare_private_run_erasure` return a success outcome (`'PREPARED'`/`'COMMITTED'`/`'ERASED'`/`'CLEANED'`), not `'CONTENDED'`. Goes RED if the cleanup pair is omitted (the gate at C4-S4 would then see the row forever).
9. **G1 PRIVATE shape.** After case 1 succeeds, the latest `core.run_visibility_event` for the run is EXACTLY `state='PRIVATE'`, `actor_audit_token='00000000-0000-4000-8000-0000000000f2'`, `actor_ref_version=2`, `warning_version='COPIES_MAY_PERSIST_V1'`, `publication_ref` equal to the previously live public ref. No `identity.publication_event_binding` row is inserted. `SELECT count(*) FROM identity.audit_event WHERE event_type='debate.publication.unpublished' AND target_id=$publication_ref::text` is unchanged from before the call (this path does not write that event type).
10. **G1 guard — not bound.** `SET ROLE` a superuser test pool (setup only) then `INSERT INTO core.run_visibility_event` with the erasure token, `state='PRIVATE'`, `actor_ref_version=2`, `warning_version='COPIES_MAY_PERSIST_V1'`, a pending `publication_key_cleanup_intent`, on a Premium published run → SQLSTATE `55000` `PUBLICATION_V2_REF_BINDING_REQUIRED`.
11. **G1 guard — no cleanup intent.** Same INSERT on a bound published run **without** a pending `serve.publication_key_cleanup_intent` for that `publication_ref` → `55000` `PUBLICATION_V2_REF_BINDING_REQUIRED`.
12. **G1 guard — system token on PRIVATE.** Same INSERT using actor token `…00f1` and `state='PRIVATE'` (even with a pending cleanup intent, even on a bound run) → `55000` `PUBLICATION_V2_REF_BINDING_REQUIRED` (`…00f1` admits only `PUBLISHED` + `PUBLIC_INDEXED_V1` + PREPARED system intent).

RED until C4-S4. Mapping to the six intended RED cases already in the C4 coder's uncommitted `fpd-s01-c4-delete-published.test.ts` (BUILD-S01-C4 BLOCKED / `c4-s3-red-attempt-3.log`, `passed=4 failed=6`):

| BUILD `it(` title | PLAN case |
|---|---|
| `admits a bound system-published run under debateai_erasure_runtime` | C4-S2.1 |
| `writes PRIVATE and removes the old public ref from latest membership` | C4-S2.2 (shape pinned by C4-S2.9) |
| `allows the erasure role and denies an unprivileged role with 42501` | C4-S2.5 |
| `returns CONTENDED while a system publication intent is PREPARED` | C4-S2.7 |
| `admits erasure after cleanup removes an expired orphan system intent` | C4-S2.8 |
| `still contends on a different snapshot with no completed cleanup` | C4-S4 snapshot-cleanup-complete check |
| *(new)* G1 token/version/warning + no binding + no unpublished audit | C4-S2.9 |
| *(new)* unbound PRIVATE insert 55000 | C4-S2.10 |
| *(new)* PRIVATE without cleanup intent 55000 | C4-S2.11 |
| *(new)* f1 token on PRIVATE 55000 | C4-S2.12 |

#### C4-S3: Run both new files; expect RED

Integration case 1 today returns `'PUBLISHED'` at `0040_account_erasure.sql:4536-4538`.

#### C4-S4: Migration `0068_bound_published_erasure.sql`

`CREATE OR REPLACE FUNCTION core.prepare_private_run_erasure(p_run_id uuid, p_user_id uuid, p_owner_ref uuid, p_session_id uuid, p_grant_token_hash text)` — **signature unchanged**. Add `v_latest_publication_ref uuid` to the DECLARE list (today the function only has `v_latest_visibility`).

Also `CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()` — **same zero-argument trigger signature**, never `DROP`. Copy the body from `migrations/0067_system_run_publication.sql:43-69` (lane HEAD `11184e70`) and add **one** extra admission **before** the existing `actor_ref_version<>2 OR NOT EXISTS (publication_event_binding…)` raise:

```
IF NEW.actor_ref_version=2
  AND NEW.actor_audit_token='00000000-0000-4000-8000-0000000000f2'::uuid
  AND NEW.state='PRIVATE' AND NEW.warning_version='COPIES_MAY_PERSIST_V1'
  AND COALESCE(core.run_is_free_public_bound(NEW.run_id), false)
  AND EXISTS (
    SELECT 1 FROM serve.publication_key_cleanup_intent AS cleanup
    WHERE cleanup.publication_ref=NEW.publication_ref
      AND cleanup.cleanup_state='PENDING' AND cleanup.completed_at IS NULL
  ) THEN
  RETURN NEW;
END IF;
```

Do not admit `…00f1` on PRIVATE. Do not admit `…00f2` on PUBLISHED. Do not admit `…00f2` when `run_is_free_public_bound` is false. Do not admit `…00f2` without a pending cleanup intent. The owner UNPUBLISH path (binding row + `actor_ref_version=2`) stays the second branch and is unchanged. C2's `0067` is not edited; `0068` is the newest definition.

Replace the block at the equivalent of `:4534-4538`. **Order is load-bearing for the trigger** (cleanup intent must exist before the visibility INSERT):

```
SELECT event.state, event.publication_ref INTO v_latest_visibility, v_latest_publication_ref
FROM core.run_visibility_event AS event
WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
IF v_latest_visibility='PUBLISHED' THEN
  IF NOT COALESCE(core.run_is_free_public_bound(p_run_id), false) THEN
    RETURN QUERY SELECT 'PUBLISHED'::text, NULL::uuid; RETURN;
  END IF;
  -- 1. INSERT serve.publication_key_cleanup_intent PENDING for v_latest_publication_ref
  --    (same UPSERT as owner UNPUBLISH at :4096-4103).
  -- 2. INSERT core.run_visibility_event:
  --      run_visibility_event_id = gen_random_uuid()  -- not a publication_event_binding id
  --      publication_ref = v_latest_publication_ref
  --      state = 'PRIVATE'
  --      actor_audit_token = '00000000-0000-4000-8000-0000000000f2'
  --      actor_ref_version = 2
  --      warning_version = 'COPIES_MAY_PERSIST_V1'
  --    This INSERT must not raise 55000 PUBLICATION_V2_REF_BINDING_REQUIRED.
  -- 3. Do NOT INSERT identity.publication_event_binding.
  -- 4. Do NOT call identity.append_audit_event_internal for debate.publication.unpublished
  --    (the trigger's audit half has no erasure-unpublished shape; the trail is the
  --    existing private_erasure_audit_binding written later in this function).
  -- 5. Do NOT consume an UNPUBLISH grant. The DELETE_PRIVATE_DEBATE grant is already
  --    consumed at :4527-4529. Fall through. Do NOT return 'PUBLISHED'.
END IF;
```

Then, in the snapshot-cleanup-complete check (`:4547-4554`), exclude `publication_ref`s for which this function just inserted a `PENDING` cleanup intent in the same transaction (so a live public copy does not `CONTENDED` the delete). Pre-existing contended snapshots of **other** refs still CONTEND.

Immediately after the existing owner-intent contention gate (`:4524-4526`), add the same `PERFORM 1 FROM serve.system_publication_key_provision_intent AS provision WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT; IF FOUND THEN RETURN QUERY SELECT 'CONTENDED'::text, NULL::uuid; RETURN; END IF;` (B4(b)). A prepared system publish in flight must contend erasure the same way an owner publish in flight does. C4-S2 case 7 goes RED if this `PERFORM` is omitted.

Do not consume an `UNPUBLISH` grant. The `DELETE_PRIVATE_DEBATE` grant is already consumed at `:4527-4529` **before** this gate — leave that order (existing behaviour for the unbound 409 path). Bound success therefore also consumes the delete grant, which is correct.

`GRANT EXECUTE` is already held by `debateai_erasure_runtime` (`:6435-6436`). Because this is `CREATE OR REPLACE` with the same signature, do not DROP, do not re-GRANT unless `has_function_privilege` is measured false (it must stay true).

Done: `grep DROP FUNCTION migrations/0068_bound_published_erasure.sql` empty; `to_regprocedure('core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)')` non-null after migrate; `grep -F "00000000-0000-4000-8000-0000000000f2" migrations/0068_bound_published_erasure.sql` is ≥ 1; `CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()` is in the same file; `grep DROP FUNCTION` still empty (the trigger is replaced, not dropped).

If omitted, C4-S2 case 1 stays `'PUBLISHED'` or case 2 raises `55000 PUBLICATION_V2_REF_BINDING_REQUIRED` (G1).

#### C4-S5: Public copy gone (R-17)

After the bound delete: `listPublicRefs` / `readPublicDebate` does not return that `public_ref`. Mechanism: latest visibility `PRIVATE` makes `revalidatePublic` fail the same way an owner unpublish does; `readPublicDebate` returns null; the route already maps null → 404 `{"error":"DEBATE_NOT_FOUND"}` (`index.ts:827-829`).

Done: C4-S2 case 2 GREEN.

If omitted, V's walk step 11 still lists the debate.

#### C4-S6: Unbound published still 409 (R-19)

Premium and pre-rule Free published runs still return `'PUBLISHED'` from the SQL function → HTTP 409 `DEBATE_MUST_BE_PRIVATE`.

Done: C4-S2 cases 3 and 4 GREEN; `tests/unit/s10-erasure-http.test.ts` 8/8 GREEN.

If omitted, every published debate becomes deletable — I-1 / R-25 / V-5.

#### C4-S7: Only the creator (R-18)

No change to the HTTP 401/404 mapping. C4-S1 G1 and G5 stay GREEN. The SQL function already returns `'NOT_FOUND'` for a non-matching owner (`:4488-4523`) **before** the PUBLISHED gate. Bound carve-out must not run for a non-owner.

Done: a non-owner integration call still `'NOT_FOUND'`, not a successful erase.

If omitted, the carve-out could erase someone else's bound debate.

#### C4-S8: Runtime role proof

`SET ROLE debateai_erasure_runtime` then execute `prepare_private_run_erasure` is not 42501. Unprivileged role is 42501. The bound predicate is called **inside** the SECURITY DEFINER erasure function (owner of the function), so `debateai_erasure_runtime` does not need to be the one executing `run_is_free_public_bound` as the session user — C1 still GRANTed it to that role for direct tests. C4's proof is EXECUTE on `prepare_private_run_erasure` itself.

If omitted, the REPLACE could drop privileges the way a DROP would.

#### C4-S9: Production case that goes RED if C4-S4 is omitted

Named: C4-S2 case 1 (bound published → not `'PUBLISHED'`).

#### C4-S10: Three-run C4 command

```zsh
$RUNNER \
  tests/unit/fpd-s01-c4-erasure-http.test.ts:E:0 \
  tests/integration/fpd-s01-c4-delete-published.test.ts:D:0 \
  tests/unit/s10-erasure-http.test.ts:8:0
```

Assert three `rc=… passed=… failed=…` lines (N1). Worst of three `CLUSTER_GREEN`.

#### C4-S11: Typecheck DELTA

Same rule as C2-S21, for files C4 wrote (C4 writes no `.ts` production file if the mapping is SQL-only; then this step is: `tsc` still ≤ 70 and names no C4 test file as a new error).

#### C4-S12: Commit on the slice branch

C4 file map only.

---

## 3. SPEC↔PLAN trace — every requirement has a covering step

| requirement | what it pins | covering step(s) | cluster |
|---|---|---|---|
| R-1 | a run's own persisted state decides whether the rule binds it | C1-S1 cases 1–2, C1-S3 column, C1-S5, C1-S6, C1-S10 | S01-C1 |
| R-2 | `free` + created after the rule; `premium` and NULL are never bound | C1-S1 cases 3–4, C1-S3 function, C1-S10 | S01-C1 |
| R-3 | no run that exists at deploy changes visibility | C1-S1 case 6, C1-S10; C4-S2 case 4 (pre-rule published still not deletable-as-bound) | S01-C1, S01-C4 |
| R-4 | served answer → `PUBLISHED`, no publish request, no PUBLISH grant. **v3: the trigger is ANY answer-serving route (§1, V-10) — `GET /v1/runs/{id}/answer` AND `GET /v1/answers/{id}`; the Check runs once per route. The listed steps cover one route only; the second route is an open step for the FIX-A seat** | C2-S1.2, C2-S3.1, C2-S6, C2-S7, C2-S19 · **+ the second answer-serving route (unassigned)** | S01-C2 |
| R-5 | a published bound run's publication appears in the public list exactly once | C2-S3.2, C2-S3.14, C2-S12 | S01-C2 |
| R-6 | same `author_pseudonym` as the owner-driven path; the machinery adds no owner identifier. **v3: the Check is rewritten — identity + parity + machine-filled fields, asserted on the DECRYPTED system-path snapshot, never on the transition's parameters. C2-S3.3 invokes the SQL function and so does not execute the snapshot builder (correctness B1): an open step for the FIX-A seat** | C2-S3.3 · **+ a decrypted-snapshot assertion that goes RED under the `ownerRef` mutant (unassigned)** | S01-C2 |
| R-7 | no pseudonym on a publishable bound run → not published, outstanding instead | C2-S1.4, C2-S6 step 4 | S01-C2 |
| R-8 | BLOCKED answer is not published and is not retried forever; R-9 does not apply | C2-S1.1, C2-S13 | S01-C2 |
| R-9 | publishable bound run: publish failure never fails the run; PUBLISHED or PRIVATE+outstanding | C2-S1.3, C2-S6 steps 6–8, C2-S7 try/catch | S01-C2 |
| R-10 | a retried outstanding publish lands with no user action | C2-S1.5, C2-S6 `readServedAnswer` + `reconcileFreePublicAutoPublish`, C2-S18 `main.ts` interval, C2-S19.2, C2-S19.3 | S01-C2 |
| R-11 | `publish_pending` optional literal `true` on `PublicationTransitionSchema`; absent otherwise | C2-S1.6, C2-S8, C2-S14 | S01-C2 |
| R-12 | unpublish on a bound published run → 409 `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` | C3-S1 R-12, C3-S3, C3-S8 | S01-C3 |
| R-13 | refusal only after ownership + live grant; everyone else today's 404 | C3-S1 G5/G6/R-13, C3-S4 | S01-C3 |
| R-14 | refused unpublish changes nothing and does not consume the grant | C3-S1 R-14, C3-S6 | S01-C3 |
| R-15 | unpublish on a published Premium run still returns 200 | C3-S1 R-15, C3-S5 | S01-C3 |
| R-16 | creator deletes a bound published run; not 409 | C4-S1 R-16, C4-S2.1, C4-S2.9, C4-S4, C4-S9 | S01-C4 |
| R-17 | after the delete the public copy is gone from the list and the read is 404 | C4-S2.2, C4-S2.9, C4-S5 | S01-C4 |
| R-18 | second signed-in user 404 `NOT_FOUND`; no session 401 `SESSION_REQUIRED` before lookup | C4-S1 G1/G5, C4-S7 | S01-C4 |
| R-19 | delete on a published Premium run still 409 `DEBATE_MUST_BE_PRIVATE` | C4-S1 R-19, C4-S2.3, C4-S6 | S01-C4 |
| R-20 | system publish records: visibility, ALLOW audit, system actor, no phantom session | C2-S3.4–5, C2-S4 function body, ADR-0026 | S01-C2 |
| R-21 | each failed auto-publish attempt appends one DENY audit naming the run and the reason | C2-S3.6, C2-S3.15, C2-S4 wrapper, C2-S6 steps 4/6/7, C2-S10 | S01-C2 |
| R-22 | pre-slice snapshots still 200; no REQUIRED key; `public_ref`/`published_at` revalidation unchanged | C2-S3.7, C2-S6 step 5 (same `occurredAt`), C2-S11 | S01-C2 |
| R-23 | route policy table still has 52 entries | C2-S18, C3-S7, slice verification SV-1 | S01-C2, S01-C3, REV(S01) |
| R-24 | no `apps/ui` file written | file map; slice verification SV-2 | REV(S01) |
| R-25 | Premium path unchanged end to end | C1-S1.3, C2-S3.9, C2-S9, C3-S5, C4-S6, slice verification SV-3 | all, REV(S01) |

Requirement set of S01 is exactly R-1…R-25 (`DECISIONS.md` §10 N3-p2). Unique-R-id count on SPEC-v3.md = 25, asserted by `spec-v3-check.sh`.

---

## 4. Suite assertions carried from the SPEC

`SPEC-v3.md` §3 is the list (unchanged from `SPEC-v2.md` §3). Cluster commands name the suite and the SPEC row:

| suite | SPEC row | cluster that runs it |
|---|---|---|
| `tests/unit/s8-publication.test.ts` | GREEN 26/26 plus C2's new file, not this file | S01-C2 |
| `tests/unit/s8-publication-http.test.ts` | GREEN 4/4 | S01-C3 |
| `tests/integration/s8-publication-database.test.ts` | DELTA 25/1, named corpus-key test only | S01-C2 |
| `tests/architecture/s8-publication-contract.test.ts` | DELTA 4/1, named UI-composition test only; R-11 must not move it | REV(S01) SV-4 |
| `tests/unit/s7-authorization.test.ts` | DELTA 30/1, named policy-row test, pair 50/52 | S01-C3, SV-1 |
| `tests/unit/s10-erasure-http.test.ts` | GREEN 8/8 plus C4's new file | S01-C4 |
| `tests/unit/pda-s04-node-carrier-audit.test.ts` | GREEN 2/2 | REV(S01) SV-5 |
| `tests/unit/tiers-s02-admission.test.ts` | GREEN 15/15 | REV(S01) SV-5 |
| `tests/integration/tiers-s02-run-plan-tier.test.ts` | GREEN 6/6 | S01-C1 |
| `tests/integration/plan-tiers-route-privileges.test.ts` | GREEN 1/1 | S01-C1 |
| `tests/architecture/register-support-publication.test.ts` | DELTA 12/2, two named TS-compiler failures | REV(S01) SV-4 |
| `tests/unit/api.test.ts` | GREEN 31/31 | REV(S01) SV-5 |
| `pnpm exec tsc --noEmit` | DELTA ≤ 70, no diagnostic on a slice-written file | C2-S21, C4-S11, SV-6 |

---

## 5. Boundaries, DDD impact and ADRs

**Bounded contexts touched**

- `core` — `run.free_public_rule`; `run_is_free_public_bound`; `free_public_auto_publish_work`; `transition_system_run_publication`; `prepare_private_run_erasure` carve-out.
- `serve` — `system_publication_key_provision_intent`; snapshot insert from the system function; key-cleanup intent on bound delete.
- `identity` — audit rows only (`append_audit_event_internal`). No new session, grant, or publication_event_binding rows on the system path.
- `packages/contract` — optional `publish_pending` on `PublicationTransitionSchema`. `PublicDebateSchema` required-key set frozen.
- `apps/api` — GET answer hook; unpublish 409 branch. Delete HTTP mapping unchanged.

**Invariants owned**

- Bound = `plan_tier='free' AND free_public_rule=true`, read from the run row.
- System publish never presents a grant. Owner publish always does.
- Unpublish 409 does not consume `identity.step_up_grant`.
- Bound published delete does not return `'PUBLISHED'` and does not require an `UNPUBLISH` grant.
- Audit actor literal `system:free-public-auto-publish` is the only R-20.3 oracle.

**Domain terms introduced**

- `free_public_rule` — persisted "created after this rule existed".
- `bound` — the conjunction in `run_is_free_public_bound`.
- `system publish` — `transition_system_run_publication`, no session, no grant.
- `outstanding` — a `core.free_public_auto_publish_work` row with `cleared_at IS NULL`.
- `SYSTEM_ACTOR_KEY_REF` — `system:free-public-auto-publish`.

**Must not be touched**

- `apps/ui/**` (R-24).
- `authorizationPolicyInventory` length and members (R-23).
- `core.transition_run_publication` 14-parameter signature (ADR-0024 / ADR-0026).
- Live databases and no-touch listeners (intake: `:3100` `:3101` `:8890`–`:8896` `:55433` `:7177` `:8988` `:9797` `:11434`). Database tests use embedded/testcontainer fixtures as `tests/integration/s8-publication-database.test.ts` does.
- `.local/**`, the main checkout `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.
- `SPEC.md` / `SPEC-v2.md` / `SPEC-v3.md` (the SPEC of record).

**ADRs**

- ADR-0024 — cited, not edited: plaintext column beside encrypted content; both create paths; `CREATE OR REPLACE` signature unchanged.
- ADR-0026 — minted this seat: system publication is a new function; no phantom session/grant; audit actor literal. Path: `docs/architecture/01-decisions/ADR-0026-system-publication-without-grant.md`.

**No MOCK / no Screens.** `ui: no`. `DONE.md` is not this slice's.

---

## 6. Slice verification list — what `REV(S01)` runs once every cluster is green

Three lenses (correctness/tests · security/data-safety · product-truth), three passes, then V. Commands cwd = the S01 lane. Runner as above. Each suite three times, worst counts.

**SV-0 lens worktree setup (N4).** Before any suite: `pnpm install` then `pnpm run generate:contract` (`package.json:22`). Gate: `test -f packages/contract/generated/client.ts`. `packages/contract/generated/**` is gitignored; C2 edits `packages/contract/src/index.ts`; a REV worktree without this step cannot collect `tests/unit/s8-publication.test.ts` (TOOLING-TRAPS heading "A lens worktree needs `pnpm run generate:contract`, not just `pnpm install`").

**SV-1 R-23 route membership (EXACT members, N3).**  
Count: `awk 'NR>=100 && NR<=166' apps/api/src/index.ts | grep -c '{ route: "'` → 52.  
Membership: each of these 52 strings is present as `{ route: "<string>"` in `apps/api/src/index.ts:114-165` (measured at `5b6cc9b1`). An add-and-remove pair keeps the count at 52 and fails a missing-string grep.

`POST /v1/auth/register` · `POST /v1/auth/verify-email` · `POST /v1/auth/resend-verification` · `POST /v1/auth/recovery/start` · `POST /v1/auth/mfa/totp/begin` · `POST /v1/auth/mfa/totp/verify` · `POST /v1/auth/mfa/recovery-codes/generate` · `POST /v1/auth/mfa/recovery-codes/confirm` · `POST /v1/auth/login` · `POST /v1/auth/logout` · `GET /v1/auth/sessions` · `DELETE /v1/auth/sessions/{id}` · `DELETE /v1/auth/sessions` · `POST /v1/auth/step-up` · `DELETE /v1/account` · `GET /v1/account/erasure` · `POST /v1/account/erasure/cancel` · `POST /v1/account/legacy-runs/claim` · `DELETE /v1/debates/{id}` · `GET /v1/public/debates` · `GET /v1/public/debates/{id}` · `POST /v1/support/sessions` · `GET /v1/support/sessions/{id}` · `POST /v1/support/sessions/{id}/consent` · `POST /v1/support/sessions/{id}/messages` · `POST /v1/support/messages/{id}/rating` · `POST /v1/support/sessions/{id}/escalate` · `GET /v1/support/cases` · `GET /v1/support/cases/{token}` · `POST /v1/support/cases/{token}/messages` · `GET /v1/support/status` · `GET /v1/obs/client-report/enums` · `POST /v1/obs/client-report` · `POST /v1/asks` · `GET /v1/session` · `GET /v1/plan-tiers` · `GET /v1/deployment` · `GET /v1/dev/evaluator` · `POST /v1/dev/evaluator/consumer-selection` · `GET /v1/answers` · `GET /v1/answers/{id}` · `GET /v1/answers/{id}/inspection` · `GET /v1/answers/{id}/nodes/{nodeId}` · `GET /v1/answers/{id}/ledger-digest` · `POST /v1/answers/{id}/investigations/{gapRef}` · `POST /v1/answers/{id}/memory-link/unlink` · `GET /v1/runs/{id}` · `GET /v1/runs/{id}/visibility` · `GET /v1/runs/{id}/events` · `GET /v1/runs/{id}/answer` · `POST /v1/runs/{id}/publish` · `POST /v1/runs/{id}/unpublish`

`$RUNNER tests/unit/s7-authorization.test.ts:30:1` — named test `"keeps one complete, duplicate-free policy row per contract route"` is the only failure; expected 50 actual 52.

**SV-2 R-24 no UI files.**  
`git diff --name-only 5b6cc9b1..HEAD -- apps/ui | wc -l` is 0.  
(TOOLING-TRAPS: run git from the lane so the pathspec is not git-root-relative-empty.)

**SV-3 R-25 Premium end-to-end (automated stand-in for V's walk steps 12–15).**  
A Premium run's served answer does not publish it; `POST /v1/runs/{id}/publish` with a live grant returns 201; unpublish returns 200; delete while published returns 409 `DEBATE_MUST_BE_PRIVATE`. Covered by C2-S3.9, C3-S5, C4-S6; REV re-runs those files' Premium cases.

**SV-4 DELTA suites**

- `$RUNNER tests/integration/s8-publication-database.test.ts:25:1` plus C2's integration file at its green pair.
- `$RUNNER tests/architecture/s8-publication-contract.test.ts:4:1` — named UI-composition test only. If R-11 moved this suite, that is a slice defect.
- `$RUNNER tests/architecture/register-support-publication.test.ts:12:2` — the two named TS-compiler failures only.

**SV-5 GREEN suites** (intake counts, plus this slice's new files at their landed pairs)

- `tests/unit/s8-publication.test.ts:26:0`
- `tests/unit/s8-publication-http.test.ts:4:0`
- `tests/unit/s10-erasure-http.test.ts:8:0`
- `tests/unit/pda-s04-node-carrier-audit.test.ts:2:0`
- `tests/unit/tiers-s02-admission.test.ts:15:0`
- `tests/integration/tiers-s02-run-plan-tier.test.ts:6:0`
- `tests/integration/plan-tiers-route-privileges.test.ts:1:0`
- `tests/unit/api.test.ts:31:0`
- C1/C2/C3/C4 new files at their green pairs.

**SV-6 Typecheck DELTA.**  
`pnpm exec tsc --noEmit` → at most 70 diagnostics, none naming a file this slice wrote.

**SV-7 Runtime-role proof (security lens).**  
Re-run `tests/integration/fpd-s01-c1-privileges.test.ts`, C2-S3 case 8, C4-S2 case 5 under `SET ROLE`. A superuser-only green is a fail of this item.

**SV-8 R-13 uniform 404.**  
Unpublish from a second user against a bound published run is byte-identical to a missing run id (`index.ts:1161-1172` still the preflight 404).

**SV-9 R-20.4 no phantom session.**  
`SELECT count(*) FROM identity.step_up_grant WHERE action='PUBLISH' AND target_run_id=$auto_published_run` is 0. No `identity.session` row inserted by the system publish (count of sessions for that user unchanged across the publish).

**SV-10 Unique R-ids.**  
`grep -oE '\*\*R-[0-9]+' docs/missions/free-public-debates/slices/S01/SPEC-v3.md | sort -u | wc -l` = 25.

**SV-11 V's acceptance walk** is `SPEC-v3.md` §4, run once by V against a served lane. REV does not impersonate V. Numbered steps 1–16 **plus 3b, 3c and 11b** in that file are the product-truth oracle.

No-touch: do not bind `:3100` `:3101` `:8890`–`:8896` `:55433` `:7177` `:8988` `:9797` `:11434`. Do not open anything on V's desktop.

---

## 7. Refutation

### Per step — failure the criterion catches / one it does not

| step | catches | does not catch |
|---|---|---|
| C1-S1.1 | `free_public_rule` default true (would bind pre-rule Free rows) | a clock-based helper that is never called from `run_is_free_public_bound` |
| C1-S3 function | `bound := plan_tier='free'` ignoring the column | a second code path that inlines `plan_tier='free'` without the SQL function |
| C1-S5 | encrypted create omits `freePublicRule` | legacy INSERT omit (C1-S6 catches that) |
| C1-S6 | legacy INSERT omit | encrypted path omit (C1-S5) |
| C1-S8 | missing GRANT to `debateai_runtime` (42501) | GRANT present but function body `SECURITY INVOKER` reading a table the role cannot SELECT — add `SECURITY DEFINER` in C1-S3; a mutant INVOKER may still 42501 and look like a missing GRANT |
| C1-S11 | `DROP FUNCTION create_encrypted_run` in 0066 | a later cluster's DROP of a different function |
| C2-S1.1 | BLOCKED still upserts work | a non-BLOCKED `COMPONENTS_ONLY` terminal that should publish and does not — add an `it` that `terminal!=="BLOCKED"` does call publish |
| C2-S1.3 | cipher throw fails the GET | a throw from `readRunAnswer` itself (out of slice) |
| C2-S3.1 | system publish that inserts a PUBLISH grant | a grant inserted for a different action |
| C2-S3.3 | `author_pseudonym` ≠ account pseudonym; owner id in snapshot strings | an owner identifier in ciphertext that decrypts to a non-JSON envelope (parse fails first; R-22's catch-null would hide it — C2-S3.7 requires parse success) |
| C2-S3.4 | audit `actor_key_ref` still a UUID | a UUID that happens to equal `SYSTEM_VISIBILITY_ACTOR_TOKEN` on the visibility row (that UUID is not the oracle) |
| C2-S8 | `publish_pending: false` accepted; third `state` | a UI bundle on an older contract (R-11.4 residual; V-6) |
| C2-S11 | new REQUIRED key on `PublicDebateSchema` | an optional key on that schema (forbidden here by C2-S11 prose; not by R-22.1's letter — the step bans it anyway) |
| C1-S9 | extra payload key returns false | a missing `freePublicRule` key (C1-S3 COALESCE writes false; that is B5, not this step) |
| C2-S3.10–12 | deleting `run_is_free_public_bound` from the transition | an application-layer early return that never calls the SQL (C2-S6 step 2) |
| C2-S3.14 | two overlapping publishes inserting two snapshots | `DISTINCT ON (run_id)` hiding the orphan from the list |
| C2-S18 | a 53rd policy row; `main.ts` missing `reconcileFreePublicAutoPublish` | a new Fastify route not listed in the inventory (s7 named test would still fail the pair; `api.hasRoute` tests in the same file may catch it) |
| C3-S3 | 409 never reached because `unpublish()` is called first | a 409 emitted **before** preflight (would fail R-13 / C3-S4) |
| C3-S6 | grant `consumed_at` set on 409 | grant expired by wall clock during the test |
| C4-S4 | bound published still `RETURN 'PUBLISHED'` | unbound published now falling through (C4-S6 catches) |
| C4-S5 | visibility left `PUBLISHED` so public read still 200 | list pagination that stops at the first page (V's walk paginates; the integration test must walk `listPublicRefs` fully) |
| C4-S8 | REPLACE that dropped EXECUTE | INVOKER mutation that still has EXECUTE but 42501s on inner tables |

### Per cluster — mutant class the command detects

| cluster | mutant class |
|---|---|
| S01-C1 | Binding predicate wrong (DEFAULT true, encrypted-only write, legacy-only write, `plan_tier='free'` without the column, missing EXECUTE GRANT). Command includes privilege 42501 and both create paths. |
| S01-C2 | System path reuses owner function / phantom grant; GET fails on cipher error; BLOCKED retried; `publish_pending` as `false` or as a new `state`; REQUIRED public-schema key; missing `debateai_runtime` GRANT; application `append_audit_event_internal` (42501); `tryAutoPublish` requiring `AuthenticatedSession`; boundness guard only in TS; two snapshots from a race; missing `main.ts` interval. |
| S01-C3 | 409 before grant (oracle leak); 409 after `unpublish()` (grant consumed, second call 404); Premium 409; new policy row. |
| S01-C4 | Bound delete still `'PUBLISHED'`; unbound delete no longer `'PUBLISHED'`; public snapshot still listed; EXECUTE grant lost on REPLACE; non-owner succeeds. |

A multi-path command that lists a file this plan never creates is BROKEN, not RED (`run-suites.sh:18-19` per path). Each BUILD wrapper asserts one `rc=… passed=… failed=…` line per path passed (N1). Do not assert an aggregate `Test Files` count; the runner never emits one.

---

## 8. ARCH base runs (new files omitted)

Omitted paths (created later; not BROKEN at base):

- `tests/integration/fpd-s01-c1-binding.test.ts` (C1-S1)
- `tests/integration/fpd-s01-c1-privileges.test.ts` (C1-S8)
- `tests/unit/fpd-s01-c2-auto-publish.test.ts` (C2-S1)
- `tests/integration/fpd-s01-c2-system-publication.test.ts` (C2-S3)
- `tests/unit/fpd-s01-c3-unpublish-http.test.ts` (C3-S1)
- `tests/unit/fpd-s01-c4-erasure-http.test.ts` (C4-S1)
- `tests/integration/fpd-s01-c4-delete-published.test.ts` (C4-S2)

Scripts: `.hermes/reports/free-public-debates/probes/ARCH-S01/s01-c{1,2,3,4}-base.sh`  
Logs: same directory, `s01-c{1,2,3,4}-base.log`  
Lane cwd; 0 dirty before and after (ARCH writes no product file).

| cluster | command at base (omitted new files) | expected marker | recorded 2026-09-20 |
|---|---|---|---|
| S01-C1 | `tests/integration/tiers-s02-run-plan-tier.test.ts:6:0 tests/integration/plan-tiers-route-privileges.test.ts:1:0` | CLUSTER_GREEN | `CLUSTER_GREEN` — `passed=6 failed=0` and `passed=1 failed=0`. Log `probes/ARCH-S01/s01-c1-base.log`. |
| S01-C2 | `tests/unit/s8-publication.test.ts:26:0 tests/integration/s8-publication-database.test.ts:25:1` | CLUSTER_GREEN (DELTA 1 failure named) | `CLUSTER_GREEN` — `passed=26 failed=0` and `passed=25 failed=1`. Named failure `"preserves a committed corpus key when the publish result is transport-ambiguous"` (pre-existing). Log `probes/ARCH-S01/s01-c2-base.log`. |
| S01-C3 | `tests/unit/s8-publication-http.test.ts:4:0 tests/unit/s7-authorization.test.ts:30:1` | CLUSTER_GREEN (DELTA 1 failure named) | `CLUSTER_GREEN` — `passed=4 failed=0` and `passed=30 failed=1`. Named failure `"keeps one complete, duplicate-free policy row per contract route"` (expected 50, received 52, pre-existing). Log `probes/ARCH-S01/s01-c3-base.log`. |
| S01-C4 | `tests/unit/s10-erasure-http.test.ts:8:0` | CLUSTER_GREEN | `CLUSTER_GREEN` — `passed=8 failed=0`. Log `probes/ARCH-S01/s01-c4-base.log`. |

Lane dirty count after all four runs: 0. Scripts: `probes/ARCH-S01/s01-c{1,2,3,4}-base.sh`.

**Revision 2 re-run (ARCH-FIX-S01-02, 2026-09-20):** cluster commands at base are unchanged (new files still omitted). Copied scripts in `probes/ARCH-FIX-S01-02/s01-c{1,2,3,4}-base.sh`. Verbatim: C1 `CLUSTER_GREEN` 6/0 + 1/0 · C2 `CLUSTER_GREEN` 26/0 + 25/1 named `"preserves a committed corpus key when the publish result is transport-ambiguous"` · C3 `CLUSTER_GREEN` 4/0 + 30/1 named `"keeps one complete, duplicate-free policy row per contract route"` · C4 `CLUSTER_GREEN` 8/0. Lane dirty 0.

**Revision 3 re-run (ARCH-FIX-S01-03, 2026-09-20):** cluster commands at base still unchanged. Script `probes/ARCH-FIX-S01-03/s01-clusters-base.sh`. Verbatim identical four `CLUSTER_GREEN` markers. Lane dirty 0.

---

## 9. Screens

`ui: no`. No screen, element or token is added. There is no MOCK node. V's oracle is `SPEC-v3.md` §4, once.
