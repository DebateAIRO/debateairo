# FIX-09 C3.5/C4 — Ed25519 authority review correction

**Successor authority packet — 2026-09-05, fix round 1.** This document incorporates `SPEC-v4.md` and supersedes only the clauses identified below. `SPEC-v4.md`, `PLAN-v4.md`, and their 2026-09-05 decision row remain immutable evidence. This packet closes the independent review's nine P1 and two P2 findings; it adds no product capability beyond the V-selected per-writer Ed25519 chain, public verifier, recovery needed for that chain, and its admission/test machinery.

This packet authorizes successor documentation and, only after §2 admission passes independent review, local C3.5/C4 implementation and tests. It does not authorize creation of the admission worktree or baseline during this documentation round, a live root, persistent signing material, migration application, live database access, quiesce, activation, launchd operation, acceptance, merge, push, or production act.

## 1. One binding stage order

The only lawful order is:

1. **C3.5 admission:** compose the exact reviewed controller/FIX-01/FIX-02/FIX-09 inputs under §2, produce the final admission receipt, and obtain an independent admission PASS with no unresolved P0-P3;
2. **C3.5 foundation:** implement `0064`, the shared chain library, every current occurrence/action writer conversion, configuration seams, and foundation tests against the receipt's exact `C35_BASELINE`;
3. obtain an independent C3.5 SPEC/CODE QUALITY PASS with no unresolved P0-P3;
4. under separate V-selected FIX-10 successor authority, implement and independently review FIX-10 C0 keyring/activation/bootstrap/rotation commands plus its obsctl outbox/shared-gateway consumer; local commands/tests may land, but no live activation or database reconciliation runs;
5. implement C4's public verifier, watchdog-only witness journal, health, dormant plists, README, and real-history local tests;
6. obtain an independent C4 SPEC/CODE QUALITY PASS with no unresolved P0-P3;
7. only V may later provision identities/files/keys, apply the migration, quiesce, activate, install services, run acceptance, merge, push, or declare Done.

Every contrary v4 list or plan sentence is replaced by this order. C4 is STOP until reviewed FIX-10 C0 exists. FIX-10 C0 database code is STOP until the C3.5 shared action gateway exists.

## 2. Admission-only composite baseline

No C3.5 source or migration edit may begin from a guessed tree. PLAN-v5 Task 0 must create and independently review one admission receipt at this normal controller-worktree path, relative to the `dialectical-engine` repository directory:

```text
../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-receipt.md
```

The immutable source inputs are:

```text
controller parent     bcae759eec5a2e6987ef49e2f3ad82919807a85a
controller authority  FIX09_AUTHORITY_COMMIT (the reviewed commit containing only SPEC-v5,
                      PLAN-v5, and one appended FIX-09 decision row; its parent must be bcae759e)
integration base      2b670d3059c60d7262cf655bd5d402c88100dff3
FIX-01 shared base    bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8
FIX-02 head           e7b9f6812cafc8808cf5e188cd6440f19beda831
FIX-01 tip            24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
FIX-09 head           8619b9ab4dbc01fdd166337a641193675b24380a
```

`FIX09_AUTHORITY_COMMIT` is self-resolved by the completed fix-round report and fresh v5 review; it is not an implementer-selected ref. Admission proves the full object id, subject `docs(obs): harden FIX-09 Ed25519 authority`, exact parent above, exact three-path scope, and reviewed PASS before use.

Composition starts on a new clean branch `codex/fix09-c35-admission` at `FIX09_AUTHORITY_COMMIT` and follows this exact order:

1. merge `e7b9f6812cafc8808cf5e188cd6440f19beda831` with `--no-ff --no-commit`; the only unmerged path is FIX-02 `DECISIONS.md`; resolve it to exact blob `0e2ffc4fc4f148520f228a9f69014f2ad7d5416c`, the FIX-02 head's strict append-only superset, then create one local merge commit;
2. cherry-pick only `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`; its parent is the already admitted `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8`; require zero unmerged paths and final runtime-readiness test blob `17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd`;
3. merge `8619b9ab4dbc01fdd166337a641193675b24380a` with `--no-ff --no-commit`; the only unmerged path is FIX-09 `DECISIONS.md`; resolve it to the controller-authority side byte-for-byte, preserving v2/v3/v4/v5 decisions, then create one local merge commit;
4. record that resulting commit as `C35_BASELINE`; do not rebase, amend, squash, or add C3.5 code to it.

The admission receipt contains these mandatory fields; omission, abbreviation, or a non-full object id is STOP:

```text
schema=fix09-c35-admission/v1
authority_commit
authority_parent
integration_base
fix01_shared_base
fix01_tip
fix02_head
fix09_head
composition_order
merge_fix02_conflict_paths
merge_fix02_resolution_blob
cherry_pick_fix01_conflict_paths
merge_fix09_conflict_paths
merge_fix09_resolution_blob
c35_baseline
c35_tree
branch_name
worktree_canonical_path
clean_porcelain_sha256
source_blob_map
writer_map_sha256
schema_grant_probe_sha256
c1_pin_map
migration_collision_counts
migration_collision_evidence_sha256
capture_evidence_manifest_sha256
admission_review_path
admission_review_sha256
admission_review_verdict
```

Receipt scalar lines are UTF-8 `field=value` with one LF, in the order above; structured values are RFC 8785 JSON on that same value line. `clean_porcelain_sha256` must be SHA-256 of the captured zero-byte `git status --porcelain=v1 --untracked-files=all` stdout, exactly `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. `writer_map_sha256` hashes RFC 8785 bytes of this exact ordered array:

```json
["occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences","occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence","agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt","agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt","future_agent_action|FIX-10|ops|obsctl"]
```

`schema_grant_probe_sha256`, `migration_collision_evidence_sha256`, and `capture_evidence_manifest_sha256` hash their complete immutable capture files, not reformatted terminal output. The receipt validator rejects duplicate/unknown/missing fields, CRLF, abbreviated SHAs, noncanonical JSON, and a trailing section.

The source blob map must contain at least these exact entries after composition:

```text
packages/obs-capture/src/runtime/config.ts                 5e8c1c0d62f18c1e174c58c98acb06ac60f9360a
packages/obs-capture/src/runtime/drain.ts                  430421090da76a2340f0089853e6efb1ea66813f
packages/obs-capture/src/runtime/index.ts                  73a77fee4d66c9dd66b36b7ee0590c4ee5846bbf
packages/obs-capture/src/runtime/sink.ts                   b8bf01beb38d10e80eceec92af298d0480ae6a37
packages/obs-capture/src/envelope-contract.ts              4a70449252231e2a4fe4eeb27eb9478309bf386b
tests/unit/fix01-runtime-readiness.test.ts                  17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd
tools/obs-listener/src/daemon/poison.ts                    79714373cf602d4358cabc7acb664a26452f2f04
tools/obs-listener/src/daemon/fold.ts                      14b75cf518cf906fee4963e4b920b6de819d8edc
tools/obs-listener/src/daemon/main.ts                      8445d4bff83dc731c94b8bd4d4a1e1e793e1435a
tools/obs-listener/src/daemon/tracer-hook.ts               c0e8484cb9e63840a1e87b1fe65c1f769b472759
tools/obs-listener/src/daemon/dispatch-arm.ts              9e6e22abc18434d2a0636c1f6e997c0d4db0ea0d
migrations/0034_obs_foundation.sql                         ace8fa889f24a3d23b79cbaa78878a2238d07b76
migrations/0061_obs_job_lifecycle_taxonomy.sql             380d4aa1922e4774741b97222ad764c0028ec3a0
migrations/0062_fix09_listener_fold.sql                    ac5e3b4d6a87260bc9b6d0764295fe4cbcb1b72b
packages/db/src/obs-schema.ts                              bcd2fac36c2460eb8b3d681a7c3ee914a8ce065e
```

The `0061` line above is compared to Git object `380d4aa1922e4774741b97222ad764c0028ec3a0`; any object-resolution failure is STOP and must be reported rather than corrected by inference. The admission plan also compares the already frozen C1 raw and canonical hashes from v4.

The receipt is written only after: clean branch/worktree checks; merge-base and merge-tree evidence; exact conflict/resolution proofs; full writer enumeration; schema/grant source probes; fresh all-ref/all-object/all-worktree/untracked `0064` collision evidence; hostile stale/wrong-input controls; and an independent admission report with explicit PASS/PASS and no P0-P3. The final receipt is then immutable. C3.5 must refuse a missing, changed, stale, non-PASS, or tree-mismatched receipt.

## 3. Exact legacy timestamp projection

New signed rows remain millisecond-aligned as v4 requires. Legacy rows preserve every PostgreSQL microsecond. For legacy `timestamptz` only, the third field value is:

```text
["pg_epoch_us", SIGNED_BASE10_MICROSECONDS]
```

The string matches `0|-?[1-9][0-9]*`, forbids `-0`, and is the exact count of microseconds from `1970-01-01 00:00:00+00` to the stored instant. Infinity and negative infinity are STOP. Migration `0064` owns one immutable SQL function:

```sql
obs.audit_chain_epoch_microseconds(value timestamptz) RETURNS text
```

Its normative calculation is:

```sql
((pg_catalog.extract(epoch FROM value) * 1000000)::numeric(30,0))::text
```

The function first rejects non-finite values, is `LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER SET search_path=pg_catalog`, fully qualifies every referenced object, and returns only the signed decimal string. PostgreSQL timestamps have microsecond resolution, so the multiplication has no fractional remainder. Before accepting the text, the function asserts exact numeric equality `pg_catalog.extract(epoch FROM value) = result::numeric / 1000000::numeric`. Bootstrap and watchdog both call this same function and place its text unchanged in the tagged value. They never pass legacy timestamps through JavaScript `Date`, ISO milliseconds, locale formatting, or floating point.

Every other legacy scalar/JSONB rule and the v4 legacy snapshot array remain. Tests store two instants in the same millisecond but distinct microseconds, prove different legacy row bytes/digests, and kill a millisecond-truncation mutant.

## 4. Idempotency comparison and least-privilege routines

### 4.1 Exact semantic tuples

The occurrence lookup key is `(source,source_event_ref)`. Its expected semantic tuple is the exact ordered array:

```text
["obs-occurrence-idempotency/v1", [
  occurred_at, environment, build_ref, build_dirty, runtime, component,
  capture_point, code, taxonomy_class, severity, condition_mark, disposition,
  fingerprint, fingerprint_version, redaction_policy_version, allowlist_set_id,
  fallback_minimized, capture_status_class, run_ref, work_item_ref, node_ref,
  attempt_ref, ledger_ref, parent_occurrence_ref, cause_relation, at_seq_watermark,
  frames, safe_template_id, template_parameters, source, source_event_ref,
  zone_context, attempt_index, writer_identity
], ["detail", DETAIL_OR_NULL]]
```

Each item uses v4's literal SQL scalar or tagged JSONB value. `capture_status_class` is literal `ORIGINAL` for stored/requested `PERSISTED|SPOOLED`, so direct/spool crossover for the same envelope is one semantic match and the first committed storage status wins. `GAP_RECONSTRUCTED` maps only to literal `GAP_RECONSTRUCTED` and never equals `ORIGINAL`.

`DETAIL_OR_NULL` is JSON null when no detail row is expected; otherwise it is this ordered tuple:

```text
["obs-occurrence-detail-idempotency/v1",
 normalized_frames, cause_chain_codes, template_parameters]
