# FIX-10 — canonical inventory binding and reproducible native-wipe admission

**Successor authority packet — 2026-09-07, fix round 6.** This document incorporates `SPEC-v2.md` through `SPEC-v7.md` without changing their bytes. It supersedes only the three clauses identified in §1: the preimage of OPEN's `inventory_sha256`, the feature/deployment contract for `memset_s`, and derivation of the native object/disassembly evidence. Every other v7 frame, owner, stage, close, hash, receipt, parent/child, six-parent, gateway, activation, recovery, topology, test, rollback, and STOP law remains binding.

This packet authorizes these successor documents and fresh independent review only. It authorizes no FIX-09 v13 document or implementation, FIX-10 source/test/package/migration edit, native build or analyzer execution, Task 0, worktree, live root/key/database/process, activation, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified three-finding correction boundary

The complete round-6 Sol report was independently checked against frozen FIX-10 v4/v7 and the selected macOS 26.5 SDK. All three P1 findings stand:

1. v7 put `inventory_sha256` in OPEN BIND without defining its canonical preimage.
2. v7 required `memset_s` but did not request Annex K before header inclusion or reject a deployment target below the symbol's macOS 10.9 availability.
3. v7 authenticated claimed wipe projections without pinning one executable derivation artifact or capturing any `nm`/`otool` command that actually analyzed the object and executable.

The correction adds one future FIX-09-owned, review-only source path, `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs`. It is neither installed under `OBS_CONTROL_DIR` nor exported, packaged, invoked by product/runtime code, or added as a bin. No root, persistent runtime leaf, database object, migration, role, grant, public command, raw action DML, signer, production default, or live act is added.

## 2. Canonical completed-inventory binding

### 2.1 Exact bytes and verification order

`RAW_INVENTORY_INPUT_BYTES` are the bytes read once from the inherited v4 `OBSCTL_CHAIN_SIGNER_INVENTORY_INPUT_FD`. Before any OPEN session or receipt is constructed, the inventory verifier must perform this exact order:

1. require a regular read-only inherited descriptor and the incorporated v3/v4 descriptor metadata, size, no-link-follow, and single-document bounds;
2. uniquely parse one JSON value, rejecting duplicate keys, trailing bytes, a BOM, invalid UTF-8, unsafe numbers, and any non-v4 field, type, order, cardinality, identity, path, authorization, or digest;
3. call the parsed exact closed v4 object, including `custodian_signature_base64`, `COMPLETED_INVENTORY`;
4. compute `COMPLETED_INVENTORY_BYTES = J(COMPLETED_INVENTORY)` and require byte equality with `RAW_INVENTORY_INPUT_BYTES`; the canonical bytes have no LF;
5. remove only `custodian_signature_base64`, compute the incorporated v4 signature preimage, decode one canonical padded 64-byte signature, and verify it with the already verified `chain/custodian-root.spki` key; and
6. recheck that the completed activation/keyring digests, custodian key id, six-slot inventory, principals, paths, authorizations, and generation-one sequence bounds equal current independently admitted authority.

Only bytes that pass all six steps may be named `COMPLETED_INVENTORY_BYTES`. The V signature is therefore inside these bytes. Unsigned inventory bytes, `J(unsigned_inventory)`, input bytes that merely parse to the same value, a reserialized noncanonical input, a raw SHA-256 digest, ASCII hex of a digest, and a digest computed before signature verification are invalid inputs.

Define, using v7's `DH` and `D32` exactly:

~~~text
inventory_sha256 =
  DH("obs-chain-signer-inventory/v1",[COMPLETED_INVENTORY_BYTES])
~~~

OPEN BIND carries `D32(inventory_sha256)`, not `UTF8(inventory_sha256)`. V, the coordinator, and every parent that receives the completed inventory independently recompute the formula. The native child does not receive inventory bytes; it pins the exact OPEN digest, identities, and BIND and rejects any later difference. It never invents or rehashes a convention.

A different valid V signature over byte-identical unsigned fields creates different `COMPLETED_INVENTORY_BYTES` and a different `inventory_sha256`. No old digest may be reused after resigning. Descriptor rewind, restart, commit-unknown recovery, cold start, and later receipt replay re-read and reverify the exact completed bytes and recompute the formula; none trusts a stored digest alone.

### 2.2 Exact nonpersistent receipt and admission oracle

The existing exclusive C3.5/C0 evidence contains this exact closed object; it creates no production path:

~~~json
{
  "schema":"obs-chain-signer-inventory-digest-receipt/v1",
  "inventory_id":"<same canonical lowercase UUID>",
  "completed_inventory_byte_length":"<canonical positive decimal>",
  "inventory_sha256":"<formula result>",
  "activation_manifest_sha256":"<exact completed inventory member>",
  "public_keyring_sha256":"<exact completed inventory member>",
  "custodian_key_id":"<exact completed inventory member>",
  "signature_verified":true,
  "raw_equals_rfc8785":true
}
~~~

~~~text
inventory_digest_receipt_sha256 =
  DH("obs-chain-signer-inventory-digest-receipt/v1",
     [J(INVENTORY_DIGEST_RECEIPT)])
~~~

Task 0 admits the v13 authority only if its receipt oracle independently reconstructs `COMPLETED_INVENTORY_BYTES`, the digest, and the receipt. The v5 readiness challenge still includes `LP(COMPLETED_INVENTORY_BYTES)` and therefore signs the exact completed document without changing the frozen readiness schema. OPEN, the readiness challenge, receipt, recovery, and cold-start evidence must all identify the same bytes and digest.

Mutants must reject noncanonical raw bytes, an unsigned document, ASCII-hex preimage bytes, untagged raw SHA-256, the wrong domain, missing `DH` array count or `LP`, digest reuse after a different valid completed signature, and replay that reads only the receipt.

## 3. Exact Annex K and deployment contract

### 3.1 Source/header ordering

The complete raw helper source must begin at byte zero with exactly these LF-terminated ASCII bytes:

~~~c
#define __STDC_WANT_LIB_EXT1__ 1
~~~

No BOM, comment, whitespace, pragma, directive, token, or generated prefix may precede that line. It precedes every `#include`, including the normal include of `fix09-profile-table.generated.h`; the compiler argv contains no `-include`, `-imacros`, precompiled-header, prefix-header, or other forced preinclude option. Consequently the request is defined before `<string.h>` or any header that can transitively include it.

`__STDC_WANT_LIB_EXT1__` must be defined exactly once with replacement token decimal `1`, never undefined or redefined. The compiler argv contains no `-D__STDC_WANT_LIB_EXT1__`, `-U__STDC_WANT_LIB_EXT1__`, other user-supplied feature-test macro, or `-D`/`-U` spelling that can affect its value. This exact standard feature-test request is permitted; v7's ban on a `memset_s` replacement macro remains. A source or generated header definition, alias, wrapper macro, builtin substitution, weak import, fallback, or dynamic lookup for `memset_s` remains forbidden.

Define:

~~~text
lib_ext1_request_sha256 =
  DH("obs-chain-helper-lib-ext1-request/v1",
     [UTF8("#define __STDC_WANT_LIB_EXT1__ 1\n")])
~~~

The existing `source_sha256`, `generated_header_sha256`, `memset_s_header_sha256`, and `ordered_argv_sha256` independently bind the actual source, generated header, selected SDK declaration, and argv. V13 authority must print the complete raw source/header and ordered argv bytes so a reviewer can prove this ordering rather than accept a Boolean claim.

### 3.2 Canonical deployment floor and equality

`DEPLOYMENT_TARGET` is a required V-later string with no default. It has exactly `MAJOR.MINOR`, each component canonical unsigned decimal without a leading zero, and satisfies `(MAJOR > 10) OR (MAJOR = 10 AND MINOR >= 9)`. Define:

~~~text
TARGET_TRIPLE   = "arm64-apple-macosx" || DEPLOYMENT_TARGET
DEPLOYMENT_FLAG = "-mmacosx-version-min=" || DEPLOYMENT_TARGET
TARGET_VERSION  = (MAJOR,MINOR,0)
~~~

The normalized compiler argv contains exactly one adjacent `-target`, `TARGET_TRIPLE` pair and exactly one `DEPLOYMENT_FLAG`; it contains no environment-derived or competing minimum-version option. The build environment does not contain `MACOSX_DEPLOYMENT_TARGET`. Both the MH_OBJECT and MH_EXECUTE inputs are thin little-endian ARM64. The executable has exactly one `LC_BUILD_VERSION` for platform macOS whose encoded `minos` tuple equals `TARGET_VERSION`. V7's Mach-O projection formats that tuple as the exact `DEPLOYMENT_TARGET`, so its `minos` string must equal the V input and both argv spellings.

Define the exact closed object and digest:

~~~json
{
  "schema":"obs-chain-helper-deployment-contract/v1",
  "architecture":"arm64",
  "deployment_target":"<canonical MAJOR.MINOR at least 10.9>",
  "target_triple":"arm64-apple-macosx<same target>",
  "deployment_flag":"-mmacosx-version-min=<same target>",
  "macho_platform":"macos",
  "macho_minos":"<same target>",
  "memset_s_first_macos":"10.9"
}
~~~

