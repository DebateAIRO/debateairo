# FIX-09 C3.5/C4 — independently replayable admission evidence

**Successor authority packet — 2026-09-05, fix round 3.** This document incorporates `SPEC-v4.md`, `SPEC-v5.md`, and `SPEC-v6.md` without changing their bytes. It supersedes only v6 §§3–4 and v6's 94/105/109 test-count claims. Every row-chain, occurrence-detail, witness-authorization, key, filesystem, recovery, rollback, grant, privacy, writer, FIX-10, ordering, and V-only clause outside those admission/capture surfaces remains binding.

This packet authorizes successor documentation and, only after a fresh independent v7 authority PASS and the independently reviewed Task 0 result receipt, the already bounded local C3.5/C4 implementation and tests. It authorizes no Task 0 execution in this documentation round, admission worktree/branch, product/test/migration edit, live root/key/database/service act, quiesce, activation, acceptance, merge, push, or Done claim.

## 1. Evidence is fact, never verdict

### 1.1 Exact command record

V7 replaces the v6 command object with this closed RFC 8785 object:

```json
{
  "schema":"fix09-task0-command/v2",
  "id":"<closed ledger id>",
  "ordinal":"<positive base-10>",
  "cwd":"<exact absolute ledger cwd>",
  "argv":["<exact literal argv element>"],
  "environment":["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"],
  "exit_code":"<nonnegative base-10 or null>",
  "signal":"<POSIX signal name or null>",
  "stdout":{"path":"<ordinal-id.stdout>","bytes":"<nonnegative base-10>","sha256":"<64 lowercase hex>","mode":"0400"},
  "stderr":{"path":"<ordinal-id.stderr>","bytes":"<nonnegative base-10>","sha256":"<64 lowercase hex>","mode":"0400"}
}
```

There is no `expected`, `observed`, `assertion`, or `passed` member. The capture process records only immutable execution facts. It exclusive-creates stdout/stderr, executes the argv vector with `shell=false` in the exact cwd/environment, fsyncs and chmods the streams `0400`, hashes their raw bytes, atomic-publishes the fact record, and directory-fsyncs. A child failure is still recorded and never rewritten as capture success.

The aggregate is exactly `{"schema":"fix09-task0-evidence-manifest/v2","evidence_root":"<canonical absolute mode-0500 path>","command_count":"<positive base-10>","commands":[...]}`. Its finalizer checks only closed fact schema, file identity/mode/hash/size, ordinal/id uniqueness, exact file set, and atomicity. It makes no semantic PASS decision.

### 1.2 External ledger and replay

PLAN-v7 prints the complete canonical 39-entry base array and the closed 20-entry candidate-validation and three-entry result-validation projections. Each executable entry has exactly `id`, `ordinal`, `cwd`, `argv`, `expected_exit_code`, `expected_signal`, `stdout_parser`, and `stderr_parser`. The base array is parsed from the committed authority; Appendix C's byte-pinned `candidateLedger(BASE_MANIFEST)` and `resultLedger(BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST)` are the sole executable expansion of the other two projections. Implementers never supply or edit an argv/parser member. Every argv/cwd/environment/rc/signal is compared to that authority. Each parser consumes raw captured bytes and recomputes its result; no command-record verdict is consulted.

The base ledger is exactly `t0-001` through `t0-039`. The receipt-validation ledger begins with positive `t0-040`, followed by every PLAN-v7 `h0-*` forgery in printed order. Scanner/validator program bytes must equal the separately printed SHA-256 pin before any scan or receipt validation. Unknown command ids, parsers, fields, files, or options are invalid.

## 2. Exact 32-field candidate replay

The v6 candidate wire and its 32 ordered fields remain. V7 replaces every derivation with this total mapping:

