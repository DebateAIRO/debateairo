# FIX-09 C3.5/C4 — bounded admission liveness and executable chain seams

**Successor authority packet — 2026-09-06, fix round 8.** This document incorporates `SPEC-v4.md` through `SPEC-v11.md` without changing their bytes. It supersedes only: the failed v11 admission-attempt identities and its paper-scan liveness schedule; the C3.5 test projection; the private-key descriptor-read mechanism; transaction ownership at the two append gateways; signer preparation without a runtime-start ABI change; direct/spool occurrence materialization; and the two SQL probes' exact JSONB comparison and size law. Every other Ed25519, SHA-256 link, row order, occurrence-detail, activation/keyring/recovery, witness, forward-only migration, grant, privacy, receipt, evidence, stage-order, C4, and V-only contract remains binding.

This round authorizes these three authority-document changes only. The real v12 Task 0 program, branch, worktree, manifests, receipts, and reviews remain absent until a fresh independent post-round-8 authority review returns `SPEC PASS`, `CODE QUALITY PASS`, and zero unresolved P0-P3. Task 0 and C3.5 remain STOP. No product, test, migration, package, installer, live control-root, key, database, service, quiesce, activation, acceptance, merge, push, board, V-run, or Done act is authorized here.

## 1. Preserved failed evidence and diagnosis

Both failed admission attempts are immutable diagnostic evidence. They must not be retried under their old identities, amended, deleted, overwritten, moved, or certified.

The preserved v10 identities remain those pinned by v11: program SHA-256 `1b3890e4dd2d0e9f1b304282faf510abd5dbce32253475a54f5339de2af6b4b7`, base manifest SHA-256 `58e71e509299b7a430a7432479644acd6fc1a435ede00bb76082ec4adb46b727`, report SHA-256 `e07d3df52c6d6352c96f3058be59c12ed009a95d64e96137b60cc2b27dd02d47`, evidence root `/private/tmp/fix09-v10-base.HcNB1bjq`, empty diagnostic root `/private/tmp/fix09-v10-base.BasmMPNz`, branch `codex/fix09-c35-admission`, and clean tip `c20e38f1695ecbf72ab2624c9f72dfe4e634d07b`.

The preserved v11 identities are:

```text
program     .../PLAN-FixAgent/fix09-task0-v11.mjs
            SHA-256 aa188eee39897cacde21ba9885a01adf64f64db0c3258d281cf3e8cfea059ff1
manifest    .../PLAN-FixAgent/fix09-task0-v11-base-manifest.json
            SHA-256 80e15aa6521fa6de167124a38b91e078b3696327b30114d2efbe0119139cbb8a
evidence    /private/tmp/fix09-v11-base.5jDJlL7H
empty root  /private/tmp/fix09-v11-validation.3VkSa6YC
report      .../.superpowers/sdd/PLAN-v9/task-0-v11-candidate-report.md
            SHA-256 da9dbfd3750895d73fd972c0e52e66b63dfb186998cafe91056013f539d78476
branch      codex/fix09-c35-admission-v11
worktree    .../.worktrees/fix09-c35-admission-v11
clean tip   61313a1d89cd354743f8bc94329f716fe4f2bdf5
```

That sealed manifest has 38 correct status/parser outcomes out of 39. `t0-039` alone returned rc 2 with `FIX09_PAPER_WORKTREE`; the candidate was never created. The scan saw concurrent shared-repository worktree state change while retaining zero independent `0064` claims. This is neither a collision nor permission to accept unequal evidence.

V11 also multiplied the full live paper scan: `derive` called `rerunReadOnly`, which called the 80k-document scan; `validateCandidate` called `derive` for all 20 candidate cases; result validation repeated that structure. The mutation cases therefore re-proved unrelated live freshness instead of testing their sealed evidence mutation. V12 removes that architectural amplification without reducing any accepted positive-path freshness.

The v12 fixed-attempt preflight requires all nine v12 identities absent, seven exact v10 preservation predicates true, and seven exact v11 preservation predicates true. The exact v12 identities are `fix09-task0-v12.mjs`, its three v12 manifests, the v12 candidate/result/review files, branch `codex/fix09-c35-admission-v12`, and worktree `.../.worktrees/fix09-c35-admission-v12`.

