# FIX-10 — native descriptor custody inside the six pinned signer sessions

**Successor authority packet — 2026-09-07, fix round 4.** This document incorporates `SPEC-v2.md` through `SPEC-v5.md` without changing their bytes. It supersedes only v5's requirement that the signing parent itself retain the private-leaf descriptor and the related prohibition on every sidecar process. The sole permitted replacement is the closed same-principal descriptor-custodian child defined here. The six signing parents, their sole Ed25519 `KeyObject` values, every v5 public attestation/commit/release schema and signature domain, the VNOW-05 Option A root, every v2-v4 control/proof/audit law, and all STOP boundaries remain binding.

This packet authorizes these authority documents and fresh independent review only. It authorizes no FIX-09 v13 document or implementation, FIX-10 source/test/package/migration edit, helper build/install, worktree, Task 0, live root/key/database/process, activation, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified correction boundary

The rejected FIX-09 v12 review's native-helper findings were independently checked against the frozen sources and both stand:

1. FIX-09 v12 names `packages/obs-capture/native/fix09-openat-read.c` and installed leaf `${OBS_CONTROL_DIR}/chain/fix09-openat-read`, but supplies neither an executable production compiler/link/install derivation nor a closed way to bind the three runtime `OBS_WRITER_IDENTITY` values into its helper profile map.
2. V12's helper sends key bytes and exits after closing every descriptor. Its parent retains a `KeyObject`, but there is no live readiness/commit/release session and no retained descriptor. That cannot meet v5's current-private-byte barrier.

Pure Node.js 22 on Darwin exposes no `openat` API. A native descriptor walk is therefore source-grounded. Requiring the parent JavaScript process to perform that walk is not an implementable correction. Conversely, a long-lived signing helper, broker, pathname service, or exported private-key loader would widen authority. The following split keeps signing in each real writer process and gives the native child only descriptor custody.

The other rejected FIX-09 v12 findings remain FIX-09's responsibility. Nothing here authorizes a v12 Task 0 attempt or treats v12 as reviewed authority.

## 2. Hard FIX-09 v13 and C3.5 gate

Before FIX-10 Task 0, a future FIX-09 `SPEC-v13.md`/`PLAN-v13.md` successor and independent zero-finding authority review must expressly provide the implementation seam in §§3-6. The later `FIX09_C35_REVIEWED_REF` and its independent result must bind implementation of that exact v13 authority, including:

- one descriptor-custodian child per real signing parent, the six-profile map, the retained-leaf session protocol, and the parent-owned same-object signer;
- the exact source, compiler/link recipe, two-build reproducibility receipt, installed binary, V-signed inventory/profile-map digest, activation pins, and cold-start checks;
- all five row-writer compositions at C3.5 and the non-live activation-pinned watchdog witness composition needed by later C4;
- no private bytes, signer, pathname selector, signing opcode, network surface, raw database write, new database object, role, grant, migration, public CLI, or product runtime-start ABI expansion.

Task 0 must receive two immutable identifiers: the independently approved v13 authority ref and the independently reviewed `FIX09_C35_REVIEWED_REF`. The C3.5 receipt must cite the exact v13 ref and prove its source/build/binary/profile-map and session capability facts. Documentation text, v12's rejected ref, an ephemeral test helper, or a short-lived preparer is insufficient.

If v13 is absent, not independently PASSed, changes the single-root topology or migration `0064`, lacks one of the six real-parent seams, or leaves any v12 P1 unresolved, FIX-10 C0 is exact `FIX10_C35_SIGNER_BARRIER_UNAVAILABLE` and stops before a source or test edit.

## 3. One logical session, one parent signer, one custody child

For each exact slot

~~~text
[api_occurrence, runner_occurrence, scheduler_occurrence,
 daemon_action, obsctl_action, watchdog_witness]
~~~

there is one logical `PinnedSignerSession` with exactly:

1. the V-launched real signing parent from v5, running under the inventory principal and retaining the v5 inherited V barrier descriptor; and
2. one non-setuid native descriptor-custodian child created by that parent before readiness.

The child has the same real and effective UID as the parent, and inherits the same primary GID and supplementary-group projection. The parent and child must each prove the inventory UID/GID and `ruid == euid` before a private open. All numeric identities and group membership are required V-later inventory/deployment inputs with no default. A different UID, effective-ID transition, setuid/setgid bit, extra child, restarted child inside the same session, or child shared between parents refuses.