~~~text
deployment_contract_sha256 =
  DH("obs-chain-helper-deployment-contract/v1",
     [J(DEPLOYMENT_CONTRACT)])
~~~

An unset, noncanonical, or pre-10.9 value; missing/late/zero/conflicting Annex K request; target-triple/flag disagreement; competing deployment input; non-arm64 object/executable; absent/duplicate/non-macOS `LC_BUILD_VERSION`; or encoded/projected `minos` inequality refuses before installation or activation.

## 4. One pinned native-wipe verifier

### 4.1 Sole artifact and execution boundary

Future FIX-09 v13 owns exactly one review-only analyzer source:

~~~text
packages/obs-capture/scripts/verify-fix09-native-wipe.mjs
~~~

It is a tracked regular nonsymlink repository file, Git mode `100644`, LF-terminated, with no generated companion, plug-in, configuration, downloaded module, native add-on, network access, package bin/export, install hook, or production copy. It imports only `node:fs`, `node:crypto`, and `node:buffer`. The complete admitted raw bytes implement the source, Mach-O, ARM64, relocation/stub, data-flow, and CFG rules below. No second parser or extractor is authoritative.

~~~text
wipe_verifier_source_sha256 =
  DH("obs-chain-helper-wipe-verifier-source/v1",
     [UTF8("packages/obs-capture/scripts/verify-fix09-native-wipe.mjs"),
      RAW_WIPE_VERIFIER_SOURCE])
~~~

`NODE_PATH` is a required V-selected absolute Node.js 22 executable with no default. V13 captures `[NODE_PATH,"--version"]` with empty environment, cwd `/`, exact exit 0, and raw stdout/stderr under §4.4's capture law. Define:

~~~text
wipe_verifier_runtime_sha256 =
  DH("obs-chain-helper-wipe-verifier-runtime/v1",
     [ARGV([NODE_PATH,"--version"]),U32(0),LP(RAW_STDOUT),LP(RAW_STDERR)])
~~~

The launcher opens the reviewed verifier no-follow, checks its repository bytes/hash, rewinds that same descriptor, and supplies it as stdin to `[NODE_PATH,"--disable-proto=throw","--input-type=module"]`. The §4.2 input is a separate inherited read-only fd 3 that the module reads to EOF. Environment is empty, cwd is `/`, stdout/stderr are exclusive captures, and no network descriptor is inherited. Source descriptor metadata/hash are rechecked after exit. Node therefore parses the opened `.mjs` bytes as ESM without reopening a pathname; pathname execution is forbidden.

### 4.2 Deterministic byte input and output

The exact closed input manifest is:

~~~json
{
  "schema":"obs-chain-helper-wipe-verifier-input/v1",
  "architecture":"arm64",
  "endianness":"little",
  "source_sha256":"<exact helper source digest>",
  "source_byte_length":"<canonical positive decimal>",
  "object_output_sha256":"<v7 domain-separated object hash>",
  "object_byte_length":"<canonical positive decimal>",
  "build_output_sha256":"<v7 domain-separated executable hash>",
  "macho_byte_length":"<canonical positive decimal>",
  "deployment_contract_sha256":"<v8 deployment digest>",
  "wipe_verifier_source_sha256":"<exact verifier source digest>",
  "wipe_verifier_runtime_sha256":"<exact Node runtime digest>",
  "artifact_command_set_sha256":"<exact command-set digest>",
  "command_stream_byte_length":"<canonical positive decimal>",
  "session_symbol":"_fix09_run_session",
  "wipe_symbol":"_fix09_wipe_secret_buffers",
  "zero_scan_symbol":"_fix09_scan_secret_buffers_zero",
  "memset_s_symbol":"_memset_s",
  "secret_buffers":[{"name":"key_read_buffer","capacity":"256"},{"name":"key_frame_buffer","capacity":"768"}],
  "cleanup_predecessors":["success","partial_write","read_error","protocol_error","early_error"]
}
~~~

~~~text
WIPE_VERIFIER_INPUT_BYTES =
  ASCII("F10WIPE8") ||
  U32(byte_length(J(WIPE_VERIFIER_INPUT_MANIFEST))) ||
  J(WIPE_VERIFIER_INPUT_MANIFEST) ||
  U64(byte_length(RAW_SOURCE)) || RAW_SOURCE ||
  U64(byte_length(RAW_OBJECT_BYTES)) || RAW_OBJECT_BYTES ||
  U64(byte_length(RAW_MACHO_BYTES)) || RAW_MACHO_BYTES ||
  ARTIFACT_COMMAND_STREAM_BYTES

wipe_verifier_input_sha256 =
  DH("obs-chain-helper-wipe-verifier-input/v1",
     [WIPE_VERIFIER_INPUT_BYTES])
