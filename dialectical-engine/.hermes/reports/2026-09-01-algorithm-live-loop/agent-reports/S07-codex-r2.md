CODEX REVIEW S07 r2 — CHANGES · comments read through: s07-r2-2026-09-02

# S07 T9 synthesis serve chain — Codex review r2

VERDICT: REWORK (filing r3 = rework 1/3)

Finding count: 2 blocking, 1 non-blocking. Packet defects: 1.

## Review basis

Static review only, per the packet ruling. I read the packet and controlling rulings before the role contract, r1 verdict, T09 ticket, worker filing, full `e040b1ee..4fbbf2e3` diff, implementation, changed tests, migration 0057, and supplied gate/mutant evidence. I did not run tests, builds, installs, migrations, provider calls, or mutation commands.

The filing reconciles statically at the pinned tip: HEAD `4fbbf2e36048b7d4dade9ddcfca72fbd9abb4750`, tree `bbe5d57b0ba6c39d6cbac4d631d2dd1aa878388f`, seven commits, 21 changed files, `+3307/-469`, no mode changes, clean lane worktree, and worker-report self-hash `ad2e6d02437707ece9fdc1f4dc06808ac33b641ac39e09278cc2ac0d8e83f582`. All eight current r3 gate logs name that commit and tree. Those checks authenticate the supplied artifacts; they are not fresh execution.

## Blocking findings

### S07-r2-B1 — Migration 0057 persists the synthesis transcript outside the encrypted-content and authorized-read boundary

**Input → wrong outcome:** Execute the now-durable synthesis loop for a server-session run whose `content_encryption_version` is 1. The existing contract says every later content carrier for such a run must store an AEAD envelope and harmless sentinel (`migrations/0038_content_encryption.sql:3-8`); neighboring `serve.fact_bundle` and `serve.composed_text` are registered carriers and their plaintext inserts are rejected (`migrations/0038_content_encryption.sql:18-19`, `132-140`). Migration 0057 instead gives `serve.synthesis_round` plaintext JSON/text columns for the exact synthesizer request, candidate statement, evaluator request/verdict, and objection, with no ciphertext or attestation column (`migrations/0057_t09_synthesis_round.sql:34-50`). `ServeRepository.persist` writes all five bodies verbatim (`packages/serve/src/index.ts:1759-1789`) even though the same method encrypts the fact bundle and composed text immediately before opening the answer transaction (`packages/serve/src/index.ts:1590-1630`).

The new reader compounds the leak: `readSynthesisRounds(answerId, answerVersion)` selects and returns the plaintext directly, with neither an ownership argument nor a content lease (`packages/serve/src/index.ts:1894-1935`), while `readAnswerProjection` normalizes ownership and decrypts the protected serve carriers (`packages/serve/src/index.ts:2044-2056`, `2108-2136`). A caller that knows another answer UUID can therefore ask this exported repository for its complete round transcript; destroying the run's debate key also leaves this duplicate plaintext intact. The encrypted raw artifacts and composed answer no longer provide crypto-erasure for the same content.

**Required outcome:** Either persist only opaque, authorized ledger references, or make `serve.synthesis_round` a complete encrypted carrier: ciphertext/attestation storage, sentinel plaintext fields, database rejection of plaintext writes for encrypted runs, carrier registration, ownership-aware content-lease read/decrypt, and inclusion in the physical-carrier leakage/crypto-erasure tests. Protect the request, candidate, verdict, and objection together; encrypting only `candidate_statement` would leave equivalent private content in both JSON requests and the verdict.

**Test gap:** The new round integration arm uses an unencrypted legacy-style run and calls the ownership-free reader (`tests/integration/database.test.ts:4082-4104`). The 14-carrier encryption suite enumerates `serve.fact_bundle` and `serve.composed_text` but cannot see `serve.synthesis_round`, so both the plaintext-write rejection and persisted-row leakage scans remain green while this new carrier leaks (`tests/integration/s6-content-encryption-database.test.ts:4912-4925`, `4975-4990`, `5063-5080`).

### S07-r2-B2 — The durable candidate “reference” is still arbitrary text, and its D35 oracle never resolves it

**Input → wrong outcome:** Supply a syntactically valid synthesis result with `candidateRef: "artifact:ghost"`. `runSynthesisLoop` rejects only the empty string (`packages/serve/src/synthesis.ts:510-518`), migration 0057 accepts any nonempty text (`migrations/0057_t09_synthesis_round.sql:39-42`), and `ServeRepository.persist` copies it without consulting `ledger.raw_artifact` (`packages/serve/src/index.ts:1769-1788`). Round 2 will persist `priorCandidateRef: "artifact:ghost"`, and the new database test still passes: it checks only that the copied string equals round 1's stored string, differs from round 2's string, and lacks the retired `candidate:round-` prefix (`tests/integration/database.test.ts:4097-4101`). No row establishes that the reference resolves.

The production adapter currently supplies `response.rawArtifactRef` (`apps/runner/src/index.ts:3572-3582`), which is the right source. The durable boundary nevertheless discards that stronger type/invariant, unlike the canonical composed-answer relation whose `raw_artifact_ref` is a UUID foreign key to `ledger.raw_artifact` (`migrations/0000_s00.sql:223-228`). A random nonexistent UUID or a differently prefixed fake kills neither the current schema nor the current oracle. Under D35, reading the same unvalidated string back in two friendly shapes is not an independent measurement.

**Required outcome:** Store a typed raw-artifact key with referential integrity and establish that it belongs to the same run/round producer before the answer transaction commits. Make the acceptance test join the persisted round through its answer/run to the authoritative `ledger.raw_artifact` row (and fail for a missing or cross-run target). Keep the existing verbatim objection assertion; that part is genuinely measured from the database.

