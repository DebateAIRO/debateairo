# FIX-09 C3.5/C4 — terminal admission execution correction

**Successor authority packet — 2026-09-06, fix round 7.** This document incorporates `SPEC-v4.md` through `SPEC-v10.md` without changing their bytes. It supersedes only PLAN-v10's two nested-cwd index-object operands, its brittle schema-grant source predicate, the identities of the failed attempt and fixed retry, the new fixed-attempt integrity preflight, the mandatory non-authoritative shadow replay, and strictly derived program/ledger/fixture/evidence pins. Every writer-boundary, paper-scope, stable-read, Ed25519 row-chain, occurrence-detail, key/custody/filesystem, witness, recovery, forward-only migration, grant, privacy, stage-order, receipt, ledger-count, reporter-name/count, and V-only contract remains binding.

This packet authorizes documentation now and, only after a fresh independent post-round-7 v11 authority PASS and separately reviewed Task 0 result receipt, the already bounded local C3.5/C4 implementation and tests. The real fixed v11 Task 0 program, branch, worktree, manifests, candidate, result, and review remain absent until that independent authority PASS. Task 0 and C3.5 remain STOP. This round authorizes no real admission branch/worktree or receipt, product/test/migration edit, Git-metadata act beyond the requested final documentation commit and the disposable shadow topology below, Hermes access, live root/key/database/service act, quiesce, activation, acceptance, merge, push, board mutation, or Done claim.

## Terminal failed-attempt diagnosis

The first real PLAN-v10 Task 0 capture is preserved as failed diagnostic evidence. Its sealed 39-command manifest proved that exactly three ledger expectations disagreed with execution; the other 36 facts match their expected exit, signal, raw-stream integrity, and parser semantics:

```text
t0-014  cwd=.../fix09-c35-admission/dialectical-engine
        git rev-parse :docs/.../FIX-02/DECISIONS.md -> rc 128
t0-022  cwd=.../fix09-c35-admission/dialectical-engine
        git rev-parse :docs/.../FIX-09/DECISIONS.md -> rc 128
t0-031  pinned source contains CREATE SCHEMA IF NOT EXISTS obs;
        PLAN-v10 grant-scan searched CREATE SCHEMA obs; -> rc 2
```

For a command running at the nested package cwd, the accepted repository-root index-object names are exactly `:dialectical-engine/docs/missions/observability-agents/slices/FIX-02/DECISIONS.md` and `:dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md`. The equivalent package-cwd fixture form is exactly `:./docs/...`; bare `:docs/...` is not accepted. Candidate derivation binds a closed two-entry resolution map keyed by the normalized package-relative paths; missing, extra, duplicate, or conflicting entries are fatal.

The grant proof is a bounded exact line proof over the two immutable source bodies. The migration must contain exactly one line `CREATE SCHEMA IF NOT EXISTS obs;` and the exact adjacent pair `GRANT USAGE ON SCHEMA obs` / `  TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;`. The schema source must contain exactly one each of `export const obs = pgSchema("obs");`, `export const obsOccurrence = obs.table("occurrence", {`, and `export const obsAgentAction = obs.table("agent_action", {`. The output remains the same three-field `fix09-grant-scan/v1` envelope and binds the exact source blob and SHA-256 pins. There is no substring, comment, whitespace-normalization, spelling, suffix, or near-match fallback.

Literal resolution fixtures prove two positives (repository-root and package-relative forms) plus six hostile cases: the failed package-relative spelling, a wrong repository prefix, missing, extra, duplicate, and conflicting entries. Literal grant fixtures prove the current pinned source plus nine hostile bodies: each of five required lines omitted, `obz` spelling, `obs_extra` suffix, a commented create line, and a whitespace near-match.

## Append-only failed evidence and fixed identities

The failed attempt remains byte-for-byte and identity-for-identity evidence. It must not be overwritten, deleted, moved, relabelled, certified, or reused as v11 proof:

```text
program     .../PLAN-FixAgent/fix09-task0-v10.mjs
            SHA-256 1b3890e4dd2d0e9f1b304282faf510abd5dbce32253475a54f5339de2af6b4b7
manifest    .../PLAN-FixAgent/fix09-task0-base-manifest-v8.json
            SHA-256 58e71e509299b7a430a7432479644acd6fc1a435ede00bb76082ec4adb46b727
evidence    /private/tmp/fix09-v10-base.HcNB1bjq (118 exact entries; embedded manifest identical)
diagnostic  /private/tmp/fix09-v10-base.BasmMPNz (empty preserved directory)
report      .../.superpowers/sdd/PLAN-v9/task-0-admission-candidate-report.md
            SHA-256 e07d3df52c6d6352c96f3058be59c12ed009a95d64e96137b60cc2b27dd02d47
branch      codex/fix09-c35-admission at c20e38f1695ecbf72ab2624c9f72dfe4e634d07b
worktree    .../.worktrees/fix09-c35-admission at the same clean tip
```

The real fixed attempt has noncolliding v11-only identities: `fix09-task0-v11.mjs`, `fix09-task0-v11-base-manifest.json`, `fix09-task0-v11-candidate-validation-manifest.json`, `fix09-task0-v11-result-validation-manifest.json`, `fix09-c35-admission-v11-candidate.receipt`, `fix09-c35-admission-v11-result.receipt`, `fix09-c35-admission-v11-review.md`, branch `codex/fix09-c35-admission-v11`, and worktree `.../.worktrees/fix09-c35-admission-v11`. Before the real attempt, the program's fixed-attempt preflight requires all nine future identities (seven files, worktree, branch) absent and all seven preserved-v10 predicates true at the exact hashes/tip above.

## Mandatory disposable shadow replay

Independent authority acceptance requires an actual end-to-end execution of the exact embedded v11 program from a fresh `/private/tmp/fix09-v11-shadow.<8-alphanumeric>` diagnostic root. The runner creates a no-hardlink/no-checkout local clone at `<root>/controller-root`, verifies its remote authority tip, checks out only a local `codex/fixagent-plan` authority branch, and derives shadow-only branch `codex/fix09-v11-shadow-<token>` plus lexically later worktree `<root>/zz-admission-root`. Program, evidence roots, manifests, and the candidate also remain under that private root but outside either worktree. It captures all 39 base facts using the exact ledger semantics, seals/replays the manifest, derives a non-authoritative 32-field candidate, and captures all 20 candidate validations with their exact expected exit, signal, stdout parser, and stderr parser. The proof must explicitly show t0-014, t0-022, and t0-031 at rc 0 and must finish with 39/32/20 counts.

The first shadow topology exposed two downstream diagnostic-only mismatches. A linked worktree under the evidence root was registered ahead of lexically earlier live roots, so preserved `parseWorktrees` canonical-order validation correctly rejected t0-038. Moving it into the live common repository restored order, but the required two-pass t0-039 scan over 78 unrelated mutable registered worktrees then truthfully rejected concurrent metadata; a separate complete retry scanned 86,438 worktree documents with zero independent claims. Neither is a fourth mismatch in the sealed v10 base manifest. V11 preserves both registry ordering and stable-read laws. The final fresh composed clone isolates the proof from unrelated mutable worktrees while retaining the exact committed objects/refs, and its `controller-root` then `zz-admission-root` worktree order is canonical. A pre-existing path or branch at either diagnostic identity is `FIX09_SHADOW_COLLISION`, and cleanup proves the linked worktree, branch, clone/evidence root, and runner absent.

Shadow bytes and results are diagnostic only: they cannot be published, renamed, or certified as the real retry. The runner removes only its own registered worktree, branch, and temporary root, proves those three identities absent after cleanup, and never creates any real v11 retry artifact. Source inspection, compilation alone, or replay of the failed v10 manifest is not acceptance evidence.

## Root-anchored source-map correction