~~~

`ARTIFACT_COMMAND_STREAM_BYTES` is defined in §4.4 after the exact command order; it contains the captured raw stdout/stderr pairs and no receipt JSON. The verifier reads fd 3 to EOF with a hard cap equal to the three declared positive lengths, the fourteen declared stream lengths, and framing; it rejects any mismatch/trailing byte and never writes artifact/source bytes. Success is exit 0, empty stderr, and stdout equal to `J(WIPE_VERIFIER_OUTPUT)` with no LF. Failure is nonzero, empty stdout, and stderr equal to `J({schema:"obs-chain-helper-wipe-verifier-error/v1",code,phase})` with no LF, where `code` and `phase` are nonempty uppercase ASCII tokens and contain no source/artifact byte. A signal, extra stream byte, malformed/noncanonical output, or output whose input/source/runtime/command-set hash differs is failure.

### 4.3 Exact object/executable derivation

The verifier implements and its reviewed bytes pin this deterministic algorithm:

1. Parse only bounded thin 64-bit little-endian Mach-O. Require object `MH_OBJECT`, executable `MH_EXECUTE`, `CPU_TYPE_ARM64`, no archive/fat/bitcode input, nonoverlapping in-bounds headers/commands/sections/symbol/string/relocation/indirect-symbol data, and the v8 deployment equality.
2. Resolve each required defined function from one exact `nlist_64` symbol. Its start is its section-relative value. For MH_OBJECT its exclusive end is the next greater defined function symbol in the same section or section end, whichever comes first. For MH_EXECUTE the next `LC_FUNCTION_STARTS` ULEB128 address must equal the same end derived from the next defined function symbol or section end. Reject absent, duplicate, zero, unaligned, overlapping, out-of-section, alias, disagreeing function-start table, or truncated bounds. Hash the exact `[start,end)` bytes under `DH("obs-chain-helper-arm64-function-bytes/v1",[UTF8(artifact_kind),UTF8(symbol),RAW_SPAN])`.
3. Decode every four-byte word in the required spans as little-endian ARM64. Admit only the exact instruction classes implemented by the pinned verifier. Reject an undecoded word, instruction crossing a bound, branch target outside a function except a resolved call, indirect branch/call, exception instruction, or fallthrough past a bound. Split blocks at entry, branch targets, post-branch fallthrough, calls, and returns; traverse in increasing offset order.
4. In the object, resolve each `BL` relocation only from an in-bounds `ARM64_RELOC_BRANCH26` record at that instruction offset to its exact symbol-table entry. In the executable, decode the `BL` target; a target outside a defined function must be one exact `__stubs` entry whose LC_DYSYMTAB indirect-symbol index resolves to the same symbol. Reject scattered/pair/unknown relocations, addends, ambiguous symbols/stubs, lazy-pointer inference, unresolved targets, or tool-only guesses.
5. Require `_fix09_wipe_secret_buffers` reachable from `_fix09_run_session`. In both object and executable its CFG has exactly two reachable `BL` sites targeting `_memset_s`, in increasing offset order, and no other reachable direct or indirect call can implement a secret wipe. The object relocations and executable stubs must identify the same two call ordinals.
6. Perform forward fixed-point ARM64 register/stack interval analysis from `_fix09_run_session`: model SP/FP-relative address formation, moves, constant loads, bounded loads/stores, comparisons, admitted conditional/direct branches, and the exact AArch64 calling convention. Reject join disagreement or an unmodeled instruction touching SP, FP, x0-x3, a secret-derived register, or condition flow. Identify exactly two disjoint stack intervals of 256 and 768 bytes passed as the read buffer and private-frame buffer. Taint bytes returned by the one private read and every derived byte; reject a tainted store or call argument outside those intervals, except the one frame write and the two admitted `memset_s` calls.
7. Require five unique reachable predecessor marker blocks, named and ordered exactly as the manifest, entering one cleanup region. After the last possible secret use, the wipe call and `_fix09_scan_secret_buffers_zero` must postdominate every predecessor and every secret-producing block and dominate every reachable normal return. There is exactly one reachable normal return; no reachable call to `exit`, `_exit`, `abort`, trap, tail-call exit, or unclassified terminating edge exists. Classify every CFG edge into the cleanup region by its exact predecessor token and reject an edge or return not classified once.
8. In `_fix09_wipe_secret_buffers`, prove the two `memset_s` argument tuples are respectively `(read_interval,256,0,256)` and `(frame_interval,768,0,768)`, both return values are tested for zero, and no path bypasses the second call or its checks. In `_fix09_scan_secret_buffers_zero`, prove volatile loads cover every byte in both intervals before ZERO_ACK can be emitted.

