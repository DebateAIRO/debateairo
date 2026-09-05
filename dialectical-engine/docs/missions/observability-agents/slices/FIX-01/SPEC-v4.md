# FIX-01 SPEC-v4 — V-admitted legacy release identity

Status: FROZEN — controller-ratified authority under V's standing approval for FIX-01 C4 round 6.

SPEC-v4 has higher precedence than `SPEC-v3.md` for the clauses named here. All other clauses in `SPEC.md`, `SPEC-v2.md`, `SPEC-v3.md`, and `DECISIONS.md` remain in force. This document does not record a concrete production attestation.

## 1. Scope and supersession

This specification supersedes the legacy-PID admission and launch portions of FIX-01-V3-R01 through R05. The prior rule could admit a dead legacy writer and then starve its spool forever if the numeric PID was reused before drain.

The new authority is narrow: it applies only to unchanged legacy spool files admitted while V has stopped every instrumented process that can use the canonical directory. It does not promise universal process identity before the verifier's first observation. After that first stable observation proves `ESRCH`, a process that later occupies the same numeric PID is unrelated under the stopped-process precondition.

## 2. Authoritative admission observation

Each admission run creates a fresh, unpredictable admission reference with `randomBytes(32).toString("hex")`. It is exactly 64 lowercase hexadecimal characters and is never reused deliberately.

Before any index or manifest mutation, the verifier takes its first stable source snapshot. It calls `process.kill(pid, 0)` once for every canonical regular single-link candidate. Only `ESRCH` admits the candidate as dead; success or every other error is `FAIL_LIVE_OWNER`. The verifier must finish this no-mutation observation for the source set before repairing the index.

The first stable dead-owner observation is authoritative for that run. The repeated source snapshot proves the same path/fd identity, `nlink`, size, `mtimeNs`, `ctimeNs`, exact bytes, and SHA-256, but it does not probe or reclassify a newly reused numeric PID. A source change still fails closed as `FAIL_CHANGED`.

## 3. A1 release-admission records

`.obs-spool-index-v1` remains the only runtime discovery index and remains append-only. Existing plain basename records are writer-owned. Admission adds this typed self-delimiting record:

```text
A1<TAB><canonical-basename><TAB><proof-base64url><LF>
```

`proof-base64url` is the unpadded canonical base64url encoding of the full 32-byte SHA-256 digest over these exact UTF-8 bytes, with one NUL byte between adjacent fields and no trailing separator:

```text
FIX01-SPOOL-ADMISSION-PROOF-V1
admission_ref
basename
dev
ino
nlink
size
mtimeNs
ctimeNs
source_sha256
```

`dev`, `ino`, `nlink`, `size`, `mtimeNs`, and `ctimeNs` are canonical nonnegative decimal strings derived from bigint stats; `nlink` is exactly `1`. `source_sha256` is the lowercase hexadecimal SHA-256 of the exact source bytes. The outer basename is therefore bound into the proof.

An A1 append uses the same single-write recovery grammar as a writer record: its exact write buffer is `"\n" + record + "\n"`. A plain complete record remains limited to 128 bytes including LF. An A1 record is at most 175 bytes including LF, and its one-write append buffer is at most 176 bytes. The page limits remain 8,192 index bytes and 64 raw index records per arm.

For every candidate, admission appends exactly one A1 record derived from the fresh reference and the authoritative source evidence. It then parses the final stable index and requires exactly one matching current-reference proof for every current candidate. Complete or partial records from prior references remain inert. A failed append may retain any prefix; the next leading delimiter restores framing, and no stale A1 becomes current merely because a later append completes a line.

SHA-256 supplies an integrity binding, not a signature or MAC. An A1 line alone has no launch authority.

## 4. Canonical manifest v2

The release verifier emits canonical manifest version 2. It retains every v1 field and relation, adds `admission_ref` and `admission_record_count`, and adds canonical `mtime_ns` and `ctime_ns` evidence to each entry. For `PASS_INDEXED`, `admission_record_count` equals `candidate_count` and `indexed_candidate_count`. The final index object continues to bind its exact `dev`, `ino`, `nlink: 1`, sealed size, and SHA-256.

`PASS_EMPTY` has zero candidates and no A1 record. A `PASS_INDEXED` result with zero candidates similarly activates no A1 authority. The launch gate below emits a seal only for a canonical `PASS_INDEXED` manifest with at least one candidate and one A1 record.

A verifier PASS and manifest do not activate runtime admission. V still owns the concrete production review and attestation from SPEC-v3. The verifier and launch gate write no V approval.

## 5. Every-launch offline gate

Before every launch or restart while an admitted A1 remains in the append-only index, the release control plane runs:

```text
pnpm exec tsx tools/obs-spool-launch-gate.ts \
  --spool-dir <absolute-canonical-realpath> \
  --build-ref <immutable-build-ref> \
  --manifest <absolute-manifest-path> \
  --manifest-sha256 <exact-digest-from-V-attestation>
```

The gate performs no directory enumeration. It uses `O_NOFOLLOW` and stable descriptor/path reads for the manifest and index and requires each to be a regular single-link file. It refuses a manifest larger than 8,388,608 bytes before accumulating its contents. It requires exact canonical manifest-v2 bytes, the supplied manifest SHA-256, the requested spool realpath and build ref, all manifest relations, and the recorded index device and inode.

The current index size must be at least the manifest's sealed size. The sealed prefix must end in LF and have the manifest's exact SHA-256. No complete, malformed, or partial A1-shaped line may begin outside that prefix. Later plain installer records are permitted. Index truncation, replacement, hardlinking, symlinking, sealed-prefix mutation, or any A1 suffix fails closed.

On success the gate prints one bounded seal whose canonical grammar is:

```text
1.<admission_ref>.<manifest_sha256>.<index_dev>.<index_ino>.<prefix_bytes>
```

The release control plane supplies this exact value as `OBS_SPOOL_ADMISSION_SEAL_V1` to that launch only. Manually setting the environment value without the V-attested digest and successful every-launch gate is an unauthorized launch; the seal is not a signature.

## 6. Bounded runtime use

Runtime configuration accepts only the strict seal grammar above, bounded to 256 UTF-8 bytes, lowercase 256-bit hexadecimal digests, canonical uint64 device/inode decimals, and a positive safe-integer prefix length. Invalid or absent input becomes no admission seal.

The typed index reader records each canonical writer or A1 entry with its absolute LF-end offset and the observed index device, inode, and size. The compatibility `readIndexedSpoolPage()` continues to return only writer-owned basenames. Runtime never reads the manifest, hashes an unbounded prefix, or enumerates the spool directory.

An A1 is eligible only when all of these conditions hold:

1. its syntax and base64url proof are canonical;
2. the observed index device and inode equal the seal;
3. the sealed prefix length does not exceed the observed index size;
4. the A1 LF-end offset is at or before the sealed prefix boundary; and
5. the seal reference is used to recompute the exact source proof.

A trusted A1 may bypass only the numeric PID liveness probe. After `O_NOFOLLOW` open, drain must still prove the same regular single-link pathname/fd identity, the file-size cap, exact bytes, exact proof metadata and digest, valid envelopes, and an immediate exact snapshot and proof recheck before the first SQL call. A mismatch produces no SQL and no completion; the source remains retained.

A plain writer-owned record never inherits A1 authority. It retains the current `kill(pid, 0)` skip: success or any non-`ESRCH` error skips the source. A forged A1 after the sealed prefix, an A1 with another reference, and an A1 used with a missing, malformed, or mismatched seal are inert.

The unchanged bounds are 8,192 index bytes, 64 raw index records, 64 eligible files, and 128 transaction attempts per arm. The three installer ABI/bytes and the spool writer remain unchanged.

## 7. Threat boundary

The V-attested manifest digest consumed by the every-launch gate and the authenticated sealed-prefix boundary authorize runtime use. The source proof then binds that authorization to exact legacy bytes and identity. Neither the proof nor the seal is a secret-key construction.

Same-UID malicious mutation after the gate or after the runtime's final applicable check remains the existing FIX-01-V3-R05 exclusion. Ordinary changes before the final check remain detectable and fail closed. This exception does not authorize a runtime directory scan, a followed link, an unrelated inode mutation, source deletion, false completion, or SQL for unverified bytes.

## 8. Acceptance and mutation obligations

Tests must prove a real PASS admission, numeric PID reuse for more than one complete cursor cycle, admitted A1 drain and completion without probing that PID, and continued skipping of a live plain writer record. They must prove that PID reuse beginning after the authoritative first snapshot does not invalidate otherwise stable admission.

Missing or mismatched seals; A1 after the prefix; proof, reference, device, inode, link count, size, `mtimeNs`, `ctimeNs`, or content changes; manifest/path/build/digest mismatch; symlinks; hardlinks; prefix mutation; truncation; replacement; and A1 suffixes must produce the stated fail-closed result. Plain same-inode index appends remain accepted. Every retained prefix of a failed A1 append must recover on a later complete append.

Distinguishing mutants must kill: trust every A1, omit the prefix boundary, omit any proof field, probe an admitted PID, bypass the plain-record PID check, accept a changed sealed prefix, enumerate at runtime, emit A1 from an installer, or let verifier output self-activate runtime admission.
