# REV(S01) pass 3 (SCOPED to L1, the LAST pass) — lens SECURITY / DATA-SAFETY — verdict **PASS** (one non-blocking, S-N10)

- seat `REV-S01-p3-security-data-safety` (the p1/p2 lens, same session resumed) · pass **3 of 3** · ticket `t_6199cf96`
- slice head `86b391a0` read-only in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-security-data-safety/dialectical-engine` · previous head `c358d494` · base `5b6cc9b1` · worktree 0 dirty at handoff, no git writes
- oracle: `SPEC-v3.md` (unchanged) · scope: the live finding **L1** and its fix
- probes: `.hermes/reports/free-public-debates/probes/REV-S01-p3-security-data-safety/`
- **L1 is ADDRESSED by measurement: the API would boot on a database migrated through 0071.** No stack was started and no container touched.

---

## 1. The packet, reviewed first

Correct against source: base `5b6cc9b1` · previous head `c358d494` → slice head `86b391a0` (my `git rev-parse HEAD`) · the diff since pass 2 is 3 files / +92 / −2, exactly as the package states · the freeze pair `1321fc06..e367e58a` returns 174 files / 22536 insertions from my cwd · `comment cursor at dispatch: 1 comment` — **correct this time**, the first packet of the three to state the cursor accurately. The SPEC of record is unchanged. The `allowed` list covers both deliverables and the probe tree. No packet defect found this pass.

## 2. L1, by measurement (charge 1)

The failure L1 reports is an exact-count attestation: `packages/db/src/account-erasure.ts:222-226` counts **every** function in `identity`, `core` and `serve` that the erasure principal may EXECUTE, and `:308` requires that count to equal `ERASURE_FUNCTION_SIGNATURES.length` = 20. `migrations/0066_free_public_rule.sql:21` granted a 21st, so `assertAccountErasureDatabaseRole` threw `ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED` at boot. `migrations/0071_isolate_erasure_role_from_free_public_predicate.sql:4` revokes it.

I migrated an embedded Postgres to head, provisioned the **real login principals** with the product's own `provisionDevelopmentDatabasePrincipals`, and ran every assertion `apps/api/src/main.ts` executes in its start-up `Promise.all` (`:122-131`), each as its own login role — never a superuser pool:

```
F1 Promise.all:
 "assertAccountErasureDatabaseRole(pool,erasurePool) [main.ts:123]": "OK"
 "assertAccountErasureDatabaseRole(legacyAskAdmissionPool,erasurePool) [:124]": "OK"
 "assertPublicationDatabaseRoleSeparation(pool,authorizationPool) [:125]": "OK"
 "assertPublicationCleanupDatabaseRole(publicationCleanupPool) [:127]": "OK"
 "assertContentProvisionDatabaseRole(pool,contentProvisionPool) [:129]": "OK"
 "assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool) [:130]": "OK"
```

All six pass. **ADDRESSED.**

## 3. The class, re-derived by me (charge 6)

I did not read the FIX seat's list and check it; I extracted every `GRANT` and `REVOKE` from the five migrations myself and reasoned from the attestations.

**Every privilege statement in 0066–0071.** `0066:19-21` (revoke from PUBLIC, grant to `debateai_runtime`, grant to `debateai_erasure_runtime`) · `0067:457-465` (nine revokes from PUBLIC), `:467-474` (seven functions to `debateai_runtime`), `:476` (SELECT on `core.free_public_auto_publish_work` to `debateai_runtime`), `:478-480` (two functions to `debateai_publication_cleanup`) · `0068` **none** · `0069` **none** · `0070:146-148` (revoke from PUBLIC, grant to `debateai_runtime`) · `0071:4` (the revoke).

**Exactly one grant to `debateai_erasure_runtime` exists across all five migrations — `0066:21` — and `0071:4` revokes it.** There is no seventh member and no GRANT the sweep missed.

**The second exact-count attestation, which the FIX seat's self-report does not name.** `assertContentProvisionDatabaseRole` has the same shape: `packages/db/src/index.ts:211-214` counts functions in `core` executable by `debateai_content_provision` and `:276` requires 6. It is the other member of the class *"a role whose function set is attested by exact count"*, and it is one `GRANT … TO debateai_content_provision` away from the same boot failure. No migration of 0066–0071 grants that role anything, and the new regression test does exercise it (twice). Measured:

```
F2 erasure count: 20 (attestation requires 20)
F2 content_provision core count: 6 (attestation requires 6)
F2 content_provision set: ["core.claim_run_key_provision_cleanup(integer)",
  "core.complete_run_key_provision_cleanup(uuid,uuid)","core.complete_run_key_provision(uuid,uuid,uuid,uuid)",
  "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)","core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
  "core.prepare_run_key_provision(uuid,uuid,uuid,uuid)"]
