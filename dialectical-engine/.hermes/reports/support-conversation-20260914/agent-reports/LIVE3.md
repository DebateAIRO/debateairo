# LIVE3 author self-report

- Ticket/session: `t_8a5cf2e8` / `/root/preview`
- Revision: `43cf9386ea3c9e7c79523ec38debe63271d19292`
- Product/Git edits: none
- Usage: UNAVAILABLE
- Skills loaded in this author session: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `verification-before-completion`, and `systematic-debugging`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

LIVE3 does not establish CP1 functional readiness. The exact final integrated suite passed 20 files with 776 tests passing and one existing Forgot-password TODO, but the only allowed actual seven-question matrix produced the same three user-visible refusals as LIVE2. The four grounded results also include one Romanian compact answer that exposes the internal action identifier `start-debate` in prose. Only three of seven answers are clean manual passes.

The corrected policy changed the observed first diagnostic class from LIVE2's `KEY_SET_INVALID` to `TEXT_LINK_OR_MARKUP`; it did not eliminate the failure. The bounded window contains `TEXT_LINK_OR_MARKUP` once and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` twice. These counts align with three refusals, but the diagnostic reporter has no request identifier, so prompt-level attribution remains unproved.

## What can be done better

The repeated cost came from correcting prompt wording and predicates without a deterministic acceptance boundary for the exact seven benign outputs. FIX2 and FIX3 both passed broad synthetic and integration suites, followed by real matrices with three refusals. That consumed two full 20-file runs, two stack reloads, fourteen real Support questions, screenshots, and evidence processing while leaving the same user-facing blocker. A one-prompt machine needs the acceptance contract to be runnable before the first live gate: the seven canonical questions, required source/action constraints, forbidden internal identifiers, and benign credential/security wording should become deterministic producer-and-policy fixtures. The model may vary its prose, but a safe guided fallback should remain useful instead of converting benign product questions into a human-escalation refusal.

The response contract also needs an automatic semantic check that rejects internal identifiers in text before a release gate. FIX3 added prompt wording that forbids these identifiers, yet one actual answer still rendered `start-debate`. Prompt instructions alone are not a sufficient enforcement boundary.

Operationally, the first LIVE3 launch exited at the Support-model stage. The private runtime log was classified only to `DEV_AUTH_STACK_SUPPORT_MODEL_FAILED`; its inner cause is unknown. A second unchanged supported launch succeeded. The standard launcher should emit a safe fixed inner reason and a machine-readable custody receipt so this does not require a minute-long marker wait followed by ad hoc classification.

The browser emitted eleven console errors, all classified in memory as HTTP 401 with no retained text, URL, header, or value. This resolves the earlier evidence ambiguity: there was no observed 404, JavaScript/hydration, or uncategorized console error. The expected anonymous-page 401 requests should be identified at the product/test layer so future runs can distinguish accepted anonymous probes from regressions without inspecting browser strings.

## Preserved evidence and limits

The final supported preview is detached at PID/PGID `40443`, PPID `1`, serves revision `43cf9386ea3c9e7c79523ec38debe63271d19292`, returns ordinary TLS HTTP 200 at `/help`, and retains preview listeners 3100, 3101 and 8890–8896 alongside unchanged original listeners 8790–8796 after browser exit and a ten-second idle boundary. The fresh browser profile was removed. No TLS bypass, credential/recovery operation, product edit, model/provider substitution, or repeated Support question occurred.

The exact Forgot-password destination remains UNKNOWN and was not searched. CP3 conversational quality, owner acceptance, and final independent review are outside this receipt. Historical LIVE1, the one-off diagnostic, LIVE2, and both launch attempts remain separate evidence; none is overwritten or combined into a pass rate.
