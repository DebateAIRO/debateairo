# REV(S01) pass 2 (SCOPED) — lens **correctness / tests** · mission `free-public-debates`

- seat `REV-S01-p2-correctness-tests` (the pass-1 seat resumed) · ticket `t_d2c8d5fc` · pass **2 of 3**
- slice head `c358d494` on `slice/free-public-debates-s01`, previous head `db4758da`, base `5b6cc9b1`
- read-only detached worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine`, 0 dirty at start and at handoff
- oracle: **`SPEC-v3.md`** (SPEC of record) with `DECISIONS.md` §31 · `V-DECISIONS-PACKET.md` V-1…V-11
- blind: no other lens's pass-1 or pass-2 output was read; the union (`REV-S01-p1-UNION.md`) and the two FIX seats' handoffs were read as the packet's inputs name them.

## VERDICT — **PASS** (pass 2) for this lens

All eight of my pass-1 findings are **ADDRESSED by measurement**. Two new non-blocking findings,
**N1-p2** and **N2-p2**, both inside the diff since pass 1; neither is something a requirement of
SPEC-v3 cannot survive as built, so neither blocks. Each is ticketed in my verdict comment.

---

## 1. Charge 1 — every pass-1 finding of this lens, verdicted by measurement

| pass 1 | the line the FIX seat named | my measurement at `c358d494` | verdict |
|---|---|---|---|
| **C-B1** R-6 asserted nowhere | `tests/unit/fpd-s01-c2-auto-publish.test.ts:253` | mutant **T10** (system snapshot built from `input.ownerRef`) now turns the C2 unit suite RED; at `db4758da` the identical mutant left ten suites green. My own re-derived probe is GREEN at head and RED under T10 (`expected 'fbca…9600' to be 'Public Thinker 41'`). | **ADDRESSED** |
| **C-B2** `PUBLISHED` with `publish_pending:true` | `apps/api/src/publications.ts:291` + `packages/db/src/publication.ts:587` | two fixes, both measured: `finishFailedAutoPublish` re-reads visibility and clears (mutant **G3** → RED), and the projection suppresses the key beside `PUBLISHED` (mutant **G2** → RED against my probe). My probe forces the worst case — a stale uncleared work row on a `PUBLISHED` run — and the owner's read is `{state:"PUBLISHED", publish_pending absent}`. | **ADDRESSED** |
| **C-B3** the untruthful 202 | `migrations/0069_fix_bound_erasure_and_trigger.sql:126,206,298` | the contention is recorded in `v_system_publication_contended` (`:206`) and the erasure completes before `CONTENDED` is returned (`:298`). Measured: outcome `CONTENDED`, latest visibility `PRIVATE`, grant `consumed_at` **not null**, `serve.private_run_key_cleanup_intent` = 1, `publication_key_cleanup_intent` PENDING = 1. Mutant **G5** (revert to the early return) turns my case RED (`expected 'PUBLISHED' to be 'PRIVATE'`). V-9's default is met: the 202 is now true. | **ADDRESSED** |
| **C-B4** the 16-test skip | `tests/integration/fpd-s01-c2-system-publication.test.ts:225` | `initdbFlags: ["--encoding=UTF8", …]` present at `:224-234`. Measured under `env -u LANG -u LC_ALL` — the exact environment that produced `passed=0 failed=0` at pass 1 — the suite is **20/0**, and the whole 19-suite slice list has **zero** skipped tests in that locale and under UTF-8. Class swept: `grep -rn "new EmbeddedPostgres"` over `tests/ packages/ apps/` returns exactly two sites and both pin the encoding. | **ADDRESSED** |
| **C-N1** mutant T8 survived | `tests/unit/fpd-s01-c3-unpublish-http.test.ts:304` | the new case `"R-12 lets a bound PRIVATE run follow the existing 200 unpublish path"` asserts `status 200`, `boundCalls 0`, `unpublishCalls 1`. Mutant **T8** (dropping `&& visibility.state === "PUBLISHED"`) now turns the suite RED. | **ADDRESSED** |
| **C-N3** = P-N2 BLOCKED branch wrote before the bound check | `apps/api/src/publications.ts:203` | the bound check is now first (`:203`), the BLOCKED branch second (`:204-207`). Measured through the product application: a BLOCKED answer on an unbound run touches the repository exactly once (`["bound"]`), and on a bound run `["bound","clear"]`. The slice's own case `"checks binding before clearing a BLOCKED answer"` covers it. | **ADDRESSED** |
| **C-N2** the runner reads a skipped suite as RED | not in FIX scope — orchestrator ticket (protocol owner's file) | re-measured at `run-suites.sh:17-23`: unchanged. The rule now lives in this packet's charge 3 instead of in the runner, so every seat re-implements the skip scan by hand (I grepped `^\s*Tests.*skipped` over both logs: 0 hits). Correctly routed away from the FIX seats; **restated, not re-filed**. | **OPEN, correctly routed** |
| **C-N4** packet cursor said 0, was 1 | orchestrator ticket | `packets/REV-S01-p2-correctness-tests.md:8` says "comment cursor at dispatch: 0 comments"; `t_d2c8d5fc` carried the orchestrator's `DISPATCHED` comment before I started. Same defect, unfixed — restated in §5 "Restated, not re-filed" rather than re-numbered, since it is already on an orchestrator ticket. | **NOT ADDRESSED (packet, non-blocking)** |

### 1.1 The authors' `SKILLS LOADED` (charge 4)

Neither `agent-reports/FIX-S01-p1-A.md` nor `agent-reports/FIX-S01-p1-B.md` contains a
`SKILLS LOADED:` line (`grep` → no hits in either). Both **READY comments** open with one
(`t_728887e1`, `t_544048e9`), and the orchestrator's CONSUMED comments record verification by
`skills-check.sh` against each Codex rollout jsonl. Charge 4 names both sources, so the line exists
where the charge allows — **no fabrication finding**. That either source satisfies the charge is
an ambiguity worth closing, but it is a packet-wording point, not a finding against the FIX seats.

---

## 2. Charge 3 — the lists, twice, in both locales

Runner as the packet names it, cwd = my worktree, all 19 suites of the slice list.
**Ambient (`env -u LANG -u LC_ALL`) and `LANG=LC_ALL=en_US.UTF-8` are byte-identical**; both end
`CLUSTER_GREEN`; the skipped-test scan over both logs returns **0**.

```text
tests/integration/fpd-s01-c1-binding.test.ts rc=0 passed=9 failed=0 (expect 9/0)
tests/integration/fpd-s01-c1-privileges.test.ts rc=0 passed=3 failed=0 (expect 3/0)
tests/unit/fpd-s01-c2-auto-publish.test.ts rc=0 passed=14 failed=0 (expect 14/0)
tests/integration/fpd-s01-c2-system-publication.test.ts rc=0 passed=20 failed=0 (expect 20/0)
tests/unit/fpd-s01-c3-unpublish-http.test.ts rc=0 passed=11 failed=0 (expect 11/0)
tests/unit/fpd-s01-c4-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/integration/fpd-s01-c4-delete-published.test.ts rc=0 passed=17 failed=0 (expect 17/0)
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/unit/s8-publication-http.test.ts rc=0 passed=4 failed=0 (expect 4/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
tests/architecture/s8-publication-contract.test.ts rc=1 passed=4 failed=1 (expect 4/1)
tests/unit/s7-authorization.test.ts rc=1 passed=30 failed=1 (expect 30/1)
tests/unit/s10-erasure-http.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/unit/pda-s04-node-carrier-audit.test.ts rc=0 passed=2 failed=0 (expect 2/0)
tests/unit/tiers-s02-admission.test.ts rc=0 passed=15 failed=0 (expect 15/0)
tests/integration/tiers-s02-run-plan-tier.test.ts rc=0 passed=6 failed=0 (expect 6/0)
tests/integration/plan-tiers-route-privileges.test.ts rc=0 passed=1 failed=0 (expect 1/0)
tests/architecture/register-support-publication.test.ts rc=1 passed=12 failed=2 (expect 12/2)
tests/unit/api.test.ts rc=0 passed=31 failed=0 (expect 31/0)
CLUSTER_GREEN
```

The five failures are the five named RED at base in the intake record's baseline table; none is new.
`pnpm exec tsc --noEmit` → rc=1, **70** diagnostics (the base count), **0** naming a file this slice
wrote. `git diff --name-only 5b6cc9b1..c358d494 -- apps/ui | wc -l` → `0` (R-24).
All SQL was measured through `debateai_runtime` / `debateai_erasure_runtime` on `max:1` pools, never
a superuser pool.

---

## 3. Charge 2 — new breakage inside the diff since pass 1

### 3.1 Every new guard has a failing case (14 mutants, each restored from its capture; 0 dirty after each)

| id | new guard introduced by the fix | mutant | result |
|---|---|---|---|
| G1 | `publications.ts:215-217` — `ensureAutoPublishWork` enqueued **before** the fallible work | call removed | **RED** |
| G3 | `publications.ts:291-304` — `finishFailedAutoPublish` re-reads visibility and clears on `PUBLISHED` | re-read removed | **RED** |
| G4 | `index.ts:1025` — the second answer-serving route carries the trigger | call removed | **RED** |
| G2 | `packages/db/src/publication.ts:587` — `latest.state IS DISTINCT FROM 'PUBLISHED'` | guard removed | **RED** |
| G5 | `0069:206,298` — contended erasure is queued before `CONTENDED` is returned | reverted to the early return | **RED** |
| G9 | `0069:19` — the f1 admission requires a live intent lease | `expires_at>clock_timestamp()` removed | **RED** |
| G10 | `0069:14` — the f1 admission requires a bound run | bound check removed | **RED** |
| G6 | `0070:15` — `prepare` requires a bound run | bound check removed | **RED** |
| G7 | `0070:101-107` — capped exponential backoff | reverted to `v_now` | **RED** |
| G8 | `0070:130-134` — the DENY audit requires a bound run with outstanding work | admission removed | **RED** |
| T8 | the C3 refusal block (pass-1 survivor) | as pass 1 | **RED** |
| T10 | the system snapshot builder (pass-1 survivor) | as pass 1 | **RED** |
| **G11** | *(no guard — R-6 assertion 2)* | the **owner-driven** path diverges from the shared builder | **GREEN — survives** → N1-p2 |
| **G12** | *(no guard — §1 consequence (a))* | a third `AnswerSchema.parse(` send site with no trigger | **GREEN — survives** → N2-p2 |

### 3.2 No case disappeared behind a moved pair

Case-name sets compared between `db4758da` and `c358d494` for the four suites whose pairs moved
(C2 unit 8→14, C2 integration 16→20, C3 11, C4 integration 14→17). Three names are absent from the
new head; each has a named successor that is strictly stronger, so **nothing was silently dropped**:

| gone at `c358d494` | successor | why the old name could not survive |
|---|---|---|
| `returns NULL for a NULL tier with one DENY and no publication` | `…with no forgeable DENY and no publication` | `0070:130-134` makes the DENY unforgeable for an unbound run, so "one DENY" is now the wrong oracle |
| `returns NULL for a pre-rule Free run with one DENY and no publication` | `…with no forgeable DENY and no publication` | same |
| `returns CONTENDED while a system publication intent is PREPARED` | `returns CONTENDED only after queuing erasure during a live system publication intent` | the C-B3 fix; the successor adds the queueing assertions |

R-21 is not weakened by the tightened audit admission: `finishFailedAutoPublish` upserts the work row
before calling the audit wrapper, and `ensureAutoPublishWork` runs earlier still, so a *bound*
run's failed attempt always satisfies "bound + outstanding" and still appends its DENY row. Mutant
**G8** confirms a case fails when that admission is removed.

---

## 4. My own fixtures, re-derived (charge 1, second clause)

Promoted at `.hermes/reports/free-public-debates/probes/REV-S01-p2-correctness-tests/`
(README, `mutant.sh`, two probe files). **9 passed / 0 failed** in the ambient locale and under
UTF-8. What I had to re-derive, and what changed:

1. **The probe transcribed the product's SQL.** `ownedVisibility()` re-implemented
   `readOwnedVisibility`'s query at pass 1. At this head it passed — and then mutant `G2`, which
   deletes the very guard the case exists to check, left it **green**. The probe now calls the
   product's `PostgresPublicationRepository`, and `G2` turns it RED. A probe that cannot be turned
   red by deleting its subject is not evidence; this one was not, for one run.
2. **The repository double lost the interface.** `ensureAutoPublishWork` did not exist at
   `db4758da`; the pass-1 unit probe's stub now throws. Re-derived, plus the call-order expectations
   (`["ensure", …]`, and `["bound","clear"]` for BLOCKED, which is the C-N3 fix).
3. **The batch-cap case measured a state that can no longer occur.** `0070`'s backoff means an
   upserted failure is not claimable for 30 s, so seeding with `upsert_…` and claiming returns 0.
   Re-derived onto `ensure_free_public_auto_publish_work`, and the backoff itself is now asserted
   (`next_attempt_at > clock_timestamp()` after one failure).
4. **The C-B3 case asserted the defect as correct.** It pinned "erases nothing / grant unconsumed /
   0 erasure intents". Re-derived onto V-9's default: `CONTENDED` **and** `PRIVATE`, grant consumed,
   one erasure intent, one PENDING key-cleanup intent, the orphaned system intent untouched.

---

## 5. Findings

### N1-p2 — R-6's Check assertion 2 (parity) is asserted nowhere (`apps/api/src/publications.ts:417-419`)

SPEC-v3 R-6 names three assertions and states: "At least one test of this slice asserts 1, 2 and 3 on
the system path." Assertion 1 (identity) and assertion 3 (machine-filled fields) are asserted at
`tests/unit/fpd-s01-c2-auto-publish.test.ts:256-290`, which pins the encrypted snapshot as an exact
object — that is why mutant **T10** is now caught. Assertion 2 — "the snapshot the **system** path
writes is field-for-field equal to the snapshot the **owner-driven** path writes, except `public_ref`
and `published_at`" — is a *comparison between the two paths*, and no test makes it.

**Concrete input → wrong outcome.** Mutant `G11` leaves the system path untouched and diverges the
owner path:

```ts
// apps/api/src/publications.ts:417-419 at c358d494 — mutant
const publicDebate = {
  ...publicDebateFromAnswer(publicationRef,pseudonym,input.answer,occurredAt),
  author_pseudonym: `${pseudonym} (verified)`
};
```

Measured: `fpd-s01-c2-auto-publish 14/0 · s8-publication 26/0 · s8-publication-http 4/0 ·
s8-publication-database 25/1 · fpd-s01-c2-system-publication 20/0` → **CLUSTER_GREEN**. The two paths
now write different author fields for the same owner and nothing is red.

**Why non-blocking.** As built the two paths share `publicDebateFromAnswer`, so parity holds today,
and the exact-object assertion catches every divergence a mutant can introduce on the *system* side.
Only a future edit to the owner path is invisible. WHEN, not WHETHER.

**Remedy (the class).** One case that publishes the same answer for the same owner through both
paths and compares the two decrypted snapshots with `public_ref` and `published_at` omitted. The
class is "SPEC Check clauses whose subject is a relation between two code paths"; swept over SPEC-v3,
R-6.2 is the only member.
VERDICT: non-blocking, ticket this pass / CONFIDENCE: high (measured) / STRONGEST COUNTER: parity is
structural while one shared builder feeds both paths, so the test would only ever fail on the edit
that introduces a second builder — which is exactly the edit nobody would think to test.

### N2-p2 — SPEC-v3 §1's mechanical consequence (a) is not pinned (`apps/api/src/index.ts:1026,1123`)

SPEC-v3 §1 states the rule for routes added later and gives the check: "(a) the count of
`AnswerSchema.parse(` send sites in `apps/api/src/index.ts` equals the number of routes carrying the
trigger", and "A route that serves the whole answer and does not trigger is a violation of this SPEC,
not a gap in it." Measured at `c358d494`: **2 send sites** (`:1026`, `:1123`) and **2 trigger call
sites** (`:1025`, `:1121`) — the equality holds today. Nothing enforces it.

**Concrete input → wrong outcome.** Mutant `G12` adds a third `AnswerSchema.parse(` send site
reachable from the existing inspection handler and gives it no trigger:

```ts
// apps/api/src/index.ts, inside GET /v1/answers/{id}/inspection — mutant
if (request.query.version === "__rev_probe__") {
  return reply.send(AnswerSchema.parse(inspection));
}
```

Measured: `fpd-s01-c2-auto-publish 14/0 · api 31/0 · s7-authorization 30/1 ·
s8-publication-contract 4/1` → **CLUSTER_GREEN**. A third answer-serving route that never publishes
a bound Free run — SPEC-v3's own definition of a violation — passes every suite. FIX-A reached the
same conclusion independently: its self-report's upgrade #4 asks for "a static or route-inventory
test" and none was written.

**Why non-blocking.** No third route exists at this head, and both existing ones carry the trigger
(mutant `G4` is caught). This is a guard against a future commit, which is WHEN, not WHETHER.

**Remedy.** One architecture test: parse `apps/api/src/index.ts`, count `AnswerSchema.parse(` send
sites, count `tryAutoPublishServedAnswer(` call sites, assert equal — `tests/architecture/` already
hosts this shape of test.
VERDICT: non-blocking, ticket this pass / CONFIDENCE: high (measured) / STRONGEST COUNTER: a
grep-shaped architecture test is brittle against refactors that rename the helper, and P-B2 will not
recur while the helper is the only way to reach `tryAutoPublish` — the counter fails because the
helper being the only way is precisely what nothing asserts.

### Restated, not re-filed

- **C-N2** (`run-suites.sh:17-23`) is unchanged and correctly routed to the protocol owner; this
  packet's charge 3 carries the rule instead, which means every seat re-implements the scan.
- **C-N4** (the packet's "0 comments" cursor) recurs verbatim in this packet at line 8.

---

## 6. What I did NOT verify

- **SV-9 / R-20.4** and the privilege matrix — the security lens's items; I ran everything under the
  product roles but audited no grants.
- **R-3** as written (before/after-deploy visibility-event set comparison) — I proved only the
  binding half (pre-rule and NULL-tier runs are never bound, and `prepare` now refuses them).
- **SPEC-v3 §4** end to end, including the new steps 3b/3c/11b and step 4's corrected total
  (DECISIONS §31, V-11) — V's walk against a served lane; no stack was served for this pass.
- **P-B1 / V-8** (the UI cannot delete a PUBLISHED debate) — out of this lens and, by the package's
  §2, not closable by any file of a backend-only slice.
- The other lenses' pass-1 or pass-2 outputs — not read.

---

## 7. Predictions about the other two lenses

I expect **security/data-safety** to verdict its own rows ADDRESSED and to spend its pass on `0069`'s
trigger, where I expect it to confirm both tightenings (my `G9` and `G10` are caught) and then to
notice what I saw and left in its lane: the f2 admission now joins `serve.publication_snapshot` to
prove the cleanup publication belongs to the run (`0069:25-33`), which is strictly stronger, while
the `CONTENDED` path still leaves the orphaned system intent in place after the erasure commits — my
probe asserts that row survives — so a run can be erased with a live provisioning intent still
pointing at it, and I predict security files that as a new N about intent lifetime rather than
recognising it as harmless (the intent's own cleanup reconciler removes it on expiry). I also predict
security re-raises the `ensure_free_public_auto_publish_work` return path, which answers `false` when
an uncleared row exists under a different `user_id`/`owner_ref` and silently abandons the publish —
reachable only through an ownership change, so I would tier it N. For **product-truth** I predict it
verdicts P-B2 ADDRESSED on the two trigger sites and then lands on exactly my N2-p2 from the product
side (a third answer route would silently not publish), and that it spends most of its pass on V-8
and on step 4's "plus 2" correction, where I predict it finds `spec-v3-check.sh` does not pin the
total (DECISIONS §31 N3-p3 already says so) and files it even though the orchestrator has ruled it.
My least confident prediction: that neither lens mutates the **owner-driven** publish path, because
both, like me at first reading, will treat the shared builder as proof of parity.

---

## 8. Rows for V

None new from this lens at pass 2. V-9's default is implemented and measured as implemented
(§1, C-B3); V-11's correction is the orchestrator's fold in `DECISIONS.md` §31 and is V's to confirm
at her walk, not a seat's to re-open.
