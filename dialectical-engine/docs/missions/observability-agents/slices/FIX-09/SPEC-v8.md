# FIX-09 C3.5/C4 — boundary-safe writer and complete paper-collision admission

**Successor authority packet — 2026-09-05, fix round 4.** This document incorporates `SPEC-v4.md` through `SPEC-v7.md` without changing their bytes. It supersedes only v7's writer scanner, paper scanner, their t0-030/t0-034/t0-039 parsers/field mappings, and the corresponding hostile evidence. Every Ed25519 row-chain, occurrence-detail, key/custody/filesystem, witness, recovery, forward-only migration, grant, privacy, stage-order, reporter-name/count, and V-only contract remains binding.

This packet authorizes documentation now and, only after a fresh independent v8 authority PASS and separately reviewed Task 0 result receipt, the already bounded local C3.5/C4 implementation and tests. Task 0 and C3.5 remain STOP. This round authorizes no admission branch/worktree, product/test/migration edit, Git-metadata act, live root/key/database/service act, quiesce, activation, acceptance, merge, push, or Done claim.

## 1. Exact row-writer scan

T0-030 remains exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,writer-scan]` in the admission engine cwd. It reads only the committed `HEAD` blobs for:

```text
packages/obs-capture/src/runtime/sink.ts
tools/obs-listener/src/daemon/poison.ts
```

The scanner uses this literal Unicode, global, case-insensitive expression:

```js
/(?<![\p{L}\p{N}_])INSERT\s+INTO\s+obs\.(occurrence|agent_action)(?![\p{L}\p{N}_])/giu
```

The negative identifier boundary after the table permits only the exact SQL identifiers `obs.occurrence` and `obs.agent_action`. It cannot prefix-match `obs.occurrence_detail`, `obs.occurrence2`, or another identifier. Quoted/lookalike/wrong-schema/wrong-table syntax cannot replace an expected match. A valid-looking token added in a comment or ordinary string is an extra ambiguous writer and fails closed rather than being silently classified.

Every match is bound by byte offset and one-based line to exactly one unique source range. The closed ordered result is:

```text
occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences
occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence
agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt
agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt
```

The two exact `obs.occurrence_detail` inserts are scanned separately with `/(?<![\p{L}\p{N}_])INSERT\s+INTO\s+obs\.occurrence_detail(?![\p{L}\p{N}_])/giu` and must bind, one each, to `writeOccurrences` and `ingestSpooledOccurrence`. They are never row writers.

T0-030 emits one LF-terminated RFC 8785 object with exactly:

```json
{
  "schema":"fix09-writer-scan/v2",
  "source_blobs":[{"blob":"<sha40>","path":"<closed path>","sha256":"<lowercase64>"}],
  "row_writer_count":"4",
  "detail_insert_count":"2",
  "row_matches":[{"byte_offset":"<base10>","line":"<base10>","path":"<closed path>","symbol":"<closed symbol>","table":"occurrence|agent_action"}],
  "detail_matches":[{"byte_offset":"<base10>","line":"<base10>","path":"packages/obs-capture/src/runtime/sink.ts","symbol":"writeOccurrences|ingestSpooledOccurrence","table":"occurrence_detail"}],
  "row_match_digest":"<lowercase64>",
  "writer_map":["<the four rows above, in order>","future_agent_action|FIX-10|ops|obsctl"]
}
```

`row_match_digest = SHA256(UTF8("fix09-writer-matches/v1") || 0x00 || RFC8785(row_matches))`. Candidate `writer_map` is the exact nested array; candidate `writer_map_sha256` is SHA-256 of the complete raw t0-030 stdout, including its LF. Thus blobs, exact 4/2 cardinality, offsets, symbol binding, and map are cross-bound. At the immutable reviewed inputs the row digest is `5160c7da8f7c95d382e4c0733ee11c17087c056fa75d5300a3637891ffd0135b`; PLAN-v8 pins the full source-backed output.

The scanner's eight-case self-test covers positive cardinality, separate detail classification, quoted identifier, identifier lookalike, comment decoy, string decoy, wrong table, and left-boundary/lookalike exclusion. Any missing, extra, duplicate, reordered, re-ranged, or rehashed result is `FIX09_WRITER_SCAN`.

## 2. Complete Markdown paper scan with no Hermes access

### 2.1 Closed scope

T0-034 changes only to literal `git worktree list --porcelain -z`. Its parser requires well-formed NUL records, absolute readable/searchable directories, physical `realpath` canonicalization, sorted unique roots, no symlink root, and no missing/unreadable/duplicate root.

T0-039 remains exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,paper-scan]` in the controller cwd. It scans:

1. every ref from t0-032, at that ref's tip tree, by recursively reading Git tree objects and every tracked lowercase `.md` blob;
2. every t0-034 registered physical worktree's current tracked lowercase `.md` bytes, including modifications;
3. every such worktree's current nonignored untracked lowercase `.md` bytes.

