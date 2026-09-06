# FIX-10 — executable custody ownership, framing, release, and wipe evidence

**Successor authority packet — 2026-09-07, fix round 5.** This document incorporates `SPEC-v2.md` through `SPEC-v6.md` without changing their bytes. It supersedes only the six clauses identified in §1: helper ownership, the C3.5 composition prerequisite, startup framing, post-startup descriptor/release order, helper-build hash preimages, and native zeroization evidence. Every other v6 parent/child boundary, six-parent ceremony, v5 public readiness/commit schema and domain, v2-v5 control/gateway/lifecycle rule, VNOW-05 Option A topology, test, rollback, and STOP law remains binding.

This packet authorizes these successor documents and fresh independent review only. It authorizes no FIX-09 v13 document or implementation, FIX-10 source/test/package/migration edit, helper build/install, Task 0, worktree, live root/key/database/process, activation, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified six-finding correction boundary

The round-5 Sol report was independently checked against frozen v3/v5/v6, current FIX-09 v12, and the local Darwin SDK. All six findings stand:

1. v6 copied rejected FIX-09 v12's `V_OS_UID` helper owner, contradicting v3's controlling `V_PROVISIONER_UID`.
2. v6 required all five row-writer compositions in reviewed C3.5 even though FIX-09 defers the first `obsctl_action` call to FIX-10 C0.
3. v6 required the child to close the response fd before returning `CLOSED_ACK`.
4. v6 commands referred to current session bindings absent from its startup frame.
5. v6 named source/build/table/compiler/SDK/argv/output/projection/receipt/map/pin hashes without unique byte preimages.
6. v6 required a native wipe but did not forbid an optimizer-elidable `memset` or prove the call in object code. The selected macOS SDK declares `memset_s`, available since macOS 10.9.

These corrections add no root, persistent path, database object, migration, role, grant, raw action DML, public command, signer, or production default. They do not alter the materialized gateway or any public signed v5 JSON schema.

## 2. Sole helper owner is `V_PROVISIONER_UID`

V6 §6's two `V_OS_UID` references are replaced by `V_PROVISIONER_UID`. The exact installed helper remains:

~~~text
${OBS_CONTROL_DIR}/chain/fix09-openat-read
owner:group = V_PROVISIONER_UID:OBS_CHAIN_PUBLIC_GID
mode = 0550
type = regular nonsymlink
nlink = 1
setuid = absent
setgid = absent
group/world write = absent
~~~

`V_PROVISIONER_UID` is pairwise distinct from OBSCTL_UID, API_WRITER_UID, RUNNER_WRITER_UID, SCHEDULER_WRITER_UID, DAEMON_UID, and WATCHDOG_UID. No `V_OS_UID` compatibility alias exists.

Parent pre-spawn validation, child startup self-validation, the two-build/install receipt replay, the completed activation helper object, activation parity, recovery, and every cold start require the helper file's owner UID to equal the injected V provisioner UID. A missing value, legacy symbol, obsctl/writer/daemon/watchdog owner, owner change between validation and execution, or owner mismatch with the signed activation refuses before a private open or process release.

Only V_PROVISIONER_UID may create the same-directory install temporary, set metadata, rename/fsync, or replace the helper. Runtime signer principals have execute/read through OBS_CHAIN_PUBLIC_GID but no helper-file or `chain`-directory mutation right.

## 3. Acyclic FIX-09 v13/C3.5 dependency

Before FIX-10 Task 0, the future independently approved FIX-09 v13 authority and independently reviewed `FIX09_C35_REVIEWED_REF` must prove exactly:

1. four existing live row-writer compositions: `api_occurrence`, `runner_occurrence`, `scheduler_occurrence`, and `daemon_action`;
2. a reviewed dormant `obsctl_action` gateway/profile/`PinnedSignerSession` capability with exact `(agent_action,ops,obsctl,1,null)` authority, but zero C3.5 call, entry-point composition, database action, process launch, or release;
3. the private non-live `watchdog_witness` profile/session seam needed by later C4, still rejected by the C3.5 public row-writer preparation API; and
4. every v7 owner/frame/hash/wipe/build/install capability fact.

C3.5 must prove both that the dormant obsctl capability exists and that no C3.5 runtime reaches it. An already-called/composed `obsctl_action`, an absent dormant capability, a watchdog admitted as a row profile, or a missing private watchdog seam is STOP.

