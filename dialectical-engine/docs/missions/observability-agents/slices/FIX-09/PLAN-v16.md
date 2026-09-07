# FIX-09 Independently Replayable Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an independently replayable FIX-09 admission receipt and truthful exact-name gates before any C3.5 implementation.

**Architecture:** SPEC-v16 incorporates v4-v15 and supersedes only v15's cross-invocation whole-transcript equality. Each invocation still obtains an internally byte-stable bounded pair over paper plus all five collision views, retains its raw transcript, and derives the closed security projection from that validated raw. Only ambient unrelated enumeration/content/metadata observations are omitted from cross-invocation equality. Every authority, dependency, program, request, scope, preserved-failure, claim, and collision decision remains bound.

**Tech Stack:** Node.js 22, POSIX filesystem APIs, Git 2.50, pnpm/Vitest JSON reporter, SHA-256, RFC 8785.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v16.md`

## Global Constraints

- SPEC/PLAN v4-v15 and their decision rows are byte-immutable; rejected v12/v13 and stopped v14/v15 evidence remains FAIL/STOP evidence.
- Task 0 and C3.5 are STOP until independent v16 authority review returns zero unresolved P0-P3. Only then may the disposable exact-program shadow replay run; real Task 0 additionally requires that shadow PASS.
- No live root/key/database/migration/quiesce/activation/service/acceptance/merge/push/Done act.
- The failed v10 and v11 artifacts/worktrees, rejected v12/v13 authority evidence, v14 fatal scan/diagnostic, and both v15 real scan transcripts/diagnostic are append-only. Only the future admission-only Task 0 may create the distinct real v16 program/branch/worktree/receipts after review and shadow PASS.
- Migration remains forward-only `migrations/0064_fix09_audit_chain.sql`.
- Every captured command has exact cwd, argv, environment, raw streams, status, and literal authority parser.
- Complete-scan retry is limited to `FIX09_PAPER_UNSTABLE`; every path, symlink, permission, registry, parsing, unreadable-source, security, independent-claim, preserved-state, or collision error fails immediately. Three mismatching pairs fail exactly `FIX09_PAPER_RETRY_EXHAUSTED`.
- Every trace counter is a nonnegative safe integer and the accepted/exhausted/fatal equations inherited from SPEC-v14 §2.3 are executable; invalid traces fail `FIX09_PAPER_TRACE`.
- FIX-10 dependency authority is only approved v9 commit `a539ba114bd80e9234c08ba77c75772d0d111d94` and its exact three documents plus reviewed PASS report; FIX-10 implementation remains unauthorized.
- `CaptureRuntimeStartOptions` and `startCaptureRuntime` retain their inherited exact three-field/function shape. No chain signer option is added there.

---

## V16 cross-invocation liveness

The v15 RED is two separately successful 7,842-byte raw scans with SHA-256 `ef7180f34d8cb1777eba1a67ca2cbb85515b08f87eb6e4a768258c09f0335ac1` and `4952115f6ae814d1767d953f13dfd9af164f84f0d5f8dc4f22ec813427e7905d`. The only changed field was ambient `worktree_evidence_sha256`; the one-shot diagnostic localized unrelated consent-UI Markdown drift, and the registry root set later drifted. V15 stopped without retry or Task 0 identity.

The embedded v16 program implements this closed sequence:

1. `completeSecurityScanOnce(authority)` collects one `fix09-paper/v4` envelope and the reachable-object, reachable-history, ref-tip, worktree-tracked, and worktree-untracked collision views. It validates authority/dependency/program/request/scope, exact two-row preserved policy/live state with two hits, zero independent claims, and all five collision counts zero before returning.
2. `boundedCompleteCollect` applies the inherited exact trace equations and three-pair/six-scan ceiling to the entire transcript. Both scans in an accepted pair are byte-identical. Only a change between individually lawful complete scans restarts; all other errors are immediately fatal.
3. Base t0-039 retains its complete raw canonical JSON transcript in the evidence manifest. Derive, positive candidate validation, and positive result validation each write a distinct exclusive mode-0400 raw transcript. All raw byte lengths and SHA-256 values remain reportable.
4. `securityProjection` is derived only from a fully validated raw transcript. It binds schema/domain, complete/paper schema, full `SCOPE`, actual v16 commit/parent/tree/documents/allow digest, actual program bytes/SHA/blob, exact request, historical pin, full FIX-10 v9 identity, exact preserved policy/live state/hit count, five zero collision counts, and zero independent claims/matches.
5. Fresh positive stages recompute and compare projections byte-for-byte. Ambient root/ref/document/enumeration/content/metadata counts and digests, plus raw zero-hit collision command hashes/lengths, remain sealed in raw evidence but are excluded from cross-invocation equality. Hostile candidate/result mutations reuse the sealed projection digest and perform no full scan.
6. `security-projection-fixtures` proves different raw bytes/hashes with one equal projection and kills exactly twenty-one security mutations. Retry, late metadata, zero-I/O, preserved failure, and hostile-scan separation fixtures remain mandatory.

This is the only v16 semantic change. It adds no exclusion, claim allow, collision waiver, unstable acceptance, or relaxed preserved-state cardinality.

---

## V16 executable C3.5 correction ledger

These are direct corrections to the inherited C3.5 implementation plan; they add no implementation in this authority round.

**Exact source paths**

- Create `packages/obs-capture/native/fix09-openat-read.c`.
- Create `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs` as the sole nonshipping build-evidence verifier.
- Create `packages/obs-capture/src/chain/private-key-helper.ts`.
- Create `packages/obs-capture/src/chain/signer.ts`.
- Create `packages/obs-capture/src/chain/fixagent-delivery.ts`; do not create `transaction.ts`.
- Create or modify inherited `packages/obs-capture/src/chain/canonical.ts`, `unique-json.ts`, `locks.ts`, `occurrence-gateway.ts`, `agent-action-gateway.ts`, and `index.ts` only within their v4-v6 responsibilities.
- Modify `packages/obs-capture/package.json` only to add the exact `./chain` and `./chain/fixagent-delivery` closed exports; add no bin/install/native-build hook.
- Modify `migrations/0064_fix09_audit_chain.sql` and `packages/db/src/obs-schema.ts` only for the inherited additive chain schema plus the one SPEC-v14 private SQL helper/probe law.
- Modify `packages/obs-capture/src/envelope-contract.ts`, `runtime/sink.ts`, and `runtime/drain.ts` only for the exact DIRECT/SPOOL materializer and chained occurrence flow. `runtime/index.ts` may import private prepared-signer state but its public start interface and exact `CaptureRuntimeStartOptions` descriptors must not change.
- Modify `tools/obs-listener/src/daemon/fold.ts`, `poison.ts`, `main.ts`, and `cursor.ts` only to route the generation-scoped adapter through LISTEN/leader/select/BEGIN/delivery lock/load/persist/ACK/cursor/COMMIT/rollback/invalidation.

**Exact public runtime values**

```text
appendChainedOccurrences
appendChainedAgentAction
prepareChainedWriterSigner
```

Only closed types needed to call those three values or inspect the opaque signer session/attestation may also be exported. `prepareChainedWriterSigner` admits the five row-writer profiles; the compile-time inventory has the exact sixth private `watchdog_witness` slot, which the public preparation path rejects. The dedicated delivery subpath exports only its generation factory/adapter and closed typed inputs/results; it exports no pool, client, query, SQL, transaction, lock, or signer primitive. The mapping and V-later identity law are exactly SPEC-v14 §§4-5.

**Exact test ownership**

- `tests/unit/fix09-chain-keys.test.ts`: compile the ephemeral helper; v9 Annex-K/build/wipe-domain evidence; PKCS#8 once; retained-fd CHECK/CLOSE; parent-only KeyObject; opaque session/check/release/abort; exact six profiles; no private escape.
- `tests/unit/fix09-chain-canonical.test.ts`: exact `ChainedOccurrenceInput` descriptor/order/type/copy/freeze/detail and canonical byte controls.
- `tests/integration/fix09-chain-migration.test.ts`: one SQL tag helper, structural tuples, exact cap recursion/boundaries, catalog owner/search-path/volatility/parallel/ACL denial, and no second helper.
- `tests/integration/fix09-chain-occurrence.test.ts`: DIRECT brand, SPOOL normalization, identical materialization, delivery generation, probe/detail/receipt/notification rollback, direct/spool replay.
- `tests/integration/fix09-chain-action.test.ts`: typed delivery work operations, rank/kind/order state, daemon action atomicity, raw/forged/stale/nested/cross-generation capability rejection.
- `tests/integration/fix09-chain-lifecycle.test.ts`: activation helper/source/binary/descriptor parity, signer absence/mismatch, profile/key rotation and fail-closed loss.
- `tests/architecture/fix09-chain-grants.test.ts`: exact private helper/probe ACL and role denial.
- `tests/architecture/fix09-chain-writers.test.ts`: all four existing INSERT sites absent, both gateways exclusive, all conversions inside the authorized source paths, and exact inherited `CaptureRuntimeStartOptions` descriptors plus `startCaptureRuntime` callable type unchanged inside this file's already-pinned reporter.
- `tests/architecture/fix09-chain-privacy.test.ts`: non-signing helper, key bytes, KeyObject, symbols, raw envelope, logs, evidence, fixtures, exports, and watchdog separation.
- `tests/architecture/fix09-fix10-chain-contract.test.ts`: exact authenticated six-profile table, four live writers, deferred `obsctl_action`, private witness profile, v9 build/wipe hashes, C3.5-review → FIX-10 C0 → C4 order.
- `tests/integration/fix09-daemon.test.ts`: one adapter generation owns max-one client across the exact C2 order; no raw transaction/query surface; rollback keeps fold/action/ACK/cursor atomic.

No new test file may be added to the C3.5 projection. These assertions live inside the existing authority reporter names pinned below; changing a reporter name/count/order is a gate failure.

**TDD order**

1. Add the exact RED assertions in the owned test files and capture their expected missing-helper/missing-API or old-raw-SQL failures.
2. Implement the pure-C descriptor custodian and wrapper; compile only ephemeral nonsuid test artifacts. Prove exact six-profile OPEN, one PKCS#8 response, child wipes/retained fds, parent-only KeyObject, CHECK/CLOSE order, v9 deterministic-build/analyzer/artifact hashes, and no sign/path/key/fd export.
3. Implement the opaque `PinnedSignerSession`. Prove parent-signed exact v5 readiness and commit-check objects/domains, child CHECK_READINESS/CHECK_COMMIT/CHECK_RELEASE parity, one commitCheck, mutually exclusive release/abort, v7 CLOSED_ACK/EOF/exit before release returns the same private signer token, different-config rejection, no runtime-start ABI change, and activation fail-closed behavior.
4. Implement the generation-scoped `fixagent-delivery` adapter and `TxState`; kill pool/client/query/SQL escape, forged/stale/nested/cross-generation/rank/kind/order mutants before converting a writer.
5. Implement the exact DIRECT/SPOOL materializer and derived detail; kill symbol/accessor/proxy/extra/missing/order/origin/receipt/cause controls before the gateways consume it.
6. Implement the one SQL tag helper and structurally comparing probes. Prove exact RFC-length boundary/+1 and all escape/nested cases without adding another SQL helper.
7. Convert both occurrence and both daemon action writers plus main/fold/poison/cursor through the typed adapter operations, then run the exact C3.5 projection three clean times and obtain independent review. FIX-10 C0 remains next; C4 files remain forbidden.

**Closed future C3.5 implementation-diff ledger**

The future C3.5 implementation diff may touch exactly the following 33 paths and no others: 22 source/schema/package paths followed by 11 editable test paths. Task 0 pins the 17 exact pre-implementation baseline paths in t0-028; the later C3.5 capture records, in this exact order, each changed path's Git mode, blob, byte length, content SHA-256, and complete UTF-8/LF bytes, and C3.5 review reopens and byte-compares every entry. For native evidence, only the C source and sole verifier/parser are tracked; the authority-fenced generated header exists only in private build roots and is never a repository path. An absent required edit, extra, renamed, reordered, unpinned, or generated-in-repository path is a STOP.

```text
packages/obs-capture/native/fix09-openat-read.c
packages/obs-capture/scripts/verify-fix09-native-wipe.mjs
packages/obs-capture/src/chain/private-key-helper.ts
packages/obs-capture/src/chain/signer.ts
packages/obs-capture/src/chain/fixagent-delivery.ts
packages/obs-capture/src/chain/canonical.ts
packages/obs-capture/src/chain/unique-json.ts
packages/obs-capture/src/chain/locks.ts
packages/obs-capture/src/chain/occurrence-gateway.ts
packages/obs-capture/src/chain/agent-action-gateway.ts
packages/obs-capture/src/chain/index.ts
packages/obs-capture/package.json
migrations/0064_fix09_audit_chain.sql
packages/db/src/obs-schema.ts
packages/obs-capture/src/envelope-contract.ts
packages/obs-capture/src/runtime/sink.ts
packages/obs-capture/src/runtime/drain.ts
packages/obs-capture/src/runtime/index.ts
tools/obs-listener/src/daemon/main.ts
tools/obs-listener/src/daemon/fold.ts
tools/obs-listener/src/daemon/poison.ts
tools/obs-listener/src/daemon/cursor.ts
tests/unit/fix09-chain-canonical.test.ts
tests/unit/fix09-chain-keys.test.ts
tests/integration/fix09-chain-migration.test.ts
tests/integration/fix09-chain-occurrence.test.ts
tests/integration/fix09-chain-action.test.ts
tests/integration/fix09-chain-lifecycle.test.ts
tests/integration/fix09-daemon.test.ts
tests/architecture/fix09-chain-grants.test.ts
tests/architecture/fix09-chain-writers.test.ts
tests/architecture/fix09-chain-privacy.test.ts
tests/architecture/fix09-fix10-chain-contract.test.ts
```

The C3.5 projection's `tests/unit/fix09-capture-gate.test.ts` and the five adjacent tests are immutable inputs, not editable implementation paths. They are run by the gate but must not appear in the C3.5 diff. The other ten projected tests and `tests/integration/fix09-daemon.test.ts` are the exact eleven editable tests above.

**Exact generated header bytes**

The complete generated header is exactly the 1,163 UTF-8/LF bytes inside the following fence plus one final LF, SHA-256 `edab5a0bd5d4e55f3c032fc6ec811071cb0f92b7e21fe5819b8d80bfb9ec7768`. Its fixed basename is `fix09-profile-table.generated.h`. It encodes FIX-10 v7's six semantic identity/leaf rules and contains no product-identity marker. C3.5 copies these admitted bytes unchanged into each private build root; there is no generation, marker replacement, template source file, runtime substitution, or tracked header.

```c
#ifndef FIX09_PROFILE_TABLE_GENERATED_H
#define FIX09_PROFILE_TABLE_GENERATED_H 1
#include <stdint.h>
enum fix09_identity_rule {
  FIX09_IDENTITY_INVENTORY_API = 1,
  FIX09_IDENTITY_INVENTORY_RUNNER = 2,
  FIX09_IDENTITY_INVENTORY_SCHEDULER = 3,
  FIX09_IDENTITY_LITERAL_FIXAGENT_DAEMON = 4,
  FIX09_IDENTITY_LITERAL_OBSCTL = 5,
  FIX09_IDENTITY_JSON_NULL = 6
};
enum fix09_leaf_rule {
  FIX09_LEAF_CHAIN_PRIVATE_IDENTITY = 1,
  FIX09_LEAF_KEYS_WATCHDOG_WITNESS = 2
};
#define FIX09_PROFILE_COUNT UINT8_C(6)
#define FIX09_PROFILE_ROWS(X) \
X(UINT8_C(1), "api_occurrence", FIX09_IDENTITY_INVENTORY_API, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \
X(UINT8_C(2), "runner_occurrence", FIX09_IDENTITY_INVENTORY_RUNNER, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \
X(UINT8_C(3), "scheduler_occurrence", FIX09_IDENTITY_INVENTORY_SCHEDULER, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \
X(UINT8_C(4), "daemon_action", FIX09_IDENTITY_LITERAL_FIXAGENT_DAEMON, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \
X(UINT8_C(5), "obsctl_action", FIX09_IDENTITY_LITERAL_OBSCTL, FIX09_LEAF_CHAIN_PRIVATE_IDENTITY) \
X(UINT8_C(6), "watchdog_witness", FIX09_IDENTITY_JSON_NULL, FIX09_LEAF_KEYS_WATCHDOG_WITNESS)
#endif
```

The helper source includes `"fix09-profile-table.generated.h"` by that one fixed basename after the byte-zero Annex-K request. The header rule table is combined only with the three exact validated OPEN identity bytes to derive the six runtime rows. Slot 6's identity rule produces JSON null, never an empty string; its leaf rule produces exactly components `keys` and `watchdog-witness.pk8` with authorization `[1,null]`. Header tests mutate basename, any raw byte/final LF, profile id/order/count, identity rule, leaf rule, witness path/null/authorization, completed runtime map, and profile-map digest.

The normalized direct compiler argv is exactly these two arrays in order. `<COMPILER_PATH>`, `<TARGET_TRIPLE>`, `<DEPLOYMENT_TARGET>`, and `<SDK_PATH>` are already-captured required V inputs with no default; `<TARGET_TRIPLE>` is admitted Darwin ARM64, `<DEPLOYMENT_TARGET>` is canonical `MAJOR.MINOR` at least 10.9, and target/flag/Mach-O minos must agree. Literal `@BUILD_ROOT@` is the only normalization: each actual fresh mode-0700 absolute root is replaced by those bytes before hashing. Cwd is `/`; environment is empty; there is no shell, response file, environment option, implicit source, forced include, or additional argument.

```json
[
  ["<COMPILER_PATH>","-std=c17","-target","<TARGET_TRIPLE>","-arch","arm64","-mmacosx-version-min=<DEPLOYMENT_TARGET>","-isysroot","<SDK_PATH>","-O2","-fno-common","-fstack-protector-strong","-Wall","-Wextra","-Werror","-Wpedantic","-Werror=implicit-function-declaration","-I","@BUILD_ROOT@","-c","@BUILD_ROOT@/fix09-openat-read.c","-o","@BUILD_ROOT@/fix09-openat-read.o"],
  ["<COMPILER_PATH>","-target","<TARGET_TRIPLE>","-arch","arm64","-mmacosx-version-min=<DEPLOYMENT_TARGET>","-isysroot","<SDK_PATH>","-Wl,-no_uuid","@BUILD_ROOT@/fix09-openat-read.o","-o","@BUILD_ROOT@/fix09-openat-read"]
]
```

`ARGV` hashes those ordered normalized arrays. `build_input_sha256` binds, in FIX-10 v7 order, source, semantic profile template, fixed generated header, compiler identity, SDK identity, ordered argv, `UTF8(TARGET_TRIPLE)`, and `UTF8(DEPLOYMENT_TARGET)`. Both fresh builds must have byte-identical source, unchanged header, object, executable, normalized argv, SDK/compiler identity, and Mach-O projection. The exact fourteen v8 `nm`/`otool` command records, raw streams, v9 raw wipe-function bytes, artifact-kind span hashes, corrected instruction hash, corrected two outer domains, and three v9 digest mutants are mandatory fields in the C3.5 evidence manifest and independent review.

**Exact sole native wipe verifier/parser bytes**

The only verifier/parser source path is `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs`. Its complete source is exactly the 47,689 UTF-8/LF bytes inside the following fence plus one final LF: raw SHA-256 `b97c89f278812c75deb6f234d75f18a1bba1d1a8320e5ea452bbf2cfaf75a66f`, Git blob SHA-1 `bfe872cca8604983907aa060cc29d45852e3e8b2`, and `wipe_verifier_source_sha256` `28bec2f78650346a149e25ac85374b871167f5f5be05505b8c82900cbe251868` under FIX-10 v8's exact domain/preimage. C3.5 materializes those bytes byte-for-byte at that one tracked Git-mode-`100644` path after the RED assertions and before either ephemeral build. No generation, substitution, formatting, transpilation, bundled copy, companion parser, plug-in, downloaded module, runtime export, bin, install hook, or production copy is permitted. The launcher opens that reviewed file no-follow, verifies mode/identity/these raw bytes, rewinds the same descriptor, and supplies it as stdin to the pinned Node 22 invocation; the module reads only framed fd 3 and emits the closed canonical stdout/error grammar. Any byte, path, import, runtime, fd, framing, raw-artifact, command-stream, projection-domain, parser/tool-agreement, or materialization mismatch is a STOP.

```js
import fs from "node:fs";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

const SOURCE_PATH = "packages/obs-capture/native/fix09-openat-read.c";
const VERIFIER_PATH = "packages/obs-capture/scripts/verify-fix09-native-wipe.mjs";
const REQUIRED_SYMBOLS = Object.freeze(["_fix09_run_session", "_fix09_wipe_secret_buffers", "_fix09_scan_secret_buffers_zero"]);
const PREDECESSORS = Object.freeze(["success", "partial_write", "read_error", "protocol_error", "early_error"]);
const PREDECESSOR_SYMBOLS = Object.freeze(PREDECESSORS.map((name) => `_fix09_cleanup_${name}`));
const INPUT_KEYS = Object.freeze(["architecture", "artifact_command_set_sha256", "build_output_sha256", "cleanup_predecessors", "command_stream_byte_length", "deployment_contract_sha256", "endianness", "macho_byte_length", "memset_s_symbol", "object_byte_length", "object_output_sha256", "schema", "secret_buffers", "session_symbol", "source_byte_length", "source_sha256", "wipe_symbol", "wipe_verifier_runtime_sha256", "wipe_verifier_source_sha256", "zero_scan_symbol"]);
const HEX64 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const TOKEN = /^[A-Z][A-Z0-9_]*$/;
const MAX_MANIFEST = 65536;
const MAX_ARTIFACT = 64 * 1024 * 1024;
const MAX_COMMAND_STREAM = 64 * 1024 * 1024;
const COMMAND_LABELS = Object.freeze(["find_otool", "otool_version", "find_nm", "nm_version", "object_nm", "object_relocations", "object_wipe_disasm", "object_session_disasm", "executable_nm", "executable_loads", "executable_libraries", "executable_indirect", "executable_wipe_disasm", "executable_session_disasm"]);

class Refusal extends Error {
  constructor(code, phase) {
    super(code);
    this.code = code;
    this.phase = phase;
  }
}

function refuse(code, phase) {
  if (!TOKEN.test(code) || !TOKEN.test(phase)) throw new Error("BAD_REFUSAL_TOKEN");
  throw new Refusal(code, phase);
}

function u32(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) refuse("INTEGER_RANGE", "HASH");
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function u64(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse("INTEGER_RANGE", "HASH");
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

function lp(bytes) {
  return Buffer.concat([u32(bytes.length), bytes]);
}

function argvBytes(argv) {
  return Buffer.concat([u32(argv.length), ...argv.map((value) => lp(Buffer.from(value, "utf8")))]);
}

function digest(domain, parts) {
  const preimage = Buffer.concat([Buffer.from(domain, "ascii"), Buffer.from([0]), u32(parts.length), ...parts.map(lp)]);
  return crypto.createHash("sha256").update(preimage).digest("hex");
}

function d32(value) {
  if (!HEX64.test(value)) refuse("DIGEST_FORMAT", "HASH");
  return Buffer.from(value, "hex");
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) refuse("JSON_NUMBER", "JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  refuse("JSON_TYPE", "JSON");
}

function canonicalBytes(value) {
  return Buffer.from(canonical(value), "utf8");
}

function strictUtf8(bytes, phase) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || bytes.includes(0)) refuse("UTF8", phase);
  return text;
}

function parseCanonicalJson(bytes, phase) {
  const text = strictUtf8(bytes, phase);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    refuse("JSON_PARSE", phase);
  }
  if (canonical(value) !== text) refuse("JSON_CANONICAL", phase);
  return value;
}

function exactKeys(value, expected, phase) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) refuse("SCHEMA", phase);
  const observed = Object.keys(value).sort();
  if (canonical(observed) !== canonical([...expected].sort())) refuse("SCHEMA", phase);
}

function positiveDecimal(value, cap, phase) {
  if (typeof value !== "string" || !DECIMAL.test(value) || value === "0") refuse("LENGTH", phase);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > cap) refuse("LENGTH", phase);
  return number;
}

function readExactly(fd, count, phase) {
  const out = Buffer.alloc(count);
  let offset = 0;
  while (offset < count) {
    const size = fs.readSync(fd, out, offset, count - offset, null);
    if (size === 0) refuse("TRUNCATED", phase);
    offset += size;
  }
  return out;
}

function readU32(fd, phase) {
  return readExactly(fd, 4, phase).readUInt32BE(0);
}

function readU64(fd, phase) {
  const value = readExactly(fd, 8, phase).readBigUInt64BE(0);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) refuse("LENGTH", phase);
  return Number(value);
}

function validateManifest(value) {
  exactKeys(value, INPUT_KEYS, "MANIFEST");
  if (value.schema !== "obs-chain-helper-wipe-verifier-input/v1" || value.architecture !== "arm64" || value.endianness !== "little") refuse("MANIFEST_VALUE", "MANIFEST");
  if (value.session_symbol !== REQUIRED_SYMBOLS[0] || value.wipe_symbol !== REQUIRED_SYMBOLS[1] || value.zero_scan_symbol !== REQUIRED_SYMBOLS[2] || value.memset_s_symbol !== "_memset_s") refuse("MANIFEST_SYMBOL", "MANIFEST");
  if (canonical(value.cleanup_predecessors) !== canonical(PREDECESSORS)) refuse("MANIFEST_PREDECESSOR", "MANIFEST");
  if (canonical(value.secret_buffers) !== canonical([{ name: "key_read_buffer", capacity: "256" }, { name: "key_frame_buffer", capacity: "768" }])) refuse("MANIFEST_BUFFER", "MANIFEST");
  for (const key of ["source_sha256", "object_output_sha256", "build_output_sha256", "deployment_contract_sha256", "wipe_verifier_source_sha256", "wipe_verifier_runtime_sha256", "artifact_command_set_sha256"]) if (!HEX64.test(value[key])) refuse("DIGEST_FORMAT", "MANIFEST");
}

function readInput() {
  const fd = 3;
  const st = fs.fstatSync(fd, { bigint: true });
  if (!st.isFile() || st.nlink !== 1n || st.size <= 0n || st.size > BigInt(3 * MAX_ARTIFACT + MAX_COMMAND_STREAM + MAX_MANIFEST + 128)) refuse("INPUT_FD", "FRAME");
  if (!readExactly(fd, 8, "FRAME").equals(Buffer.from("F10WIPE8", "ascii"))) refuse("MAGIC", "FRAME");
  const manifestLength = readU32(fd, "FRAME");
  if (manifestLength === 0 || manifestLength > MAX_MANIFEST) refuse("MANIFEST_LENGTH", "FRAME");
  const manifestBytes = readExactly(fd, manifestLength, "MANIFEST");
  const manifest = parseCanonicalJson(manifestBytes, "MANIFEST");
  validateManifest(manifest);
  const declared = {
    source: positiveDecimal(manifest.source_byte_length, MAX_ARTIFACT, "MANIFEST"),
    object: positiveDecimal(manifest.object_byte_length, MAX_ARTIFACT, "MANIFEST"),
    macho: positiveDecimal(manifest.macho_byte_length, MAX_ARTIFACT, "MANIFEST"),
    commands: positiveDecimal(manifest.command_stream_byte_length, MAX_COMMAND_STREAM, "MANIFEST")
  };
  const readFramed = (name, phase) => {
    const length = readU64(fd, phase);
    if (length !== declared[name]) refuse("LENGTH_MISMATCH", phase);
    return readExactly(fd, length, phase);
  };
  const source = readFramed("source", "SOURCE");
  const object = readFramed("object", "OBJECT");
  const macho = readFramed("macho", "EXECUTABLE");
  const commandBytes = readExactly(fd, declared.commands, "COMMANDS");
  const tail = Buffer.alloc(1);
  if (fs.readSync(fd, tail, 0, 1, null) !== 0) refuse("TRAILING_BYTES", "FRAME");
  const expectedSize = 8 + 4 + manifestLength + 24 + declared.source + declared.object + declared.macho + declared.commands;
  if (BigInt(expectedSize) !== st.size) refuse("INPUT_SIZE", "FRAME");
  const complete = Buffer.concat([Buffer.from("F10WIPE8", "ascii"), u32(manifestLength), manifestBytes, u64(source.length), source, u64(object.length), object, u64(macho.length), macho, commandBytes]);
  return { manifest, source, object, macho, commandBytes, inputSha256: digest("obs-chain-helper-wipe-verifier-input/v1", [complete]) };
}

class View {
  constructor(bytes, phase) {
    this.bytes = bytes;
    this.phase = phase;
  }
  bounds(offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > this.bytes.length) refuse("MACHO_BOUNDS", this.phase);
  }
  u8(offset) { this.bounds(offset, 1); return this.bytes.readUInt8(offset); }
  u16(offset) { this.bounds(offset, 2); return this.bytes.readUInt16LE(offset); }
  u32(offset) { this.bounds(offset, 4); return this.bytes.readUInt32LE(offset); }
  i32(offset) { this.bounds(offset, 4); return this.bytes.readInt32LE(offset); }
  u64(offset) {
    this.bounds(offset, 8);
    const value = this.bytes.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) refuse("MACHO_INTEGER", this.phase);
    return Number(value);
  }
  fixed(offset, size) {
    this.bounds(offset, size);
    const field = this.bytes.subarray(offset, offset + size);
    const nul = field.indexOf(0);
    const used = nul < 0 ? field : field.subarray(0, nul);
    if (nul >= 0 && field.subarray(nul).some((value) => value !== 0)) refuse("MACHO_STRING", this.phase);
    return strictUtf8(used, this.phase);
  }
  cstring(offset, end) {
    this.bounds(offset, 1);
    if (offset >= end) refuse("MACHO_STRING", this.phase);
    const nul = this.bytes.indexOf(0, offset);
    if (nul < offset || nul >= end) refuse("MACHO_STRING", this.phase);
    return strictUtf8(this.bytes.subarray(offset, nul), this.phase);
  }
}

function hex(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse("HEX_RANGE", "PROJECTION");
  return value.toString(16);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function signed(value, bits) {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

function version(value) {
  return `${value >>> 16}.${(value >>> 8) & 255}.${value & 255}`.replace(/\.0$/, "");
}

const COMMAND_NAMES = new Map([[0x2, "lc_symtab"], [0xb, "lc_dysymtab"], [0xc, "lc_load_dylib"], [0x19, "lc_segment_64"], [0x1b, "lc_uuid"], [0x22, "lc_dyld_info"], [0x80000022, "lc_dyld_info_only"], [0x24, "lc_version_min_macosx"], [0x26, "lc_function_starts"], [0x29, "lc_data_in_code"], [0x2a, "lc_source_version"], [0x32, "lc_build_version"], [0x80000028, "lc_main"], [0x80000033, "lc_dyld_exports_trie"], [0x80000034, "lc_dyld_chained_fixups"]]);
const FLAG_NAMES = new Map([[0x1, "noundefs"], [0x4, "dyldlink"], [0x80, "twolevel"], [0x2000, "pie"], [0x200000, "app_extension_safe"]]);

function nonoverlap(ranges, phase) {
  const sorted = [...ranges].filter((range) => range.size > 0).sort((a, b) => a.offset - b.offset || a.size - b.size);
  for (let index = 1; index < sorted.length; index++) if (sorted[index - 1].offset + sorted[index - 1].size > sorted[index].offset) refuse("MACHO_OVERLAP", phase);
}

function parseFunctionStarts(view, command, textVmaddr) {
  const offset = view.u32(command.offset + 8);
  const size = view.u32(command.offset + 12);
  view.bounds(offset, size);
  const starts = [];
  let cursor = offset;
  let address = textVmaddr;
  while (cursor < offset + size) {
    let delta = 0;
    let shift = 0;
    for (;;) {
      if (cursor >= offset + size || shift > 63) refuse("ULEB128", view.phase);
      const byte = view.u8(cursor++);
      delta += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    if (delta === 0) break;
    address += delta;
    if (!Number.isSafeInteger(address) || starts.includes(address)) refuse("FUNCTION_STARTS", view.phase);
    starts.push(address);
  }
  if (view.bytes.subarray(cursor, offset + size).some((byte) => byte !== 0)) refuse("FUNCTION_STARTS", view.phase);
  return starts;
}

function parseMachO(bytes, expectedFiletype, phase) {
  const view = new View(bytes, phase);
  if (view.u32(0) !== 0xfeedfacf || view.u32(4) !== 0x0100000c || view.u32(12) !== expectedFiletype) refuse("MACHO_HEADER", phase);
  const ncmds = view.u32(16);
  const sizeofcmds = view.u32(20);
  const rawFlags = view.u32(24);
  if (ncmds === 0 || ncmds > 4096 || 32 + sizeofcmds > bytes.length) refuse("MACHO_COMMANDS", phase);
  const commands = [];
  const sections = [];
  const dependencies = [];
  const ranges = [{ offset: 0, size: 32 + sizeofcmds, label: "header" }];
  let symtab = null;
  let dysymtab = null;
  let build = null;
  let functionStartsCommand = null;
  let textVmaddr = null;
  let cursor = 32;
  for (let ordinal = 0; ordinal < ncmds; ordinal++) {
    const cmd = view.u32(cursor);
    const cmdsize = view.u32(cursor + 4);
    if (cmdsize < 8 || (cmdsize & 7) !== 0 || cursor + cmdsize > 32 + sizeofcmds) refuse("MACHO_COMMAND", phase);
    const cmdName = COMMAND_NAMES.get(cmd);
    if (cmdName === undefined) refuse("MACHO_COMMAND", phase);
    let name = null;
    if (cmd === 0x19) {
      if (cmdsize < 72) refuse("MACHO_SEGMENT", phase);
      name = view.fixed(cursor + 8, 16);
      const vmaddr = view.u64(cursor + 24);
      const fileoff = view.u64(cursor + 40);
      const filesize = view.u64(cursor + 48);
      const nsects = view.u32(cursor + 64);
      if (72 + nsects * 80 !== cmdsize) refuse("MACHO_SEGMENT", phase);
      if (name === "__TEXT" && (textVmaddr === null || vmaddr < textVmaddr)) textVmaddr = vmaddr;
      if (filesize > 0) { view.bounds(fileoff, filesize); ranges.push({ offset: fileoff, size: filesize, label: `segment:${name}` }); }
      for (let index = 0; index < nsects; index++) {
        const base = cursor + 72 + index * 80;
        const section = { sectname: view.fixed(base, 16), segname: view.fixed(base + 16, 16), addr: view.u64(base + 32), size: view.u64(base + 40), offset: view.u32(base + 48), align: view.u32(base + 52), reloff: view.u32(base + 56), nreloc: view.u32(base + 60), flags: view.u32(base + 64), reserved1: view.u32(base + 68), reserved2: view.u32(base + 72), index: sections.length + 1 };
        if (section.size > 0 && (section.flags & 0xff) !== 1) view.bounds(section.offset, section.size);
        if (section.nreloc > 0) { view.bounds(section.reloff, section.nreloc * 8); ranges.push({ offset: section.reloff, size: section.nreloc * 8, label: `reloc:${section.sectname}` }); }
        sections.push(section);
      }
    } else if (cmd === 0x2) {
      if (symtab !== null || cmdsize !== 24) refuse("MACHO_SYMTAB", phase);
      symtab = { symoff: view.u32(cursor + 8), nsyms: view.u32(cursor + 12), stroff: view.u32(cursor + 16), strsize: view.u32(cursor + 20) };
    } else if (cmd === 0xb) {
      if (dysymtab !== null || cmdsize !== 80) refuse("MACHO_DYSYMTAB", phase);
      dysymtab = { indirectsymoff: view.u32(cursor + 56), nindirectsyms: view.u32(cursor + 60) };
    } else if (cmd === 0xc) {
      const nameOffset = view.u32(cursor + 8);
      if (nameOffset < 24 || nameOffset >= cmdsize) refuse("MACHO_DYLIB", phase);
      name = view.cstring(cursor + nameOffset, cursor + cmdsize);
      dependencies.push(name);
    } else if (cmd === 0x32) {
      if (build !== null || cmdsize < 24 || view.u32(cursor + 8) !== 1) refuse("MACHO_BUILD", phase);
      build = { minos: version(view.u32(cursor + 12)), sdk: version(view.u32(cursor + 16)) };
    } else if (cmd === 0x26) {
      if (functionStartsCommand !== null || cmdsize !== 16) refuse("FUNCTION_STARTS", phase);
      functionStartsCommand = { offset: cursor };
    }
    commands.push({ ordinal: String(ordinal), cmd: cmdName, cmdsize: String(cmdsize), name });
    cursor += cmdsize;
  }
  if (cursor !== 32 + sizeofcmds || symtab === null) refuse("MACHO_COMMANDS", phase);
  view.bounds(symtab.symoff, symtab.nsyms * 16);
  view.bounds(symtab.stroff, symtab.strsize);
  ranges.push({ offset: symtab.symoff, size: symtab.nsyms * 16, label: "symbols" }, { offset: symtab.stroff, size: symtab.strsize, label: "strings" });
  if (dysymtab !== null) { view.bounds(dysymtab.indirectsymoff, dysymtab.nindirectsyms * 4); ranges.push({ offset: dysymtab.indirectsymoff, size: dysymtab.nindirectsyms * 4, label: "indirect" }); }
  nonoverlap(ranges.filter((range) => !range.label.startsWith("segment:")), phase);
  const symbols = [];
  for (let index = 0; index < symtab.nsyms; index++) {
    const base = symtab.symoff + index * 16;
    const strx = view.u32(base);
    if (strx >= symtab.strsize) refuse("MACHO_SYMBOL", phase);
    const symbol = { index, name: view.cstring(symtab.stroff + strx, symtab.stroff + symtab.strsize), type: view.u8(base + 4), sect: view.u8(base + 5), desc: view.u16(base + 6), value: view.u64(base + 8) };
    if (symbol.name.includes("\n") || symbol.name.includes("\r")) refuse("MACHO_SYMBOL", phase);
    symbols.push(symbol);
  }
  const unknownFlags = [...FLAG_NAMES.keys()].reduce((value, flag) => value & ~flag, rawFlags);
  if (unknownFlags !== 0) refuse("MACHO_FLAGS", phase);
  const flags = [...FLAG_NAMES].filter(([flag]) => (rawFlags & flag) !== 0).map(([, name]) => name).sort(byteSort);
  const functionStarts = functionStartsCommand === null ? [] : parseFunctionStarts(view, functionStartsCommand, textVmaddr ?? 0);
  return { bytes, view, filetype: expectedFiletype, cpusubtype: view.u32(8), commands, sections, symtab, dysymtab, symbols, dependencies, build, functionStarts, flags };
}

function definedFunction(artifact, name) {
  const candidates = artifact.symbols.filter((symbol) => symbol.name === name && (symbol.type & 0x0e) === 0x0e && symbol.sect > 0);
  if (candidates.length !== 1) refuse("FUNCTION_SYMBOL", artifact.view.phase);
  const symbol = candidates[0];
  const section = artifact.sections[symbol.sect - 1];
  if (section === undefined || (section.flags & 0x80000000) === 0 || (symbol.value & 3) !== 0) refuse("FUNCTION_SECTION", artifact.view.phase);
  const sameSection = artifact.symbols.filter((candidate) => candidate.sect === symbol.sect && (candidate.type & 0x0e) === 0x0e && !PREDECESSOR_SYMBOLS.includes(candidate.name) && candidate.value > symbol.value).map((candidate) => candidate.value);
  const sectionEnd = section.addr + section.size;
  const end = Math.min(sectionEnd, ...sameSection);
  if (symbol.value < section.addr || end <= symbol.value || end > sectionEnd || ((end - symbol.value) & 3) !== 0) refuse("FUNCTION_BOUNDS", artifact.view.phase);
  if (artifact.filetype === 2) {
    const ordered = artifact.functionStarts.filter((start) => start >= symbol.value).sort((a, b) => a - b);
    if (ordered[0] !== symbol.value || ordered[1] !== end) refuse("FUNCTION_STARTS", artifact.view.phase);
  }
  const fileStart = section.offset + (symbol.value - section.addr);
  artifact.view.bounds(fileStart, end - symbol.value);
  return { name, start: symbol.value, end, fileStart, section };
}

function definedLabel(artifact, name, container) {
  const candidates = artifact.symbols.filter((symbol) => symbol.name === name && (symbol.type & 0x0e) === 0x0e && symbol.sect === container.section.index);
  if (candidates.length !== 1 || candidates[0].value < container.start || candidates[0].value >= container.end || (candidates[0].value & 3) !== 0) refuse("MARKER_SYMBOL", artifact.view.phase);
  return candidates[0].value;
}

function decodeFunction(artifact, fn) {
  const instructions = [];
  for (let address = fn.start; address < fn.end; address += 4) {
    const offset = fn.fileStart + address - fn.start;
    const word = artifact.view.u32(offset);
    let kind = "data";
    let target = null;
    if ((word & 0xfc000000) === 0x94000000) { kind = "call"; target = address + signed(word & 0x03ffffff, 26) * 4; }
    else if ((word & 0xfc000000) === 0x14000000) { kind = "branch"; target = address + signed(word & 0x03ffffff, 26) * 4; }
    else if ((word & 0xff000010) === 0x54000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x7ffff, 19) * 4; }
    else if ((word & 0x7e000000) === 0x34000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x7ffff, 19) * 4; }
    else if ((word & 0x7e000000) === 0x36000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x3fff, 14) * 4; }
    else if ((word & 0xfffffc1f) === 0xd65f0000) kind = "return";
    else if ((word & 0xfffffc1f) === 0xd61f0000 || (word & 0xfffffc1f) === 0xd63f0000 || (word & 0xffe0001f) === 0xd4000001 || (word & 0xffffffe0) === 0xd4200000) refuse("INDIRECT_OR_EXCEPTION", "ARM64");
    else if (!admittedDataInstruction(word)) refuse("ARM64_OPCODE", "ARM64");
    if ((kind === "branch" || kind === "conditional") && (target < fn.start || target >= fn.end || (target & 3) !== 0)) refuse("BRANCH_TARGET", "ARM64");
    instructions.push({ address, offset, word, kind, target });
  }
  return instructions;
}

function admittedDataInstruction(word) {
  if (word === 0xd503201f) return true;
  const families = [
    [0x1f000000, 0x11000000], [0x1f000000, 0x0b000000], [0x1f000000, 0x12000000], [0x1f000000, 0x0a000000],
    [0x1f800000, 0x12800000], [0x1f800000, 0x13000000], [0x1f800000, 0x13800000], [0x1f000000, 0x10000000],
    [0x0a000000, 0x08000000], [0x1fe00000, 0x1a800000], [0x1fe00000, 0x1ac00000], [0x7f000000, 0x71000000]
  ];
  return families.some(([mask, value]) => (word & mask) === value);
}

function graphFor(instructions) {
  const byAddress = new Map(instructions.map((instruction) => [instruction.address, instruction]));
  const edges = [];
  for (const instruction of instructions) {
    const next = instruction.address + 4;
    if (instruction.kind === "return") continue;
    if (instruction.kind === "branch") edges.push({ from: instruction.address, to: instruction.target, kind: "branch_true" });
    else if (instruction.kind === "conditional") {
      edges.push({ from: instruction.address, to: instruction.target, kind: "branch_true" });
      if (!byAddress.has(next)) refuse("FALLTHROUGH", "CFG");
      edges.push({ from: instruction.address, to: next, kind: "branch_false" });
    } else {
      if (!byAddress.has(next)) refuse("FALLTHROUGH", "CFG");
      edges.push({ from: instruction.address, to: next, kind: instruction.kind === "call" ? "call_return" : "fallthrough" });
    }
  }
  const successors = new Map(instructions.map((instruction) => [instruction.address, []]));
  for (const edge of edges) successors.get(edge.from).push(edge.to);
  const reachable = new Set();
  const pending = [instructions[0].address];
  while (pending.length) {
    const current = pending.pop();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of successors.get(current) ?? []) pending.push(next);
  }
  const exits = instructions.filter((instruction) => instruction.kind === "return" && reachable.has(instruction.address));
  if (exits.length !== 1) refuse("CFG_EXIT", "CFG");
  return { byAddress, edges: edges.filter((edge) => reachable.has(edge.from)), successors, reachable, exit: exits[0].address };
}

function resolvedCalls(artifact, fn, instructions) {
  const calls = [];
  if (artifact.filetype === 1) {
    const relocations = new Map();
    const section = fn.section;
    for (let index = 0; index < section.nreloc; index++) {
      const base = section.reloff + index * 8;
      const address = artifact.view.i32(base);
      const info = artifact.view.u32(base + 4);
      const symbolIndex = info & 0x00ffffff;
      const pcrel = (info >>> 24) & 1;
      const length = (info >>> 25) & 3;
      const external = (info >>> 27) & 1;
      const type = info >>> 28;
      if (address < 0 || relocations.has(address)) refuse("RELOCATION", "OBJECT");
      relocations.set(address, { symbolIndex, pcrel, length, external, type });
    }
    for (const instruction of instructions.filter((item) => item.kind === "call")) {
      const sectionOffset = instruction.address - section.addr;
      const relocation = relocations.get(sectionOffset);
      if (relocation === undefined || relocation.pcrel !== 1 || relocation.length !== 2 || relocation.external !== 1 || relocation.type !== 2 || relocation.symbolIndex >= artifact.symbols.length || (instruction.word & 0x03ffffff) !== 0) refuse("BRANCH26_RELOCATION", "OBJECT");
      calls.push({ offset: instruction.address, target: artifact.symbols[relocation.symbolIndex].name, relocation: "arm64_reloc_branch26" });
    }
  } else {
    if (artifact.dysymtab === null) refuse("INDIRECT_TABLE", "EXECUTABLE");
    const stubs = artifact.sections.filter((section) => (section.flags & 0xff) === 0x8);
    for (const instruction of instructions.filter((item) => item.kind === "call")) {
      const internal = artifact.symbols.filter((symbol) => (symbol.type & 0x0e) === 0x0e && symbol.value === instruction.target);
      if (internal.length === 1) { calls.push({ offset: instruction.address, target: internal[0].name, stubOffset: null }); continue; }
      const matches = [];
      for (const section of stubs) {
        if (section.reserved2 === 0 || section.size % section.reserved2 !== 0) refuse("STUB_TABLE", "EXECUTABLE");
        const ordinal = (instruction.target - section.addr) / section.reserved2;
        if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= section.size / section.reserved2) continue;
        const indirectIndex = section.reserved1 + ordinal;
        if (indirectIndex >= artifact.dysymtab.nindirectsyms) refuse("STUB_TABLE", "EXECUTABLE");
        const symbolIndex = artifact.view.u32(artifact.dysymtab.indirectsymoff + indirectIndex * 4);
        if ((symbolIndex & 0xc0000000) !== 0 || symbolIndex >= artifact.symbols.length) refuse("STUB_TABLE", "EXECUTABLE");
        matches.push({ offset: instruction.address, target: artifact.symbols[symbolIndex].name, stubOffset: instruction.target });
      }
      if (matches.length !== 1) refuse("STUB_RESOLUTION", "EXECUTABLE");
      calls.push(matches[0]);
    }
  }
  return calls;
}

function pathsAvoiding(graph, start, mandatory, exit) {
  const pending = [start];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === mandatory) continue;
    if (current === exit) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.successors.get(current) ?? []) pending.push(next);
  }
  return false;
}

function nearestCall(calls, target) {
  const matches = calls.filter((call) => call.target === target);
  if (matches.length !== 1) refuse("CALL_CARDINALITY", "CFG");
  return matches[0].offset;
}

function analyzeSession(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const wipeOffset = nearestCall(calls, REQUIRED_SYMBOLS[1]);
  const zeroOffset = nearestCall(calls, REQUIRED_SYMBOLS[2]);
  if (wipeOffset >= zeroOffset || pathsAvoiding(graph, fn.start, wipeOffset, graph.exit) || pathsAvoiding(graph, wipeOffset + 4, zeroOffset, graph.exit)) refuse("CLEANUP_POSTDOM", "CFG");
  const markerAddresses = PREDECESSOR_SYMBOLS.map((name) => definedLabel(artifact, name, fn));
  if (new Set(markerAddresses).size !== PREDECESSORS.length || markerAddresses.some((address) => !graph.reachable.has(address) || pathsAvoiding(graph, address, wipeOffset, graph.exit))) refuse("CLEANUP_PREDECESSOR", "CFG");
  const forbidden = new Set(["_exit", "__exit", "_abort", "___assert_rtn"]);
  if (calls.some((call) => forbidden.has(call.target))) refuse("TERMINATING_CALL", "CFG");
  const readCalls = calls.filter((call) => call.target === "_read");
  const writeCalls = calls.filter((call) => call.target === "_write");
  if (readCalls.length !== 1 || writeCalls.length < 1 || pathsAvoiding(graph, readCalls[0].offset + 4, wipeOffset, graph.exit)) refuse("SECRET_FLOW", "CFG");
  const intervals = discoverStackIntervals(instructions, wipeOffset);
  const blocks = [...graph.reachable].sort((a, b) => a - b).map((address) => ({ start: hex(address), end: hex(address + 4), successors: [...(graph.successors.get(address) ?? [])].sort((a, b) => a - b).map(hex), predecessor_class: markerAddresses.includes(address) ? PREDECESSORS[markerAddresses.indexOf(address)] : null, secret_state: address < readCalls[0].offset ? "none" : address < wipeOffset ? "live" : address < zeroOffset ? "wiped" : "verified_zero" }));
  const edges = graph.edges.slice().sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind)).map((edge) => ({ from: hex(edge.from), to: hex(edge.to), kind: edge.kind }));
  const secretIntervals = [{ name: "key_read_buffer", start: hex(intervals[0].start), end: hex(intervals[0].end), capacity: "256" }, { name: "key_frame_buffer", start: hex(intervals[1].start), end: hex(intervals[1].end), capacity: "768" }];
  const exit = { offset: hex(graph.exit), kind: "return", classified_predecessors: [...PREDECESSORS].sort(), wipe_call_offset: hex(wipeOffset), zero_scan_call_offset: hex(zeroOffset) };
  const cleanupCfg = { schema: "obs-chain-helper-cleanup-cfg/v1", blocks, edges, secret_intervals: secretIntervals, exits: [exit] };
  return { graph, intervals, wipeOffset, zeroOffset, cleanupCfg, cleanupCfgSha256: digest("obs-chain-helper-cleanup-cfg/v1", [canonicalBytes(cleanupCfg)]), exit };
}

function discoverStackIntervals(instructions, wipeOffset) {
  const before = instructions.filter((instruction) => instruction.address < wipeOffset);
  const candidates = [];
  for (const instruction of before) {
    const word = instruction.word;
    if ((word & 0x7f000000) !== 0x11000000) continue;
    const rd = word & 31;
    const rn = (word >>> 5) & 31;
    const shift = (word >>> 22) & 1;
    const immediate = ((word >>> 10) & 0xfff) << (shift ? 12 : 0);
    if (rn === 31 && (rd === 0 || rd === 1)) candidates.push({ register: rd, start: immediate });
  }
  const read = candidates.filter((candidate) => candidate.register === 0).at(-1);
  const frame = candidates.filter((candidate) => candidate.register === 1).at(-1);
  if (read === undefined || frame === undefined) refuse("STACK_INTERVAL", "DATAFLOW");
  const intervals = [{ start: read.start, end: read.start + 256 }, { start: frame.start, end: frame.start + 768 }];
  if (intervals[0].start < 0 || intervals[1].start < 0 || Math.max(intervals[0].start, intervals[1].start) < Math.min(intervals[0].end, intervals[1].end)) refuse("STACK_INTERVAL", "DATAFLOW");
  return intervals;
}

function decodeImmediateWrites(instructions) {
  const writes = [];
  for (const instruction of instructions) {
    const word = instruction.word;
    if ((word & 0x7f800000) === 0x52800000 || (word & 0x7f800000) === 0x12800000) {
      const rd = word & 31;
      const immediate = (word >>> 5) & 0xffff;
      const shift = ((word >>> 21) & 3) * 16;
      writes.push({ address: instruction.address, register: rd, value: immediate * 2 ** shift });
    }
  }
  return writes;
}

function analyzeWipe(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const wipeCalls = calls.filter((call) => call.target === "_memset_s").sort((a, b) => a.offset - b.offset);
  if (wipeCalls.length !== 2 || wipeCalls[0].offset >= wipeCalls[1].offset) refuse("MEMSET_CALLS", "DATAFLOW");
  for (const call of wipeCalls) if (pathsAvoiding(graph, fn.start, call.offset, graph.exit)) refuse("MEMSET_BYPASS", "DATAFLOW");
  const immediates = decodeImmediateWrites(instructions);
  for (const [index, capacity] of [256, 768].entries()) {
    const window = immediates.filter((write) => write.address < wipeCalls[index].offset && write.address + 64 >= wipeCalls[index].offset);
    if (window.filter((write) => (write.register === 1 || write.register === 3) && write.value === capacity).length < 2 || !window.some((write) => write.register === 2 && write.value === 0)) refuse("MEMSET_ARGUMENTS", "DATAFLOW");
    const post = instructions.filter((instruction) => instruction.address > wipeCalls[index].offset && instruction.address <= wipeCalls[index].offset + 16);
    if (!post.some((instruction) => instruction.kind === "conditional")) refuse("MEMSET_RETURN_CHECK", "DATAFLOW");
  }
  return { graph, calls: wipeCalls };
}

function analyzeZeroScan(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const loads = instructions.filter((instruction) => (instruction.word & 0x0a000000) === 0x08000000);
  const constants = decodeImmediateWrites(instructions).map((write) => write.value);
  if (calls.length !== 0 || loads.length < 2 || !constants.includes(256) || !constants.includes(768) || instructions.filter((instruction) => instruction.kind === "conditional").length < 2) refuse("VOLATILE_ZERO_SCAN", "DATAFLOW");
  return graph;
}

function parseCommandFrames(bytes) {
  let offset = 0;
  const read = () => {
    if (offset + 8 > bytes.length) refuse("COMMAND_FRAME", "COMMANDS");
    const lengthBig = bytes.readBigUInt64BE(offset);
    offset += 8;
    if (lengthBig > BigInt(MAX_COMMAND_STREAM) || lengthBig > BigInt(Number.MAX_SAFE_INTEGER)) refuse("COMMAND_LENGTH", "COMMANDS");
    const length = Number(lengthBig);
    if (offset + length > bytes.length) refuse("COMMAND_FRAME", "COMMANDS");
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const streams = COMMAND_LABELS.map((label) => ({ label, stdout: read(), stderr: read() }));
  if (offset !== bytes.length) refuse("COMMAND_TRAILING", "COMMANDS");
  return streams;
}

function commandArgv(otool, nm) {
  return [
    ["/usr/bin/xcrun", "--sdk", "macosx", "--find", "otool"], [otool, "--version"],
    ["/usr/bin/xcrun", "--sdk", "macosx", "--find", "nm"], [nm, "--version"],
    [nm, "--arch=arm64", "--format=posix", "--numeric-sort", "--print-size", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-r", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_wipe_secret_buffers", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_run_session", "/dev/fd/3"],
    [nm, "--arch=arm64", "--format=posix", "--numeric-sort", "--print-size", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-l", "/dev/fd/3"], [otool, "-arch", "arm64", "-L", "/dev/fd/3"], [otool, "-arch", "arm64", "-I", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_wipe_secret_buffers", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_run_session", "/dev/fd/3"]
  ];
}

function parseToolEvidence(commandBytes, manifest, objectHash, executableHash) {
  const streams = parseCommandFrames(commandBytes);
  const findPath = (stream) => {
    if (stream.stderr.length !== 0) refuse("TOOL_FIND_STDERR", "COMMANDS");
    const text = strictUtf8(stream.stdout, "COMMANDS");
    if (!/^\/[^\n\r]+\n$/.test(text)) refuse("TOOL_FIND_PATH", "COMMANDS");
    return text.slice(0, -1);
  };
  const otool = findPath(streams[0]);
  const nm = findPath(streams[2]);
  const argvs = commandArgv(otool, nm);
  const records = streams.map((stream, index) => {
    const artifactKind = index >= 4 && index <= 7 ? "object" : index >= 8 ? "executable" : "none";
    const artifactHash = artifactKind === "object" ? objectHash : artifactKind === "executable" ? executableHash : "0".repeat(64);
    const stdoutHash = digest("obs-chain-helper-artifact-command-stdout/v1", [Buffer.from(stream.label), stream.stdout]);
    const stderrHash = digest("obs-chain-helper-artifact-command-stderr/v1", [Buffer.from(stream.label), stream.stderr]);
    const commandHash = digest("obs-chain-helper-artifact-command/v1", [Buffer.from(stream.label), argvBytes(argvs[index]), u32(0), d32(stdoutHash), d32(stderrHash), Buffer.from(artifactKind), d32(artifactHash)]);
    return { label: stream.label, argv: argvs[index], exit_code: "0", stdout_bytes: String(stream.stdout.length), stdout_sha256: stdoutHash, stderr_bytes: String(stream.stderr.length), stderr_sha256: stderrHash, artifact_kind: artifactKind, artifact_sha256: artifactHash, command_sha256: commandHash };
  });
  const set = { schema: "obs-chain-helper-artifact-command-set/v1", records };
  if (digest("obs-chain-helper-artifact-command-set/v1", [canonicalBytes(set)]) !== manifest.artifact_command_set_sha256) refuse("COMMAND_SET_HASH", "COMMANDS");
  return { streams, records, otool, nm };
}

function requireToolAgreement(tool, object, executable, objectFunctions, executableFunctions, objectCalls, executableCalls) {
  const texts = tool.streams.map((stream) => strictUtf8(stream.stdout, "TOOLS"));
  for (const [index, artifact, functions] of [[4, object, objectFunctions], [8, executable, executableFunctions]]) {
    const text = texts[index];
    for (const fn of functions) if (!new RegExp(`${fn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[A-Za-z?]\\s+0*${hex(fn.start)}\\s+0*${hex(fn.end - fn.start)}(?:\\s|$)`, "m").test(text)) refuse("NM_DISAGREEMENT", "TOOLS");
    const undefinedNames = artifact.symbols.filter((symbol) => (symbol.type & 0x0e) === 0 && symbol.value === 0).map((symbol) => symbol.name);
    for (const name of undefinedNames) if (!text.includes(name)) refuse("NM_UNDEFINED_DISAGREEMENT", "TOOLS");
  }
  if (!texts[5].includes("ARM64_RELOC_BRANCH26") || objectCalls.filter((call) => call.target === "_memset_s").some((call) => !texts[5].includes(hex(call.offset)))) refuse("RELOCATION_DISAGREEMENT", "TOOLS");
  for (const [index, calls] of [[6, objectCalls], [12, executableCalls]]) for (const call of calls.filter((value) => value.target === "_memset_s")) if (!texts[index].includes(hex(call.offset)) || !texts[index].includes("_memset_s")) refuse("DISASSEMBLY_DISAGREEMENT", "TOOLS");
  if (!texts[9].includes("LC_BUILD_VERSION") || !texts[9].includes(executable.build.minos) || !texts[10].includes("/usr/lib/libSystem.B.dylib")) refuse("LOAD_DISAGREEMENT", "TOOLS");
  for (const call of executableCalls.filter((value) => value.stubOffset !== null)) if (!texts[11].includes(hex(call.stubOffset)) || !texts[11].includes(call.target)) refuse("INDIRECT_DISAGREEMENT", "TOOLS");
}

function sourceChecks(source, sourceHash) {
  if (digest("obs-chain-helper-source/v2", [Buffer.from(SOURCE_PATH), source]) !== sourceHash) refuse("SOURCE_HASH", "SOURCE");
  const text = strictUtf8(source, "SOURCE");
  if (!text.startsWith("#define __STDC_WANT_LIB_EXT1__ 1\n") || (text.match(/\bmemset_s\s*\(/g) ?? []).length !== 2 || /\b(?:memset|explicit_bzero|bzero|dlsym)\s*\(/.test(text) || !text.includes("fix09_wipe_secret_buffers") || !text.includes("fix09_scan_secret_buffers_zero")) refuse("SOURCE_POLICY", "SOURCE");
  for (const token of PREDECESSORS) if (!text.includes(token)) refuse("SOURCE_PREDECESSOR", "SOURCE");
}

function main() {
  const input = readInput();
  const { manifest, source, object, macho, commandBytes } = input;
  sourceChecks(source, manifest.source_sha256);
  const objectHash = digest("obs-chain-helper-object/v1", [object]);
  const executableHash = digest("obs-chain-helper-output/v1", [macho]);
  if (objectHash !== manifest.object_output_sha256 || executableHash !== manifest.build_output_sha256) refuse("ARTIFACT_HASH", "ARTIFACT");
  const parsedObject = parseMachO(object, 1, "OBJECT");
  const parsedExecutable = parseMachO(macho, 2, "EXECUTABLE");
  if (parsedExecutable.build === null || parsedExecutable.dependencies.length !== 1 || parsedExecutable.dependencies[0] !== "/usr/lib/libSystem.B.dylib") refuse("EXECUTABLE_POLICY", "EXECUTABLE");
  const deploymentParts = parsedExecutable.build.minos.split(".");
  const targetTriple = `arm64-apple-macosx${parsedExecutable.build.minos}`;
  const deploymentValue = { schema: "obs-chain-helper-deployment-contract/v1", architecture: "arm64", deployment_target: parsedExecutable.build.minos, target_triple: targetTriple, deployment_flag: `-mmacosx-version-min=${parsedExecutable.build.minos}`, macho_platform: "macos", macho_minos: parsedExecutable.build.minos, memset_s_first_macos: "10.9" };
  if (digest("obs-chain-helper-deployment-contract/v1", [canonicalBytes(deploymentValue)]) !== manifest.deployment_contract_sha256 || Number(deploymentParts[0]) < 10 || (Number(deploymentParts[0]) === 10 && Number(deploymentParts[1] ?? 0) < 9)) refuse("DEPLOYMENT", "EXECUTABLE");
  const objectFns = REQUIRED_SYMBOLS.map((name) => definedFunction(parsedObject, name));
  const executableFns = REQUIRED_SYMBOLS.map((name) => definedFunction(parsedExecutable, name));
  const objectDecoded = new Map(objectFns.map((fn) => [fn.name, decodeFunction(parsedObject, fn)]));
  const executableDecoded = new Map(executableFns.map((fn) => [fn.name, decodeFunction(parsedExecutable, fn)]));
  const objectCallMap = new Map(objectFns.map((fn) => [fn.name, resolvedCalls(parsedObject, fn, objectDecoded.get(fn.name))]));
  const executableCallMap = new Map(executableFns.map((fn) => [fn.name, resolvedCalls(parsedExecutable, fn, executableDecoded.get(fn.name))]));
  const objectSession = analyzeSession(parsedObject, objectFns[0], objectDecoded.get(REQUIRED_SYMBOLS[0]), objectCallMap.get(REQUIRED_SYMBOLS[0]));
  const executableSession = analyzeSession(parsedExecutable, executableFns[0], executableDecoded.get(REQUIRED_SYMBOLS[0]), executableCallMap.get(REQUIRED_SYMBOLS[0]));
  const objectWipe = analyzeWipe(parsedObject, objectFns[1], objectDecoded.get(REQUIRED_SYMBOLS[1]), objectCallMap.get(REQUIRED_SYMBOLS[1]));
  const executableWipe = analyzeWipe(parsedExecutable, executableFns[1], executableDecoded.get(REQUIRED_SYMBOLS[1]), executableCallMap.get(REQUIRED_SYMBOLS[1]));
  analyzeZeroScan(parsedObject, objectFns[2], objectDecoded.get(REQUIRED_SYMBOLS[2]), objectCallMap.get(REQUIRED_SYMBOLS[2]));
  analyzeZeroScan(parsedExecutable, executableFns[2], executableDecoded.get(REQUIRED_SYMBOLS[2]), executableCallMap.get(REQUIRED_SYMBOLS[2]));
  if (canonical(objectSession.intervals) !== canonical(executableSession.intervals)) refuse("INTERVAL_DISAGREEMENT", "DATAFLOW");
  const tool = parseToolEvidence(commandBytes, manifest, objectHash, executableHash);
  requireToolAgreement(tool, parsedObject, parsedExecutable, objectFns.slice(0, 3), executableFns.slice(0, 3), objectCallMap.get(REQUIRED_SYMBOLS[1]), executableCallMap.get(REQUIRED_SYMBOLS[1]));
  const objectWipeSpan = object.subarray(objectFns[1].fileStart, objectFns[1].fileStart + objectFns[1].end - objectFns[1].start);
  const executableWipeSpan = macho.subarray(executableFns[1].fileStart, executableFns[1].fileStart + executableFns[1].end - executableFns[1].start);
  const objectSpanHash = digest("obs-chain-helper-arm64-function-bytes/v1", [Buffer.from("object"), Buffer.from(REQUIRED_SYMBOLS[1]), objectWipeSpan]);
  const executableSpanHash = digest("obs-chain-helper-arm64-function-bytes/v1", [Buffer.from("executable"), Buffer.from(REQUIRED_SYMBOLS[1]), executableWipeSpan]);
  const instructionHash = digest("obs-chain-helper-wipe-instructions/v1", [executableWipeSpan]);
  const undefinedSymbols = [...new Set(parsedExecutable.symbols.filter((symbol) => (symbol.type & 0x0e) === 0 && symbol.value === 0).map((symbol) => symbol.name))].sort(byteSort);
  const machoProjection = { schema: "obs-chain-helper-macho/v1", cputype: "arm64", cpusubtype: parsedExecutable.cpusubtype === 0 ? "arm64_all" : `arm64_${parsedExecutable.cpusubtype.toString(16)}`, filetype: "mh_execute", flags: parsedExecutable.flags, minos: parsedExecutable.build.minos, sdk: parsedExecutable.build.sdk, load_commands: parsedExecutable.commands, external_dependencies: parsedExecutable.dependencies, undefined_symbols: undefinedSymbols };
  const wipeObjectProjection = { schema: "obs-chain-helper-wipe-object/v1", object_output_sha256: objectHash, memset_s_undefined_symbol: "_memset_s", memset_s_undefined_symbol_count: String(parsedObject.symbols.filter((symbol) => symbol.name === "_memset_s" && (symbol.type & 0x0e) === 0).length), secret_allocations: [{ name: "key_read_buffer", capacity: "256" }, { name: "key_frame_buffer", capacity: "768" }], direct_calls: [{ caller: REQUIRED_SYMBOLS[1], ordinal: "1", callee: "_memset_s" }, { caller: REQUIRED_SYMBOLS[1], ordinal: "2", callee: "_memset_s" }], ordinary_memset_secret_calls: "0", fallback_symbols: [] };
  if (wipeObjectProjection.memset_s_undefined_symbol_count !== "1") refuse("MEMSET_SYMBOL_COUNT", "PROJECTION");
  const wipeDisassemblyProjection = { schema: "obs-chain-helper-wipe-disassembly/v1", build_output_sha256: executableHash, function: REQUIRED_SYMBOLS[1], function_instructions_sha256: instructionHash, memset_s_call_offsets: executableWipe.calls.map((call) => hex(call.offset)), memset_s_call_targets: ["_memset_s", "_memset_s"], cleanup_predecessors: PREDECESSORS, exit_without_cleanup_paths: "0" };
  const secretBuffers = [{ name: "key_read_buffer", capacity: "256", stack_start: hex(executableSession.intervals[0].start), stack_end: hex(executableSession.intervals[0].end) }, { name: "key_frame_buffer", capacity: "768", stack_start: hex(executableSession.intervals[1].start), stack_end: hex(executableSession.intervals[1].end) }];
  const objectRecord = { filetype: "mh_object", architecture: "arm64", session_bounds: { start: hex(objectFns[0].start), end: hex(objectFns[0].end) }, wipe_bounds: { start: hex(objectFns[1].start), end: hex(objectFns[1].end) }, wipe_instruction_sha256: objectSpanHash, memset_s_calls: objectWipe.calls.map((call) => ({ offset: hex(call.offset), relocation: call.relocation, target: call.target })) };
  const executableRecord = { filetype: "mh_execute", architecture: "arm64", minos: parsedExecutable.build.minos, session_bounds: { start: hex(executableFns[0].start), end: hex(executableFns[0].end) }, wipe_bounds: { start: hex(executableFns[1].start), end: hex(executableFns[1].end) }, wipe_instruction_sha256: executableSpanHash, memset_s_calls: executableWipe.calls.map((call) => ({ offset: hex(call.offset), stub_offset: hex(call.stubOffset), target: call.target })) };
  const output = { schema: "obs-chain-helper-wipe-verifier-output/v1", verifier_source_sha256: manifest.wipe_verifier_source_sha256, verifier_runtime_sha256: manifest.wipe_verifier_runtime_sha256, input_sha256: input.inputSha256, source_sha256: manifest.source_sha256, object_output_sha256: objectHash, build_output_sha256: executableHash, deployment_contract_sha256: manifest.deployment_contract_sha256, artifact_command_set_sha256: manifest.artifact_command_set_sha256, object: objectRecord, executable: executableRecord, macho_projection: machoProjection, wipe_object_projection: wipeObjectProjection, wipe_disassembly_projection: wipeDisassemblyProjection, secret_buffers: secretBuffers, cleanup_cfg: executableSession.cleanupCfg, cleanup_cfg_sha256: executableSession.cleanupCfgSha256, cleanup_predecessors: PREDECESSORS, reachable_exits: [{ offset: executableSession.exit.offset, kind: "return", predecessors: [...PREDECESSORS].sort(), wipe_call_offset: hex(executableSession.wipeOffset), zero_scan_call_offset: hex(executableSession.zeroOffset) }], exit_without_cleanup_paths: "0", memset_s_call_count: "2", secret_buffer_count: "2" };
  if (!HEX64.test(digest("obs-chain-helper-macho-projection/v1", [canonicalBytes(machoProjection)])) || !HEX64.test(digest("obs-chain-helper-wipe-object/v1", [canonicalBytes(wipeObjectProjection)])) || !HEX64.test(digest("obs-chain-helper-wipe-disassembly/v1", [canonicalBytes(wipeDisassemblyProjection)]))) refuse("PROJECTION_HASH", "PROJECTION");
  fs.writeSync(1, canonicalBytes(output));
}

try {
  main();
} catch (error) {
  const failure = error instanceof Refusal ? error : new Refusal("INTERNAL", "VERIFIER");
  fs.writeSync(2, canonicalBytes({ schema: "obs-chain-helper-wipe-verifier-error/v1", code: failure.code, phase: failure.phase }));
  process.exitCode = 1;
}
```

---

## Appendix A — literal fact capture

Open a fresh shell in the controller repository. Create two new mode-0700 roots with exact `mktemp -d /private/tmp/fix09-v16-base.XXXXXXXX` and `mktemp -d /private/tmp/fix09-v16-validation.XXXXXXXX`. Use this byte-exact function; it records facts and makes no PASS claim:

```bash
fix09_capture_fact() {
  local evidence_root="$1"
  local command_id="$2"
  local ordinal="$3"
  local command_cwd="$4"
  shift 4
  test "$1" = "--"
  shift
  /Users/vladmihaimiron/.local/bin/node - "$evidence_root" "$command_id" "$ordinal" "$command_cwd" "$@" <<'FIX09_CAPTURE_V2'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");
const [rootInput,id,ordinal,cwdInput,...argv] = process.argv.slice(2);
if (!/^(t0|h0|r0)-[0-9]{3}$/.test(id) || !/^[1-9][0-9]*$/.test(ordinal) || argv.length === 0) throw new Error("FIX09_CAPTURE_GRAMMAR");
if (argv.some((value) => value.includes("\0"))) throw new Error("FIX09_CAPTURE_NUL");
const stable = (value) => value === null || typeof value === "boolean" || typeof value === "string"
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : (() => { throw new Error("FIX09_CAPTURE_TYPE"); })();
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = fs.realpathSync(rootInput); const cwd = fs.realpathSync(cwdInput);
if (!fs.lstatSync(root).isDirectory() || (fs.statSync(root).mode & 0o777) !== 0o700) throw new Error("FIX09_CAPTURE_ROOT");
const prefix = `${ordinal.padStart(3,"0")}-${id}`;
const stdoutName = `${prefix}.stdout`; const stderrName = `${prefix}.stderr`; const factName = `${prefix}.command.json`;
const stdoutPath = path.join(root,stdoutName); const stderrPath = path.join(root,stderrName); const factPath = path.join(root,factName);
const stdoutFd = fs.openSync(stdoutPath,"wx",0o600); const stderrFd = fs.openSync(stderrPath,"wx",0o600);
const environment = {PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"};
const run = child.spawnSync(argv[0],argv.slice(1),{cwd,env:environment,shell:false,stdio:["ignore",stdoutFd,stderrFd]});
if (run.error) fs.writeSync(stderrFd,Buffer.from(`FIX09_CAPTURE_SPAWN_ERROR ${run.error.code || "UNKNOWN"}\n`));
fs.fsyncSync(stdoutFd); fs.fsyncSync(stderrFd); fs.closeSync(stdoutFd); fs.closeSync(stderrFd);
fs.chmodSync(stdoutPath,0o400); fs.chmodSync(stderrPath,0o400);
const stdout = fs.readFileSync(stdoutPath); const stderr = fs.readFileSync(stderrPath);
const fact = {schema:"fix09-task0-command/v2",id,ordinal,cwd,argv,environment:["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"],exit_code:run.status === null ? null : String(run.status),signal:run.signal === null ? null : String(run.signal),stdout:{path:stdoutName,bytes:String(stdout.length),sha256:sha256(stdout),mode:"0400"},stderr:{path:stderrName,bytes:String(stderr.length),sha256:sha256(stderr),mode:"0400"}};
const temporary = `${factPath}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`; const fd = fs.openSync(temporary,"wx",0o600);
fs.writeFileSync(fd,Buffer.from(stable(fact))); fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(temporary,factPath); fs.chmodSync(factPath,0o400);
const rootFd = fs.openSync(root,fs.constants.O_RDONLY); fs.fsyncSync(rootFd); fs.closeSync(rootFd);
FIX09_CAPTURE_V2
}
```

Use this byte-exact structural finalizer only after all ledger commands exist:

```bash
fix09_finalize_facts() {
  local evidence_root="$1"
  /Users/vladmihaimiron/.local/bin/node - "$evidence_root" <<'FIX09_FINALIZE_V2'
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const stable=(v)=>v===null||typeof v==="boolean"||typeof v==="string"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
const hash=(b)=>crypto.createHash("sha256").update(b).digest("hex"); const root=fs.realpathSync(process.argv[2]);
const names=fs.readdirSync(root).sort(); const commandNames=names.filter((name)=>name.endsWith(".command.json")); if(commandNames.length===0)throw Error("FIX09_FACT_EMPTY");
const commands=commandNames.map((name,index)=>{const bytes=fs.readFileSync(path.join(root,name));const value=JSON.parse(bytes);if(stable(value)!==bytes.toString("utf8")||value.ordinal!==String(index+1)||name!==`${value.ordinal.padStart(3,"0")}-${value.id}.command.json`)throw Error("FIX09_FACT_RECORD");for(const stream of [value.stdout,value.stderr]){const target=path.join(root,stream.path),body=fs.readFileSync(target);if((fs.statSync(target).mode&0o777)!==0o400||String(body.length)!==stream.bytes||hash(body)!==stream.sha256)throw Error("FIX09_FACT_STREAM");}return value;});
const expected=commands.flatMap((value)=>[`${value.ordinal.padStart(3,"0")}-${value.id}.command.json`,value.stdout.path,value.stderr.path]).sort();if(stable(names)!==stable(expected))throw Error("FIX09_FACT_EXTRA");
const manifest={schema:"fix09-task0-evidence-manifest/v2",evidence_root:root,command_count:String(commands.length),commands};const output=path.join(root,"manifest.json"),temporary=`${output}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(temporary,"wx",0o600);fs.writeFileSync(fd,Buffer.from(stable(manifest)));fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(temporary,output);fs.chmodSync(output,0o400);const rootFd=fs.openSync(root,fs.constants.O_RDONLY);fs.fsyncSync(rootFd);fs.closeSync(rootFd);fs.chmodSync(root,0o500);
FIX09_FINALIZE_V2
}
```

---

## Appendix B — complete literal ledgers

The constants are:

```text
CONTROLLER=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine
ADMISSION_ROOT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v16
ADMISSION=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v16/dialectical-engine
ADMISSION_BRANCH=codex/fix09-c35-admission-v16
PROGRAM=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16.mjs
CANDIDATE=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-candidate.receipt
RESULT=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-result.receipt
REVIEW=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-review.md
BASE_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-base-manifest.json
CANDIDATE_VALIDATION_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-candidate-validation-manifest.json
RESULT_VALIDATION_MANIFEST=/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-result-validation-manifest.json
```

In the following canonical JSON arrays, those eleven uppercase strings are presentation aliases only. Before execution, replace each entire JSON string value with the exact corresponding value above. No substring, shell, environment, or other substitution exists. The validator performs the same element equality after alias expansion from its own eleven constants.

### Base ledger

```json
[
{"argv":["/usr/bin/git","rev-parse","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-001","ordinal":"1","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","rev-parse","HEAD^"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-002","ordinal":"2","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"fd2836f4539c34852d0985b777907bc803ee2bff\n"}},
{"argv":["/usr/bin/git","show","-s","--format=%s","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-003","ordinal":"3","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"docs(obs): reconcile FIX-09 v16 paper evidence\n"}},
{"argv":["/usr/bin/git","diff-tree","--no-commit-id","--name-only","-r","HEAD"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-004","ordinal":"4","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v16.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v16.md\n"}},
{"argv":["/usr/bin/git","rev-parse","HEAD^{tree}","HEAD:./docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-005","ordinal":"5","stderr_parser":{"kind":"empty"},"stdout_parser":{"count":"2","kind":"sha40_lines"}},
{"argv":["/usr/bin/git","merge-base","HEAD","e7b9f6812cafc8808cf5e188cd6440f19beda831"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-006","ordinal":"6","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"2b670d3059c60d7262cf655bd5d402c88100dff3\n"}},
{"argv":["/usr/bin/git","merge-base","HEAD","8619b9ab4dbc01fdd166337a641193675b24380a"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-007","ordinal":"7","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"2b670d3059c60d7262cf655bd5d402c88100dff3\n"}},
{"argv":["/usr/bin/git","merge-base","e7b9f6812cafc8808cf5e188cd6440f19beda831","24d0b3e5de84876b6b46fa84b13a0a42aa2640a4"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-008","ordinal":"8","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8\n"}},
{"argv":["/usr/bin/git","worktree","add","-b","ADMISSION_BRANCH","ADMISSION_ROOT","refs/heads/codex/fixagent-plan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-009","ordinal":"9","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"any"}},
{"argv":["/usr/bin/git","status","--porcelain=v1","--untracked-files=all"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-010","ordinal":"10","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","merge","--no-ff","--no-commit","e7b9f6812cafc8808cf5e188cd6440f19beda831"],"cwd":"ADMISSION","expected_exit_code":"1","expected_signal":null,"id":"t0-011","ordinal":"11","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-012","ordinal":"12","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-02/DECISIONS.md\n"}},
{"argv":["/usr/bin/git","restore","--source=e7b9f6812cafc8808cf5e188cd6440f19beda831","--staged","--worktree","--","docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-013","ordinal":"13","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse",":dialectical-engine/docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-014","ordinal":"14","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"0e2ffc4fc4f148520f228a9f69014f2ad7d5416c\n"}},
{"argv":["/usr/bin/git","-c","user.name=FIX09-Admission","-c","user.email=fix09-admission@invalid","commit","-m","chore(obs): admit FIX-02 writer line"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-015","ordinal":"15","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","cherry-pick","24d0b3e5de84876b6b46fa84b13a0a42aa2640a4"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-016","ordinal":"16","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-017","ordinal":"17","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse","HEAD:./tests/unit/fix01-runtime-readiness.test.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-018","ordinal":"18","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd\n"}},
{"argv":["/usr/bin/git","merge","--no-ff","--no-commit","8619b9ab4dbc01fdd166337a641193675b24380a"],"cwd":"ADMISSION","expected_exit_code":"1","expected_signal":null,"id":"t0-019","ordinal":"19","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","diff","--name-only","--diff-filter=U"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-020","ordinal":"20","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"exact_utf8","value":"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\n"}},
{"argv":["/usr/bin/git","restore","--source=refs/heads/codex/fixagent-plan","--staged","--worktree","--","docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-021","ordinal":"21","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse",":dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-022","ordinal":"22","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","-c","user.name=FIX09-Admission","-c","user.email=fix09-admission@invalid","commit","-m","chore(obs): admit FIX-09 listener line"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-023","ordinal":"23","stderr_parser":{"kind":"any"},"stdout_parser":{"kind":"nonempty_utf8"}},
{"argv":["/usr/bin/git","status","--porcelain=v1","--untracked-files=all"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-024","ordinal":"24","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"empty"}},
{"argv":["/usr/bin/git","rev-parse","HEAD"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-025","ordinal":"25","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"sha40_lf"}},
{"argv":["/usr/bin/git","rev-parse","HEAD","HEAD^","HEAD^2","HEAD^{tree}","--abbrev-ref","HEAD"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-026","ordinal":"26","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"head_topology"}},
{"argv":["/usr/bin/git","rev-parse","--path-format=absolute","--git-common-dir","--show-toplevel"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-027","ordinal":"27","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"common_worktree"}},
{"argv":["/usr/bin/git","ls-tree","-r","--full-tree","HEAD","--",":(top)dialectical-engine/migrations/0034_obs_foundation.sql",":(top)dialectical-engine/migrations/0061_obs_job_lifecycle_taxonomy.sql",":(top)dialectical-engine/migrations/0062_fix09_listener_fold.sql",":(top)dialectical-engine/packages/db/src/obs-schema.ts",":(top)dialectical-engine/packages/obs-capture/package.json",":(top)dialectical-engine/packages/obs-capture/src/envelope-contract.ts",":(top)dialectical-engine/packages/obs-capture/src/runtime/config.ts",":(top)dialectical-engine/packages/obs-capture/src/runtime/drain.ts",":(top)dialectical-engine/packages/obs-capture/src/runtime/index.ts",":(top)dialectical-engine/packages/obs-capture/src/runtime/sink.ts",":(top)dialectical-engine/tests/unit/fix01-runtime-readiness.test.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/cursor.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/dispatch-arm.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/fold.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/main.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/poison.ts",":(top)dialectical-engine/tools/obs-listener/src/daemon/tracer-hook.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-028","ordinal":"28","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"source_map_17"}},
{"argv":["/usr/bin/shasum","-a","256","tests/unit/fixtures/fix09-interface-contract.ts","tools/obs-listener/src/daemon/dispatch-arm.ts","tools/obs-listener/src/daemon/tracer-hook.ts"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-029","ordinal":"29","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"c1_sha256_3"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","writer-scan"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-030","ordinal":"30","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"writer_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","grant-scan"],"cwd":"ADMISSION","expected_exit_code":"0","expected_signal":null,"id":"t0-031","ordinal":"31","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"grant_json"}},
{"argv":["/usr/bin/git","for-each-ref","--format=%(refname)"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-032","ordinal":"32","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"refs"}},
{"argv":["/usr/bin/git","for-each-ref","--format=%(refname)","refs/heads","refs/remotes"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-033","ordinal":"33","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"branch_refs"}},
{"argv":["/usr/bin/git","worktree","list","--porcelain","-z"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-034","ordinal":"34","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"worktree_registry"}},
{"argv":["/usr/bin/git","rev-list","--objects","--all"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-035","ordinal":"35","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"object_paths"}},
{"argv":["/usr/bin/git","log","--all","--name-only","--pretty=format:"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-036","ordinal":"36","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"history_paths"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","ref-tip-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-037","ordinal":"37","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"ref_tip_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","worktree-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-038","ordinal":"38","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"worktree_json"}},
{"argv":["/Users/vladmihaimiron/.local/bin/node","PROGRAM","paper-scan"],"cwd":"CONTROLLER","expected_exit_code":"0","expected_signal":null,"id":"t0-039","ordinal":"39","stderr_parser":{"kind":"empty"},"stdout_parser":{"kind":"security_scan_json"}}
]
```

### Candidate-validation ledger

This table is a human-readable projection, not an argv template. The executable ledger is exactly the `candidateLedger(BASE_MANIFEST)` constructor in Appendix C: it expands every row to the fixed absolute cwd, six literal argv values, null signal, and the exact stream parsers. Implementers must iterate that returned array without editing or synthesizing argv. The closed projection is:

```json
[
{"id":"t0-040","mutant":"NONE","ordinal":"1","expected_exit_code":"0","stdout":"FIX09_CANDIDATE_PASS\n","stderr":""},
{"id":"h0-001","mutant":"AUTHORITY_TREE","ordinal":"2","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_TREE\n"},
{"id":"h0-002","mutant":"AUTHORITY_SUBJECT","ordinal":"3","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_SUBJECT\n"},
{"id":"h0-003","mutant":"AUTHORITY_SCOPE","ordinal":"4","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_AUTHORITY_SCOPE\n"},
{"id":"h0-004","mutant":"MERGE_PARENT","ordinal":"5","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_PARENT\n"},
{"id":"h0-005","mutant":"MERGE_ORDER","ordinal":"6","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_ORDER\n"},
{"id":"h0-006","mutant":"MERGE_CONFLICT","ordinal":"7","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_CONFLICT\n"},
{"id":"h0-007","mutant":"MERGE_RESOLUTION","ordinal":"8","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MERGE_RESOLUTION\n"},
{"id":"h0-008","mutant":"SOURCE_MAP","ordinal":"9","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_SOURCE_MAP\n"},
{"id":"h0-009","mutant":"C1_MAP","ordinal":"10","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_C1_MAP\n"},
{"id":"h0-010","mutant":"WRITER_MAP","ordinal":"11","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_WRITER_MAP\n"},
{"id":"h0-011","mutant":"COLLISION_COUNT","ordinal":"12","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COLLISION_COUNT\n"},
{"id":"h0-012","mutant":"COLLISION_SCOPE","ordinal":"13","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COLLISION_SCOPE\n"},
{"id":"h0-013","mutant":"MANIFEST_STDOUT","ordinal":"14","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_STDOUT\n"},
{"id":"h0-014","mutant":"MANIFEST_RC","ordinal":"15","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_RC\n"},
{"id":"h0-015","mutant":"MANIFEST_HASH","ordinal":"16","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_MANIFEST_HASH\n"},
{"id":"h0-016","mutant":"BRANCH","ordinal":"17","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_BRANCH\n"},
{"id":"h0-017","mutant":"COMMON_DIR","ordinal":"18","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_COMMON_DIR\n"},
{"id":"h0-018","mutant":"WORKTREE_REGISTRY","ordinal":"19","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_WORKTREE_REGISTRY\n"},
{"id":"h0-019","mutant":"RECEIPT_WIRE","ordinal":"20","expected_exit_code":"1","stdout":"","stderr":"FIX09_CANDIDATE_FAIL code=FIX09_RECEIPT_WIRE\n"}
]
```

### Result-validation ledger

After the reviewer writes the report and 17-field result, use a third fresh mode-0700 directory. This table is a projection only. The executable ledger is exactly `resultLedger(BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST)` in Appendix C: it expands every row to the fixed absolute cwd, ten literal argv values including `RESULT_SECURITY_SCAN`, null signal, and exact stream parsers. Implementers must iterate it without editing or synthesizing argv:

```json
[
{"id":"r0-001","mutant":"NONE","ordinal":"1","expected_exit_code":"0","stdout":"FIX09_RESULT_PASS\n","stderr":""},
{"id":"r0-002","mutant":"REVIEW_HASH","ordinal":"2","expected_exit_code":"1","stdout":"","stderr":"FIX09_RESULT_FAIL code=FIX09_REVIEW_HASH\n"},
{"id":"r0-003","mutant":"REVIEW_VERDICT","ordinal":"3","expected_exit_code":"1","stdout":"","stderr":"FIX09_RESULT_FAIL code=FIX09_REVIEW_VERDICT\n"}
]
```

The result-validation manifest is downstream evidence and is not embedded in the result. C3.5 requires it at the fixed report root and independently replays it; this is the noncircular final readback.

---

## Appendix C — literal scanner and validator program

Task 0 writes the following bytes exactly to `PROGRAM` with mode `0500`, regular-file/nlink-one/no-symlink checks, file fsync, atomic rename, and parent-directory fsync. Its SHA-256 is recorded after the source block and checked before every t0-030/031/037/038/039/040/r0 invocation.

```js
// FIX09_TASK0_V16_PROGRAM_BEGIN
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";

const CAPTURED_OPEN=fs.openSync.bind(fs),CAPTURED_FSTAT=fs.fstatSync.bind(fs),CAPTURED_LSTAT=fs.lstatSync.bind(fs),CAPTURED_READ=fs.readFileSync.bind(fs),CAPTURED_CLOSE=fs.closeSync.bind(fs),CAPTURED_REALPATH=fs.realpathSync.native.bind(fs.realpathSync),CAPTURED_RESOLVE=path.resolve.bind(path),CAPTURED_SEP=path.sep;
const CAPTURED_O_RDONLY=fs.constants.O_RDONLY,CAPTURED_O_NOFOLLOW=fs.constants.O_NOFOLLOW;
const CAPTURED_IO=Object.freeze({closeSync:CAPTURED_CLOSE,fstatSync:CAPTURED_FSTAT,lstatSync:CAPTURED_LSTAT,openSync:CAPTURED_OPEN,readFileSync:CAPTURED_READ,realpathSyncNative:CAPTURED_REALPATH});
let FIXTURE_IO_ALLOWED=false;

const REAL_CONTROLLER="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine";
const REAL_PROGRAM="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16.mjs";
const INVOKED_PROGRAM=fs.realpathSync(process.argv[1]),INVOKED_DIR=path.dirname(INVOKED_PROGRAM),INVOKED_DIR_NAME=path.basename(INVOKED_DIR),SHADOW_MATCH=INVOKED_DIR_NAME.match(/^fix09-v16-shadow\.([A-Za-z0-9]{8})$/),IS_SHADOW=INVOKED_PROGRAM!==REAL_PROGRAM;
if(IS_SHADOW&&(!SHADOW_MATCH||path.basename(INVOKED_PROGRAM)!=="fix09-task0-v16-shadow.mjs"||!INVOKED_DIR.startsWith("/private/tmp/")))throw Error("FIX09_DIAGNOSTIC_PATH");
const SHADOW_TOKEN=IS_SHADOW?SHADOW_MATCH[1]:null;
const CONTROLLER=IS_SHADOW?`${INVOKED_DIR}/controller-root/dialectical-engine`:REAL_CONTROLLER;
const ADMISSION=IS_SHADOW?`${INVOKED_DIR}/zz-admission-root`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v16";
const ENGINE=`${ADMISSION}/dialectical-engine`;
const COMMON=IS_SHADOW?`${INVOKED_DIR}/controller-root/.git`:"/Users/vladmihaimiron/Documents/DebateAIRO/.git";
const PROGRAM=IS_SHADOW?INVOKED_PROGRAM:REAL_PROGRAM;
const PLAN="docs/missions/observability-agents/slices/FIX-09/PLAN-v16.md";
const ADMISSION_BRANCH=IS_SHADOW?`codex/fix09-v16-shadow-${SHADOW_TOKEN}`:"codex/fix09-c35-admission-v16";
const CANDIDATE=IS_SHADOW?`${INVOKED_DIR}/candidate.receipt`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-candidate.receipt";
const RESULT=IS_SHADOW?`${INVOKED_DIR}/result.receipt`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-result.receipt";
const REVIEW=IS_SHADOW?`${INVOKED_DIR}/review.md`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-review.md";
const BASE_MANIFEST=IS_SHADOW?`${INVOKED_DIR}/base/manifest.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-base-manifest.json";
const CANDIDATE_VALIDATION_MANIFEST=IS_SHADOW?`${INVOKED_DIR}/validation/manifest.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-candidate-validation-manifest.json";
const RESULT_VALIDATION_MANIFEST=IS_SHADOW?`${INVOKED_DIR}/result-validation/manifest.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-result-validation-manifest.json";
const DERIVE_SECURITY_SCAN=IS_SHADOW?`${INVOKED_DIR}/derive-security-scan.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-derive-security-scan.json";
const CANDIDATE_SECURITY_SCAN=IS_SHADOW?`${INVOKED_DIR}/candidate-security-scan.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-candidate-security-scan.json";
const RESULT_SECURITY_SCAN=IS_SHADOW?`${INVOKED_DIR}/result-security-scan.json`:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v16-result-security-scan.json";
const F1="24d0b3e5de84876b6b46fa84b13a0a42aa2640a4",F2="e7b9f6812cafc8808cf5e188cd6440f19beda831",F9="8619b9ab4dbc01fdd166337a641193675b24380a";
const INTEGRATION="2b670d3059c60d7262cf655bd5d402c88100dff3",F1BASE="bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8";
const EMPTY_SHA="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ENV=["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"];
const RX=/(^|\/)(migrations|packages\/db\/src\/migrations)\/0064[^/]*\.sql$/;
const SCOPE={claim:"migrations/0064_fix09_audit_chain.sql",excluded:[".git","node_modules","private-key-material"],paper:["all-ref-tips","all-registered-worktrees"],path_regex:"(^|/)(migrations|packages/db/src/migrations)/0064[^/]*\\.sql$",tracked:["all-reachable-objects","all-reachable-history","all-ref-tip-trees","all-registered-worktrees"],untracked:["all-registered-worktrees-nonignored"]};
const ROW_RX=/(?<![\p{L}\p{N}_])INSERT\s+INTO\s+obs\.(occurrence|agent_action)(?![\p{L}\p{N}_])/giu;
const DETAIL_RX=/(?<![\p{L}\p{N}_])INSERT\s+INTO\s+obs\.occurrence_detail(?![\p{L}\p{N}_])/giu;
const CLAIM_RX=/(?<![\p{L}\p{N}_])0064(?:_fix09_audit_chain)?(?:\.sql)?(?![\p{L}\p{N}_])/giu;
const FIX09_AUTHORITY_DIR="dialectical-engine/docs/missions/observability-agents/slices/FIX-09";
const AUTHORITY_PREDECESSORS=["bcae759eec5a2e6987ef49e2f3ad82919807a85a","2ab5f78f00cde444dc33a99e444dd14aeec9881d","0e1fe1807aa2a4706b2438024a6b85f9c1a5f2ca","25ffdbc5e58625f4732ac023e55a2903c15469b9","98cdadce80759cbc30856dd5ff8ba7c187019e35","af9751e168575921b5e8c7a5aa350137e54135f5","bf6993aa00b0ecfd27bbea4c8d133bfe06aa5c5f","e0a3a8cbfb6a5f0284f85d8c42f65afe044e66b0","5e9ba1611ee98c7c77649d1ece527a1b10efc7b1","dd7b84959aaa95dfaf40ccf4f7b2396c25a32848","f73d9a8e785572193f9ab3676c8ae521196e0913","fd2836f4539c34852d0985b777907bc803ee2bff","c825d75d20782e4cd8390977135ddb8cfafc40c6"];
const AUTHORITY_PATHS=[`${FIX09_AUTHORITY_DIR}/DECISIONS.md`,...Array.from({length:13},(_,i)=>`${FIX09_AUTHORITY_DIR}/SPEC-v${i+4}.md`),...Array.from({length:13},(_,i)=>`${FIX09_AUTHORITY_DIR}/PLAN-v${i+4}.md`)];
const PREVIOUS_AUTHORITY_REF="c825d75d20782e4cd8390977135ddb8cfafc40c6",PREVIOUS_AUTHORITY_PARENT="fd2836f4539c34852d0985b777907bc803ee2bff",PREVIOUS_AUTHORITY_TREE="d3b8d1bb380dcde1e2be7c63e3cd987bdbdd08d3";
const PREVIOUS_AUTHORITY_DOCS=Object.freeze({"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md":Object.freeze({blob:"80d0b8fa1b19b8a39e4d4e7cae84e4f39e2e14a0",content_sha256:"147e2cba893d26057c0b1b758518c10a958fe6c7657dd0004392c3626c7cf7da"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v15.md":Object.freeze({blob:"a76f485ed641acce6e37fea78d03f07751155e4f",content_sha256:"2ece72171172b39dcbbeec9e946a192ff3dfa93488eca8b4b8571de581f19ef4"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v15.md":Object.freeze({blob:"3cf2e7edc62671ffd9629e6a5290405f6aa300cb",content_sha256:"9267e45aabd3b3ee149412dfb7bed8122ef374ae034aa722464511ee78b20129"})});
const FIX10_DEPENDENCY_REF="a539ba114bd80e9234c08ba77c75772d0d111d94",FIX10_DEPENDENCY_PARENT="e3f613efbad63ffdc72b3494143c45583e3738f9",FIX10_DEPENDENCY_TREE="5012c7a196d6977af41a888817b336b4248605e9";
const FIX10_DEPENDENCY_DOCS=Object.freeze({"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md":Object.freeze({blob:"cb3c71265b43502e55acad5cd083f829d55f035e",content_sha256:"866212f1b760dec71532ada2bc125dbaefb574bc13687eebb4629548714c1353"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/PLAN-v9.md":Object.freeze({blob:"6eced95012f9d9b8fe58c903a4e580f5e0743f2e",content_sha256:"2de04eadba64b34a7b3c1e5da69b1ee3cf7ec33e8dd34a1a69999b1d84e9f012"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v9.md":Object.freeze({blob:"34de70265e0f1256d2f71197e15619374f0685de",content_sha256:"9d87002fd20287285c72f0d7b7913b3b576dabb862f774f81312664b8de58326"})});
const FIX10_DEPENDENCY_ALLOW=Object.freeze({"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md":FIX10_DEPENDENCY_DOCS["dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md"],"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/PLAN-v4.md":Object.freeze({blob:"86aa393da047443810ca7e353e82c49a2b14706c",content_sha256:"108ff4ca04e17ad62f217d99c4894985626291750260d54c5ae290507da24042"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v4.md":Object.freeze({blob:"c4428c80fc12334d378540a62b552fd8f6afcf70",content_sha256:"ffa5d6e5a57ac89a553dc916e0a0eef58066b56ba8ec4e8a11e1130a72d0e975"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v6.md":Object.freeze({blob:"7fd0e0dbb76e83acb1d5df74736c9591adf13932",content_sha256:"56263e65ad181c6c66d9c84fc38c9b2a4ace75d01073d9f80059476291af1d77"})});
const PRESERVED_FAILURE_CLAIM_KEYS=Object.freeze(["branch_ref","blob","content_sha256","line","line_sha256","mode","owner","path","tip","token","tracked_clean"]);
const PRESERVED_FAILURE_STATE_KEYS=Object.freeze(["branch_ref","blob","mode","owner","path","tip","tracked_clean"]);
const CANONICAL_PRESERVED_FAILURE_CLAIMS=Object.freeze([
  Object.freeze({branch_ref:"refs/heads/codex/fix09-c35-admission",blob:"7b3407d43bff10c572bb6413c06e2c52fcee1ac6",content_sha256:"2b3c3737f166d5e6fb25a467bc27772e168be0e8bc8f499a73ce7fda5c93ee0f",line:"20",line_sha256:"72dd1f5a244c325fe3f8e27b10003e65b6f9b4685d8a392f130210c314cd520f",mode:"100644",owner:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission",path:"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md",tip:"c20e38f1695ecbf72ab2624c9f72dfe4e634d07b",token:"0064",tracked_clean:"1"}),
  Object.freeze({branch_ref:"refs/heads/codex/fix09-c35-admission-v11",blob:"7b3407d43bff10c572bb6413c06e2c52fcee1ac6",content_sha256:"2b3c3737f166d5e6fb25a467bc27772e168be0e8bc8f499a73ce7fda5c93ee0f",line:"20",line_sha256:"72dd1f5a244c325fe3f8e27b10003e65b6f9b4685d8a392f130210c314cd520f",mode:"100644",owner:"/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v11",path:"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md",tip:"61313a1d89cd354743f8bc94329f716fe4f2bdf5",token:"0064",tracked_clean:"1"})
]);
const PRESERVED_FAILURE_CLAIMS=IS_SHADOW?Object.freeze(CANONICAL_PRESERVED_FAILURE_CLAIMS.map((entry,index)=>Object.freeze({...entry,owner:`${INVOKED_DIR}/preserved-v${index===0?"10":"11"}`}))):CANONICAL_PRESERVED_FAILURE_CLAIMS;
const FIX10_REVIEW="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix10-control-authority-sol-review-round8.md",FIX10_REVIEW_BLOB="b9b52407e4978ea78bf354df3d3ca33f2f154418",FIX10_REVIEW_SHA256="637f707109790d9799016dd2ba440d4974819367a1bb0fd1ddae0d8654d5006b";
const HISTORICAL_PATH="dialectical-engine/docs/missions/observability-agents/plans/PLAN-FixAgent.md";
const HISTORICAL_LINE_SHA256="5ed8a3e77f03d20264ae0af6c1b626e10654007fc28d7e27fc69b797bfa4587d";
const HISTORICAL_LINE="**Status: C1-C3 PASS; C4 BLOCKED on V crypto/custody ruling and successor chain authority.** C1 is complete through `daa8908d`; fresh independent Sol review returned SPEC PASS / CODE QUALITY PASS with no P0-P3 findings. The focused C1 suite passed 79/79 ×3, exact authority attacks passed 3/3 ×3, and the canonical hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`. C2 authority was reconciled in successor SPEC/PLAN packets, including the listener-safe occurrence advisory lock, and the implementation plus review fixes are complete through `4d598fd9`; the final fresh Sol review returned SPEC PASS / CODE QUALITY PASS. The focused C2 unit + real-PostgreSQL suite passed 20/20 ×3, adjacent S01+C1 passed 91/91, and the ordering, fingerprint-version, leader/cap-one, exact-grant, and terminal-receipt mutants were killed. C3 is complete at `8619b9ab`; fresh Sol review returned SPEC PASS / CODE QUALITY PASS with no P0-P3 findings, focused tests passed 8/8 ×3, adjacent C1/C2 passed 99/99, and deterministic-payload, atomic rollback/replay, zero-budget, and no-model/import boundaries passed. C4 preflight stopped before edits: real occurrence/action writers do not populate chains, `agent_action` cannot represent the frozen partition, canonical bytes and key lifecycle are undefined, and HMAC verification would give the read-only watchdog forge authority. A V crypto/custody ruling, FIX-09/FIX-10 successor authority, and a freshly audited `0064` chain migration/library/writer slice must precede C4. Runtime/V acceptance remains pending; no production acceptance is claimed.";
const WRITERS=["occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences","occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence","agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt","agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt","future_agent_action|FIX-10|ops|obsctl"];
const SOURCE_PATHS=["migrations/0034_obs_foundation.sql","migrations/0061_obs_job_lifecycle_taxonomy.sql","migrations/0062_fix09_listener_fold.sql","packages/db/src/obs-schema.ts","packages/obs-capture/package.json","packages/obs-capture/src/envelope-contract.ts","packages/obs-capture/src/runtime/config.ts","packages/obs-capture/src/runtime/drain.ts","packages/obs-capture/src/runtime/index.ts","packages/obs-capture/src/runtime/sink.ts","tests/unit/fix01-runtime-readiness.test.ts","tools/obs-listener/src/daemon/cursor.ts","tools/obs-listener/src/daemon/dispatch-arm.ts","tools/obs-listener/src/daemon/fold.ts","tools/obs-listener/src/daemon/main.ts","tools/obs-listener/src/daemon/poison.ts","tools/obs-listener/src/daemon/tracer-hook.ts"];
const SOURCE_TREE_PATHS=SOURCE_PATHS.map(p=>`:(top)dialectical-engine/${p}`);
const RESOLUTION_PATHS=["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md","docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"];
const ROOT_INDEX_OBJECTS=RESOLUTION_PATHS.map(p=>`:dialectical-engine/${p}`),PACKAGE_INDEX_OBJECTS=RESOLUTION_PATHS.map(p=>`:./${p}`);
const GRANT_STATEMENTS=["CREATE SCHEMA IF NOT EXISTS obs;","GRANT USAGE ON SCHEMA obs TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;","export const obs = pgSchema(\"obs\");","export const obsOccurrence = obs.table(\"occurrence\", {","export const obsAgentAction = obs.table(\"agent_action\", {"];
const GRANT_SOURCE_PINS=Object.freeze({"migrations/0034_obs_foundation.sql":Object.freeze({blob:"ace8fa889f24a3d23b79cbaa78878a2238d07b76",sha256:"ffea9b5f8daa4428d7f93603de6823570323ff2463ad9cee8a3912207f592be8"}),"packages/db/src/obs-schema.ts":Object.freeze({blob:"bcd2fac36c2460eb8b3d681a7c3ee914a8ce065e",sha256:"f3482c061ff478cdbdf0836bd2fefbdf86b075f73c9f84ff05443951190eb5f6"})});
const FUTURE_V16_FILES=[REAL_PROGRAM,CANDIDATE,RESULT,REVIEW,BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST,RESULT_VALIDATION_MANIFEST,DERIVE_SECURITY_SCAN,CANDIDATE_SECURITY_SCAN,RESULT_SECURITY_SCAN];
const FUTURE_V16_WORKTREE="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v16",FUTURE_V16_BRANCH="codex/fix09-c35-admission-v16";
const FAILED_V10_PROGRAM="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v10.mjs",FAILED_V10_MANIFEST="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-base-manifest-v8.json",FAILED_V10_REPORT="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-v9/task-0-admission-candidate-report.md",FAILED_V10_EVIDENCE="/private/tmp/fix09-v10-base.HcNB1bjq",FAILED_V10_EMPTY_DIAGNOSTIC="/private/tmp/fix09-v10-base.BasmMPNz",FAILED_V10_WORKTREE="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission",FAILED_V10_BRANCH="codex/fix09-c35-admission";
const FAILED_V10_PROGRAM_SHA256="1b3890e4dd2d0e9f1b304282faf510abd5dbce32253475a54f5339de2af6b4b7",FAILED_V10_MANIFEST_SHA256="58e71e509299b7a430a7432479644acd6fc1a435ede00bb76082ec4adb46b727",FAILED_V10_REPORT_SHA256="e07d3df52c6d6352c96f3058be59c12ed009a95d64e96137b60cc2b27dd02d47",FAILED_V10_TIP="c20e38f1695ecbf72ab2624c9f72dfe4e634d07b";
const FAILED_V11_PROGRAM="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v11.mjs",FAILED_V11_MANIFEST="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-task0-v11-base-manifest.json",FAILED_V11_REPORT="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-v9/task-0-v11-candidate-report.md",FAILED_V11_EVIDENCE="/private/tmp/fix09-v11-base.5jDJlL7H",FAILED_V11_EMPTY_VALIDATION="/private/tmp/fix09-v11-validation.3VkSa6YC",FAILED_V11_WORKTREE="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission-v11",FAILED_V11_BRANCH="codex/fix09-c35-admission-v11";
const FAILED_V11_PROGRAM_SHA256="aa188eee39897cacde21ba9885a01adf64f64db0c3258d281cf3e8cfea059ff1",FAILED_V11_MANIFEST_SHA256="80e15aa6521fa6de167124a38b91e078b3696327b30114d2efbe0119139cbb8a",FAILED_V11_REPORT_SHA256="da9dbfd3750895d73fd972c0e52e66b63dfb186998cafe91056013f539d78476",FAILED_V11_TIP="61313a1d89cd354743f8bc94329f716fe4f2bdf5";
const REJECTED_V12_REF="dd7b84959aaa95dfaf40ccf4f7b2396c25a32848",REJECTED_V12_PARENT="5e9ba1611ee98c7c77649d1ece527a1b10efc7b1",REJECTED_V12_TREE="9696c461a92450c4d965bae02c9223432606a7df";
const REJECTED_V12_DOCS=Object.freeze({"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md":Object.freeze({blob:"f3a66008ad44bf802e3dede6f6fede874f704d92",sha256:"9dd91f4fd44e3d91e557bca091a7e629a4609b3557587872940ce067417e2ea1"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v12.md":Object.freeze({blob:"e73cd5fa6e3e6c96e0dcb968852206cbff453419",sha256:"4ac31ef5036d7c60966bbcf4f05951139345923f54d41d78ec24ff6da677ece4"}),"dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v12.md":Object.freeze({blob:"b31a65720d7120a180339a09f5d525e8eac0667f",sha256:"292a404ca81a98b9015e6aa8f1bfa2ca2c8f5e4e663ca9e737ed4415eec2df66"})});
const REJECTED_V12_REVIEW="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-v12-admission-liveness-sol-review.md",REJECTED_V12_REVIEW_BLOB="27d955828c900f86a855af9dea67f9b191e25202",REJECTED_V12_REVIEW_SHA256="2e635db252905ac0e552b0808e4b6b83657ba32dd5ae29b32ba4206769bb2f0b";
const REJECTED_V12_REPORT="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/.superpowers/sdd/PLAN-FixAgent/fix09-v12-admission-liveness-implementation-report.md",REJECTED_V12_REPORT_BLOB="ac8b508f4d3d0301ae9d84b1523d5a0abae6ec28",REJECTED_V12_REPORT_SHA256="3ac5f6f7e2d5f69496b75d41a0fef47cf13e19376971fd7028be822f832b2d17";
const PAPER_SCAN_PAIR_LIMIT=3;
const PAPER_FATAL_CODES=Object.freeze(["FIX09_AUTHORITY_REF","FIX09_COLLISION_COUNT","FIX09_COLLISION_SCAN","FIX09_COLLISION_SCOPE","FIX09_DEPENDENCY_AUTHORITY","FIX09_GIT","FIX09_PAPER_AUTHORITY","FIX09_PAPER_CLAIM","FIX09_PAPER_TREE","FIX09_PAPER_UTF8","FIX09_PAPER_WORKTREE","FIX09_PROGRAM_AUTHORITY","FIX09_PROGRAM_HASH","FIX09_PROGRAM_MODE","FIX09_SECURITY_PROJECTION","FIX09_SECURITY_TRANSCRIPT","FIX09_UTF8"]);
const C35_PATHS=["tests/unit/fix09-capture-gate.test.ts","tests/unit/fix09-chain-canonical.test.ts","tests/unit/fix09-chain-keys.test.ts","tests/integration/fix09-chain-migration.test.ts","tests/integration/fix09-chain-occurrence.test.ts","tests/integration/fix09-chain-action.test.ts","tests/integration/fix09-chain-lifecycle.test.ts","tests/architecture/fix09-chain-grants.test.ts","tests/architecture/fix09-chain-writers.test.ts","tests/architecture/fix09-chain-privacy.test.ts","tests/architecture/fix09-fix10-chain-contract.test.ts"];
const C35_OLD_FIRST11=["tests/unit/fix09-capture-gate.test.ts","tests/unit/fix09-chain-canonical.test.ts","tests/unit/fix09-chain-keys.test.ts","tests/unit/fix09-watchdog-journal.test.ts","tests/integration/fix09-chain-migration.test.ts","tests/integration/fix09-chain-occurrence.test.ts","tests/integration/fix09-chain-action.test.ts","tests/integration/fix09-chain-lifecycle.test.ts","tests/integration/fix09-watchdog-verify.test.ts","tests/integration/fix09-watchdog.test.ts","tests/architecture/fix09-chain-grants.test.ts"];
const C4_ONLY_PATHS=["tests/unit/fix09-watchdog-journal.test.ts","tests/integration/fix09-watchdog-verify.test.ts","tests/integration/fix09-watchdog.test.ts"];
const C35_REPORTER_COUNT="118",C35_REPORTER_BYTES="12676",C35_REPORTER_SHA256="8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce";
const C1_CANONICAL="aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd";
const CANDIDATE_FIELDS=["schema","authority_commit","authority_parent","authority_tree","integration_base","fix01_shared_base","fix01_tip","fix02_head","fix09_head","composition_order","merge_fix02_conflict_paths","merge_fix02_resolution_blob","cherry_pick_fix01_conflict_paths","merge_fix09_conflict_paths","merge_fix09_resolution_blob","composition_result_commits","branch_name","worktree_canonical_path","git_common_dir_canonical_path","c35_baseline","c35_tree","clean_porcelain_sha256","source_blob_map","source_blob_extensions","writer_map","writer_map_sha256","c1_pin_map","schema_grant_probe_sha256","migration_collision_counts","migration_collision_scope","migration_collision_evidence_sha256","capture_evidence_manifest_sha256"];
const RESULT_FIELDS=["schema","candidate_receipt_path","candidate_receipt_sha256","admission_review_report_path","admission_review_report_sha256","receipt_validation_manifest_sha256","reviewer","reviewed_authority_commit","reviewed_c35_baseline","reviewed_c35_tree","spec_verdict","code_quality_verdict","p0_count","p1_count","p2_count","p3_count","result"];
const JSON_FIELDS=new Set(["composition_order","merge_fix02_conflict_paths","cherry_pick_fix01_conflict_paths","merge_fix09_conflict_paths","composition_result_commits","source_blob_map","source_blob_extensions","writer_map","c1_pin_map","migration_collision_counts","migration_collision_scope"]);
const stable=(v)=>v===null||typeof v==="boolean"||typeof v==="string"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:typeof v==="object"&&Object.getPrototypeOf(v)===Object.prototype?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:(()=>{throw Error("FIX09_JSON_TYPE")})();
const hash=(b)=>crypto.createHash("sha256").update(b).digest("hex");
const gitBlob=(b)=>crypto.createHash("sha1").update(Buffer.from(`blob ${b.length}\0`)).update(b).digest("hex");
const same=(a,b,c)=>{if(stable(a)!==stable(b))throw Error(c)};
const keys=(o,k,c)=>same(Object.keys(o).sort(),[...k].sort(),c);
const lines=(b)=>{const s=b.toString("utf8");if(!Buffer.from(s).equals(b))throw Error("FIX09_UTF8");return s.split("\n").filter(Boolean)};
const git=(cwd,args,allowOne=false)=>{const r=spawnSync("/usr/bin/git",args,{cwd,encoding:null,maxBuffer:100*1024*1024,env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});if((r.status!==0&&!(allowOne&&r.status===1))||r.signal||r.error)throw Error("FIX09_GIT");return r.stdout};
const gitText=(cwd,args)=>git(cwd,args).toString("utf8").trim();
const canonicalJson=(b,code)=>{const s=b.toString("utf8");if(!s.endsWith("\n")||!Buffer.from(s).equals(b))throw Error(code);const v=JSON.parse(s.slice(0,-1));if(stable(v)!==s.slice(0,-1))throw Error(code);return v};
const sha40=(s)=>/^[0-9a-f]{40}$/.test(s);

function authorityPlan(ref){return git(CONTROLLER,["show",`${ref}:./${PLAN}`]).toString("utf8")}
function c35Projection(ref){const p=authorityPlan(ref),m=p.match(/<!-- FIX09_C35_PROJECTION_BEGIN -->\n```json\n([\s\S]*?)\n```\n<!-- FIX09_C35_PROJECTION_END -->/);if(!m)throw Error("FIX09_C35_PROJECTION");let v;try{v=JSON.parse(m[1])}catch{throw Error("FIX09_C35_PROJECTION")}return v}
function validateC35Projection(v){keys(v,["paths","reporter_bytes","reporter_count","reporter_names","reporter_sha256"],"FIX09_C35_PROJECTION");if(!Array.isArray(v.paths)||!Array.isArray(v.reporter_names)||C4_ONLY_PATHS.some(p=>v.paths.includes(p))||new Set(v.paths).size!==v.paths.length||new Set(v.reporter_names).size!==v.reporter_names.length)throw Error("FIX09_C35_PROJECTION");same(v.paths,C35_PATHS,"FIX09_C35_PROJECTION");const bytes=Buffer.from(stable(v.reporter_names));if(v.reporter_count!==C35_REPORTER_COUNT||v.reporter_count!==String(v.reporter_names.length)||v.reporter_bytes!==C35_REPORTER_BYTES||v.reporter_bytes!==String(bytes.length)||v.reporter_sha256!==C35_REPORTER_SHA256||v.reporter_sha256!==hash(bytes))throw Error("FIX09_C35_PROJECTION")}
function c35ProjectionFixtureTests(ref=gitText(CONTROLLER,["rev-parse","HEAD"])){const good=c35Projection(ref),reject=(mutate)=>{const v=structuredClone(good);mutate(v);expectCode(()=>validateC35Projection(v),"FIX09_C35_PROJECTION")};validateC35Projection(good);reject(v=>v.paths=C35_OLD_FIRST11);for(const p of C4_ONLY_PATHS)reject(v=>v.paths=[...C35_PATHS.slice(0,-1),p]);reject(v=>v.paths.pop());reject(v=>v.paths.push("tests/architecture/fix09-extra.test.ts"));reject(v=>[v.paths[0],v.paths[1]]=[v.paths[1],v.paths[0]]);reject(v=>v.reporter_names.pop());reject(v=>v.reporter_names.push("FIX-09 forged reporter > survives"));reject(v=>[v.reporter_names[0],v.reporter_names[1]]=[v.reporter_names[1],v.reporter_names[0]]);reject(v=>v.reporter_count="117");reject(v=>v.reporter_bytes="12675");reject(v=>v.reporter_sha256="0".repeat(64));return{hostile:"13",positive:"1"}}
function selfCheck(ref){const p=authorityPlan(ref),m=p.match(/```js\n(\/\/ FIX09_TASK0_V16_PROGRAM_BEGIN[\s\S]*?\/\/ FIX09_TASK0_V16_PROGRAM_END)\n```/),st=fs.lstatSync(PROGRAM);if(!m)throw Error("FIX09_PROGRAM_AUTHORITY");if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o500||fs.realpathSync(PROGRAM)!==PROGRAM)throw Error("FIX09_PROGRAM_MODE");if(!fs.readFileSync(PROGRAM).equals(Buffer.from(`${m[1]}\n`)))throw Error("FIX09_PROGRAM_HASH")}
function baseLedger(ref){const p=authorityPlan(ref),m=p.match(/### Base ledger[\s\S]*?```json\n([\s\S]*?)\n```/);if(!m)throw Error("FIX09_LEDGER_AUTHORITY");const alias={CONTROLLER,ADMISSION:ENGINE,ADMISSION_BRANCH,ADMISSION_ROOT:ADMISSION,PROGRAM,CANDIDATE,RESULT,REVIEW,BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST,RESULT_VALIDATION_MANIFEST,DERIVE_SECURITY_SCAN,CANDIDATE_SECURITY_SCAN,RESULT_SECURITY_SCAN};const replace=(v)=>typeof v==="string"&&Object.hasOwn(alias,v)?alias[v]:Array.isArray(v)?v.map(replace):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v,ledger=replace(JSON.parse(m[1]));validateResolutionLedgerEntries(ledger[13],ledger[21]);validateSourceLedgerEntry(ledger[27]);return ledger}
const candidateMutants=["NONE","AUTHORITY_TREE","AUTHORITY_SUBJECT","AUTHORITY_SCOPE","MERGE_PARENT","MERGE_ORDER","MERGE_CONFLICT","MERGE_RESOLUTION","SOURCE_MAP","C1_MAP","WRITER_MAP","COLLISION_COUNT","COLLISION_SCOPE","MANIFEST_STDOUT","MANIFEST_RC","MANIFEST_HASH","BRANCH","COMMON_DIR","WORKTREE_REGISTRY","RECEIPT_WIRE"];
const MUTANT_CAUSE={AUTHORITY_TREE:"FIX09_AUTHORITY_TREE",AUTHORITY_SUBJECT:"FIX09_EVIDENCE_STREAM",AUTHORITY_SCOPE:"FIX09_EVIDENCE_STREAM",MERGE_PARENT:"FIX09_MERGE_PARENT",MERGE_ORDER:"FIX09_MERGE_ORDER",MERGE_CONFLICT:"FIX09_MERGE_CONFLICT",MERGE_RESOLUTION:"FIX09_MERGE_RESOLUTION",SOURCE_MAP:"FIX09_SOURCE_MAP",C1_MAP:"FIX09_C1_MAP",WRITER_MAP:"FIX09_WRITER_MAP",COLLISION_COUNT:"FIX09_COLLISION_COUNT",COLLISION_SCOPE:"FIX09_COLLISION_SCOPE",MANIFEST_STDOUT:"FIX09_GRANT_SCAN",MANIFEST_RC:"FIX09_MANIFEST_RC",MANIFEST_HASH:"FIX09_MANIFEST_HASH",BRANCH:"FIX09_BRANCH",COMMON_DIR:"FIX09_COMMON_DIR",WORKTREE_REGISTRY:"FIX09_WORKTREE_REGISTRY",RECEIPT_WIRE:"FIX09_RECEIPT_WIRE"};
function candidateLedger(baseManifest){return candidateMutants.map((mutant,index)=>({id:index===0?"t0-040":`h0-${String(index).padStart(3,"0")}`,ordinal:String(index+1),cwd:CONTROLLER,argv:["/Users/vladmihaimiron/.local/bin/node",PROGRAM,"validate-candidate",CANDIDATE,baseManifest,CANDIDATE_SECURITY_SCAN,`--mutant=${mutant}`],expected_exit_code:index===0?"0":"1",expected_signal:null,stdout_parser:{kind:"exact_utf8",value:index===0?"FIX09_CANDIDATE_PASS\n":""},stderr_parser:{kind:"exact_utf8",value:index===0?"":`FIX09_CANDIDATE_FAIL code=FIX09_${mutant}\n`}}))}
function resultLedger(baseManifest,validationManifest){return ["NONE","REVIEW_HASH","REVIEW_VERDICT"].map((mutant,index)=>({id:`r0-${String(index+1).padStart(3,"0")}`,ordinal:String(index+1),cwd:CONTROLLER,argv:["/Users/vladmihaimiron/.local/bin/node",PROGRAM,"validate-result",CANDIDATE,baseManifest,RESULT,validationManifest,REVIEW,RESULT_SECURITY_SCAN,`--mutant=${mutant}`],expected_exit_code:index===0?"0":"1",expected_signal:null,stdout_parser:{kind:"exact_utf8",value:index===0?"FIX09_RESULT_PASS\n":""},stderr_parser:{kind:"exact_utf8",value:index===0?"":`FIX09_RESULT_FAIL code=FIX09_${mutant}\n`}}))}
function parseReceiptBytes(bytes,fields){if(!bytes.length||bytes.includes(0x0d)||bytes.at(-1)!==0x0a||!Buffer.from(bytes.toString("utf8")).equals(bytes))throw Error("FIX09_RECEIPT_WIRE");const a=bytes.toString("utf8").slice(0,-1).split("\n");if(a.length!==fields.length)throw Error("FIX09_RECEIPT_WIRE");const out={};for(let i=0;i<a.length;i++){const n=a[i].indexOf("=");if(n<1||a[i].indexOf("=",n+1)!==-1||a[i].slice(0,n)!==fields[i])throw Error("FIX09_RECEIPT_WIRE");const raw=a[i].slice(n+1);if(JSON_FIELDS.has(fields[i])){const v=JSON.parse(raw);if(stable(v)!==raw)throw Error("FIX09_RECEIPT_WIRE");out[fields[i]]=v}else out[fields[i]]=raw}return out}
function parseRule(rule,b){if(rule.kind==="any")return;if(rule.kind==="empty"){if(b.length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="nonempty_utf8"){if(!lines(b).length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="exact_utf8"){if(b.toString("utf8")!==rule.value)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="sha40_lf"){if(!/^[0-9a-f]{40}\n$/.test(b.toString("utf8")))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="sha40_lines"){const a=lines(b);if(a.length!==Number(rule.count)||a.some(x=>!sha40(x)))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="head_topology"){const a=lines(b);if(a.length!==5||a.slice(0,4).some(x=>!sha40(x))||a[4]!==ADMISSION_BRANCH)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="common_worktree"){same(lines(b),[COMMON,ADMISSION],"FIX09_EVIDENCE_STREAM");return}if(rule.kind==="source_map_17"){if(parseSourceMap(b).size!==17)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="c1_sha256_3"){parseC1(b);return}if(rule.kind==="writer_json"){const v=canonicalJson(b,"FIX09_WRITER_MAP");keys(v,["detail_insert_count","detail_matches","row_match_digest","row_matches","row_writer_count","schema","source_blobs","writer_map"],"FIX09_WRITER_MAP");if(v.schema!=="fix09-writer-scan/v2"||v.row_writer_count!=="4"||v.detail_insert_count!=="2"||v.row_matches.length!==4||v.detail_matches.length!==2||!/^([0-9a-f]{64})$/.test(v.row_match_digest))throw Error("FIX09_WRITER_MAP");same(v.writer_map,WRITERS,"FIX09_WRITER_MAP");return}if(rule.kind==="grant_json"){const v=canonicalJson(b,"FIX09_GRANT_SCAN");keys(v,["files","schema","statements"],"FIX09_GRANT_SCAN");if(v.schema!=="fix09-grant-scan/v1"||stable(v.files)!==stable(Object.entries(GRANT_SOURCE_PINS).map(([path,{blob,sha256}])=>({blob,path,sha256})))||stable(v.statements)!==stable(GRANT_STATEMENTS))throw Error("FIX09_GRANT_SCAN");return}if(["refs","branch_refs"].includes(rule.kind)){const a=lines(b);if(!a.length||new Set(a).size!==a.length||stable([...a].sort())!==stable(a))throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="worktree_registry"){parseWorktrees(b);return}if(["object_paths","history_paths"].includes(rule.kind)){if(!b.length)throw Error("FIX09_EVIDENCE_STREAM");return}if(rule.kind==="security_scan_json"){const v=canonicalJson(b,"FIX09_SECURITY_TRANSCRIPT");if(v.schema!=="fix09-complete-security-scan/v1")throw Error("FIX09_SECURITY_TRANSCRIPT");return}if(rule.kind.endsWith("_json")){const v=canonicalJson(b,"FIX09_COLLISION_SCAN");if(v.schema!==`fix09-${rule.kind.replace("_json","").replaceAll("_","-")}/v1`)throw Error("FIX09_COLLISION_SCAN");return}throw Error("FIX09_LEDGER_PARSER")}
function authorityFromManifest(file){const bytes=fs.readFileSync(file),manifest=JSON.parse(bytes);if(stable(manifest)!==bytes.toString("utf8")||manifest.schema!=="fix09-task0-evidence-manifest/v2"||!Array.isArray(manifest.commands))throw Error("FIX09_MANIFEST_SCHEMA");const f=manifest.commands[0];if(!f||f.id!=="t0-001"||f.ordinal!=="1"||stable(f.argv)!==stable(["/usr/bin/git","rev-parse","HEAD"])||f.cwd!==CONTROLLER)throw Error("FIX09_AUTHORITY_REF");const root=fs.realpathSync(manifest.evidence_root),raw=fs.readFileSync(path.join(root,f.stdout.path));if(hash(raw)!==f.stdout.sha256||String(raw.length)!==f.stdout.bytes||!/^([0-9a-f]{40})\n$/.test(raw.toString("utf8")))throw Error("FIX09_AUTHORITY_REF");return raw.toString("utf8").trim()}
function replayManifest(file,ledger,mutant="NONE"){const fst=fs.lstatSync(file),bytes=fs.readFileSync(file),text=bytes.toString("utf8"),manifest=JSON.parse(text);if(!fst.isFile()||fst.isSymbolicLink()||fst.nlink!==1||(fst.mode&0o777)!==0o400)throw Error("FIX09_MANIFEST_MODE");if(stable(manifest)!==text)throw Error("FIX09_MANIFEST_HASH");keys(manifest,["command_count","commands","evidence_root","schema"],"FIX09_MANIFEST_SCHEMA");if(manifest.schema!=="fix09-task0-evidence-manifest/v2"||manifest.commands.length!==ledger.length||manifest.command_count!==String(ledger.length))throw Error("FIX09_MANIFEST_SCHEMA");const root=fs.realpathSync(manifest.evidence_root),rst=fs.lstatSync(root);if(!rst.isDirectory()||rst.isSymbolicLink()||(rst.mode&0o777)!==0o500)throw Error("FIX09_MANIFEST_MODE");const facts=structuredClone(manifest.commands),artifacts=new Map();for(const fact of manifest.commands){const prefix=`${fact.ordinal.padStart(3,"0")}-${fact.id}`,factPath=path.join(root,`${prefix}.command.json`),fst0=fs.lstatSync(factPath);if(!fst0.isFile()||fst0.isSymbolicLink()||fst0.nlink!==1||(fst0.mode&0o777)!==0o400||fs.readFileSync(factPath).toString("utf8")!==stable(fact))throw Error("FIX09_FACT_RECORD");for(const stream of ["stdout","stderr"]){if(fact[stream].path!==`${prefix}.${stream}`)throw Error("FIX09_FACT_RECORD");const target=path.join(root,fact[stream].path),st=fs.lstatSync(target),body=fs.readFileSync(target);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400||String(body.length)!==fact[stream].bytes||hash(body)!==fact[stream].sha256)throw Error("FIX09_MANIFEST_HASH");artifacts.set(`${fact.id}:${stream}`,body)}}if(["AUTHORITY_SUBJECT","AUTHORITY_SCOPE","WORKTREE_REGISTRY","MANIFEST_STDOUT"].includes(mutant)){const id=mutant==="AUTHORITY_SUBJECT"?"t0-003":mutant==="AUTHORITY_SCOPE"?"t0-004":mutant==="WORKTREE_REGISTRY"?"t0-034":"t0-031",fact=facts.find(x=>x.id===id);let body;if(mutant==="AUTHORITY_SUBJECT")body=Buffer.from("docs(obs): forged authority\n");else if(mutant==="AUTHORITY_SCOPE")body=Buffer.from("dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v16.md\ndialectical-engine/docs/missions/observability-agents/slices/FIX-09/forged.md\n");else if(mutant==="WORKTREE_REGISTRY"){const original=artifact({artifacts},id),firstEnd=original.indexOf(Buffer.from("\0\0"))+2;if(firstEnd<2)throw Error("FIX09_WORKTREE_REGISTRY");body=Buffer.concat([original,original.subarray(0,firstEnd)])}else body=Buffer.from(`${stable({files:[],schema:"fix09-grant-scan/v1",statements:[]})}\n`);artifacts.set(`${id}:stdout`,body);fact.stdout.bytes=String(body.length);fact.stdout.sha256=hash(body)}if(mutant==="MANIFEST_RC")facts.find(x=>x.id==="t0-031").exit_code="1";if(mutant==="MANIFEST_HASH")facts.find(x=>x.id==="t0-031").stdout.sha256="0".repeat(64);
  for(let i=0;i<ledger.length;i++){const fact=facts[i],expected=ledger[i];keys(fact,["argv","cwd","environment","exit_code","id","ordinal","schema","signal","stderr","stdout"],"FIX09_FACT_SCHEMA");if(fact.schema!=="fix09-task0-command/v2")throw Error("FIX09_FACT_SCHEMA");for(const stream of ["stdout","stderr"]){keys(fact[stream],["bytes","mode","path","sha256"],"FIX09_FACT_SCHEMA");const b=artifacts.get(`${fact.id}:${stream}`);if(fact[stream].mode!=="0400"||String(b.length)!==fact[stream].bytes||hash(b)!==fact[stream].sha256)throw Error("FIX09_MANIFEST_HASH")}same([fact.id,fact.ordinal,fact.cwd,fact.argv,fact.environment,fact.exit_code,fact.signal],[expected.id,expected.ordinal,expected.cwd,expected.argv,ENV,expected.expected_exit_code,expected.expected_signal],"FIX09_MANIFEST_RC");parseRule(expected.stdout_parser,artifacts.get(`${fact.id}:stdout`));parseRule(expected.stderr_parser,artifacts.get(`${fact.id}:stderr`))}
  const expectedFiles=["manifest.json",...facts.flatMap(f=>[`${f.ordinal.padStart(3,"0")}-${f.id}.command.json`,f.stdout.path,f.stderr.path])].sort();same(fs.readdirSync(root).sort(),expectedFiles,"FIX09_MANIFEST_EXTRA");return{bytes,manifest,facts,artifacts,root}}
function parseResolutionMap(records){if(!Array.isArray(records))throw Error("FIX09_RESOLUTION_MAP");const map=new Map();for(const record of records){keys(record,["blob","object_name"],"FIX09_RESOLUTION_MAP");if(!sha40(record.blob))throw Error("FIX09_RESOLUTION_MAP");let p=null;for(let i=0;i<RESOLUTION_PATHS.length;i++)if(record.object_name===ROOT_INDEX_OBJECTS[i]||record.object_name===PACKAGE_INDEX_OBJECTS[i])p=RESOLUTION_PATHS[i];if(p===null||map.has(p))throw Error("FIX09_RESOLUTION_MAP");map.set(p,record.blob)}if(map.size!==2)throw Error("FIX09_RESOLUTION_MAP");return map}
function validateResolutionLedgerEntries(fix02,fix09){try{same([fix02?.id,fix02?.ordinal,fix02?.cwd,fix02?.argv,fix02?.expected_exit_code,fix02?.expected_signal,fix02?.stderr_parser,fix02?.stdout_parser],["t0-014","14",ENGINE,["/usr/bin/git","rev-parse",ROOT_INDEX_OBJECTS[0]],"0",null,{kind:"empty"},{kind:"exact_utf8",value:"0e2ffc4fc4f148520f228a9f69014f2ad7d5416c\n"}],"FIX09_LEDGER_RESOLUTION_PATH");same([fix09?.id,fix09?.ordinal,fix09?.cwd,fix09?.argv,fix09?.expected_exit_code,fix09?.expected_signal,fix09?.stderr_parser,fix09?.stdout_parser],["t0-022","22",ENGINE,["/usr/bin/git","rev-parse",ROOT_INDEX_OBJECTS[1]],"0",null,{kind:"empty"},{kind:"sha40_lf"}],"FIX09_LEDGER_RESOLUTION_PATH")}catch{throw Error("FIX09_LEDGER_RESOLUTION_PATH")}}
function resolutionMapFixtureTests(){const rows=(objects)=>objects.map((object_name,i)=>({blob:String(i+1).repeat(40),object_name}));const root=parseResolutionMap(rows(ROOT_INDEX_OBJECTS)),local=parseResolutionMap(rows(PACKAGE_INDEX_OBJECTS));same([...root.keys()],RESOLUTION_PATHS,"FIX09_RESOLUTION_MAP");same([...local.keys()],RESOLUTION_PATHS,"FIX09_RESOLUTION_MAP");const legacy=rows(ROOT_INDEX_OBJECTS);legacy[0].object_name=`:${RESOLUTION_PATHS[0]}`;expectCode(()=>parseResolutionMap(legacy),"FIX09_RESOLUTION_MAP");const wrong=rows(ROOT_INDEX_OBJECTS);wrong[0].object_name=`:wrong-engine/${RESOLUTION_PATHS[0]}`;expectCode(()=>parseResolutionMap(wrong),"FIX09_RESOLUTION_MAP");expectCode(()=>parseResolutionMap(rows(ROOT_INDEX_OBJECTS).slice(0,1)),"FIX09_RESOLUTION_MAP");expectCode(()=>parseResolutionMap([...rows(ROOT_INDEX_OBJECTS),{blob:"3".repeat(40),object_name:":dialectical-engine/docs/missions/observability-agents/slices/FIX-09/EXTRA.md"}]),"FIX09_RESOLUTION_MAP");expectCode(()=>parseResolutionMap([...rows(ROOT_INDEX_OBJECTS),rows(ROOT_INDEX_OBJECTS)[0]]),"FIX09_RESOLUTION_MAP");expectCode(()=>parseResolutionMap([...rows(ROOT_INDEX_OBJECTS),{blob:"f".repeat(40),object_name:ROOT_INDEX_OBJECTS[0]}]),"FIX09_RESOLUTION_MAP")}
function parseSourceMap(b){const map=new Map();for(const line of lines(b)){const m=line.match(/^100644 blob ([0-9a-f]{40})\t(?:dialectical-engine\/)?(.+)$/);if(!m||!SOURCE_PATHS.includes(m[2])||map.has(m[2]))throw Error("FIX09_SOURCE_MAP");map.set(m[2],m[1])}if(map.size!==17)throw Error("FIX09_SOURCE_MAP");return map}
function validateSourceLedgerEntry(entry){try{if(SOURCE_PATHS.length!==17||SOURCE_TREE_PATHS.length!==17||new Set(SOURCE_PATHS).size!==17||new Set(SOURCE_TREE_PATHS).size!==17)throw Error("FIX09_LEDGER_SOURCE_PATHSPEC");same([entry?.id,entry?.ordinal,entry?.cwd,entry?.argv,entry?.expected_exit_code,entry?.expected_signal,entry?.stderr_parser,entry?.stdout_parser],["t0-028","28",ENGINE,["/usr/bin/git","ls-tree","-r","--full-tree","HEAD","--",...SOURCE_TREE_PATHS],"0",null,{kind:"empty"},{kind:"source_map_17"}],"FIX09_LEDGER_SOURCE_PATHSPEC")}catch{throw Error("FIX09_LEDGER_SOURCE_PATHSPEC")}}
function sourceMapFixtureTests(){const entry={argv:["/usr/bin/git","ls-tree","-r","--full-tree","HEAD","--",...SOURCE_TREE_PATHS],cwd:ENGINE,expected_exit_code:"0",expected_signal:null,id:"t0-028",ordinal:"28",stderr_parser:{kind:"empty"},stdout_parser:{kind:"source_map_17"}};validateSourceLedgerEntry(entry);const bare=structuredClone(entry);bare.argv[6]=SOURCE_PATHS[0];expectCode(()=>validateSourceLedgerEntry(bare),"FIX09_LEDGER_SOURCE_PATHSPEC");const wrongTop=structuredClone(entry);wrongTop.argv[6]=`:(top)wrong-engine/${SOURCE_PATHS[0]}`;expectCode(()=>validateSourceLedgerEntry(wrongTop),"FIX09_LEDGER_SOURCE_PATHSPEC");const rows=SOURCE_PATHS.map((p,i)=>`100644 blob ${String(i+1).padStart(40,"0")}\tdialectical-engine/${p}`),valid=Buffer.from(rows.join("\n")+"\n"),map=parseSourceMap(valid);same([...map.keys()],SOURCE_PATHS,"FIX09_SOURCE_MAP");same([...map.values()],SOURCE_PATHS.map((_,i)=>String(i+1).padStart(40,"0")),"FIX09_SOURCE_MAP");expectCode(()=>parseSourceMap(Buffer.from(rows.slice(0,-1).join("\n")+"\n")),"FIX09_SOURCE_MAP");expectCode(()=>parseSourceMap(Buffer.from(rows.join("\n")+`\n100644 blob ${"f".repeat(40)}\tdialectical-engine/extra.ts\n`)),"FIX09_SOURCE_MAP");expectCode(()=>parseSourceMap(Buffer.from(rows.join("\n")+`\n${rows[0]}\n`)),"FIX09_SOURCE_MAP")}
function parseC1(b){const out={canonical_policy_bundle_sha256:C1_CANONICAL};for(const line of lines(b)){const m=line.match(/^([0-9a-f]{64})  (tests\/unit\/fixtures\/fix09-interface-contract\.ts|tools\/obs-listener\/src\/daemon\/(?:dispatch-arm|tracer-hook)\.ts)$/);if(!m||Object.hasOwn(out,m[2]))throw Error("FIX09_C1_MAP");out[m[2]]=m[1]}if(Object.keys(out).length!==4)throw Error("FIX09_C1_MAP");return out}
function nulRecords(b,code){const out=[];let start=0;for(let i=0;i<b.length;i++)if(b[i]===0){const part=b.subarray(start,i);start=i+1;if(part.length){const s=part.toString("utf8");if(!Buffer.from(s).equals(part))throw Error(code);out.push(s)}}if(start!==b.length)throw Error(code);return out}
function parseWorktrees(b){const records=nulRecords(b,"FIX09_WORKTREE_REGISTRY"),out=[];for(const record of records)if(record.startsWith("worktree ")){const stated=record.slice(9);if(!path.isAbsolute(stated))throw Error("FIX09_WORKTREE_REGISTRY");const st=fs.lstatSync(stated),p=fs.realpathSync(stated);fs.accessSync(stated,fs.constants.R_OK|fs.constants.X_OK);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o555)===0||out.includes(p))throw Error("FIX09_WORKTREE_REGISTRY");out.push(p)}if(!out.length||stable([...out].sort())!==stable(out))throw Error("FIX09_WORKTREE_REGISTRY");return out}
function artifact(replay,id,stream="stdout"){return replay.artifacts.get(`${id}:${stream}`)}
function mergeEntry(commit,p){try{return gitText(ENGINE,["ls-tree",commit,"--",p])}catch{return""}}
function verifyMerge(first,second,result,conflict,selected){const base=gitText(ENGINE,["merge-base",first,second]),changed=new Set([...lines(git(ENGINE,["diff","--name-only",base,first])),...lines(git(ENGINE,["diff","--name-only",base,second])),...lines(git(ENGINE,["diff","--name-only",base,result]))]);for(const p0 of changed){const p=p0.replace(/^dialectical-engine\//,"");const b=mergeEntry(base,p),a=mergeEntry(first,p),s=mergeEntry(second,p),r=mergeEntry(result,p);if(p===conflict){if(!r.includes(selected))throw Error("FIX09_MERGE_RESOLUTION");continue}const expected=a===b?s:s===b?a:a===s?a:null;if(expected===null||r!==expected)throw Error("FIX09_MERGE_PARENT")}}
function baseSecurityTranscript(replay,authority){const raw=canonicalJson(artifact(replay,"t0-039"),"FIX09_SECURITY_TRANSCRIPT");validateCompleteSecurityTranscript(raw,authority);return raw}
function collisionValues(replay,authority){const refs=lines(artifact(replay,"t0-032")),branches=lines(artifact(replay,"t0-033")),worktrees=parseWorktrees(artifact(replay,"t0-034"));if(branches.some(x=>!refs.includes(x)))throw Error("FIX09_COLLISION_COUNT");const objects=lines(artifact(replay,"t0-035")).map(x=>x.replace(/^[0-9a-f]{40} /,"")).filter(x=>RX.test(x)),history=lines(artifact(replay,"t0-036")).filter(x=>RX.test(x)),tip=canonicalJson(artifact(replay,"t0-037"),"FIX09_COLLISION_COUNT"),wt=canonicalJson(artifact(replay,"t0-038"),"FIX09_COLLISION_COUNT"),complete=baseSecurityTranscript(replay,authority);validateRefTipView(tip);validateWorktreeView(wt);const counts={all_refs:complete.paper.registered_refs,branch_remote_refs:String(branches.length),independent_claim_hits:complete.paper.independent_claim_hits,reachable_history_0064_hits:complete.views.reachable_history.hit_count,reachable_object_0064_hits:complete.views.reachable_object.hit_count,ref_tip_0064_hits:complete.views.ref_tip.hit_count,registered_worktrees:complete.paper.registered_worktrees,worktree_tracked_0064_hits:complete.views.worktree_tracked.hit_count,worktree_untracked_0064_hits:complete.views.worktree_untracked.hit_count};if(objects.length||history.length||tip.hit_count!=="0"||wt.tracked_hit_count!=="0"||wt.untracked_hit_count!=="0"||Object.entries(counts).some(([k,v])=>k.endsWith("_hits")&&v!=="0"))throw Error("FIX09_COLLISION_COUNT");return counts}
function composition(A,baseline){const M9=baseline,C1=gitText(ENGINE,["rev-parse",`${M9}^1`]),M2=gitText(ENGINE,["rev-parse",`${C1}^`]);same(lines(git(ENGINE,["show","-s","--format=%P",M2])),[`${A} ${F2}`],"FIX09_MERGE_PARENT");same(lines(git(ENGINE,["show","-s","--format=%P",C1])),[M2],"FIX09_MERGE_PARENT");same(lines(git(ENGINE,["show","-s","--format=%P",M9])),[`${C1} ${F9}`],"FIX09_MERGE_PARENT");if(hash(git(ENGINE,["diff","--binary",`${F1}^`,F1]))!==hash(git(ENGINE,["diff","--binary",`${C1}^`,C1])))throw Error("FIX09_MERGE_PARENT");return{M2,C1,M9}}
function rerunCheapAnchors(replay){const ledger=baseLedger(lines(artifact(replay,"t0-001"))[0]);for(const n of [1,2,3,4,5,6,7,8,24,25,26,27,28,29,30,31]){const e=ledger[n-1],r=spawnSync(e.argv[0],e.argv.slice(1),{cwd:e.cwd,encoding:null,maxBuffer:100*1024*1024,env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});if(r.error||r.signal!==null||String(r.status)!==e.expected_exit_code||!r.stdout.equals(artifact(replay,e.id))||!r.stderr.equals(artifact(replay,e.id,"stderr")))throw Error(n<=8?"FIX09_AUTHORITY_REF":"FIX09_SOURCE_MAP")}}
function derive(replay,freshContext=null,sealedFreshDigest=null,freshOut=null){rerunCheapAnchors(replay);const a=(id)=>lines(artifact(replay,id)),A=a("t0-001")[0],base=baseSecurityTranscript(replay,A),baseDigest=securityProjectionDigest(base,A),freshDigest=freshContext===null?null:freshCollisionGate(A,freshContext,freshOut,base);if(freshDigest!==null&&sealedFreshDigest!==null)throw Error("FIX09_COLLISION_COUNT");if(sealedFreshDigest!==null&&!/[0-9a-f]{64}$/.test(sealedFreshDigest))throw Error("FIX09_COLLISION_COUNT");const authorityObjects=a("t0-005"),baseline=a("t0-025")[0],top=a("t0-026"),paths=a("t0-027"),graph=composition(A,baseline),resolutions=parseResolutionMap([{blob:a("t0-014")[0],object_name:ROOT_INDEX_OBJECTS[0]},{blob:a("t0-022")[0],object_name:ROOT_INDEX_OBJECTS[1]}]);if(gitText(CONTROLLER,["rev-parse","refs/heads/codex/fixagent-plan"])!==A||a("t0-002")[0]!==gitText(CONTROLLER,["rev-parse",`${A}^`])||authorityObjects[0]!==gitText(CONTROLLER,["rev-parse",`${A}^{tree}`]))throw Error("FIX09_AUTHORITY_TREE");if(gitText(CONTROLLER,["rev-parse",`${F1}^`])!==F1BASE)throw Error("FIX09_MERGE_PARENT");for(const c of [F1,F2,F9])git(CONTROLLER,["cat-file","-e",`${c}^{commit}`]);if(authorityObjects[1]!==resolutions.get(RESOLUTION_PATHS[1]))throw Error("FIX09_MERGE_RESOLUTION");same(top,[baseline,graph.C1,F9,gitText(ENGINE,["rev-parse",`${baseline}^{tree}`]),ADMISSION_BRANCH],"FIX09_BRANCH");same(paths,[COMMON,ADMISSION],"FIX09_COMMON_DIR");if(gitText(CONTROLLER,["rev-parse","--path-format=absolute","--git-common-dir"])!==COMMON||gitText(ENGINE,["rev-parse","--path-format=absolute","--git-common-dir"])!==COMMON)throw Error("FIX09_COMMON_DIR");if(gitText(ENGINE,["symbolic-ref","--short","HEAD"])!==ADMISSION_BRANCH)throw Error("FIX09_BRANCH");if(!parseWorktrees(git(CONTROLLER,["worktree","list","--porcelain","-z"])).includes(ADMISSION))throw Error("FIX09_WORKTREE_REGISTRY");verifyMerge(A,F2,graph.M2,"docs/missions/observability-agents/slices/FIX-02/DECISIONS.md",resolutions.get(RESOLUTION_PATHS[0]));verifyMerge(graph.C1,F9,graph.M9,"docs/missions/observability-agents/slices/FIX-09/DECISIONS.md",resolutions.get(RESOLUTION_PATHS[1]));const source=Object.fromEntries(parseSourceMap(artifact(replay,"t0-028")));for(const [p,b] of Object.entries(source))if(gitText(ENGINE,["rev-parse",`${baseline}:./${p}`])!==b)throw Error("FIX09_SOURCE_MAP");const writerScanResult=canonicalJson(artifact(replay,"t0-030"),"FIX09_WRITER_MAP"),writers=writerScanResult.writer_map,c1=parseC1(artifact(replay,"t0-029"));for(const [p,h] of Object.entries(c1))if(p!=="canonical_policy_bundle_sha256"&&hash(git(ENGINE,["show",`${baseline}:./${p}`]))!==h)throw Error("FIX09_C1_MAP");const order=[{expected_conflicts:["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],input:F2,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix02_resolution_blob"},{expected_conflicts:[],input:F1,kind:"cherry_pick",resolution_field:null},{expected_conflicts:["docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],input:F9,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix09_resolution_blob"}];return{schema:"fix09-c35-admission-candidate/v1",authority_commit:A,authority_parent:a("t0-002")[0],authority_tree:authorityObjects[0],integration_base:INTEGRATION,fix01_shared_base:F1BASE,fix01_tip:F1,fix02_head:F2,fix09_head:F9,composition_order:order,merge_fix02_conflict_paths:a("t0-012").map(x=>x.replace(/^dialectical-engine\//,"")),merge_fix02_resolution_blob:resolutions.get(RESOLUTION_PATHS[0]),cherry_pick_fix01_conflict_paths:a("t0-017"),merge_fix09_conflict_paths:a("t0-020").map(x=>x.replace(/^dialectical-engine\//,"")),merge_fix09_resolution_blob:resolutions.get(RESOLUTION_PATHS[1]),composition_result_commits:[{commit:graph.M2,input:F2,kind:"merge_no_ff"},{commit:graph.C1,input:F1,kind:"cherry_pick"},{commit:graph.M9,input:F9,kind:"merge_no_ff"}],branch_name:top[4],worktree_canonical_path:paths[1],git_common_dir_canonical_path:paths[0],c35_baseline:baseline,c35_tree:top[3],clean_porcelain_sha256:hash(artifact(replay,"t0-024")),source_blob_map:source,source_blob_extensions:[],writer_map:writers,writer_map_sha256:hash(artifact(replay,"t0-030")),c1_pin_map:c1,schema_grant_probe_sha256:hash(artifact(replay,"t0-031")),migration_collision_counts:collisionValues(replay,A),migration_collision_scope:SCOPE,migration_collision_evidence_sha256:freshDigest??sealedFreshDigest??baseDigest,capture_evidence_manifest_sha256:hash(replay.bytes)}}
function receiptBytes(v,fields){return Buffer.from(fields.map(k=>`${k}=${JSON_FIELDS.has(k)?stable(v[k]):v[k]}\n`).join(""))}
function mutateValue(v,m){const z=structuredClone(v);if(m==="AUTHORITY_TREE")z.authority_tree="0".repeat(40);if(m==="MERGE_PARENT")z.composition_result_commits[0].commit=F1;if(m==="MERGE_ORDER")z.composition_order.reverse();if(m==="MERGE_CONFLICT")z.merge_fix02_conflict_paths=[];if(m==="MERGE_RESOLUTION")z.merge_fix09_resolution_blob="0".repeat(40);if(m==="SOURCE_MAP")z.source_blob_map[SOURCE_PATHS[0]]="0".repeat(40);if(m==="C1_MAP")z.c1_pin_map.canonical_policy_bundle_sha256="0".repeat(64);if(m==="WRITER_MAP")z.writer_map=z.writer_map.slice(1);if(m==="COLLISION_COUNT")z.migration_collision_counts.all_refs=String(Number(z.migration_collision_counts.all_refs)+1);if(m==="COLLISION_SCOPE")z.migration_collision_scope.claim="migrations/0064_forged.sql";if(m==="BRANCH")z.branch_name="codex/forged";if(m==="COMMON_DIR")z.git_common_dir_canonical_path="/private/tmp/forged";return z}
function compareCandidate(actual,expected){const group=(fields,code)=>same(fields.map(k=>actual[k]),fields.map(k=>expected[k]),code);group(["authority_commit","authority_parent","authority_tree"],"FIX09_AUTHORITY_TREE");group(["composition_result_commits"],"FIX09_MERGE_PARENT");group(["composition_order"],"FIX09_MERGE_ORDER");group(["merge_fix02_conflict_paths","cherry_pick_fix01_conflict_paths","merge_fix09_conflict_paths"],"FIX09_MERGE_CONFLICT");group(["merge_fix02_resolution_blob","merge_fix09_resolution_blob"],"FIX09_MERGE_RESOLUTION");group(["source_blob_map","source_blob_extensions"],"FIX09_SOURCE_MAP");group(["c1_pin_map"],"FIX09_C1_MAP");group(["writer_map","writer_map_sha256"],"FIX09_WRITER_MAP");group(["migration_collision_counts","migration_collision_evidence_sha256"],"FIX09_COLLISION_COUNT");group(["migration_collision_scope"],"FIX09_COLLISION_SCOPE");group(["branch_name"],"FIX09_BRANCH");group(["git_common_dir_canonical_path"],"FIX09_COMMON_DIR");same(actual,expected,"FIX09_RECEIPT_WIRE")}
function scannerRoot(){const ref=gitText(CONTROLLER,["rev-parse","HEAD"]);selfCheck(ref);return ref}
function regexMatches(body,rx,file,ranges){rx.lastIndex=0;const out=[];for(let m;(m=rx.exec(body))!==null;){const range=ranges.find(r=>m.index>=r.start&&m.index<r.end);if(!range)throw Error("FIX09_WRITER_SCAN");out.push({byte_offset:String(Buffer.byteLength(body.slice(0,m.index))),line:String(body.slice(0,m.index).split("\n").length),path:file,symbol:range.symbol,table:m[1]||"occurrence_detail"})}return out}
function functionRanges(body,spec){return spec.map(([symbol,marker,next])=>{const start=body.indexOf(marker);if(start<0||body.indexOf(marker,start+1)!==-1)throw Error("FIX09_WRITER_SCAN");const end=next===null?body.length:body.indexOf(next,start+marker.length);if(end<=start)throw Error("FIX09_WRITER_SCAN");return{symbol,start,end}})}
function writerEnvelope(sink,poison,sourceBlobs){const sinkPath="packages/obs-capture/src/runtime/sink.ts",poisonPath="tools/obs-listener/src/daemon/poison.ts",sinkRanges=functionRanges(sink,[["writeOccurrences","async writeOccurrences(","async ingestSpooledOccurrence("],["ingestSpooledOccurrence","async ingestSpooledOccurrence(",null]]),poisonRanges=functionRanges(poison,[["appendSkipReceipt","export async function appendSkipReceipt(","export async function appendPoisonReceipt("],["appendPoisonReceipt","export async function appendPoisonReceipt(",null]]);const rowMatches=[...regexMatches(sink,ROW_RX,sinkPath,sinkRanges),...regexMatches(poison,ROW_RX,poisonPath,poisonRanges)],detailMatches=regexMatches(sink,DETAIL_RX,sinkPath,sinkRanges);same(rowMatches.map(x=>`${x.table}|${x.path}|${x.symbol}`),WRITERS.slice(0,4),"FIX09_WRITER_SCAN");same(detailMatches.map(x=>`${x.table}|${x.path}|${x.symbol}`),["occurrence_detail|packages/obs-capture/src/runtime/sink.ts|writeOccurrences","occurrence_detail|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence"],"FIX09_WRITER_SCAN");return{detail_insert_count:String(detailMatches.length),detail_matches:detailMatches,row_match_digest:hash(Buffer.concat([Buffer.from("fix09-writer-matches/v1\0"),Buffer.from(stable(rowMatches))])),row_matches:rowMatches,row_writer_count:String(rowMatches.length),schema:"fix09-writer-scan/v2",source_blobs:sourceBlobs,writer_map:WRITERS}}
function writerFixtureTests(){const sink="async writeOccurrences( ){ INSERT INTO obs.occurrence ; INSERT INTO obs.occurrence_detail ; }\nasync ingestSpooledOccurrence( ){ INSERT INTO obs.occurrence ; INSERT INTO obs.occurrence_detail ; }",poison="export async function appendSkipReceipt( ){ INSERT INTO obs.agent_action ; }\nexport async function appendPoisonReceipt( ){ INSERT INTO obs.agent_action ; }",blobs=[{blob:"1".repeat(40),path:"packages/obs-capture/src/runtime/sink.ts",sha256:"1".repeat(64)},{blob:"2".repeat(40),path:"tools/obs-listener/src/daemon/poison.ts",sha256:"2".repeat(64)}],accept=(s,p)=>writerEnvelope(s,p,blobs),reject=(s,p)=>{let failed=false;try{accept(s,p)}catch(e){failed=e.message==="FIX09_WRITER_SCAN"}if(!failed)throw Error("FIX09_WRITER_FIXTURE")};accept(sink,poison);if(accept(sink,poison).row_writer_count!=="4"||accept(sink,poison).detail_insert_count!=="2")throw Error("FIX09_WRITER_FIXTURE");reject(sink.replace("obs.occurrence ;","\"obs\".\"occurrence\" ;"),poison);reject(sink.replace("obs.occurrence ;","obs.occurrence2 ;"),poison);reject(sink+"\n// INSERT INTO obs.occurrence",poison);reject(sink+"\nconst decoy = 'INSERT INTO obs.occurrence'",poison);reject(sink.replace("obs.occurrence ;","obs.wrong_table ;"),poison);if(regexMatches("xINSERT INTO obs.occurrence",ROW_RX,"x",[{symbol:"x",start:0,end:99}]).length!==0)throw Error("FIX09_WRITER_FIXTURE");if(regexMatches("INSERT INTO obs.occurrence_detail",ROW_RX,"x",[{symbol:"x",start:0,end:99}]).length!==0)throw Error("FIX09_WRITER_FIXTURE")}
function writerScan(){scannerRoot();writerFixtureTests();const inputs=[["packages/obs-capture/src/runtime/sink.ts"],["tools/obs-listener/src/daemon/poison.ts"]].map(([p])=>{const body=git(ENGINE,["show",`HEAD:./${p}`]);return{body:body.toString("utf8"),path:p,blob:gitText(ENGINE,["rev-parse",`HEAD:./${p}`]),sha256:hash(body)}});process.stdout.write(`${stable(writerEnvelope(inputs[0].body,inputs[1].body,inputs.map(({path,blob,sha256})=>({blob,path,sha256}))))}\n`)}
function immutableWriterScan(){writerFixtureTests();const refs=[[F2,"packages/obs-capture/src/runtime/sink.ts"],[F9,"tools/obs-listener/src/daemon/poison.ts"]],inputs=refs.map(([ref,p])=>{const body=git(CONTROLLER,["show",ref+":./"+p]);return{body:body.toString("utf8"),path:p,blob:gitText(CONTROLLER,["rev-parse",ref+":./"+p]),sha256:hash(body)}});process.stdout.write(stable(writerEnvelope(inputs[0].body,inputs[1].body,inputs.map(({path,blob,sha256})=>({blob,path,sha256}))))+"\n")}
function grantProof(migration,schema){const sql=migration.split("\n"),ts=schema.split("\n"),one=(rows,value)=>rows.filter(x=>x===value).length===1;let grants=0;for(let i=0;i<sql.length-1;i++)if(sql[i]==="GRANT USAGE ON SCHEMA obs"&&sql[i+1]==="  TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;")grants++;if(!one(sql,"CREATE SCHEMA IF NOT EXISTS obs;")||grants!==1||!one(ts,"export const obs = pgSchema(\"obs\");")||!one(ts,"export const obsOccurrence = obs.table(\"occurrence\", {")||!one(ts,"export const obsAgentAction = obs.table(\"agent_action\", {"))throw Error("FIX09_GRANT_SCAN");return GRANT_STATEMENTS}
function grantEnvelope(inputs){if(!Array.isArray(inputs)||inputs.length!==2)throw Error("FIX09_GRANT_SCAN");const files=inputs.map(({body,path})=>{const pin=GRANT_SOURCE_PINS[path];if(!Buffer.isBuffer(body)||pin===undefined||hash(body)!==pin.sha256||gitBlob(body)!==pin.blob)throw Error("FIX09_GRANT_SCAN");return{blob:pin.blob,path,sha256:pin.sha256}});same(files,Object.entries(GRANT_SOURCE_PINS).map(([path,{blob,sha256}])=>({blob,path,sha256})),"FIX09_GRANT_SCAN");const statements=grantProof(strictUtf8(inputs[0].body,"FIX09_GRANT_SCAN"),strictUtf8(inputs[1].body,"FIX09_GRANT_SCAN"));return{files,schema:"fix09-grant-scan/v1",statements}}
function grantFixtureTests(){const migration=git(CONTROLLER,["show",`${F2}:./migrations/0034_obs_foundation.sql`]),schema=git(CONTROLLER,["show",`${F9}:./packages/db/src/obs-schema.ts`]),m=migration.toString("utf8"),s=schema.toString("utf8");grantEnvelope([{body:migration,path:"migrations/0034_obs_foundation.sql"},{body:schema,path:"packages/db/src/obs-schema.ts"}]);const reject=(sql,ts)=>expectCode(()=>grantProof(sql,ts),"FIX09_GRANT_SCAN");reject(m.replace("CREATE SCHEMA IF NOT EXISTS obs;\n",""),s);reject(m.replace("GRANT USAGE ON SCHEMA obs\n  TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;\n",""),s);reject(m,s.replace("export const obs = pgSchema(\"obs\");\n",""));reject(m,s.replace("export const obsOccurrence = obs.table(\"occurrence\", {\n",""));reject(m,s.replace("export const obsAgentAction = obs.table(\"agent_action\", {\n",""));reject(m.replace("CREATE SCHEMA IF NOT EXISTS obs;","CREATE SCHEMA IF NOT EXISTS obz;"),s);reject(m.replace("CREATE SCHEMA IF NOT EXISTS obs;","CREATE SCHEMA IF NOT EXISTS obs_extra;"),s);reject(m.replace("CREATE SCHEMA IF NOT EXISTS obs;","-- CREATE SCHEMA IF NOT EXISTS obs;"),s);reject(m.replace("CREATE SCHEMA IF NOT EXISTS obs;","CREATE  SCHEMA IF NOT EXISTS obs;"),s)}
function grantScan(){scannerRoot();grantFixtureTests();const inputs=Object.keys(GRANT_SOURCE_PINS).map(p=>({body:git(ENGINE,["show",`HEAD:./${p}`]),path:p}));process.stdout.write(`${stable(grantEnvelope(inputs))}\n`)}
function refTipEnvelope(){scannerRoot();const refs=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)"])),matches=[];for(const ref of refs)for(const p of lines(git(CONTROLLER,["ls-tree","-r","--name-only","--full-tree",ref])))if(RX.test(p))matches.push(`${ref}:${p}`);return{all_refs:String(refs.length),hit_count:String(matches.length),matches,ref_set_sha256:hash(Buffer.from(stable(refs))),schema:"fix09-ref-tip/v1",scope:SCOPE}}
function refTipScan(){process.stdout.write(`${stable(refTipEnvelope())}\n`)}
function worktreeEnvelope(){scannerRoot();const worktrees=parseWorktrees(git(CONTROLLER,["worktree","list","--porcelain","-z"])),tracked=[],untracked=[];for(const w of worktrees){for(const p of lines(git(w,["ls-files"])))if(RX.test(p))tracked.push(`${w}:${p}`);for(const p of lines(git(w,["ls-files","--others","--exclude-standard"])))if(RX.test(p))untracked.push(`${w}:${p}`)}return{registered_worktrees:String(worktrees.length),schema:"fix09-worktree/v1",scope:SCOPE,tracked_hit_count:String(tracked.length),tracked_matches:tracked,untracked_hit_count:String(untracked.length),untracked_matches:untracked,worktree_set_sha256:hash(Buffer.from(stable(worktrees)))}}
function worktreeScan(){process.stdout.write(`${stable(worktreeEnvelope())}\n`)}
function strictUtf8(b,code){const s=b.toString("utf8");if(!Buffer.from(s).equals(b)||b.includes(0))throw Error(code);return s}
function markdownPath(p){return /(^|\/)\.hermes(?:\/|$)/.test(p)?false:/\.md$/.test(p)}
const WORKTREE_MARKDOWN_REQUEST=Object.freeze({schema:"fix09-worktree-markdown-request/v1",tracked:"include",nonignored_untracked:"include",private_component:"exclude"});
const WORKTREE_REQUEST_KEYS=Object.freeze(["schema","tracked","nonignored_untracked","private_component"]);
function validateWorktreeRequest(request,enforce=true){if(enforce===false){if(!FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_WORKTREE");return}try{const own=Reflect.ownKeys(request);if(enforce!==true||request===null||typeof request!=="object"||Object.getPrototypeOf(request)!==Object.prototype||!Object.isFrozen(request)||own.length!==WORKTREE_REQUEST_KEYS.length||own.some((key,i)=>typeof key!=="string"||key!==WORKTREE_REQUEST_KEYS[i]))throw Error("FIX09_PAPER_WORKTREE");for(const key of WORKTREE_REQUEST_KEYS){const d=Object.getOwnPropertyDescriptor(request,key);if(!d||d.get!==undefined||d.set!==undefined||d.enumerable!==true||d.configurable!==false||d.writable!==false||d.value!==WORKTREE_MARKDOWN_REQUEST[key])throw Error("FIX09_PAPER_WORKTREE")}}catch{throw Error("FIX09_PAPER_WORKTREE")}}
const CAPTURED_ENUMERATOR=Object.freeze({gitList(root,kind,request){const argv=kind==="tracked"?["ls-files","-z","--","*.md",":(exclude).hermes/**",":(exclude)**/.hermes/**"]:["ls-files","-z","--others","--exclude-standard","--","*.md",":(exclude).hermes/**",":(exclude)**/.hermes/**"];return git(root,argv)}}),CAPTURED_WORKTREE_ADAPTER=Object.freeze({enumerator:CAPTURED_ENUMERATOR,io:CAPTURED_IO});
function treeMarkdown(ref){const documents=[];function walk(tree,prefix){for(const record of nulRecords(git(CONTROLLER,["ls-tree","-z",tree]),"FIX09_PAPER_TREE")){const tab=record.indexOf("\t"),meta=record.slice(0,tab).match(/^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40})$/),name=record.slice(tab+1);if(tab<1||!meta||!name||name==="."||name===".."||name.includes("/"))throw Error("FIX09_PAPER_TREE");if(name===".hermes")continue;const p=prefix?prefix+"/"+name:name;if(meta[2]==="tree")walk(meta[3],p);else if(meta[2]==="blob"&&markdownPath(p)){const body=git(CONTROLLER,["cat-file","blob",meta[3]]);strictUtf8(body,"FIX09_PAPER_UTF8");documents.push({blob:meta[3],body,content_sha256:hash(body),path:p,ref})}}}walk(gitText(CONTROLLER,["rev-parse",ref+"^{tree}"]),"");return documents}
function listedMarkdown(root,kind,request=WORKTREE_MARKDOWN_REQUEST,enumerator=CAPTURED_ENUMERATOR,enforceRequest=true){validateWorktreeRequest(request,enforceRequest);if(enumerator!==CAPTURED_ENUMERATOR&&!FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_WORKTREE");if(!["tracked","untracked"].includes(kind))throw Error("FIX09_PAPER_WORKTREE");const raw=enumerator.gitList(root,kind,request),paths=nulRecords(raw,"FIX09_PAPER_WORKTREE");if(new Set(paths).size!==paths.length||stable([...paths].sort())!==stable(paths)||paths.some(p=>!markdownPath(p)||path.isAbsolute(p)||p.split("/").includes("..")))throw Error("FIX09_PAPER_WORKTREE");return{paths,raw}}
function stableMetadata(st){if(typeof st.dev!=="bigint"||typeof st.ino!=="bigint"||typeof st.mode!=="bigint"||typeof st.size!=="bigint"||typeof st.mtimeNs!=="bigint"||typeof st.ctimeNs!=="bigint"||!st.isFile()||st.isSymbolicLink()||st.nlink!==1n)throw Error("FIX09_PAPER_WORKTREE");return{ctime_ns:st.ctimeNs.toString(),dev:st.dev.toString(),ino:st.ino.toString(),mode:st.mode.toString(),mtime_ns:st.mtimeNs.toString(),nlink:st.nlink.toString(),size:st.size.toString()}}
function validateStableTrace(trace){keys(trace,["close","fstat","lstat","open","read","realpath"],"FIX09_PAPER_WORKTREE");if(trace.fstat!==2)throw Error("FIX09_MUTANT_POST_FSTAT");if(trace.lstat!==2)throw Error("FIX09_MUTANT_PATH_LSTAT");if(trace.open!==1||trace.read!==1||trace.close!==1||trace.realpath!==2)throw Error("FIX09_PAPER_WORKTREE")}
function unstable(){throw Error("FIX09_PAPER_UNSTABLE")}
function rejectSymlinkTransition(io,target,physical,trace){trace.lstat++;stableMetadata(io.lstatSync(target,{bigint:true}));trace.realpath++;const finalPhysical=io.realpathSyncNative(target);if(finalPhysical!==target||finalPhysical!==physical)throw Error("FIX09_PAPER_WORKTREE")}
function stableReadCore(root,relative,io,policy){const trace={close:0,fstat:0,lstat:0,open:0,read:0,realpath:0};let fd=null,result=null,failure=null;try{if(!Number.isInteger(CAPTURED_O_RDONLY)||!Number.isInteger(CAPTURED_O_NOFOLLOW)||CAPTURED_O_NOFOLLOW===0||typeof root!=="string"||!path.isAbsolute(root)||typeof relative!=="string"||!markdownPath(relative)||relative===""||relative==="."||relative.split("/").some(x=>x===""||x==="."||x===".."))throw Error("FIX09_PAPER_WORKTREE");const target=CAPTURED_RESOLVE(root,relative);if(target===root||!target.startsWith(root+CAPTURED_SEP))throw Error("FIX09_PAPER_WORKTREE");trace.realpath++;const physical=io.realpathSyncNative(target);if(physical!==target||!physical.startsWith(root+CAPTURED_SEP)||!markdownPath(physical))throw Error("FIX09_PAPER_WORKTREE");trace.open++;fd=io.openSync(target,CAPTURED_O_RDONLY|CAPTURED_O_NOFOLLOW);if(!Number.isSafeInteger(fd)||fd<0)throw Error("FIX09_PAPER_WORKTREE");trace.fstat++;const fdBefore=stableMetadata(io.fstatSync(fd,{bigint:true}));trace.lstat++;const pathBefore=stableMetadata(io.lstatSync(target,{bigint:true}));same(fdBefore,pathBefore,"FIX09_PAPER_WORKTREE");trace.read++;const body=io.readFileSync(fd);if(!Buffer.isBuffer(body))throw Error("FIX09_PAPER_WORKTREE");let fdAfter=fdBefore;if(policy.postFstat){trace.fstat++;fdAfter=stableMetadata(io.fstatSync(fd,{bigint:true}));if(stable(fdBefore)!==stable(fdAfter)){rejectSymlinkTransition(io,target,physical,trace);unstable()}}trace.realpath++;const finalPhysical=io.realpathSyncNative(target);if(finalPhysical!==target||finalPhysical!==physical||!finalPhysical.startsWith(root+CAPTURED_SEP)||!markdownPath(finalPhysical))throw Error("FIX09_PAPER_WORKTREE");let pathAfter=pathBefore;if(policy.postLstat){trace.lstat++;pathAfter=stableMetadata(io.lstatSync(target,{bigint:true}));if(stable(pathBefore)!==stable(pathAfter))unstable()}if(policy.postFstat&&policy.postLstat&&stable(fdAfter)!==stable(pathAfter))unstable();if(BigInt(body.length)!==BigInt(fdAfter.size)||BigInt(body.length)!==BigInt(pathAfter.size))unstable();result={body,metadata:fdAfter,target,trace}}catch(e){failure=e instanceof Error&&/^FIX09_[A-Z0-9_]+$/.test(e.message)?e:Error("FIX09_PAPER_WORKTREE")}finally{if(fd!==null){trace.close++;try{if(io.closeSync(fd)!==undefined)failure=Error("FIX09_PAPER_WORKTREE")}catch{failure=Error("FIX09_PAPER_WORKTREE")}}}if(failure!==null)throw failure;if(result===null)throw Error("FIX09_PAPER_WORKTREE");return result}
function stableReadWorktreeMarkdown(root,relative,io=CAPTURED_IO){if(io!==CAPTURED_IO&&!FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_WORKTREE");const result=stableReadCore(root,relative,io,{postFstat:true,postLstat:true});validateStableTrace(result.trace);return{body:result.body,metadata:result.metadata}}
function worktreeRequest(root,kind,request=WORKTREE_MARKDOWN_REQUEST,adapter=CAPTURED_WORKTREE_ADAPTER,enforceRequest=true){validateWorktreeRequest(request,enforceRequest);if(adapter!==CAPTURED_WORKTREE_ADAPTER&&!FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_WORKTREE");const listed=listedMarkdown(root,kind,request,adapter.enumerator,enforceRequest),documents=[];for(const p of listed.paths){const read=stableReadWorktreeMarkdown(root,p,adapter.io);strictUtf8(read.body,"FIX09_PAPER_UTF8");documents.push({body:read.body,content_sha256:hash(read.body),kind,metadata:read.metadata,path:p,root})}return{documents,paths:listed.paths,raw:listed.raw}}
function worktreePass(roots,request=WORKTREE_MARKDOWN_REQUEST,adapter=CAPTURED_WORKTREE_ADAPTER,enforceRequest=true){validateWorktreeRequest(request,enforceRequest);if(adapter!==CAPTURED_WORKTREE_ADAPTER&&!FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_WORKTREE");const documents=[],enumerations=[];for(const root of roots){const before={tracked:worktreeRequest(root,"tracked",request,adapter,enforceRequest),untracked:worktreeRequest(root,"untracked",request,adapter,enforceRequest)};for(const kind of ["tracked","untracked"])documents.push(...before[kind].documents);const after={tracked:listedMarkdown(root,"tracked",request,adapter.enumerator,enforceRequest),untracked:listedMarkdown(root,"untracked",request,adapter.enumerator,enforceRequest)};for(const kind of ["tracked","untracked"])if(!before[kind].raw.equals(after[kind].raw))unstable();enumerations.push({root,tracked:before.tracked.raw,untracked:before.untracked.raw})}return{documents,enumerations}}
function documentProjection(documents){return documents.map(({content_sha256,kind,metadata,path,root})=>({content_sha256,kind,metadata,path,root}))}
function sameEnumerations(a,b){if(a.length!==b.length)unstable();for(let i=0;i<a.length;i++)if(a[i].root!==b[i].root||!a[i].tracked.equals(b[i].tracked)||!a[i].untracked.equals(b[i].untracked))unstable()}
function validateTwoPassTrace(trace){keys(trace,["equality_count","pass_count"],"FIX09_MUTANT_TWO_PASS");if(trace.pass_count!==2||trace.equality_count!==2)throw Error("FIX09_MUTANT_TWO_PASS")}
function twoPassWorktreeSnapshot(makePass,betweenPass=()=>{},policy={enforce:true}){const trace={equality_count:0,pass_count:0};trace.pass_count++;const first=makePass();betweenPass();trace.pass_count++;const second=makePass();if(policy.enforce){trace.equality_count++;sameEnumerations(first.enumerations,second.enumerations);trace.equality_count++;if(stable(documentProjection(first.documents))!==stable(documentProjection(second.documents)))unstable()}return{documents:second.documents,enumerations:second.enumerations,trace}}
function worktreeMarkdown(roots){const snapshot=twoPassWorktreeSnapshot(()=>worktreePass(roots,WORKTREE_MARKDOWN_REQUEST));validateTwoPassTrace(snapshot.trace);return snapshot}
function authorityAllow(authority){if(gitText(CONTROLLER,["rev-parse",authority+"^"])!==PREVIOUS_AUTHORITY_REF)throw Error("FIX09_PAPER_AUTHORITY");verifyPreviousAuthority();verifyFix10Dependency();const out={};for(const p of AUTHORITY_PATHS)out[p]=new Set();for(const commit of [...AUTHORITY_PREDECESSORS,authority])for(const p of AUTHORITY_PATHS){const record=lines(git(CONTROLLER,["ls-tree","--full-tree",commit,"--",":(top)"+p]))[0];if(record===undefined)continue;const m=record.match(/^100644 blob ([0-9a-f]{40})\t(.+)$/);if(!m||m[2]!==p)throw Error("FIX09_PAPER_AUTHORITY");const body=git(CONTROLLER,["cat-file","blob",m[1]]);strictUtf8(body,"FIX09_PAPER_UTF8");out[p].add(hash(body))}return out}
function validatePreservedFailurePolicy(policy=PRESERVED_FAILURE_CLAIMS){try{if(!Array.isArray(policy)||policy.length!==2||new Set(policy.map(x=>x.owner)).size!==2)throw Error("FIX09_PAPER_CLAIM");for(const entry of policy){keys(entry,PRESERVED_FAILURE_CLAIM_KEYS,"FIX09_PAPER_CLAIM");if(entry.path!=="dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md"||entry.mode!=="100644"||entry.tracked_clean!=="1"||entry.line!=="20"||entry.token!=="0064"||!path.isAbsolute(entry.owner)||![entry.blob,entry.tip].every(sha40)||![entry.content_sha256,entry.line_sha256].every(x=>/^[0-9a-f]{64}$/.test(x))||!entry.branch_ref.startsWith("refs/heads/codex/fix09-c35-admission"))throw Error("FIX09_PAPER_CLAIM")}if(stable(policy)!==stable(PRESERVED_FAILURE_CLAIMS))throw Error("FIX09_PAPER_CLAIM")}catch{throw Error("FIX09_PAPER_CLAIM")}return policy}
function validatePreservedFailureStates(states){try{if(!Array.isArray(states)||states.length>2||new Set(states.map(x=>x.owner)).size!==states.length)throw Error("FIX09_PAPER_CLAIM");for(const state of states){keys(state,PRESERVED_FAILURE_STATE_KEYS,"FIX09_PAPER_CLAIM");if(!PRESERVED_FAILURE_CLAIMS.some(entry=>entry.owner===state.owner))throw Error("FIX09_PAPER_CLAIM")}}catch{throw Error("FIX09_PAPER_CLAIM")}return states}
function preservedFailureStates(registry,roots){const policy=validatePreservedFailurePolicy(),records=nulRecords(registry,"FIX09_WORKTREE_REGISTRY"),states=[];for(const entry of policy){if(roots.filter(root=>root===entry.owner).length!==1)continue;const marker=`worktree ${entry.owner}`,positions=[];for(let i=0;i<records.length;i++)if(records[i]===marker)positions.push(i);if(positions.length!==1)throw Error("FIX09_WORKTREE_REGISTRY");const at=positions[0],head=(records[at+1]||"").match(/^HEAD ([0-9a-f]{40})$/),branch=(records[at+2]||"").match(/^branch (refs\/heads\/.+)$/);if(!head||!branch)throw Error("FIX09_WORKTREE_REGISTRY");const liveTip=gitText(entry.owner,["rev-parse","HEAD"]),liveBranch=gitText(entry.owner,["symbolic-ref","HEAD"]);if(liveTip!==head[1]||liveBranch!==branch[1])throw Error("FIX09_WORKTREE_REGISTRY");const index=lines(git(entry.owner,["ls-files","-s","--",`:(top)${entry.path}`])),match=index.length===1?index[0].match(/^([0-7]{6}) ([0-9a-f]{40}) 0\t(.+)$/):null,status=git(entry.owner,["status","--porcelain=v1","-z","--untracked-files=no","--",`:(top)${entry.path}`]);states.push({branch_ref:branch[1],blob:match?.[2]??"",mode:match?.[1]??"",owner:entry.owner,path:match?.[3]??entry.path,tip:head[1],tracked_clean:status.length===0?"1":"0"})}return states}
function canonicalPreservedFailureStates(states){if(!IS_SHADOW)return states;return states.map((state,index)=>{const at=PRESERVED_FAILURE_CLAIMS.findIndex(entry=>entry.owner===state.owner);if(at<0)throw Error("FIX09_PAPER_CLAIM");return{...state,owner:CANONICAL_PRESERVED_FAILURE_CLAIMS[at].owner}})}
function preservedFailureAllowed(document,claim,claimCount,states,policy=PRESERVED_FAILURE_CLAIMS){validatePreservedFailurePolicy(policy);validatePreservedFailureStates(states);if(document.domain!=="tracked"||claimCount!==1)return false;const entries=policy.filter(entry=>entry.owner===document.owner),state=states.find(value=>value.owner===document.owner);if(entries.length!==1||state===undefined)return false;const entry=entries[0],expectedState={branch_ref:entry.branch_ref,blob:entry.blob,mode:entry.mode,owner:entry.owner,path:entry.path,tip:entry.tip,tracked_clean:entry.tracked_clean};return stable(state)===stable(expectedState)&&document.path===entry.path&&document.content_sha256===entry.content_sha256&&gitBlob(document.body)===entry.blob&&claim.line===entry.line&&claim.line_sha256===entry.line_sha256&&claim.token===entry.token}
function classifyClaims(documents,allow,preservedStates=[]){let allowed=0,preserved=0;const independent=[];validatePreservedFailurePolicy();validatePreservedFailureStates(preservedStates);for(const d of documents){const dependency=FIX10_DEPENDENCY_ALLOW[d.path],dependencyBytesAllowed=dependency!==undefined&&dependency.content_sha256===d.content_sha256&&dependency.blob===gitBlob(d.body),lineValues=strictUtf8(d.body,"FIX09_PAPER_UTF8").split("\n"),claims=[];for(let i=0;i<lineValues.length;i++){const line=lineValues[i];CLAIM_RX.lastIndex=0;for(let m;(m=CLAIM_RX.exec(line))!==null;)claims.push({line:String(i+1),line_sha256:hash(Buffer.from(line+"\n")),token:m[0]})}for(const claim of claims){const exactToken=/^(?:0064(?:\.sql)?|0064_fix09_audit_chain(?:\.sql)?)$/.test(claim.token),authorityAllowed=Object.hasOwn(allow,d.path)&&allow[d.path].has(d.content_sha256)&&exactToken,dependencyAllowed=dependencyBytesAllowed&&exactToken,historicalAllowed=d.path===HISTORICAL_PATH&&lineValues[Number(claim.line)-1]===HISTORICAL_LINE&&claim.line_sha256===HISTORICAL_LINE_SHA256,preservedAllowed=preservedFailureAllowed(d,claim,claims.length,preservedStates);if(authorityAllowed||dependencyAllowed||historicalAllowed||preservedAllowed){allowed++;if(preservedAllowed)preserved++;continue}independent.push({content_sha256:d.content_sha256,domain:d.domain,line:claim.line,line_sha256:claim.line_sha256,owner:d.owner,path:d.path,token:claim.token})}}return{allowed,independent,preserved}}
function expectCode(fn,code){let observed=null;try{fn()}catch(e){observed=e.message}if(observed!==code)throw Error("FIX09_PAPER_FIXTURE")}
function withFixtureIo(fn){if(FIXTURE_IO_ALLOWED)throw Error("FIX09_PAPER_FIXTURE");FIXTURE_IO_ALLOWED=true;try{return fn()}finally{FIXTURE_IO_ALLOWED=false}}
function makeFixtureIo(afterRead=()=>{}){let target=null,fired=false;const calls={open:[],read:[]},io=Object.freeze({closeSync:CAPTURED_IO.closeSync,fstatSync:CAPTURED_IO.fstatSync,lstatSync:CAPTURED_IO.lstatSync,openSync(p,flags){target=p;calls.open.push(p);return CAPTURED_IO.openSync(p,flags)},readFileSync(fd){const body=CAPTURED_IO.readFileSync(fd);calls.read.push(target);if(!fired){fired=true;afterRead({fd,target})}return body},realpathSyncNative:CAPTURED_IO.realpathSyncNative});return{calls,io}}
function excludedPathZeroIoFixture(){const calls={git:0,list:0,open:0,read:0,stat:0},stop=(kind)=>()=>{calls[kind]++;throw Error("FIX09_ZERO_IO_ESCAPE")},enumerator=Object.freeze({gitList(){calls.git++;calls.list++;throw Error("FIX09_ZERO_IO_ESCAPE")}}),io=Object.freeze({closeSync:stop("stat"),fstatSync:stop("stat"),lstatSync:stop("stat"),openSync:stop("open"),readFileSync:stop("read"),realpathSyncNative:stop("stat")}),adapter=Object.freeze({enumerator,io}),validCalls={git:0,list:0},validEnumerator=Object.freeze({gitList(root,kind,request){if(request!==WORKTREE_MARKDOWN_REQUEST||request.private_component!=="exclude")throw Error("FIX09_PAPER_WORKTREE");validCalls.git++;validCalls.list++;return Buffer.alloc(0)}}),validAdapter=Object.freeze({enumerator:validEnumerator,io}),hostile=Object.freeze({schema:"fix09-worktree-markdown-request/v1",tracked:"include",nonignored_untracked:"include",private_component:"include"});withFixtureIo(()=>worktreePass(["/virtual-root"],WORKTREE_MARKDOWN_REQUEST,validAdapter,true));if(validCalls.git!==4||validCalls.list!==4||Object.values(calls).some(n=>n!==0))throw Error("FIX09_ZERO_IO_ESCAPE");expectCode(()=>withFixtureIo(()=>worktreePass(["/virtual-root"],hostile,adapter,true)),"FIX09_PAPER_WORKTREE");if(Object.values(calls).some(n=>n!==0))throw Error("FIX09_ZERO_IO_ESCAPE");expectCode(()=>withFixtureIo(()=>worktreePass(["/virtual-root"],hostile,adapter,false)),"FIX09_ZERO_IO_ESCAPE");if(calls.git!==1||calls.list!==1||calls.stat!==0||calls.open!==0||calls.read!==0)throw Error("FIX09_ZERO_IO_ESCAPE");return{git:0,list:0,open:0,read:0,stat:0}}
function fixtureStat(overrides={}){return Object.freeze({ctimeNs:1n,dev:1n,ino:1n,isFile:()=>true,isSymbolicLink:()=>false,mode:33152n,mtimeNs:1n,nlink:1n,size:1n,...overrides})}
function lateMetadataFixtureTests(){const run=(boundary,late)=>{let fstat=0,lstat=0;const before=fixtureStat(),io=Object.freeze({closeSync:()=>undefined,fstatSync:()=>++fstat===2&&boundary==="fstat"?late:before,lstatSync:()=>++lstat===2&&boundary==="lstat"?late:before,openSync:()=>7,readFileSync:()=>Buffer.from("x"),realpathSyncNative:p=>p});expectCode(()=>stableReadCore("/virtual-root","lawful.md",io,{postFstat:true,postLstat:true}),"FIX09_PAPER_WORKTREE")};for(const boundary of ["fstat","lstat"]){run(boundary,fixtureStat({isFile:()=>false}));run(boundary,fixtureStat({isSymbolicLink:()=>true}));run(boundary,fixtureStat({nlink:2n}))}let fstat=0,lstat=0;const before=fixtureStat(),changed=fixtureStat({mtimeNs:2n}),lawful=Object.freeze({closeSync:()=>undefined,fstatSync:()=>++fstat===2?changed:before,lstatSync:()=>{lstat++;return before},openSync:()=>7,readFileSync:()=>Buffer.from("x"),realpathSyncNative:p=>p});expectCode(()=>stableReadCore("/virtual-root","lawful.md",lawful,{postFstat:true,postLstat:true}),"FIX09_PAPER_UNSTABLE");return{fatal:"6",retryable:"1"}}
function fixtureDocument(root,kind,p,text){const body=Buffer.from(text);return{body,content_sha256:hash(body),kind,metadata:{ctime_ns:"1",dev:"1",ino:"1",mode:"33152",mtime_ns:"1",nlink:"1",size:String(body.length)},path:p,root}}
function fixturePass(root,paths){const nul=Buffer.from(paths.length?paths.join("\0")+"\0":""),documents=paths.map(p=>fixtureDocument(root,"tracked",p,"claim 0064\n"));return{documents,enumerations:[{root,tracked:nul,untracked:Buffer.alloc(0)}]}}
function verifyFix10Dependency(){if(gitText(CONTROLLER,["rev-parse",FIX10_DEPENDENCY_REF+"^"])!==FIX10_DEPENDENCY_PARENT||gitText(CONTROLLER,["rev-parse",FIX10_DEPENDENCY_REF+"^{tree}"])!==FIX10_DEPENDENCY_TREE)throw Error("FIX09_DEPENDENCY_AUTHORITY");for(const [p,pin] of Object.entries(FIX10_DEPENDENCY_DOCS)){const body=git(CONTROLLER,["show",`${FIX10_DEPENDENCY_REF}:${p}`]);if(hash(body)!==pin.content_sha256||gitBlob(body)!==pin.blob)throw Error("FIX09_DEPENDENCY_AUTHORITY")}const allowedDocuments=Object.entries(FIX10_DEPENDENCY_ALLOW).map(([p,pin])=>{const body=git(CONTROLLER,["show",`${FIX10_DEPENDENCY_REF}:${p}`]);if(hash(body)!==pin.content_sha256||gitBlob(body)!==pin.blob)throw Error("FIX09_DEPENDENCY_AUTHORITY");return{body,content_sha256:hash(body),domain:"fixture",owner:FIX10_DEPENDENCY_REF,path:p}}),review=fs.readFileSync(FIX10_REVIEW),st=fs.lstatSync(FIX10_REVIEW),reviewLines=strictUtf8(review,"FIX09_DEPENDENCY_AUTHORITY").split("\n").map(x=>x.trimEnd());if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o644||fs.realpathSync(FIX10_REVIEW)!==FIX10_REVIEW||hash(review)!==FIX10_REVIEW_SHA256||gitBlob(review)!==FIX10_REVIEW_BLOB)throw Error("FIX09_DEPENDENCY_AUTHORITY");for(const line of ["AUTHORITY FIDELITY VERDICT: PASS","SPEC VERDICT: SPEC PASS","PLAN VERDICT: PLAN PASS","UNRESOLVED: P0=0 P1=0 P2=0 P3=0","FIX-10 v9 AUTHORITY APPROVED: YES","FIX-10 IMPLEMENTATION AUTHORIZED: NO"])if(reviewLines.filter(x=>x===line).length!==1)throw Error("FIX09_DEPENDENCY_AUTHORITY");return allowedDocuments}
function verifyPreviousAuthority(){if(gitText(CONTROLLER,["rev-parse",PREVIOUS_AUTHORITY_REF+"^"])!==PREVIOUS_AUTHORITY_PARENT||gitText(CONTROLLER,["rev-parse",PREVIOUS_AUTHORITY_REF+"^{tree}"])!==PREVIOUS_AUTHORITY_TREE||gitText(CONTROLLER,["show","-s","--format=%s",PREVIOUS_AUTHORITY_REF])!=="docs(obs): reconcile FIX-09 v15 paper evidence")throw Error("FIX09_PAPER_AUTHORITY");for(const [p,pin] of Object.entries(PREVIOUS_AUTHORITY_DOCS)){const body=git(CONTROLLER,["show",`${PREVIOUS_AUTHORITY_REF}:${p}`]);if(hash(body)!==pin.content_sha256||gitBlob(body)!==pin.blob)throw Error("FIX09_PAPER_AUTHORITY")}}
function dependencyFixtureTests(){const exactPaths=["dialectical-engine/docs/missions/observability-agents/slices/FIX-10/DECISIONS.md","dialectical-engine/docs/missions/observability-agents/slices/FIX-10/PLAN-v4.md","dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v4.md","dialectical-engine/docs/missions/observability-agents/slices/FIX-10/SPEC-v6.md"];same(Object.keys(FIX10_DEPENDENCY_ALLOW),exactPaths,"FIX09_PAPER_FIXTURE");const documents=verifyFix10Dependency(),make=(p,body)=>({body,content_sha256:hash(body),domain:"fixture",owner:FIX10_DEPENDENCY_REF,path:p}),exact=classifyClaims(documents,{});if(exact.allowed!==6||exact.independent.length!==0)throw Error("FIX09_PAPER_FIXTURE");const base=documents[0],mutated=make(base.path,Buffer.concat([base.body,Buffer.from(" ")])),extra=make(base.path,Buffer.concat([base.body,Buffer.from("independent allocation migrations/0064.sql\n")])),newDocument=make("dialectical-engine/docs/missions/observability-agents/slices/FIX-10/NEW.md",base.body);if(classifyClaims([mutated],{}).independent.length!==1||classifyClaims([extra],{}).independent.length!==2||classifyClaims([newDocument],{}).independent.length!==1)throw Error("FIX09_PAPER_FIXTURE")}
function preservedFailureFixtureTests(){validatePreservedFailurePolicy();const body=git(CONTROLLER,["cat-file","blob",PRESERVED_FAILURE_CLAIMS[0].blob]);if(hash(body)!==PRESERVED_FAILURE_CLAIMS[0].content_sha256||gitBlob(body)!==PRESERVED_FAILURE_CLAIMS[0].blob)throw Error("FIX09_PAPER_FIXTURE");const state=(entry)=>({branch_ref:entry.branch_ref,blob:entry.blob,mode:entry.mode,owner:entry.owner,path:entry.path,tip:entry.tip,tracked_clean:entry.tracked_clean}),states=PRESERVED_FAILURE_CLAIMS.map(state),document=(entry)=>({body,content_sha256:hash(body),domain:"tracked",owner:entry.owner,path:entry.path}),documents=PRESERVED_FAILURE_CLAIMS.map(document),exact=classifyClaims(documents,{},states);if(exact.allowed!==2||exact.independent.length!==0)throw Error("FIX09_PAPER_FIXTURE");const entry=PRESERVED_FAILURE_CLAIMS[0],doc=document(entry),claim={line:entry.line,line_sha256:entry.line_sha256,token:entry.token},rejectState=(field,value)=>{const hostile=states.map(x=>({...x}));hostile[0][field]=value;if(preservedFailureAllowed(doc,claim,1,hostile))throw Error("FIX09_PAPER_FIXTURE")};rejectState("branch_ref","refs/heads/codex/forged");rejectState("tip","0".repeat(40));rejectState("mode","100755");rejectState("blob","0".repeat(40));rejectState("tracked_clean","0");if(preservedFailureAllowed({...doc,owner:"/private/tmp/forged"},claim,1,states)||preservedFailureAllowed({...doc,path:"dialectical-engine/docs/missions/observability-agents/slices/FIX-10/FORGED.md"},claim,1,states)||preservedFailureAllowed({...doc,content_sha256:"0".repeat(64)},claim,1,states)||preservedFailureAllowed(doc,{...claim,line:"19"},1,states)||preservedFailureAllowed(doc,{...claim,line_sha256:"0".repeat(64)},1,states)||preservedFailureAllowed(doc,{...claim,token:"0064.sql"},1,states)||preservedFailureAllowed(doc,claim,2,states))throw Error("FIX09_PAPER_FIXTURE");const extraBody=Buffer.concat([body,Buffer.from("independent allocation 0064\n")]),extraDoc={...doc,body:extraBody,content_sha256:hash(extraBody)};if(classifyClaims([extraDoc],{},states).independent.length!==2||classifyClaims([doc],{},states.slice(1)).independent.length!==1)throw Error("FIX09_PAPER_FIXTURE");expectCode(()=>classifyClaims([doc],{},[states[0],states[0]]),"FIX09_PAPER_CLAIM");expectCode(()=>validatePreservedFailurePolicy(PRESERVED_FAILURE_CLAIMS.slice(1)),"FIX09_PAPER_CLAIM");expectCode(()=>validatePreservedFailurePolicy([PRESERVED_FAILURE_CLAIMS[0],PRESERVED_FAILURE_CLAIMS[0]]),"FIX09_PAPER_CLAIM");return{hostile:"17",positive:"2"}}
function paperFixtureTests(){excludedPathZeroIoFixture();lateMetadataFixtureTests();dependencyFixtureTests();preservedFailureFixtureTests();const make=(domain,p,text)=>{const body=Buffer.from(text);return{body,content_sha256:hash(body),domain,owner:"/private/tmp/fix09-v16-fixture",path:p}},authorityPath=FIX09_AUTHORITY_DIR+"/SPEC-v16.md",authorityDoc=make("tracked",authorityPath,"claim `0064_fix09_audit_chain.sql`\n"),allow={[authorityPath]:new Set([authorityDoc.content_sha256])},one=(doc)=>classifyClaims([doc],allow),mutants=[];if(one(authorityDoc).allowed!==1||one(authorityDoc).independent.length!==0)throw Error("FIX09_PAPER_FIXTURE");const historical=make("ref",HISTORICAL_PATH,HISTORICAL_LINE+"\n");if(one(historical).allowed!==1||one(historical).independent.length!==0)throw Error("FIX09_PAPER_FIXTURE");if(one(make("tracked",FIX09_AUTHORITY_DIR+"/ROGUE.md","claim 0064\n")).independent.length!==1)throw Error("FIX09_PAPER_FIXTURE");const tmp=fs.mkdtempSync("/private/tmp/fix09-v16-paper."),a=path.join(tmp,"a"),b=path.join(tmp,"b"),missing=path.join(tmp,"missing"),stableRoot=path.join(tmp,"stable"),raceRoot=path.join(tmp,"races");fs.mkdirSync(a);fs.mkdirSync(b);fs.mkdirSync(stableRoot);fs.mkdirSync(raceRoot);const registry=(xs)=>Buffer.from(xs.map(x=>"worktree "+x+"\0HEAD "+"1".repeat(40)+"\0\0").join("")),mustRejectRegistry=(bytes)=>{let rejected=false;try{parseWorktrees(bytes)}catch{rejected=true}if(!rejected)throw Error("FIX09_PAPER_FIXTURE")};try{mustRejectRegistry(registry([a,a]));mustRejectRegistry(registry([missing]));fs.chmodSync(b,0o000);mustRejectRegistry(registry([b]));fs.chmodSync(b,0o700);
  for(const [name,kind] of [["tracked.md","tracked"],["untracked.md","untracked"]]){fs.writeFileSync(path.join(stableRoot,name),"claim 0064\n");const read=stableReadWorktreeMarkdown(stableRoot,name),doc={body:read.body,content_sha256:hash(read.body),domain:kind,owner:stableRoot,path:name};if(one(doc).independent.length!==1)throw Error("FIX09_PAPER_FIXTURE")}
  const replacement=path.join(raceRoot,"replacement.md"),replacementNext=path.join(raceRoot,"replacement-next.md");fs.writeFileSync(replacement,"old bytes\n");fs.writeFileSync(replacementNext,"new bytes\n");const replaceIo=makeFixtureIo(()=>fs.renameSync(replacementNext,replacement));expectCode(()=>withFixtureIo(()=>stableReadWorktreeMarkdown(raceRoot,"replacement.md",replaceIo.io)),"FIX09_PAPER_WORKTREE");
  const sameInode=path.join(raceRoot,"same-inode.md");fs.writeFileSync(sameInode,"old bytes\n");const mutateIo=makeFixtureIo(()=>fs.truncateSync(sameInode,0));expectCode(()=>withFixtureIo(()=>stableReadWorktreeMarkdown(raceRoot,"same-inode.md",mutateIo.io)),"FIX09_PAPER_UNSTABLE");
  const symlinkTarget=path.join(raceRoot,"symlink.md"),symlinkSaved=path.join(raceRoot,"symlink-saved.md"),symlinkOther=path.join(raceRoot,"symlink-other.md");fs.writeFileSync(symlinkTarget,"old bytes\n");fs.writeFileSync(symlinkOther,"new bytes\n");const symlinkIo=makeFixtureIo(()=>{fs.renameSync(symlinkTarget,symlinkSaved);fs.symlinkSync(symlinkOther,symlinkTarget)});expectCode(()=>withFixtureIo(()=>stableReadWorktreeMarkdown(raceRoot,"symlink.md",symlinkIo.io)),"FIX09_PAPER_WORKTREE");
  let addPaths=["a.md"];expectCode(()=>twoPassWorktreeSnapshot(()=>fixturePass(stableRoot,addPaths),()=>{addPaths=["a.md","b.md"]}),"FIX09_PAPER_UNSTABLE");let removePaths=["a.md","b.md"];expectCode(()=>twoPassWorktreeSnapshot(()=>fixturePass(stableRoot,removePaths),()=>{removePaths=["a.md"]}),"FIX09_PAPER_UNSTABLE");
  const postFstat=stableReadCore(stableRoot,"tracked.md",CAPTURED_IO,{postFstat:false,postLstat:true});expectCode(()=>validateStableTrace(postFstat.trace),"FIX09_MUTANT_POST_FSTAT");mutants.push(["OMIT_POST_FSTAT","FIX09_MUTANT_POST_FSTAT"]);
  const pathRoot=path.join(tmp,"path-lstat-root"),pathSaved=path.join(tmp,"path-lstat-saved"),pathNextRoot=path.join(tmp,"path-lstat-next");fs.mkdirSync(pathRoot);fs.mkdirSync(pathNextRoot);fs.writeFileSync(path.join(pathRoot,"victim.md"),"old bytes\n");fs.writeFileSync(path.join(pathNextRoot,"victim.md"),"new bytes\n");const omitPathIo=makeFixtureIo(()=>{fs.renameSync(pathRoot,pathSaved);fs.renameSync(pathNextRoot,pathRoot)});const pathResult=stableReadCore(pathRoot,"victim.md",omitPathIo.io,{postFstat:true,postLstat:false});expectCode(()=>validateStableTrace(pathResult.trace),"FIX09_MUTANT_PATH_LSTAT");mutants.push(["OMIT_PATH_LSTAT","FIX09_MUTANT_PATH_LSTAT"]);
  let mutantPaths=["a.md"];const noEquality=twoPassWorktreeSnapshot(()=>fixturePass(stableRoot,mutantPaths),()=>{mutantPaths=["a.md","b.md"]},{enforce:false});expectCode(()=>validateTwoPassTrace(noEquality.trace),"FIX09_MUTANT_TWO_PASS");mutants.push(["OMIT_TWO_PASS","FIX09_MUTANT_TWO_PASS"])
}finally{try{fs.chmodSync(b,0o700)}catch{}fs.rmSync(tmp,{recursive:true})}return mutants}
function fix10SecurityIdentity(){verifyFix10Dependency();return{allow:Object.entries(FIX10_DEPENDENCY_ALLOW).map(([path,{blob,content_sha256}])=>({blob,content_sha256,path})),docs:Object.entries(FIX10_DEPENDENCY_DOCS).map(([path,{blob,content_sha256}])=>({blob,content_sha256,path})),parent:FIX10_DEPENDENCY_PARENT,ref:FIX10_DEPENDENCY_REF,review:{blob:FIX10_REVIEW_BLOB,content_sha256:FIX10_REVIEW_SHA256,verdict:{authority:"PASS",authority_approved:"YES",implementation_authorized:"NO",p0:"0",p1:"0",p2:"0",p3:"0",plan:"PASS",spec:"PASS"}},tree:FIX10_DEPENDENCY_TREE}}
function authoritySecurityIdentity(authority,allowSha){if(gitText(CONTROLLER,["rev-parse",authority+"^"])!==PREVIOUS_AUTHORITY_REF)throw Error("FIX09_PAPER_AUTHORITY");const paths=[`${FIX09_AUTHORITY_DIR}/DECISIONS.md`,`${FIX09_AUTHORITY_DIR}/PLAN-v16.md`,`${FIX09_AUTHORITY_DIR}/SPEC-v16.md`],documents=paths.map(path0=>{const row=lines(git(CONTROLLER,["ls-tree","--full-tree",authority,"--",`:(top)${path0}`]));if(row.length!==1)throw Error("FIX09_PAPER_AUTHORITY");const m=row[0].match(/^100644 blob ([0-9a-f]{40})\t(.+)$/);if(!m||m[2]!==path0)throw Error("FIX09_PAPER_AUTHORITY");const body=git(CONTROLLER,["cat-file","blob",m[1]]);return{blob:m[1],content_sha256:hash(body),mode:"100644",path:path0}}),program=fs.readFileSync(PROGRAM);return{authority:{allow_sha256:allowSha,commit:authority,documents_sha256:hash(Buffer.concat([Buffer.from("fix09-authority-documents/v1\0"),Buffer.from(stable(documents))])),parent:PREVIOUS_AUTHORITY_REF,tree:gitText(CONTROLLER,["rev-parse",authority+"^{tree}"])},fix10:fix10SecurityIdentity(),historical:{line_sha256:HISTORICAL_LINE_SHA256,path:HISTORICAL_PATH},program:{blob:gitBlob(program),bytes:String(program.length),sha256:hash(program)},scope:SCOPE,worktree_request:WORKTREE_MARKDOWN_REQUEST}}
function paperCollectOnce(authority){const refs=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)"])),registry=git(CONTROLLER,["worktree","list","--porcelain","-z"]),roots=parseWorktrees(registry),refDocs=refs.flatMap(treeMarkdown),worktreeSnapshot=worktreeMarkdown(roots),worktreeDocs=worktreeSnapshot.documents,allow=authorityAllow(authority),preservedStates=preservedFailureStates(registry,roots),canonicalStates=canonicalPreservedFailureStates(preservedStates),material=[...refDocs.map(d=>({...d,domain:"ref",owner:d.ref})),...worktreeDocs.map(d=>({...d,domain:d.kind,owner:d.root}))],classified=classifyClaims(material,allow,preservedStates),refEvidence=refDocs.map(({blob,content_sha256,path,ref})=>({blob,content_sha256,path,ref})),worktreeEvidence={documents:worktreeDocs.map(({content_sha256,kind,metadata,path,root})=>({content_sha256,kind,metadata,path,root})),enumerations:worktreeSnapshot.enumerations.map(({root,tracked,untracked})=>({root,tracked_bytes:String(tracked.length),tracked_sha256:hash(tracked),untracked_bytes:String(untracked.length),untracked_sha256:hash(untracked)}))},authorityProjection=Object.entries(allow).flatMap(([p,set])=>[...set].map(content_sha256=>({content_sha256,path:p}))),dependencyProjection=Object.entries(FIX10_DEPENDENCY_ALLOW).map(([p,{blob,content_sha256}])=>({blob,content_sha256,path:p})),preservedProjection=CANONICAL_PRESERVED_FAILURE_CLAIMS.map(entry=>({kind:"preserved-failed-task0-worktree",...entry})),allowProjection=[...authorityProjection,...dependencyProjection,...preservedProjection].sort((a,b)=>stable(a).localeCompare(stable(b))),allowSha=hash(Buffer.concat([Buffer.from("fix09-paper-authority/v4\0"),Buffer.from(stable(allowProjection))])),identity=authoritySecurityIdentity(authority,allowSha);return{allowed_claim_hits:String(classified.allowed),authority_allow_sha256:allowSha,historical_line_sha256:HISTORICAL_LINE_SHA256,identity,independent_claim_hits:String(classified.independent.length),matches:classified.independent,preserved_failure:{live_states:canonicalStates,policy:CANONICAL_PRESERVED_FAILURE_CLAIMS,preserved_claim_hits:String(classified.preserved)},preserved_failure_entries:String(canonicalStates.length),preserved_failure_evidence_sha256:hash(Buffer.concat([Buffer.from("fix09-preserved-failure-evidence/v1\0"),Buffer.from(stable(canonicalStates))])),ref_document_count:String(refEvidence.length),ref_evidence_sha256:hash(Buffer.concat([Buffer.from("fix09-paper-refs/v2\0"),Buffer.from(stable(refEvidence))])),ref_set_sha256:hash(Buffer.from(stable(refs))),registered_refs:String(refs.length),registered_worktrees:String(roots.length),schema:"fix09-paper/v4",scope:SCOPE,worktree_document_count:String(worktreeEvidence.documents.length),worktree_evidence_sha256:hash(Buffer.concat([Buffer.from("fix09-paper-worktrees/v4\0"),Buffer.from(stable(worktreeEvidence))])),worktree_roots:roots,worktree_set_sha256:hash(Buffer.from(stable(roots)))}}
function validatePaperEnvelope(v,authority){keys(v,["allowed_claim_hits","authority_allow_sha256","historical_line_sha256","identity","independent_claim_hits","matches","preserved_failure","preserved_failure_entries","preserved_failure_evidence_sha256","ref_document_count","ref_evidence_sha256","ref_set_sha256","registered_refs","registered_worktrees","schema","scope","worktree_document_count","worktree_evidence_sha256","worktree_roots","worktree_set_sha256"],"FIX09_PAPER_WORKTREE");if(v.schema!=="fix09-paper/v4"||stable(v.scope)!==stable(SCOPE)||!Array.isArray(v.matches)||v.independent_claim_hits!==String(v.matches.length)||v.preserved_failure_entries!=="2"||!/^([0-9]+)$/.test(v.ref_document_count)||!/^([0-9]+)$/.test(v.worktree_document_count)||!/^([0-9]+)$/.test(v.registered_refs)||!/^([0-9]+)$/.test(v.registered_worktrees)||!Array.isArray(v.worktree_roots)||v.registered_worktrees!==String(v.worktree_roots.length)||![v.authority_allow_sha256,v.historical_line_sha256,v.preserved_failure_evidence_sha256,v.ref_evidence_sha256,v.ref_set_sha256,v.worktree_evidence_sha256,v.worktree_set_sha256].every(x=>/^([0-9a-f]{64})$/.test(x)))throw Error("FIX09_PAPER_WORKTREE");if(v.independent_claim_hits!=="0"||v.matches.length!==0)throw Error("FIX09_PAPER_CLAIM");keys(v.preserved_failure,["live_states","policy","preserved_claim_hits"],"FIX09_PAPER_CLAIM");if(v.preserved_failure.preserved_claim_hits!=="2"||stable(v.preserved_failure.policy)!==stable(CANONICAL_PRESERVED_FAILURE_CLAIMS)||stable(v.preserved_failure.live_states)!==stable(CANONICAL_PRESERVED_FAILURE_CLAIMS.map(({branch_ref,blob,mode,owner,path,tip,tracked_clean})=>({branch_ref,blob,mode,owner,path,tip,tracked_clean}))))throw Error("FIX09_PAPER_CLAIM");const expected=authoritySecurityIdentity(authority,v.authority_allow_sha256);if(stable(v.identity.authority)!==stable(expected.authority))throw Error("FIX09_PAPER_AUTHORITY");if(stable(v.identity.program)!==stable(expected.program))throw Error("FIX09_PROGRAM_HASH");if(stable(v.identity.fix10)!==stable(expected.fix10))throw Error("FIX09_DEPENDENCY_AUTHORITY");if(stable(v.identity.historical)!==stable(expected.historical))throw Error("FIX09_PAPER_CLAIM");if(stable(v.identity.scope)!==stable(expected.scope))throw Error("FIX09_COLLISION_SCOPE");if(stable(v.identity.worktree_request)!==stable(expected.worktree_request))throw Error("FIX09_PAPER_WORKTREE")}
function validateRetryTrace(trace){try{keys(trace,["accepted_pairs","equality_checks","fatal_code","fatal_scan_ordinal","full_scans","pair_starts","resets","terminal","unstable_pairs"],"FIX09_PAPER_TRACE");const {accepted_pairs:a,equality_checks:e,full_scans:f,pair_starts:p,resets:r,unstable_pairs:u}=trace,counts=[a,e,f,p,r,u];if(counts.some(n=>!Number.isSafeInteger(n)||n<0)||p<1||p>PAPER_SCAN_PAIR_LIMIT||f>PAPER_SCAN_PAIR_LIMIT*2)throw Error("FIX09_PAPER_TRACE");let x,y,z;if(trace.terminal==="accepted"){if(trace.fatal_code!==null||trace.fatal_scan_ordinal!==null||a!==1||p!==u+1||r!==u||e<1||e>p)throw Error("FIX09_PAPER_TRACE");x=2*p-f;y=f-p-e;z=e-1}else if(trace.terminal==="exhausted"){if(trace.fatal_code!==null||trace.fatal_scan_ordinal!==null||a!==0||p!==PAPER_SCAN_PAIR_LIMIT||u!==p||r!==u)throw Error("FIX09_PAPER_TRACE");x=2*p-f;y=f-p-e;z=e}else if(trace.terminal==="fatal"){const q=trace.fatal_scan_ordinal;if(![1,2].includes(q)||!PAPER_FATAL_CODES.includes(trace.fatal_code)||a!==0||p!==u+1||r!==u)throw Error("FIX09_PAPER_TRACE");const f0=f-q;x=2*u-f0;y=f0-u-e;z=e}else throw Error("FIX09_PAPER_TRACE");if([x,y,z].some(n=>!Number.isSafeInteger(n)||n<0)||u!==x+y+z)throw Error("FIX09_PAPER_TRACE")}catch{throw Error("FIX09_PAPER_TRACE")}}
function boundedPaperCore(collect,verify=()=>{},policy={equality:true,reset:true}){const trace={accepted_pairs:0,equality_checks:0,fatal_code:null,fatal_scan_ordinal:null,full_scans:0,pair_starts:0,resets:0,terminal:null,unstable_pairs:0};let carried=null;for(let pair=1;pair<=PAPER_SCAN_PAIR_LIMIT;pair++){trace.pair_starts++;let scan=1;try{trace.full_scans++;const first=collect();verify(first);scan=2;trace.full_scans++;const second=collect();verify(second);const left=policy.reset?first:(carried??first);if(policy.equality){trace.equality_checks++;if(stable(left)!==stable(second)){carried=first;unstable()}}trace.accepted_pairs++;trace.terminal="accepted";validateRetryTrace(trace);return{trace,value:second}}catch(e){if(e.message==="FIX09_PAPER_TRACE"){e.retry_trace=trace;throw e}if(e.message!=="FIX09_PAPER_UNSTABLE"){const failure=PAPER_FATAL_CODES.includes(e.message)?e:Error("FIX09_PAPER_WORKTREE");trace.terminal="fatal";trace.fatal_scan_ordinal=scan;trace.fatal_code=failure.message;validateRetryTrace(trace);failure.retry_trace=trace;throw failure}trace.unstable_pairs++;if(policy.reset){trace.resets++;carried=null}else if(carried===null)carried={unstable:true};if(pair===PAPER_SCAN_PAIR_LIMIT){trace.terminal="exhausted";validateRetryTrace(trace);const exhausted=Error("FIX09_PAPER_RETRY_EXHAUSTED");exhausted.retry_trace=trace;throw exhausted}}}throw Error("FIX09_PAPER_RETRY_EXHAUSTED")}
function validateRefTipView(v){keys(v,["all_refs","hit_count","matches","ref_set_sha256","schema","scope"],"FIX09_COLLISION_SCAN");if(v.schema!=="fix09-ref-tip/v1"||stable(v.scope)!==stable(SCOPE)||!Array.isArray(v.matches)||v.hit_count!==String(v.matches.length)||!/^([0-9]+)$/.test(v.all_refs)||!/^([0-9a-f]{64})$/.test(v.ref_set_sha256))throw Error("FIX09_COLLISION_SCAN")}
function validateWorktreeView(v){keys(v,["registered_worktrees","schema","scope","tracked_hit_count","tracked_matches","untracked_hit_count","untracked_matches","worktree_set_sha256"],"FIX09_COLLISION_SCAN");if(v.schema!=="fix09-worktree/v1"||stable(v.scope)!==stable(SCOPE)||!Array.isArray(v.tracked_matches)||!Array.isArray(v.untracked_matches)||v.tracked_hit_count!==String(v.tracked_matches.length)||v.untracked_hit_count!==String(v.untracked_matches.length)||!/^([0-9]+)$/.test(v.registered_worktrees)||!/^([0-9a-f]{64})$/.test(v.worktree_set_sha256))throw Error("FIX09_COLLISION_SCAN")}
function rawCollisionView(name,raw,matches){return{hit_count:String(matches.length),matches,raw_bytes:String(raw.length),raw_sha256:hash(raw),schema:`fix09-${name}/v1`,scope:SCOPE}}
function validateRawCollisionView(v,name){keys(v,["hit_count","matches","raw_bytes","raw_sha256","schema","scope"],"FIX09_COLLISION_SCAN");if(v.schema!==`fix09-${name}/v1`||stable(v.scope)!==stable(SCOPE)||!Array.isArray(v.matches)||v.hit_count!==String(v.matches.length)||!/^([0-9]+)$/.test(v.raw_bytes)||!/^([0-9a-f]{64})$/.test(v.raw_sha256))throw Error("FIX09_COLLISION_SCAN")}
function splitWorktreeView(v,kind){return{hit_count:v[`${kind}_hit_count`],matches:v[`${kind}_matches`],registered_worktrees:v.registered_worktrees,schema:`fix09-worktree-${kind}/v1`,scope:SCOPE,worktree_set_sha256:v.worktree_set_sha256}}
function validateSplitWorktreeView(v,kind){keys(v,["hit_count","matches","registered_worktrees","schema","scope","worktree_set_sha256"],"FIX09_COLLISION_SCAN");if(v.schema!==`fix09-worktree-${kind}/v1`||stable(v.scope)!==stable(SCOPE)||!Array.isArray(v.matches)||v.hit_count!==String(v.matches.length)||!/^([0-9]+)$/.test(v.registered_worktrees)||!/^([0-9a-f]{64})$/.test(v.worktree_set_sha256))throw Error("FIX09_COLLISION_SCAN")}
function completeSecurityScanOnce(authority){if(gitText(CONTROLLER,["rev-parse","refs/heads/codex/fixagent-plan"])!==authority)throw Error("FIX09_AUTHORITY_REF");const refs=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)"])),branches=lines(git(CONTROLLER,["for-each-ref","--format=%(refname)","refs/heads","refs/remotes"]));if(branches.some(x=>!refs.includes(x)))throw Error("FIX09_COLLISION_COUNT");const objectRaw=git(CONTROLLER,["rev-list","--objects","--all"]),historyRaw=git(CONTROLLER,["log","--all","--name-only","--pretty=format:"]),objectMatches=lines(objectRaw).map(x=>x.replace(/^[0-9a-f]{40} /,"")).filter(x=>RX.test(x)),historyMatches=lines(historyRaw).filter(x=>RX.test(x)),tip=refTipEnvelope(),worktree=worktreeEnvelope(),paper=paperCollectOnce(authority);const value={paper,schema:"fix09-complete-security-scan/v1",views:{reachable_history:rawCollisionView("reachable-history",historyRaw,historyMatches),reachable_object:rawCollisionView("reachable-object",objectRaw,objectMatches),ref_tip:tip,worktree_tracked:splitWorktreeView(worktree,"tracked"),worktree_untracked:splitWorktreeView(worktree,"untracked")}};validateCompleteSecurityTranscript(value,authority);return value}
function validateCompleteSecurityTranscript(v,authority){keys(v,["paper","schema","views"],"FIX09_SECURITY_TRANSCRIPT");if(v.schema!=="fix09-complete-security-scan/v1")throw Error("FIX09_SECURITY_TRANSCRIPT");keys(v.views,["reachable_history","reachable_object","ref_tip","worktree_tracked","worktree_untracked"],"FIX09_SECURITY_TRANSCRIPT");validateRawCollisionView(v.views.reachable_history,"reachable-history");validateRawCollisionView(v.views.reachable_object,"reachable-object");validateRefTipView(v.views.ref_tip);validateSplitWorktreeView(v.views.worktree_tracked,"tracked");validateSplitWorktreeView(v.views.worktree_untracked,"untracked");validatePaperEnvelope(v.paper,authority);if(v.paper.registered_refs!==v.views.ref_tip.all_refs||v.paper.ref_set_sha256!==v.views.ref_tip.ref_set_sha256||v.paper.registered_worktrees!==v.views.worktree_tracked.registered_worktrees||v.paper.registered_worktrees!==v.views.worktree_untracked.registered_worktrees||v.paper.worktree_set_sha256!==v.views.worktree_tracked.worktree_set_sha256||v.paper.worktree_set_sha256!==v.views.worktree_untracked.worktree_set_sha256)throw Error("FIX09_PAPER_UNSTABLE");if([v.views.reachable_history.hit_count,v.views.reachable_object.hit_count,v.views.ref_tip.hit_count,v.views.worktree_tracked.hit_count,v.views.worktree_untracked.hit_count].some(x=>x!=="0"))throw Error("FIX09_COLLISION_COUNT")}
function securityProjectionValue(v){return{authority:v.paper.identity.authority,collision_hits:{reachable_history:v.views.reachable_history.hit_count,reachable_object:v.views.reachable_object.hit_count,ref_tip:v.views.ref_tip.hit_count,worktree_tracked:v.views.worktree_tracked.hit_count,worktree_untracked:v.views.worktree_untracked.hit_count},complete_scan_schema:v.schema,domain:"fix09-security-projection/v1",fix10:v.paper.identity.fix10,historical:v.paper.identity.historical,independent_claim_hits:v.paper.independent_claim_hits,matches:v.paper.matches,paper_schema:v.paper.schema,preserved_failure:v.paper.preserved_failure,program:v.paper.identity.program,schema:"fix09-security-projection/v1",scope:v.paper.identity.scope,worktree_request:v.paper.identity.worktree_request}}
function securityProjection(v,authority){validateCompleteSecurityTranscript(v,authority);return securityProjectionValue(v)}
function securityProjectionDigest(v,authority){return hash(Buffer.concat([Buffer.from("fix09-security-projection/v1\0"),Buffer.from(stable(securityProjection(v,authority))) ]))}
function securityTranscriptBytes(v,authority){validateCompleteSecurityTranscript(v,authority);return Buffer.from(`${stable(v)}\n`)}
function securityProjectionFixtureTests(){const zero={reachable_history:"0",reachable_object:"0",ref_tip:"0",worktree_tracked:"0",worktree_untracked:"0"},policy=CANONICAL_PRESERVED_FAILURE_CLAIMS,live=policy.map(({branch_ref,blob,mode,owner,path,tip,tracked_clean})=>({branch_ref,blob,mode,owner,path,tip,tracked_clean})),identity={authority:{allow_sha256:"a".repeat(64),commit:"1".repeat(40),documents_sha256:"b".repeat(64),parent:"2".repeat(40),tree:"3".repeat(40)},fix10:{allow:[{blob:"4".repeat(40),content_sha256:"c".repeat(64),path:"allow"}],docs:[{blob:"5".repeat(40),content_sha256:"d".repeat(64),path:"doc"}],parent:"6".repeat(40),ref:"7".repeat(40),review:{blob:"8".repeat(40),content_sha256:"e".repeat(64),verdict:{authority:"PASS"}},tree:"9".repeat(40)},historical:{line_sha256:HISTORICAL_LINE_SHA256,path:HISTORICAL_PATH},program:{blob:"a".repeat(40),bytes:"123",sha256:"f".repeat(64)},scope:SCOPE,worktree_request:WORKTREE_MARKDOWN_REQUEST},view=(schema)=>({hit_count:"0",matches:[],schema,scope:SCOPE}),make=()=>({paper:{allowed_claim_hits:"9",authority_allow_sha256:identity.authority.allow_sha256,historical_line_sha256:HISTORICAL_LINE_SHA256,identity:structuredClone(identity),independent_claim_hits:"0",matches:[],preserved_failure:{live_states:structuredClone(live),policy:structuredClone(policy),preserved_claim_hits:"2"},preserved_failure_entries:"2",preserved_failure_evidence_sha256:"0".repeat(64),ref_document_count:"10",ref_evidence_sha256:"1".repeat(64),ref_set_sha256:"2".repeat(64),registered_refs:"3",registered_worktrees:"2",schema:"fix09-paper/v4",scope:SCOPE,worktree_document_count:"20",worktree_evidence_sha256:"3".repeat(64),worktree_roots:["/ambient/a","/ambient/b"],worktree_set_sha256:"4".repeat(64)},schema:"fix09-complete-security-scan/v1",views:{reachable_history:{...view("fix09-reachable-history/v1"),raw_bytes:"1",raw_sha256:"5".repeat(64)},reachable_object:{...view("fix09-reachable-object/v1"),raw_bytes:"1",raw_sha256:"6".repeat(64)},ref_tip:{...view("fix09-ref-tip/v1"),all_refs:"3",ref_set_sha256:"2".repeat(64)},worktree_tracked:{...view("fix09-worktree-tracked/v1"),registered_worktrees:"2",worktree_set_sha256:"4".repeat(64)},worktree_untracked:{...view("fix09-worktree-untracked/v1"),registered_worktrees:"2",worktree_set_sha256:"4".repeat(64)}}}),left=make(),expected=securityProjectionValue(left),seal=(v)=>{const projection=securityProjectionValue(v),raw=Buffer.from(`${stable(v)}\n`),projected=Buffer.from(`${stable(projection)}\n`);return{projection,projection_sha256:hash(Buffer.concat([Buffer.from("fix09-security-projection/v1\0"),Buffer.from(stable(projection))])),raw_bytes:String(raw.length),raw_sha256:hash(raw),projected}},right=make();right.paper.allowed_claim_hits="12";right.paper.ref_document_count="11";right.paper.ref_evidence_sha256="7".repeat(64);right.paper.ref_set_sha256="8".repeat(64);right.paper.registered_refs="4";right.paper.registered_worktrees="3";right.paper.worktree_document_count="21";right.paper.worktree_evidence_sha256="9".repeat(64);right.paper.worktree_roots.push("/ambient/c");right.paper.worktree_set_sha256="a".repeat(64);right.views.reachable_history.raw_bytes="2";right.views.reachable_history.raw_sha256="b".repeat(64);right.views.ref_tip.all_refs="4";right.views.ref_tip.ref_set_sha256="8".repeat(64);for(const k of ["worktree_tracked","worktree_untracked"]){right.views[k].registered_worktrees="3";right.views[k].worktree_set_sha256="a".repeat(64)}const a=seal(left),b=seal(right);if(a.raw_sha256===b.raw_sha256||a.raw_bytes===b.raw_bytes||stable(a.projection)!==stable(expected)||stable(b.projection)!==stable(expected)||a.projection_sha256!==b.projection_sha256)throw Error("FIX09_SECURITY_PROJECTION_FIXTURE");const hostile=[],reject=(name,mutate)=>{const v=make();mutate(v);if(stable(securityProjectionValue(v))===stable(expected))throw Error("FIX09_MUTANT_SURVIVED");hostile.push(name)};reject("new-claim",v=>{v.paper.independent_claim_hits="1";v.paper.matches=[{token:"0064"}]});reject("allowed-doc-mutation",v=>v.paper.identity.authority.allow_sha256="0".repeat(64));reject("preserved-policy",v=>v.paper.preserved_failure.policy[0].token="0064.sql");reject("preserved-live-state",v=>v.paper.preserved_failure.live_states[0].tracked_clean="0");reject("preserved-hit-count",v=>v.paper.preserved_failure.preserved_claim_hits="1");reject("dependency",v=>v.paper.identity.fix10.ref="0".repeat(40));for(const k of Object.keys(zero))reject(`collision-${k}`,v=>v.views[k].hit_count="1");reject("authority-commit",v=>v.paper.identity.authority.commit="0".repeat(40));reject("authority-docs",v=>v.paper.identity.authority.documents_sha256="0".repeat(64));reject("program-length",v=>v.paper.identity.program.bytes="1");reject("program-sha",v=>v.paper.identity.program.sha256="0".repeat(64));reject("program-blob",v=>v.paper.identity.program.blob="0".repeat(40));reject("request",v=>v.paper.identity.worktree_request.private_component="include");reject("scope",v=>v.paper.identity.scope={...SCOPE,path_regex:"forged"});reject("paper-schema",v=>v.paper.schema="fix09-paper/v3");reject("complete-schema",v=>v.schema="fix09-complete-security-scan/v0");reject("historical-pin",v=>v.paper.identity.historical.line_sha256="0".repeat(64));if(hostile.length!==21)throw Error("FIX09_SECURITY_PROJECTION_FIXTURE");return{hostile:String(hostile.length),positive:"1",projection_equal:"1",raw_different:"1"}}
function readSecurityTranscript(file,authority){const st=fs.lstatSync(file),bytes=fs.readFileSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400||fs.realpathSync(file)!==file)throw Error("FIX09_SECURITY_TRANSCRIPT");const value=canonicalJson(bytes,"FIX09_SECURITY_TRANSCRIPT");validateCompleteSecurityTranscript(value,authority);return{bytes,value}}
function recordShadowPaper(context,trace){const contexts=new Set(["base","candidate-positive","derive","immutable","result-positive","reviewer"]);if(!contexts.has(context))throw Error("FIX09_PAPER_CONTEXT");if(!IS_SHADOW)return;fs.appendFileSync(`${INVOKED_DIR}/security-scan-counts.jsonl`,`${stable({context,full_scans:String(trace.full_scans),pairs:String(trace.pair_starts)})}\n`,{encoding:"utf8",flag:"a",mode:0o600})}
function boundedCompleteCollect(authority,context){const result=boundedPaperCore(()=>completeSecurityScanOnce(authority),v=>validateCompleteSecurityTranscript(v,authority));recordShadowPaper(context,result.trace);return result}
function retryTraceFixtureTests(){const accepted={accepted_pairs:1,equality_checks:1,fatal_code:null,fatal_scan_ordinal:null,full_scans:2,pair_starts:1,resets:0,terminal:"accepted",unstable_pairs:0},exhausted={accepted_pairs:0,equality_checks:3,fatal_code:null,fatal_scan_ordinal:null,full_scans:6,pair_starts:3,resets:3,terminal:"exhausted",unstable_pairs:3},fatalFirst={accepted_pairs:0,equality_checks:0,fatal_code:"FIX09_PAPER_WORKTREE",fatal_scan_ordinal:1,full_scans:1,pair_starts:1,resets:0,terminal:"fatal",unstable_pairs:0},fatalAfterRetry={accepted_pairs:0,equality_checks:1,fatal_code:"FIX09_PAPER_CLAIM",fatal_scan_ordinal:2,full_scans:4,pair_starts:2,resets:1,terminal:"fatal",unstable_pairs:1};for(const v of [accepted,exhausted,fatalFirst,fatalAfterRetry])validateRetryTrace(v);const mutants=[];for(const mutate of [v=>v.full_scans=Number.MAX_SAFE_INTEGER+1,v=>v.resets=-1,v=>v.extra=0,v=>delete v.equality_checks,v=>v.pair_starts=3,v=>v.full_scans=6,v=>v.terminal="exhausted",v=>v.fatal_scan_ordinal=1,v=>v.unstable_pairs=1]){const v=structuredClone(accepted);mutate(v);mutants.push(v)}for(const mutate of [v=>v.accepted_pairs=1,v=>v.resets=2,v=>v.equality_checks=4]){const v=structuredClone(exhausted);mutate(v);mutants.push(v)}for(const mutate of [v=>v.fatal_scan_ordinal=null,v=>v.fatal_code="FIX09_PAPER_UNSTABLE",v=>v.full_scans=2]){const v=structuredClone(fatalFirst);mutate(v);mutants.push(v)}for(const v of mutants)expectCode(()=>validateRetryTrace(v),"FIX09_PAPER_TRACE");return{accepted:"1",exhausted:"1",fatal:"2",hostile:String(mutants.length)}}
function fatalCodeFixtureTests(){const fabricated={accepted_pairs:0,equality_checks:0,fatal_code:"FIX09_FABRICATED_FATAL",fatal_scan_ordinal:1,full_scans:1,pair_starts:1,resets:0,terminal:"fatal",unstable_pairs:0};expectCode(()=>validateRetryTrace(fabricated),"FIX09_PAPER_TRACE");return"1"}
function paperRetryFixtureTestsV16(){paperFixtureTests();retryTraceFixtureTests();fatalCodeFixtureTests();const value=(id)=>({id,independent_claim_hits:"0",matches:[]}),sequence=(values)=>{let i=0;return()=>{const value0=values[i++];if(value0 instanceof Error)throw value0;return value0}},stableRun=withFixtureIo(()=>boundedPaperCore(sequence([value("A"),value("A")]))),transient=withFixtureIo(()=>boundedPaperCore(sequence([value("A"),value("B"),value("C"),value("C")])));let exhausted=null;try{withFixtureIo(()=>boundedPaperCore(sequence([value("A"),value("B"),value("A"),value("B"),value("A"),value("B")]))) }catch(e){exhausted=e}let fatalFirst=null;try{withFixtureIo(()=>boundedPaperCore(sequence([Error("FIX09_PAPER_WORKTREE")]))) }catch(e){fatalFirst=e}let fatalSecond=null;try{withFixtureIo(()=>boundedPaperCore(sequence([value("A"),Error("FIX09_PAPER_WORKTREE")]))) }catch(e){fatalSecond=e}let fatalAfterRetry=null;try{withFixtureIo(()=>boundedPaperCore(sequence([value("A"),value("B"),Error("FIX09_PAPER_CLAIM")]))) }catch(e){fatalAfterRetry=e}let claim=null;try{withFixtureIo(()=>boundedPaperCore(sequence([{id:"claim",independent_claim_hits:"1",matches:[{}]}]),v=>{if(v.independent_claim_hits!=="0")throw Error("FIX09_PAPER_CLAIM")}))}catch(e){claim=e}for(const failure of [exhausted,fatalFirst,fatalSecond,fatalAfterRetry,claim])validateRetryTrace(failure.retry_trace);if(exhausted?.message!=="FIX09_PAPER_RETRY_EXHAUSTED"||exhausted.retry_trace.full_scans!==6||fatalFirst?.message!=="FIX09_PAPER_WORKTREE"||fatalFirst.retry_trace.full_scans!==1||fatalSecond?.message!=="FIX09_PAPER_WORKTREE"||fatalSecond.retry_trace.full_scans!==2||fatalAfterRetry?.message!=="FIX09_PAPER_CLAIM"||fatalAfterRetry.retry_trace.full_scans!==3||claim?.message!=="FIX09_PAPER_CLAIM"||claim.retry_trace.full_scans!==1||stableRun.trace.full_scans!==2||transient.trace.full_scans!==4||stable(transient.value)!==stable(value("C")))throw Error("FIX09_PAPER_RETRY_FIXTURE");return{exhausted_scans:"6",fatal_after_retry_scans:"3",fatal_first_scans:"1",fatal_second_scans:"2",mismatch_accepted:"0",stable_scans:"2",swaps_killed:"4",transient_scans:"4"}}
function validationNeedsFreshness(stage,mutant){if(stage==="derive")return true;if(stage==="candidate"||stage==="result")return mutant==="NONE";throw Error("FIX09_VALIDATION_STAGE")}
function validateValidationTrace(trace){keys(trace,["candidate_hostile_pairs","candidate_positive_pairs","derive_pairs","result_hostile_pairs","result_positive_pairs"],"FIX09_MUTANT_HOSTILE_SCAN_SEPARATION");same(trace,{candidate_hostile_pairs:"0",candidate_positive_pairs:"1",derive_pairs:"1",result_hostile_pairs:"0",result_positive_pairs:"1"},"FIX09_MUTANT_HOSTILE_SCAN_SEPARATION")}
function validationScanFixtureTests(policy=validationNeedsFreshness){const trace={candidate_hostile_pairs:"0",candidate_positive_pairs:"0",derive_pairs:"0",result_hostile_pairs:"0",result_positive_pairs:"0"},inc=(key)=>trace[key]=String(Number(trace[key])+1);if(policy("derive","NONE"))inc("derive_pairs");for(const mutant of candidateMutants)if(policy("candidate",mutant))inc(mutant==="NONE"?"candidate_positive_pairs":"candidate_hostile_pairs");for(const mutant of ["NONE","REVIEW_HASH","REVIEW_VERDICT"])if(policy("result",mutant))inc(mutant==="NONE"?"result_positive_pairs":"result_hostile_pairs");securityProjectionFixtureTests();validateValidationTrace(trace);return trace}
function admissionLivenessMutants(){const killed=[];let resetError=null;try{withFixtureIo(()=>boundedPaperCore((()=>{const values=[{id:"A"},{id:"B"},{id:"C"},{id:"C"},{id:"C"},{id:"C"}];let i=0;return()=>values[i++]})(),()=>{},{equality:true,reset:false}))}catch(e){resetError=e}if(resetError?.message!=="FIX09_PAPER_TRACE")throw Error("FIX09_MUTANT_SURVIVED");killed.push(["OMIT_RETRY_RESET","FIX09_PAPER_TRACE"]);expectCode(()=>withFixtureIo(()=>boundedPaperCore((()=>{const values=[{id:"A"},{id:"B"}];let i=0;return()=>values[i++]})(),()=>{},{equality:false,reset:true})),"FIX09_PAPER_TRACE");killed.push(["OMIT_DOUBLE_SUCCESS_EQUALITY","FIX09_PAPER_TRACE"]);expectCode(()=>validationScanFixtureTests(()=>true),"FIX09_MUTANT_HOSTILE_SCAN_SEPARATION");killed.push(["OMIT_HOSTILE_SCAN_SEPARATION","FIX09_MUTANT_HOSTILE_SCAN_SEPARATION"]);return killed}
function freshCollisionGate(authority,context,outFile,base){if(typeof outFile!=="string"||!outFile.length)throw Error("FIX09_SECURITY_TRANSCRIPT");const result=boundedCompleteCollect(authority,context),bytes=securityTranscriptBytes(result.value,authority),projection=securityProjection(result.value,authority);atomicWrite(outFile,bytes);const baseProjection=securityProjection(base,authority);if(stable(projection)!==stable(baseProjection))throw Error("FIX09_SECURITY_PROJECTION");return securityProjectionDigest(result.value,authority)}
function paperScan(){const authority=scannerRoot();paperFixtureTests();const result=boundedCompleteCollect(authority,"base");process.stdout.write(securityTranscriptBytes(result.value,authority))}
function immutablePaperScan(context="immutable"){const authority=gitText(CONTROLLER,["rev-parse","HEAD"]);selfCheck(authority);paperFixtureTests();const result=boundedCompleteCollect(authority,context);process.stdout.write(securityTranscriptBytes(result.value,authority))}
function projectSecurityTranscript(file){const authority=gitText(CONTROLLER,["rev-parse","HEAD"]),raw=readSecurityTranscript(file,authority),projection=securityProjection(raw.value,authority),bytes=Buffer.from(`${stable(projection)}\n`);process.stdout.write(bytes)}
function compareSecurityTranscripts(leftFile,rightFile){const authority=gitText(CONTROLLER,["rev-parse","HEAD"]),left=readSecurityTranscript(leftFile,authority),right=readSecurityTranscript(rightFile,authority),a=securityProjection(left.value,authority),b=securityProjection(right.value,authority);if(stable(a)!==stable(b))throw Error("FIX09_SECURITY_PROJECTION");const projectionBytes=Buffer.from(`${stable(a)}\n`);process.stdout.write(`${stable({left:{bytes:String(left.bytes.length),sha256:hash(left.bytes)},projection:{bytes:String(projectionBytes.length),security_digest:securityProjectionDigest(left.value,authority),sha256:hash(projectionBytes)},right:{bytes:String(right.bytes.length),sha256:hash(right.bytes)},schema:"fix09-security-projection-comparison/v1"})}\n`)}
function validateCandidate(candidateFile,manifestFile,scanFile,mutant){const authority=authorityFromManifest(manifestFile),initial=replayManifest(manifestFile,baseLedger(authority),mutant);let raw=fs.readFileSync(candidateFile);const sealed=parseReceiptBytes(raw,CANDIDATE_FIELDS),fresh=validationNeedsFreshness("candidate",mutant)?"candidate-positive":null,expected=derive(initial,fresh,mutant==="NONE"?null:sealed.migration_collision_evidence_sha256,mutant==="NONE"?scanFile:null);if(mutant==="RECEIPT_WIRE")raw=Buffer.concat([raw,Buffer.from("extra=forged\n")]);let actual=parseReceiptBytes(raw,CANDIDATE_FIELDS);actual=mutateValue(actual,mutant);compareCandidate(actual,expected)}
function compareResult(actual,expected){same(actual.admission_review_report_sha256,expected.admission_review_report_sha256,"FIX09_REVIEW_HASH");same([actual.spec_verdict,actual.code_quality_verdict,actual.p0_count,actual.p1_count,actual.p2_count,actual.p3_count,actual.result],[expected.spec_verdict,expected.code_quality_verdict,expected.p0_count,expected.p1_count,expected.p2_count,expected.p3_count,expected.result],"FIX09_REVIEW_VERDICT");same(actual,expected,"FIX09_REVIEW_VERDICT")}
function validateResult(candidateFile,baseManifest,resultFile,validationManifest,reviewFile,scanFile,mutant){const authority=authorityFromManifest(baseManifest),candidate=parseReceiptBytes(fs.readFileSync(candidateFile),CANDIDATE_FIELDS);selfCheck(authority);replayManifest(baseManifest,baseLedger(authority));replayManifest(validationManifest,candidateLedger(baseManifest));const fresh=validationNeedsFreshness("result",mutant)?"result-positive":null,expectedCandidate=derive(replayManifest(baseManifest,baseLedger(authority)),fresh,mutant==="NONE"?null:candidate.migration_collision_evidence_sha256,mutant==="NONE"?scanFile:null);same(candidate,expectedCandidate,"FIX09_RESULT_CANDIDATE");const result=parseReceiptBytes(fs.readFileSync(resultFile),RESULT_FIELDS),report=fs.readFileSync(reviewFile);if(mutant==="REVIEW_HASH")result.admission_review_report_sha256="0".repeat(64);if(mutant==="REVIEW_VERDICT")result.spec_verdict="REWORK";const reportLines=lines(report),expected={schema:"fix09-c35-admission-result/v1",candidate_receipt_path:"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-candidate.receipt",candidate_receipt_sha256:hash(fs.readFileSync(candidateFile)),admission_review_report_path:"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-v16-review.md",admission_review_report_sha256:hash(report),receipt_validation_manifest_sha256:hash(fs.readFileSync(validationManifest)),reviewer:"Sol",reviewed_authority_commit:authority,reviewed_c35_baseline:expectedCandidate.c35_baseline,reviewed_c35_tree:expectedCandidate.c35_tree,spec_verdict:"SPEC PASS",code_quality_verdict:"CODE QUALITY PASS",p0_count:"0",p1_count:"0",p2_count:"0",p3_count:"0",result:"PASS"};for(const line of ["REVIEWER: Sol","SPEC VERDICT: SPEC PASS","CODE QUALITY VERDICT: CODE QUALITY PASS","UNRESOLVED: P0=0 P1=0 P2=0 P3=0","ADMISSION RESULT: PASS"])if(reportLines.filter(x=>x===line).length!==1)throw Error("FIX09_REVIEW_VERDICT");compareResult(result,expected)}
function attemptPreflightCore(state){keys(state,["future_absent","preserved_v10","preserved_v11","preserved_v12","v10_tip","v11_tip","v12_ref"],"FIX09_ATTEMPT_PREFLIGHT");if(!Array.isArray(state.future_absent)||state.future_absent.length!==12||state.future_absent.some(x=>x!==true)||!Array.isArray(state.preserved_v10)||state.preserved_v10.length!==7||state.preserved_v10.some(x=>x!==true)||!Array.isArray(state.preserved_v11)||state.preserved_v11.length!==7||state.preserved_v11.some(x=>x!==true)||!Array.isArray(state.preserved_v12)||state.preserved_v12.length!==9||state.preserved_v12.some(x=>x!==true)||state.v10_tip!==FAILED_V10_TIP||state.v11_tip!==FAILED_V11_TIP||state.v12_ref!==REJECTED_V12_REF)throw Error("FIX09_ATTEMPT_PREFLIGHT")}
function exactFile(file,mode,sha){try{const st=fs.lstatSync(file);return st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&(st.mode&0o777)===mode&&fs.realpathSync(file)===file&&hash(fs.readFileSync(file))===sha}catch{return false}}
function exactDir(dir,mode){try{const st=fs.lstatSync(dir);return st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o777)===mode&&fs.realpathSync(dir)===dir}catch{return false}}
function branchProbe(branch,cwd=CONTROLLER){const r=spawnSync("/usr/bin/git",["show-ref","--verify","--quiet",`refs/heads/${branch}`],{cwd,encoding:null,env:{PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});if(r.error||r.signal||![0,1].includes(r.status))throw Error("FIX09_ATTEMPT_PREFLIGHT");return r.status===0}
function preservedAttempt(program,programSha,manifest,manifestSha,report,reportSha,evidenceRoot,emptyRoot,branchName,tip,worktreeRoot){const published=exactFile(manifest,0o400,manifestSha),rootManifest=`${evidenceRoot}/manifest.json`,evidence=exactDir(evidenceRoot,0o500)&&exactFile(rootManifest,0o400,manifestSha)&&fs.readdirSync(evidenceRoot).length===118&&published&&fs.readFileSync(rootManifest).equals(fs.readFileSync(manifest)),empty=exactDir(emptyRoot,0o700)&&fs.readdirSync(emptyRoot).length===0,branch=branchProbe(branchName,REAL_CONTROLLER)&&gitText(REAL_CONTROLLER,["rev-parse",`refs/heads/${branchName}`])===tip,engine=`${worktreeRoot}/dialectical-engine`,worktree=exactDir(worktreeRoot,0o755)&&gitText(engine,["rev-parse","HEAD"])===tip&&gitText(engine,["symbolic-ref","--short","HEAD"])===branchName&&git(engine,["status","--porcelain=v1","--untracked-files=all","--",".",":(exclude).hermes/**",":(exclude)**/.hermes/**"]).length===0&&parseWorktrees(git(REAL_CONTROLLER,["worktree","list","--porcelain","-z"])).includes(worktreeRoot);return[exactFile(program,0o500,programSha),published,evidence,exactFile(report,0o644,reportSha),empty,branch,worktree]}
function preservedRejectedV12(){const header=lines(git(REAL_CONTROLLER,["show","-s","--format=%H%n%P%n%T%n%s",REJECTED_V12_REF])),scope=lines(git(REAL_CONTROLLER,["diff-tree","--no-commit-id","--name-only","-r",REJECTED_V12_REF])),docChecks=Object.entries(REJECTED_V12_DOCS).map(([p,pin])=>{const body=git(REAL_CONTROLLER,["show",`${REJECTED_V12_REF}:${p}`]);return hash(body)===pin.sha256&&gitBlob(body)===pin.blob}),review=exactFile(REJECTED_V12_REVIEW,0o644,REJECTED_V12_REVIEW_SHA256)&&gitBlob(fs.readFileSync(REJECTED_V12_REVIEW))===REJECTED_V12_REVIEW_BLOB,report=exactFile(REJECTED_V12_REPORT,0o644,REJECTED_V12_REPORT_SHA256)&&gitBlob(fs.readFileSync(REJECTED_V12_REPORT))===REJECTED_V12_REPORT_BLOB,reviewLines=strictUtf8(fs.readFileSync(REJECTED_V12_REVIEW),"FIX09_ATTEMPT_PREFLIGHT").split("\n").map(x=>x.trimEnd()),verdict=["AUTHORITY FIDELITY: FAIL","SPEC QUALITY: FAIL","PLAN QUALITY: FAIL","UNRESOLVED: P0=0 P1=5 P2=1 P3=0","v12 real Task0 authorized NO","C3.5 code authorized NO pending Task0 receipt review"].every(line=>reviewLines.filter(x=>x===line).length===1);return[header[0]===REJECTED_V12_REF,header[1]===REJECTED_V12_PARENT,header[2]===REJECTED_V12_TREE,header[3]==="docs(obs): make FIX-09 admission executable",stable(scope)===stable(["dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md","dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v12.md","dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v12.md"]),docChecks.every(Boolean),review,report,verdict]}
function attemptPreflight(){excludedPathZeroIoFixture();selfCheck(gitText(CONTROLLER,["rev-parse","HEAD"]));verifyPreviousAuthority();verifyFix10Dependency();const future=[...FUTURE_V16_FILES.map(p=>!fs.existsSync(p)),!fs.existsSync(FUTURE_V16_WORKTREE),!branchProbe(FUTURE_V16_BRANCH,REAL_CONTROLLER)],v10=preservedAttempt(FAILED_V10_PROGRAM,FAILED_V10_PROGRAM_SHA256,FAILED_V10_MANIFEST,FAILED_V10_MANIFEST_SHA256,FAILED_V10_REPORT,FAILED_V10_REPORT_SHA256,FAILED_V10_EVIDENCE,FAILED_V10_EMPTY_DIAGNOSTIC,FAILED_V10_BRANCH,FAILED_V10_TIP,FAILED_V10_WORKTREE),v11=preservedAttempt(FAILED_V11_PROGRAM,FAILED_V11_PROGRAM_SHA256,FAILED_V11_MANIFEST,FAILED_V11_MANIFEST_SHA256,FAILED_V11_REPORT,FAILED_V11_REPORT_SHA256,FAILED_V11_EVIDENCE,FAILED_V11_EMPTY_VALIDATION,FAILED_V11_BRANCH,FAILED_V11_TIP,FAILED_V11_WORKTREE),v12=preservedRejectedV12(),state={future_absent:future,preserved_v10:v10,preserved_v11:v11,preserved_v12:v12,v10_tip:FAILED_V10_TIP,v11_tip:FAILED_V11_TIP,v12_ref:REJECTED_V12_REF};attemptPreflightCore(state);process.stdout.write(`FIX09_ATTEMPT_PREFLIGHT_PASS future_absent=12 preserved_v10=7 preserved_v11=7 preserved_v12=9 v10_tip=${FAILED_V10_TIP} v11_tip=${FAILED_V11_TIP} v12_ref=${REJECTED_V12_REF}\n`)}
function attemptPreflightFixtureTests(){const good={future_absent:Array(12).fill(true),preserved_v10:Array(7).fill(true),preserved_v11:Array(7).fill(true),preserved_v12:Array(9).fill(true),v10_tip:FAILED_V10_TIP,v11_tip:FAILED_V11_TIP,v12_ref:REJECTED_V12_REF};attemptPreflightCore(good);for(let i=0;i<12;i++){const v=structuredClone(good);v.future_absent[i]=false;expectCode(()=>attemptPreflightCore(v),"FIX09_ATTEMPT_PREFLIGHT")}for(const [key,count] of [["preserved_v10",7],["preserved_v11",7],["preserved_v12",9]])for(let i=0;i<count;i++){const v=structuredClone(good);v[key][i]=false;expectCode(()=>attemptPreflightCore(v),"FIX09_ATTEMPT_PREFLIGHT")}for(const key of ["v10_tip","v11_tip","v12_ref"]){const v=structuredClone(good);v[key]="0".repeat(40);expectCode(()=>attemptPreflightCore(v),"FIX09_ATTEMPT_PREFLIGHT")}}
function atomicWrite(file,bytes){if(fs.existsSync(file))throw Error("FIX09_OUTPUT_EXISTS");const dir=path.dirname(file),tmp=`${file}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(tmp,file);fs.chmodSync(file,0o400);const d=fs.openSync(dir,fs.constants.O_RDONLY);fs.fsyncSync(d);fs.closeSync(d)}
function publishManifest(source,target){selfCheck(gitText(CONTROLLER,["rev-parse","HEAD"]));const st=fs.lstatSync(source),bytes=fs.readFileSync(source),v=JSON.parse(bytes);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400||stable(v)!==bytes.toString("utf8")||v.schema!=="fix09-task0-evidence-manifest/v2")throw Error("FIX09_MANIFEST_MODE");atomicWrite(target,bytes)}
const [mode,...args]=process.argv.slice(2);
try{
  if(mode==="scanner-fixtures"){excludedPathZeroIoFixture();sourceMapFixtureTests();resolutionMapFixtureTests();writerFixtureTests();grantFixtureTests();paperRetryFixtureTestsV16();validationScanFixtureTests();securityProjectionFixtureTests();admissionLivenessMutants();c35ProjectionFixtureTests();process.stdout.write("FIX09_SCANNER_FIXTURES_PASS writer=8 paper=35 resolution=8 grant=10 late_metadata=7 trace_hostile=16 stable_mutants=3 liveness_mutants=3 security_projection_hostile=21 c35_hostile=13\n")}
  else if(mode==="resolution-map-fixtures"){resolutionMapFixtureTests();process.stdout.write("FIX09_RESOLUTION_MAP_FIXTURES_PASS positive=2 hostile=6\n")}
  else if(mode==="grant-fixtures"){grantFixtureTests();process.stdout.write("FIX09_GRANT_FIXTURES_PASS positive=1 hostile=9\n")}
  else if(mode==="attempt-preflight-fixtures"){attemptPreflightFixtureTests();process.stdout.write("FIX09_ATTEMPT_PREFLIGHT_FIXTURES_PASS future=12 preserved_v10=7 preserved_v11=7 preserved_v12=9 hostile=38\n")}
  else if(mode==="attempt-preflight"){attemptPreflight()}
  else if(mode==="preserved-failure-fixtures"){const value=preservedFailureFixtureTests();process.stdout.write(`FIX09_PRESERVED_FAILURE_FIXTURES_PASS positive=${value.positive} hostile=${value.hostile}\n`)}
  else if(mode==="source-map-fixtures"){sourceMapFixtureTests();process.stdout.write("FIX09_SOURCE_MAP_FIXTURES_PASS operands=17 normalization=17 hostile=5\n")}
  else if(mode==="excluded-path-zero-io"){const value=excludedPathZeroIoFixture();process.stdout.write(`FIX09_ABSTRACT_NO_TOUCH_PASS git=${value.git} list=${value.list} stat=${value.stat} open=${value.open} read=${value.read} mutant=1 cause=FIX09_PAPER_WORKTREE\n`)}
  else if(mode==="late-metadata-fixtures"){const value=lateMetadataFixtureTests();process.stdout.write(`FIX09_LATE_METADATA_FIXTURES_PASS fatal=${value.fatal} retryable=${value.retryable}\n`)}
  else if(mode==="retry-trace-fixtures"){const value=retryTraceFixtureTests(),fabricated=fatalCodeFixtureTests();process.stdout.write(`FIX09_RETRY_TRACE_FIXTURES_PASS accepted=${value.accepted} exhausted=${value.exhausted} fatal=${value.fatal} hostile=${value.hostile} fabricated_fatal=${fabricated}\n`)}
  else if(mode==="stable-read-fixtures"){paperFixtureTests();process.stdout.write("FIX09_STABLE_READ_FIXTURES_PASS paper=35 mutants=3\n")}
  else if(mode==="stable-read-mutants"){for(const [name,cause] of paperFixtureTests())process.stdout.write(`FIX09_MUTANT_KILLED name=${name} cause=${cause}\n`)}
  else if(mode==="paper-retry-fixtures"){const value=paperRetryFixtureTestsV16();process.stdout.write(`FIX09_PAPER_RETRY_FIXTURES_PASS transient_scans=${value.transient_scans} stable_scans=${value.stable_scans} exhausted_scans=${value.exhausted_scans} fatal_first_scans=${value.fatal_first_scans} fatal_second_scans=${value.fatal_second_scans} fatal_after_retry_scans=${value.fatal_after_retry_scans} mismatch_accepted=${value.mismatch_accepted} swaps_killed=${value.swaps_killed}\n`)}
  else if(mode==="validation-scan-fixtures"){const value=validationScanFixtureTests();process.stdout.write(`FIX09_VALIDATION_SCAN_FIXTURES_PASS derive_pairs=${value.derive_pairs} positive_pairs=${value.candidate_positive_pairs} hostile_pairs=${value.candidate_hostile_pairs} result_positive_pairs=${value.result_positive_pairs} result_hostile_pairs=${value.result_hostile_pairs}\n`)}
  else if(mode==="security-projection-fixtures"){const value=securityProjectionFixtureTests();process.stdout.write(`FIX09_SECURITY_PROJECTION_FIXTURES_PASS positive=${value.positive} hostile=${value.hostile} raw_different=${value.raw_different} projection_equal=${value.projection_equal}\n`)}
  else if(mode==="admission-liveness-mutants"){for(const [name,cause] of admissionLivenessMutants())process.stdout.write(`FIX09_MUTANT_KILLED name=${name} cause=${cause}\n`)}
  else if(mode==="c35-projection-fixtures"){const value=c35ProjectionFixtureTests();process.stdout.write(`FIX09_C35_PROJECTION_FIXTURES_PASS positive=${value.positive} hostile=${value.hostile}\n`)}
  else if(mode==="immutable-writer-scan")immutableWriterScan();
  else if(mode==="immutable-paper-scan")immutablePaperScan();
  else if(mode==="reviewer-paper-scan")immutablePaperScan("reviewer");
  else if(mode==="security-projection")projectSecurityTranscript(args[0]);
  else if(mode==="compare-security-projections")compareSecurityTranscripts(args[0],args[1]);
  else if(mode==="writer-scan")writerScan();
  else if(mode==="grant-scan")grantScan();
  else if(mode==="ref-tip-scan")refTipScan();
  else if(mode==="worktree-scan")worktreeScan();
  else if(mode==="paper-scan")paperScan();
  else if(mode==="publish-manifest")publishManifest(args[0],args[1]);
  else if(mode==="derive-candidate"){const manifest=args[0],out=args[1],scan=args[2],authority=authorityFromManifest(manifest);selfCheck(authority);const r=replayManifest(manifest,baseLedger(authority)),v=derive(r,"derive",null,scan);atomicWrite(out,receiptBytes(v,CANDIDATE_FIELDS))}
  else if(mode==="validate-candidate"){const mutant=(args[3]||"").replace("--mutant=","");if(!candidateMutants.includes(mutant))throw Error("FIX09_MUTANT_UNKNOWN");if(mutant==="NONE"){validateCandidate(args[0],args[1],args[2],mutant);process.stdout.write("FIX09_CANDIDATE_PASS\n")}else{let cause=null;try{validateCandidate(args[0],args[1],args[2],mutant)}catch(e){cause=e.message}if(cause!==MUTANT_CAUSE[mutant])throw Error(cause===null?"FIX09_MUTANT_SURVIVED":"FIX09_MUTANT_WRONG_CAUSE");process.stderr.write(`FIX09_CANDIDATE_FAIL code=FIX09_${mutant}\n`);process.exit(1)}}
  else if(mode==="validate-result"){const mutant=(args[6]||"").replace("--mutant=","");if(!["NONE","REVIEW_HASH","REVIEW_VERDICT"].includes(mutant))throw Error("FIX09_MUTANT_UNKNOWN");if(mutant==="NONE"){validateResult(args[0],args[1],args[2],args[3],args[4],args[5],mutant);process.stdout.write("FIX09_RESULT_PASS\n")}else{let cause=null;try{validateResult(args[0],args[1],args[2],args[3],args[4],args[5],mutant)}catch(e){cause=e.message}if(cause!==`FIX09_${mutant}`)throw Error(cause===null?"FIX09_MUTANT_SURVIVED":"FIX09_MUTANT_WRONG_CAUSE");process.stderr.write(`FIX09_RESULT_FAIL code=FIX09_${mutant}\n`);process.exit(1)}}
  else throw Error("FIX09_MODE")
}catch(e){process.stderr.write(`FIX09_FATAL code=${/^FIX09_[A-Z0-9_]+$/.test(e.message)?e.message:"FIX09_UNEXPECTED"}\n`);process.exit(2)}
// FIX09_TASK0_V16_PROGRAM_END
```

Program source is the 140,366 UTF-8 bytes inside the v16 JavaScript fence plus one final LF. Its SHA-256 is `0fcc2445644fa6d390fb76574f02e8f86ada084f6fecdfdccd329a8b622a9c48` and Git blob is `f8bb23e80e3ef7e5d8d6f3ab0d4cec3d453ca7be`. The program derives its own exact bytes from the committed authority blob and refuses a mismatch; the printed hashes are independent quick checks. The disposable runner is 20,193 UTF-8 bytes including its final LF and has SHA-256 `fa3bc86487e4846f1461c1ce5f5dc14597c3b4c26d7c9988ac98a3220ad27492`.

### Disposable exact-program shadow runner

This runner is authority only when materialized byte-for-byte from this fence at a fresh path matching `/private/tmp/fix09-v16-shadow-runner.<8-alphanumeric>.mjs`, mode `0500`. It refuses an uncommitted authority, extracts the exact v16 program and 39-entry ledger from that commit, creates a fresh `git clone --no-hardlinks --no-checkout` diagnostic common repository under `/private/tmp/fix09-v16-shadow.<token>/controller-root`, verifies and checks out the exact authority, and runs the real-repository failed-attempt preservation preflight before diagnostic Git composition. It creates two clone-local, no-hardlink preserved-state witness worktrees at the exact failed tips/branches and exact stale blob, uses them only to exercise the complete tuple predicate, and normalizes their physical shadow owners back to the two canonical policy owners only after every other field matches; the emitted policy/live-state projection is therefore byte-identical to production authority while ambient raw worktree roots remain visibly shadow-local. It also uses the clone-local `codex/fix09-v16-shadow-<token>` branch and lexically later `<root>/zz-admission-root` worktree, captures/seals/replays all 39 base facts, derives the 32-field non-authoritative candidate, captures all 20 candidate-validator outcomes, and proves the only live complete security scans were the stable `base`, `derive`, and `candidate-positive` pairs: two invocations each, six total. It retains the three raw transcripts until it has independently compared base↔derive and base↔candidate projections and included each transcript byte length/SHA in the success summary. It then removes only its three worktrees, three branches, clone/evidence root, and runner. Exact success is one `FIX09_SHADOW_PASS ` line containing canonical `fix09-v16-shadow-proof/v1` JSON; stderr is empty and rc is 0.

```js
// FIX09_SHADOW_V16_RUNNER_BEGIN
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";

const REAL_CONTROLLER="/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine";
const PLAN="docs/missions/observability-agents/slices/FIX-09/PLAN-v16.md";
const COMMON="/Users/vladmihaimiron/Documents/DebateAIRO/.git";
const ENV_OBJECT={PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"};
const ENV_ARRAY=["PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin","LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"];
const CANDIDATE_MUTANTS=["NONE","AUTHORITY_TREE","AUTHORITY_SUBJECT","AUTHORITY_SCOPE","MERGE_PARENT","MERGE_ORDER","MERGE_CONFLICT","MERGE_RESOLUTION","SOURCE_MAP","C1_MAP","WRITER_MAP","COLLISION_COUNT","COLLISION_SCOPE","MANIFEST_STDOUT","MANIFEST_RC","MANIFEST_HASH","BRANCH","COMMON_DIR","WORKTREE_REGISTRY","RECEIPT_WIRE"];
const GRANT_STATEMENTS=["CREATE SCHEMA IF NOT EXISTS obs;","GRANT USAGE ON SCHEMA obs TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;","export const obs = pgSchema(\"obs\");","export const obsOccurrence = obs.table(\"occurrence\", {","export const obsAgentAction = obs.table(\"agent_action\", {"];
const GRANT_FILES=[{"blob":"ace8fa889f24a3d23b79cbaa78878a2238d07b76","path":"migrations/0034_obs_foundation.sql","sha256":"ffea9b5f8daa4428d7f93603de6823570323ff2463ad9cee8a3912207f592be8"},{"blob":"bcd2fac36c2460eb8b3d681a7c3ee914a8ce065e","path":"packages/db/src/obs-schema.ts","sha256":"f3482c061ff478cdbdf0836bd2fefbdf86b075f73c9f84ff05443951190eb5f6"}];
const stable=(v)=>v===null||typeof v==="boolean"||typeof v==="string"?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(",")}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
const hash=(b)=>crypto.createHash("sha256").update(b).digest("hex");
const same=(a,b,c)=>{if(stable(a)!==stable(b))throw Error(c)};
const lines=(b)=>{const s=b.toString("utf8");if(!Buffer.from(s).equals(b))throw Error("FIX09_SHADOW_UTF8");return s.split("\n").filter(Boolean)};
const runnerPath=fs.realpathSync(process.argv[1]);
if(!/^\/private\/tmp\/fix09-v16-shadow-runner\.[A-Za-z0-9]{8}\.mjs$/.test(runnerPath))throw Error("FIX09_SHADOW_RUNNER_PATH");
const authority=spawnSync("/usr/bin/git",["rev-parse","HEAD"],{cwd:REAL_CONTROLLER,env:ENV_OBJECT,encoding:"utf8",shell:false});
if(authority.status!==0||authority.signal!==null||!/^[0-9a-f]{40}\n$/.test(authority.stdout)||authority.stderr!=="")throw Error("FIX09_SHADOW_AUTHORITY");
const planRun=spawnSync("/usr/bin/git",["show",`${authority.stdout.trim()}:./${PLAN}`],{cwd:REAL_CONTROLLER,env:ENV_OBJECT,encoding:null,maxBuffer:100*1024*1024,shell:false});
if(planRun.status!==0||planRun.signal!==null||planRun.stderr.length)throw Error("FIX09_SHADOW_AUTHORITY");
const plan=planRun.stdout.toString("utf8"),runnerMatch=plan.match(/```js\n(\/\/ FIX09_SHADOW_V16_RUNNER_BEGIN[\s\S]*?\/\/ FIX09_SHADOW_V16_RUNNER_END)\n```/),programMatch=plan.match(/```js\n(\/\/ FIX09_TASK0_V16_PROGRAM_BEGIN[\s\S]*?\/\/ FIX09_TASK0_V16_PROGRAM_END)\n```/),ledgerMatch=plan.match(/### Base ledger[\s\S]*?```json\n([\s\S]*?)\n```/);
if(!runnerMatch||!programMatch||!ledgerMatch||!fs.readFileSync(runnerPath).equals(Buffer.from(`${runnerMatch[1]}\n`)))throw Error("FIX09_SHADOW_AUTHORITY");
if(["trap.md","sentinel.md","hermesRoot","hermes-root"].some(token=>programMatch[1].includes(token)))throw Error("FIX09_SHADOW_FORBIDDEN_FIXTURE");

let root=null,branch=null,worktree=null,controllerRoot=null,controller=null,common=null,preservedWorktrees=[],preservedBranches=["codex/fix09-c35-admission","codex/fix09-c35-admission-v11"];
function gitCleanup(args){if(controllerRoot===null||!fs.existsSync(`${controllerRoot}/.git`))return{status:1,signal:null,stdout:Buffer.alloc(0)};return spawnSync("/usr/bin/git",args,{cwd:controllerRoot,env:ENV_OBJECT,encoding:null,shell:false})}
function cleanup(){
  if(root===null)return;
  if(!/^\/private\/tmp\/fix09-v16-shadow\.[A-Za-z0-9]{8}$/.test(root)||branch!==`codex/fix09-v16-shadow-${path.basename(root).slice(-8)}`||worktree!==`${root}/zz-admission-root`||controllerRoot!==`${root}/controller-root`||(controller!==null&&controller!==`${controllerRoot}/dialectical-engine`)||preservedWorktrees.some((p,i)=>p!==`${root}/preserved-v${i===0?"10":"11"}`))throw Error("FIX09_SHADOW_CLEANUP_SCOPE");
  const registered=gitCleanup(["worktree","list","--porcelain"]).stdout.toString("utf8").includes(`worktree ${worktree}\n`);
  if(registered){const removed=gitCleanup(["worktree","remove","--force",worktree]);if(removed.status!==0||removed.signal!==null)throw Error("FIX09_SHADOW_CLEANUP")}
  for(const p of preservedWorktrees){const listed=gitCleanup(["worktree","list","--porcelain"]).stdout.toString("utf8").includes(`worktree ${p}\n`);if(listed){const removed=gitCleanup(["worktree","remove","--force",p]);if(removed.status!==0||removed.signal!==null)throw Error("FIX09_SHADOW_CLEANUP")}}
  const present=gitCleanup(["show-ref","--verify","--quiet",`refs/heads/${branch}`]);
  if(present.status===0){const deleted=gitCleanup(["branch","-D",branch]);if(deleted.status!==0||deleted.signal!==null)throw Error("FIX09_SHADOW_CLEANUP")}else if(present.status!==1||present.signal!==null)throw Error("FIX09_SHADOW_CLEANUP");
  for(const name of preservedBranches){const present0=gitCleanup(["show-ref","--verify","--quiet",`refs/heads/${name}`]);if(present0.status===0){const deleted=gitCleanup(["branch","-D",name]);if(deleted.status!==0||deleted.signal!==null)throw Error("FIX09_SHADOW_CLEANUP")}else if(present0.status!==1||present0.signal!==null)throw Error("FIX09_SHADOW_CLEANUP")}
  const branchGone=gitCleanup(["show-ref","--verify","--quiet",`refs/heads/${branch}`]),registry=gitCleanup(["worktree","list","--porcelain"]);
  if(fs.existsSync(`${controllerRoot}/.git`)&&(branchGone.status!==1||registry.status!==0||[worktree,...preservedWorktrees].some(p=>registry.stdout.toString("utf8").includes(p))))throw Error("FIX09_SHADOW_CLEANUP");
  for(const d of [`${root}/base`,`${root}/validation`])try{fs.chmodSync(d,0o700)}catch{}
  if(fs.existsSync(root))fs.rmSync(root,{recursive:true});
  if(fs.existsSync(root))throw Error("FIX09_SHADOW_CLEANUP");
}
function run(argv,cwd){const r=spawnSync(argv[0],argv.slice(1),{cwd,env:ENV_OBJECT,encoding:null,maxBuffer:100*1024*1024,shell:false});if(r.error)throw Error("FIX09_SHADOW_SPAWN");return r}
function parser(rule,body,ctx){
  if(rule.kind==="any")return;
  if(rule.kind==="empty"){if(body.length)throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="exact_utf8"){if(body.toString("utf8")!==rule.value)throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="nonempty_utf8"){if(!lines(body).length)throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="sha40_lf"){if(!/^[0-9a-f]{40}\n$/.test(body.toString("utf8")))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="sha40_lines"){const a=lines(body);if(a.length!==Number(rule.count)||a.some(x=>!/^[0-9a-f]{40}$/.test(x)))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="head_topology"){const a=lines(body);if(a.length!==5||a.slice(0,4).some(x=>!/^[0-9a-f]{40}$/.test(x))||a[4]!==branch)throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="common_worktree"){same(lines(body),[common,worktree],"FIX09_SHADOW_PARSER");return}
  if(rule.kind==="source_map_17"){const a=lines(body);if(a.length!==17||a.some(x=>!/^100644 blob [0-9a-f]{40}\tdialectical-engine\/.+$/.test(x)))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="c1_sha256_3"){const a=lines(body);if(a.length!==3||a.some(x=>!/^([0-9a-f]{64})  (tests\/unit\/fixtures\/fix09-interface-contract\.ts|tools\/obs-listener\/src\/daemon\/(dispatch-arm|tracer-hook)\.ts)$/.test(x)))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="grant_json"){const s=body.toString("utf8");if(!s.endsWith("\n"))throw Error("FIX09_SHADOW_PARSER");const v=JSON.parse(s.slice(0,-1));if(stable(v)!==s.slice(0,-1)||v.schema!=="fix09-grant-scan/v1")throw Error("FIX09_SHADOW_PARSER");same(v.files,GRANT_FILES,"FIX09_SHADOW_PARSER");same(v.statements,GRANT_STATEMENTS,"FIX09_SHADOW_PARSER");return}
  if(rule.kind==="writer_json"){const v=JSON.parse(body.toString("utf8"));if(v.schema!=="fix09-writer-scan/v2"||v.row_writer_count!=="4"||v.detail_insert_count!=="2")throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="refs"||rule.kind==="branch_refs"){const a=lines(body);if(!a.length||new Set(a).size!==a.length||stable([...a].sort())!==stable(a))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="worktree_registry"){if(!body.includes(Buffer.from(`worktree ${worktree}\0`)))throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="object_paths"||rule.kind==="history_paths"){if(!body.length)throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind==="security_scan_json"){const s=body.toString("utf8"),v=JSON.parse(s);if(!s.endsWith("\n")||stable(v)!==s.slice(0,-1)||v.schema!=="fix09-complete-security-scan/v1"||v.paper?.independent_claim_hits!=="0")throw Error("FIX09_SHADOW_PARSER");return}
  if(rule.kind.endsWith("_json")){const s=body.toString("utf8"),v=JSON.parse(s);if(!s.endsWith("\n")||v.schema!==`fix09-${rule.kind.replace("_json","").replaceAll("_","-")}/v1`)throw Error("FIX09_SHADOW_PARSER");return}
  throw Error(`FIX09_SHADOW_PARSER_${ctx}`);
}
function capture(evidence,entry){
  const prefix=`${entry.ordinal.padStart(3,"0")}-${entry.id}`,stdoutPath=path.join(evidence,`${prefix}.stdout`),stderrPath=path.join(evidence,`${prefix}.stderr`),factPath=path.join(evidence,`${prefix}.command.json`),stdoutFd=fs.openSync(stdoutPath,"wx",0o600),stderrFd=fs.openSync(stderrPath,"wx",0o600);
  const r=spawnSync(entry.argv[0],entry.argv.slice(1),{cwd:entry.cwd,env:ENV_OBJECT,shell:false,stdio:["ignore",stdoutFd,stderrFd]});
  if(r.error)fs.writeSync(stderrFd,Buffer.from(`FIX09_CAPTURE_SPAWN_ERROR ${r.error.code||"UNKNOWN"}\n`));
  fs.fsyncSync(stdoutFd);fs.fsyncSync(stderrFd);fs.closeSync(stdoutFd);fs.closeSync(stderrFd);fs.chmodSync(stdoutPath,0o400);fs.chmodSync(stderrPath,0o400);
  const stdout=fs.readFileSync(stdoutPath),stderr=fs.readFileSync(stderrPath),fact={schema:"fix09-task0-command/v2",id:entry.id,ordinal:entry.ordinal,cwd:fs.realpathSync(entry.cwd),argv:entry.argv,environment:ENV_ARRAY,exit_code:r.status===null?null:String(r.status),signal:r.signal===null?null:String(r.signal),stdout:{path:path.basename(stdoutPath),bytes:String(stdout.length),sha256:hash(stdout),mode:"0400"},stderr:{path:path.basename(stderrPath),bytes:String(stderr.length),sha256:hash(stderr),mode:"0400"}};
  const tmp=`${factPath}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,Buffer.from(stable(fact)));fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(tmp,factPath);fs.chmodSync(factPath,0o400);
  if(fact.exit_code!==entry.expected_exit_code||fact.signal!==entry.expected_signal)throw Error(`FIX09_SHADOW_STATUS_${entry.id}`);parser(entry.stdout_parser,stdout,entry.id);parser(entry.stderr_parser,stderr,entry.id);
}
function finalize(evidence){
  const names=fs.readdirSync(evidence).sort(),commandNames=names.filter(n=>n.endsWith(".command.json")),commands=commandNames.map((name,index)=>{const b=fs.readFileSync(path.join(evidence,name)),v=JSON.parse(b);if(stable(v)!==b.toString("utf8")||v.ordinal!==String(index+1)||name!==`${v.ordinal.padStart(3,"0")}-${v.id}.command.json`)throw Error("FIX09_SHADOW_FACT");for(const stream of [v.stdout,v.stderr]){const p=path.join(evidence,stream.path),body=fs.readFileSync(p);if((fs.statSync(p).mode&0o777)!==0o400||String(body.length)!==stream.bytes||hash(body)!==stream.sha256)throw Error("FIX09_SHADOW_FACT")}return v});
  const expected=commands.flatMap(v=>[`${v.ordinal.padStart(3,"0")}-${v.id}.command.json`,v.stdout.path,v.stderr.path]).sort();same(names,expected,"FIX09_SHADOW_FACT");
  const manifest={schema:"fix09-task0-evidence-manifest/v2",evidence_root:fs.realpathSync(evidence),command_count:String(commands.length),commands},out=path.join(evidence,"manifest.json"),tmp=`${out}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,Buffer.from(stable(manifest)));fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(tmp,out);fs.chmodSync(out,0o400);fs.chmodSync(evidence,0o500);return out;
}

let summary=null;
try{
  for(let i=0;i<256;i++){const token=crypto.randomBytes(4).toString("hex"),candidate=`/private/tmp/fix09-v16-shadow.${token}`;try{fs.mkdirSync(candidate,{mode:0o700});root=fs.realpathSync(candidate);break}catch(e){if(e.code!=="EEXIST")throw e}}
  if(root===null)throw Error("FIX09_SHADOW_ROOT");
  const token=path.basename(root).slice(-8);branch=`codex/fix09-v16-shadow-${token}`;controllerRoot=`${root}/controller-root`;controller=`${controllerRoot}/dialectical-engine`;common=`${controllerRoot}/.git`;worktree=`${root}/zz-admission-root`;
  const clone=run(["/usr/bin/git","clone","--no-hardlinks","--no-checkout","/Users/vladmihaimiron/Documents/DebateAIRO",controllerRoot],"/private/tmp");if(clone.status!==0||clone.signal!==null)throw Error("FIX09_SHADOW_CLONE");
  const remote=run(["/usr/bin/git","rev-parse","refs/remotes/origin/codex/fixagent-plan"],controllerRoot);if(remote.status!==0||remote.signal!==null||remote.stdout.toString("utf8")!==authority.stdout||remote.stderr.length)throw Error("FIX09_SHADOW_AUTHORITY");
  const checkout=run(["/usr/bin/git","checkout","-b","codex/fixagent-plan","refs/remotes/origin/codex/fixagent-plan"],controllerRoot);if(checkout.status!==0||checkout.signal!==null||!fs.existsSync(controller))throw Error("FIX09_SHADOW_CHECKOUT");
  const branchCollision=gitCleanup(["show-ref","--verify","--quiet",`refs/heads/${branch}`]);if(fs.existsSync(worktree)||branchCollision.status!==1||branchCollision.signal!==null)throw Error("FIX09_SHADOW_COLLISION");
  const program=`${root}/fix09-task0-v16-shadow.mjs`,candidate=`${root}/candidate.receipt`,deriveScan=`${root}/derive-security-scan.json`,candidateScan=`${root}/candidate-security-scan.json`,resultScan=`${root}/result-security-scan.json`,base=`${root}/base`,validation=`${root}/validation`;
  fs.writeFileSync(program,Buffer.from(`${programMatch[1]}\n`),{flag:"wx",mode:0o500});fs.chmodSync(program,0o500);
  const zeroIo=run(["/Users/vladmihaimiron/.local/bin/node",program,"excluded-path-zero-io"],controller);if(zeroIo.status!==0||zeroIo.signal!==null||zeroIo.stdout.toString("utf8")!=="FIX09_ABSTRACT_NO_TOUCH_PASS git=0 list=0 stat=0 open=0 read=0 mutant=1 cause=FIX09_PAPER_WORKTREE\n"||zeroIo.stderr.length)throw Error("FIX09_SHADOW_FORBIDDEN_FIXTURE");
  const preflight=run(["/Users/vladmihaimiron/.local/bin/node",program,"attempt-preflight"],controller),preflightExpected="FIX09_ATTEMPT_PREFLIGHT_PASS future_absent=12 preserved_v10=7 preserved_v11=7 preserved_v12=9 v10_tip=c20e38f1695ecbf72ab2624c9f72dfe4e634d07b v11_tip=61313a1d89cd354743f8bc94329f716fe4f2bdf5 v12_ref=dd7b84959aaa95dfaf40ccf4f7b2396c25a32848\n";
  if(preflight.status!==0||preflight.signal!==null||preflight.stdout.toString("utf8")!==preflightExpected||preflight.stderr.length)throw Error("FIX09_SHADOW_PREFLIGHT");
  preservedWorktrees=[`${root}/preserved-v10`,`${root}/preserved-v11`];for(const [index,tip] of ["c20e38f1695ecbf72ab2624c9f72dfe4e634d07b","61313a1d89cd354743f8bc94329f716fe4f2bdf5"].entries()){const added=run(["/usr/bin/git","worktree","add","-b",preservedBranches[index],preservedWorktrees[index],tip],controllerRoot);if(added.status!==0||added.signal!==null)throw Error("FIX09_SHADOW_PRESERVED")}
  const aliases={CONTROLLER:controller,ADMISSION:`${worktree}/dialectical-engine`,ADMISSION_BRANCH:branch,ADMISSION_ROOT:worktree,PROGRAM:program,CANDIDATE:candidate,RESULT:`${root}/result.receipt`,REVIEW:`${root}/review.md`,BASE_MANIFEST:`${base}/manifest.json`,CANDIDATE_VALIDATION_MANIFEST:`${validation}/manifest.json`,RESULT_VALIDATION_MANIFEST:`${root}/result-validation/manifest.json`,DERIVE_SECURITY_SCAN:deriveScan,CANDIDATE_SECURITY_SCAN:candidateScan,RESULT_SECURITY_SCAN:resultScan},replace=(v)=>typeof v==="string"&&Object.hasOwn(aliases,v)?aliases[v]:Array.isArray(v)?v.map(replace):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v,ledger=replace(JSON.parse(ledgerMatch[1]));
  if(ledger.length!==39)throw Error("FIX09_SHADOW_LEDGER");fs.mkdirSync(base,{mode:0o700});for(const entry of ledger)capture(base,entry);const baseManifest=finalize(base);
  const derive=run(["/Users/vladmihaimiron/.local/bin/node",program,"derive-candidate",baseManifest,candidate,deriveScan],controller);if(derive.status!==0||derive.signal!==null||derive.stdout.length||derive.stderr.length)throw Error("FIX09_SHADOW_DERIVE");
  const candidateBytes=fs.readFileSync(candidate);if(candidateBytes.toString("utf8").split("\n").filter(Boolean).length!==32||(fs.statSync(candidate).mode&0o777)!==0o400)throw Error("FIX09_SHADOW_CANDIDATE");
  fs.mkdirSync(validation,{mode:0o700});for(let i=0;i<CANDIDATE_MUTANTS.length;i++){const mutant=CANDIDATE_MUTANTS[i],none=i===0;capture(validation,{id:none?"t0-040":`h0-${String(i).padStart(3,"0")}`,ordinal:String(i+1),cwd:controller,argv:["/Users/vladmihaimiron/.local/bin/node",program,"validate-candidate",candidate,baseManifest,candidateScan,`--mutant=${mutant}`],expected_exit_code:none?"0":"1",expected_signal:null,stdout_parser:{kind:"exact_utf8",value:none?"FIX09_CANDIDATE_PASS\n":""},stderr_parser:{kind:"exact_utf8",value:none?"":`FIX09_CANDIDATE_FAIL code=FIX09_${mutant}\n`}})}
  const validationManifest=finalize(validation),baseBytes=fs.readFileSync(baseManifest),validationBytes=fs.readFileSync(validationManifest),facts=JSON.parse(baseBytes).commands,countPath=`${root}/security-scan-counts.jsonl`,countBytes=fs.readFileSync(countPath),countText=countBytes.toString("utf8");
  for(const id of ["t0-014","t0-022","t0-031"]){const f=facts.find(x=>x.id===id);if(!f||f.exit_code!=="0"||f.signal!==null)throw Error(`FIX09_SHADOW_RED_${id}`)}
  if(!countText.endsWith("\n")||!Buffer.from(countText).equals(countBytes))throw Error("FIX09_SHADOW_SCAN_COUNT");const counts=countText.split("\n").filter(Boolean).map(line=>{const v=JSON.parse(line);if(stable(v)!==line)throw Error("FIX09_SHADOW_SCAN_COUNT");return v}),expectedCounts=[{context:"base",full_scans:"2",pairs:"1"},{context:"derive",full_scans:"2",pairs:"1"},{context:"candidate-positive",full_scans:"2",pairs:"1"}];same(counts,expectedCounts,"FIX09_SHADOW_SCAN_COUNT");
  const baseFact=facts.find(x=>x.id==="t0-039"),baseScan=path.join(base,baseFact.stdout.path),rawScans=[baseScan,deriveScan,candidateScan];for(const p of rawScans){const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o777)!==0o400)throw Error("FIX09_SHADOW_SECURITY_SCAN")}for(const p of [deriveScan,candidateScan]){const compared=run(["/Users/vladmihaimiron/.local/bin/node",program,"compare-security-projections",baseScan,p],controller);if(compared.status!==0||compared.signal!==null||compared.stderr.length)throw Error("FIX09_SHADOW_SECURITY_PROJECTION")}
  summary={base_facts:"39",base_manifest_sha256:hash(baseBytes),candidate_fields:"32",candidate_sha256:hash(candidateBytes),cleanup:"3",excluded_path_calls:{git:"0",list:"0",open:"0",read:"0",stat:"0"},security_contexts:["base","derive","candidate-positive"],security_full_scans:"6",security_raw_scans:rawScans.map(p=>{const b=fs.readFileSync(p);return{bytes:String(b.length),sha256:hash(b)}}),security_scan_pairs:"3",schema:"fix09-v16-shadow-proof/v1",t0_014:"0",t0_022:"0",t0_031:"0",validation_manifest_sha256:hash(validationBytes),validation_outcomes:"20"};
  cleanup();root=null;
  try{fs.rmSync(runnerPath)}catch{throw Error("FIX09_SHADOW_RUNNER_CLEANUP")}
  process.stdout.write(`FIX09_SHADOW_PASS ${stable(summary)}\n`);
}catch(e){try{cleanup()}catch{}try{fs.rmSync(runnerPath)}catch{}process.stderr.write(`FIX09_SHADOW_FATAL code=${/^FIX09_[A-Z0-9_]+$/.test(e.message)?e.message:"FIX09_SHADOW_UNEXPECTED"}\n`);process.exit(2)}
// FIX09_SHADOW_V16_RUNNER_END
```

### Scanner pins and safe fixture oracle

The immutable-source verification argv is exactly `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,immutable-writer-scan]`; it reads the two fixed reviewed source heads and must emit these exact LF-terminated bytes:

```json
{"detail_insert_count":"2","detail_matches":[{"byte_offset":"5770","line":"229","path":"packages/obs-capture/src/runtime/sink.ts","symbol":"writeOccurrences","table":"occurrence_detail"},{"byte_offset":"7119","line":"260","path":"packages/obs-capture/src/runtime/sink.ts","symbol":"ingestSpooledOccurrence","table":"occurrence_detail"}],"row_match_digest":"5160c7da8f7c95d382e4c0733ee11c17087c056fa75d5300a3637891ffd0135b","row_matches":[{"byte_offset":"5466","line":"223","path":"packages/obs-capture/src/runtime/sink.ts","symbol":"writeOccurrences","table":"occurrence"},{"byte_offset":"6561","line":"248","path":"packages/obs-capture/src/runtime/sink.ts","symbol":"ingestSpooledOccurrence","table":"occurrence"},{"byte_offset":"373","line":"15","path":"tools/obs-listener/src/daemon/poison.ts","symbol":"appendSkipReceipt","table":"agent_action"},{"byte_offset":"1024","line":"32","path":"tools/obs-listener/src/daemon/poison.ts","symbol":"appendPoisonReceipt","table":"agent_action"}],"row_writer_count":"4","schema":"fix09-writer-scan/v2","source_blobs":[{"blob":"b8bf01beb38d10e80eceec92af298d0480ae6a37","path":"packages/obs-capture/src/runtime/sink.ts","sha256":"af6328dd2d4d2214430a2e1d43004145f1c83749c157296cb8fbfd3a8c771736"},{"blob":"79714373cf602d4358cabc7acb664a26452f2f04","path":"tools/obs-listener/src/daemon/poison.ts","sha256":"e806654d6176bec8781be86ea8e8966c299f81a5416b2f45f65764fc4272e181"}],"writer_map":["occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences","occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence","agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt","agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt","future_agent_action|FIX-10|ops|obsctl"]}
```

Its full raw stdout is 1,769 bytes and SHA-256 `98b11ca61daa9437b97b6a3fdc76192ca7dab39653994fb0bfc62c2ea355ffd7`. The embedded safe oracle uses exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,scanner-fixtures]` and exact stdout `FIX09_SCANNER_FIXTURES_PASS writer=8 paper=35 resolution=8 grant=10 late_metadata=7 trace_hostile=16 stable_mutants=3 liveness_mutants=3 security_projection_hostile=21 c35_hostile=13\n`, empty stderr, and rc 0. The exact preserved-failure argv/output is `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,preserved-failure-fixtures]` / `FIX09_PRESERVED_FAILURE_FIXTURES_PASS positive=2 hostile=17\n`; it reads only the pinned immutable Git blob and exercises the real claim classifier without enumerating or reading a worktree. The exact source-map argv/output is `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,source-map-fixtures]` / `FIX09_SOURCE_MAP_FIXTURES_PASS operands=17 normalization=17 hostile=5\n`; it proves the 17 exact top-anchored ledger operands, including `packages/obs-capture/package.json` and `tools/obs-listener/src/daemon/cursor.ts`, prefix normalization, and the five closed hostile controls inherited from SPEC-v14. Dependency authority is the exact FIX-10 v9 commit/current SPEC-v9/PLAN-v9/DECISIONS/review; its four-entry allow remains separate from the exact two-row preserved-failure policy. No FIX-10 wildcard or generic historical edge exists. The exact stable-read-only argv/output is `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,stable-read-fixtures]` / `FIX09_STABLE_READ_FIXTURES_PASS paper=35 mutants=3\n`. The exact `stable-read-mutants` argv emits, in order, the three LF-terminated v11 omission-kill lines and nothing else. T0-030 and t0-039 rerun their respective fixture sets before scanning immutable/live sources.

The exact v16 additions are:

```text
excluded-path-zero-io      -> FIX09_ABSTRACT_NO_TOUCH_PASS git=0 list=0 stat=0 open=0 read=0 mutant=1 cause=FIX09_PAPER_WORKTREE
late-metadata-fixtures     -> FIX09_LATE_METADATA_FIXTURES_PASS fatal=6 retryable=1
retry-trace-fixtures       -> FIX09_RETRY_TRACE_FIXTURES_PASS accepted=1 exhausted=1 fatal=2 hostile=15 fabricated_fatal=1
paper-retry-fixtures       -> FIX09_PAPER_RETRY_FIXTURES_PASS transient_scans=4 stable_scans=2 exhausted_scans=6 fatal_first_scans=1 fatal_second_scans=2 fatal_after_retry_scans=3 mismatch_accepted=0 swaps_killed=4
validation-scan-fixtures   -> FIX09_VALIDATION_SCAN_FIXTURES_PASS derive_pairs=1 positive_pairs=1 hostile_pairs=0 result_positive_pairs=1 result_hostile_pairs=0
security-projection-fixtures -> FIX09_SECURITY_PROJECTION_FIXTURES_PASS positive=1 hostile=21 raw_different=1 projection_equal=1
c35-projection-fixtures    -> FIX09_C35_PROJECTION_FIXTURES_PASS positive=1 hostile=13
attempt-preflight-fixtures -> FIX09_ATTEMPT_PREFLIGHT_FIXTURES_PASS future=12 preserved_v10=7 preserved_v11=7 preserved_v12=9 hostile=38
```

Each line has exactly one final LF and no other stdout; stderr is empty and rc is 0. `admission-liveness-mutants` emits exactly `OMIT_RETRY_RESET -> FIX09_PAPER_TRACE`, `OMIT_DOUBLE_SUCCESS_EQUALITY -> FIX09_PAPER_TRACE`, and `OMIT_HOSTILE_SCAN_SEPARATION -> FIX09_MUTANT_HOSTILE_SCAN_SEPARATION` in order. The exact resolution-map argv/output remains `resolution-map-fixtures` / `FIX09_RESOLUTION_MAP_FIXTURES_PASS positive=2 hostile=6\n`; the exact grant argv/output remains `grant-fixtures` / `FIX09_GRANT_FIXTURES_PASS positive=1 hostile=9\n`.

T0-039 is canonical `fix09-complete-security-scan/v1` JSON plus LF. Its paper evidence arrays are not expanded: the ref projection is ordered `{blob,content_sha256,path,ref}`; the worktree projection is `{documents,enumerations}`, with ordered `{content_sha256,kind,metadata:{ctime_ns,dev,ino,mode,mtime_ns,nlink,size},path,root}` documents and per-root `{root,tracked_bytes,tracked_sha256,untracked_bytes,untracked_sha256}` enumeration hashes. Tags are `fix09-paper-worktrees/v4\0`, `fix09-paper-refs/v2\0`, `fix09-paper-authority/v4\0`, and `fix09-preserved-failure-evidence/v1\0`. The complete transcript additionally seals all five collision-view counts/matches and their ambient source digests. Candidate `migration_collision_evidence_sha256` is the independently derived `fix09-security-projection/v1\0` digest, not the raw transcript hash; the manifest and standalone mode-0400 files separately retain every raw byte.


---

## Appendix D — truthful expanded adjacent names

V6's 94 direct names remain in their printed order. Insert these exact reporter-expanded names after `FIX-09 C1 policy bundle > does not run a live fileURLToPath callback after policy initialization` and before `FIX-09 C1 policy bundle > does not dispatch the exported refusal error superclass before custodian authentication`:

```json
[
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptor callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyNames callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptors callback after policy initialization",
"FIX-09 C1 policy bundle > does not run a live 'Reflect' 'deleteProperty' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'Number' 'isSafeInteger' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'Array' 'isArray' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not run a live 'JSON' 'stringify' callback before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited 'Error.prototype' name setter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited 'RepinRefusedError.prototype' name setter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'get' descriptor getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'set' descriptor getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'name' VM-option getter before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'displayErrors' VM-option getter before custodian authentication"
]
```

The exact 107-name canonical array is 11,281 bytes and SHA-256 `5b061d338cbf49f10a1b2569b7e3fce3f1724c642bfd0922ebb7b878daaba09c`. Outer order is the five v6 paths in their printed order; within each file, reporter `assertionResults` order is authority. Reporter completion order and declaration-only regex order are not authority.

### C3.5 reporter projection

The following closed object is executable authority. `reporter_names` is the exact outer file-order/inner assertion-order array; its compact JSON bytes alone have the count, byte length, and digest recorded beside it.

<!-- FIX09_C35_PROJECTION_BEGIN -->
```json
{
   "paths" : [
      "tests/unit/fix09-capture-gate.test.ts",
      "tests/unit/fix09-chain-canonical.test.ts",
      "tests/unit/fix09-chain-keys.test.ts",
      "tests/integration/fix09-chain-migration.test.ts",
      "tests/integration/fix09-chain-occurrence.test.ts",
      "tests/integration/fix09-chain-action.test.ts",
      "tests/integration/fix09-chain-lifecycle.test.ts",
      "tests/architecture/fix09-chain-grants.test.ts",
      "tests/architecture/fix09-chain-writers.test.ts",
      "tests/architecture/fix09-chain-privacy.test.ts",
      "tests/architecture/fix09-fix10-chain-contract.test.ts"
   ],
   "reporter_bytes" : "12676",
   "reporter_count" : "118",
   "reporter_names" : [
      "FIX-09 evidence capture > captures immutable child evidence and rejects every closed hostile control",
      "FIX-09 chain canonical protocol > proves every public row, genesis, signature, link, JSON boundary, and mutation vector",
      "FIX-09 chain keys > proves Ed25519 identity, activation witness authority, path custody, rotation, recovery, and private-material absence",
      "FIX-09 chain migration on real PostgreSQL > proves the exact forward-only schema, legacy microseconds, probes, constraints, and rollback",
      "FIX-09 chained occurrences on real PostgreSQL > proves exact detail presence, replay, locks, ordering, signing, concurrency, and atomic rollback",
      "FIX-09 chained actions on real PostgreSQL > proves exact replay, locks, ordering, signing, FIX-10 compatibility, and atomic rollback",
      "FIX-09 chain lifecycle on real PostgreSQL > proves activation, planned rotation, V-signed recovery, forward rollback, and fail-closed loss",
      "FIX-09 chain grants > proves exact roles, routine ownership, fixed search paths, bounded returns, ACLs, and denials",
      "FIX-09 chain writer architecture > proves all current and future writers use only the shared gateways",
      "FIX-09 chain privacy > proves public-only verification, descriptor trust, safe journals, and absence of private or user material",
      "FIX-09 FIX-10 dependency > proves ops obsctl deterministic replay through the action gateway and DB-free markers",
      "FIX-09 C1 policy bundle > loads the complete fail-closed phase-one policy",
      "FIX-09 C1 policy bundle > reproduces the bundle hash without importing the loader",
      "FIX-09 C1 policy bundle > matches the independently recorded taxonomy and registry pins",
      "FIX-09 C1 policy bundle > never dispatches inherited Hash update or digest during authority decisions",
      "FIX-09 C1 policy bundle > refuses every hostile Array.prototype.push shape before Zod can execute it",
      "FIX-09 C1 policy bundle > contains every hostile Array.prototype.push shape before loader initialization",
      "FIX-09 C1 policy bundle > validates through the declared Zod schema under the supported tsx runtime",
      "FIX-09 C1 policy bundle > resolves private Zod validation independently of process cwd",
      "FIX-09 C1 policy bundle > does not consult the live CommonJS resolver for private Zod",
      "FIX-09 C1 policy bundle > does not run a live fileURLToPath callback after policy initialization",
      "FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptor callback after policy initialization",
      "FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyNames callback after policy initialization",
      "FIX-09 C1 policy bundle > does not run a live Object.getOwnPropertyDescriptors callback after policy initialization",
      "FIX-09 C1 policy bundle > does not run a live 'Reflect' 'deleteProperty' callback before custodian authentication",
      "FIX-09 C1 policy bundle > does not run a live 'Number' 'isSafeInteger' callback before custodian authentication",
      "FIX-09 C1 policy bundle > does not run a live 'Array' 'isArray' callback before custodian authentication",
      "FIX-09 C1 policy bundle > does not run a live 'JSON' 'stringify' callback before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited 'Error.prototype' name setter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited 'RepinRefusedError.prototype' name setter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'get' descriptor getter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'set' descriptor getter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'name' VM-option getter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch an inherited Object.prototype.'displayErrors' VM-option getter before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch the exported refusal error superclass before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch the recoverable schema error superclass before custodian authentication",
      "FIX-09 C1 policy bundle > does not dispatch the load error superclass outside its typed boundary",
      "FIX-09 C1 policy bundle > pins only derived error constructors and preserves lawful error subclass behavior",
      "FIX-09 C1 policy bundle > statically rejects unfrozen nested and expression derived constructors",
      "FIX-09 C1 policy bundle > retains no uncaptured ambient authority member or constructor",
      "FIX-09 C1 policy bundle > does not trust live Atomics results as declared-schema authority",
      "FIX-09 C1 policy bundle > does not construct a live Worker for declared-schema authority",
      "FIX-09 C1 policy bundle > keeps main-realm regex and push callbacks outside Zod validation",
      "FIX-09 C1 policy bundle > isolates self-restoring Zod callbacks from hashing and token authority",
      "FIX-09 C1 policy bundle > keeps authority on captured crypto calls after builtin export synchronization",
      "FIX-09 C1 policy bundle > keeps proxy rejection on the captured builtin after export synchronization",
      "FIX-09 C1 policy bundle > keeps custodian proxy checks on the captured builtin",
      "FIX-09 C1 policy bundle > keeps bundle reads on the captured builtin after export synchronization",
      "FIX-09 C1 policy bundle > does not overreach to an unreachable Object.prototype.push neighbour",
      "FIX-09 C1 policy bundle > hashes semantic JSON independently of object key order and whitespace",
      "FIX-09 C1 policy bundle > ignores inherited toJSON getters and returned functions on both prototypes",
      "FIX-09 C1 policy bundle > never invokes an inherited toJSON data function",
      "FIX-09 C1 policy bundle > contains throwing inherited toJSON getters across hash, load, and repin",
      "FIX-09 C1 policy bundle > keeps inherited non-function toJSON data as a lawful neighbor",
      "FIX-09 C1 policy bundle > encodes JSON primitives byte-identically without object serialization",
      "FIX-09 C1 policy bundle > never dispatches inherited array helpers or iterators across C1 authority",
      "FIX-09 C1 policy bundle > denies every enumerated floor sample without swallowing a neighbouring product path",
      "FIX-09 C1 policy bundle > fails closed when a candidate path is not repo-relative",
      "FIX-09 C1 policy bundle > rejects duplicate JSON members before last-member-wins parsing",
      "FIX-09 C1 policy bundle > requires every policy member to be own plain JSON data",
      "FIX-09 C1 policy bundle > accepts lawful null-prototype records and returns the same safe shape",
      "FIX-09 C1 policy bundle > does not let Object.prototype supply a missing quick_arm",
      "FIX-09 C1 policy bundle > returns the frozen own snapshot under non-writable prototype pollution",
      "FIX-09 C1 policy bundle > projects every numeric index safely and refuses polluted schema execution",
      "FIX-09 C1 policy bundle > refuses every inherited non-writable numeric index without weakening clean validation",
      "FIX-09 C1 policy bundle > does not classify non-index numeric spellings as array pollution",
      "FIX-09 C1 policy bundle > does not expose numeric-prototype mutation through a live descriptor replacement",
      "FIX-09 C1 policy bundle > does not let Object.prototype supply missing nested members",
      "FIX-09 C1 policy bundle > runs cross-field checks against the own snapshot",
      "FIX-09 C1 policy bundle > returns failure for all missing value fields without invoking a prototype getter",
      "FIX-09 C1 policy bundle > returns failure for all missing value fields over non-writable prototype data",
      "FIX-09 C1 policy bundle > rejects all accessor-backed value fields without consulting a prototype getter",
      "FIX-09 C1 policy bundle > rejects all accessor-backed value fields over matching inherited data",
      "FIX-09 C1 policy bundle > rejects all proxy-normalized value descriptors before any trap or getter",
      "FIX-09 C1 policy bundle > rejects all proxy-normalized value descriptors over matching inherited data",
      "FIX-09 C1 policy bundle > rejects top-level and nested proxies before reflective traps",
      "FIX-09 C1 policy bundle > maps revoked policy, request, environment, and nested proxies to bounded refusal",
      "FIX-09 C1 policy bundle > bounds cycles and over-cap graphs before recursive reflection",
      "FIX-09 C1 policy bundle > rejects accessor-backed hash input without invoking the accessor",
      "FIX-09 C1 policy bundle > refuses a repin unless the one recorded custodian token matches",
      "FIX-09 C1 policy bundle > refuses an authenticated next_bundle accessor without invoking it",
      "FIX-09 C1 policy bundle > does not let descriptor prototypes authenticate a token or select a bundle",
      "FIX-09 C1 policy bundle > rejects proxy-normalized token and bundle descriptors before traps",
      "FIX-09 C1 policy bundle > refuses inherited or descriptor-trapping next_bundle data",
      "FIX-09 C1 policy bundle > rejects a proxy in the request prototype chain before its traps",
      "FIX-09 C1 policy bundle > rejects a proxy policy before its first prototype trap",
      "FIX-09 C1 policy bundle > maps every missing or malformed token to REPIN_REFUSED",
      "FIX-09 C1 policy bundle > lets the custodian populate a deferred hash slot without changing its gate",
      "FIX-09 C1 policy bundle > rejects a second custodian instead of widening custody",
      "FIX-09 C1 policy bundle > freezes the tracer seam and leaves the dispatch arm memberless",
      "FIX-09 C2 deterministic intake > accepts scheduler failures and returns the exact skip cases",
      "FIX-09 C2 deterministic intake > maps every invalid boundary to one closed poison reason",
      "FIX-09 C2 incident projection > uses structured declared-pair or source-event work keys",
      "FIX-09 C2 incident projection > recomputes stable aggregates by composite identity, work unit, severity, time, and source",
      "FIX-09 C2 incident projection > derives UI-only ineligibility without persisting a parallel state",
      "FIX-09 C2 incident projection > accepts exactly the closed incident transition graph",
      "FIX-09 C3 deterministic tier gate > labels a small first-party code root QUICK but keeps approval-first while quick_arm is OFF",
      "FIX-09 C3 deterministic tier gate > lets the immutable floor dominate size and uses only closed denial reasons",
      "FIX-09 C3 deterministic tier gate > labels any floor-clear internal shape above a QUICK bound PR_FIX and approval-first",
      "FIX-09 C3 deterministic tier gate > uses canonical incident identity and ordering in the input hash",
      "FIX-09 C3 deterministic tier gate > fails closed without evaluating hostile accessors or emitting raw/free text",
      "FIX-09 C3 deterministic tier gate > evaluates 1,000 fixed-seed inputs twice to byte-identical policy-decision payloads",
      "FIX-09 C3 zero-model daemon > loads main through a real resolve trace with no model, CLI, provider, child-process, or db-package edge",
      "FIX-09 C3 zero-model daemon > runs the real daemon, persists its closed policy result, and writes zero budget rows",
      "FIX-09 C2 listener migration on real PostgreSQL > uses composite incident identity with exact Drizzle parity",
      "FIX-09 C2 listener migration on real PostgreSQL > publishes commit-aware wake hints without changing occurrence triggers or listener grants",
      "FIX-09 C2 listener transaction lock on real PostgreSQL > excludes the same occurrence key, releases on rollback, and preserves read-only grants",
      "FIX-09 C2 atomic delivery on real PostgreSQL > serializes direct same-occurrence attempts and rechecks ACK after the lock",
      "FIX-09 C2 atomic delivery on real PostgreSQL > folds or terminally receipts rows before ACK and advances only a contiguous cursor",
      "FIX-09 C2 atomic delivery on real PostgreSQL > rolls operational SQL failure back and succeeds on retry",
      "FIX-09 C2 atomic delivery on real PostgreSQL > rolls poison action and health back when ACK insertion fails",
      "FIX-09 C2 atomic delivery on real PostgreSQL > isolates delivered aggregates by fingerprint version and keeps replay idempotent",
      "FIX-09 C2 atomic delivery on real PostgreSQL > reuses deterministic skip and poison receipts when ACK is absent",
      "FIX-09 C2 serialized listener daemon on real PostgreSQL > rejects incomplete configuration and distrusts malformed notification payloads",
      "FIX-09 C2 serialized listener daemon on real PostgreSQL > pins the cap-one selector, global lock, and hint-only dependency surface",
      "FIX-09 C2 serialized listener daemon on real PostgreSQL > LISTENs before leadership and notification wakes work before a long poll",
      "FIX-09 C2 serialized listener daemon on real PostgreSQL > polls missed wakes and drains FATAL-first then occurrence-time/sequence order at cap one",
      "FIX-09 C2 serialized listener daemon on real PostgreSQL > keeps one leader, promotes a standby, and reconnects LISTEN-first after loss"
   ],
   "reporter_sha256" : "8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce"
}

```
<!-- FIX09_C35_PROJECTION_END -->

---

### Task 0: Produce independently replayable admission artifacts

**Files:**

- Preserve byte-for-byte: failed v10 and v11 programs, base manifests/evidence, empty roots, reports, branches, and worktrees; rejected-v12 authority/report/review evidence; approved FIX-10-v9 authority/review evidence
- Before independent authority PASS, create and remove only the disposable shadow runner/program/topology
- After independent authority PASS, create outside product tree: `PROGRAM`
- After independent authority PASS, create outside product tree: v16 candidate/review/result receipts, three evidence roots/manifests, and three distinct accepted raw security-scan transcripts
- Do not modify product, test, migration, or prior authority files

**Interfaces:**

- Consumes: independently approved v16 commit and immutable FIX-01/FIX-02/FIX-09 heads.
- Produces: closed candidate, reviewer result, base/candidate-validation/result-validation evidence.

- [ ] **Step 0: Prove failed-attempt integrity and the exact corrected execution**

Before authority acceptance, prove all ten real v16 output files, the real v16 worktree, and the real v16 branch absent. From a fresh exact runner path, materialize the disposable runner fence byte-for-byte and require its printed size/hash, mode 0500, regular nonsymlink single-link type, and canonical path. Execute it once with the Appendix A environment. Before any scanner/fixture mode, its embedded program must emit `FIX09_ABSTRACT_NO_TOUCH_PASS git=0 list=0 stat=0 open=0 read=0 mutant=1 cause=FIX09_PAPER_WORKTREE\n`; preflight must then emit `FIX09_ATTEMPT_PREFLIGHT_PASS future_absent=12 preserved_v10=7 preserved_v11=7 preserved_v12=9 v10_tip=c20e38f1695ecbf72ab2624c9f72dfe4e634d07b v11_tip=61313a1d89cd354743f8bc94329f716fe4f2bdf5 v12_ref=dd7b84959aaa95dfaf40ccf4f7b2396c25a32848\n`. The runner then performs the actual shadow 39→32→20 proof. Require rc 0, empty stderr, one canonical `FIX09_SHADOW_PASS` line with `schema=fix09-v16-shadow-proof/v1`, `base_facts=39`, `candidate_fields=32`, `validation_outcomes=20`, exact zero excluded-path call object, `security_scan_pairs=3`, `security_full_scans=6`, exact ordered contexts `[base,derive,candidate-positive]`, three sealed `security_raw_scans` byte/SHA rows, each of `t0_014/t0_022/t0_031=0`, and `cleanup=3`. Confirm the runner, its random root, worktree, and branch are absent afterward. This evidence is non-authoritative and is never renamed, published, or reused as real Task 0 evidence.

Separately run the exact embedded program's `excluded-path-zero-io`, `late-metadata-fixtures`, `retry-trace-fixtures`, `resolution-map-fixtures`, `grant-fixtures`, `attempt-preflight-fixtures`, `source-map-fixtures`, `scanner-fixtures`, `stable-read-fixtures`, `stable-read-mutants`, `paper-retry-fixtures`, `validation-scan-fixtures`, `security-projection-fixtures`, `admission-liveness-mutants`, and `c35-projection-fixtures` modes from another disposable shadow-shaped path. Require the exact outputs pinned above. Recompute both failed attempts plus rejected-v12 evidence, approved FIX-10-v9 documents/review, program/manifest/report hashes, evidence counts and embedded-manifest byte equality, empty roots, branch tips, clean worktree tips, and registry membership after shadow cleanup. Preserve and hash the v14/v15 STOP evidence without retry. Only an independent review with zero unresolved P0-P3 may then authorize Step 1.

- [ ] **Step 1: Materialize and hash the exact real program**

Copy only the concatenated Appendix C JavaScript bytes to the fixed path. Verify its printed SHA-256, mode, owner, file type, nlink, and canonical path before execution.

Run exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,scanner-fixtures]` in `CONTROLLER` with the Appendix A environment. Require rc 0, empty stderr, and the exact aggregate line pinned above. Run every standalone fixture/mutant mode named in Step 0; require its pinned rc/streams. The modes create no Git repository or Git metadata; their only writes are random mode-controlled `/private/tmp/fix09-v16-paper.*` fixture roots removed in `finally`.

- [ ] **Step 2: Capture the base ledger exactly**

Call `fix09_capture_fact` once per Appendix B base entry in ordinal order using its expanded exact cwd/argv. Do not stop on expected merge rc 1. Finalize only after all 39 facts exist. Then invoke exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<base-root>/manifest.json,BASE_MANIFEST]`; `BASE_MANIFEST` must not preexist, and the program exclusive-publishes the byte-identical mode-0400 fixed copy.

- [ ] **Step 3: Derive and write the candidate**

Run exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,derive-candidate,BASE_MANIFEST,CANDIDATE,DERIVE_SECURITY_SCAN]`. It replays all 39 sealed facts, cheap live Git/topology anchors, and one new bounded complete-security pair; it exclusive-writes the accepted raw transcript, independently compares its projection with base t0-039, then emits only the exact 32-line receipt. Both outputs are fsynced, exclusive atomic-renamed, directory-fsynced, and mode `0400`. Run `candidateLedger(BASE_MANIFEST)` into its own root, finalize, and publish its manifest with exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<candidate-validation-root>/manifest.json,CANDIDATE_VALIDATION_MANIFEST]`. Its positive row has exact argv suffix `[CANDIDATE,BASE_MANIFEST,CANDIDATE_SECURITY_SCAN,--mutant=NONE]`, performs one new bounded pair, writes that raw transcript, and compares its projection; all nineteen hostiles perform none.

- [ ] **Step 4: Obtain independent admission review**

Sol independently re-runs `validate-candidate` with a distinct reviewer raw-scan path, one fresh bounded reviewer complete-security pair, graph/source/collision comparisons, raw byte/SHA sealing, base-projection comparison, and every hostile. The report must contain the exact v16 reviewer lines. Only Sol writes the 17-field result.

- [ ] **Step 5: Replay the result without a circle**

Run `resultLedger(BASE_MANIFEST,CANDIDATE_VALIDATION_MANIFEST)` in a third fresh root: its positive case has exact argv suffix `[CANDIDATE,BASE_MANIFEST,RESULT,CANDIDATE_VALIDATION_MANIFEST,REVIEW,RESULT_SECURITY_SCAN,--mutant=NONE]`, performs one new bounded complete-security pair, writes that raw transcript, and compares its projection; its two review hostiles perform none. Finalize, publish with exact argv `[/Users/vladmihaimiron/.local/bin/node,PROGRAM,publish-manifest,<result-validation-root>/manifest.json,RESULT_VALIDATION_MANIFEST]`, and obtain a second independent readback including that reviewer's own fresh bounded complete-security pair and raw byte/SHA. Task 1 remains STOP until the candidate, result, three manifests, all raw transcripts, and both reviews pass.

---

### Task 1: Implement the capture gate with truthful reporter expansion

**Files:**

- Create: `tools/fix09-capture-gate.mjs`
- Create: `tests/unit/fix09-capture-gate.test.ts`
- Create: `tests/unit/fixtures/fix09-gate-manifest.json`

- [ ] **Step 1: Write the exact RED test**

Use the one v6 Task 1 name. In addition to prior hostile cases, assert `IT_EACH_UNDERCOUNT` for a missing, duplicated, reordered, and substituted expanded case, and `LEGACY_TOTAL_105_109` for either old total. The RED run selects exactly one file/one name and captures `MODULE_NOT_FOUND` before assertion.

- [ ] **Step 2: Implement exact reporter parsing**

Parse Vitest JSON as closed own-data. Normalize each reported absolute file name to one of the exact authority paths, require a one-to-one set match, and index by path; do not use reporter completion order. In the authority's printed file order, construct every result as `ancestorTitles.join(" > ") + " > " + title`, including each expanded `it.each` result. Compare within-file order, global uniqueness, exact canonical array bytes/hash, statuses, and totals. Unknown reporter keys needed for no comparison may exist, but every consumed field is own plain data and wrong type is invalid.

- [ ] **Step 3: Run Task 1 three times**

Exact argv remains `pnpm exec vitest run --reporter=json tests/unit/fix09-capture-gate.test.ts`. Require exact anchored summaries with `files=1 tests=1 failed=0 skipped=0 todo=0` for runs 1, 2, and 3.

---

### Task 2: Execute preserved C3.5 work and corrected gates

**Files:** exactly the C3.5 source/test ledger above and the eleven-plus-five projection below; no C4-only file.

- [ ] **Step 1: Preserve all v4-v12 protocol tests and apply only the v16 executable corrections**

Implement no unlisted row/witness change. Retain detail, keyring-independent witness, recovery, permission, legacy, writer, and FIX-10 cases exactly, then follow the v16 TDD order for the authenticated six-profile descriptor custodian, parent-signed opaque signer session, generation-scoped delivery adapter, gateway signature replacement, materialization, and structural probes. Prove `persistFolded` writes incident+policy only, only skipped/poisoned call the action gateway, dependency direction is listener-to-capture only, and the existing chain-writer reporter also enforces the frozen runtime-start ABI.

- [ ] **Step 2: Run C3.5 three times**

Use exactly `paths` from the C3.5 reporter projection followed by all five immutable adjacent files. Require the exact 118-name array/hash and summaries:

```text
FIX09_GATE_PASS gate=c35-focused run=1 files=16 tests=118 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=2 files=16 tests=118 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=3 files=16 tests=118 failed=0 skipped=0 todo=0
```

- [ ] **Step 3: Obtain independent C3.5 review**

Review all three admission manifests and receipt replays plus preserved v4-v16 protocol evidence. Require exact SPEC PASS/CODE QUALITY PASS and zero P0-P3 before FIX-10 C0.

---

### Task 3: Execute preserved C4 work and corrected gates

**Files:** all PLAN-v5/v6 C4 files only.

- [ ] **Step 1: Preserve binding stage order**

Begin only after reviewed C3.5 and separately authorized/reviewed FIX-10 C0. Preserve watchdog/witness/read-only/journal laws.

- [ ] **Step 2: Run C4 three times**

Use the same 20 file paths: all 15 v6 new files plus five immutable adjacent files. Require:

```text
FIX09_GATE_PASS gate=c4-focused run=1 files=20 tests=122 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=2 files=20 tests=122 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=3 files=20 tests=122 failed=0 skipped=0 todo=0
```

- [ ] **Step 3: Run all hostile and non-test gates**

Require prior zero/wrong-name/wrong-count/wrong-summary/nonzero/skipped/todo/truncated/argv/preexisting/extra-key controls plus `IT_EACH_UNDERCOUNT` and `LEGACY_TOTAL_105_109`. Capture exact raw streams/status before asserting.

- [ ] **Step 4: Obtain independent C4 review and stop before V-only acts**

Require independent PASS/PASS with zero P0-P3, then report local evidence only. Key provisioning, migration application, quiesce, activation, service operation, acceptance, merge, push, and Done remain V-only or separately unauthorized.