| Candidate field | Sole derivation and mandatory cross-check |
|---|---|
| `schema` | constant `fix09-c35-admission-candidate/v1` |
| `authority_commit` | exact SHA line from t0-001; live controller `HEAD` and `refs/heads/codex/fixagent-plan` equal it |
| `authority_parent` | exact t0-002 line; live `authority_commit^`; fixed `0e1fe1807aa2a4706b2438024a6b85f9c1a5f2ca` |
| `authority_tree` | first t0-005 SHA line; live `authority_commit^{tree}` |
| `integration_base` | identical exact t0-006 and t0-007 lines; live re-run; fixed `2b670d3059c60d7262cf655bd5d402c88100dff3` |
| `fix01_shared_base` | t0-008 and live re-run; fixed `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8` |
| `fix01_tip` | fixed full SHA; live commit object and its parent equals `fix01_shared_base` |
| `fix02_head` | fixed full SHA; live commit object; merge base with authority equals `integration_base` |
| `fix09_head` | fixed full SHA; live commit object; merge base with authority equals `integration_base` |
| `composition_order` | fixed three-object array; exact ledger order t0-011/016/019 and parent topology below |
| `merge_fix02_conflict_paths` | sorted LF paths parsed from t0-012; exactly the fixed one-path array |
| `merge_fix02_resolution_blob` | t0-014 SHA; selected index blob; fixed `0e2ffc4fc4f148520f228a9f69014f2ad7d5416c` |
| `cherry_pick_fix01_conflict_paths` | zero-byte t0-017; exact empty array |
| `merge_fix09_conflict_paths` | sorted LF paths parsed from t0-020; exactly the fixed one-path array |
| `merge_fix09_resolution_blob` | t0-022 SHA; selected index blob; equals t0-005's second SHA (authority decision blob) |
| `composition_result_commits` | live final graph and t0-015/016/023 success: `[final^1^,final^1,final]`, with exact input/kind objects |
| `branch_name` | fifth t0-026 line; live symbolic branch; t0-034 registry; fixed `codex/fix09-c35-admission` |
| `worktree_canonical_path` | second t0-027 line; realpath; live `git worktree list`; fixed approved path |
| `git_common_dir_canonical_path` | first t0-027 line resolved absolute; live controller/admission `--git-common-dir`; fixed repository common dir |
| `c35_baseline` | t0-025 SHA and first t0-026 line; live admission `HEAD`; final composition commit |
| `c35_tree` | fourth t0-026 line; live `c35_baseline^{tree}` |
| `clean_porcelain_sha256` | SHA-256 of raw t0-024 stdout, which must be zero bytes; fixed empty digest |
| `source_blob_map` | parse all fifteen exact `mode type blob<TAB>path` t0-028 lines; live `git ls-tree` at `c35_baseline`; exact v5 key set |
| `source_blob_extensions` | constant empty array; t0-028 must have exactly fifteen lines |
| `writer_map` | parse the canonical array emitted by literal t0-030 scanner; reviewer re-runs same pinned program at `c35_baseline` |
| `writer_map_sha256` | SHA-256 of RFC 8785 `writer_map` bytes |
| `c1_pin_map` | canonical bundle constant plus three exact SHA-256/path t0-029 lines; reviewer hashes the three live `c35_baseline` blobs |
| `schema_grant_probe_sha256` | SHA-256 of raw canonical t0-031 stdout; reviewer re-runs pinned grant scanner and requires byte equality |
| `migration_collision_counts` | recomputed exclusively from raw t0-032 through t0-039 bytes under §4 |
| `migration_collision_scope` | exact §4 constant; exact scope object in each t0-037/038/039 output |
| `migration_collision_evidence_sha256` | exact ordered §4 domain digest over all eight raw stdout streams t0-032..039 |
| `capture_evidence_manifest_sha256` | SHA-256 of raw base `manifest.json`; manifest and every artifact are independently revalidated |

T0-003 raw stdout must equal `docs(obs): bind FIX-09 admission evidence\n`. T0-004 raw stdout must be the exact three sorted paths `DECISIONS.md`, `PLAN-v7.md`, `SPEC-v7.md`, each repository-relative and LF-terminated. T0-005 emits exactly authority-tree then authority-decision-blob, two full SHA lines. These are mandatory authority subject/scope/blob proofs even though subject and decision blob are not candidate fields.