After Task 0 admits those reviewed facts, FIX-10 C0 Task 2 is the first authority allowed to compose `obsctl_action` in the inherited obsctl reconciliation/session paths. Only after that composition may C0 assemble and test the complete six-parent activation-readiness ceremony: the four existing C3.5 parents, the newly composed obsctl parent, and the private non-live watchdog parent seam. Actual watchdog runtime operation remains FIX-09 C4-gated. No stage calls a downstream composition as evidence for its own admission.

## 4. Canonical native custody wire

### 4.1 Primitive encoding

All frames use network byte order and these exact primitives:

~~~text
U8(n)      = one unsigned byte
U16(n)     = two-byte unsigned big-endian
U32(n)     = four-byte unsigned big-endian
U64(n)     = eight-byte unsigned big-endian
LP8(s)     = U8(byte_length(ASCII(s))) || ASCII(s)
D32(h)     = the 32 raw bytes decoded from 64 lowercase hex h
UUID16(u)  = the 16 RFC 4122 network-order bytes parsed from canonical lowercase UUIDv4 u
~~~

The three product identities contain 1..128 ASCII bytes and match binding FIX-09 `^[a-z0-9][a-z0-9._-]{0,127}$`. No field contains NUL. A frame is:

~~~text
payload = ASCII("F10CUST7") || U8(1) || U8(opcode) || U32(sender_ordinal) || body
frame   = U32(byte_length(payload)) || payload
~~~

The magic is eight bytes. Payload length is 14..764, so the four-byte prefix plus payload fits the sole 768-byte frame buffer. Reads and writes are exact-length loops; EOF before a complete frame, length outside bounds, trailing byte, extra frame, unknown version/opcode, or wrong ordinal is fatal.

Define the immutable session binding:

~~~text
BIND =
  UUID16(barrier_id) ||
  D32(nonce) ||
  UUID16(session_id) ||
  U8(slot_id) ||
  U8(profile_id) ||
  D32(activation_manifest_sha256) ||
  D32(public_keyring_sha256) ||
  D32(inventory_sha256) ||
  D32(profile_map_sha256)
~~~

Slot/profile ids are both `1=api_occurrence`, `2=runner_occurrence`, `3=scheduler_occurrence`, `4=daemon_action`, `5=obsctl_action`, and `6=watchdog_witness`; they must be equal. `nonce` is the v5 32-byte random nonce. Every digest is independently recomputed before spawn.

### 4.2 OPEN establishes the session before private access

The first and only setup request is:

~~~text
OPEN_REQUEST =
  frame(opcode=0x01, sender_ordinal=0,
        body=BIND ||
             LP8(API_WRITER_IDENTITY) ||
             LP8(RUNNER_WRITER_IDENTITY) ||
             LP8(SCHEDULER_WRITER_IDENTITY))
~~~

The parent sends it once after spawning the activation-pinned helper. The child validates exact UID/GID, executable V_PROVISIONER_UID ownership/pins, BIND, all three identities, compile-time profile template, reconstructed runtime profile map, and selected internal path before the first private-leaf open. It stores BIND immutably. There is no environment/path field, extra setup opcode, first-command learning, or rebinding.

After the inherited secure walk and one read, the child's first response is:

~~~text
OBSERVED =
  U64(dev) || U64(ino) || U64(uid) || U64(gid) || U16(mode) ||
  U64(nlink) || U64(size) || U64(mtime_ns) || U64(ctime_ns)

PRIVATE_RESPONSE =
  frame(opcode=0x81, sender_ordinal=0,
        body=BIND || U16(pkcs8_length) || PKCS8 || OBSERVED)
~~~

`pkcs8_length` is 1..256. The bytes must decode as exactly one no-trailing-byte RFC 8410 Ed25519 PKCS#8 value. This is the only response containing private bytes.

After the entire PRIVATE_RESPONSE has been written, the child performs the §7 wipes and sends:

~~~text
ZERO_ACK =
  frame(opcode=0x82, sender_ordinal=1,
        body=BIND || U8(secret_buffer_count=2) ||
             U8(memset_s_call_count=2) || U8(zero_scan_mask=0x03))
~~~

The parent accepts startup only after exact PRIVATE_RESPONSE then exact ZERO_ACK. A wrong/stale OPEN member, different later BIND, omitted digest, substituted profile, reordered identity, duplicate OPEN/private response, missing ZERO_ACK, or first-command rebinding is session loss.

