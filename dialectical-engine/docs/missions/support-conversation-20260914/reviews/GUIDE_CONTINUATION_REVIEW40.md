# GUIDE_CONTINUATION_REVIEW40 — final continuation binding review

- Ticket: `t_b17abb68`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- KB version: `7ef4244d30507e162cebf544eeb6b9578f17ed91711f2d164f2a4d75dd72c7af`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Date: `2026-09-21`
- Verdict: `REWORK_BOUNDED_SESSION_TIMESTAMP_COMPOSITION`

## Blocking finding

The remaining-segment producer cannot satisfy its own composition consumer.

`capture-public-guide.mjs` initializes `sessionCreationTimesUtc` as empty, but its create-session response listener appends a timestamp only while `result.sessionCreationTimesUtc.length < 2` (lines 119–121). The sealed plan creates three remaining sessions. Later, `createComposedManifest` in `composition.mjs` rejects unless the completed remaining receipt contains exactly three session-creation timestamps (line 27), then combines those three with the two retained LIVE31 timestamps and requires five total (lines 30–31).

The consequence is deterministic: even if all 21 remaining requests and screenshots succeed, the producer records at most two new timestamps. It sets `completed=true`, writes the checkpoint, then the composer throws `GUIDE_CONTINUATION_REMAINING_SEGMENT_INVALID`. The catch changes the receipt back to failed. The operator therefore cannot produce the declared composed31 success artifact from these exact bytes.

The existing 14 core controls prove three group definitions and the capacity metadata. The 15 final controls search only for controller anchors and never pass a producer-shaped receipt through the composer. They do not cover this boundary.

### Minimum correction

1. Record exactly the three new session timestamps, with ordinals 1–3, for successful create-session responses. Reject an unexpected fourth session rather than silently ignoring it.
2. Bind completion to exactly three timestamp records as well as exactly three create-session responses.
3. Add a producer-shaped three-timestamp positive that passes the real `createComposedManifest` and yields five composed session records after the retained two.
4. Add two-, four-, malformed-ordinal and out-of-order timestamp negatives. They must fail before a composed manifest is accepted.
5. Rebind the changed capture implementation, harness digest, command contract, operator digest guard and affected absence/receipt metadata. No namespace, product, KB, matrix, screenshot helper or operational request change is needed.

## Retained passing dispositions

The rest of the bounded static review passes and should not be repeated after the timestamp correction.

- **Retained evidence and composition membership:** all 31 retained artifacts in the composition contract match bytes and hashes. The contract preserves LIVE31's `FAILED_CAPTURE_ROW47_NO_RETRY` provenance, all ten sequences including row47, and the fixed remaining21. The two sets contain 31 unique rows. It does not claim the remaining segment is complete.
- **Actual compiled UI transition:** the final saved proof shows keyboard activation of the Romanian Compact Help link, navigation to `/help`, full Romanian restoration, prior-message restoration, same synthetic session and capability, zero session creations and exactly one intercepted same-session message. No language selection was performed. Public same-origin assets were allowed; Support/status/auth/private/external dynamic requests were fulfilled or aborted locally, with zero forwarded dynamic requests and zero model traffic. The two page-case reads are separately counted.
- **Narrow mixed-mode controller:** only the first group's final transition from compact row54 to full row43 is allowed to differ from the group mode. All other group, mode and language checks remain strict. The real controller reads the current session and capability only in page memory, records booleans and ordinals, and does not persist values or hashes.
- **Execution plan:** the order is the exact remaining21, partitioned into 8/8/5 rows over three sessions; 13 English, 8 Romanian and exactly 18 model rows. Request starts require 31-second spacing. There is no generic row-selection, skip or retry argument.
- **Capacity:** the runtime guard requires three session slots, 27 daily messages including six owner messages, and 24 daily calls including six owner calls. The exact positive and deficient session/message/call controls exercise the real capacity validator. The old five-new-session and 31-new-message requirements are not active.
- **Operator binding:** all seven phase `argv[2]` values name the final command contract. The final contract SHA is `8b8a25888415c79381aa195d601b2cf2aaf1401ce830abaa5d84a608630bdcea`; the operator bytes match `6bcbb323a3a26efe75cc6626bf4e0574229f948634df21786b4d4309282ebe8e`. The FIX39 helper digest is `10a806c50999a84f3a036375807ef29a29c92ef6368047ec4e14c28af148b3be`. All 115 future paths are unique and absent. The row-proof dependency, process/schema custody and owner paths remain bound.

The sealed footerless-helper visual/source verdict, product evidence, process validator and runtime schema remain valid. No runtime, browser, HTTP, capacity, database, Support or model action occurred in this review.

Actual remaining21 responses, composed31 quality, current gate measurements and owner availability remain unproved. Forgot remains unresolved. This is not CP1 readiness, completion or acceptance, and it is not a CP2 claim.