### 2.1 Exact composition proof

Let `A=authority_commit`, `F2=fix02_head`, `F1=fix01_tip`, `F9=fix09_head`, `M2=final^1^`, `C1=final^1`, and `M9=final`. Require:

- `M2` has exactly parents `[A,F2]`, and its tree differs from the source-backed merge result only at the single conflict path whose selected blob is t0-014;
- `C1` has exactly parent `[M2]`; `sha256(git diff --binary F1^ F1)` equals `sha256(git diff --binary C1^ C1)`; t0-018 equals the FIX-01 readiness blob in `C1`;
- `M9` has exactly parents `[C1,F9]`, and its tree differs from the source-backed merge result only at the single conflict path whose selected blob is t0-022;
- t0-011 and t0-019 exit 1 with the exact conflict arrays; t0-015, t0-016, and t0-023 exit 0; t0-017 is empty; and the final worktree is clean;
- reviewer live queries reproduce every parent, tree, blob, diff, and ancestry result without trusting receipt syntax or executor narration.

Any extra merge parent, reordered parent, unrelated tree change, changed input, different conflict, or different selected blob is STOP.

## 3. Exact 17-field reviewer-result replay

The v6 result wire and its 17 fields remain. Their total mapping is:

| Result field(s) | Sole derivation and mandatory cross-check |
|---|---|
| `schema` | constant `fix09-c35-admission-result/v1` |
| candidate path/hash | fixed relative path plus SHA-256 of raw validated candidate bytes |
| review path/hash | fixed relative path plus SHA-256 of raw closed review report bytes |
| `receipt_validation_manifest_sha256` | SHA-256 of raw independently replayed validation manifest |
| `reviewer` | exact `Sol`; the report has standalone `REVIEWER: Sol` once |
| reviewed authority/baseline/tree | exact equal candidate fields after live Git replay |
| spec/code-quality verdicts | exact standalone report lines `SPEC VERDICT: SPEC PASS` and `CODE QUALITY VERDICT: CODE QUALITY PASS` |
| P0/P1/P2/P3 counts | exact standalone report line `UNRESOLVED: P0=0 P1=0 P2=0 P3=0`; four result values are string `0` |
| `result` | exact `PASS` and standalone report line `ADMISSION RESULT: PASS` |

The reviewer independently replays the base ledger, candidate, validation ledger, every forgery, live Git graph, and report before writing the result. The executor cannot write or alter the result. The report never contains or hashes the result. Final candidate+result readback is downstream and cannot participate in either embedded digest.

## 4. Collision counts and full ordered digest

The v6 count keys and scope object remain exact. Values are derived as follows:

- `all_refs`: nonempty unique LF records in t0-032;
- `branch_remote_refs`: nonempty unique LF records in t0-033, all members of t0-032;
- `registered_worktrees`: `worktree ` stanzas in t0-034, with unique canonical paths;
- `reachable_object_0064_hits`: regex-matching path suffixes parsed from t0-035;
- `reachable_history_0064_hits`: regex-matching nonempty paths parsed from t0-036;
- `ref_tip_0064_hits`: exact t0-037 canonical scanner count and `matches.length`;
- `worktree_tracked_0064_hits` / `worktree_untracked_0064_hits`: exact t0-038 counts and array lengths;
- `independent_claim_hits`: exact t0-039 count and array length.

T0-037 must report exactly the same ref set/count as t0-032; t0-038 the same worktree set/count as t0-034; t0-039 scans every t0-032 ref's tracked Markdown and classifies only FIX-09 authority-family claim paths as nonindependent. Every hit count is zero. A scanner child failure, skipped ref/worktree, duplicate/malformed record, count/array disagreement, scope difference, or new independent claim is STOP.

The collision digest is:

```text
SHA256(
  UTF8("fix09-collision-evidence/v1") || 0x00 ||
  for id in [t0-032,...,t0-039]:
    U32BE(length(UTF8(id))) || UTF8(id) ||
    U64BE(length(raw_stdout)) || raw_stdout
)
```

It binds every ordered raw output, including counts, registry inputs, path scans, and paper claims. Hashing t0-039 alone is invalid.

## 5. Required forgery coverage

The validation ledger has one positive readback and exact hostile cases that preserve syntax while forging each trust class:

```text
AUTHORITY_TREE, AUTHORITY_SUBJECT, AUTHORITY_SCOPE,
MERGE_PARENT, MERGE_ORDER, MERGE_CONFLICT, MERGE_RESOLUTION,
SOURCE_MAP, C1_MAP, WRITER_MAP,
COLLISION_COUNT, COLLISION_SCOPE,
MANIFEST_STDOUT, MANIFEST_RC, MANIFEST_HASH,
BRANCH, COMMON_DIR, WORKTREE_REGISTRY,
RECEIPT_WIRE, REVIEW_HASH, REVIEW_VERDICT
```

Each mutation changes the candidate, report, manifest record, or copied evidence together as needed to retain valid superficial schema/hashes; independent replay must still reject it with its named exact code. A mutation that merely breaks JSON or a stored digest is insufficient for semantic-class coverage.

## 6. Truthful Vitest identity and count

The immutable adjacent input remains FIX-09 `8619b9ab4dbc01fdd166337a641193675b24380a`. It has 94 direct tests plus five `it.each` groups expanding to 3, 4, 2, 2, and 2 reporter assertions: exactly 107 adjacent names. V7 defines their source/reporter order as the v6 94-name array with PLAN-v7's exact thirteen expanded names inserted after `does not run a live fileURLToPath callback after policy initialization` and before `does not dispatch the exported refusal error superclass before custodian authentication`.

The RFC 8785 canonical array of all 107 adjacent full names is exactly 11,281 UTF-8 bytes with SHA-256 `5b061d338cbf49f10a1b2569b7e3fce3f1724c642bfd0922ebb7b878daaba09c`. Its outer order is the five v6 paths in printed order; within each path it is reporter `assertionResults` order. The runner normalizes and uniquely indexes reporter file paths, rejects missing/extra/duplicate files, then constructs each full name from `ancestorTitles` plus expanded `title`, rejects duplicate names, and requires exact per-file order and canonical-array/hash equality. Reporter completion order is not authority.

Binding positive gates are:

- Task 1: 1 file, 1 test;
- C3.5: the same 16 files, exactly 118 tests = 107 adjacent + first 11 new;
- C4: the same 20 files, exactly 122 tests = 107 adjacent + all 15 new.

Each positive gate runs clean three times with exact anchored summaries and zero failed/skipped/todo. Hostile coverage includes `IT_EACH_UNDERCOUNT` (one expanded case absent/duplicated/reordered/substituted) and `LEGACY_TOTAL_105_109`; neither may reach PASS.

## 7. Preserved authority and STOP

All v4-v6 protocol and implementation laws not expressly replaced above remain. The witness W remains 1,093 bytes with SHA-256 `78b595a8998c4ac3acbbaa59b7f635835ef55b593f9377639d1c56d4349f342e`. Migration remains forward-only `migrations/0064_fix09_audit_chain.sql`. Binding order remains: admission → C3.5 → independent C3.5 review → separately authorized/reviewed FIX-10 C0 → C4 → independent C4 review → V-only live acts.

STOP on any self-certified assertion, unbound candidate/result field, incomplete ledger, prose scanner placeholder, raw-evidence mismatch, graph/blob/source/C1/writer/collision/registry drift, 94/105/109 count, omitted parameterized assertion, v4-v6 byte edit, collision, private material, or previously forbidden act. Task 0 and C3.5 remain unauthorized until fresh independent v7 authority review passes.