## 2. Bounded stable paper admission

### 2.1 One complete scan remains fail-closed

A complete scan retains v11's complete scope: every ref-tip tracked Markdown blob and every registered worktree's tracked plus nonignored-untracked Markdown. The scanner excludes every exact `.hermes` path component before any pathname open or read. It retains canonical physical worktree roots, sorted unique Git NUL enumerations, descriptor `O_NOFOLLOW` reads, pre/post fd and pathname identity/metadata comparison, two complete worktree passes, exact allow tuples, immutable FIX-10 dependency tuples, the historical nonclaim line, and zero independent claims. No file, ref, worktree, path, byte, metadata, or claim mismatch is accepted.

Only an observed stable-snapshot concurrency transition is internally retryable as `FIX09_PAPER_UNSTABLE`: changed fd/path identity or metadata after a successful precheck/read, changed before/after tracked or untracked NUL enumeration, changed complete pass projection, or changed complete-scan canonical output between the two successful scans of a pair. A claim, path escape, symlink transition, hard link, wrong type, bad owner/mode, permission failure, unreadable source, malformed registry/ref/tree/UTF-8/JSON, unsupported flag, child failure, or other security/parser error is immediately fatal under its exact existing cause. In particular `independent_claim_hits != 0` is immediately `FIX09_PAPER_CLAIM` and is never retried.

### 2.2 Three complete scan-pairs, never an unbounded wait

One bounded paper attempt consists of two fresh complete scans. The attempt is accepted only when both complete outputs pass the closed schema and claim checks and their canonical bytes are identical. The accepted value is the second complete output. An unstable first scan, unstable second scan, or unequal pair discards every byte and trace from that pair; the next pair begins from a fresh enumeration with no carried candidate.

The fixed ceiling is three pairs, hence at most six complete scans per requested freshness check. A first unequal pair followed by a byte-identical second pair therefore uses four complete scans and accepts only the second pair. Three unstable/unequal pairs terminate exactly `FIX09_PAPER_RETRY_EXHAUSTED`. There is no sleep, backoff, quiesce request, weakened comparison, partial reuse, fourth pair, or acceptance of a mismatch. The measured isolated shadow uses one pair per context; the ceiling is three times that stable cost and bounds a transient shared-repository retry without permitting an indefinite wait.

The trace schema is closed and binds pair starts, full scans, unstable pairs, resets, equality checks, and accepted pairs. Acceptance requires one accepted pair, at least one equality check, exact reset count equal to unstable-pair count, one to three pair starts, and two to six full scans.

### 2.3 Freshness schedule and sealed mutation evidence

The 39-entry base ledger still performs one live bounded paper check at `t0-039`; its accepted canonical stdout and SHA-256 remain inside the sealed manifest and the domain-separated t0-032..039 collision digest. Candidate derivation performs one new live bounded check and binds that accepted value into the derived 32-field candidate. Positive candidate validation performs one new live bounded check and compares the recomputed candidate.

The existing `migration_collision_evidence_sha256` field remains the binding field but its v12 positive-path calculation is superseded. Let `B` be the 64 lowercase-hex v11 domain-separated digest of raw t0-032..039 outputs, and let `P` be the canonical UTF-8 bytes of the accepted fresh paper object without LF. The field is SHA-256 of `UTF8("fix09-collision-fresh/v1") || 0x00 || UTF8(B) || uint64be(byte_length(P)) || P`. Thus it binds both sealed base collision evidence and the accepted derive scan without adding a receipt field or circle. Hostile validators reuse this already sealed field only after the positive validation fact/streams are manifest-bound; positive candidate/result validation and each reviewer independently recompute it from a fresh pair.

Each of the nineteen hostile candidate cases replays the sealed base fact/stream hashes and receipt bindings, reruns only cheap immutable/live Git and topology anchors, recomputes the mutated field or internal cause locally, and performs zero full paper scans. No mutation name may assert its own success or substitute its expected cause. The normal comparison that protects the mutated trust class must produce the pinned internal cause.