```

The occurrence comparator excludes only generated/storage outputs: `occurrence_id`, `occ_seq`, `captured_at`, `prev_link`, all five new chain fields, `occurrence_detail_id`, detail `occurrence_id`, and detail `created_at`. No other durable field is excluded.

The action lookup key is `action_ref`. Its expected semantic tuple is:

```text
["obs-agent-action-idempotency/v1",
 source, writer_identity, actor, action_kind, occurrence_id, incident_id,
 action_payload]
```

It excludes only the lookup key and generated outputs: `action_ref`, `agent_action_id`, `action_seq`, `occurred_at`, `prev_link`, and all five new chain fields. A retry therefore accepts the first generated action time but cannot change actor, kind, target, source, writer, or payload.

### 4.2 Exact routines

Migration `0064` creates NOLOGIN/NOINHERIT/NOBYPASSRLS role `debateai_obs_chain_probe_owner`, grants it only USAGE on `obs` plus SELECT on `obs.occurrence`, `obs.occurrence_detail`, and `obs.agent_action`, and makes it owner of these four routines:

```text
obs.audit_chain_probe_occurrence(text,text,jsonb,jsonb)
  -> (probe_status text, occurrence_id uuid, occ_seq bigint, stored_capture_status text)
obs.audit_chain_occurrence_head(text,text)
  -> (chain_seq bigint, chain_link bytea, chain_key_id text)
obs.audit_chain_probe_action(text,jsonb)
  -> (probe_status text, agent_action_id uuid, action_seq bigint)
obs.audit_chain_action_head(text,text)
  -> (chain_seq bigint, chain_link bytea, chain_key_id text)
