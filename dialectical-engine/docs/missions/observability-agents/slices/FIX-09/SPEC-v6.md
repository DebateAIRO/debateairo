# FIX-09 C3.5/C4 — admission and witness authorization closure

**Successor authority packet — 2026-09-05, fix round 2.** This document incorporates `SPEC-v4.md` and `SPEC-v5.md` and supersedes only the four clauses named below. The frozen v4/v5 files and their decision rows remain immutable. Every v5 correction not expressly changed here remains binding.

This packet authorizes successor documentation and, only after a fresh independent authority PASS and the separately reviewed Task 0 result receipt, the already bounded local C3.5/C4 implementation and tests. It authorizes no admission worktree during this documentation round, product/test/migration edit, live root, persistent key, database application, quiesce, activation, service operation, acceptance, merge, push, or production act.

## 1. Exact occurrence-detail identity

### 1.1 One presence predicate

After the v5 descriptor snapshot has normalized the materialized occurrence envelope, define:

```text
DETAIL_PRESENT := normalized.cause_chain_codes.length > 0
```

For a modern envelope, `cause_chain_codes` is a required normalized plain array. An absent modern member is invalid input, not false. For legacy reconstruction only, an absent value or exact empty array maps to false; a nonempty normalized array maps to true. `frames` and `template_parameters` never affect presence. Thus empty causes plus nonempty frames or template parameters still means no `obs.occurrence_detail` row.

The v5 occurrence semantic tuple is replaced by exactly one of these two JSONB arrays:

```text
["obs-occurrence-idempotency/v2", OCCURRENCE_FIELDS, ["detail_present", false]]

["obs-occurrence-idempotency/v2", OCCURRENCE_FIELDS, ["detail_present", true]]
```

`OCCURRENCE_FIELDS` is exactly the v5 ordered occurrence field array, including the normalized `capture_status_class`, `source`, `source_event_ref`, and `writer_identity`. Its generated/storage exclusions remain exactly v5's exclusions. No detail field appears inside `OCCURRENCE_FIELDS`.

When `DETAIL_PRESENT=false`, the expected detail argument is the JSON value `null`, and no stored detail row may exist. When true, the expected detail argument is exactly:

```text
["obs-occurrence-detail-idempotency/v1",
 normalized.frames,
 normalized.cause_chain_codes,
 normalized.template_parameters]
```

Those are precisely the three values inserted into `obs.occurrence_detail(normalized_frames,cause_chain_codes,template_parameters)`. Generated detail fields `occurrence_detail_id`, `occurrence_id`, and `created_at` remain excluded. Missing, unexpected, or unequal detail is a semantic conflict.

### 1.2 Exact four-argument probe

The migration-owned signature remains:

```sql
obs.audit_chain_probe_occurrence(
  p_source text,
  p_source_event_ref text,
  p_expected_occurrence jsonb,
  p_expected_detail jsonb
)
RETURNS TABLE (
  probe_status text,
  occurrence_id uuid,
  occ_seq bigint,
  stored_capture_status text
)
```

Arguments are SQL NOT-NULL at the routine boundary. `p_source` maps byte-for-byte to `obs.occurrence.source`; `p_source_event_ref` maps byte-for-byte to `obs.occurrence.source_event_ref`; `p_expected_occurrence` must be exactly one well-typed v2 tuple above; `p_expected_detail` must be JSON null iff its tuple says false and the exact v1 detail tuple iff it says true. The two JSONB arguments each have canonical RFC 8785 UTF-8 size at most 1,048,576 bytes. Unknown tags, extra/missing array members, SQL NULL, wrong JSON types, or presence/detail disagreement raises SQLSTATE `22023` with marker `FIX09_PROBE_INPUT`.

The function selects by exact `(source,source_event_ref)`. Its result cardinality is:

- zero rows when no occurrence exists; the gateway interprets zero as `NO_ROW`;
- exactly one `MATCH` row when one occurrence exists, its recomputed occurrence tuple equals `p_expected_occurrence`, and stored detail cardinality/content obeys the expected-detail law;
- exactly one `CONFLICT` row when one occurrence exists but either tuple, detail presence, or detail content differs. Every returned id/sequence/status is NULL for `CONFLICT` and populated only for `MATCH`.