The parent owns the session's sole Ed25519 private `KeyObject`. It alone signs the v5 readiness attestation, v5 commit check, later row or witness records, and any existing parent-side protocol signature. The child never creates a `KeyObject`, derives a signature, accepts data to sign, or receives a signing result. It retains only the already-open read-only private-leaf descriptor and nonsecret metadata after startup.

The v5 wire `pid` remains the positive PID of the V-launched signing parent. V binds its launcher result to that field. The custody child PID is diagnostic process state only: it is not an attestation identity, a seventh signer, an inventory slot, an authorization subject, or a release principal.

This child is not a general sidecar exception. It is an inseparable implementation member of one parent `PinnedSignerSession`. No daemon, socket, listening fd, service discovery, pathname request, cross-parent reuse, private-key export, signer export, or signing endpoint is permitted.

## 4. Closed descriptor-custodian protocol

### 4.1 Launch and profile selection

The parent validates the activation-pinned installed helper before spawn. It securely opens the already-authorized `OBS_CONTROL_DIR` as a no-follow directory descriptor and creates two anonymous unidirectional pipes: parent-to-child control and child-to-parent response. Spawn uses `shell:false`, an empty environment, no stdin, no inherited network descriptor, fixed inherited root/control/response descriptor positions, captured stderr, and exactly one closed six-value profile token. No control-root string, leaf path, relative path, absolute path, arbitrary filename, shell word, dynamic-library search input, or signing payload crosses the child boundary.

The child's compile-time table is exactly:

| Profile | Identity source | Internally constructed private leaf |
|---|---|---|
| `api_occurrence` | V-signed inventory value, equal to that parent's present `OBS_WRITER_IDENTITY` | `chain/private/<API_WRITER_IDENTITY>.pk8` |
| `runner_occurrence` | V-signed inventory value, equal to that parent's present `OBS_WRITER_IDENTITY` | `chain/private/<RUNNER_WRITER_IDENTITY>.pk8` |
| `scheduler_occurrence` | V-signed inventory value, equal to that parent's present `OBS_WRITER_IDENTITY` | `chain/private/<SCHEDULER_WRITER_IDENTITY>.pk8` |
| `daemon_action` | literal `fixagent-daemon` | `chain/private/fixagent-daemon.pk8` |
| `obsctl_action` | literal `obsctl` | `chain/private/obsctl.pk8` |
| `watchdog_witness` | JSON null | `keys/watchdog-witness.pk8` |

The existing V-signed v4 inventory is the only runtime mapping source. The parent verifies it, requires all three product identities present, nonempty, safe under the binding FIX-09 identity/path-component grammar, and requires its own product process's present `OBS_WRITER_IDENTITY` to equal the corresponding inventory value. It passes only the closed profile token, the three admitted product identity tokens, and the inventory/profile-map digests in the one bounded startup frame. No product identity has a default. The native child admits identity tokens only in those three fixed table positions, reconstructs all six records and leaves internally, recomputes `profile_map_sha256`, and requires equality with the session binding before it opens the profile-selected leaf. Daemon and obsctl table entries remain their literals; watchdog remains null with its fixed leaf.

Define the profile map as the RFC 8785 bytes of the exact six ordered `{profile,writer_identity,relative_pk8_path}` records above after substituting the three admitted product identities. Its lowercase-hex SHA-256 is `profile_map_sha256`. The existing inventory signature binds every substituted value/path; the v13 activation helper object binds `profile_map_sha256`; readiness and commit signatures bind the completed inventory and activation digests. There is no new inventory schema, database column, or persistent map file.

### 4.2 One read and retained descriptor

The child validates the inherited root descriptor and performs the binding component-by-component `openat`/`fstatat` walk with `O_NOFOLLOW` and `AT_SYMLINK_NOFOLLOW`. It applies every inherited root/ancestor/device/owner/group/write-bit, regular-file, link-count-one, exact `0600`, size, replacement, short-read, and close-error rule. It records the v5 version vector:

~~~text
{dev,ino,uid,gid,mode,nlink,size,mtime_ns,ctime_ns}
~~~

It compares descriptor and pathname state before and after its single bounded read. It emits exactly one length-delimited PKCS#8 startup frame on the anonymous response pipe. The frame contains only the admitted nonempty DER bytes and their observed vector. A zero, oversized, short, duplicate, trailing, malformed, or second private frame is fatal.

