# FIX-10 — inherited wipe-projection digest restoration

**Successor authority packet — 2026-09-07, fix round 7.** This document incorporates `SPEC-v2.md` through `SPEC-v8.md` without changing their bytes. It supersedes only v8's conflicting interpretation of the two inherited wipe-projection outer digests and the inherited disassembly projection's nested instruction digest. Every other v8 inventory, Annex K, deployment, verifier, command, receipt, activation, test, rollback, and STOP correction remains binding, as does every v7 owner, stage, parent/child, six-parent, OPEN, release, gateway, recovery, topology, and privilege rule.

This packet authorizes these successor documents and a fresh independent review only. It authorizes no FIX-09 v13 document or implementation, FIX-10 source/test/package/migration edit, analyzer or native build, Task 0, worktree, live root/key/database/process, activation, acceptance, merge, push, board, or Done act. FIX-10 implementation remains STOP.

## 1. Verified one-finding boundary

The complete round-7 Sol report, SHA-256 `1ac9fad7a2c91647ae02a121eaa7de9f8739382900e0e444bd31dcd353519600`, was independently checked against frozen `SPEC-v7.md` and `SPEC-v8.md`. Its single P1 stands:

- v8 displayed `obs-chain-helper-wipe-object-projection/v1` and `obs-chain-helper-wipe-disassembly-projection/v1`, but frozen v7 binds the same named receipt members under domains without `-projection`;
- v8 also allowed its new artifact-kind/symbol-qualified span digest to occupy frozen v7's `wipe_disassembly_projection.function_instructions_sha256`, whose inherited formula has a different domain and preimage; and
- those disagreements propagate into the analysis, build, helper, activation, and recovery hashes even when raw artifacts are identical.

V9 corrects only that naming/preimage error. It adds no source path, schema field, root, installed leaf, database object, migration, role, grant, public command, raw action DML, signer, production default, or live act.

## 2. Raw spans and distinct digest roles

All v8 bounded Mach-O parsing, symbol-bound, relocation/stub, instruction-decode, data-flow, CFG, exit, and parser/tool-agreement requirements remain exact. After those checks succeed, define:

~~~text
RAW_OBJECT_WIPE_SPAN =
  the exact RAW_OBJECT_BYTES bytes in the admitted
  _fix09_wipe_secret_buffers [start,end) symbol range

RAW_EXECUTABLE_WIPE_SPAN =
  the exact RAW_MACHO_BYTES bytes in the admitted
  _fix09_wipe_secret_buffers [start,end) symbol range

RAW_FUNCTION_INSTRUCTION_BYTES = RAW_EXECUTABLE_WIPE_SPAN
~~~

These are raw artifact bytes, not `nm`/`otool` text, decoded instruction JSON, hexadecimal text, normalized opcodes, a caller-provided projection, or a digest. Function bounds and every byte come from the one v8 verifier's admitted raw inputs and must agree with the fourteen tool captures.

V8's artifact-kind/symbol-qualified span digests remain useful, distinct verifier-output evidence:

~~~text
object_wipe_span_sha256 =
  DH("obs-chain-helper-arm64-function-bytes/v1",
     [UTF8("object"),UTF8("_fix09_wipe_secret_buffers"),
      RAW_OBJECT_WIPE_SPAN])

executable_wipe_span_sha256 =
  DH("obs-chain-helper-arm64-function-bytes/v1",
     [UTF8("executable"),UTF8("_fix09_wipe_secret_buffers"),
      RAW_EXECUTABLE_WIPE_SPAN])
~~~

The existing closed v8 verifier-output structure stores those values only as:

~~~text
WIPE_VERIFIER_OUTPUT.object.wipe_instruction_sha256 =
  object_wipe_span_sha256

WIPE_VERIFIER_OUTPUT.executable.wipe_instruction_sha256 =
  executable_wipe_span_sha256
~~~

They are not aliases for, inputs to, or permitted values of the inherited nested member below. Object and executable session-symbol span evidence may use v8's same artifact-kind/symbol-qualified domain in its own distinct verifier fields; no such value enters an inherited v7 projection member.

## 3. Restored inherited projection materialization

### 3.1 Nested instruction member

The one verifier constructs `WIPE_VERIFIER_OUTPUT.wipe_disassembly_projection` from raw executable facts. Its `function_instructions_sha256` member is populated only by frozen v7's exact formula:

~~~text
function_instructions_sha256 = DH("obs-chain-helper-wipe-instructions/v1",[RAW_FUNCTION_INSTRUCTION_BYTES])
~~~

It must not be populated from or compared by convention with `executable_wipe_span_sha256`, even though both ultimately bind the same executable byte interval; their domains and preimages are intentionally distinct. Each value is computed independently and no equality result can make one an alias for the other.

The remaining inherited wipe-object and wipe-disassembly projection fields, order, types, canonicalization, offsets, calls, predecessor list, and zero bypass count remain exactly v7/v8. No caller supplies either projection object or any nested hash.

### 3.2 Outer projection hashes

After the verifier has independently materialized the complete closed projection objects, every component that computes the inherited values uses exactly these formulas. Future v13 build evidence and FIX-10 Task 0 and Task 4 each perform the computation independently:

~~~text
macho_projection_sha256 =
  DH("obs-chain-helper-macho-projection/v1",
     [J(WIPE_VERIFIER_OUTPUT.macho_projection)])

