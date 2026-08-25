# T1 Rework9 exclusive gate — Router execution contract

These artifacts are static author output. They were not bootstrapped or executed
in the Codex author lane. The later Router invokes only
`T1-rework9-gate-launcher.mjs`, passing one fresh immutable execution packet
under this directory. The launcher takes the global lock before creating a run
receipt or inspecting processes.

The execution packet supplies a lowercase UUID `run_id`, ticket, exact absolute
`cwd`, `head`, exact `argv`, expected counts `1` and `56`, the twelve governed
`path/sha256/size/mtime_ms` tuples, exact authorization and final packet tuples,
the exact static `launcher`, `controller`, `worker`, `controller_plist_template`,
`worker_plist_template`, and `viewer` tuples, precomputed hashes for both rendered
plists, and an explicit `allowed_postgresql_baseline` array. It is itself hashed
into immutable `owner.json`.

The global lock is exactly:

`docs/missions/2026-08-17-accounts-privacy-security/logs/.T1-full-registration.exclusive.lock`

No artifact reclaims that lock. The viewer is read-only. A stale heartbeat,
inactive label, raw status, or absent lock is never completion authority; Router
waits for matching `terminal.json` and `release.json`.

`launchctl bootstrap` for any controller, worker, or runtime probe is a Router
operation that must be invoked outside the Codex sandbox with explicit
unsandboxed/escalated authority. The sandbox-originated launch for run
`586303c8-f8de-4118-b888-9730abf902be` is not evidence that the frozen Hermes
runtime is unusable: independent unsandboxed one-shot probes executed both that
runtime and the Codex-bundled runtime successfully. No runtime substitution is
authorized by that incident.

The controller and worker launchd plists use `/bin/zsh` as their direct system
Program. Their argv prefix is exactly `-c`, `exec "$@"`, and the inert positional
`$0` value `t1-gate-launchd-wrapper`; the frozen Node path, script path, receipt,
execution packet, and secret path follow as separate positional arguments. No
secret or path is interpolated into shell source. `exec` replaces the wrapper in
the existing launchd process group, and no session or process group is added.
WorkingDirectory, environment, stream paths, ProcessType, AbandonProcessGroup,
RunAtLoad, KeepAlive, and controller throttling retain their prior semantics,
except for the Rework6 launchd stream custody boundary described below.
The controller loads the identically wrapped worker plist during its existing
worker-bootstrap phase.

The Terminal viewer passes its own stdin through to `/usr/bin/tty`, captures only
tty stdout, and inherits tty stderr. It still requires `/dev/*` before creating
`viewer.ready.json`; all challenge, readiness, display-only, and tail rules are
unchanged.

## One-time NEVER_STARTED recovery

Normal completion and release rules above remain unchanged. There is exactly one
narrow exception for the preserved run
`586303c8-f8de-4118-b888-9730abf902be`: after Grok approval, Router may invoke
`T1-rework9-rework3-never-started-recovery.mjs` once, outside the sandbox, with
the sole argument `T1-rework9-rework3-never-started-authority.json`. This is not
controller recovery, test execution, normal release, or authority for another
run.

The tool must fail closed unless it can prove the exact execution-packet hash,
run ID, receipt and lock paths, owner/claim/token/device/inode custody, immutable
failure evidence, HEAD, empty staged index, all twelve governed size/hash/mtime
tuples, six zero-byte streams, absence of every worker/controller/test terminal
artifact, exact absence of both launchd labels, and absence of unexplained heavy
processes. Any partial, denied, EPERM, UNKNOWN, or otherwise inconclusive
process/launchctl scan forbids recovery.

After all guards pass, the tool writes and fsyncs immutable
`never-started-recovery-intent.json` before its sole state transition. It then
atomically renames the entire live lock directory to
`never-started-archived-lock` inside the old receipt, preserving the directory
and `claim.json` device/inode identity and never unlinking them. Finally it writes
immutable `never-started-recovery.json`, binding the intent, pre/post custody,
and archived lock hash/stat evidence. Pre-existing intent, marker, or archive—or
an absent live lock—fails closed; this authority cannot be reused.