The same algorithm derives the inherited v7 Mach-O, wipe-object, and wipe-disassembly projections; those JSON values are not accepted as input. Claiming the expected projection cannot make it true.

~~~text
macho_projection_sha256 =
  DH("obs-chain-helper-macho-projection/v1",
     [J(WIPE_VERIFIER_OUTPUT.macho_projection)])
wipe_object_projection_sha256 =
  DH("obs-chain-helper-wipe-object-projection/v1",
     [J(WIPE_VERIFIER_OUTPUT.wipe_object_projection)])
wipe_disassembly_projection_sha256 =
  DH("obs-chain-helper-wipe-disassembly-projection/v1",
     [J(WIPE_VERIFIER_OUTPUT.wipe_disassembly_projection)])
~~~

The exact success output is this closed object; numeric addresses/sizes/offsets/counts are canonical lowercase hexadecimal without `0x`, except decimal buffer capacities and counts already fixed below:

~~~json
{
  "schema":"obs-chain-helper-wipe-verifier-output/v1",
  "verifier_source_sha256":"<exact verifier source digest>",
  "verifier_runtime_sha256":"<exact Node runtime digest>",
  "input_sha256":"<exact framed input digest>",
  "source_sha256":"<exact helper source digest>",
  "object_output_sha256":"<exact object digest>",
  "build_output_sha256":"<exact executable digest>",
  "deployment_contract_sha256":"<exact v8 deployment digest>",
  "artifact_command_set_sha256":"<exact command-set digest>",
  "object":{"filetype":"mh_object","architecture":"arm64","session_bounds":{"start":"<hex>","end":"<hex>"},"wipe_bounds":{"start":"<hex>","end":"<hex>"},"wipe_instruction_sha256":"<function-span digest>","memset_s_calls":[{"offset":"<hex>","relocation":"arm64_reloc_branch26","target":"_memset_s"},{"offset":"<greater hex>","relocation":"arm64_reloc_branch26","target":"_memset_s"}]},
  "executable":{"filetype":"mh_execute","architecture":"arm64","minos":"<exact deployment target>","session_bounds":{"start":"<hex>","end":"<hex>"},"wipe_bounds":{"start":"<hex>","end":"<hex>"},"wipe_instruction_sha256":"<function-span digest>","memset_s_calls":[{"offset":"<hex>","stub_offset":"<hex>","target":"_memset_s"},{"offset":"<greater hex>","stub_offset":"<same or exact second hex>","target":"_memset_s"}]},
  "macho_projection":{"schema":"obs-chain-helper-macho/v1","cputype":"arm64","cpusubtype":"<lowercase ASCII>","filetype":"mh_execute","flags":["<sorted lowercase ASCII>"],"minos":"<exact deployment target>","sdk":"<selected SDK version>","load_commands":[{"ordinal":"<decimal>","cmd":"<lowercase ASCII>","cmdsize":"<decimal>","name":"<exact UTF-8 or null>"}],"external_dependencies":["/usr/lib/libSystem.B.dylib"],"undefined_symbols":["<unique sorted symbols>"]},
  "wipe_object_projection":{"schema":"obs-chain-helper-wipe-object/v1","object_output_sha256":"<exact object digest>","memset_s_undefined_symbol":"_memset_s","memset_s_undefined_symbol_count":"1","secret_allocations":[{"name":"key_read_buffer","capacity":"256"},{"name":"key_frame_buffer","capacity":"768"}],"direct_calls":[{"caller":"_fix09_wipe_secret_buffers","ordinal":"1","callee":"_memset_s"},{"caller":"_fix09_wipe_secret_buffers","ordinal":"2","callee":"_memset_s"}],"ordinary_memset_secret_calls":"0","fallback_symbols":[]},
  "wipe_disassembly_projection":{"schema":"obs-chain-helper-wipe-disassembly/v1","build_output_sha256":"<exact executable digest>","function":"_fix09_wipe_secret_buffers","function_instructions_sha256":"<function-span digest>","memset_s_call_offsets":["<hex>","<greater hex>"],"memset_s_call_targets":["_memset_s","_memset_s"],"cleanup_predecessors":["success","partial_write","read_error","protocol_error","early_error"],"exit_without_cleanup_paths":"0"},
  "secret_buffers":[{"name":"key_read_buffer","capacity":"256","stack_start":"<hex>","stack_end":"<hex>"},{"name":"key_frame_buffer","capacity":"768","stack_start":"<hex>","stack_end":"<hex>"}],
  "cleanup_cfg":{"schema":"obs-chain-helper-cleanup-cfg/v1","blocks":[{"start":"<hex>","end":"<hex>","successors":["<ascending hex>"],"predecessor_class":"<one exact token or null>","secret_state":"<none|live|wiped|verified_zero>"}],"edges":[{"from":"<hex>","to":"<hex>","kind":"<fallthrough|branch_false|branch_true|call_return>"}],"secret_intervals":[{"name":"key_read_buffer","start":"<hex>","end":"<hex>","capacity":"256"},{"name":"key_frame_buffer","start":"<hex>","end":"<hex>","capacity":"768"}],"exits":[{"offset":"<hex>","kind":"return","classified_predecessors":["early_error","partial_write","protocol_error","read_error","success"],"wipe_call_offset":"<hex>","zero_scan_call_offset":"<hex>"}]},
  "cleanup_cfg_sha256":"<domain-separated canonical CFG digest>",
  "cleanup_predecessors":["success","partial_write","read_error","protocol_error","early_error"],
  "reachable_exits":[{"offset":"<hex>","kind":"return","predecessors":["early_error","partial_write","protocol_error","read_error","success"],"wipe_call_offset":"<hex>","zero_scan_call_offset":"<hex>"}],
  "exit_without_cleanup_paths":"0",
  "memset_s_call_count":"2",
  "secret_buffer_count":"2"
}
~~~