More than one occurrence, more than one detail, or any impossible join cardinality raises SQLSTATE `P0001` with marker `FIX09_PROBE_CARDINALITY`; the owning gateway transaction rolls back. The routine never chooses a row with `LIMIT`, never returns a detail value, and never returns a raw occurrence field. V5's dedicated owner, fixed `search_path=pg_catalog`, static fully qualified SQL, size cap, revokes, EXECUTE grant, lock order, transaction ownership, and all action-probe semantics remain unchanged.

Tests cover modern empty/nonempty causes; legacy absent/empty/nonempty causes; empty causes with nonempty frames/template parameters; exact replay; direct/spool crossover; missing, unexpected, duplicate-fixture, and unequal detail; occurrence mismatch; invalid argument shapes; zero/MATCH/CONFLICT cardinality; and rollback on the cardinality marker.

## 2. Witness authorization independent of the row keyring

### 2.1 Activation-pinned bootstrap witness key

The watchdog never derives authorization from its private file or from the row-writer keyring. The exact v4 activation manifest adds these mandatory unsigned-body fields immediately after `public_keyring_sha256` in its illustrative shape; RFC 8785 still determines signed bytes:

```json
"witness_bootstrap_key_id":"<64 lowercase hex>",
"witness_bootstrap_spki_der_base64":"<canonical padded Ed25519 SPKI DER base64>",
"witness_bootstrap_min_seq":"1"
```

`witness_bootstrap_key_id` is SHA-256 of the decoded SPKI DER under the v4 key-id law. The custodian-root SPKI verifies the activation signature and thereby pins the initial watchdog witness public key independently. These fields are included in `manifest_sha256`, the immutable database activation digest, and genesis. The v4/v5 row public-keyring field `witness_keys` is now required to be `[]` in every generation and conveys no witness authority. Row entries/recovery remain in that separately V-signed row keyring.

### 2.2 V-signed witness-key transition certificate

Planned rotation and witness loss/compromise do not change the six approved paths. The first journal record signed by a successor witness key carries this completed certificate in its `witness_authorization` field:

```json
{
  "schema":"obs-witness-key-authorization/v1",
  "reason":"<PLANNED_ROTATION|WITNESS_KEY_LOSS|WITNESS_KEY_COMPROMISE>",
  "prior_witness_key_id":"<64 lowercase hex>",
  "new_witness_key_id":"<64 lowercase hex>",
  "new_witness_spki_der_base64":"<canonical padded Ed25519 SPKI DER base64>",
  "min_witness_seq":"<positive decimal>",
  "prior_witness_seq":"<nonnegative decimal>",
  "prior_witness_hash":"<64 lowercase hex>",
  "recovery_id":"<canonical lowercase UUID or null>",
  "recovery_checkpoint_sha256":"<64 lowercase hex or null>",
  "custodian_key_id":"<64 lowercase hex>",
  "custodian_signature_base64":"<canonical padded 64-byte signature>"
}
```

The unsigned certificate omits only `custodian_signature_base64`. V signs:

```text
Ed25519.Sign(V_custodian_private_key,
  UTF8("obs-witness-key-authorization-signature/v1") || 0x00 ||
  RFC8785(unsigned_certificate))
```

The new key id must equal SHA-256(SPKI DER). `prior_witness_seq` and hash equal the preceding completed journal record; when zero, the hash is the activation manifest digest and the prior key id is the bootstrap key id. `min_witness_seq=prior_witness_seq+1`, and the record carrying the certificate has that sequence and is signed by the new key. `PLANNED_ROTATION` has both recovery fields null. Loss/compromise has both non-null and equal to the separately V-signed v5 recovery checkpoint id and complete-checkpoint SHA-256. A certificate appears exactly once, on the first record for its key. Continuation records use JSON null. Certificates form nonoverlapping contiguous intervals; old public keys/certificates remain in the append-only journal.