```

Each routine is `SECURITY DEFINER`, `STABLE`, has fixed `SET search_path=pg_catalog`, fully qualified static SQL, no dynamic SQL, no variadic/default arguments, and rejects a JSON argument whose canonical UTF-8 exceeds 1,048,576 bytes. Probe status is closed: `NO_ROW`, `MATCH`, `CONFLICT`. IDs/sequences/status are returned only for `MATCH`; other statuses return NULL bounded fields. Head routines return zero or one row and only the three shown public-chain fields. Every expected tuple must have exact length/types/tags; there is no object-key lookup or coercion.

`0064` revokes ALL function privileges from PUBLIC and every runtime/human/watchdog role before granting:

- EXECUTE on occurrence probe/head only to `debateai_obs_writer`;
- EXECUTE on action probe/head only to `debateai_obs_listener`;
- EXECUTE on the epoch-microsecond function only to `debateai_obs_watchdog` and the migration owner used by future V bootstrap;
- no EXECUTE to any other role. A future obsctl database role receives action probe/head EXECUTE only in its separately authorized FIX-10 migration.

The direct occurrence SELECT grant to `debateai_obs_writer` is revoked; the routines replace it. The listener/watchdog keep only their already binding read surfaces. Function definitions, owner flags, owner role attributes, grants, row-security state, fixed search path, return columns, and forbidden raw-row returns are catalog-tested as real roles.

### 4.3 Lock domains and total order

For `LP` from v4, tokens are exact:

```text
occurrence idempotency = "obs-audit-idempotency-occurrence/v1:" ||
                         lowercase_hex(LP(UTF8(source)) || LP(UTF8(source_event_ref)))
action idempotency     = "obs-audit-idempotency-action/v1:" ||
                         lowercase_hex(LP(UTF8(action_ref)))
chain partition        = "obs-audit-chain-lock/v1:" ||
                         lowercase_hex(LP(UTF8(table)) || LP(UTF8(source)) ||
                                       LP(UTF8(writer_identity)))