```

**The silent member I went looking for and did not find.** `has_function_privilege` reads the function's ACL, and PUBLIC is in it — so a *new* function created without an explicit `REVOKE ALL … FROM PUBLIC` is executable by PUBLIC and therefore counts against **both** exact-count roles, without any role ever being named in a GRANT. That is the shape of a defect this class would hide. Every new function in these migrations carries its revoke (`0066:19`, `0067:457-465`, `0070:146`), and `CREATE OR REPLACE` of an existing function preserves its ACL. Measured: `F2 functions in identity/core/serve executable by PUBLIC: 0`, with an empty set printed. The hole is not there.

**The reverse question — any other start-up gate that counts or pins something 0066–0071 changed.** I swept `main.ts`, `packages/db/src` and `apps/runner/src` for `pg_proc`, `has_function_privilege`, `has_table_privilege` and count pins:

| gate | what it pins | moved by 0066–0071? |
|---|---|---|
| `assertAccountErasureDatabaseRole` (`main.ts:123-124`) | exact count 20 over identity+core+serve; forbidden-role and sensitive-helper sets | **yes — this was L1**, closed by 0071 |
| `assertContentProvisionDatabaseRole` (`:129-130`) | exact count 6 over `core` | no grant to that role in any of the five |
| `assertPublicationCleanupDatabaseRole` (`:127`) | four named capabilities, plus `can_transition` and `cleanup_table_dml` both FALSE | `0067:478` adds two functions additively; it is capability-based, not a count |
| `assertPublicationDatabaseRoleSeparation` (`:125`) | privileges on `identity.step_up_grant` only | untouched by all five |
| `assertSupportDatabaseRole` ×2 + `assertSupportKeyCoverage` (`main.ts:574-576`) | the `support` schema only — table lists, a `count(*)=16`, table counts | structurally immune: no object of these migrations lives in `support` |
| `apps/runner/src/dev-auth-data-plane.ts` | nothing — it orchestrates migrate and service start; no privilege or count pin | — |
| migration-count pin | none exists anywhere in `packages/db/src`, `apps/api/src`, `apps/runner/src` | — |

`assertSupportDatabaseRole` is the one start-up gate outside the `Promise.all` that the new regression test omits, so I ran it too, against the real `SUPPORT_DATABASE_URL` principal: `F1 later start-up gate: "assertSupportDatabaseRole(pool,supportPool) [main.ts:574]": "OK"`. That is finding **S-N10** below — today it is a coverage gap, not a defect.

## 4. The fix traded nothing away (charge 2)

```
F3 runtime reads the predicate: true
   | erasure direct: 42501:permission denied for function run_is_free_public_bound
   | erasure through the SECURITY DEFINER function: NOT_FOUND
```

The runtime role still evaluates `core.run_is_free_public_bound` on a real bound run — the path the auto-publish hook and the unpublish refusal both take through `packages/db/src/free-public-binding.ts`. The erasure principal no longer executes it directly, which is the whole of 0071. It still reaches the predicate *inside* `core.prepare_private_run_erasure`, which is `SECURITY DEFINER` and runs as the owner: an unauthorized call answers the opaque `NOT_FOUND`, **not** `42501` — a privilege error there would have meant bound deletion was broken for everyone, which is the trade this charge exists to detect. Confirmed end to end by the suite that owns R-15…R-19: `fpd-s01-c4-delete-published.test.ts rc=0 passed=17 failed=0` in **both** locale runs.

## 5. The regression test is real (charge 3)

Mutant applied inside the probe's own ephemeral database: re-grant the revoked EXECUTE, re-run the assertion, restore **from the captured `proacl`**, never to a literal.

```
F4 before: OK | mutant: THREW:ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED
   | mutant count: 21 | after restore: OK
