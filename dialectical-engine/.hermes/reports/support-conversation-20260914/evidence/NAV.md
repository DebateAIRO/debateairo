# NAV evidence

- Ticket/session: `t_a7eb5e1f` / `/root/requirements`
- Input product revision: `1d84592c0d639dfebaea4ac3aa9cb0711555e251`
- Integrated pre-NAV revision: `252f8faf46d987e1df89778eff0439ea140994d0`
- Scoped NAV commit: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`
- Status: READY FOR PEER REVIEW; CP1 acceptance is not claimed.

## Implemented contract

Production composition loads the exact separate editorial manifest, creates a process-resident immutable corpus snapshot lookup, and injects the same lookup into route admission and answer generation. A session whose stored `kbVersion` is unavailable receives HTTP 409 `{ "error": "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", "restart_session": true }` before admission, model work, or transcript writes. It cannot silently answer from the current corpus.

`SupportAnswerPort.respond` now accepts `kbVersion?: string` and `signedIn?: boolean`. Its result may expose server-owned `sources: readonly { id, label }[]` and `actions: readonly { id, label, href }[]`. Every answer-port-produced message response and the deterministic Forgot-password response serialize both fields as arrays, including empty arrays. Existing deterministic/own-context/case terminal message variants and create-session responses retain their legacy shapes and can omit them; the UI must parse them as optional and default to empty arrays. Source IDs must belong to the selected snapshot context. Action IDs must have been requested by that context, and hrefs are resolved only by `resolveSupportActions`; the model cannot supply hrefs.

Production model completions use exact-key JSON `{ kind: "answer", text, sourceIds, actionIds }`, bounded at 8,192 raw code points and 4,000 text code points. Parsing rejects malformed/extra-key output and screening rejects links, paths, markup, credential or security-operation wording, codes, secret-shaped material, and redaction echoes. Invalid output becomes the existing `REFUSE_SAFETY` without retry, persists only the deterministic replacement, returns the canonical value from `messages.write`, retains actual model usage, counts as successful relay transport, remains non-rateable/non-resolution, and does not trigger E2 or E6.

Forgot-password paraphrases are classified before generic account-security rules. EN and RO deterministic guidance performs no model, auth, recovery, or default escalation operation. The unresolved `forgot-password` catalog action resolves to no HTTP action, so `actions` is empty. Its assistant text is also returned from `messages.write`. Exact product destination remains unverified and is an open CP1 dependency.

UI fixture assumptions: an answer-port-produced message response contains `message_id`, `outcome`, `text`, `can_escalate`, `sources`, `actions`, and optional case-receipt fields. Forgot-password also contains `message_id`, `outcome`, `text`, `sources`, and `actions`. Every `source` is `{ id, label }`; every actionable navigation item is `{ id, label, href }`; consumers must render only these server-returned arrays and treat absent arrays on legacy terminal variants as empty. Snapshot-unavailable is HTTP 409 with the exact body above; both UI surfaces must clear the stale persisted capability, create one fresh session, and retry the current redacted request once, then show existing unavailable behavior on a second mismatch. Forgot-password currently returns outcome `REFUSE_ZONE`, canonical deterministic text, and empty arrays.

## Verification frames

- Existing untouched C2 frame at `1d84592c`: 7 files / 496 tests passed (`NAV-baseline-existing-escalated.log`). The earlier sandbox frame ended in listener `EPERM` and is environmental only.
- RED: 3 files failed; 5 new assertions failed while 342 existing assertions passed (`NAV-red-unit.log`). Missing policy/guidance modules and absent classifier behavior caused the expected failure.
- First GREEN: 3 files failed, 3 passed; 3 assertions failed and 406 passed (`NAV-green1.log`). It exposed package-boundary import, stale fixture, duplicate normalization, and nullability integration mistakes.
- Corrected GREEN: 6 files / 507 tests passed (`NAV-green2.log`).
- Latest current-byte aggregate: policy, guidance, classifier, escalation, routes, metrics, degraded, and KB suites passed 8 files / 549 tests (`NAV-final-suite-latest-escalated.log`). The sandbox attempt immediately before it is environmental only.
- Repository typecheck remains red on immutable-baseline paths; the four initially introduced NAV diagnostics were corrected, and `NAV-typecheck-final.log` contains no diagnostic in any NAV-owned path.
- Exact packet members `support-model` and `support-relay-reservations`: 2 files / 21 tests passed on current bytes (`NAV-final-missing-members.log`). Together with the seven required members in the aggregate, all nine packet-named suites are evidenced. The aggregate's eighth member is the related KB suite.

## Boundary mutation evidence

- Credential detector disabled: policy suite failed 3 assertions and passed 17 (`NAV-mutant-screen.log`).
- Exact snapshot guard disabled: route suite failed the one targeted assertion, with 97 skipped (`NAV-mutant-snapshot.log`).
- Deterministic canonical-return path bypassed: route suite failed 2 targeted assertions, with 96 skipped (`NAV-mutant-canonical.log`).
- All mutations restored: 2 files passed 23 targeted assertions, with 95 unrelated assertions skipped (`NAV-probes-restored.log`).

The real PostgreSQL route assertions observe that malicious completion bytes are absent from decrypted storage and HTTP, usage is retained, refusal is not rateable, and relay health is available. The deterministic EN/RO route assertions observe equality between the cipher-write adapter's returned text and HTTP text, no model call, and empty action arrays. Synthetic probes contain no real credentials.

## Scope and dependencies

Only the 14 NAV product/test paths in the packet are staged for the scoped commit. There are no migrations and no `model.ts`, UI, runner, knowledge content, editorial, or ratification edits. Separate editorial attestation is consumed as predecessor state; owner ratification remains blank for reviewed draft records. Exact Forgot-password destination remains pending, so this node does not claim checkpoint acceptance. Actual usage UNAVAILABLE.