The parent reads that frame once, parses exactly one no-trailing-byte Ed25519 PKCS#8 value, constructs exactly one private `KeyObject`, derives the RFC 8410 SPKI/key id, installs that same object in its private signer state, and wipes every transient parent byte buffer in `finally`. The child wipes its read/frame buffers immediately after the one successful pipe write. Neither side reads the leaf again in the session. The child retains the original leaf fd; the parent retains the original `KeyObject`.

A same-inode/same-size replacement before open or during the read is rejected by the inherited version checks. A pathname replacement after the read cannot alter the held descriptor or parent key. The child nevertheless reports any path/descriptor version mismatch at each later CHECK, so parity evidence remains truthful.

### 4.3 Only CHECK and CLOSE after startup

After the one startup frame, the control grammar has exactly:

~~~text
CHECK(readiness)
CHECK(commit)
CHECK(release)
CLOSE_ABORT
CLOSE_RELEASE
~~~

Every command is bound to the current `barrier_id`, 32-byte nonce, slot, `session_id`, activation-manifest digest, inventory digest, and profile-map digest. `CHECK(commit)` also binds the one v5 commit challenge. `CHECK(release)` also binds the exact v5 release record and ordinal. A missing, extra, duplicated, reordered, cross-session, stale, replayed, wrong-phase, or trailing field is a protocol failure.

Each CHECK performs `fstat(leaf_fd)` and `fstatat(parent_dir_fd,leaf_name,AT_SYMLINK_NOFOLLOW)` on the retained and closed internally derived leaf, compares the complete version vector with startup, and returns only the phase, session bindings, profile-map digest, and current nonsecret vector. The parent verifies the response. It then uses its same sole `KeyObject` to sign the unchanged v5 readiness or commit object. No CHECK reads key bytes, loads a key, signs, accepts a message to sign, reads a network fd, or accepts a path.

`CLOSE_ABORT` closes the retained leaf and inherited protocol/root fds, wipes protocol buffers, and exits without enabling the parent's signer. `CLOSE_RELEASE` is admitted only after a successful release CHECK; it closes the same fds, wipes buffers, returns one closed success acknowledgement, and exits zero. Any stderr byte, unexpected stdout/response byte, EOF, signal, crash, timeout, nonzero exit, wrong exit order, malformed frame, extra opcode, or protocol descriptor replacement is session loss.

## 5. Readiness, commit, activation, and release

The v5 readiness and commit-check JSON objects, field order, algorithms, domains, signatures, freshness rules, public authorization checks, and parent PID semantics remain byte-exact. Their `observed` vector is the vector returned by the current child CHECK. Their signatures are produced by the parent-owned `KeyObject`. V verifies them against independently authorized public SPKI bytes exactly as before.

The activation order is now:

1. complete every inherited staging, quiescence, no-open-writer-transaction, inventory, public-authority, helper-build/install, and helper-pin check;
2. launch the exact six signing parents and exactly one custody child inside each parent session;
3. receive one private frame per parent, create one parent `KeyObject`, run `CHECK(readiness)`, and verify all six parent-signed readiness attestations;
4. run `CHECK(commit)`, verify all six parent-signed commit checks and all public/private/helper/profile-map parity, then insert and commit the activation while every parent remains held and every child retains its fd;
5. publish and reopen the byte-identical activation file under the inherited atomic/fsync law; prove database/file/public authority parity while all six parents remain held;
6. run `CHECK(release)` for all six sessions in the binding product-writers → daemon/obsctl → watchdog order;
7. send `CLOSE_RELEASE` in that same order and require all six clean acknowledgements, empty stderr, zero exits, and closed custody fds while every parent still remains in `PREACTIVATION_HOLD`;
8. only after all six custody closes succeed, release the same six parent processes in the same order. Each parent activates the exact `KeyObject` that signed its readiness/commit evidence. No pathname/key reload or replacement parent occurs.

Every failure before the database commit aborts all six sessions, rolls back, publishes no final activation file, and enables no parent. After database commit but before confirmed file parity, session loss yields the existing `CHAIN_BOOTSTRAP_DB_COMMITTED_FILE_PENDING` result and releases nobody. After confirmed file parity but before all six clean custody closes, session loss yields the existing `CHAIN_BOOTSTRAP_DURABILITY_UNKNOWN` result with reason `DESCRIPTOR`, phase `UNKNOWN`, releases nobody, and requires exact-state inspection and fresh-session forward recovery. No new lifecycle outcome is added.

