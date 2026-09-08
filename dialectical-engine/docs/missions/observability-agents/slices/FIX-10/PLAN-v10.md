# FIX-10 Exact C3.5 Admission and Local C0/C1/C2 Plan

> **For agentic workers:** Execute this plan task-by-task with TDD. Do not
> dispatch reviewers or subagents while the user's review hold is active.

**Goal:** Replace only FIX-10 v9's stale future-v13/reviewed-C3.5 prerequisite
with the exact implemented FIX-09 v25/C3.5 evidence, then implement the
inherited v9 behavior through locally executable C0/C1/C2 milestones.

**Architecture:** `SPEC-v10.md` incorporates v2-v9. The implementation consumes
the frozen FIX-09 chain package at `7a9765ef...`; local commands use one secure
filesystem control plane and signed append-only histories; status alone reaches
the generation-scoped FIX-09 delivery adapter and action gateway; six opaque
parent signer sessions are coordinated without exporting keys or raw clients.

**Spec:** `docs/missions/observability-agents/slices/FIX-10/SPEC-v10.md`

## Global constraints

- Freeze every FIX-10 SPEC/PLAN v1-v9 byte and every prior decision row.
- Start from exact commit `7a9765efad4d639ac042179f626573f49efc9784`
  and require its tree `948b8de0588bf7de7935a608cfcbd99a11fea002`.
- Bind the v9 authority/review and C3.5 identities from SPEC-v10 §§1-2 before
  any product source or test edit.
- Preserve v9's 15-file/426-name capture projection. V10 adds no reporter name;
  its dependency substitution is tested inside the existing authority-gate
  name `accepts_exact_v9_authority_review` as an additional exact subcase.
- Use TDD for every production behavior. Capture a named RED against the real
  production entry, then implement the smallest GREEN change and refactor only
  under GREEN.
- No source or test outside the inherited v3-v9 closed ledger is editable.
- No production input default, private fixture, live root/database/process,
  migration application, native install, C4, review, merge, push, board, or V
  act is authorized.

## Task 0 — exact local admission

**Files:**

- Modify `tests/unit/fix10-authority-gate.test.ts`.
- Create `tests/unit/fixtures/fix10-gate-manifest.json` only when the capture
  gate is implemented.
- Create ignored report
  `../.superpowers/sdd/PLAN-FixAgent/fix10-c012-v10-implementation-report.md`.

1. Assert the v9 commit/tree/docs/review bindings and all frozen predecessor
   bytes.
2. Assert `FIX09_C35_IMPLEMENTED_REF` equals
   `7a9765efad4d639ac042179f626573f49efc9784`, its tree/parent equal SPEC-v10,
   and `d0c578...` plus `a539ba...` are ancestors.
3. Assert all nine dependency blobs/hashes in SPEC-v10 §2 and the C3.5 report
   hash, 16/118 summary, and reporter-name digest.
4. Reject any substitution labeled reviewed, any missing/changed pin, an
   already-called C3.5 obsctl composition, or a public watchdog row profile.
5. Record the review hold and development-only authorization. Do not synthesize
   a C3.5 review or unlock C4.

## Task 1 — capture gate and exact corpus

**Files:** `tools/fix10-capture-gate.mjs`,
`tests/unit/fix10-capture-gate.test.ts`, and
`tests/unit/fixtures/fix10-gate-manifest.json`.

Implement the v9 exact 15-file/426-name manifest and capture-first runner.
Reject no-match, zero-test, wrong file/name/order/count/status, skip/todo,
duplicate, truncated JSON, pre-existing evidence output, and nonzero child.
Capture raw argv/cwd/environment/start/end/stdout/stderr/exit before asserting.

## Task 2 — C1 secure local foundation

**Production files:** inherited `tools/obs-listener/src/control/**` and
`tools/obs-listener/src/obsctl/{config,control-root,lock,armed-token,authority-proof,proof-gap-window,local-history,action-wire}.ts`.