### 4.3 Monotonic CHECK/CLOSE grammar

Parent request ordinals are strict:

| Request | Opcode | Parent ordinal | Exact extra body |
|---|---:|---:|---|
| OPEN | `0x01` | 0 | three LP8 product identities |
| CHECK readiness | `0x02` | 1 | none |
| CHECK commit | `0x03` | 2 | `D32(commit_challenge)` |
| CHECK release | `0x04` | 3 | `U8(release_ordinal) || D32(release_record_sha256)` |
| CLOSE abort | `0x05` | next expected 1..4 | none |
| CLOSE release | `0x06` | 4 | `U8(release_ordinal) || D32(release_record_sha256)` |

Every body begins with exact stored BIND. Child response ordinals are strict: PRIVATE_RESPONSE 0, ZERO_ACK 1, readiness `0x83`/2, commit `0x84`/3, release `0x85`/4, and CLOSED_ACK `0x86`/5. Each CHECK response repeats BIND, its request's extra body, and current OBSERVED. The child compares every byte with stored startup state and the expected phase before a metadata operation. No opcode signs, reads key bytes, accepts a path, opens a network fd, or changes session state out of order.

`release_record_sha256 = DH("obs-chain-signer-release-record/v1",[J(exact_v5_release_record)])` under §6 primitives. CLOSE_ABORT emits no ACK, closes safely, yields response EOF and empty stderr, exits zero, and never activates the parent. Protocol/error exits are nonzero.

## 5. Exact retained fds and CLOSE_RELEASE order

The root and intermediate walk descriptors are closed before PRIVATE_RESPONSE. After successful startup, the child's open descriptors are exactly:

1. `leaf_fd`: the sole retained private-file capability;
2. `parent_dir_fd`: the non-private directory capability used only for fixed-name `fstatat`;
3. `control_fd`: read end of the parent-to-child anonymous pipe;
4. `response_fd`: write end of the child-to-parent anonymous pipe; and
5. captured `stderr_fd`, on which the child intentionally writes no byte.

There is no stdin, stdout, root fd, intermediate fd, network fd, listener, log, or other inherited descriptor. “Retains only the leaf fd” means leaf_fd is the sole retained private-file capability, not that CHECK can operate without its fixed protocol/directory descriptors.

After durable DB/file/public parity, the exact release sequence is:

1. parent sends CHECK release and receives/verifies the exact `0x85` response;
2. parent sends CLOSE release;
3. child closes `leaf_fd` first and requires `close` return zero;
4. child closes `parent_dir_fd` and `control_fd`, requiring each return zero;
5. child securely wipes all protocol buffers;
6. while `response_fd` remains open, child fully writes exactly:

~~~text
CLOSED_ACK =
  frame(opcode=0x86, sender_ordinal=5,
        body=BIND || U8(closed_fd_mask=0x07) ||
             U8(protocol_zero_scan=0x01))
~~~

7. child closes `response_fd`, requiring return zero, and exits status 0 without writing stderr;
8. parent reads the complete exact CLOSED_ACK, then exact response EOF, then confirms stderr EOF with zero stderr bytes, then waits and accepts exact normal exit status 0;
9. only then may that parent report custody closed; no parent `KeyObject` activates until all six parents have completed steps 1-8, after which parent activation retains v6's exact order.

`closed_fd_mask` bits 0,1,2 mean leaf, parent directory, and control respectively. Response is deliberately absent because ACK precedes its close. A close error produces no success ACK; cleanup continues best-effort, the child exits nonzero, and the parent applies the binding precommit/postcommit session-loss result. ACK before leaf close, ACK after response close, missing EOF, stderr byte, extra post-ACK response byte, signal, or zero exit before the ACK is fully consumed cannot pass.

## 6. Canonical hash preimages and domains

### 6.1 Universal hash encoding

Let `J(x)` be RFC 8785 canonical UTF-8 bytes of the exact closed JSON value. Let:

~~~text
LP(x) = U32(byte_length(x)) || x
ARGV(A) = U32(array_length(A)) || CONCAT(i=0 to array_length(A)-1, LP(UTF8(A[i])))
DH(domain,X) =
  lowercase_hex(SHA256(
    UTF8(domain) || 0x00 || U32(array_length(X)) ||
    CONCAT(i=0 to array_length(X)-1, LP(X[i]))
  ))
