# FIX3 author self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

- Ticket/session: `t_e697cad1` / `/root/requirements`
- Input revision: `82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0`
- Scoped commit: `43cf9386ea3c9e7c79523ec38debe63271d19292`
- Skills actually read: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`, and `receiving-code-review`.

## Case findings

LIVE2 measured three refusals and retained a secret-safe aggregate of one `KEY_SET_INVALID` and two `TEXT_CREDENTIAL_OR_SECURITY_ACTION` events. Because the reporter deliberately has no request identifier, the events cannot be assigned to individual prompts. Preserving that uncertainty prevented a convenient but unsupported claim that each Settings prompt caused a text-policy event.

The text detector did reveal a class-level false positive by inspection and synthetic reproduction: it rejected every credential-domain noun, including truthful statements that Settings does not replace a password or regenerate MFA and that Support cannot receive credentials. The correction checks for unnegated solicitation, handling, transformation, validation, or security-state operations. It also separately rejects labelled short values, long secret-shaped values, security codes, and redaction echoes. Mixed negative-then-positive instructions are split at adversative or sequence boundaries so a leading “do not” cannot excuse a later request.

The Romanian export mismatch came from two different trust boundaries operating at different times. The context advertised `owner-debate` to generation, while the navigation resolver correctly removed it after generation because the anonymous request had no trusted owner projection. The model could therefore name a non-rendered internal ID in prose. Production now resolves the closed catalog against the trusted request context first, passes those IDs into context construction, and advertises unavailable catalog actions as `none`. The model still receives the complete compact capability catalog and its availability labels.

The strict-shape failure could not be solved with native schema enforcement inside the allowed path. `RelayAdapter` talks to the repository CLI relay, whose request schema accepts unknown fields but whose prompt renderer forwards only the `messages` array to Hermes; the Hermes adapter has no schema argument. Adding `response_format` in the API adapter would therefore look correct in a transport fixture while doing nothing at the actual model. I left the adapter unchanged and strengthened the system instruction with a literal exact four-key JSON object. Invalid or extra-key output is still rejected. LIVE3 must measure whether this prompt-level correction is sufficient.

## Cost and near misses

The largest cost was uncertainty designed into the diagnostic boundary: aggregate categories were safe, but the missing request correlation prevents exact attribution. A future safe reporter should include a server-generated per-attempt ordinal or fixed intent bucket that cannot reveal user text, identifiers, or capabilities. That would have turned this round into one deterministic trace instead of an inference across parser, prompt, and policy.

I nearly treated `response_format` as a standard OpenAI-compatible option. The actual relay trace showed that the field would be discarded before the Hermes CLI prompt. Packets should name the complete transport chain, including which request fields survive each hop, whenever they suggest native structured output.

The first policy refinement could have made negation a blanket bypass. Explicit mixed-clause controls exposed that risk, and the final detector resets negation scope at “then”, “but”, “instead”, and their Romanian equivalents. Security-policy packets should provide a small grammar matrix: benign limitation, benign prerequisite, direct solicitation, value-bearing echo, execution claim, obfuscation, and mixed negation.

The action defect existed because generation and rendering used different availability sets. Future action contracts should carry one server-derived `availableActionIds` value from retrieval through generation, validation, resolution, and rendering, with a single anonymous-owner negative fixture.

The 184-test focused frame preceded a final policy-only tightening. I did not repeat it after changing only the policy pattern and its tests. Instead, the final policy suite passed 49/49 on the committed bytes, and the final typecheck output remained byte-identical to the 76-diagnostic attributed baseline. LIVE3 owns the exact integrated 20-file union.

## One-prompt improvements

1. Put a machine-readable transport survival table in packets that mention provider-native request options.
2. Add a safe per-attempt ordinal to fixed-enum diagnostic events before live testing.
3. Supply the bilingual security grammar matrix in the initial owner contract.
4. Define `availableActionIds` once at the trusted boundary and require it in the context constructor type.
5. State which final tests may be replaced by the next integrated gate, so authors do not repeat broad suites after a narrow last change.

Actual usage UNAVAILABLE.