Positive result validation performs one new live bounded paper check. Its two review mutation cases replay the sealed base and candidate-validation manifests, recompute the altered review field locally, retain the cheap anchors, and perform zero full paper scans. A fresh independent candidate reviewer and a fresh independent result reviewer each run their own bounded scan-pair and compare its canonical output/digest; neither reuses the implementer's live result.

With stable state the disposable 39→32→20 shadow therefore records exactly three contexts in order — `base`, `derive`, `candidate-positive` — one pair/two complete scans each, six complete scans total, and none for hostile cases. The later real result stage adds `result-positive`; each independent reviewer adds only its own reviewer context. Any extra context or count is fatal.

### 2.4 Deterministic retry and separation controls

Literal fixtures prove:

- transient `A/B`, then fresh `C/C`, performs four full scans and accepts only `C`;
- stable `A/A` performs two scans;
- persistent `A/B` for all three pairs performs six scans and exact exhaustion;
- a non-concurrency worktree error and an independent claim each fail after one invocation;
- between-pass add/remove, same-inode mutation, pathname replacement, and symlink swap remain rejected;
- a mismatch is never an accepted value.

The exact success lines are:

```text
FIX09_PAPER_RETRY_FIXTURES_PASS transient_scans=4 stable_scans=2 exhausted_scans=6 fatal_scans=1 mismatch_accepted=0 swaps_killed=4
FIX09_VALIDATION_SCAN_FIXTURES_PASS derive_pairs=1 positive_pairs=1 hostile_pairs=0 result_positive_pairs=1 result_hostile_pairs=0
```

These omission mutants must die at their independent policy checks:

```text
OMIT_RETRY_RESET                 -> FIX09_MUTANT_RETRY_RESET
OMIT_DOUBLE_SUCCESS_EQUALITY     -> FIX09_MUTANT_DOUBLE_SUCCESS_EQUALITY
OMIT_HOSTILE_SCAN_SEPARATION     -> FIX09_MUTANT_HOSTILE_SCAN_SEPARATION
```

## 3. Correct C3.5 reporter projection

PLAN-v11's “first 11” projection accidentally admitted three C4 tests before the independently reviewed C3.5 and FIX-10 C0 gates. The source basis is PLAN-v6 lines 667–681 and 796 (the printed 15-file list and first-11 rule), PLAN-v11 lines 594–624 (the executable C3.5/C4 gate steps), and SPEC-v5 lines 11–19 (the binding C3.5 review → FIX-10 C0 → C4 order). The exact C3.5 authority-file order is now:

```text
tests/unit/fix09-capture-gate.test.ts
tests/unit/fix09-chain-canonical.test.ts
tests/unit/fix09-chain-keys.test.ts
tests/integration/fix09-chain-migration.test.ts
tests/integration/fix09-chain-occurrence.test.ts
tests/integration/fix09-chain-action.test.ts
tests/integration/fix09-chain-lifecycle.test.ts
tests/architecture/fix09-chain-grants.test.ts
tests/architecture/fix09-chain-writers.test.ts
tests/architecture/fix09-chain-privacy.test.ts
tests/architecture/fix09-fix10-chain-contract.test.ts
```

Append, in v6 order, the five immutable adjacent files `tests/unit/fix09-bundle.test.ts`, `tests/unit/fix09-fold.test.ts`, `tests/unit/fix09-tier-gate.test.ts`, `tests/architecture/fix09-no-model.test.ts`, and `tests/integration/fix09-daemon.test.ts`. The gate remains 16 files and 118 exact ordered reporter names. The compact canonical reporter-name array is exactly 12,676 bytes with SHA-256 `8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce`.

These three files are C4-only and forbidden before the C4 stage:

```text
tests/unit/fix09-watchdog-journal.test.ts
tests/integration/fix09-watchdog-verify.test.ts
tests/integration/fix09-watchdog.test.ts
```

The later C4 projection remains all fifteen v6 authority files plus the same five adjacent files: 20 files, 122 names, 13,207 canonical bytes, SHA-256 `10ab68b621774d0b5826225a1615def7db687d718eecd12a7fea6f607bb62a00`. The adjacent 107-name projection remains 11,281 bytes/SHA-256 `5b061d338cbf49f10a1b2569b7e3fce3f1724c642bfd0922ebb7b878daaba09c`.