If a failure occurs after all six clean custody closes but during ordered parent release, the durable activation remains authoritative. Already released parents retain their authorized signer; no later parent is released. The failed or unreleased parent follows the inherited cold-start validation before it can write. The result is never described as rollback. Recovery samples a fresh barrier/nonce/session set and creates one fresh child per replacement parent; it never reuses an attestation, helper, fd, or session.

## 6. Helper source, build, install, and activation pins

FIX-09 v13 must retain the v12 source path `packages/obs-capture/native/fix09-openat-read.c`, private wrapper `packages/obs-capture/src/chain/private-key-helper.ts`, signer owner `packages/obs-capture/src/chain/signer.ts`, installed leaf `${OBS_CONTROL_DIR}/chain/fix09-openat-read`, and mode/owner law `V_OS_UID:OBS_CHAIN_PUBLIC_GID 0550`, regular, one link, non-setuid/setgid, and not group/world writable. FIX-10 creates no second helper or installed path.

The helper is pure Darwin C. Production build authority permits only the selected Xcode `clang`, the selected macOS SDK, Darwin system headers, and `libSystem`. The reviewed recipe must pin the absolute compiler path and version bytes, SDK identity, target triple, required deployment target, all compile/link flags in order, source bytes/hash, compile-time profile-table bytes/hash, and output mode. It must use no Node headers, Node ABI, node-gyp, package download, third-party/static library, framework, plug-in, dynamic lookup path, shell-generated source, or network API.

Two fresh mode-0700 build roots with identical admitted inputs must produce byte-identical Mach-O output and the same lowercase-hex SHA-256. The receipt must prove a deterministic-link setting, no build-root/debug/source-path drift, the exact load-command/dependency projection, and only `/usr/lib/libSystem.B.dylib` as an external runtime dependency. Any differing byte, tool/SDK/flag/source/profile-table drift, unexpected symbol/dependency/load command, or network/Node reference refuses installation.

Only V may install. The existing v12 installed leaf is written to a same-directory exclusive temporary regular file, fully written, set to the exact V/group/0550 metadata, fsynced, atomically renamed, parent-directory fsynced, and reopened no-follow. V rechecks owner/group/mode/type/link/device/inode/size and binary SHA-256. V13 must replace v12's smaller helper value with the exact closed build receipt and activation value below.

The two-build receipt is a closed RFC 8785 object with exactly:

~~~json
{
  "schema":"obs-chain-private-key-helper-build/v1",
  "source_sha256":"<64 lowercase hex>",
  "profile_table_sha256":"<64 lowercase hex>",
  "compiler_path":"<V-selected absolute Xcode clang path>",
  "compiler_version_sha256":"<64 lowercase hex>",
  "sdk_path":"<V-selected absolute macOS SDK path>",
  "sdk_identity_sha256":"<64 lowercase hex>",
  "target_triple":"<required V value>",
  "deployment_target":"<required V value>",
  "ordered_argv_sha256":"<64 lowercase hex>",
  "build_one_sha256":"<64 lowercase hex>",
  "build_two_sha256":"<same 64 lowercase hex>",
  "macho_projection_sha256":"<64 lowercase hex>",
  "external_dependencies":["/usr/lib/libSystem.B.dylib"]
}
~~~

Its SHA-256 is over those canonical completed bytes. The v13 completed activation's `private_key_helper` value must be a closed object with exactly:

~~~json
{
  "schema":"obs-chain-private-key-helper/v2",
  "relative_path":"chain/fix09-openat-read",
  "source_path":"packages/obs-capture/native/fix09-openat-read.c",
  "source_sha256":"<same source hash>",
  "profile_table_sha256":"<same table hash>",
  "profile_map_sha256":"<derived map hash>",
  "build_receipt_sha256":"<completed two-build receipt hash>",
  "installed_binary_sha256":"<same build output hash>",
  "installed_binary_size":"<positive decimal>",
  "owner_uid":"<V_OS_UID decimal>",
  "group_gid":"<OBS_CHAIN_PUBLIC_GID decimal>",
  "device":"<canonical nonnegative decimal>",
  "inode":"<canonical nonnegative decimal>",
  "mode":"0550",
  "nlink":"1"
}
~~~