Before that one-time recovery, Router may validate launchd execution only with
the run-bound `T1-rework9-rework3-runtime-probe.plist.template`, also invoked
outside the sandbox. It is bound to `/Users/vladmihaimiron/.hermes/node/bin/node`
and may create only its fresh `0700` private runtime-probe directory and exclusive
`0600` `ok` sentinel. It carries no worker, controller, test, recovery, or
new-run authority. Its directory custody compares the created leaf against that
leaf joined to the canonical realpath of its parent. This accepts macOS's
`/var/folders` to `/private/var/folders` parent mapping while still rejecting a
symlinked leaf, alternate leaf, ownership mismatch, or mode mismatch.

## Second one-time NEVER_STARTED recovery

The fresh run `e3aa3d5e-85eb-46b4-8c5a-c35a9461cb16` has its own non-reusable
authority, `T1-rework9-rework5-never-started-authority.json`, and tool,
`T1-rework9-rework5-never-started-recovery.mjs`. This authority is independent
of the earlier 586303c8 recovery and applies only while the e3aa receipt has six
zero-byte streams and no viewer-ready, worker-bootstrap, heartbeat, controller
epoch, worker terminal, test status, terminal, release, prior recovery intent,
marker, or archive.

After Grok approval, Router may invoke that tool exactly once outside the
sandbox. It reuses the approved immutable recovery core and must independently
prove the exact packet/owner/claim/token/device/inodes, receipt evidence, HEAD,
empty index, twelve governed tuples, absent controller and worker labels, and no
unexplained heavy or exact supervisor/viewer process. UNKNOWN, partial, denied,
or EPERM process/launchd inspection fails closed. It writes immutable intent,
atomically renames the entire lock directory into the exact e3aa receipt, proves
the directory and claim inodes/hash survived, and writes an immutable recovery
receipt. It never bootstraps, executes, unlinks, or authorizes another run.

Any later normal run requires a new UUID execution packet binding the corrected
controller/worker template and viewer tuples plus freshly precomputed rendered
plist hashes. Recovery authority is not new-run authority.

## Rework6 launchd stream custody and third NEVER_STARTED recovery

Run `15c9c6c5-3ca3-4e68-9fb9-587d8e19309f` is a supervisor-only
`NEVER_STARTED` incident. The visible viewer completed its challenge, but no
controller epoch, heartbeat, worker-bootstrap request, worker/test terminal, or
normal terminal/release exists and all six durable streams are zero bytes.
Router's read-only unified-log evidence repeatedly showed xpcproxy denied by
`kTCCServiceSystemPolicyDocumentsFolder` while launchd attempted to open the
pre-created Documents-folder `controller.stdout.log`; launchd reported last exit
78. That mutable log is diagnostic cause evidence, never present-state recovery
authority. The immutable run-bound evidence is
`T1-rework9-rework6-never-started-failure-evidence.json`.

Future packets must bind `T1-rework9-launchd-stream-custody.mjs` in addition to
the existing supervisor artifacts. After taking the lock and exclusively
creating the UUID-bound `0700` private runtime directory, the launcher
exclusively creates four `0600` controller/worker launchd streams there. The
rendered controller and worker plists use only those private paths for
`StandardOutPath` and `StandardErrorPath`; launchd/xpcproxy never opens a
pre-created receipt or other Documents-folder stream. The launcher still
exclusively creates the durable test stdout/stderr files in the receipt for the
worker and viewer, but it does not pre-create the four durable
controller/worker receipt logs.

`owner.json` binds the exact private-to-durable mapping. After the worker label
is proven absent, the controller fsyncs but does not raw-close its own redirected
Node stdio descriptors, then the bound custody helper copies all four stable private streams to their
fixed receipt paths using exclusive temporary files, fsync, hash/size equality,
and atomic rename. Pre-existing identical receipt copies are accepted only for
an exact recovery epoch; any mutation, path/parent deviation, symlink, owner,
group, mode, size, hash, or source-stability mismatch fails closed with the lock
held. Immutable `launchd-streams.json` binds both source and receipt tuples. No
controller path writes fd 1 or fd 2 after the seal begins. The helper revalidates
the still-open private source and durable receipt tuples after sealing, before
terminal creation, and immediately before release; the operating system closes
the descriptors safely during ordinary process exit.

The authority order is strict: worker label absence; controller fd 1/2 fsync;
all four stream copies and immutable stream receipt; current epoch postflight;
canonical postflight; terminal; ownership revalidation; release. Postflight,
terminal, and release each bind the same `launchd-streams.json` hash, and release
rehashes it immediately before touching the lock. Test stdout/stderr are already
fsynced before `worker-terminal.json`, so controller, worker, and test logs are
all durable before terminal/release authority.