The ref walker examines one tree level at a time and never descends an entry whose basename is exactly `.hermes`; it never requests a blob beneath that entry. Worktree enumeration uses literal excluded pathspecs `:(exclude).hermes/**` and `:(exclude)**/.hermes/**`, then rejects any returned path containing a `.hermes` component before `lstat` or read. No Hermes path or content may be opened, hashed, parsed, or used as evidence. `.git` contents are accessed only through Git commands; ignored untracked files are outside the declared untracked scope.

Every ref document is canonical `{blob,content_sha256,path,ref}`; every worktree document is canonical `{content_sha256,kind,path,root}`, where `kind` is `tracked` or `untracked`. Arrays use ref/root/path order from the independently checked sorted sources. UTF-8, NUL, missing file, nonregular file, symlink, hard-link alias, root escape, duplicate, subprocess, or concurrent read mismatch fails closed. The output binds each complete canonical array with a tagged SHA-256 digest.

### 2.2 Claim grammar and exact exceptions

A claim token is found only by:

```js
/(?<![\p{L}\p{N}_])0064(?:_fix09_audit_chain)?(?:\.sql)?(?![\p{L}\p{N}_])/giu
```

Adjacent hexadecimal hashes, longer base-10 numbers, and longer identifiers are not claims.

The authority exception is not a subtree exemption. The only candidate paths are the exact `DECISIONS.md`, `SPEC-v4.md` through `SPEC-v8.md`, and `PLAN-v4.md` through `PLAN-v8.md` under `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/`. Content SHA-256 must equal the same path's blob in one of the exact authority commits `bcae759eec5a2e6987ef49e2f3ad82919807a85a`, `2ab5f78f00cde444dc33a99e444dd14aeec9881d`, `0e1fe1807aa2a4706b2438024a6b85f9c1a5f2ca`, `25ffdbc5e58625f4732ac023e55a2903c15469b9`, or the self-checked v8 authority commit. The token itself must match the closed claim grammar. A different blob, unexpected version/path, or rogue file anywhere under FIX-09 is independent.

One historical nonclaim is allowed only at exact path `dialectical-engine/docs/missions/observability-agents/plans/PLAN-FixAgent.md`, only when the entire LF-terminated line equals PLAN-v8's `HISTORICAL_LINE`, and only when its SHA-256 is `5ed8a3e77f03d20264ae0af6c1b626e10654007fc28d7e27fc69b797bfa4587d`. This is the C4 preflight sentence saying a future freshly audited `0064` slice must precede C4; no path-wide or line-prefix exemption exists.

### 2.3 Closed output and cross-checks

T0-039 emits exactly these fields:

```text
allowed_claim_hits, authority_allow_sha256, historical_line_sha256,
independent_claim_hits, matches,
ref_document_count, ref_evidence_sha256, ref_set_sha256,
registered_worktrees, schema, scope,
worktree_document_count, worktree_evidence_sha256,
worktree_roots, worktree_set_sha256
```

`schema` is `fix09-paper/v2`; `scope` is the unchanged v7 collision scope; counts are canonical base-10 strings. `matches` has only independent closed descriptors `{content_sha256,domain,line,line_sha256,owner,path,token}`. The ref/worktree evidence digests are respectively SHA-256 over the domain tag plus NUL plus RFC 8785 canonical evidence array. `authority_allow_sha256` similarly binds the sorted exact path/content allowlist.

The validator requires the ref set/count/hash to equal t0-032/t0-037, roots/count/hash to equal the newly NUL-framed t0-034 and t0-038, all digests lowercase64, and `independent_claim_hits == matches.length == 0`. Raw t0-039 remains the eighth member of v7's domain-separated t0-032..039 collision digest; no evidence field stands alone.

Nine safe temporary-fixture cases cover tracked modification, nonignored untracked claim, rogue FIX-09 claim, duplicate root, missing root, unreadable root, exact authority blob, exact historical nonclaim, and `.hermes` exclusion without reading the sentinel. Scanner fixtures create no Git metadata and remove only their validated `/private/tmp/fix09-v8-paper.*` directory.

## 3. Preserved admission and gates

All 32 candidate fields, 17 reviewer-result fields, fact-only capture records, merge/source/C1/grant derivations, forgery classes, and the 39/20/3 ledgers remain as v7 except the exact scanner/parser/mapping changes above. Program bytes and ledger argv are literal in PLAN-v8. The immutable reporter law remains exactly 107 adjacent expanded names; positive totals remain Task 1 = 1, C3.5 = 118 across 16 files, and C4 = 122 across 20 files, each clean three times.

Binding order remains: independently reviewed admission → migration/library/all writer conversions → independent C3.5 review → separately authorized/reviewed FIX-10 C0 → C4 verifier/witness → independent C4 review → V-only live acts. Migration remains forward-only `migrations/0064_fix09_audit_chain.sql`.

STOP on a prefix-matched detail writer, incomplete writer map, blanket FIX-09 exemption, skipped ref/worktree/current/untracked Markdown, Hermes access, malformed/duplicate/unreadable root, unbound evidence digest, surviving fixture, prior-authority edit, collision, self-certified receipt, reporter undercount, private material, or any previously forbidden act.
