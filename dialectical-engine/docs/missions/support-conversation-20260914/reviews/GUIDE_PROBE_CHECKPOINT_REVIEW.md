# GUIDE_PROBE_CHECKPOINT_REVIEW — checkpoint persistence repair review

- Ticket: `t_4b4b2ef8`; run `200`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T16:12:29.076779Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `fe554186fc82d97058e05da0ed63eb938d10cc4e`
- Verdict: **PASS_BOUNDED_CHECKPOINT_REPAIR**

## Exact PROBE4 regression

PROBE4 reached its first checkpoint and failed because the BIND15 probe's inline closure referenced `EVIDENCE_ROOT`, which was no longer bound after argument validation moved to shared controls. The outer catch called the same broken checkpoint, so the required output remained absent. The preserved child exited 1 with `ReferenceError: EVIDENCE_ROOT is not defined` at the initial checkpoint and again at the catch checkpoint.

No transition or blocked-attempt counts were persisted. They remain unknown and cannot be reconstructed. The installed route handler was written to abort classified Support requests before forwarding, but that source invariant is not per-request evidence for PROBE4. This review does not relabel unavailable counts as zero. REVIEW15's syntax and argument evidence remains valid but did not execute checkpoint persistence, so its operational completeness is qualified.

## Minimal append-only delta

The PROBE5 variant changes only four dependency-wiring details relative to immutable BIND15:

1. the controls import moves to `../GUIDE_HARNESS_BIND15/controls.mjs` because the probe lives in a sibling directory;
2. the exact mission evidence-root constant is restored;
3. `createGuideProbeCheckpoint` is imported from the local checkpoint writer;
4. the broken inline closure is replaced with that writer, receiving `mkdir`, `writeFile`, evidence root, guard-validated output path, and `readResult: () => result` explicitly.

The source delta is `cf85b16ab7d1818d901f91fc3397ac02352308ab09c3763e17cae904aa6ad73b`. From profile creation through the finalizer, the fixed probe is byte-identical to BIND15. Readiness, transition order, no-traffic routing, observations, oracles, failure mapping and cleanup behavior are unchanged.

Every relocated dependency resolves: filesystem functions, `tmpdir`, `resolve`, pinned Playwright import, LIVE_P3 console classifier, BIND15 controls and checkpoint writer. `EVIDENCE_ROOT`, `outputPath` and `result` are bound before writer construction. The existing finalizer's `context.close()` and recursive profile removal retain their imports and bindings. This supplemental correction does not broaden the pre-existing operational cleanup design.

## Production checkpoint proof

The regression is effectful only against owned stubs. It extracts the actual inline checkpoint source from the failed BIND15 probe with its real lexical names and runs it in a child. Without an `EVIDENCE_ROOT` binding, that child exits 1 with the reproduced ReferenceError. It does not substitute a hand-written approximation of the failed closure.

The fixed child imports the exact `checkpoint-writer.mjs` used by PROBE5. With stubbed directory and file operations it proves:

- the first call creates the evidence directory and writes the validated destination with `{ flag: "wx", mode: 0600 }`;
- the second and third calls update the same destination without exclusive-create options;
- each call serializes the current `readResult()` value rather than a captured stale object;
- the third call persists `FAIL_ZERO_SUPPORT_UI_TRANSITIONS` and the fixed failure code;
- all three directory and write calls remain inside the owned stub evidence path.

`created` changes only after `writeFile` resolves, so a failed first write does not silently convert a retry into an overwrite. The production writer has no hidden `EVIDENCE_ROOT`; all five dependencies are explicit. The fixed child exits 0. Three syntax files and the checkpoint proof were already sealed by the author; this review did not repeat them.

## Preserved bindings

The new probe imports the exact unchanged BIND15 controls, SHA-256 `20adde062fd0f7f478f8bf235e9c1be3a541f5f9bb2a5d421f1d6921d76397b7`. The independently recomputed BIND15 ordered-eight digest remains `b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4`. Capture, matrix54, pre-request verifier, runtime capacity, lifecycle, final branches and harness verifier bytes are unchanged. The sealed proof remains 130/130, adapter negatives remain 3/3, and the actual capture namespace remains `GUIDE_LIVE_GUIDE15`.

A whole-harness rebind is unnecessary. The supplemental contract supersedes only the future probe script, destination and prerequisite. Contract SHA-256 is `a6000967793737e33a3dabe3361e578defb0af7f1df51a985275607d6cc6b638`.

## PROBE5 contract

Exact command from the product checkout:

```sh
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_PROBE_CHECKPOINT_FIX/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE5.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE5-LIVE8.log 2>&1
```

The shared actual guard accepts this revision/output pair and rejects the old PROBE2 basename, wrong root, extra argument and malformed revision: 5/5. Script, cwd, revision, output and direct log agree between the source, contract and proof. The pinned browser executable exists. The unique output and log are absent; PROBE5 was not executed.

All 79 REVIEW inputs matched their frozen hashes and byte counts. The author receipt contains 12 artifacts and its input list contains 64 files.

## Limits

The stub-I/O result proves checkpoint persistence only. It does not prove browser launch, five transitions, route interception, composer usability, Support/model behavior, capacity or product testability. PROBE5 must independently pass all five transitions before LIVE8. No browser, runtime, HTTP, DB, Support/model, status, capacity, product, KB, Git or harness action ran in this review. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 remains gated. No readiness or acceptance is claimed.
