# FIX-01 SPEC-v6 — monotone release recovery addendum

Status: FROZEN — controller-ratified authority for FIX-01 C4 round 8.

SPEC-v6 replaces the release-lock recovery and early runtime index checks in SPEC-v5. All other rules in the earlier FIX-01 specs and `DECISIONS.md` stay in force. This file does not admit a production directory. It does not record V approval for one.

## 1. Fixed release plan lock

An admission run with one or more candidates uses the direct path `.obs-spool-release-lock-v1`. The file name does not change. The fixed content is:

```text
FIX01_RELEASE_LOCK_V2
<64 lowercase hex admission reference>
<16 lowercase hex index device>
<16 lowercase hex index inode>
<16 lowercase hex base prefix size>
<16 lowercase hex planned append size>
<64 lowercase hex planned append SHA-256>
<16 lowercase hex final prefix size>
<64 lowercase hex checksum>
```

Each line ends in LF. The four size and identity values use fixed-width lowercase hexadecimal. Device and inode fit unsigned 64-bit values. Sizes fit safe nonnegative integers. Planned append size is positive. Base size plus planned append size equals final size.

The checksum is SHA-256 over these values, in this order: `FIX01-RELEASE-LOCK-V2`, admission reference, decimal index device, decimal index inode, decimal base size, decimal planned append size, planned append SHA-256, and decimal final size. One NUL byte separates fields. There is no trailing separator.

## 2. Admission order

Admission finishes its first stable source scan and PID checks before release work.

It builds one exact deterministic append byte string. The string contains every missing plain candidate record, then every missing A1 record. Each record uses the existing leading-LF and trailing-LF frame.

Before any lock or index change, admission checks a conservative manifest v4 size. If no index exists, it may then create one empty regular single-link index. It writes no authority record yet.

Admission records the index device, inode, current byte size as the base, exact planned append length and hash, and final byte size in the lock. It creates the lock with an exclusive no-follow open. It writes and syncs the lock file. It then opens and syncs the spool directory. A directory open or sync error stops admission before any planned index byte is written.

Only after that barrier may admission append the plan.

## 3. Monotone rerun

A rerun keeps the same lock, admission reference, and index file.

It parses only the locked base prefix. From that base, the stable sources, and the locked admission reference, it rebuilds the exact plan. Index identity, base size, plan length, plan hash, and final size must equal the lock.

The current bytes after the base must be an exact prefix of the plan. Admission appends only the missing tail. It never truncates, replaces, or rewrites the index or lock. A mismatch stops admission.

A crash may leave zero planned bytes, any strict prefix, or the full plan. Every such state is retryable. A completed rerun has exactly one required plain record and exactly one required A1 record for each candidate.

## 4. Manifest v4, gate, and seal

The canonical release manifest version is 4. Its verifier version is `fix01-release-admission-v4`.

For a candidate-bearing `PASS_INDEXED` result, `release_lock` records lock identity and hash, index device and inode, base size, planned append length and hash, and final size. Final size equals the manifest index size. Other verdicts use `release_lock: null`.

The gate checks the direct lock against every manifest lock field. It checks that the planned segment inside the sealed index prefix has the locked length and SHA-256. The existing seal v2 stays in use. The seal index device, inode, and prefix equal the lock index device, inode, and final size. The seal lock hash binds all plan fields.

## 5. Runtime early stop

With a valid lock, runtime compares the seal index device, inode, and prefix with the lock before it opens or changes the cursor. The prefix must equal the lock final size.

The typed page reader opens the index first. Before cursor work, it checks the current index device, inode, and minimum locked prefix size. After its page read, it checks index pathname and descriptor identity again before it writes the cursor.

A wrong seal index device, wrong seal index inode, or wrong seal prefix causes zero cursor change, zero SQL, and no completion file.

Runtime still uses direct fixed paths. It does not list the spool directory, read the manifest, or hash the release prefix.

## 6. Required tests

Tests retain 1-byte, 5-byte, middle, and last-byte prefixes of both the first missing plain record and the first missing A1 record. Two reruns must reach PASS, gate, drain, reuse the lock and reference, and leave one plain and one A1 record.

Tests also prove wrong seal device, inode, and prefix stop before cursor creation or change. An ordered test proves lock-file sync, directory sync, then index write. An injected directory-sync error must leave the base index unchanged and make no manifest or PASS output.

Isolated mutants must fail when they remove missing-tail recovery, move seal identity checks after cursor work, or remove the directory durability barrier.