wipe_object_projection_sha256 =
  DH("obs-chain-helper-wipe-object/v1",[J(WIPE_VERIFIER_OUTPUT.wipe_object_projection)])

wipe_disassembly_projection_sha256 =
  DH("obs-chain-helper-wipe-disassembly/v1",[J(WIPE_VERIFIER_OUTPUT.wipe_disassembly_projection)])
~~~

The two wipe formulas above are the frozen v7 outer formulas restored verbatim over v8's canonical output members. The strings `obs-chain-helper-wipe-object-projection/v1` and `obs-chain-helper-wipe-disassembly-projection/v1` are forbidden production domains and may appear only as named negative-test mutations.

### 3.3 Acyclic computation and replay

The mandatory order is:

1. read and authenticate raw helper source, object, executable, verifier, runtime, and command-stream bytes;
2. derive and cross-check symbol bounds and raw spans;
3. derive the two distinct v8 artifact span digests;
4. compute frozen v7 `function_instructions_sha256` from `RAW_FUNCTION_INSTRUCTION_BYTES` and place it in the disassembly projection;
5. materialize all three canonical inherited projection objects;
6. compute the three outer projection hashes, using the exact formulas above;
7. materialize and hash the canonical verifier output, analysis receipt, build-v3 receipt, helper-v4 pins, and V activation evidence in their inherited order.

No supplied digest, projection, receipt, signature, or cached value may stand in for steps 1-6 in the future v13 build oracle, FIX-10 Task 0, or FIX-10 Task 4. Those three implementations derive from raw admitted bytes without sharing a formula helper. Inherited runtime receipt verification, restart, commit-unknown recovery, and cold start validate the signed receipt/pin chain and installed-binary identity without executing the nonshipping verifier; they neither reinterpret a domain nor substitute a stored value for Task 0's admission proof. All downstream members named `macho_projection_sha256`, `wipe_object_projection_sha256`, or `wipe_disassembly_projection_sha256` must byte-equal the admitted raw-derived results.

## 4. Exact non-circular mutants

The capture harness defines these three exact mutant ids:

~~~text
wrong_wipe_object_projection_outer_domain
wrong_wipe_disassembly_projection_outer_domain
nested_arm64_span_digest_substitution
~~~

For each mutant, begin from independently derived valid raw evidence, alter only the named convention, and then recompute every affected downstream value with ephemeral test keys so a shallow internal-consistency check would accept it. An outer-domain mutant leaves verifier output unchanged and recomputes from the analysis receipt onward; the nested-member mutant recomputes verifier output, analysis, build, helper, activation, signature, and receipt values:

1. `wrong_wipe_object_projection_outer_domain` replaces only the frozen object outer domain with `obs-chain-helper-wipe-object-projection/v1`.
2. `wrong_wipe_disassembly_projection_outer_domain` replaces only the frozen disassembly outer domain with `obs-chain-helper-wipe-disassembly-projection/v1`.
3. `nested_arm64_span_digest_substitution` places `executable_wipe_span_sha256` in `wipe_disassembly_projection.function_instructions_sha256`, then recomputes the correct frozen disassembly outer formula over that wrong nested value.

Task 0 and Task 4 must each reject all three by independently recomputing from raw bytes. Evidence for each id records the baseline raw-input hashes, mutated canonical member bytes, expected and actual digest, first refusal code, zero install/activation/publication, and unchanged unrelated fields. A mutant that fails before reaching its intended comparison, does not change the targeted digest, leaves a stale downstream value, or passes because the oracle copied the candidate formula is invalid evidence.

The three mutants execute as explicit sequential subcases within the existing architecture reporter assertion `rejects_forged_wipe_verifier_output`; they do not create new reporter assertions. V9 appends only `accepts_exact_v9_authority_review` to `tests/unit/fix10-authority-gate.test.ts`. Therefore the same 15 files contain exactly 426 assertions: the 425 exact v8 names plus one v9 authority-gate name.

## 5. Review and STOP

`PLAN-v9.md` must require independent raw-byte recomputation in both Task 0 and Task 4, the exact three mutants above, the unchanged v8 inventory/Annex-K/deployment/verifier controls, the unchanged v7 custody/stage/release controls, three fresh GREEN runs, and a fresh independent review.

That review binds the exact v9 commit/tree/diff and contains each exact standalone line once:

~~~text
AUTHORITY FIDELITY VERDICT: PASS
SPEC VERDICT: SPEC PASS
PLAN VERDICT: PLAN PASS
UNRESOLVED: P0=0 P1=0 P2=0 P3=0
FIX-10 IMPLEMENTATION AUTHORIZED: NO
~~~

Even a v9 PASS authorizes no implementation. STOP on a v1-v8 byte edit; use of either forbidden `-projection` outer domain outside its exact mutant; substitution of either v8 artifact span digest into the inherited nested member; derivation from tool text, supplied/cached projections, or receipts instead of raw bytes; Task-0/Task-4 oracle sharing; any v8 inventory, Annex K, deployment, verifier, command, parser/tool, receipt, activation, or mutant regression; any v7 owner, parent/child, six-parent, stage, OPEN, close/release, gateway, recovery, privilege, topology, rollback, or test regression; product/package/migration/role/grant/root/runtime-path/bin/raw-DML expansion; production default; native/live act; or surviving mutant.