The v12 projection fixture accepts the one exact C3.5 projection and rejects the old first-11 list, each C4-only file, a missing/extra/reordered file, a missing/extra/reordered reporter name, and count/byte/hash drift. Binding stage order remains admission → C3.5 → independent C3.5 review → separately authorized/reviewed FIX-10 C0 → C4 → independent C4 review → V-only live acts.

## 4. Literal descriptor-relative private-key read

Pure Node 22 on Darwin supplies no `fs.openat` or `fs.promises.openat`, so an absolute final-leaf `O_NOFOLLOW` open cannot satisfy SPEC-v5's component-by-component descriptor law. V12 preserves that law with one tiny, non-setuid, read-only native helper at source path `packages/obs-capture/native/fix09-openat-read.c`, a private wrapper at `packages/obs-capture/src/chain/private-key-helper.ts`, and signer preparation at `packages/obs-capture/src/chain/signer.ts`.

The installed helper path is exactly `${OBS_CONTROL_DIR}/chain/fix09-openat-read`, owner/group `V_OS_UID:OBS_CHAIN_PUBLIC_GID`, mode `0550`, regular, nonsymlink, link count one, and never setuid/setgid or group/world writable. It accepts only the canonical trusted control-root argument plus one closed signer-profile token; there is no leaf, general relative path, write, network, shell, dynamic-library-path, or arbitrary-file mode. The profile selects the one fixed `chain/private/<writer_identity>.pk8` leaf.

The helper opens the trusted root `O_DIRECTORY|O_NOFOLLOW`, validates the inherited root/ancestor owner and write-bit law, and walks every closed relative component with `openat`/`fstatat` and `O_NOFOLLOW`. It rejects an empty, dot, dot-dot, slash-bearing, NUL-bearing, extra, or wrong component; any symlink; a non-directory intermediate; a nonregular leaf; wrong owner/group/mode; link count other than one; device/inode/path identity drift; replacement; truncation; oversize; short read; or close/read/stat error. It reads only the fixed private-key leaf, sends one fixed big-endian length frame plus the bytes to its same-real/effective-UID parent, wipes all private buffers, and closes every descriptor on every exit.

The TypeScript wrapper spawns only the activation-pinned absolute helper with `shell:false`, empty environment, closed argv, and only ignored stdin plus captured stdout/stderr. It rejects spawn error, signal, nonzero exit, any stderr, malformed/duplicate/trailing frame, zero/oversize payload, helper replacement, or any source/binary/owner/group/mode/device/inode pin mismatch. It creates the Ed25519 `KeyObject` from the framed buffer, wipes the buffer in `finally`, and never logs, returns, serializes, or stores key bytes outside unexported module state.

The v12 activation body adds one closed `private_key_helper` object containing exact relative path, source SHA-256, installed binary SHA-256, decimal owner UID/group GID/device/inode, and octal mode. Its signed digest and the exact installed helper metadata are included in startup parity for all six deployed principals. A source rebuild or installed replacement requires a new V-signed activation; runtime code cannot repin it.

Unit/integration tests compile an ephemeral nonsuid helper under a per-test private root and kill component/path injection, dot/dot-dot/slash/NUL, wrong profile, symlink, hardlink, owner/mode, same-inode and path swaps, helper replacement/hash, framing, size, stderr/exit/signal, environment/argument injection, and private-byte/log escape mutants. No production helper is compiled, installed, or invoked by this authority round.

## 5. Closed chain API, signer state, and transaction authority

SPEC-v4's phrase “exactly two public gateways” is replaced by one closed `@debateai/obs-capture/chain` public surface. Runtime values are exactly `appendChainedOccurrences`, `appendChainedAgentAction`, `withChainedTransaction`, and `prepareChainedWriterSigner`; only their necessary closed input/output/attestation/transaction/profile TypeScript types are additionally exported. The package `exports` and declarations expose no canonicalizer, key loader, helper wrapper, signer, lock state, SQL builder, raw client adapter, or private key.