If a worker never executes, the controller's existing five-sample absent-label
path classifies `INTERRUPTED`, seals the private worker diagnostic streams, and
continues through the same postflight/terminal/release gates. If a controller
never executes, no ordinary terminal or release is possible: the lock remains
held and only a separately reviewed, run-bound NEVER_STARTED recovery may use
the same custody helper to seal any private launchd streams before archiving the
lock. The current 15c9 incident predates private launchd streams, so its exact
one-time recovery instead preserves its six already-durable zero-byte streams
and exact private secret state as old-contract evidence.

After Grok Rework6 approval, Router may invoke
`T1-rework9-rework6-never-started-recovery.mjs` once outside the sandbox with
the sole argument `T1-rework9-rework6-never-started-authority.json`. It must
independently prove the exact packet, owner, claim/token/device/inodes, viewer
receipt, zero streams, absent lifecycle entries, exact controller/worker label
absence, current private-directory contents, HEAD, empty index, twelve governed
tuples, and absence of unexplained heavy or controller/worker/launcher process.
The display-only viewer is not release authority and may be recorded without
authorizing work. Any UNKNOWN, denied, partial, EPERM, mismatch, pre-existing
intent/marker/archive, or changed private state fails closed. The tool writes
immutable intent, atomically archives the whole lock directory with claim inode
preservation, and writes an immutable marker; it never bootstraps, bootouts,
tests, deletes the lock, or grants new-run authority.

No new runtime probe is required for Rework6: the repeated failure is the
Documents stream-open boundary, and the earlier harmless probes already proved
the runtime/system-wrapper execution path. After recovery, a fresh UUID packet
must precompute both plist hashes using the exact runtime and four new
UUID-private launchd stream paths before the single exclusive gate is launched.

## Rework7 pinned test entrypoint and interrupted recovery

Run `7821bdb5-0559-43f4-804e-6996bb9f18a4` crossed the controller, viewer,
worker, and private-stream boundaries, but it did not load a Vitest module or a
test. Its immutable worker terminal records raw status 127, null parsed counts,
zero stdout bytes, and 119 stderr bytes containing the exact `.bin/vitest`
shell-shim failure `exec: node: not found`. launchd supplied only its default
system PATH, so invoking the package-manager shim was not an execution contract.
The controller sealed all four launchd streams, then raw-closing fd 1 and fd 2
before a synchronous custody subprocess caused SIGABRT; launchd consequently
created recovery epochs 2 through 5 before Router booted out the exact label.

Every future execution packet and owner must bind the exact pinned runtime
`/Users/vladmihaimiron/.hermes/node/bin/node`, the package-link custody, and the
canonical Vitest JavaScript entrypoint described by Rework8 below. Test argv is
exactly the pinned runtime, that canonical entrypoint, `run`, and
`tests/integration/registration-database.test.ts`; `.bin/vitest`, bare `node`,
PATH lookup, environment-based runtime selection, and alternative test args are
forbidden. The launcher verifies every binding, exact argv, HEAD, index, twelve
governed tuples, and counts before bootstrap and binds them into `owner.json`.
The worker independently remeasures the link and target, compares owner and
packet bindings and argv, and directly spawns the pinned runtime with the bound
canonical JS entrypoint and two test args in the existing non-detached process
group.

The crash-free finalization rule is the Rework6 rule as corrected above: fsync
redirected fd 1/2 without raw close, perform no later stdio writes, seal all four
private streams, and revalidate both source and durable tuples before terminal
and release. A real isolated child fixture must continue to prove that the old
close-then-spawn sequence terminates nonzero/SIGABRT while the stable-open path
exits zero and retains exact post-exit source/durable hashes with strict
seal-before-terminal-before-release bindings.

The live 7821 lock may be recovered only by the separately reviewed one-time
`T1-rework9-rework7-interrupted-recovery.mjs` with the sole argument
`T1-rework9-rework7-interrupted-authority.json`, after Grok Rework7 approval and
outside the sandbox. It must independently prove the exact packet, owner,
claim/token/device/inodes, private directory and five entries, worker raw 127,
exact stderr, null parsed counts, sealed four-stream receipt, five controller
epochs and sixteen ordered events, missing postflight/test-status/terminal/
release, exact label and run-process absence, HEAD, empty index, and twelve
governed tuples. UNKNOWN, partial, denied, EPERM, changed receipt/private bytes,
or a pre-existing intent/marker/archive fails closed. Immutable intent precedes
the sole atomic rename of the entire lock directory into the 7821 receipt; the
tool preserves the lock and claim inodes, writes an immutable marker, and has no
bootstrap, bootout, viewer, worker, test, deletion, or new-run authority.

