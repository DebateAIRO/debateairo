# GUIDE_HARNESS_FIX2 evidence

- Node: `GUIDE_HARNESS_FIX2`
- Ticket: `t_21080a13`
- Session: `/root/preview`
- Bound product revision: `c34c64d4e643e404cefe96dfaf167536ae364a94`
- Bound KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Bound executable harness digest: `f8f2935965cd59b893ab02848cd9db17eeb71fa423f5620b61479e6647ae4917`
- Verdict: `PASS_C34_HARNESS_CORRECTION_REBIND_REQUIRED`

The bounded inert frame passed 62/62 controls at clean c34. This proves the two reviewed harness corrections at c34. A separately reported deterministic-policy product correction will advance the product, so this proof is historical once that happens. LIVE must execute the unchanged corrected frame again at the eventual clean product and bind the newly emitted revision, KB version, harness digest, proof path, and proof SHA-256. This node makes no LIVE, checkpoint-readiness, or owner-acceptance claim.

## Finding dispositions

### GH-R1 — actual browser session lifecycle

Corrected in the new FIX2 harness. The capture and inert controls share `session-lifecycle.mjs`. The initial group uses the fresh profile. EN/RO boundaries use the product's selector invalidation. Same-language full/compact boundaries remove only `debateai.support.conversation.v1` and verify it is absent before remount. The first response in each group must increase the create-session count by exactly one and provide a distinct in-memory session identity; the receipt retains only its SHA-256. Later responses in the group must not create another session. Failure is therefore detected at the first affected response rather than after all 54 requests.

Positive controls prove five distinct sessions with sizes 1/14/13/12/14. Discriminating negatives prove that same-origin navigation retains the stored session, reuse fails at the first response, a failed storage removal stops before remount, and an unexpected within-group replacement fails immediately. These controls invoke the same lifecycle tracker and storage-reset helper imported by the capture. The final product verifier also confirms that c34's `Assistant.tsx` matches the independently reviewed immutable hash `5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3`.

### GH-R2 — revision and KB proof binding

Corrected in the new FIX2 harness. The control proof schema is exactly:

```text
schemaVersion,result,revision,kbVersion,harnessSha256,controls,passed,names
```

The proof requires schema 2 and `result=PASS`. Before browser or Support activity, the pre-request verifier compares proof revision with `finalCommit`, proof KB version with `expectedSnapshotVersion` and the loaded corpus, and proof harness digest with a digest recomputed from the eight executable FIX2 harness files. Known-bad successful proofs from a stale revision, wrong KB, or changed harness are rejected.

## Preserved contracts

All 54 canonical prompts and identities are unchanged. The matrix retains 20 approved families, full/compact EN/RO coverage, five groups, 31-second request-start spacing, 42 model rows, deterministic private/injection/recovery branches, current-message-only API use, no retry, exact API/DOM comparison, diagnostic attribution, and the fixed-key runtime-capacity gate. The matrix SHA-256 remains `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae`; the runtime-capacity module SHA-256 remains `54dce2b0e70f8d7bbeedc8c3e9104cc4fcd76f4daab018ef34c09f0422ea5b87`.

The final-gate materialization remains one-time: freeze static fields, wait for supported stack readiness, take one supported status read and one counts-only aggregate, serialize a fresh capacity artifact, then create a new final gate by adding only `runtimeCapacityPath` and `runtimeCapacitySha256`. No sealed gate or limit is mutated.

## Verification

```text
LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_HARNESS_FIX2-controls-final.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX2/verify-guide-harness.mjs /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine c34c64d4e643e404cefe96dfaf167536ae364a94
```

Result: `rc=0`; 62 declared, 62 passed. Log SHA-256: `a604c80cf9e8f359f6801ca8b55473e9f228a451b834fe3053227b730c97febc`.

Executable changes are limited to `capture-public-guide.mjs`, `controls.mjs`, `pre-request-verifier.ts`, `verify-final-branches.ts`, `verify-guide-harness.mjs`, and new `session-lifecycle.mjs`. `README.md` and `gate-contract.json` document the matching lifecycle and proof schemas. `matrix.mjs` and `runtime-capacity.mjs` are byte-identical copies of the sealed predecessor.

No browser, HTTP, database, Support, provider, model, preview-lifecycle, product, KB, Git, service, counter, limit, credential, or private-record action occurred. The heavy lease was released immediately after the inert frame.