Within `cleanup_cfg`, blocks are sorted by start; successor lists and edges are sorted by numeric `(from,to,kind)`; intervals use manifest order; and exits are sorted by offset. The three full inherited projection objects are canonical output members, never caller inputs; their hashes use the incorporated v7 domains. `cleanup_cfg_sha256 = DH("obs-chain-helper-cleanup-cfg/v1",[J(WIPE_VERIFIER_OUTPUT.cleanup_cfg)])`. Define:

~~~text
wipe_verifier_output_sha256 =
  DH("obs-chain-helper-wipe-verifier-output/v1",
     [J(WIPE_VERIFIER_OUTPUT)])
~~~

### 4.4 Direct artifact-command capture and agreement

Every command uses empty environment, cwd `/`, stdin `/dev/null`, direct exec without a shell, exclusive stdout/stderr files, and exact exit 0. For artifact commands only, fd 3 is an opened read-only no-follow regular file whose before/after metadata and domain hash equal `RAW_OBJECT_BYTES` or `RAW_MACHO_BYTES`; argv uses stable `/dev/fd/3`. Other inherited fds are closed.

The exact ordered command set is:

~~~text
find_otool             ["/usr/bin/xcrun","--sdk","macosx","--find","otool"]
otool_version          [OTOOL_PATH,"--version"]
find_nm                ["/usr/bin/xcrun","--sdk","macosx","--find","nm"]
nm_version             [NM_PATH,"--version"]
object_nm              [NM_PATH,"--arch=arm64","--format=posix","--numeric-sort","--print-size","/dev/fd/3"]
object_relocations     [OTOOL_PATH,"-arch","arm64","-r","/dev/fd/3"]
object_wipe_disasm     [OTOOL_PATH,"-arch","arm64","-t","-v","-V","-j","-p","_fix09_wipe_secret_buffers","/dev/fd/3"]
object_session_disasm  [OTOOL_PATH,"-arch","arm64","-t","-v","-V","-j","-p","_fix09_run_session","/dev/fd/3"]
executable_nm          [NM_PATH,"--arch=arm64","--format=posix","--numeric-sort","--print-size","/dev/fd/3"]
executable_loads       [OTOOL_PATH,"-arch","arm64","-l","/dev/fd/3"]
executable_libraries   [OTOOL_PATH,"-arch","arm64","-L","/dev/fd/3"]
executable_indirect    [OTOOL_PATH,"-arch","arm64","-I","/dev/fd/3"]
executable_wipe_disasm [OTOOL_PATH,"-arch","arm64","-t","-v","-V","-j","-p","_fix09_wipe_secret_buffers","/dev/fd/3"]
executable_session_disasm [OTOOL_PATH,"-arch","arm64","-t","-v","-V","-j","-p","_fix09_run_session","/dev/fd/3"]
~~~

`NM_PATH` and `OTOOL_PATH` are the exact absolute LF-stripped outputs of their find commands; find stderr is empty and the unstripped raw stdout is exactly `UTF8(PATH) || 0x0a`. Version stdout/stderr are retained raw. For each label `L`, define:

~~~text
tool_stdout_sha256(L) =
  DH("obs-chain-helper-artifact-command-stdout/v1",[UTF8(L),RAW_STDOUT])

tool_stderr_sha256(L) =
  DH("obs-chain-helper-artifact-command-stderr/v1",[UTF8(L),RAW_STDERR])