No harmless runtime probe is required for Rework7. Existing probes already
proved the pinned Node runtime; the observed defect was the unbound shell shim,
and the isolated child fixture exercises the corrected stdio mechanism without
launchd or test execution.

## Rework8 canonical pnpm entrypoint and launcher-abort recovery

Run `302197e8-e713-47f7-9518-9f078eede931` acquired the global lock and created
its receipt plus deterministic private runtime directory, secret, and viewer
challenge. It then failed closed before `owner.json`, preflight, rendered plists,
controller, viewer, worker, or test execution. Its sole receipt file is immutable
`launcher-abort.json`, classification `UNKNOWN_HELD`, with error
`PINNED_TEST_RUNTIME_OR_ENTRYPOINT_MISMATCH`. The old check incorrectly required
the logical `<cwd>/node_modules/vitest/vitest.mjs` path to equal its realpath;
pnpm makes `<cwd>/node_modules/vitest` a symlink into `.pnpm`, so the file bytes
and packet tuple were correct while that equality was necessarily false.

Every later packet and owner must bind both layers. `vitest_package_link` is the
exact lstat/readlink custody of `<cwd>/node_modules/vitest`: logical path, raw
relative link target and its SHA-256, device, inode, size, mtime, and canonical
package-directory realpath. `vitest_entrypoint` binds the logical
`<cwd>/node_modules/vitest/vitest.mjs` path to the exact canonical regular-file
realpath with SHA-256, size, and mtime. The canonical entrypoint must be directly
inside the canonical package directory. The pinned Node path must itself remain
canonical. The exact execution argv uses pinned Node followed by the canonical
entrypoint, `run`, and the one registration test path. No `.bin` shim, PATH,
package-manager command, environment resolution, or runtime substitution is
permitted. Launcher and worker independently lstat/readlink/realpath and rehash
both layers; the controller repeats the same custody during every binding
reverification. Link-target, link-inode, canonical-path, or target-byte drift
fails closed.

The launcher creation order is evidence-bearing: global lock; receipt; UUID
private directory; `controller-custody.secret`; `viewer-challenge`; then pinned
runtime/entrypoint verification. Therefore the 302 private directory is expected
failed-run evidence, not cleanup residue. It remains a canonical UUID path with
mode `0700`, exact device/inode/owner/group, and exactly two regular mode `0600`
files. The secret is exactly two lowercase 64-hex lines, the viewer challenge is
exactly the second line plus newline, and no controller/worker launchd stream
file exists. Recovery must preserve that directory, its files, and all tuples in
place without rename, rewrite, or deletion.

After Grok Rework8 approval, Router may invoke the run-bound
`T1-rework9-rework8-abort-recovery.mjs` once outside the sandbox with sole
argument `T1-rework9-rework8-abort-authority.json`. It must prove the exact
packet and abort hashes/values, receipt containing only the abort, exact empty
lock directory and absent claim, exact preserved two-file private directory,
canonical Node and pnpm link/target custody, HEAD, empty index, all twelve
governed tuples, exact controller/worker label absence, and absence of any
matching supervisor, viewer, test, PostgreSQL, or unexplained heavy process.
UNKNOWN, partial, denied, EPERM, any extra artifact, or any changed tuple fails
closed. Immutable intent precedes the sole atomic rename of the empty lock into
the 302 receipt. The lock inode is preserved; the private directory remains in
place and is reverified after the rename; an immutable marker binds pre/post
custody and archive identity. The tool has no bootstrap, bootout, unlink,
private cleanup, test, or new-run authority.

No harmless probe is required for Rework8. The runtime was already proved; the
failure was a deterministic pnpm logical/canonical path contract error, and the
isolated static fixture exercises both link-target and canonical-target drift.

## Full-gate custody supplement and future process/count parsing

