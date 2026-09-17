# FIX-S02-p1-F1 case file — ticket `t_ee9362b5`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Commit `88496931` on `slice/tiers-s02` makes both `RunRepository.startRun` writers compatible with schemas before migration 0061 while preserving `plan_tier` on current schemas. The plaintext writer checks the column before constructing its INSERT (`packages/db/src/index.ts:635`, `packages/db/src/index.ts:1138`, `packages/db/src/index.ts:1259-1286`). The encrypted writer strips the new JSON key inside the existing `core.create_encrypted_run` SQL call when the installed function body predates 0061 (`packages/db/src/index.ts:1198-1208`). Two embedded-Postgres cases pin both old-schema paths (`tests/integration/tiers-s02-run-plan-tier.test.ts:270`, `tests/integration/tiers-s02-run-plan-tier.test.ts:287`).

The promoted probe moved from `Test Files 2 failed | 1 passed (3)` / `Tests 34 failed | 42 passed (76)` / 14 exact 42703 hits to `Test Files 3 passed (3)` / `Tests 76 passed (76)` / 0 hits. The fourth pair moved from 69/72 to 70/72; only its two dated pre-existing failures remain. C1 was 27/27 three times (+2 from 25/25), C2 was 55/55 three times, and `run_suites` emitted `CLUSTER_GREEN` for 6/6 plus 21/21. Typecheck retained rc 1 from other missions and named 0 allowed paths.

## Cause file

### F1 — one deploy-ordering change created two different compatibility breaks

- **Cause:** C1 added `plan_tier` to the plaintext INSERT and `planTier` to the encrypted payload unconditionally. A pre-0061 table rejects the first with 42703; a pre-0061 `core.create_encrypted_run` rejects the second through its key allow-list and returns `false`.
- **Price:** 35 previously green cases regressed. The mandatory RED probes consumed about 75 seconds and wrote 40,201 full-log lines. Exact model-token accounting is unavailable in this harness; the retained logs are the auditable proxy.
- **Nearly wrong:** treating this as only the reported missing-column error would have left the encrypted path silently refusing runs as `RUN_OWNER_INVALID`.
- **Resolution:** capability selection is per writer, not one global switch. The old-schema tier is omitted; the current-schema tier remains readable.
- **Recommendation:** review packets for migrations that change a table plus a security-definer function should require a compatibility cell for each writer. **VERDICT:** add a writer × schema-version matrix to the packet generator / **CONFIDENCE:** high / **STRONGEST COUNTER:** the matrix adds packet surface, but it exposes independently failing contracts before implementation.

### F2 — column existence was not the encrypted function's capability

- **Cause:** the first implementation used the table column as the shared signal. In S6's historical-schema sequence, the column can be present while the installed function body is pre-0061. The 42703 count reached zero, but 30 encrypted cases failed as `RUN_OWNER_INVALID`.
- **Price:** one discarded implementation and one 39,103-line probe log, about 57 seconds wall-clock. A second iteration separated the checks but added metadata round-trips; it left 2/76 RED, and moving those reads to the runtime pool left 1/76 RED. Across the three discarded GREEN attempts, 116,997 log lines were generated and about three minutes elapsed.
- **Dead ends:** (1) one `column exists` Boolean for both writers; (2) a separate `pg_get_functiondef` query on the held admission/provision client; (3) moving both metadata queries to the runtime pool.
- **Nearly wrong:** the promoted probe prints `B1 ABSENT` once 42703 hits reach zero, so the first discarded implementation looked successful unless the exact suite table was also enforced.
- **Resolution:** the encrypted path tests the installed function inside the same mutation-bearing SQL statement, so no preflight query can consume a transport fault.
- **Recommendation:** compatibility probes should model each changed database capability independently and fault-injection suites should be in the first cluster gate. **VERDICT:** promote S6's ambiguous-commit cases into the migration packet's initial verification set / **CONFIDENCE:** high / **STRONGEST COUNTER:** this lengthens the first cycle, but it avoids three full-class retries.

### F3 — the promoted probe's success marker can contradict its suite table