```

Every token is passed as text to `pg_advisory_xact_lock(hashtextextended(token,0))`. The total lock hierarchy is: existing FIX-09 session leader; existing C2 occurrence-delivery transaction lock when present; all occurrence-idempotency tokens in unsigned-UTF-8 order; all action-idempotency tokens in unsigned-UTF-8 order; all chain-partition tokens in unsigned-UTF-8 order. A transaction never invokes both append gateways. Acquiring a lower-ranked lock after a higher-ranked one is a typed failure.

Occurrence flow is: idempotency locks → probe each tuple → return exact matches/reject conflicts → chain locks for remaining rows → head routines → allocate/sign/insert. Action flow is: existing delivery lock → action-ref lock → action probe → return match/reject conflict → chain lock → action head → allocate/sign/insert. The routines acquire no advisory lock. Concurrent same/different replays and direct/spool crossover prove one chain advance and no deadlock.

## 5. Deployable approved-path permission law

The six V-approved relative paths remain byte-for-byte unchanged. This section refines permissions so distinct writer UIDs can use the one visible layout; it is not a provisioning act.

Symbolic principals are V-later inputs: `V_OS_UID/V_OS_GID`, `OBS_CHAIN_PUBLIC_GID`, each exact `WRITER_UID/WRITER_GID`, and `WATCHDOG_UID/WATCHDOG_GID`. They have no repository default. Exact production modes/owners are:

| Object | Owner:group | Mode |
|---|---|---:|
| `${OBS_CONTROL_DIR}` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0751` |
| `${OBS_CONTROL_DIR}/chain` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0750` |
| `${OBS_CONTROL_DIR}/chain/private` | `V_OS_UID:V_OS_GID` | `0711` |
| `${OBS_CONTROL_DIR}/chain/private/<writer_identity>.pk8` | matching `WRITER_UID:WRITER_GID` | `0600` |
| `${OBS_CONTROL_DIR}/chain/public-keyring.json` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0440` |
| `${OBS_CONTROL_DIR}/chain/custodian-root.spki` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0440` |
| `${OBS_CONTROL_DIR}/chain/activation.json` | `V_OS_UID:OBS_CHAIN_PUBLIC_GID` | `0440` |
| `${OBS_CONTROL_DIR}/keys` | `V_OS_UID:V_OS_GID` | `0711` |
| `${OBS_CONTROL_DIR}/keys/watchdog-witness.pk8` | `WATCHDOG_UID:WATCHDOG_GID` | `0600` |
| `${OBS_CONTROL_DIR}/witness` | `WATCHDOG_UID:WATCHDOG_GID` | `0700` |
| `${OBS_CONTROL_DIR}/witness/watchdog-chain.jsonl` | `WATCHDOG_UID:WATCHDOG_GID` | `0600` |

Every process opens the canonical absolute `OBS_CONTROL_DIR` once, then walks components with directory descriptors and `openat`; each component uses `O_NOFOLLOW`, is a directory/regular file of the required type, has link count one for files, matches exact owner/group/mode, and has no group/world write bit. Every ancestor from filesystem root through `OBS_CONTROL_DIR` is lstat-checked as non-symlink and not group/world writable. Each private file is on the same device as its immediate directory, has `nlink=1` (therefore no hardlink alias), and is re-fstat'd after open; path and descriptor inode/device must agree. Writer identity must pass v4's safe filename grammar before path construction.

The keyring, custodian root, and activation are opened read-only by descriptor with the same component/inode checks. Writers and watchdog must be members of `OBS_CHAIN_PUBLIC_GID` to read those `0440` files; no writer can list `chain/private` or read another writer's `0600` file. The watchdog can read all three public artifacts and only its witness private file/journal; it cannot read any row private key.

V-only publication creates an unguessable same-directory temp file with `O_CREAT|O_EXCL|O_NOFOLLOW`, writes exact bytes, sets owner/group/mode before exposure, fsyncs and re-fstats it, verifies same device, renames with no cross-device fallback, fsyncs the directory, then reopens/revalidates the final descriptor. Replacement refuses a symlink, directory, wrong owner/mode/link count, or changed inode. Private-key replacement follows the same file/fsync/rename/directory-fsync law while writers are quiesced. Runtime readers never create, chmod, chown, rename, repair, or delete these files.

## 6. Exact witness wire contract

Witness sequence starts at 1 and is gapless. `W` is RFC 8785 UTF-8, no BOM/whitespace/newline, of exactly this unsigned object:

```json
{
  "schema":"obs-chain-witness/v1",
  "witness_seq":"<positive decimal>",
  "cycle_id":"<canonical lowercase UUID>",
  "observed_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "activation_manifest_sha256":"<64 lowercase hex>",
  "keyring_generation":"<positive decimal or null>",
  "keyring_sha256":"<64 lowercase hex or null>",
  "snapshot":{
    "snapshot_text":"<exact PostgreSQL snapshot text or null>",
    "occurrence_high_water":"<nonnegative decimal or null>",
    "agent_action_high_water":"<nonnegative decimal or null>"
  },
  "legacy":{
    "occurrence":{"status":"LEGACY_WITNESSED_UNVERIFIED","count":"<nonnegative decimal>","max_seq":"<nonnegative decimal>","digest":"<64 lowercase hex>"},
    "agent_action":{"status":"LEGACY_WITNESSED_UNVERIFIED","count":"<nonnegative decimal>","max_seq":"<nonnegative decimal>","digest":"<64 lowercase hex>"}
  },
  "heads":[{"table":"<agent_action or occurrence>","source":"<exact text>","writer_identity":"<exact text>","chain_seq":"<positive decimal>","chain_link":"<64 lowercase hex>"}],
  "recovery":{"epoch":"<positive decimal>","latest_recovery_id":"<canonical UUID or null>","suspect_range_count":"<nonnegative decimal>"},
  "result":"<closed result>",
  "reason":"<closed reason>",
  "prior_witness_hash":"<64 lowercase hex>",
  "witness_key_id":"<64 lowercase hex>"
}
```

No field is optional. Unavailable snapshot fields are JSON null, legacy values are zero/empty-digest values pinned by activation, and heads is empty. Heads sort by unsigned-UTF-8 `(table,source,writer_identity)` and contain one current head per nonempty partition. The first record has `witness_seq="1"` and `prior_witness_hash=activation_manifest_sha256`; record `n>1` has sequence exactly prior+1 and prior hash exactly the preceding completed record's `witness_hash`.

The exact result vocabulary is inherited v4's `VERIFIED|CHAIN_BREAK|VERIFY_UNAVAILABLE|KEYRING_INVALID|WITNESS_INVALID` plus `VERIFIED_WITH_RECOVERY`. The exact reason vocabulary is inherited v4's reasons plus `RECOVERY_CHECKPOINT|RECOVERY_INVALID|RECOVERY_CONTINUITY`. V4's pairings remain; added pairings are only `VERIFIED_WITH_RECOVERY/RECOVERY_CHECKPOINT`, `KEYRING_INVALID/RECOVERY_INVALID`, and `CHAIN_BREAK/RECOVERY_CONTINUITY`. No other result/reason pairing is valid.

The signature and hash remain:

```text
S = Ed25519.Sign(SK_witness, UTF8("obs-witness-signature/v1") || 0x00 || W)
H = SHA256(UTF8("obs-witness-link/v1") || 0x00 || UINT32_BE(length(W)) || W || S)
```

The completed object is the unsigned object plus exactly `witness_signature_base64=canonical padded base64(S)` and `witness_hash=lowercase_hex(H)`. One journal record is `RFC8785(completed_object) || LF`. The signature/key id must be authorized for the exact witness sequence by the V-signed keyring. Append uses v5 §5 descriptor checks, one exclusive lock, one complete write loop, file fsync, unlock, and directory fsync only on V-authorized creation; PASS health follows fsync.

This fixed public sequence-1 vector is normative. Its `W` is the following one-line 1,064-byte UTF-8 string, whose SHA-256 is `825931227e7cc17b00e0a52f2e30194bc6e79cda136b93df809b2a973824077e`:

```json
{"activation_manifest_sha256":"1111111111111111111111111111111111111111111111111111111111111111","cycle_id":"00000000-0000-4000-8000-000000000001","heads":[],"keyring_generation":"1","keyring_sha256":"2222222222222222222222222222222222222222222222222222222222222222","legacy":{"agent_action":{"count":"0","digest":"4444444444444444444444444444444444444444444444444444444444444444","max_seq":"0","status":"LEGACY_WITNESSED_UNVERIFIED"},"occurrence":{"count":"0","digest":"3333333333333333333333333333333333333333333333333333333333333333","max_seq":"0","status":"LEGACY_WITNESSED_UNVERIFIED"}},"observed_at":"2026-09-05T00:00:00.000Z","prior_witness_hash":"1111111111111111111111111111111111111111111111111111111111111111","reason":"NONE","recovery":{"epoch":"1","latest_recovery_id":null,"suspect_range_count":"0"},"result":"VERIFIED","schema":"obs-chain-witness/v1","snapshot":{"agent_action_high_water":"0","occurrence_high_water":"0","snapshot_text":"10:10:"},"witness_key_id":"5555555555555555555555555555555555555555555555555555555555555555","witness_seq":"1"}
```

The committed public vector is only a fixed unsigned body and its SHA-256; it contains no signature/private seed. Every signature vector is created at test runtime from an in-memory ephemeral key and compared byte-for-byte between production and an independent `node:crypto` oracle. A fixed private seed or persisted private object/DER is forbidden.

## 7. V-signed recovery epochs

The exact v4 §9 keyring object is replaced only by adding `"epoch":"<positive decimal>"` immediately after `generation` in the illustrative source and `"recovery_checkpoints":[<completed checkpoints>]` immediately after `witness_keys`; RFC 8785, not illustrative property order, determines signed bytes. These two keys are mandatory, and no other top-level key is added. The v4 custodian keyring signature covers them and every nested completed checkpoint. Keyring generation 1 has `epoch="1"` and `recovery_checkpoints=[]`. Every later keyring remains cumulative. Planned row/witness rotation within a trusted history changes generation and sequence authorizations but not epoch and adds no checkpoint.

Missing/compromised material never silently resumes. V may recover by publishing a next-generation keyring containing one new separately V-signed checkpoint. Its unsigned exact object is:

```json
{
  "schema":"obs-chain-recovery/v1",
  "recovery_id":"<canonical lowercase UUID>",
  "trigger":"<ROW_KEY_COMPROMISE|WITNESS_KEY_LOSS|WITNESS_KEY_COMPROMISE>",
  "created_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "prior_epoch":"<positive decimal>",
  "new_epoch":"<prior plus one>",
  "prior_keyring_generation":"<positive decimal>",
  "new_keyring_generation":"<prior plus one>",
  "last_trusted_witness_seq":"<nonnegative decimal>",
  "last_trusted_witness_hash":"<64 lowercase hex; activation digest when sequence zero>",
  "last_trusted_heads":[{"table":"<agent_action or occurrence>","source":"<exact text>","writer_identity":"<exact text>","chain_seq":"<nonnegative decimal>","chain_link":"<64 lowercase hex>"}],
  "row_ranges":[{
    "table":"<agent_action or occurrence>","source":"<exact text>","writer_identity":"<exact text>",
    "compromised_key_id":"<64 lowercase hex>","last_trusted_chain_seq":"<nonnegative decimal>",
    "last_trusted_chain_link":"<64 lowercase hex>","suspect_first_chain_seq":"<positive decimal or null>",
    "suspect_last_chain_seq":"<positive decimal or null>","suspect_terminal_chain_link":"<64 lowercase hex>",
    "suspect_links_sha256":"<64 lowercase hex>","next_key_id":"<64 lowercase hex>",
    "next_min_chain_seq":"<positive decimal>"
  }],
  "witness_range":{
    "prior_key_id":"<64 lowercase hex>","suspect_first_witness_seq":"<positive decimal or null>",
    "suspect_last_witness_seq":"<positive decimal or null>","suspect_terminal_witness_hash":"<64 lowercase hex>",
    "suspect_hashes_sha256":"<64 lowercase hex>","next_key_id":"<64 lowercase hex>",
    "next_min_witness_seq":"<positive decimal>"
  },
  "custodian_key_id":"<64 lowercase hex>"
}
```

The completed checkpoint adds exactly `custodian_signature_base64`. V signs `UTF8("obs-chain-recovery-signature/v1") || 0x00 || RFC8785(unsigned_checkpoint)`. The enclosing keyring custodian signature covers the checkpoint again. Checkpoints sort by new epoch and are immutable/cumulative.

`last_trusted_heads` and `row_ranges` sort by unsigned-UTF-8 `(table,source,writer_identity)` and contain no duplicate partition; `row_ranges` contains only affected partitions. For each affected partition, the matching trusted head fields must be identical. `witness_range` is always present. Its nonempty `suspect_hashes_sha256` is SHA-256 of RFC 8785 bytes of ordered `[witness_seq_decimal,witness_hash_hex]` pairs from its first through terminal sequence.

For a row-key compromise, V quiesces the writer, validates the last trusted witness, captures the current immutable database terminal under locks, and signs each affected interval. `suspect_links_sha256` is SHA-256 of RFC 8785 bytes of ordered `[chain_seq_decimal,chain_link_hex]` pairs from trusted+1 through terminal. Empty suspect interval uses null first/last, terminal=last trusted link, and SHA-256 of `[]`. New authorization starts exactly terminal+1 and its first `prev_link` is the signed terminal link. Suspect rows remain `RECOVERED_SUSPECT_UNVERIFIED`; their structure/link bytes must match the checkpoint, but their compromised-key signatures never regain authenticity.

Loss of a row private key with an intact valid public history is planned row-key rotation: V quiesces that writer, closes the lost key at each validated terminal, opens a new key at terminal+1, and keeps the same epoch with no checkpoint. If V cannot rule out disclosure, it is `ROW_KEY_COMPROMISE` and must use a checkpoint. A row-only checkpoint has `witness_range` with null suspect endpoints, terminal/last-trusted hash equal to the last trusted witness hash, digest SHA-256 of `[]`, the current witness key as `next_key_id`, and `next_min_witness_seq=last_trusted_witness_seq+1`; `row_ranges` is nonempty.

For witness private-key loss with an intact valid journal, suspect witness fields are null, terminal hash is the last trusted hash, digest is SHA-256 of `[]`, and the new witness key starts at last trusted sequence+1 with that prior hash. Planned witness rotation uses the same continuity without an epoch/checkpoint. For witness-key compromise, V binds every suspect `[witness_seq,witness_hash]` through its terminal; those records become `RECOVERED_WITNESS_UNVERIFIED`, and the new key continues at terminal+1. A witness-only checkpoint has `row_ranges=[]`. Journal deletion, truncation, or loss is not covered and remains `WITNESS_INVALID` pending a new V authority.

Before a valid checkpoint, compromised or unauthorized material yields `CHAIN_BREAK` or `WITNESS_INVALID`. After checkpoint plus at least one valid new-key row/witness, the stable result is `VERIFIED_WITH_RECOVERY/RECOVERY_CHECKPOINT`; status queries must always show epoch, recovery id, triggers, and both suspect labels/ranges. Plain `VERIFIED/NONE` is permitted only when no recovery checkpoint exists. Malformed/badly signed/nonconsecutive checkpoints yield `KEYRING_INVALID/RECOVERY_INVALID`. A forged/deleted/changed suspect terminal after checkpoint yields `CHAIN_BREAK/RECOVERY_CONTINUITY`. Recovery never edits or authenticates suspect bytes.

The closed result set therefore adds `VERIFIED_WITH_RECOVERY`; the closed reasons add `RECOVERY_CHECKPOINT`, `RECOVERY_INVALID`, and `RECOVERY_CONTINUITY`, with only the pairings above. Tests cover forged tails, empty/nonempty suspect ranges, wrong digest/terminal/next sequence, skipped epoch/generation, invalid V signature, row-key loss/compromise, planned witness rotation, witness-key loss/compromise, convergence, and permanent journal-loss failure.

## 8. Forward-only migration and rollback

Migration `0064` is forward-only and additive. The repository has no down-migration interface, and this authority creates none. No executor may drop its columns/functions/role/table/indexes/triggers, edit the migration ledger, reset a sequence, clear activation, delete history, or backfill chain material.

Before activation, code rollback stops local writers/verifier, returns application code to the prior reviewed release, and disposes/recreates the local test database through the existing forward migration harness when a clean schema is required. A production schema rollback is not authorized. After activation, only code that understands and requires v1 may run; schema, activation, keyring, recovery checkpoints, rows, and journals stay intact. Any incompatible code rollback is STOP for V.

All v4 down-migration promises and tests are superseded and nonbinding; the frozen v4 bytes are not edited or deleted. Tests instead prove forward application, failed-migration transaction rollback, local database disposal/recreation, and refusal to alter ledger/history/schema.

## 9. Materialized object and raw-JSON boundaries

Occurrence/action gateways receive already-materialized values. They make no claim to detect duplicate raw JSON keys. Each gateway performs one total descriptor snapshot per object/array: catch `Object.getPrototypeOf` and `Object.getOwnPropertyDescriptors`; require prototype `Object.prototype`, `Array.prototype`, or null as permitted by the exact schema; reject symbols, extras, missing fields, accessors, sparse arrays, unsupported descriptor attributes/types, cycles, caps, and any thrown/revoked/mutating trap; copy descriptor values once into null-prototype normalized records/arrays; freeze them; and never reread source properties. A behaviorally transparent proxy has no distinguishable extra authority and is judged solely by that snapshot.

Duplicate-key rejection exists only where raw UTF-8 JSON bytes are actually available: keyring, activation, recovery, FIX-10 outbox, witness, and authority-proof inputs. Those boundaries use one explicit tokenizing `parseUniqueJsonUtf8` before materialization. It rejects BOM, invalid UTF-8, duplicate object keys at every depth, trailing bytes, lone surrogates, fraction/exponent or unsafe integers where the schema forbids them, and depth/node/byte cap excess. `JSON.parse` plus reviver is not sufficient. Tests feed literal duplicate-key bytes to each raw boundary and descriptor-only hostile values to gateways.

## 10. Ephemeral key and public-vector law

Every test calls the runtime Ed25519 keypair generator independently per test. Private key objects/PKCS#8 bytes exist only in memory or a mode-0700 per-test directory with a mode-0600 file when filesystem checks are the subject. The production function and independent oracle receive the same in-memory key object through test scope; neither prints, snapshots, serializes to a committed fixture, or writes a seed/private byte to evidence. Cleanup closes key/file descriptors, zeroes exported transient buffers, and removes the private test directory.

Committed vectors may contain only public input rows, canonical bytes, public SPKI, public key ids, unsigned hashes, and schemas derived without a persisted private input. Expected signatures/links are computed and compared at runtime. Deterministic seeds, fixture PKCS#8, private JWK, secret hex/base64, or a reusable private-key constructor input are forbidden and caught by repository/evidence scans.

## 11. Capture-first and non-vacuous proof law

Every PLAN-v4 bare gate command is superseded. PLAN-v5 defines one capture-first runner that creates non-reused temp evidence paths with exclusive creation, captures child stdout/stderr and real exit code before any assertion, records exact argv/tool versions/timestamps, and makes each artifact read-only. No pipeline determines child status.

Vitest gates first capture machine-readable collection, then require exact equality to the committed `fix09-gate-manifest/v1` file: exact selected file paths, exact full test names, exact positive count. Run JSON must report the same count, all passed, zero failed/skipped/todo, and an anchored completed summary. Typecheck/audit/Git gates have exact exit and anchored output/empty-output rules in the same manifest. A no-match glob, missing file, zero-test result, wrong count/name, forged summary, truncated stdout, or mismatched exit code makes the gate fail.

The final C3.5 and C4 focused ledgers are explicit in PLAN-v5. Each is run three clean times into distinct evidence ids; the report retains every run plus the worst duration/run id and hashes an evidence manifest. The capture verifier has its own hostile unit tests for no-match, zero tests, wrong summary/count/name, wrong rc, duplicate evidence id, and pre-existing output path.

## 12. Preserved law and STOP conditions

Except for the exact successor changes above, SPEC-v4 remains binding: additive chain schema, per-`(table,source,writer_identity)` Ed25519/SHA-256 protocol, canonical new-row order, V-signed public material, activation boundary, all four writer conversions, source identity, transaction atomicity, no symmetric verification secrets, FIX-10 ops/obsctl compatibility, read-only watchdog, privacy, C1 hashes/interfaces, C2 lock/fold/ACK/cursor, C3 tier/no-model, and V-only production acts.

STOP on a missing/non-PASS admission receipt; input/blob/tree/conflict drift; comparator/routine/ACL mismatch; millisecond legacy projection; direct broad writer SELECT; lock-rank inversion; writable/symlinked/wrong-owner trust path; persisted private seed; duplicate-key claim at a materialized gateway; invalid recovery checkpoint; witness wire difference; forward-schema teardown; vacuous/non-captured evidence; any v4 byte edit; migration collision; or any forbidden live act.