**Tests:** authority-crypto, proof-gap-window, control-root,
principal-boundary, and local-history files from the v9 manifest.

Implement:

1. exact required configuration and principal/timing validation with no default;
2. trusted-root, fixed-descendant, no-follow, metadata, total-I/O, atomic replace,
   marker, append, fsync, and read-only witness primitives;
3. exact ARMED HMAC bytes/freshness and proof v2 signature/runtime/canary/gap
   predicates;
4. checked `W=P+2R+S+F`, `Q=W+S`, source-complete gap query, and status fields;
5. SPKI-derived local signing-key identity, action ref, outbox v3, V journal v3,
   permanent partial-tail refusal, and pending-intent derivation; and
6. exact deeply frozen null-prototype action payload/input with evidence-only
   RFC8785 bytes and permanent `local_outcome:null`.

## Task 3 — C1 DB-free commands and local status

**Production files:** inherited
`tools/obs-listener/src/obsctl/{kill,arm,status,cli}.ts`.

**Tests:** `tests/integration/fix10-commands.test.ts` and
`tests/integration/fix10-status.test.ts`.

Implement v3-v5 order and outcomes. Kill attempts durable intent, then
CAPTURE_OFF, then KILL even when audit fails, and never rolls back a safety
marker. Arm authenticates before intent, publishes a fresh ARMED token, removes
CAPTURE_OFF before KILL, and recreates both markers capture-first after any
later failure. Kill/arm import graphs contain no DB, row signer, gateway, or
lifecycle edge. Local status preserves FIX-07 switch truth, all seven authority
states, forced-OFF mutation/quick-arm, and canonical filesystem fallback wire.

## Task 4 — C0/C2 signer and lifecycle composition

**Production files:** inherited
`tools/obs-listener/src/obsctl/{signer-inventory,signer-readiness,chain-keyring,chain-activation,chain-bootstrap,chain-rotation,lifecycle-audit,lifecycle-executor,lifecycle-entry}.ts`.

**Tests:** signer-readiness, chain-lifecycle, principal-boundary, and boundary
files from the v9 manifest.

1. Perform the first `obsctl_action` call to the dormant
   `prepareChainedWriterSigner("obsctl_action")` capability. Compose the four
   existing live writer sessions and the private non-live watchdog seam only
   through injected opaque adapters; do not start product or watchdog work.
2. Verify completed signed inventory bytes, v8 inventory digest/receipt,
   six-slot profile map, helper-v4 pins, v9 wipe formulas, and all frozen v7
   owner/frame/build/deployment laws.
3. Coordinate readiness, one commit check, durable activation parity, release
   CHECK/CLOSE, and ordered parent release through opaque `PinnedSignerSession`
   values. Never expose a signer/key/fd/path selector.
4. Implement split-principal lifecycle audit/executor, exact outbox and
   `COMMAND_INTENT` before any effect, keyring-first rotation/recovery,
   DB-first/file-second bootstrap, partial-state truth, and forward-only retry.
5. Exercise only explicit temporary inputs, ephemeral keys/helpers, and
   abstract/disposable database adapters. Do not build or install production
   helper bytes or apply migration `0064`.

## Task 5 — C2 status reconciliation and daemon control

**Production files:** inherited
`tools/obs-listener/src/obsctl/{reconcile,status-entry}.ts` and
`tools/obs-listener/src/daemon/{main,authority-proof}.ts`.

**Tests:** reconcile, daemon-control, status, and product-invariance files.

Status obtains one generation-scoped
`@debateai/obs-capture/chain/fixagent-delivery` adapter, verifies
`current_user=debateai_obs_listener`, and replays pending intents in sequence.
Each database action passes the materialized object to the reviewed action
gateway through the adapter-owned transaction capability. Commit precedes the
local receipt; unknown commit preserves the original action ref and exact
semantics. No raw action DML or generic query/client escapes the adapter.