F4 ACL byte-equal after restore: true
```

The mutant reproduces L1's exact error and its exact cause — the count moving 20 → 21 — and the assertion returns to OK once the grant is withdrawn. The shipped test `tests/integration/fpd-s01-l1-boot-role-assertions.test.ts` is `1/0` in both locale runs, and `tests/integration/fpd-s01-c1-privileges.test.ts:94-100` now asserts the `42501` where it previously asserted `bound: true` — a test that inverted with the fix rather than being deleted.

## 6. Both locale runs (charge 4)

The orchestrator's 21-suite gate list, from my cwd, every spec passed as its own argument.

- **ambient** (`env -u LANG -u LC_ALL`): `CLUSTER_GREEN`, all 21 at their pairs, **0 skipped**.
- **`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`**: `CLUSTER_GREEN`, `diff` against the ambient output **empty — byte-identical**, **0 skipped**.

Including `dev-database-principals.test.ts 16/0` — the suite whose omission from the 19-suite gate is why L1 reached a live launch — and `fpd-s01-l1-boot-role-assertions.test.ts 1/0`. The only failures in either run are the five named RED at base.

## 7. Findings

No blocking findings.

**S-N10 — the new regression test does not cover every start-up gate its name claims.** `tests/integration/fpd-s01-l1-boot-role-assertions.test.ts:46` is titled *"passes every role assertion executed by API startup against the real login principals"* and asserts the six members of `main.ts:122-131`. Three further assertions run before `listen` and are not in it: `assertSupportDatabaseRole(pool, supportPool)` and `assertSupportDatabaseRole(pool, supportRelayLeasePool)` at `apps/api/src/main.ts:574-575`, and `assertSupportKeyCoverage(supportPool)` at `:576`. They are immune to *this* slice — every pin in them is scoped to the `support` schema, and no object of 0066–0071 lives there — and I measured the first as `OK` against the real principal, so nothing is broken today. The gap is that the suite written to catch this class would not catch its next instance in `support`, while carrying a name that says it would. The credential the test needs already exists: `SUPPORT_DATABASE_URL` is emitted by `provisionDevelopmentDatabasePrincipals` (I called it and read the key). *Remedy:* add the three calls, or narrow the test's name to the `Promise.all`. **VERDICT: add the three calls / CONFIDENCE: high / STRONGEST COUNTER:** support-schema pins cannot be moved by a migration that writes no support object, so this buys nothing until a future slice touches `support` — which is exactly when nobody will remember to look.

I also record, without filing it as mine, that the FIX seat's own upgrade #2 — a CI matrix of migration GRANTs against boot attestations — is the structural remedy for the class. There are **two** exact-count attestations (20 over identity+core+serve, 6 over core) and neither fails at migration time; the only detector is a suite somebody has to remember to include, which is precisely how L1 escaped a three-lens PASS.

## 8. UNVERIFIED — stated, not assumed

1. **A real boot of the API process.** I ran every start-up assertion against the real login principals on a database migrated to head, which is what charge 1 defines ADDRESSED as. I did not start the API: the packet forbids serving a stack, and `assertPublicationSecretDomains` (`main.ts:86`), the Argon2 worker handshake and `api.listen` are outside what I exercised.
2. **The live development database** (`:55432`, `:7077`, `:8888`) where L1 was first seen. No-touch; every measurement here is on my own ephemeral embedded Postgres.
3. **V's acceptance walk** (`SPEC-v3.md` §4, step 4 read as "plus 2" per `DECISIONS.md` §31). No stack served; REV does not impersonate V.
4. **My pass-1 and pass-2 findings.** Pass 3 is scoped to L1; S-N8 and S-N9 from pass 2 were non-blocking and are not re-measured here. Nothing in the 0071 diff touches them — it is one `REVOKE` plus two test files.
5. **`assertSupportKeyCoverage` and the relay-lease variant** of the support assertion: named in S-N10, not executed.

## 9. Predictions about the other lens

Correctness/tests shares this pass with me, and I expect it to reach the same ADDRESSED on L1 by a different route — re-running the 21-suite gate three times per locale rather than driving the assertions directly — and to spend its remaining budget on whether `dev-database-principals.test.ts` belongs in the permanent gate list, which is the process half of the same defect. I predict it flags the same test-name-versus-coverage gap I file as S-N10, or else misses it entirely, because seeing it requires reading `main.ts` past the `Promise.all` rather than reading the test. I predict it does **not** re-derive the GRANT sweep from the migrations — the FIX seat's six-member list is stated confidently in a READY comment, and checking it costs a `grep` most reviewers will not spend — and therefore does not notice that `assertContentProvisionDatabaseRole` is a second exact-count attestation of the same class. If it returns REWORK, I expect it to be about gate composition rather than about 0071 itself, which is five lines that do exactly one thing.

## 10. Rows for V

**None.** This lens PASSES at pass 3. L1 is ADDRESSED by measurement, the fix trades nothing away, its regression test fails when the fix is removed, and S-N10 is a test-coverage tightening with a named one-line remedy and no product question inside it.