`prepareChainedWriterSigner(profile)` accepts exactly these five literals and mappings; the angle-bracketed three product identities and all UID/GID values remain required V-later inventory inputs with no default:

```text
api_occurrence       -> chain/private/<API_WRITER_IDENTITY>.pk8
                        (occurrence,first_party,<API_WRITER_IDENTITY>,1,null)
runner_occurrence    -> chain/private/<RUNNER_WRITER_IDENTITY>.pk8
                        (occurrence,first_party,<RUNNER_WRITER_IDENTITY>,1,null)
scheduler_occurrence -> chain/private/<SCHEDULER_WRITER_IDENTITY>.pk8
                        (occurrence,first_party,<SCHEDULER_WRITER_IDENTITY>,1,null)
daemon_action        -> chain/private/fixagent-daemon.pk8
                        (agent_action,first_party|hatchet|ui_client,fixagent-daemon,1,null)
obsctl_action        -> chain/private/obsctl.pk8
                        (agent_action,ops,obsctl,1,null)
```

The three occurrence preparations compare resolved `OBS_WRITER_IDENTITY` with their inventory slot before any key read. `watchdog_witness` is the separate activation-pinned sixth readiness principal and is rejected by this API. FIX-10 may call `obsctl_action` only at its separately authorized C0 stage.

Signer preparation verifies activation/keyring/helper pins, loads the selected key once, retains only its `KeyObject` in unexported module state, and returns a deeply frozen null-prototype public attestation containing only profile, writer/key id, helper binary hash and descriptor metadata, and activation/keyring digests. The same exact profile/config is idempotent and returns the same attestation; any second different profile/config, changed activation/keyring/helper, or post-activation missing signer is a typed failure before SQL. Pre-activation legacy writes retain inherited behavior. `CaptureRuntimeStartOptions` stays exactly `{runtime,spoolFd,installExitSink}` and `startCaptureRuntime` retains its exact callable type and behavior; neither receives a signer field. Authorized process entrypoints prepare before activated writes, and the sink/gateways retrieve signer state only through private module code.

`withChainedTransaction(rawClient, callback)` is the only transaction constructor accepted by either gateway. It creates a fresh frozen query-only wrapper and records an unexported capability plus `TxState` in a `WeakMap`. The helper alone issues `BEGIN`, `COMMIT`, and `ROLLBACK`; invalidation occurs in `finally`, including rollback/commit errors. A raw client, structural counterfeit, wrapper from another module instance, retained-after-callback wrapper, nested transaction on the same raw client, reused wrapper, or gateway call outside the live callback is rejected before gateway SQL.

`TxState` enforces the inherited total lock rank and gateway-kind law: session leader → C2 delivery lock when present → sorted occurrence-idempotency tokens → sorted action-idempotency tokens → sorted chain tokens; one transaction invokes only one gateway kind. The listener's `deliverOccurrence` replaces its raw BEGIN/COMMIT/ROLLBACK sequence with `withChainedTransaction`; fold, acknowledgement, `appendSkipReceipt`, and `appendPoisonReceipt` receive the same live wrapper. Downstream signer/probe/insert/ACK/cursor failure rolls back the whole callback. RED tests and mutants cover raw/forged/retained/nested/reused wrappers, invalidation, rank inversion, mixed gateway kinds, early commit/rollback attempts, and all failure points.

## 6. Exact direct/spool occurrence materialization

The gateway accepts one internal `ChainedOccurrenceInput`, never a caller-supplied detail. It is a flat null-prototype, recursively frozen own-data object with these keys in exact order:

```text
occurred_at, environment, build_ref, build_dirty, runtime,
component{process,package}, capture_point, code, taxonomy_class, severity,
condition_mark, disposition, fingerprint, fingerprint_version,
redaction_policy_version, allowlist_set_id, fallback_minimized, capture_status,
run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref,
parent_occurrence_ref, cause_relation, cause_chain_codes, at_seq_watermark,
frames, safe_template_id, template_parameters, source, source_event_ref,
zone_context, attempt_index, writer_identity, spool_receipt
```

