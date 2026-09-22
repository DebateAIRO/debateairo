# GUIDE_HARNESS_REVIEW

- Node: `GUIDE_HARNESS_REVIEW`
- Ticket: `t_558033fb`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Agent path: `/root/baseline`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-17T13:21:59Z`
- Immutable product revision: `8fb8e407b350f9950cdb27a0f4caaf8e178d7cb6`
- Source revision retained: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Review mode: `immutableGitObjects`
- Verdict: **REWORK**

This verdict is limited to the finite public-guide live harness. It is not a product implementation, live-preview, checkpoint-readiness, or owner-acceptance verdict. No browser, HTTP, database, Support, model, preview, product, Git, or heavy action occurred.

## Blocking findings

### GH-R1 — the declarative five-session schedule is not realized by the browser driver

The matrix correctly declares five groups of `1, 14, 13, 12, 14` rows, but `capture-public-guide.mjs` changes groups by navigating the same origin and reopening the surface. `openMode` resets only the local diagnostic `sessionGate`; it does not start a new Support conversation or clear the persisted browser conversation. The exact product `Assistant.tsx` stores `language`, `session`, and `messages` in `sessionStorage`, restores them on the next mount, and reuses a restored session when its identity binding still matches. Only an EN/RO selector change clears the active Support session.

Under the frozen driver and product bytes, the expected schedule therefore collapses to three actual Support sessions:

| Actual Support session | Declared groups consumed | Messages |
|---|---|---:|
| 1 | lifecycle `full-en` | 1 |
| 2 | `full-ro` plus `compact-ro` | 27 |
| 3 | `full-en` plus `compact-en` | 26 |

The special `Pricing` EN → `Account` RO selector transition does create session 2, and the later RO → EN change creates session 3. The same-language full/compact transitions reuse session 2 and session 3 through `sessionStorage`.

This has two concrete effects:

1. The final `createSession === 5` assertion runs only after all 54 rows. A normal run can spend all model traffic and then fail with roughly three observed session creations.
2. The capacity gate accepts `support_limit_session_msgs >= 14`, although the realized sessions need 27 and 26 messages. A configuration satisfying the declared minimum can rate-limit the capture mid-run.

Locations:

- `capture-public-guide.mjs:154-169` (`openMode` navigates and hydrates without beginning a new conversation)
- `capture-public-guide.mjs:254-285` (execution follows mode/language transitions and checks session count only at the end)
- immutable `Assistant.tsx:415-420` (persistent session storage), `462-469` (only language change clears session), `507-527` (existing session reuse)
- `verify-guide-harness.mjs:65-74` validates the declarative groups, while `491-495` only syntax-checks the capture driver; no control exercises persisted UI session state across a group boundary.

Minimum correction:

- In a copied harness revision, explicitly begin a new conversation at every declared group boundary, including same-language full ↔ compact boundaries. Use a deterministic UI-supported reset where available, or a single documented storage reset before remount where compact UI has no reset control.
- After the first row of each group, fail immediately unless `createSession` increased by exactly one and the newly observed session is distinct. Preserve the special row-2 selector replacement assertion.
- Add a controlled negative that starts with a persisted session and proves the next group cannot reuse it. Test the actual capture lifecycle helper, not only `GUIDE_SESSION_GROUPS` data.
- Keep the capacity predicate at 14 only after the actual session sizes are mechanically proven to remain `1,14,13,12,14`.

### GH-R2 — the final gate cannot prove that its control proof was run against the gated revision

The sealed control output contains only `schemaVersion`, `controls`, `passed`, and `names`; it has no product revision or KB version. `validateBoundReceiptMembership` checks only a positive control count, equality of `passed` and `controls`, and the names array length. It never compares a control-proof revision to `finalCommit` or a control-proof KB version to the gated snapshot.

Binding the proof file's SHA-256 in a new gate proves only the bytes chosen for that gate. It does not mechanically prove that those bytes came from the final corrected product. This matters now because the immutable 54/54 proof was run at `8fb8e407...`, while the separately owned type correction will advance the product revision.

Locations:

- `GUIDE_HARNESS_FIX-controls-final.log` (no revision or KB binding)
- `controls.mjs:50-72`, especially `67-69` (control membership validation without revision/snapshot equality)
- `pre-request-verifier.ts:195-203` (loads the bound proof, then relies on that incomplete validator)
- `verify-guide-harness.mjs:512` (emits the unbound proof shape)

Minimum correction:

- Emit a new proof with at least `revision`, `kbVersion`, `controls`, `passed`, `names`, and an explicit successful result. Prefer also binding the reviewed harness artifact manifest/hash so a proof from a different harness cannot be substituted.
- Require `controlProof.revision === finalCommit` and `controlProof.kbVersion === kbVersion` in `validateBoundReceiptMembership`; reject missing and extra incompatible shapes.
- Add known-bad controls for an old revision, wrong KB version, and a proof from a changed harness.
- After the six-path type correction and final composition, run the exact corrected inert frame against the clean final product and produce the new `GUIDE_CORRECTNESS-harness-final.log`. Bind that new proof in the LIVE gate. The 54/54 result at `8fb8e407...` remains historical evidence only.

## Dispositions

| Area | Disposition | Evidence boundary |
|---|---|---|
| Canonical matrix | PASS | 54 unique rows, 20 families × EN/RO × full/compact, 2 private, 2 injection, 10 recovery; exact rows retained in `GUIDE_HARNESS_REVIEW-matrix.json`. |
| Static branch derivation | PASS at `8fb8e407...` only | 42 model, 2 private refusal, 2 injection refusal, 8 deterministic recovery; public location failures are not normalized. Must rebind after final revision changes. |
| Declarative schedule and pacing | PASS as data | Five declared groups, terminal navigation/injection ordering, 31,000 ms start spacing and 20-per-rolling-10-minute arithmetic are coherent. |
| Actual UI/session lifecycle | REWORK | Same-origin `sessionStorage` merges two pairs of declared groups; final count is late. |
| Privacy and forbidden operations | PASS statically | Matrix and capture require anonymous visitor, no private controls, zero `/api/v1/answers`, zero consent POSTs, deterministic private/injection rows and actionless deterministic recovery. No runtime value was observed. |
| Model/fallback attribution | PASS statically | API/DOM text, source labels and actions compare exactly; diagnostic windows distinguish accepted draft and reviewed fallback and reject ambiguous evidence. |
| Navigation | PASS with final-receipt review still required | Exact closed action id/label/href is checked before pointer/keyboard activation and the changed destination is recorded. A later consumer must inspect the recorded destination and sealed screenshots. |
| Runtime-capacity projection | PASS as an inert contract | Fixed outer/limit/observation keys; counts-only SQL returns aggregate maxima/boolean/count and no IP hash, row, text, credential, or private record; missing, stale, insufficient, cooldown, waiter, queue and relay facts fail before Playwright. Values were not read. |
| Runtime race | LIMITED | The ≤120 s snapshot is checked before browser launch. It is not a reservation and cannot prevent unrelated traffic from consuming capacity during the roughly 27-minute capture. One-shot failure evidence must be preserved; no favorable retry is allowed. |
| Gate materialization | REWORK | Revision, inventory, attestation, suite, KB and capacity bindings are explicit; control-proof revision/KB binding is absent. |
| Failure/evidence preservation | BOUNDED | The checkpoint receipt preserves rows and failure code and blocks a second run while present. The final LIVE consumer still must seal the completed/failed receipt and screenshot bytes with hashes; this review did not create or inspect runtime artifacts. |

## Exact custody

The indexed author artifacts matched the frozen input manifest. Principal reviewed bytes:

- `capture-public-guide.mjs`: SHA-256 `d6c19ef4fed9b1617a71d9d86aa29778a38bf76bea115d64a9b55f082c877b5f`, 16,406 bytes
- `controls.mjs`: SHA-256 `3c97bfbb59bcaa4154f74ea08098aa1f3fed6cbc07ec86b1b60df5a7216d459f`, 7,388 bytes
- `matrix.mjs`: SHA-256 `cea34112498143dcf8b1a571e40e5a24d207b5b47ee9b142048506cc773ca1ae`, 13,168 bytes
- `pre-request-verifier.ts`: SHA-256 `1394da510272fb2773d5da50c37a1eb203d62208225d871f405cdadd1b870c0c`, 13,512 bytes
- `runtime-capacity.mjs`: SHA-256 `54dce2b0e70f8d7bbeedc8c3e9104cc4fcd76f4daab018ef34c09f0422ea5b87`, 9,935 bytes
- `verify-guide-harness.mjs`: SHA-256 `da70b27127874d6dd01673e4ebeefd0e6daacb449691f6e56c3acabcae995648`, 24,940 bytes
- historical control proof: SHA-256 `17c0ccb812c1144d2cc108cb6173f3eec516c034e6efcdb3426a9537ef9adfc9`, 2,972 bytes
- immutable `Assistant.tsx` at product `8fb8e407...`: SHA-256 `5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3`, 35,138 bytes

The local detached checkout remained at older `af02290219c734d2ad2fe7df878356fec9043b15`; product consumers were read through immutable Git objects. The main source and product lanes were not changed.