~~~

`CONCAT` emits its indexed byte strings in increasing `i` order and emits the empty byte string for a zero-length array. Domains are literal ASCII shown below. A hex digest used as a later field is decoded with `D32`, never hashed as hex text unless `UTF8(...)` is expressly written. Raw streams include every byte and final LF. Concatenation without LP, platform newline conversion, JSON whitespace/key-order bytes instead of J, NUL-delimited argv, shell text, plain untagged SHA-256, or a different domain is invalid.

### 6.2 Template, source, generated header, compiler, and SDK

The semantic compile-time template is exactly this closed object:

~~~json
{
  "schema":"obs-chain-helper-profile-template/v1",
  "profiles":[
    {"id":"1","profile":"api_occurrence","identity_rule":"inventory_api","leaf_rule":"chain_private_identity"},
    {"id":"2","profile":"runner_occurrence","identity_rule":"inventory_runner","leaf_rule":"chain_private_identity"},
    {"id":"3","profile":"scheduler_occurrence","identity_rule":"inventory_scheduler","leaf_rule":"chain_private_identity"},
    {"id":"4","profile":"daemon_action","identity_rule":"literal_fixagent-daemon","leaf_rule":"chain_private_identity"},
    {"id":"5","profile":"obsctl_action","identity_rule":"literal_obsctl","leaf_rule":"chain_private_identity"},
    {"id":"6","profile":"watchdog_witness","identity_rule":"json_null","leaf_rule":"keys_watchdog_witness"}
  ]
}
~~~

FIX-09 v13 authority must contain the complete exact LF-terminated generated header bytes for this template and the exact normalized compiler argv template. C3.5 builds use those bytes without regeneration or runtime substitution. Define:

~~~text
source_sha256 =
  DH("obs-chain-helper-source/v2",
     [UTF8("packages/obs-capture/native/fix09-openat-read.c"), RAW_SOURCE])

profile_template_sha256 =
  DH("obs-chain-helper-profile-template/v1",[J(PROFILE_TEMPLATE)])

generated_header_sha256 =
  DH("obs-chain-helper-generated-header/v1",
     [UTF8("fix09-profile-table.generated.h"), RAW_HEADER])

compiler_version_capture =
  ARGV([COMPILER_PATH,"--version"]) ||
  U32(0) || LP(RAW_STDOUT) || LP(RAW_STDERR)

compiler_identity_sha256 =
  DH("obs-chain-helper-compiler/v1",[compiler_version_capture])

xcrun_sdk_capture =
  ARGV(["/usr/bin/xcrun","--sdk","macosx","--show-sdk-path"]) ||
  U32(0) || LP(UTF8(SDK_PATH) || 0x0a) || LP(EMPTY)

sdk_identity_sha256 =
  DH("obs-chain-helper-sdk/v1",
     [xcrun_sdk_capture,
      UTF8("SDKSettings.json"), RAW_SDK_SETTINGS_JSON,
      UTF8("System/Library/CoreServices/SystemVersion.plist"), RAW_SYSTEM_VERSION_PLIST])
~~~

`EMPTY` is the zero-length byte string. Both identity commands run with empty environment, cwd `/`, direct absolute executables, no shell, exact status 0, and captured raw streams. `COMPILER_PATH`, `SDK_PATH`, target triple, and deployment target are required V inputs with no default.

### 6.3 Build argv/input, output, Mach-O projection, and receipt

V13 authority prints the full ordered compiler argv template. Before hashing, only each fresh absolute build root is replaced with literal ASCII `@BUILD_ROOT@`; all other bytes remain. Define:

~~~text
ordered_argv_sha256 =
  DH("obs-chain-helper-argv/v1",[ARGV(NORMALIZED_ORDERED_ARGV)])

build_input_sha256 =
  DH("obs-chain-helper-build-input/v1",
     [D32(source_sha256),
      D32(profile_template_sha256),
      D32(generated_header_sha256),
      D32(compiler_identity_sha256),
      D32(sdk_identity_sha256),
      D32(ordered_argv_sha256),
      UTF8(TARGET_TRIPLE),
      UTF8(DEPLOYMENT_TARGET)])

build_output_sha256 =
  DH("obs-chain-helper-output/v1",[RAW_MACHO_BYTES])

object_output_sha256 =
  DH("obs-chain-helper-object/v1",[RAW_OBJECT_BYTES])