`t0-028` retains `cwd="ADMISSION"`, the nested `dialectical-engine/` package directory, and retains the same fifteen ordered source paths. Every path operand in its executable successor ledger is exactly `:(top)dialectical-engine/<source-path>`. No bare, `./`, absolute, wildcard, alternate top prefix, or reordered operand is accepted. `--full-tree` controls the printed tree names; the `:(top)` magic is the authority that resolves each pathspec from the shared repository top rather than from the nested cwd.

Git prints each result as `dialectical-engine/<source-path>`. `parseSourceMap` retains its exact optional `dialectical-engine/` normalization and yields the fifteen prefix-free `SOURCE_PATHS` keys in ledger order. The later `HEAD:./<source-path>` checks remain relative to `ENGINE`; their input is therefore the normalized prefix-free key. The candidate's `source_blob_map` schema, key names, and 32-field receipt are unchanged.

PLAN-v11's closed `source-map-fixtures` mode requires all fifteen exact top-anchored operands and all fifteen normalized map entries. It rejects exactly five hostile controls: one bare operand, one `:(top)wrong-engine/` operand, one missing map entry, one extra map entry, and one duplicate map entry. Its exact success output is `FIX09_SOURCE_MAP_FIXTURES_PASS operands=15 normalization=15 hostile=5\n`, with empty stderr and rc 0. The five controls also run inside the aggregate scanner fixture mode. The source-map controls do not add paper cases; the exact updated aggregate output is pinned below.

The base, candidate-validation, and result-validation ledgers remain exactly 39/20/3 entries. The source-map parser error remains `FIX09_SOURCE_MAP`; a malformed executable pathspec is `FIX09_LEDGER_SOURCE_PATHSPEC`. Candidate/result schemas, fields, composition, collision digest domain and t0-032..039 raw-output membership remain unchanged.

## Exact reviewed FIX-10 dependency references

The post-round-6 stable paper RED scan found five `0064` tokens in three FIX-10 authority documents landed between FIX-09 v9 and v10. They are reviewed dependency references to FIX-09's allocation, not independent migration claims. The closed allow projection adds only these exact path/blob/content-SHA-256 tuples from immutable commit `bf6993aa00b0ecfd27bbea4c8d133bfe06aa5c5f`:

```text
dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md | 7b3407d43bff10c572bb6413c06e2c52fcee1ac6 | 2b3c3737f166d5e6fb25a467bc27772e168be0e8bc8f499a73ce7fda5c93ee0f
dialectical-engine/docs/missions/observability-agents/slices/FIX-10/PLAN-v4.md   | 86aa393da047443810ca7e353e82c49a2b14706c | 108ff4ca04e17ad62f217d99c4894985626291750260d54c5ae290507da24042
dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v4.md   | c4428c80fc12334d378540a62b552fd8f6afcf70 | ffa5d6e5a57ac89a553dc916e0a0eef58066b56ba8ec4e8a11e1130a72d0e975
```

Allowance requires exact path, exact complete body SHA-256, exact Git blob id recomputed from those body bytes, and an exact `0064`, `0064.sql`, `0064_fix09_audit_chain`, or `0064_fix09_audit_chain.sql` token. There is no FIX-10 directory, subtree, basename, content-only, prefix, suffix, or wildcard allowance. The three pins are included in `authority_allow_sha256`; t0-039 retains its fifteen fields and `fix09-paper/v2` schema.

Four deterministic paper cases read the pinned immutable blob bytes. Exact bytes pass as dependency references. A one-byte body mutation, an appended independent-allocation line naming `migrations/0064.sql`, and the exact bytes at a new FIX-10 document path each remain independent. The paper fixture total is therefore eighteen; writer cases remain eight and omission mutants remain three.

## 1. Stable descriptor read

### 1.1 Captured interface

PLAN-v11's literal program captures these Node 22/POSIX values once at module initialization, before scanner input is processed:

```text
fs.openSync
fs.fstatSync
fs.lstatSync
fs.readFileSync
fs.closeSync
fs.realpathSync.native
fs.constants.O_RDONLY
fs.constants.O_NOFOLLOW
path.resolve
path.sep
```

Each function reference is bound and frozen in `CAPTURED_IO`; `O_RDONLY` and `O_NOFOLLOW` must be supported integers and `O_NOFOLLOW != 0`, otherwise startup is `FIX09_PAPER_WORKTREE`. No later property lookup supplies an I/O primitive or flag.

The sole production primitive is:

```ts
stableReadWorktreeMarkdown(
  canonicalRoot: string,
  relativePath: string,
  io = CAPTURED_IO
): {
  body: Buffer;
  metadata: {
    dev: string;
    ino: string;
    mode: string;
    nlink: string;
    size: string;
    mtime_ns: string;
    ctime_ns: string;
  };
}
```

The optional `io` is accepted only by the closed built-in fixture mode; admission scanning always uses object identity `CAPTURED_IO`.

### 1.2 Exact checks and snapshot instant

Before any path operation, reject an absolute/empty/dot/dot-dot path, a non-lowercase-`.md` suffix, or any exact `.hermes` component. Resolve lexically beneath the already registered physical root and require the result to remain under `root + path.sep`. Native-realpath the target and require the physical result to equal the lexical target, remain under the physical root, and contain no `.hermes` component. Thus no symlinked component is accepted.