tool_command_sha256(L) =
  DH("obs-chain-helper-artifact-command/v1",
     [UTF8(L),ARGV(EXACT_ARGV),U32(0),
      D32(tool_stdout_sha256(L)),D32(tool_stderr_sha256(L)),
      UTF8(ARTIFACT_KIND_OR_NONE),D32(ARTIFACT_HASH_OR_ZERO_HEX)])
~~~

`ARTIFACT_KIND_OR_NONE` is exactly `none`, `object`, or `executable`. `ARTIFACT_HASH_OR_ZERO_HEX` is the applicable 64-lowercase-hex domain digest or exactly 64 ASCII zero characters for a non-artifact record; `D32` then contributes its 32 decoded bytes. Define the closed ordered set and digest:

~~~json
{"schema":"obs-chain-helper-artifact-command-set/v1","records":[{"label":"<exact ordered label>","argv":["<exact members>"],"exit_code":"0","stdout_bytes":"<canonical decimal>","stdout_sha256":"<domain digest>","stderr_bytes":"<canonical decimal>","stderr_sha256":"<domain digest>","artifact_kind":"<none|object|executable>","artifact_sha256":"<domain digest or 64 lowercase zeroes>","command_sha256":"<domain digest>"}]}
~~~

~~~text
artifact_command_set_sha256 =
  DH("obs-chain-helper-artifact-command-set/v1",
     [J(ARTIFACT_COMMAND_SET)])

ARTIFACT_COMMAND_STREAM_BYTES =
  CONCAT(each record in displayed order,
         U64(byte_length(record.RAW_STDOUT)) || record.RAW_STDOUT ||
         U64(byte_length(record.RAW_STDERR)) || record.RAW_STDERR)
~~~

The sole verifier parses the raw command streams with pinned grammars. It requires exact agreement for symbol/function bounds and sizes, relocation offsets/types/targets, instruction byte columns and spans, call offsets/targets, indirect stub resolution, ARM64/filetype, `LC_BUILD_VERSION`/minos, dependency list, and undefined symbols. Tool output never overrides byte parsing. A missing command/stream, forged verifier JSON, substituted verifier bytes/runtime, truncated function range, unresolved relocation/stub, altered artifact fd, parser/tool disagreement, or claim-only projection fails.

### 4.5 Closed analysis receipt and activation binding

The exact analysis receipt is:

~~~json
{
  "schema":"obs-chain-helper-artifact-analysis/v1",
  "wipe_verifier_source_sha256":"<exact source digest>",
  "wipe_verifier_runtime_sha256":"<exact runtime digest>",
  "wipe_verifier_input_sha256":"<exact input digest>",
  "wipe_verifier_output_sha256":"<exact output digest>",
  "artifact_command_set_sha256":"<exact command-set digest>",
  "macho_projection_sha256":"<verifier-derived v7 digest>",
  "wipe_object_projection_sha256":"<verifier-derived v7 digest>",
  "wipe_disassembly_projection_sha256":"<verifier-derived v7 digest>",
  "verifier_tool_agreement":true
}
~~~

~~~text
artifact_analysis_receipt_sha256 =
  DH("obs-chain-helper-artifact-analysis/v1",
     [J(ARTIFACT_ANALYSIS_RECEIPT)])
~~~

V8 replaces v7's ambiguous build-v2/parser fields with this exact closed build receipt:

~~~json
{
  "schema":"obs-chain-private-key-helper-build/v3",
  "source_sha256":"<64 lowercase hex>",
  "profile_template_sha256":"<64 lowercase hex>",
  "generated_header_sha256":"<64 lowercase hex>",
  "lib_ext1_request_sha256":"<64 lowercase hex>",
  "compiler_path":"<required absolute V-selected Xcode clang path>",
  "compiler_identity_sha256":"<64 lowercase hex>",
  "sdk_path":"<required absolute V-selected macOS SDK path>",
  "sdk_identity_sha256":"<64 lowercase hex>",
  "memset_s_header_sha256":"<64 lowercase hex>",
  "target_triple":"<exact TARGET_TRIPLE>",
  "deployment_target":"<exact DEPLOYMENT_TARGET>",
  "deployment_contract_sha256":"<64 lowercase hex>",
  "ordered_argv_sha256":"<64 lowercase hex>",
  "build_input_sha256":"<64 lowercase hex>",
  "build_one_output_sha256":"<64 lowercase hex>",
  "build_two_output_sha256":"<same 64 lowercase hex>",
  "object_output_sha256":"<identical-build object hash>",
  "macho_tool_identity_sha256":"<64 lowercase hex>",
  "wipe_verifier_source_sha256":"<64 lowercase hex>",
  "wipe_verifier_runtime_sha256":"<64 lowercase hex>",
  "wipe_verifier_input_sha256":"<64 lowercase hex>",
  "wipe_verifier_output_sha256":"<64 lowercase hex>",
  "artifact_command_set_sha256":"<64 lowercase hex>",
  "macho_projection_sha256":"<64 lowercase hex>",
  "wipe_object_projection_sha256":"<64 lowercase hex>",
  "wipe_disassembly_projection_sha256":"<64 lowercase hex>",
  "artifact_analysis_receipt_sha256":"<64 lowercase hex>",
  "external_dependencies":["/usr/lib/libSystem.B.dylib"]
}
~~~