The v5 unsigned witness object adds one mandatory field:

```json
"witness_authorization":null
```

Its value is null for bootstrap/continuation or the exact completed certificate for a transition. It is inside `W`, so the current witness signature and link cover it. The sequence-1 public vector from v5 is superseded only by this added null. The resulting RFC 8785 `W` is exactly 1,093 bytes and has SHA-256 `78b595a8998c4ac3acbbaa59b7f635835ef55b593f9377639d1c56d4349f342e`. Every other v5 field, activation first anchor, signature/link domain, LF, gap law, and runtime-ephemeral signature oracle remains exact.

The exact successor vector is:

```json
{"activation_manifest_sha256":"1111111111111111111111111111111111111111111111111111111111111111","cycle_id":"00000000-0000-4000-8000-000000000001","heads":[],"keyring_generation":"1","keyring_sha256":"2222222222222222222222222222222222222222222222222222222222222222","legacy":{"agent_action":{"count":"0","digest":"4444444444444444444444444444444444444444444444444444444444444444","max_seq":"0","status":"LEGACY_WITNESSED_UNVERIFIED"},"occurrence":{"count":"0","digest":"3333333333333333333333333333333333333333333333333333333333333333","max_seq":"0","status":"LEGACY_WITNESSED_UNVERIFIED"}},"observed_at":"2026-09-05T00:00:00.000Z","prior_witness_hash":"1111111111111111111111111111111111111111111111111111111111111111","reason":"NONE","recovery":{"epoch":"1","latest_recovery_id":null,"suspect_range_count":"0"},"result":"VERIFIED","schema":"obs-chain-witness/v1","snapshot":{"agent_action_high_water":"0","occurrence_high_water":"0","snapshot_text":"10:10:"},"witness_authorization":null,"witness_key_id":"5555555555555555555555555555555555555555555555555555555555555555","witness_seq":"1"}
```

On cold start the watchdog validates, in this order: custodian-root descriptor/SPKI; external activation format/digest/V signature; exact database activation equality; the full journal from activation anchor, including every transition certificate; and its private file's derived key id against the key authorized for the next sequence. Only then may it examine the row keyring or append.

### 2.3 Invalid row keyring remains attestable

After activation/journal witness authorization succeeds:

- row-keyring format, signature, or continuity failure produces the inherited exact `KEYRING_INVALID/KEYRING_FORMAT|KEYRING_SIGNATURE|KEYRING_CONTINUITY` pair;
- the record sets `keyring_generation=null` and `keyring_sha256=null`, signs with the independently authorized current witness key, appends/fsyncs normally, and only then emits non-PASS health;
- a missing/unreadable row keyring produces signed `VERIFY_UNAVAILABLE/PUBLIC_MATERIAL_UNAVAILABLE` with both keyring fields null;
- no candidate row-keyring field, SPKI, or signature participates in witness-signer authorization.

### 2.4 Activation replacement and no-authority cold start

The external activation is immutable. A running watchdog retains only in memory the exact completed activation bytes, digest, verified bootstrap SPKI, and custodian-root key id last validated against the database. This is `LAST_KNOWN_GOOD_ACTIVATION`. It is never serialized, logged, or used after process exit.

Each cycle reopens the activation path under v5 descriptor law. Byte-identical valid input continues normally. Any missing, changed, malformed, wrongly signed, wrong-owner, or database-mismatched replacement is not adopted, even if independently V-signed. While the current process still has a last-known-good value and the next witness private key/journal authorization remains valid, it signs and appends `VERIFY_UNAVAILABLE/PUBLIC_MATERIAL_UNAVAILABLE` using the cached activation digest as both the record activation field and sequence-1 anchor where applicable. It does not use any candidate activation byte.

On cold start, invalid/unverifiable custodian root or activation, database mismatch, invalid prior journal, or a private key not authorized for the next sequence means there is no witness authority. The watchdog opens no row keyring, appends no journal byte, writes no database health row, writes zero stdout bytes, writes exactly one canonical JSON stderr line, and exits code 78:

```json
{"code":"ACTIVATION_INVALID_NO_WITNESS","exit_code":"78","journal_appended":false,"status":"FAIL_CLOSED"}
```

Invalid prior journal uses code `WITNESS_JOURNAL_INVALID_NO_APPEND`. A valid activation/journal but wrong/missing private witness key uses code `WITNESS_KEY_UNAUTHORIZED_NO_APPEND`. Both use the same remaining fields/no-write/exit law. No code path derives a public authorization from local private bytes. Tests cover cold-start keyring format/signature/continuity invalid and missing cases; invalid activation/root/database parity; post-start activation swap/removal; wrong witness key; forged transition certificate; wrong transition sequence/prior hash/SPKI id/recovery binding; planned rotation; loss/compromise recovery; restart reconstruction; and key separation.

## 3. Closed Task 0 receipts

### 3.1 Wire law

There are two files at the normal controller-worktree report root:

```text
../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt
../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-result.receipt
```

Each is UTF-8 without BOM/CR, starts at byte zero, and consists only of ordered `field=value` lines terminated by one LF. Field names are lowercase ASCII snake case. Scalar strings are unquoted and contain no LF, CR, `=`, leading/trailing whitespace, or escape. Structured values are exact RFC 8785 JSON on one line with sorted keys and no whitespace. A 40-hex Git object, 64-hex digest, and nonnegative base-10 count use lowercase and the patterns `[0-9a-f]{40}`, `[0-9a-f]{64}`, and `0|[1-9][0-9]*`. Duplicate/extra/missing/reordered fields, blank lines, noncanonical JSON, unknown nested keys, an unrecognized path root, or trailing bytes are invalid.

### 3.2 Candidate receipt fields

The executor writes exactly these 32 fields in this order:

```text
schema
authority_commit
authority_parent
authority_tree
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
composition_result_commits
branch_name
worktree_canonical_path
git_common_dir_canonical_path
c35_baseline
c35_tree
clean_porcelain_sha256
source_blob_map
source_blob_extensions
writer_map
writer_map_sha256
c1_pin_map
schema_grant_probe_sha256
migration_collision_counts
migration_collision_scope
migration_collision_evidence_sha256
capture_evidence_manifest_sha256
```

Fixed scalar values are:

```text
schema=fix09-c35-admission-candidate/v1
authority_parent=2ab5f78f00cde444dc33a99e444dd14aeec9881d
integration_base=2b670d3059c60d7262cf655bd5d402c88100dff3
fix01_shared_base=bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8
fix01_tip=24d0b3e5de84876b6b46fa84b13a0a42aa2640a4
fix02_head=e7b9f6812cafc8808cf5e188cd6440f19beda831
fix09_head=8619b9ab4dbc01fdd166337a641193675b24380a
merge_fix02_resolution_blob=0e2ffc4fc4f148520f228a9f69014f2ad7d5416c
branch_name=codex/fix09-c35-admission
worktree_canonical_path=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission
git_common_dir_canonical_path=/Users/vladmihaimiron/Documents/DebateAIRO/.git
clean_porcelain_sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

`authority_commit` is the full commit containing v6, with the fixed parent above, exact subject `docs(obs): close FIX-09 admission and witness gaps`, and exact three-path scope. `authority_tree`, both baseline fields, three composition result commits, the authority-side FIX-09 decision blob, and evidence hashes are observed full objects/digests and cross-checked, never guessed.

The structured fields are exactly:

```json
composition_order=[{"expected_conflicts":["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],"input":"e7b9f6812cafc8808cf5e188cd6440f19beda831","kind":"merge_no_ff_no_commit","resolution_field":"merge_fix02_resolution_blob"},{"expected_conflicts":[],"input":"24d0b3e5de84876b6b46fa84b13a0a42aa2640a4","kind":"cherry_pick","resolution_field":null},{"expected_conflicts":["docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"input":"8619b9ab4dbc01fdd166337a641193675b24380a","kind":"merge_no_ff_no_commit","resolution_field":"merge_fix09_resolution_blob"}]
merge_fix02_conflict_paths=["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"]
cherry_pick_fix01_conflict_paths=[]
merge_fix09_conflict_paths=["docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"]
composition_result_commits=[{"commit":"<40 lowercase hex>","input":"e7b9f6812cafc8808cf5e188cd6440f19beda831","kind":"merge_no_ff"},{"commit":"<40 lowercase hex>","input":"24d0b3e5de84876b6b46fa84b13a0a42aa2640a4","kind":"cherry_pick"},{"commit":"<40 lowercase hex>","input":"8619b9ab4dbc01fdd166337a641193675b24380a","kind":"merge_no_ff"}]
```

The parser dereferences each non-null `resolution_field` to the separately ordered scalar and verifies the selected index blob after resolution. It performs no template substitution or text evaluation. The `<40 lowercase hex>` notation above denotes the validated type in the schema, not literal receipt text.

`source_blob_map` is one JSON object with exactly the fifteen v5 §2 path keys and exact values printed there; no other key is allowed. `source_blob_extensions=[]`; any later path requires a reviewed successor schema version. `writer_map` is exactly the five-string v5 array, and `writer_map_sha256` is the SHA-256 of its canonical bytes. `c1_pin_map` is exactly:

```json
{"canonical_policy_bundle_sha256":"aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd","tests/unit/fixtures/fix09-interface-contract.ts":"09650971be03d4ada2c1dd017a1d956d70d3275ddcf1e8045016cc45b92fb550","tools/obs-listener/src/daemon/dispatch-arm.ts":"916fa6cbac52b23dd66d0e7507c468684855ba598c9ecee4d75e00002e053f1c","tools/obs-listener/src/daemon/tracer-hook.ts":"c551c24ea5931acbdc4801d274aedc7bcd4d2b476b1f272ec9507e3e38f4c961"}
```

`migration_collision_counts` has exactly these string-count keys:

```json
{"all_refs":"<positive base10>","branch_remote_refs":"<positive base10>","independent_claim_hits":"0","reachable_history_0064_hits":"0","reachable_object_0064_hits":"0","ref_tip_0064_hits":"0","registered_worktrees":"<positive base10>","worktree_tracked_0064_hits":"0","worktree_untracked_0064_hits":"0"}
```

`migration_collision_scope` is exactly:

```json
{"claim":"migrations/0064_fix09_audit_chain.sql","excluded":[".git","node_modules","private-key-material"],"paper":["all-ref-tips","all-registered-worktrees"],"path_regex":"(^|/)(migrations|packages/db/src/migrations)/0064[^/]*\\.sql$","tracked":["all-reachable-objects","all-reachable-history","all-ref-tip-trees","all-registered-worktrees"],"untracked":["all-registered-worktrees-nonignored"]}
```

The collision evidence decodes to exactly those counts/scope. The capture manifest decodes to the closed §4 schema and reproduces every receipt value. The schema/grant probe digest binds the complete captured writer/schema/ACL/source output, not selected lines.

### 3.3 Separate reviewer result; no hash circle

The executor candidate contains no review field. An independent reviewer first writes and closes `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md`, computes its SHA-256, then alone writes the result receipt. The report never contains or hashes the result receipt. The result has exactly these fields/order:

```text
schema=fix09-c35-admission-result/v1
candidate_receipt_path=../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt
candidate_receipt_sha256=<64 lowercase hex>
admission_review_report_path=../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md
admission_review_report_sha256=<64 lowercase hex>
receipt_validation_manifest_sha256=<64 lowercase hex>
reviewer=Sol
reviewed_authority_commit=<candidate authority_commit>
reviewed_c35_baseline=<candidate c35_baseline>
reviewed_c35_tree=<candidate c35_tree>
spec_verdict=SPEC PASS
code_quality_verdict=CODE QUALITY PASS
p0_count=0
p1_count=0
p2_count=0
p3_count=0
result=PASS
```

The result is valid only if all cross-bound values equal the candidate/Git/report bytes, `receipt_validation_manifest_sha256` equals the aggregate manifest for the positive candidate readback plus all eight receipt mutants, and the report contains each of these exact standalone LF lines once: `SPEC VERDICT: SPEC PASS`, `CODE QUALITY VERDICT: CODE QUALITY PASS`, and `UNRESOLVED: P0=0 P1=0 P2=0 P3=0`. No executor may write or alter it. C3.5 consumes both immutable files and revalidates all evidence; either missing/changed/non-PASS file is STOP.

## 4. Closed Task 0 evidence manifest

PLAN-v6 supplies the literal capture runner and two exact invocation ledgers. It closes the 39-command base evidence manifest before writing the candidate, so `capture_evidence_manifest_sha256` cannot be self-referential. It then captures the positive candidate readback and eight hostile receipt controls in a separate nine-command receipt-validation manifest before review. The independently written result binds that second manifest as `receipt_validation_manifest_sha256`; neither manifest contains the result readback. Each final RFC 8785 manifest is one object with exactly:

```json
{"schema":"fix09-task0-evidence-manifest/v1","evidence_root":"<canonical absolute mode-0500 temp directory>","command_count":"<positive base10>","commands":["<command objects in ordinal order>"]}
```

Each command object has exactly:

```json
{
  "schema":"fix09-task0-command/v1",
  "id":"<ledger id>",
  "ordinal":"<positive base10>",
  "cwd":"<canonical absolute path>",
  "argv":["<literal resolved argv element>"],
  "argv_sha256":"<64 lowercase hex>",
  "tool":{"path":"<canonical executable path>","version":"<captured one-line version>"},
  "environment":["LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"],
  "started_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "ended_at":"YYYY-MM-DDTHH:mm:ss.sssZ",
  "exit_code":"<nonnegative base10 or null>",
  "signal":"<signal name or null>",
  "stdout":{"path":"<ordinal-id.stdout>","bytes":"<nonnegative base10>","sha256":"<64 lowercase hex>","mode":"0400"},
  "stderr":{"path":"<ordinal-id.stderr>","bytes":"<nonnegative base10>","sha256":"<64 lowercase hex>","mode":"0400"},
  "assertion":{"kind":"<closed kind>","expected":"<exact string>","observed":"<exact string>","passed":true}
}
```

Closed assertion kinds are `stdout_exact_base64`, `stdout_empty`, `stdout_nonempty`, `stdout_sha40`, `stdout_sha64`, `stdout_lines_exact_json`, `streams_exact_base64_json`, and `status_only`. The streams assertion's expected/observed value is exact canonical JSON `{"stderr":"<base64>","stdout":"<base64>"}`. Status equality is always asserted before the content assertion. Artifacts are exclusive-created, fsynced, chmod `0400`, and hashed before assertion. The command manifest is atomic-written/fsynced/renamed/directory-fsynced only afterward. The finalizer rejects an id/ordinal/argv mismatch, failed assertion, extra/missing artifact, nonclosed schema, mode/hash/byte difference, duplicate id, noncontiguous ordinal, or command not in PLAN-v6's applicable ledger, then atomic-writes the aggregate and chmods that evidence directory `0500`. Base command ids are exactly `t0-001` through `t0-039`; receipt-validation command ids are exactly `t0-040` then `h0-001` through `h0-008`. A final candidate+result readback is captured later by the checked-in Task 1 gate and is not an input to either receipt.

## 5. Preserved authority and STOP

All v4/v5 laws remain, including exact legacy microseconds, comparator generated exclusions, distinct locks, SECURITY DEFINER custody, six-path permissions, row protocol, recovery labels, forward-only `0064`, descriptor-only gateway inputs, unique raw JSON boundaries, runtime-ephemeral private material, C1-C3 freezes, writer conversions, FIX-10 dependency, capture-first proof, and V-only acts.

STOP on a detail predicate/tuple/cardinality difference; witness authorization derived from the row keyring or private file; invalid activation cold-start append; transition-certificate mismatch; receipt/parser/manifest field drift; implementer-selected argv/name/count; v4/v5 byte edit; collision; source/frozen drift; or any previously forbidden act. Task 0 and C3.5 remain unauthorized until fresh independent v6 review passes.