Open exactly `target` using `O_RDONLY | O_NOFOLLOW`. On the opened fd, call `fstatSync(fd,{bigint:true})`; on the path, call `lstatSync(target,{bigint:true})`. Both must be regular, nonsymlink files with `nlink == 1`. Their exact `dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, and `ctimeNs` projections must be equal.

Read all bytes from the opened descriptor, never by pathname. Then:

1. call fd `fstatSync(fd,{bigint:true})` again;
2. native-realpath the target again and require the same exact physical in-root target;
3. call path `lstatSync(target,{bigint:true})` again as the final filesystem snapshot operation;
4. require exact equality of the pre/post fd projections, pre/post path projections, and final fd/path projections;
5. require `BigInt(body.length) == final.size`.

The final post-read path `lstat` is the defined snapshot instant. A replacement strictly after it is future state. Any mutation, truncation, replacement, disappearance, symlink/hard-link alias, metadata change, path escape, or error before or during that operation fails `FIX09_PAPER_WORKTREE`.

The fd is closed exactly once in `finally`. A thrown/abnormal open, read, stat, realpath, or close; a non-`undefined` close result; or a fixture call-count mismatch becomes `FIX09_PAPER_WORKTREE`. No partial bytes or metadata escape.

## 2. Two-pass worktree snapshot

### 2.1 One pass

For each canonical root, run the exact v8 tracked and nonignored-untracked Git `ls-files -z` argv and retain the raw NUL bytes as `beforeTracked` and `beforeUntracked`. Parse their already binding sorted/unique/no-Hermes path laws. Stable-read every listed path in exact `tracked` then `untracked` order. Re-run both exact Git argv as `afterTracked` and `afterUntracked`; require raw byte equality before parsing or accepting the pass.

A pass produces:

```text
enumerations: ordered {root,tracked_bytes,tracked_sha256,untracked_bytes,untracked_sha256}
documents: ordered {
  content_sha256,
  kind,
  metadata:{dev,ino,mode,nlink,size,mtime_ns,ctime_ns},
  path,
  root
}
```

Document order is root order, then `tracked`, then `untracked`, then the Git NUL-list path order. The body is retained only for claim classification and omitted from the evidence projection.

### 2.2 Complete snapshot

Run the entire pass twice. Between-pass hooks exist only in fixture mode. Require byte-identical raw tracked/untracked NUL enumerations for every root and RFC 8785 equality of both complete document projections, including path, kind, content hash, and all metadata. Only the second pass bodies may proceed to classification after equality succeeds.

An add, removal, rename, content change, metadata change, or tracked/untracked reclassification during or between passes is `FIX09_PAPER_WORKTREE`. The v8 ref-tip object walker remains single-pass because a referenced Git blob is immutable.

T0-039 retains `fix09-paper/v2` and its exact fifteen output fields. `worktree_evidence_sha256` uses the exact domain tag `fix09-paper-worktrees/v3\0` and binds one closed object: ordered `documents` with the v9 metadata-bearing projections and ordered `enumerations` with each root plus the byte length and SHA-256 of its exact second-pass tracked/untracked NUL buffers. The ref tag remains `fix09-paper-refs/v2\0`. The raw t0-039 stdout remains the eighth member of the unchanged domain-separated t0-032..039 digest; candidate field count 32, result field count 17, and ledgers 39/20/3 do not change.

## 3. Deterministic fixtures and mutation controls

The exact fixture output is pinned in PLAN-v11. The preserved eight writer cases remain. The paper fixture ledger has eighteen behavioral cases:

```text
TRACKED_MODIFIED_CLAIM, UNTRACKED_CLAIM, ROGUE_FIX09_CLAIM,
DUPLICATE_ROOT, MISSING_ROOT, UNREADABLE_ROOT,
AUTHORITY_ALLOW, HISTORICAL_ALLOW, HERMES_ZERO_IO,
REPLACE_AFTER_READ, SAME_INODE_MUTATE_AFTER_READ, SYMLINK_SWAP_AFTER_READ,
ADD_BETWEEN_PASSES, REMOVE_BETWEEN_PASSES,
FIX10_DEPENDENCY_ALLOW, FIX10_DEPENDENCY_BYTE_MUTATION,
FIX10_DEPENDENCY_EXTRA_ALLOCATION, FIX10_DEPENDENCY_NEW_DOCUMENT
```

The replacement, truncate/modify, and symlink hooks run synchronously after `readFileSync(fd)` returns and before post-read checks. Add/remove hooks run after pass one and before pass two. Stable tracked-modified and untracked files are read by the real descriptor primitive and still reach independent-claim classification. The authority/historical cases still pass. The `.hermes/trap.md` sentinel is mode `000`; the fixture's captured I/O trace must show zero open/read calls for that path.

Three literal policy-omission mutants run the same core in fixture-only mode and are rejected with exact causes:

```text
OMIT_POST_FSTAT  -> FIX09_MUTANT_POST_FSTAT
OMIT_PATH_LSTAT  -> FIX09_MUTANT_PATH_LSTAT
OMIT_TWO_PASS    -> FIX09_MUTANT_TWO_PASS
```

The first two are killed by the captured operation trace requiring exactly two fd fstats and two path lstats; the third is killed by the two-pass trace/equality gate while an add/remove interleaving is active. Unknown fixture policy, hook, trace field, or cause is fatal.

## 4. Preserved authority and STOP

The writer scanner remains byte-semantically unchanged and must reproduce its four writers, two excluded details, 1,769-byte stdout SHA-256 `98b11ca61daa9437b97b6a3fdc76192ca7dab39653994fb0bfc62c2ea355ffd7`, and row digest `5160c7da8f7c95d382e4c0733ee11c17087c056fa75d5300a3637891ffd0135b`. Reporter identity/count remains 107 adjacent names, 118 C3.5 tests across 16 files, and 122 C4 tests across 20 files.

Binding order remains: independently reviewed admission → migration/library/all writer conversions → independent C3.5 review → separately authorized/reviewed FIX-10 C0 → C4 verifier/witness → independent C4 review → V-only live acts. Migration remains forward-only `migrations/0064_fix09_audit_chain.sql`.

STOP on a pathname body read, absent no-follow flag, unstable descriptor/path metadata, omitted close, one-pass worktree evidence, unequal Git NUL lists, unequal pass projections, surviving omission mutant, Hermes I/O, prior-authority edit, collision, self-certified receipt, reporter drift, private material, or any previously forbidden act.