- **Cause:** `REV-S02-p1-correctness-tests-pre-0061-schema.sh` exits success and prints `B1 ABSENT` whenever the exact 42703 hit count is zero. It does not require Vitest rc 0 or 76/76. Two discarded implementations therefore produced `B1 ABSENT` at 46/76, 74/76, and 75/76.
- **Price:** no false handoff occurred because the packet also pinned the exact table. Without that duplicate oracle, this would cost another review pass. Three misleading marker frames were generated.
- **Packet ambiguity:** `FIX-S02-p1-F1.md:29` requires both the exact table and the runner marker, but the named runner can disagree with that table.
- **Recommendation:** the probe should emit `CLUSTER_GREEN` only when rc=0, file count=3, tests=76/76, and hits=0; every other complete run should be `CLUSTER_RED`. **VERDICT:** correct the promoted probe before REV pass 2 / **CONFIDENCE:** high / **STRONGEST COUNTER:** a hit-only detector is narrower by design, but the packet calls its marker the verdict.

### F4 — capture-first output containment saved the evidence channel

- **Cause:** embedded PostgreSQL emits tens of thousands of initialization, expected-error, and shutdown lines per class run. Seven principal probe logs alone contain 198,270 lines.
- **Price:** the full logs stayed on disk while the seat transcript carried only failure names and summary lines. Model-token accounting is unavailable; transmitting the full logs would have dominated the session.
- **Resolution:** one scratch runner validated file count, case count, and marker while preserving unique full logs. No log was overwritten.
- **Recommendation:** packet generation should create this runner and all attempt paths before dispatch. **VERDICT:** make capture-first marker scripts packet artifacts, not seat-authored scratch / **CONFIDENCE:** high / **STRONGEST COUNTER:** generated runners can encode a false oracle, so each must be tested once against a known missing path and known RED count.

### F5 — the prior-mutant instruction has a scope edge

- **Cause:** `FIX-S02-p1-F1.md:29` says to rerun each correctness-matrix mutant that names `packages/db`, while `:32` forbids writing `apps/**`. M6 names the database call in its property but mutates `apps/api`; RevA also spans both surfaces. The phrase “touch your surface” resolves the intent, but the matrix lacks a machine-readable mutant target column.
- **Price:** one extra scope reconciliation and roughly two minutes of document checking. No forbidden path was written. M7, M8, M18, and M19 were rerun because their mutation targets are in this seat's surface.
- **Nearly wrong:** interpreting “names packages/db” literally could have caused an unauthorized `apps/api` mutant.
- **Recommendation:** packets should enumerate mutant IDs and exact writable targets, after intersecting them with the seat's forbidden list. **VERDICT:** generate the mutant list from target paths, not property prose / **CONFIDENCE:** high / **STRONGEST COUNTER:** the current phrase is readable to a careful seat, but it is not deterministic enough for one-prompt execution.

## Refutation receipts

| Mutant | Target result | Neighbor result | Restore |
|---|---|---|---|
| unconditional plaintext pre-0061 INSERT | legacy pre-0061 RED | encrypted pre-0061 GREEN | snapshot byte-equal; status printed |
| disable encrypted pre-0061 payload stripping | encrypted pre-0061 RED | legacy pre-0061 GREEN | snapshot byte-equal; status printed |
| M7 encrypted tier becomes NULL | encrypted current-schema persistence RED | legacy current-schema persistence GREEN | snapshot byte-equal; status printed |
| M8 plaintext tier becomes NULL | legacy current-schema persistence RED | encrypted current-schema persistence GREEN | snapshot byte-equal; status printed |
| M18 remove `planTier` from function allow-list | encrypted current-schema persistence RED | legacy current-schema persistence GREEN | migration snapshot byte-equal; status printed |
| M19 remove vocabulary constraint | constraint case RED | column/mapping case GREEN | migration snapshot byte-equal; status printed |

## One-prompt upgrade

Emit one executable manifest containing: ordered absolute reads; exact comment cursor; authorized product paths; explicit mutant ID→target→expected target/neighbor counts; capture-first runners with unique log names; and a gate whose marker incorporates rc, file count, case count, and defect-specific count. The seat then supplies only diagnosis and code, while the manifest rejects scope drift and contradictory evidence mechanically.

## Unverified

No live dev database, `:3000` stack, main-tree product file, `.local/**`, or V desktop surface was touched. The SPEC R12 live read-back command was not executed because the packet forbids the live database; V owns that acceptance step.