Daemon integration samples local KILL/root state before database connection,
before intake, between work units, and from the independent executor timer.
Local abort precedes optional lease release and never waits for database
recovery. Positive proof publication requires every inherited conjunct and is
not a live READY claim before C4/V evidence.

## Task 6 — package, CLI, architecture, and completion

**Production/package files:** inherited `tools/obs-listener/package.json`,
`tools/obs-listener/tsconfig.json`, `tools/obs-listener/bin/obsctl.mjs`, root
`package.json`, and `pnpm-lock.yaml`.

Expose one private-package `obsctl` bin. Parse the command before dynamic
imports; kill/arm load local modules only, status loads its database adapter,
and lifecycle loads only the V executor adapter. Add no published package,
second bin, install hook, or native build hook.

Run each focused cluster while developing, then three fresh complete v9 gates.
Each complete run must report exactly 15 files, 426 tests, 426 passed, zero
failed/skipped/todo, with the exact ordered names. Also run package build,
repository typecheck, architecture/source audits, import-graph/raw-DML/private-
material/migration/frozen-byte checks, and `git diff --check`. Classify inherited
repository errors separately; no new FIX-10 error may remain.

Commit cohesive milestones. Update the ignored implementation report and the
explicit Claude handoff ledger. Stop after locally complete C0/C1/C2 evidence.
Do not request review and do not claim C4, production acceptance, merge, push,
board, or Done.

## Exact source boundary

The editable source/package surface is exactly the union printed in inherited
SPEC-v3 §13 and SPEC-v4 §7, plus the v5-v9 narrowing. It includes only:

~~~text
package.json
pnpm-lock.yaml
tools/fix10-capture-gate.mjs
tools/obs-listener/package.json
tools/obs-listener/tsconfig.json
tools/obs-listener/bin/obsctl.mjs
tools/obs-listener/src/control/types.ts
tools/obs-listener/src/control/fix07-switch-mirror.ts
tools/obs-listener/src/control/reader.ts
tools/obs-listener/src/daemon/main.ts
tools/obs-listener/src/daemon/authority-proof.ts
tools/obs-listener/src/obsctl/action-wire.ts
tools/obs-listener/src/obsctl/arm.ts
tools/obs-listener/src/obsctl/armed-token.ts
tools/obs-listener/src/obsctl/authority-proof.ts
tools/obs-listener/src/obsctl/chain-activation.ts
tools/obs-listener/src/obsctl/chain-bootstrap.ts
tools/obs-listener/src/obsctl/chain-keyring.ts
tools/obs-listener/src/obsctl/chain-rotation.ts
tools/obs-listener/src/obsctl/cli.ts
tools/obs-listener/src/obsctl/config.ts
tools/obs-listener/src/obsctl/control-root.ts
tools/obs-listener/src/obsctl/kill.ts
tools/obs-listener/src/obsctl/lifecycle-audit.ts
tools/obs-listener/src/obsctl/lifecycle-entry.ts
tools/obs-listener/src/obsctl/lifecycle-executor.ts
tools/obs-listener/src/obsctl/local-history.ts
tools/obs-listener/src/obsctl/lock.ts
tools/obs-listener/src/obsctl/proof-gap-window.ts
tools/obs-listener/src/obsctl/reconcile.ts
tools/obs-listener/src/obsctl/signer-inventory.ts
tools/obs-listener/src/obsctl/signer-readiness.ts
tools/obs-listener/src/obsctl/status.ts
tools/obs-listener/src/obsctl/status-entry.ts
tools/obs-listener/src/obsctl/types.ts
tests/fixtures/fix10-principal-probe.mjs
tests/unit/fix10-*.test.ts
tests/integration/fix10-*.test.ts
tests/architecture/fix10-*.test.ts
tests/unit/fixtures/fix10-gate-manifest.json
~~~

Anything else is read-only. The frozen FIX-09 package, migration, native helper,
verifier, chain implementation, product entry points, and C3.5 tests are not
edited by FIX-10.