**Test/evidence gap:** R2M5 demonstrates sensitivity to restoring the known `candidate:round-N` label, not to the wider class of nonresolving references. The row read-back is a valid J25 persistence oracle, but not a D35 resolvability oracle.

## Non-blocking / packet finding

### S07-r2-N1-PACKET — D27 ADDENDUM-2's standing comparator cannot reproduce an empty stale-stamp transcript

**Input → wrong outcome:** Apply the exact ruled command to any current r3 gate line, which has both `commit=<40 hex>` and `tree=<40 hex>` on line 1. `grep -m1 -oE '[0-9a-f]{40}'` emits both hashes on separate lines. The first output line carries the filename and commit, but the tree-only line has no `$2`; the ruled `awk` therefore prints the current tree hash as `STALE`. Against the eight r3 gate logs, the standing form printed eight false `STALE: bbe5d57...` lines. The broad `*.log` form also mixes superseded r2 evidence with current r3 gates. This follows directly from the command ruled at mission `DECISIONS.md:1463-1469`; it is not a stale lane fact.

The worker filing's empty mismatch block (`s07-synthesis.md:16-25`) and the packet's assertion that the orchestrator independently found no stale current gates are factually consistent with the commit fields, but they cannot be transcripts of the exact standing command.

**Required outcome:** Correct the ruling/packet recipe to select only the named commit field (for example, extract `commit=[0-9a-f]{40}` and remove the prefix) and scope the input to the current offered gate set. Reissue or annotate the stale comparison. This is an orchestrator evidence defect, not S07 implementation rework and not a reason by itself to reject the code.

## Disposition of r1 findings and J26

- **r1 B1 / J24 / J26(b): substantively fixed.** Missing family and unconfigured refs stop pre-claim; configured-but-absent role refs are checked against the probed `configuredMakers` set, record a role-naming `ledger.could_not_do`, terminally fail the work item before throwing, and cannot substitute the healthy secondary (`apps/runner/src/index.ts:1766-1797`, `1888-2006`). The genuine post-claim transport-death path remains distinct. The all-absent arm also records terminal failure before throwing (`apps/runner/src/index.ts:1939-1954`). The integration arms assert READY/no-call/no-answer for unconfigured refs and persisted FAILED state/reason for at-claim refusal.
- **r1 B2 / J25: persistence and transactionality fixed; resolvability remains open as B2 above.** `referenceCandidate` is gone, the runner preserves each call's raw-artifact ref, and ordered round inserts occur after the answer insert inside the same `withWriteTransaction` callback (`packages/serve/src/index.ts:1630`, `1710-1789`). The transaction wrapper rolls back on any error (`packages/db/src/index.ts:748-763`), so a failed answer write creates no rounds and a failed round insert rolls back the answer.
- **r1 B3 / J25: fixed.** `PROTECTED-CORE-GUARD-RETIRED` is a canonical condition mark with a paired record; the F4 integration arm reloads the projection, inspects the record, and separately reads `serve.answer.condition_marks` (`tests/integration/database.test.ts:4110-4157`). The mark is inserted without disturbing the DR-176 tail/count pins and has one forced-label case in each UI switch.
- **J26(c): fixed.** The refusal uses its own `RunSynthesisRoleRefusalValue` member and records only state, call-site key, role ref/name, and optional observed failure code. It no longer borrows zero-valued hold/attempt/leg measurements, and the exact-object integration assertion would reject invented fields.

## Evidence and D35 audit

The supplied final gates report cluster `63/63` three times; zone `13 failed / 1334 passed` with the same 13-name set as base; integration `1 failed / 80 passed` with the same lifecycle failure as base; clean root typecheck; and the two already-authorized UI TS2882 failures. The pro01 runner-tree failure is present with the baseline signature, so the new database write did not create a new named failure in that supplied run.

The r2 and r3 aggregate mutant logs contain the applied diff or exact token, `pre=0 → applied=1 → restored=0`, red/green discriminator result, restore command, matching before/after hashes, and clean porcelain for all eleven advertised mutants. R2M3, however, is a source-text assertion over the resolver (`tests/architecture/t09-synthesis-entrypoint.test.ts:72-87`); under D35 it is a structural defense, not an independent behavioral measurement. I did not rely on it for approval of the refusal behavior. The database refusal/terminal/guard rows are independent measurements. The candidate-ref database assertion is not, as B2 explains.

The seat's caught `-t "at claim"` false green is repaired by the separately logged exact all-absent RED/GREEN arm, and the final full integration log executes the suite. I found no other offered filtered run whose named discriminator was skipped. The reported dirty-tree abort has no dedicated supplied abort transcript, so its historical occurrence is CANNOT-ASSESS; the successful campaigns' own pre/apply/restore/clean gates are present.

## Ticket routing

Route `S07-r2-B1` and `S07-r2-B2` to the T9 worker as blocking rework on filing r3 = rework 1/3. Route `S07-r2-N1-PACKET` to the orchestrator/mission ruling ledger; it should not consume S07 implementation scope. No board or decision edit was made because this seat was authorized to write only the two packet-named report files.

## CANNOT ASSESS

Fresh runtime behavior, migration execution, actual rollback behavior, and mutant execution were not independently run because the packet explicitly restricted this seat to static review. The supplied logs are internally consistent apart from the unreproducible D27 comparison recipe described above.

## PREDICTIONS

The next patch will likely add encrypted/attested round payload storage with an ownership-aware reader and replace `candidate_ref text` with a ledger-backed UUID invariant plus a same-run join assertion. The most likely partial fix is encrypting only the candidate statement while leaving equivalent content in request/verdict JSON; the next is adding a foreign key without preventing cross-run references. The orchestrator will likely repair D27 by parsing `commit=` specifically and limiting the glob to current gate logs.