~~~

The two build roots must yield identical RAW_OBJECT_BYTES and RAW_MACHO_BYTES and thus identical object/output hashes.

The corroborating tool identity capture concatenates, in this exact order, the successful raw captures for:

~~~text
["/usr/bin/xcrun","--sdk","macosx","--find","otool"]
[OTOOL_PATH,"--version"]
["/usr/bin/xcrun","--sdk","macosx","--find","nm"]
[NM_PATH,"--version"]
~~~

Each capture is `ARGV(argv) || U32(0) || LP(RAW_STDOUT) || LP(RAW_STDERR)`, with empty environment, cwd `/`, direct absolute executable, and raw final LF preserved. The two find commands require empty stderr and exact `UTF8(RESOLVED_PATH) || 0x0a` stdout. Define:

~~~text
macho_tool_identity_sha256 =
  DH("obs-chain-helper-macho-tools/v1",[FOUR_TOOL_CAPTURES])

macho_parser_source_sha256 =
  DH("obs-chain-helper-macho-parser/v1",
     [UTF8(V13_MACHO_PARSER_SOURCE_PATH), RAW_MACHO_PARSER_SOURCE])
~~~

A reviewed v13 byte parser produces this exact closed projection: `{schema:"obs-chain-helper-macho/v1",cputype,cpusubtype,filetype,flags,minos,sdk,load_commands,external_dependencies,undefined_symbols}`. `cputype`, `cpusubtype`, `filetype`, `minos`, and `sdk` are nonempty lowercase ASCII strings; `flags` is an array of unique lowercase ASCII strings sorted by unsigned UTF-8. `load_commands` preserves Mach-O file order as exact closed `{ordinal,cmd,cmdsize,name}` records: `ordinal` and `cmdsize` are canonical nonnegative decimal strings, `cmd` is a nonempty lowercase ASCII string, and `name` is JSON null or the exact decoded UTF-8 name. `external_dependencies` and `undefined_symbols` are arrays of strings; dependencies preserve LC_LOAD_DYLIB order and equal only `["/usr/lib/libSystem.B.dylib"]`, while symbols are unique and unsigned-UTF-8 sorted. V13 authority pins the complete parser path and bytes. The parser's result must agree with the tool captures. Define:

~~~text
macho_projection_sha256 =
  DH("obs-chain-helper-macho-projection/v1",[J(MACHO_PROJECTION)])
~~~

The exact build receipt is this closed object in the displayed order:

~~~json
{
  "schema":"obs-chain-private-key-helper-build/v2",
  "source_sha256":"<64 lowercase hex>",
  "profile_template_sha256":"<64 lowercase hex>",
  "generated_header_sha256":"<64 lowercase hex>",
  "compiler_path":"<required absolute V-selected Xcode clang path>",
  "compiler_identity_sha256":"<64 lowercase hex>",
  "sdk_path":"<required absolute V-selected macOS SDK path>",
  "sdk_identity_sha256":"<64 lowercase hex>",
  "macho_tool_identity_sha256":"<64 lowercase hex>",
  "macho_parser_source_sha256":"<64 lowercase hex>",
  "target_triple":"<required V value>",
  "deployment_target":"<required V value>",
  "ordered_argv_sha256":"<64 lowercase hex>",
  "build_input_sha256":"<64 lowercase hex>",
  "build_one_output_sha256":"<64 lowercase hex>",
  "build_two_output_sha256":"<same 64 lowercase hex>",
  "object_output_sha256":"<identical-build object hash>",
  "macho_projection_sha256":"<64 lowercase hex>",
  "memset_s_header_sha256":"<64 lowercase hex>",
  "wipe_object_projection_sha256":"<64 lowercase hex>",
  "wipe_disassembly_projection_sha256":"<64 lowercase hex>",
  "external_dependencies":["/usr/lib/libSystem.B.dylib"]
}
~~~

~~~text
build_receipt_sha256 =
  DH("obs-chain-helper-build-receipt/v2",[J(BUILD_RECEIPT)])
~~~

### 6.4 Runtime profile map and activation pins

The runtime profile map remains the exact six v6 ordered `{profile,writer_identity,relative_pk8_path}` records after the three inventory substitutions:

~~~text
profile_map_sha256 =
  DH("obs-chain-helper-profile-map/v1",[J(RUNTIME_PROFILE_MAP)])
~~~

