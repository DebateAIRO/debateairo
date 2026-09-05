# FIX-01 SPEC-v5 — release lock addendum

Status: FROZEN — controller-ratified authority for FIX-01 C4 round 7.

SPEC-v5 replaces the manifest, gate, and bounded-runtime rules named below. All other rules in `SPEC.md`, `SPEC-v2.md`, `SPEC-v3.md`, `SPEC-v4.md`, and `DECISIONS.md` stay in force. This file does not admit a production directory and does not record V approval for one.

## 1. Fixed release lock

An admission run with at least one candidate uses the direct path `.obs-spool-release-lock-v1`. Runtime and the gate must not scan the directory to find it.

The verifier finishes the first stable source scan and every PID check before it creates the lock. Before any index repair or A1 append, it computes the exact final index prefix size. It then creates one exclusive, no-follow, regular, single-link lock with this exact content:

```text
FIX01_RELEASE_LOCK_V1
<64 lowercase hex admission reference>
<16 lowercase hex prefix size>
<64 lowercase hex checksum>
```

Each shown line ends in LF. The checksum is SHA-256 over `FIX01-RELEASE-LOCK-V1`, the admission reference, and the decimal prefix size, with one NUL byte between fields and no trailing separator.

The lock stays present while any A1 record from that release remains. A rerun reads the same lock and reuses its admission reference and prefix. It must not replace or rewrite the lock. A changed boundary fails closed.

A malformed, symlinked, hardlinked, changed, unstable, or replaced lock is invalid. The reader uses `O_NOFOLLOW` and proves stable pathname/fd identity, one link, exact size, exact bytes, and checksum.

`PASS_EMPTY` and `PASS_INDEXED` with zero candidates have no release lock and no A1 authority.

## 2. Manifest v3 and size cap

The canonical release manifest version is 3. It adds `release_lock`. For a candidate-bearing `PASS_INDEXED` result, this object binds the lock basename, version, admission reference, device, inode, `nlink: 1`, byte size, SHA-256, and prefix size. Its prefix size equals the sealed index size. Other verdicts use `release_lock: null`.

The manifest limit is 8,388,608 bytes in both admission and the gate. Admission computes a conservative canonical size before it creates the lock, repairs the index, or appends A1. A value above the limit fails with no lock, index, A1, manifest, or PASS output. Admission also checks the exact final canonical bytes before writing the manifest.

## 3. Gate and seal v2

The every-launch gate validates the v3 manifest, exact V-supplied digest, index prefix, and direct release lock. Lock identity and content must equal the manifest. The gate keeps writer-name coverage only for manifest candidates while it streams the full prefix.

The gate emits this bounded seal:

```text
2.<admission_ref>.<manifest_sha256>.<index_dev>.<index_ino>.<prefix_bytes>.<lock_dev>.<lock_ino>.<lock_sha256>
```

The seal is limited to 512 UTF-8 bytes. Decimal fields are canonical. The reference and hashes are 64 lowercase hexadecimal characters. The prefix is a positive safe integer.

Bytes after the locked prefix do not change the seal. A later A1 is inert. It must not block the gate or a later lawful plain writer record.

## 4. Bounded runtime rule

Runtime reads the release lock by its fixed path before page work.

- No lock: ignore any seal. Plain records keep normal PID rules. A1 records stay inert.
- Invalid lock: stop this drain. Do no SQL and make no completion file.
- Valid lock with a missing, malformed, short, or mismatched seal: stop this drain before page work. Do no SQL and make no completion file.
- Valid lock with an exact seal: require matching lock reference, device, inode, hash, and prefix. Also require the sealed index device and inode and require `seal.prefixBytes === lock.prefixBytes <= indexSize`.

With an exact lock and seal, plain records whose LF end is inside the locked prefix are shadowed. A matching A1 inside that prefix may use admission authority. An A1 after the prefix stays inert. A plain record after the prefix keeps its PID rule and may drain even when an inert A1 comes before it.

Runtime still reads no manifest, hashes no unbounded prefix, and lists no directory.

For an admitted source, every source check used just before completion requires exact device, inode, `nlink`, size, `mtimeNs`, `ctimeNs`, and bytes. This includes zero-byte sources. A metadata change before the final applicable check makes no completion file and keeps the source.

## 5. Required tests

Tests must cover a missing, malformed, wrong, and short seal with a valid lock; no-lock plain behavior; valid lock and seal A1 drain; a later plain append; inert A1 suffixes; lock links, byte changes, and replacement; crash/rerun reuse; the exact manifest cap and cap plus one; gate memory tied to candidate count; and an empty-source metadata race.

Distinguishing mutants must fail when they remove lock checks, let a seal work without the lock, move the admission size check after index mutation, retain all writer names in the gate, or use loose metadata checks for admitted completion.