Extra, missing, reordered, wrongly typed, noncanonical, or unequal member values refuse. The activation signature therefore pins the source, build, binary, installed descriptor, compile-time table, and inventory-derived runtime profile map without a new file or database field. Runtime code cannot repin any field.

All concrete compiler/SDK/deployment-target paths or versions, production UID/GID/group membership, product identities, root/device/inode, and installed artifact values are required V-later inputs. There is no production default. Non-live tests use explicit temporary values and ephemeral binaries only.

## 7. Source and package boundary

The future v13 reviewed seam is owned by `packages/obs-capture/native/fix09-openat-read.c`, `packages/obs-capture/src/chain/private-key-helper.ts`, and `packages/obs-capture/src/chain/signer.ts`. It must preserve the closed `@debateai/obs-capture/chain` gateway, transaction, and signer-preparation responsibilities, the existing `CaptureRuntimeStartOptions` shape, and product entry-point ownership. It may expose only one opaque nonserializable pinned-session capability needed to run readiness/commit/release and privately activate the same parent signer. That capability has no sign method, key getter/export, pathname selector, arbitrary profile, raw descriptor transfer, or cross-process transport.

FIX-10 later composes the reviewed capability only in its already-authorized `tools/obs-listener/src/obsctl/signer-readiness.ts`, `signer-inventory.ts`, `chain-bootstrap.ts`, and `lifecycle-executor.ts` paths. Product API/runner/scheduler composition remains FIX-09 v13/C3.5-owned. Watchdog composition remains FIX-09-owned and C4-gated. `tools/obs-listener/package.json` retains one public `obsctl` bin; `bin/obsctl.mjs` imports only compiled CLI output. FIX-10 adds no helper source, package export, public command, native dependency, install script, service, or product edit.

## 8. Tests, rollback, review, and STOP

In addition to every v2-v5 case and mutant, capture-first non-live tests must prove:

- for all six slots, the parent uses the same sole `KeyObject` for readiness, commit, and its first row/witness signature, while its one child retains the same opened leaf fd through release CHECK;
- exactly one bounded private frame, no second read/load, parent and child buffer wiping, retained-fd metadata checks, and parent PID wire identity;
- EOF, crash, signal, stderr, timeout, duplicate/trailing frame, extra opcode, path input, signing opcode, second child, child replacement, wrong UID/profile/map, and child-as-release-principal refusal;
- all three product `OBS_WRITER_IDENTITY` values are present and equal to V-signed inventory; daemon/obsctl literals and watchdog null/path are exact;
- same-inode/same-size replacement before open, during read, after readiness, and before activation; retained-descriptor survival after pathname replacement; no reload at commit/release/first write;
- exact activation/helper source/build/binary/install/profile-map pins, byte-identical two-build receipt, libSystem-only dependency, no Node/network surface, and V-only install;
- zero commit/publication on every precommit session failure; truthful postcommit pending/unknown result; all-six clean CHECK/CLOSE before ordered parent activation.

Before activation, rollback removes only future reviewed FIX-10 implementation commits and explicit temporary fixtures. It does not remove or rewrite the separately reviewed FIX-09 helper authority/implementation. After activation commit, inherited forward recovery governs; no row, activation, keyring, outbox, or journal history is deleted, reset, rewritten, or re-signed.

A fresh independent review must bind the exact v6 commit/tree/diff and contain each exact standalone result once:

~~~text
AUTHORITY FIDELITY VERDICT: PASS
SPEC VERDICT: SPEC PASS
PLAN VERDICT: PLAN PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 IMPLEMENTATION AUTHORIZED: NO
~~~

Even a v6 PASS authorizes no implementation. STOP on an absent or unreviewed FIX-09 v13 authority/ref; absent reviewed C3.5 implementation seam; short-lived child; child-owned signer; second key read/load; signing/path/network opcode; private-key/signer export; missing profile-map/build/install pin; product identity default or mismatch; different helper UID; extra child; helper or parent replacement; parent PID drift; release before durable parity and all six clean closes; false rollback; new root/helper path/public bin/migration/role/grant/raw DML/product edit; production default; live act; changed frozen v1-v5 byte; or any surviving inherited/new mutant.
