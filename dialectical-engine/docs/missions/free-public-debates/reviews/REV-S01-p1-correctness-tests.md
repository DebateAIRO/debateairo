# REV(S01) pass 1 — lens **correctness / tests** · mission `free-public-debates`

- seat `REV-S01-p1-correctness-tests` · ticket `t_af8d9bb2` · pass **1 of 3** · model `claude-opus-5`
- slice head `db4758da` on `slice/free-public-debates-s01`, base `5b6cc9b1`; read-only detached worktree
  `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-correctness-tests/dialectical-engine`, 0 dirty at start and at handoff
- oracle: `SPEC-v2.md` R-1…R-25 + §4 · `DECISIONS.md` §§10, 20, 21, 22, 23–25 · `V-DECISIONS-PACKET.md` V-1…V-7
- blind: no other lens's output or verdict was read.

## VERDICT — **REWORK** (pass 1) for this lens

B1 B2 B3 B4 blocking · N1 N2 N3 N4 non-blocking. The other two lenses run in parallel; the
orchestrator unions them.

---

## 1. What I ran, verbatim

### 1.1 Cluster commands (packet charge 4), three runs, worst counts

Runner: `.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh`, cwd = my worktree.
Run 1 was executed in the shell as the agent inherits it (`LANG` unset). Runs 2 and 3 were
executed with `LANG=LC_ALL=en_US.UTF-8`. That difference is finding **B4**.

| cluster | run 1 (LANG unset) | run 2 (UTF-8) | run 3 (UTF-8) |
|---|---|---|---|
| C1 `9/0 · 3/0 · 6/0 · 1/0` | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |
| C2 `8/0 · 16/0 · 26/0 · 25/1` | **CLUSTER_RED** | CLUSTER_GREEN | CLUSTER_GREEN |
| C3 `10/0 · 4/0 · 30/1` | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |
| C4 `8/0 · 14/0 · 8/0` | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |

Run 1, C2, verbatim:

```text
tests/unit/fpd-s01-c2-auto-publish.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/integration/fpd-s01-c2-system-publication.test.ts rc=1 passed=0 failed=0 (expect 16/0)
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
CLUSTER_RED
```

Runs 2 and 3, C2, verbatim (identical in both):

```text
tests/unit/fpd-s01-c2-auto-publish.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/integration/fpd-s01-c2-system-publication.test.ts rc=0 passed=16 failed=0 (expect 16/0)
tests/unit/s8-publication.test.ts rc=0 passed=26 failed=0 (expect 26/0)
tests/integration/s8-publication-database.test.ts rc=1 passed=25 failed=1 (expect 25/1)
CLUSTER_GREEN
```

DELTA failures are the named pre-existing ones and no others
(`.hermes/reports/free-public-debates/probes/REV-S01-p1-correctness-tests/scratch/c2-run2.log`,
`c3-run2.log`):

```text
FAIL  tests/integration/s8-publication-database.test.ts > S8 publication on real PostgreSQL > preserves a committed corpus key when the publish result is transport-ambiguous
FAIL  tests/unit/s7-authorization.test.ts > S7 deny-by-default authorization > keeps one complete, duplicate-free policy row per contract route
  → expected [ 'POST /v1/auth/register', …(51) ] to have a length of 50 but got 52
```

`s7`'s pair is the base pair (expects 50, finds 52) — R-23 holds.

### 1.2 Slice verification list (PLAN §6)