Exact scalar and enum types derive from migrations 0034/0061 and `envelope-contract.ts`; `taxonomy_class` includes `JOB_LIFECYCLE`, template numeric values are safe integers, arrays and maps are closed plain own-data, and all previously forbidden free/user/private material remains inexpressible. `spool_receipt` is exactly null or a null-prototype frozen `{source,spool_ref}`. `SPOOLED` requires the nonnull receipt; every other capture status requires null; receipt source must equal the occurrence source; the current replay `spool_ref` equals `source_event_ref`. Generated `occurrence_id` and `reingested_at` are not inputs.

DIRECT input first proves the existing private `PostRedactionEnvelope` symbol brand, then copies each allowlisted field exactly once, adds `capture_status=PERSISTED` and `spool_receipt=null`, and carries no symbol. SPOOL input does not require the in-memory brand: it parses the line, calls `normalizeSerializedSafeEnvelope(value,runtime)` under its closed schema, then copies each normalized field once, adds `capture_status=SPOOLED` and the exact receipt. Both paths produce the identical descriptor shape before the gateway sees it.

The gateway takes one descriptor snapshot, rejects a proxy, accessor, symbol, extra, missing, reordered, sparse, cyclic, mutable, wrongly attributed, or wrong-prototype value, and copies no caller property twice. After that snapshot only, it derives detail as null iff `cause_chain_codes.length===0`; otherwise it builds exact null-prototype own-data `{normalized_frames:frames,cause_chain_codes,template_parameters}` in that order. Frames/parameters never create detail when causes are empty. A normalization, signer, probe, gateway, detail, receipt, or notification error propagates from spool replay, so the drain retains the source file and cannot materialize completion.

## 7. Implementable SQL probe equality and exact cap

The migration may add exactly one private helper:

```sql
obs.audit_chain_tag_jsonb_v1(value jsonb) RETURNS jsonb
```

It is `IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER`, has fixed `SET search_path=pg_catalog`, uses only fully qualified static objects, is owned by `debateai_obs_chain_probe_owner`, and has EXECUTE revoked from PUBLIC and every runtime, human, and watchdog role. Only the two SECURITY DEFINER occurrence/action probes may call it. No other private SQL canonicalizer/helper is authorized.

Each probe validates exact tuple tag, array length, JSON type, cardinality, scalar type, detail-presence agreement, and bounded recursion; builds the same tagged JSONB tuple from stored schema fields; and compares the two JSONB arrays structurally with `=`. PostgreSQL never claims to produce RFC 8785 bytes. The TypeScript gateway remains the sole exact RFC 8785 and canonical-row-size authority.

The probe's 1,048,576-byte input limit is nevertheless the exact RFC length for its tagged arrays. After tagging has reduced values to arrays, strings, booleans, and null, compute:

```text
octet_length(convert_to(tuple_jsonb::text,'UTF8'))
- sum(max(jsonb_array_length(array_node)-1,0)) over every array node
```

The bounded recursive walk removes exactly PostgreSQL's one separator space per array comma, including nested and empty arrays. Boundary tests prove exactly 1,048,576 accepted and +1 rejected, plus quotes, slashes, every control escape, multibyte Unicode and keys, U+2028/U+2029, nested arrays, and empty arrays. Plain PostgreSQL text length is not accepted because it would reject lawful boundary tuples.

## 8. STOP and review boundary

STOP on a changed frozen predecessor, missing failed-attempt predicate, future-identity collision, unstable pair exhaustion, accepted mismatch, retry of a non-concurrency error, independent claim, extra full scan, hostile self-assertion, C4 file in C3.5, projection/hash drift, missing native helper law, absolute-only private read, helper/key escape, runtime-start ABI drift, open transaction surface, raw/forged transaction, signer mismatch, origin confusion, caller detail, descriptor/schema drift, nonstructural SQL comparison, inexact cap, surviving mutant, private material, or any live/V-only act.

After the requested three-path authority commit, a fresh independent Sol reviewer must inspect the full v12 authority, rerun its fixtures and exact disposable shadow, and return both verdict lines with zero P0-P3 before real v12 Task 0 is authorized. A separately reviewed PASS result from real Task 0 is still required before C3.5. C4 remains downstream of independently reviewed C3.5 and separately authorized/reviewed FIX-10 C0.