Run `ae9f57fb-bff0-49da-b031-bfd4ff2fbe14` completed the product test with raw
status zero and sealed byte-identical test/worker stdout. Its ANSI-stripped
stdout proves exactly 1/1 test files and 56/56 tests with zero skips. The
historical worker terminal nevertheless records null counts because it parsed
the ANSI-bearing output, and the controller retained the lock as
`UNKNOWN_HELD` because its historical UUID-substring ownership test falsely
classified exactly two lines: the controller itself, whose PID begins at
column zero, and Router's display-only `sed`/`tail` observer. This accepted test
result does not retroactively authorize `terminal.json` or `release.json`.

After the same Grok finder approves the exact recovery artifacts, Router may
invoke `T1-rework9-full-gate-recovery.mjs` once outside the sandbox with the sole
argument `T1-rework9-full-gate-recovery-authority.json`. The tool is bound to the
exact ae9 packet, owner, claim/token/device/inodes, 26-entry receipt tree,
private-runtime tree, raw-zero worker terminal, four sealed launchd streams,
stdout hash `0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f`,
the two historical false-positive lines, HEAD, empty staged index, and all
  twelve governed tuples. It must prove worker-label absence and a stopped,
  exit-zero controller label without a PID. The only accepted stopped-state
  vocabulary is the live Grok-observed `state = not running` or the alternate
  host vocabulary `state = exited`; any other state, nonzero last exit, or
  numeric PID fails closed. It must also prove a complete parseable process
  snapshot containing no unexplained heavy or exact run process. UNKNOWN,
  partial, denied, EPERM, changed bytes, or pre-existing recovery output fails
  closed.

The recovery order is immutable intent, immutable ANSI-stripped count
supplement, complete revalidation, atomic rename of the entire live lock to
`full-gate-custody-archived-lock` inside the ae9 receipt, then immutable recovery
marker. The archive preserves the lock and claim device/inode/hash. The receipt
and private runtime remain in place. The tool never creates normal terminal or
release receipts, rewrites the historical worker terminal, deletes the lock,
executes a supervisor/test, or grants a second run.

Future packets bind `T1-rework9-supervisor-parsers.mjs`. Postflight ownership is
derived only from exact controller/launcher/worker/test argv identities and
their parsed PID ancestry, never from a global run-UUID or temporary-directory
substring. The exact controller PID and argv are parsed and exempt even when the
PID begins at column zero; exact viewer identities and receipt-bound
`/usr/bin/tail` display processes remain exempt. A malformed or partial process
line fails closed. Worker result parsing strips ANSI CSI sequences before
extracting test-file and test counts, while the immutable raw stdout/stderr
hashes and status remain the evidence source.

Every process preflight and postflight uses the same fail-closed heavy-process
predicate. It recognizes path-prefixed `postgres`/`pg_ctl` binaries and
`postgres:` child titles. A matching PostgreSQL line is acceptable only when its
trimmed full snapshot line exactly equals an entry in the frozen execution-packet
baseline; substring or run-ID matches do not exempt it.

Postflight process and launchd snapshots are immutable and epoch-owned as
`process-post-epoch-N.txt` and `launchd-post-epoch-N.txt`. The first complete
green epoch creates immutable canonical `postflight.json`. Recovery epochs write
new epoch-owned snapshots, require their current postflight to be green, and
exactly validate the canonical receipt and its bound snapshot hashes. An existing
terminal receipt is reusable only when its classification, worker result, counts,
raw status, and canonical postflight hash all match. Any mismatch retains the
global lock as `UNKNOWN_HELD`; exact current evidence plus token and lock-inode
verification is required before release.

The run-private temporary directory is deterministically
`join(tmpdir(), "debateai-t1gate-" + run_id)`. The fresh lowercase UUID is the
namespace authority; no random suffix is added. After acquiring the global lock,
the launcher creates that exact path once with mode `0700` and rejects any
pre-existence, symlink/realpath deviation, ownership mismatch, mode mismatch, or
creation failure as `UNKNOWN_HELD`. It never reclaims or reuses the path. Secret
and viewer-challenge files remain exclusive `0600` creations within it.

Before launch, Router computes the controller and worker plist bytes from the
frozen templates, runtime `process.execPath`, exact cwd and execution-packet path,
UUID-derived receipt directory and labels, deterministic temporary/secret path,
frozen controller/worker paths, and deterministic stream paths. Their SHA-256
values are placed in the immutable execution packet. The launcher renders from
the same inputs and must match those packet-authored hashes; it does not create,
replace, or relax the expected hashes after rendering.