`build_receipt_sha256 = DH("obs-chain-helper-build-receipt/v3",[J(BUILD_RECEIPT)])`. The v7 `macho_parser_source_sha256` field is absent: the one verifier source replaces it. `macho_tool_identity_sha256` retains v7's formula over the four raw find/version captures, while the command-set and analysis-receipt hashes bind all fourteen captures and their agreement.

The completed helper activation value is this exact closed object before its final digest:

~~~json
{
  "schema":"obs-chain-private-key-helper/v4",
  "relative_path":"chain/fix09-openat-read",
  "source_path":"packages/obs-capture/native/fix09-openat-read.c",
  "source_sha256":"<build receipt source hash>",
  "profile_table_sha256":"<build receipt template hash>",
  "generated_header_sha256":"<build receipt generated-header hash>",
  "profile_map_sha256":"<runtime map hash>",
  "lib_ext1_request_sha256":"<build receipt request hash>",
  "deployment_contract_sha256":"<build receipt deployment hash>",
  "build_input_sha256":"<build receipt input hash>",
  "build_receipt_sha256":"<completed build-v3 receipt hash>",
  "installed_binary_sha256":"<build output hash>",
  "installed_binary_size":"<positive decimal>",
  "memset_s_header_sha256":"<build receipt memset_s header hash>",
  "wipe_verifier_source_sha256":"<build receipt verifier source hash>",
  "artifact_analysis_receipt_sha256":"<build receipt analysis hash>",
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

`activation_pins_sha256 = DH("obs-chain-helper-activation-pins/v1",[J(HELPER_PINS)])`; the completed `private_key_helper` object is HELPER_PINS plus that final field. The V activation signature therefore binds the macro request, deployment floor/equality, one verifier's complete bytes/runtime/input/output, every direct artifact command stream, parser/tool agreement, and derived projections without adding a database field or runtime file.

## 5. Tests, review, and STOP

V8 adds capture-first exact oracles/mutants for:

- verified `COMPLETED_INVENTORY_BYTES = J(COMPLETED_INVENTORY)` including the V signature; exact `inventory_sha256`; OPEN/readiness/receipt/restart/cold-start identity; and noncanonical, unsigned, hex-text, raw-untagged, wrong-domain, missing-frame, resigned-document, or receipt-only replay rejection;
- byte-zero literal Annex K request before all includes; no competing feature macro or forced include; selected header guard; macOS 10.9 floor; exact target triple/deployment flag/Mach-O minos equality; and missing/late/zero/conflict/old-target/disagreement rejection; and
- exact verifier source/runtime/input/output hashes; ARM64 object/executable bounds/spans/relocations/stubs/two calls/buffers/CFG/exits; fourteen direct tool captures and agreement; closed receipt/activation binding; and forged output, substituted extractor, truncated range, unresolved relocation, missing command, changed artifact, or disagreement rejection.

All 402 v7 names remain exact. V8 appends one authority-gate name, nine signer-readiness names, and thirteen architecture names for exactly 425 assertions across the same 15 files. `PLAN-v8.md` pins their exact names/order and capture steps.

A fresh independent review must bind the exact v8 commit/tree/diff and contain each exact standalone result once:

~~~text
AUTHORITY FIDELITY VERDICT: PASS
SPEC VERDICT: SPEC PASS
PLAN VERDICT: PLAN PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 IMPLEMENTATION AUTHORIZED: NO
~~~

Even a v8 PASS authorizes no implementation. STOP on a v1-v7 byte edit; any v7 regression; inventory bytes not exact verified completed J including the V signature; alternate inventory digest/preimage/replay; absent/late/conflicting Annex K request; feature-test injection; deployment below 10.9; target/flag/minos inequality; second or substituted verifier; noncanonical input/output; unbounded/unknown ARM64 parse; ambiguous symbol range/relocation/stub/CFG/exit; other than exactly two reachable `memset_s` calls; missing raw artifact command capture; parser/tool disagreement; claim-only receipt; receipt/activation omission; production default; product/migration/role/grant/root/runtime-path/bin/raw-DML expansion; native/live act; or surviving mutant.