Define `HELPER_PINS` as this exact closed object in the displayed order:

~~~json
{
  "schema":"obs-chain-private-key-helper/v3",
  "relative_path":"chain/fix09-openat-read",
  "source_path":"packages/obs-capture/native/fix09-openat-read.c",
  "source_sha256":"<build receipt source hash>",
  "profile_table_sha256":"<build receipt template hash>",
  "generated_header_sha256":"<build receipt header hash>",
  "profile_map_sha256":"<runtime map hash>",
  "build_input_sha256":"<build receipt input hash>",
  "build_receipt_sha256":"<completed build receipt hash>",
  "installed_binary_sha256":"<build output hash>",
  "installed_binary_size":"<positive decimal>",
  "memset_s_header_sha256":"<build receipt memset_s header hash>",
  "wipe_object_projection_sha256":"<build receipt object-projection hash>",
  "wipe_disassembly_projection_sha256":"<build receipt disassembly-projection hash>",
  "owner_uid":"<V_PROVISIONER_UID decimal>",
  "group_gid":"<OBS_CHAIN_PUBLIC_GID decimal>",
  "device":"<canonical nonnegative decimal>",
  "inode":"<canonical nonnegative decimal>",
  "mode":"0550",
  "nlink":"1"
}
~~~

~~~text
activation_pins_sha256 =
  DH("obs-chain-helper-activation-pins/v1",[J(HELPER_PINS)])
~~~

The completed `private_key_helper` object is HELPER_PINS plus final `activation_pins_sha256`. The V activation signature covers it. Extra/missing/reordered fields, v6/v7 schema confusion, source/header/template/map conflation, alternate compiler/SDK stream treatment, unsafe argv framing, output/projection substitution, receipt/pin self-inclusion, or ordinary untagged digest refuses.

## 7. Non-elidable native and parent zeroization

The child has exactly two secret-bearing allocations:

1. fixed-capacity `key_read_buffer[256]`; and
2. fixed-capacity `key_frame_buffer[768]`, also used in place for partial response writes.

There is no third secret scratch, heap duplicate, string, stdio buffer, iovec copy, log value, crash value, environment value, or evidence value. The no-inline `fix09_wipe_secret_buffers` function contains exactly these two direct calls:

~~~c
memset_s(key_read_buffer, sizeof key_read_buffer, 0, sizeof key_read_buffer);
memset_s(key_frame_buffer, sizeof key_frame_buffer, 0, sizeof key_frame_buffer);
~~~

Both calls must return zero. The full allocation capacity is wiped, not only the admitted key length or written prefix. The function runs once after the final private-frame write before ZERO_ACK, and runs again before every later return/exit after allocation, including open/read/stat/frame/short-write/EPIPE/protocol/close errors and clean CLOSE_ABORT/CLOSE_RELEASE. ZERO_ACK's call count is the first invocation's two calls; the later invocation cannot retroactively change that frame. No ordinary `memset`, explicit loop, compiler builtin, macro replacement, fallback function, weak import, `dlsym`, or conditional omission can substitute.

Source includes `<string.h>` and takes a typed address of `memset_s`; production compilation uses errors for implicit declarations and fails when the selected SDK lacks the declaration/symbol. There is no fallback. Define:

~~~text
memset_s_header_sha256 =
  DH("obs-chain-helper-memset-s-header/v1",
     [UTF8("usr/include/_string.h"), RAW_SELECTED_SDK_STRING_HEADER])
~~~

The exact object projection is:

~~~json
{
  "schema":"obs-chain-helper-wipe-object/v1",
  "object_output_sha256":"<domain-separated raw object hash>",
  "memset_s_undefined_symbol":"_memset_s",
  "memset_s_undefined_symbol_count":"1",
  "secret_allocations":[
    {"name":"key_read_buffer","capacity":"256"},
    {"name":"key_frame_buffer","capacity":"768"}
  ],
  "direct_calls":[
    {"caller":"_fix09_wipe_secret_buffers","ordinal":"1","callee":"_memset_s"},
    {"caller":"_fix09_wipe_secret_buffers","ordinal":"2","callee":"_memset_s"}
  ],
  "ordinary_memset_secret_calls":"0",
  "fallback_symbols":[]
}
~~~

The exact disassembly projection is:

~~~json
{
  "schema":"obs-chain-helper-wipe-disassembly/v1",
  "build_output_sha256":"<domain-separated raw Mach-O hash>",
  "function":"_fix09_wipe_secret_buffers",
  "function_instructions_sha256":"<domain-separated instruction-byte hash>",
  "memset_s_call_offsets":["<first lowercase hex offset>","<second lowercase hex offset>"],
  "memset_s_call_targets":["_memset_s","_memset_s"],
  "cleanup_predecessors":["success","partial_write","read_error","protocol_error","early_error"],
  "exit_without_cleanup_paths":"0"
}
~~~

V13 source must retain the named no-inline cleanup function and machine-readable predecessor labels used by its reviewed control-flow extractor; the v13 authority pins that extractor's source path/bytes with the Mach-O parser. Offsets are strictly increasing. `function_instructions_sha256 = DH("obs-chain-helper-wipe-instructions/v1",[RAW_FUNCTION_INSTRUCTION_BYTES])`. The projections prove one unresolved libSystem `_memset_s` symbol, the two named secret allocations, two direct wipe call sites, no secret ordinary-memset call/fallback, and reachability from every named cleanup predecessor. Their hashes are:

~~~text
wipe_object_projection_sha256 =
  DH("obs-chain-helper-wipe-object/v1",[J(WIPE_OBJECT_PROJECTION)])

wipe_disassembly_projection_sha256 =
  DH("obs-chain-helper-wipe-disassembly/v1",[J(WIPE_DISASSEMBLY_PROJECTION)])
~~~

After both successful calls, the child reads every byte of both buffers through a volatile-qualified scanner, requires all zero, and emits exact ZERO_ACK. Tests seed the full buffers with a deterministic nonsecret sentinel before inserting ephemeral DER; they require mask `0x03`. A missing/false ACK, optimized-away ordinary memset, absent SDK declaration, missing object symbol/call, unreachable error cleanup, omitted partial-write cleanup, second secret allocation/copy, or DER byte in stdout/stderr/evidence fails.

The parent's one Node `Buffer` carrying PRIVATE_RESPONSE PKCS#8 remains separately instrumented: `Buffer.fill(0)` executes in `finally` after the one `KeyObject` construction on success and every parser/construction error. Tests retain an alias solely inside the test process, verify all zero after cleanup, and forbid the DER bytes from logs/evidence. Child ZERO_ACK never substitutes for the parent wipe.

## 8. Tests, review, and STOP

V7 adds exact capture-first tests/mutants for:

- V_PROVISIONER_UID equality through parent/child/install/activation/cold-start checks and every runtime/legacy owner substitution;
- four live C3.5 writer compositions, dormant-but-present obsctl capability, private non-live watchdog seam, first C0 obsctl composition, and already-called/absent capability mutants;
- every OPEN BIND member, identity order/cap, strict opcode/ordinal, stale/replayed OPEN, and first-command rebinding;
- exact post-startup fd set and CHECK → leaf close → other close → ACK → response EOF → empty stderr → zero exit → parent activation order;
- every domain/preimage/encoding formula, profile-template/runtime-map separation, raw compiler/SDK streams, LP argv, byte-identical output, closed Mach-O projection, build receipt, and activation pins;
- mandatory `memset_s` compile failure without availability, source/object/disassembly call evidence, runtime sentinel/ZERO_ACK, parent Buffer wipe, partial-write/early-error cleanup, and second-copy rejection.

A fresh independent review must bind the exact v7 commit/tree/diff and contain each exact standalone result once:

~~~text
AUTHORITY FIDELITY VERDICT: PASS
SPEC VERDICT: SPEC PASS
PLAN VERDICT: PLAN PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 IMPLEMENTATION AUTHORIZED: NO
~~~

Even a v7 PASS authorizes no implementation. STOP on a v1-v6 byte edit; helper owner other than V_PROVISIONER_UID; C3.5 obsctl call or missing dormant capability; watchdog row-profile exposure; missing OPEN binding; learned/rebound session; noncanonical frame; wrong ordinal; ACK before leaf close or after response close; missing EOF/stderr/exit proof; ambiguous/untagged hash; template/map conflation; unsafe argv encoding; unpinned source/header/compiler/SDK/output/projection/receipt/pin; unavailable or substituted `memset_s`; missing source/object/disassembly/runtime wipe proof; second secret copy; changed parent wipe; any v6/v5 regression; production default; product/migration/role/grant/root/path/bin/raw-DML expansion; live act; or surviving mutant.