| item | result |
|---|---|
| SV-0 | `packages/contract/generated/client.ts` present in my worktree (dated with the package assembly); no install needed |
| SV-1 R-23 | count `52`; **exact membership** of PLAN §6's 52 strings verified set-equal — 0 missing, 0 extra |
| SV-2 R-24 | `git diff --name-only 5b6cc9b1..db4758da -- apps/ui \| wc -l` → `0` |
| SV-3 R-25 | Premium cases re-run inside C2/C3/C4 (all at landed pairs); see also mutants S6, S7 |
| SV-4 | DELTA suites at their pairs, named failures only (§1.1) |
| SV-5 | GREEN suites at their pairs (§1.1) |
| SV-6 | `pnpm exec tsc --noEmit` → **70** diagnostics, the base count; **no diagnostic names a file this slice wrote** (grep over `publications.ts`, `index.ts`, `main.ts`, `publication.ts`, `schema.ts`, `client.ts`, `free-public*`, `fpd-s01*`, `0066/0067/0068` → 0 hits) |
| SV-7 | runtime-role proof is the security lens's item; my own probe ran every new function under `SET ROLE debateai_runtime` / `debateai_erasure_runtime` on `max:1` pools |
| SV-8 R-13 | pinned by a real test — mutant **T16** (§2) is caught 5/5 + 1/4 |
| SV-9 R-20.4 | not re-measured by me (security lens's item) — **UNVERIFIED** here |
| SV-10 | `grep -oE '\*\*R-[0-9]+' SPEC-v2.md \| sort -u \| wc -l` → `25` |
| SV-11 | V's walk — not impersonated (PLAN §6 forbids it). Steps 5 and 10–11 are the ones B2 and B3 touch |

### 1.3 Mutation campaign — every mutant restored FROM captured bytes; worktree 0 dirty after each

Harness `.hermes/reports/free-public-debates/probes/REV-S01-p1-correctness-tests/mutant.sh`
(root from `$WORKTREE`; captures the file, applies a single-occurrence literal replacement, runs the
runner, restores the capture, fails loudly if `git status --porcelain` is non-empty).

| id | requirement | mutant (file, what changed) | slice suites |
|---|---|---|---|
| T1 | R-4 | `index.ts:1102` auto-publish hook disabled | **RED** |
| T2 | R-8 | `publications.ts:203` BLOCKED branch unreachable | **RED** |
| T3 | R-9 | `publications.ts:219-221` null-pseudonym outstanding record dropped | **RED** |
| T4 | R-11 | `publications.ts:347` `publish_pending` never emitted | **RED** |
| T5 | R-11 | `publications.ts:347` `publish_pending` always emitted | **RED** |
| T6 | R-12 | `index.ts:1201` 409 → 410 | **RED** |
| T7 | R-12 | `index.ts:1201` typed string truncated one char | **RED** |
| **T8** | **R-12/R-15** | `index.ts:1198` `&& visibility.state === "PUBLISHED"` dropped | **GREEN — survives** (N1) |
| **T10** | **R-6** | `publications.ts:230` snapshot built from `input.ownerRef` instead of `pseudonym` | **GREEN — survives** (B1) |
| T11 | R-7 | `publications.ts:218` null-pseudonym guard unreachable | **RED** |
| T14 | R-22 | `packages/contract/src/index.ts:476` required key added to `PublicDebateSchema` | **RED** (15/1, 12/14, 3/1) |
| T16 | R-13 | `index.ts:1175` 409 hoisted above `preflightGrant` | **RED** (5/5, 3/1) |
| T17 | R-14 | `index.ts:1197` 409 moved after `unpublish()` (grant consumed) | **RED** (8/2) |
| S1 | R-2 | `0066:12` `plan_tier='free'` conjunct dropped | **RED** |
| S2 | R-1 | `0066:12` `free_public_rule=true` conjunct dropped | **RED** |
| S3 | R-20.3 | `0067:268` system actor → `user:impersonated-owner` | **RED** |
| S4 | R-21 | `0067:267-271` failed-attempt audit append removed | **RED** |
| S5 | R-5 | `0067:324-329` already-PUBLISHED guard removed | **RED** |
| S6 | R-2/R-25 | `0067:309-314` bound check removed from the system transition | **RED** |
| S7 | R-16/R-19 | `0068:212-213` bound check removed from erasure | **RED** |
| S8 | R-17 | `0068:224-231` PRIVATE visibility event not written | **RED** |
| S9 | V-7 counter | `0068:24` `run_is_free_public_bound` dropped from the `…00f2` admission | **RED** |

T8 and T10 were re-run against the four integration suites as well
(`fpd-s01-c1-binding:9:0 · fpd-s01-c1-privileges:3:0 · fpd-s01-c2-system-publication:16:0 ·
fpd-s01-c4-delete-published:14:0`) — both **CLUSTER_GREEN** there too.

ARCH's own STRONGEST COUNTER on V-7 ("a second hole … could admit PRIVATE on an unbound run if the
bound check is omitted") is refuted: S9 is caught.

### 1.4 My own fixtures (packet charge 2) — built from SPEC-v2's claims, not from the slice's tests

Promoted, runnable from any worktree by dropping them into `tests/`:
`.hermes/reports/free-public-debates/probes/REV-S01-p1-correctness-tests/rev-s01-p1-correctness-probe.test.ts`
(integration, `startTestDatabase`, product roles via `SET ROLE`) and
`…/rev-s01-p1-snapshot-probe.test.ts` (unit, real `PostgresPublicationApplication`).
Run log: `…/scratch/own-probe-head.log`.

```text
× R-5/R-9/R-11: two prepares racing one serve leave the run PUBLISHED *and* publish_pending
  → expected { state: 'PUBLISHED', pending: true } to strictly equal { state: 'PUBLISHED', pending: false }
✓ R-2: a NULL plan_tier is never bound and never system-publishes
✓ R-1: a pre-rule Free run (free_public_rule false) is never bound
✓ R-9/R-10: the reconciler claim is capped at 100 and leaves the overflow for the next pass
✓ R-16/R-17: delete during an in-flight system publish answers CONTENDED and erases nothing
✓ R-8: a BLOCKED bound run's outstanding work clears and stays clear across two passes
✓ R-6 system snapshot identity content > encrypts the account pseudonym and no owner-naming value
✓ R-9/R-10: a key-provision failure records outstanding work, and the retry clears it
✓ R-8: a BLOCKED answer clears the work and never reaches the publish path
```

Parameters exceeded, each with its outcome:

| parameter (packet charge 2) | outcome |
|---|---|
| a Free run served twice at once (two prepares, then two transitions) | exactly **one** snapshot, one publication — R-5 holds; but the loser leaves the run PUBLISHED **and** `publish_pending` → **B2** |
| tier NULL | `run_is_free_public_bound` → `false`; transition → NULL; no visibility event |
| pre-rule Free run (`free_public_rule` false) | same as NULL tier |
| reconciler at zero outstanding | `claim_free_public_auto_publish_work(100)` → 0 rows, no error |
| reconciler above the batch cap (101 outstanding) | 100, then 1, then 0 — the cap is enforced in SQL (`0067:444`), so 101 runs need two passes |
| auto-publish that fails then succeeds | `upsert:AUTO_PUBLISH_KEY_PROVISION_FAILED` + one DENY audit, then `clear` on the retry — R-9/R-10 hold |
| BLOCKED answer | work cleared, publish path never entered, 0 outstanding across two claim passes — R-8 holds |
| delete during an in-flight system publish | `CONTENDED` → **202 `{"status":"PENDING"}`** while nothing is erased and the grant is not consumed → **B3** |
| delete after the orphaned intent is gone | `PREPARED`, latest visibility `PRIVATE` — the window is finite |

---

## 2. Findings

### B1 — R-6's only evidence is a test that cannot fail (`apps/api/src/publications.ts:96-119, 229-231`)

**Concrete input → wrong outcome.** Replace `pseudonym` with `input.ownerRef` in the system-publish
snapshot builder:

```ts
// apps/api/src/publications.ts:229-231 at db4758da
const publicDebate = publicDebateFromAnswer(
  publicationRef,pseudonym,input.answer,occurredAt   // mutant: input.ownerRef
);
```

The auto-published snapshot then carries `author_pseudonym = <the owner ref>` — precisely the value
SPEC-v2 R-6 forbids ("carries no other value that names the owner … the decrypted snapshot contains
no user id, owner ref, session id or email address anywhere in it"). Measured: all six unit suites
and all four integration suites stay at their landed pairs (`CLUSTER_GREEN` twice, §1.3 T10/T10i).

**Why nothing catches it.** `core.transition_system_run_publication` compares
`p_expected_pseudonym` against `identity."user".pseudonym` (`0067:336`) — it validates the
*parameter*, never the ciphertext, and `tryAutoPublish` still passes the correct
`expectedPseudonym: pseudonym` under the mutant. The C2 integration suite's pseudonym test invokes
the SQL function directly and so never executes `publicDebateFromAnswer`. The C2 unit suite *does*
execute `tryAutoPublish` (T2, T3, T11 are all caught there) but never inspects what is encrypted.
So R-6's own *Check* — the one the SPEC writes — exists nowhere.

**Red-green.** My one-test probe is GREEN at head and RED under the mutant:
`expected "a01c4165-fb2d-4a8d-b039-59ba6a919cd3" to be "Public Thinker 41"`.

**Remedy (the class, not the sample).** Assert the encrypted `PublicDebate` of the *system* path,
not only of the owner path: `author_pseudonym` equals the account pseudonym and the serialized
snapshot contains none of `runId`, `userId`, `ownerRef`, `sessionId`. `rev-s01-p1-snapshot-probe.test.ts`
is a ready 1-case implementation. The class is "requirements whose Check names the snapshot
*content*": R-6 is the only member in this slice (R-20.4's content check is SV-9, the security
lens's).
VERDICT: blocking / CONFIDENCE: high / STRONGEST COUNTER: no live defect exists at `db4758da`, so
this is a missing test rather than a broken product — but R-6 is an identity-safety requirement and
the SPEC's own Check is unimplemented, which is what pass 1 exists to catch.

### B2 — a third observable state: `PUBLISHED` **with** `publish_pending` (`apps/api/src/publications.ts:276-283`)

**Concrete input → wrong outcome.** Two concurrent reads of `GET /v1/runs/{id}/answer` for one bound
Free run. Both reach `prepareSystemKeyProvision` before either reaches the transition (the prepare's
`FOR UPDATE` on `core.run` is released at statement end, `0067:134`). One transition wins; the other
returns NULL because the latest visibility is now `PUBLISHED` (`0067:324-329`). The loser then runs:

```ts
// apps/api/src/publications.ts:276-283 at db4758da
if (published === null) {
  await this.repository.abandonSystemKeyProvision(publicationRef,input.userId);
  await this.repository.upsertAutoPublishWork(
    input.runId,input.userId,input.ownerRef,"AUTO_PUBLISH_TRANSITION_NULL"
  );
  return;
}
```

— it writes an *outstanding* record for a run that is already `PUBLISHED`, without re-reading
visibility. `readOwnedVisibility` (`packages/db/src/publication.ts:577-580`) then answers
`publish_pending: true` alongside `state: "PUBLISHED"`.

Measured, verbatim, from my probe:
`expected { state: 'PUBLISHED', pending: true } to strictly equal { state: 'PUBLISHED', pending: false }`.

**What it breaks.** (a) R-9: "the run is in exactly one of two observable states: `PUBLISHED`, or
`PRIVATE` with a readable outstanding record" — this is a third. (b) **SPEC-v2 §4 step 5**, V's own
acceptance step: `GET /v1/runs/<free_run>/visibility` must be `{"state":"PUBLISHED","public_ref":…}`
— "two keys, no `publish_pending`". In the race window V sees three. (c) R-11: the key must be
"absent otherwise". No test in the slice covers a losing concurrent serve.

**Reachability.** V's own walk polls the answer route every 10 s (SPEC-v2 §4.1 step 3); a second tab
or an overlapping poll is enough, and the slow leg (cipher create + encrypt) sits between prepare and
transition. It self-heals on the next reconcile (≤30 s, `apps/api/src/main.ts:306`), because the
reconciler re-reads visibility and clears — so it is a window, not a stuck state.

**Remedy (class).** On a NULL transition, distinguish "lost the race" from "failed": re-read
`readOwnedVisibility`, and `clearAutoPublishWork` instead of `upsertAutoPublishWork` when the state
is already `PUBLISHED`. The class is "every branch that writes outstanding work without re-reading
the run's current state" — members: the `AUTO_PUBLISH_TRANSITION_NULL` branch above (`:276-283`) and
the `AUTO_PUBLISH_KEY_PROVISION_FAILED` branch (`:238-244`), whose `prepareSystemKeyProvision` also
returns false when the run is already `PUBLISHED` (`0067:148`). Both need the same guard; one test
per member.
VERDICT: blocking / CONFIDENCE: high (measured) / STRONGEST COUNTER: the window closes on its own
within one 30 s reconcile tick and the public debate is correct throughout, so V would have to read
visibility inside that window — but step 5 of V's acceptance walk is exactly that read.

### B3 — delete during an in-flight system publish answers **202 PENDING** and erases nothing (`migrations/0068_bound_published_erasure.sql:197-199`)

**Concrete input → wrong outcome.** A bound Free run is published; a `serve.system_publication_key_provision_intent`
row for that run is still live (a second serve in flight, or an attempt that died between
`prepareSystemKeyProvision` and `abandonSystemKeyProvision`). The creator calls
`DELETE /v1/debates/{id}` with a live `DELETE_PRIVATE_DEBATE` grant. C4's new branch fires:

```sql
-- migrations/0068_bound_published_erasure.sql:197-199 (NEW in this slice)
PERFORM 1 FROM serve.system_publication_key_provision_intent AS provision
WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT;
IF FOUND THEN RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN; END IF;
```

`CONTENDED` maps to `PENDING` (`apps/api/src/account-erasure.ts:110-112`), which the route sends as
**202 `{"status":"PENDING"}`** (`apps/api/src/index.ts:793`). Measured by my probe: outcome
`CONTENDED`; latest visibility still `PUBLISHED`; `identity.step_up_grant.consumed_at` still NULL;
`serve.private_run_key_cleanup_intent` rows for the run = 0. Nothing is queued and nothing retries —
the 202 promises an erasure that no component will ever perform.

**What it breaks.** R-17: "After that delete the public copy is gone: the publication is absent from
the public list, and `GET /v1/public/debates/{public_ref}` returns 404." It is not. R-16 permits the
202 *status*, which is exactly why no test fails: the C4 suite asserts `CONTENDED` as the correct
answer for a contended run, so the wrong oracle is pinned green.

**Window.** Up to the intent's 5-minute expiry (`0067:158`) plus one cleanup tick
(`reconcileSystemKeyProvisionCleanup`, 30 s). My probe's second half proves the window is finite:
once the intent is gone the same creator's delete returns `PREPARED` and latest visibility becomes
`PRIVATE`.

**Class.** `CONTENDED → PENDING → 202` is a pre-existing shape (the owner-side intent check at
`0068:194-196` is unchanged from `0040`), so this is a **new member of a pre-existing class**, and
law 3.2 makes the class the unit: both members return a 202 that nothing completes. S01 owns the new
member; the pre-existing one is a ticket, not this slice's rework.
VERDICT: blocking / CONFIDENCE: high (measured) / STRONGEST COUNTER: 202 `PENDING` is a status R-16
explicitly allows, and a user who retries after the window succeeds — so it can be argued as
"eventually consistent" rather than broken; the counter fails because nothing tells the user to
retry and nothing retries for them.

### B4 — the C2 cluster verification command does not reproduce (`tests/integration/fpd-s01-c2-system-publication.test.ts:218-226`)

This suite is the only integration suite in the slice that hand-rolls its database instead of using
the repository's shared helper:

```ts
// tests/integration/fpd-s01-c2-system-publication.test.ts:218-226 at db4758da
embedded = new EmbeddedPostgres({
  databaseDir: join(databaseDirectory, "data"),
  user: "postgres", password: "postgres", port: databasePort, persistent: false,
  onLog(message) { … }, onError(message) { … }
});
```

`tests/support/testDatabase.ts:88-93` — used by `fpd-s01-c1-binding`, `fpd-s01-c1-privileges`,
`fpd-s01-c4-delete-published` and `s8-publication-database` — pins
`initdbFlags: ["--encoding=UTF8", …]`. Without that pin, `initdb` derives the encoding from the
process locale. In a shell with no `LANG`/`LC_ALL` (the default a background seat inherits) it picks
`SQL_ASCII`, and `migrate()` dies on the first migration that calls `normalize()`:

```text
[C2 DB] ERROR:  Unicode normalization can only be performed if server encoding is UTF8
 FAIL  tests/integration/fpd-s01-c2-system-publication.test.ts
error: Unicode normalization can only be performed if server encoding is UTF8
 ❯ migrate packages/db/src/index.ts:836:7
 ❯ tests/integration/fpd-s01-c2-system-publication.test.ts:239:3
```

All 16 tests are SKIPPED (`↓`), and the shared runner scores the suite `passed=0 failed=0`
(§1.1, run 1). Proof it is the locale and nothing else: the identical command with
`LANG=LC_ALL=en_US.UTF-8` is `passed=16 failed=0` (`…/scratch/c2-utf8.log`).

The 16 tests that go dark are the ones carrying R-4, R-5, R-6, R-20 and R-21 — the whole system
publish. A cluster gate that only passes on an ambient locale is not a gate.

**Remedy (class).** Use `startTestDatabase()`, or at minimum carry the same `initdbFlags`. Class =
"integration suites that construct `EmbeddedPostgres` directly"; swept at `db4758da`:
`fpd-s01-c2-system-publication.test.ts` is the **only** member among this slice's four integration
suites and among the slice's asserted regression suites.
VERDICT: blocking / CONFIDENCE: high (measured both ways) / STRONGEST COUNTER: the BUILD seat's
three green runs were real on its machine and CI may export a UTF-8 locale — but a verification
command a reviewer cannot reproduce from a clean environment fails law 3.5's purpose, and the
failure mode is silent (N2).

### N1 — nothing pins that the 409 is scoped to a PUBLISHED run (`apps/api/src/index.ts:1197-1202`)

Mutant T8 removes `&& visibility.state === "PUBLISHED"` and every slice suite and regression suite
stays at its landed pair (unit **and** integration). Under that mutant a bound Free run that is
`PRIVATE` — e.g. one with an outstanding auto-publish — answers
`409 FREE_DEBATE_CANNOT_BE_UNPUBLISHED` where R-12 scopes the refusal to "a bound, **published**
run". Add one case: unpublish on a bound run whose latest visibility is `PRIVATE` must not be the
409. Ticket at end of pass.

### N2 — the shared runner reads a fully-skipped suite as RED, not BROKEN (`run-suites.sh:17-23`)

```sh
s=$(… grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
ap=$(… 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0}
af=$(… 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0}
```

A suite whose bootstrap throws prints `Tests  16 skipped`, which matches neither regex, so it scores
`0/0` — the runner's own contract says a suite that cannot run is `BROKEN`, never RED, and a step
that handed it the pair `0:0` would print `CLUSTER_GREEN`. This is a new member of the TOOLING-TRAPS
class already recorded for `No test files found`. Finding against the orchestrator's shared tool, not
against a BUILD seat. Remedy: also treat `skipped` with zero passed/failed, or a non-zero `Test Files
… failed` count with `0/0`, as BROKEN.

### N3 — a Premium/unbound BLOCKED answer performs a write (`apps/api/src/publications.ts:203-206`)

The `terminal === "BLOCKED"` branch calls `clearAutoPublishWork` **before** the bound check, so every
BLOCKED answer read for any run — Premium, NULL tier, pre-rule — issues
`core.clear_free_public_auto_publish_work` against a table that can never hold that run. Observably
R-25 still holds (the function returns false and changes nothing), so this is non-blocking; it is
listed because R-3/R-25's "unchanged end to end" is being carried by "the UPDATE matches no rows"
rather than by "the code is not reached". Move the bound check above the BLOCKED branch.

### N4 — packet defects (against the orchestrator's packet, not against a BUILD seat)

- `packets/REV-S01-p1-correctness-tests.md:8` says "comment cursor at dispatch: 0 comments";
  `t_af8d9bb2` already carried the orchestrator's own `DISPATCHED` comment when the seat started, so
  the first honest cursor is **1**. My CLAIM and verdict both say `comments read through: 1`.
- Every other constant the packet quotes checks out: base `5b6cc9b1`, head `db4758da`, the four
  landed pairs of charge 4, the freeze pair `5b769877..9386a844` (the CWD-relative pathspec resolves
  and returns 45 changed files), the `allowed` list covers every deliverable the packet demands, and
  the packet path resolves from the stated cwd.
- Author `SKILLS LOADED` lines were not checkable from my inputs: the package (§3) points at the
  BUILD seats' self-reports and READY comments, which are other seats' outputs — reading them would
  break blindness on this pass. **UNVERIFIED**, flagged for the orchestrator.

---

## 3. What I did NOT verify

- **SV-9 / R-20.4** (no phantom `identity.session` or `step_up_grant` row) and **SV-7**'s privilege
  matrix — named in the packet as the security lens's items; I ran my probes under the product roles
  but did not audit grants.
- **R-3** as written ("the set of `core.run_visibility_event` rows for runs created before the deploy
  is identical before and after it") — I proved the binding half (a pre-rule run is never bound: S2
  mutant RED, probe case 3), not a before/after deploy set comparison against a populated database.
- **SPEC-v2 §4** end to end — PLAN §6 SV-11 reserves it for V against a served lane; no stack was
  served for this pass (package §5). Steps 5 and 10–11 are the ones B2 and B3 predict will fail.
- The other lenses' outputs and verdicts — not read (blind).

---

## 4. Predictions about the other two lenses

I expect **security/data-safety** to converge with me on B3 from the other side: it is charged with
V-7 and will look hardest at the `…00f2` admission in `0068:21-31`, and I predict it finds that
admission sound (my S9 mutant proves the bound check is pinned by a real test) but then notices that
`serve.prepare_system_publication_key_provision` has **no** bound check of its own (`0067:121-161`)
— any run, Premium or NULL-tier, can have a system intent prepared for it, which is harmless for
publication (the transition rejects it, S6 RED) but is exactly the row that makes B3's delete answer
`CONTENDED`; that is the same defect reached from the data-safety side, and I expect it to be filed
as a separate finding rather than recognized as one class with mine. I also predict security raises
`abandonSystemKeyProvision`'s missing `.catch()` on the transition-NULL path (`publications.ts:277`,
unlike the guarded call at `:253`) as a durability finding, and that it does **not** find B1, because
B1 is invisible unless you mutate the snapshot builder — the code reads correctly. For
**product-truth** I predict it lands on B2 from V's step 5 (three keys where the SPEC promises two)
and possibly disputes it as cosmetic; I predict it does **not** reach B3, because reaching it needs a
concurrency fixture rather than a reading of the acceptance walk, and that it raises the residue R-21
scope note (no audit row for a refused unpublish) as a product gap even though SPEC-v2:173-176
explicitly removed it — that would be a finding against a frozen SPEC, not against the build. My
least confident prediction is B4: if either lens ran its clusters in a terminal that exports a UTF-8
locale, neither will have seen C2 go dark, and both will report the C2 pair as reproduced.

---

## 5. Row for V

```
V-ROW: NEW · S01 · t_2e15bf90 · What the creator is told when a delete races the server's own publish
A DELETE of a bound, published Free debate returns 202 {"status":"PENDING"} whenever a system publication intent for that run is still live (migrations/0068_bound_published_erasure.sql:197-199 → apps/api/src/account-erasure.ts:110-112 → apps/api/src/index.ts:793). Measured at db4758da: the grant is not consumed, no erasure is queued, the debate stays public, and nothing retries. The window is up to 5 minutes (the intent's expiry) plus one 30 s cleanup tick; after it, the same call succeeds.
Recommended default: keep the 202 but make it true — queue the erasure and let the existing reconciler complete it once the intent clears, so PENDING means "it will happen" for this path as it does for every other 202 on this route.
Smallest yes/no for V: "When a delete arrives while the server is still publishing the same debate, should the 202 PENDING mean the delete is queued and will complete by itself?"
VERDICT: yes, make the 202 truthful / CONFIDENCE: medium / STRONGEST COUNTER: the cheaper fix is a distinct refusal (409 or 503 with a retry hint) that tells the caller to repeat the delete, which adds no queue and no new durable state — but it changes the delete route's status set, which R-16 pins to today's 200/202.
```
