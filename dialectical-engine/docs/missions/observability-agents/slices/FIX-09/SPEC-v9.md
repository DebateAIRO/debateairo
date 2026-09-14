# FIX-09 C3.5/C4 — stable current-worktree admission snapshot

**Successor authority packet — 2026-09-05, fix round 5.** This document incorporates `SPEC-v4.md` through `SPEC-v8.md` without changing their bytes. It supersedes only v8 §2.1's current-worktree Markdown acquisition and the corresponding fixture/evidence projections. Every writer-boundary, paper-scope, exact allowlist, Ed25519 row-chain, occurrence-detail, key/custody/filesystem, witness, recovery, forward-only migration, grant, privacy, stage-order, receipt, ledger, reporter-name/count, and V-only contract remains binding.

This packet authorizes documentation now and, only after a fresh independent post-round-5 v9 authority PASS and separately reviewed Task 0 result receipt, the already bounded local C3.5/C4 implementation and tests. Task 0 and C3.5 remain STOP. This round authorizes no admission branch/worktree, product/test/migration edit, Git-metadata act beyond the requested final documentation commit, Hermes access, live root/key/database/service act, quiesce, activation, acceptance, merge, push, or Done claim.

## 1. Stable descriptor read

### 1.1 Captured interface

PLAN-v9's literal program captures these Node 22/POSIX values once at module initialization, before scanner input is processed:

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

The exact fixture output is pinned in PLAN-v9. The preserved eight writer cases remain. The paper fixture ledger has fourteen behavioral cases:

```text
TRACKED_MODIFIED_CLAIM, UNTRACKED_CLAIM, ROGUE_FIX09_CLAIM,
DUPLICATE_ROOT, MISSING_ROOT, UNREADABLE_ROOT,
AUTHORITY_ALLOW, HISTORICAL_ALLOW, HERMES_ZERO_IO,
REPLACE_AFTER_READ, SAME_INODE_MUTATE_AFTER_READ, SYMLINK_SWAP_AFTER_READ,
ADD_BETWEEN_PASSES, REMOVE_BETWEEN_PASSES
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
