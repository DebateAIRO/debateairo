# ARCHCHECK — persistent CP1 live-response architecture assessment

Status: **ASSESSMENT COMPLETE; CP1 PASS NOT CLAIMED**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_d44075a6`  
Frozen product revision: `43cf9386ea3c9e7c79523ec38debe63271d19292`  
Baseline: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`  
Source: `446c685e977104ecf2b0b5ee0519f7123968429f`  
Date: 2026-09-14

## Assessment

CP1 currently has a strong **fail-closed sink** and an unreliable **free-generation producer**. The server prevents an invalid completion from becoming a visitor answer, but live usefulness still depends on unconstrained model text satisfying a strict syntactic envelope and a lexical policy whose rules do not model the relation between an operation and a credential. Three correction cycles improved static and synthetic behavior without establishing the finite live matrix. A fourth prompt adjustment would be speculation.

LIVE3 is conclusive about current behavior: seven one-shot HTTP 200 responses produced four grounded outcomes, three safety replacements and only three clean manual passes. EN creation, EN Settings and RO Settings did not answer the product question; the compact RO creation answer exposed `start-debate` in visitor text. Its three diagnostic events were `TEXT_LINK_OR_MARKUP` once and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` twice, but they cannot be assigned to prompts. Earlier LIVE2's `KEY_SET_INVALID` once and credential category twice are likewise unassigned. This report does not reconstruct rejected strings or promote category counts into historical causes.

## Source-to-sink boundary

1. `apps/api/src/support/answer.ts:124-139` creates the exact-four-key instruction and combines it with the reviewed capability/article context. Lines 222-227 send that string as a `system` message and the redacted request as a `user` message.
2. `apps/api/src/support/model.ts:158-169` sends those role-tagged messages through the OpenAI-compatible local relay. It supplies no response schema or grammar.
3. `acceptance/relay-core.ts:229-235` validates message shape but accepts unknown top-level fields. Lines 344-347 serialize the messages to a single JSON transcript string. `acceptance/hermes-relay.ts:100-107` passes that one string through the Hermes CLI `-z` argument; it has no inspected schema-enforcement option. Role labels survive as transcript data, but privileged role handling and exact JSON production are not enforced by this transport.
4. `acceptance/hermes-relay.ts:108-114` accepts any nonempty stdout that is not an HTTP error line. `apps/api/src/support/model.ts:170-180` trims and bounds the returned string, but otherwise treats it as unconstrained completion text.
5. `apps/api/src/support/answer.ts:245-259` diagnoses, parses and validates the completion. `apps/api/src/support/response-policy.ts:126-183` enforces exact keys, kind, schema, text policy, at least one allowed source, and action membership. A failure becomes server-authored `REFUSE_SAFETY`, with no second model call.
6. `apps/api/src/support/answer.ts:270-282` creates source objects from selected reviewed entries and resolves model-returned action IDs against trusted server context. Lines 284-303 persist the final accepted/replacement text and return the cipher write record. `apps/api/src/support/index.ts:759-792` projects that canonical result to HTTP.

The server therefore enforces length bounds, four-key parsing, source/action membership, safe action URLs, snapshot provenance, canonical encrypted storage, replacement outcome, usage/relay semantics and zero auth/reset execution. It does not semantically enforce factual entailment, language, natural guidance, role priority at the Hermes CLI, or absence of closed source/action/capability identifiers in narrative text. Those properties remain prompt-dependent. Credential behavior is server screened, but the present lexical relation is defective as described below.

At handoff, the orchestrator reported concurrent SECDELTA executable results: incomplete credential label/control redaction reached storage and model/case-summary transit; plural solicitations and same-clause negation conjunctions passed output policy and actual answer/summary persistence plus HTTP; the safe whole-answer/cross-clause EN/RO false positive reproduced; and `start-debate` prose was accepted, persisted and returned. Encoded-link probes all rejected. ARCHCHECK did not run or independently reproduce these probes; SECDELTA's separate report is their provenance. They corroborate A1-A3 and add the input-boundary defect below without identifying which unretained LIVE3 completion produced each aggregate category.

## Finding A1 — whole-answer credential join creates false positives

**Proved independent defect; exact LIVE3 attribution unknown.**

At `apps/api/src/support/response-policy.ts:85-98`, the function first asks whether `CREDENTIAL_TERM` occurs anywhere in the complete candidate. It then splits the text into clauses and returns unsafe when any clause contains a non-negated `SECURITY_OPERATION`. It never requires the credential term and operation to occur in the same clause.

Consequently, an ordinary clause about changing a language or consent preference can be joined to a separate safe clause saying Support cannot receive a password and become `TEXT_CREDENTIAL_OR_SECURITY_ACTION`. The existing benign tests at `tests/unit/support-response-policy.test.ts:81-91` cover operations negated in their own credential clause; they do not cover an unrelated positive operation in another clause.

This defect is consistent with Settings content and with two LIVE3 credential-category events, but the missing request correlation means consistency is not causation. SECDELTA independently confirmed the synthetic boundary; ARCHCHECK ran no overlapping probe.

## Finding A2 — negation is not bound to its operation

**Proved control-flow defect; independently confirmed by SECDELTA.**

For every operation match, `response-policy.ts:92-95` tests `NEGATED_OPERATION` against the entire prefix of the clause. One early negation therefore suppresses every later operation until a recognized splitter. A completion equivalent to “Support cannot receive passwords and will reset them” can let the later positive operation inherit the earlier negation. The existing tests use semicolon, `then`, `but` or Romanian equivalents as boundaries; they do not protect the unrecognized same-clause conjunction.

This is independent of the recorded live categories. It weakens CP1-R13/R15 enforcement and shows why adding more verbs or prompt prose will not repair the underlying relation model.

## Finding A3 — internal narrative identifiers are prompt-only

**Proved by LIVE3.**

The instruction at `apps/api/src/support/answer.ts:124-139` says source/action/capability identifiers and routes must not appear in `text`. The parser and validator at `response-policy.ts:126-183` validate the identifier arrays but do not compare narrative text with the closed identifier sets. LIVE3 sequence 7 returned `ANSWER_GROUNDED` while its API and DOM text contained `start-debate`. The separate rendered action remained safely server-resolved to `/login?next=%2Fnew`; navigation authority was not forged. Visitor-text hygiene was nevertheless unenforced.

## Finding A4 — diagnostics cannot support root-cause attribution

**Proved evidence limitation.**

`apps/api/src/main.ts:388-390` logs only a fixed diagnostic code. That protects rejected bytes, but a seven-request window yields aggregate counts without a request-safe correlation value. After LIVE2 and LIVE3, authors could only tune plausible producer and policy causes. The changing category mix shows that those corrections changed behavior; it does not show which exact predicate rejected which prompt.

## Finding A5 — canonical redaction lacks normalized span detection

**Statically visible and independently corroborated by SECDELTA.**

`packages/kernel/src/index.ts:290-302` uses direct regular-expression replacement over the original text. The labelled pattern recognizes a small singular EN/RO form and neither pattern normalizes Unicode or maps across embedded control characters. The same exported function is correctly reused by the UI and server, but incomplete recognition is therefore shared across pre-POST redaction, encrypted message writes and case/model projections. Centralizing the call site did not centralize a complete credential-token model.

This is distinct from A1/A2: input redaction must find and mask credential values while retaining the surrounding support question; output policy must reject solicitation, operation and false-change claims. Both consumers need the same normalization and token/span facts, then separate decisions.

## Alternatives

| Alternative | Effect | Assessment |
|---|---|---|
| Keep tuning the prompt and broad regex | Preserves every current interface, but syntax, language, factuality and identifier hygiene remain stochastic; broader lexical joins can trade false positives for false negatives. | Reject as the next step after three failed live corrections. |
| Native constrained four-key output at the model transport | Preserves CP1-R14, the runtime model, reviewed provenance and server validation while removing JSON/key-shape variance. | Architecturally preferable if the exact Hermes/model path supports it, but current code and FIX3 evidence expose no such route. Do not add an ignored OpenAI field or claim support without a capability proof. It would not by itself repair A1-A3. |
| Server-owned source/action envelope with model-generated text | Removes redundant model reproduction of identifiers; sources/actions remain deterministic and trusted. | Viable, but it changes CP1-R14's owner-approved requirement that every model completion itself carry the exact four keys. It requires an owner decision and still needs sound text-policy enforcement. |
| Deterministic reviewed answer assembly | Maximizes repeatability and provenance and removes free-text safety variance. | Larger product change that reduces natural conversational synthesis and may sideline the approved runtime Support model. It requires an owner decision and is not justified as the smallest CP1 action yet. |

## Recommended next action

Do not issue another producer-prompt patch. Using SECDELTA's confirmed cases, route one bounded policy/observability correction:

1. Introduce one normalized credential lexing layer that produces credential/value/operation/negation tokens and source-span mappings across Unicode/control obfuscation. Input redaction uses its mapped value spans; output policy uses its tokens but keeps a separate fail-closed decision.
2. Replace the whole-answer output join with a clause-local relation: a positive security operation is unsafe only when it is bound to a credential term in the same scoped clause, and a negation applies only to the operation it governs. Preserve independent secret/value/code detectors and include singular/plural EN/RO vocabulary.
3. Add a closed narrative-identifier check using the selected source IDs plus the catalog's action/capability IDs, with a fixed diagnostic category and fail-closed replacement. Do not rewrite arbitrary model prose into a trusted answer.
4. Add an opaque per-attempt diagnostic correlation value and fixed predicate subcategory fields that contain no prompt, completion, identifier, URL, session capability or user data. This lets the harness join one response to one diagnostic without exposing rejected bytes.
5. Retain SECDELTA's minimum synthetic oracles as the correction regression frame: labelled/control-obfuscated input values through every stored/model/case-summary sink; cross-clause safe Settings guidance; same-clause negation followed by a positive credential operation; plural solicitation; a closed identifier embedded in otherwise valid text; and retained encoded-link refusal. Mutation checks should defeat each property separately.
6. Only then run one finite, one-shot matrix with per-request diagnostic isolation. Its purpose is to test the repaired boundary, not to sample until a favorable answer appears.

This recommendation changes implementation of existing CP1-R13/R15 and visitor-text requirements; it does not change owner-approved behavior, the runtime model, natural reviewed guidance, source provenance, available navigation, credential/reset prohibition, usage/outcome accounting, or the fail-closed replacement. Native constrained output or a server-owned envelope remains a later architectural decision. If the present Hermes transport cannot demonstrate native schema support and live key-shape failures recur after the bounded correction, choosing the server-owned envelope requires explicit owner approval to amend CP1-R14.

## Evidence and limits

- The exact product worktree was clean at `43cf9386ea3c9e7c79523ec38debe63271d19292` before review. Nine relevant inventory-listed committed files matched their recorded SHA-256; unchanged `acceptance/relay-core.ts` was inspected directly at that revision.
- LIVE3's manifest, actual-relay receipt and report hashes matched the consumption record. Root separately consumed all 34 immutable LIVE3 references; ARCHCHECK does not repeat that audit.
- Existing final suite evidence is 20/20 files, 776 tests passed, one acknowledged Forgot-password TODO. It was not rerun.
- No product/Git/index/stack/provider mutation, real relay request, heavy command or synthetic executable probe occurred.
- Rejected completion strings and exact prompt-to-category attribution remain unknown.
- The exact Forgot-password destination and click path remain **UNVERIFIED** and checkpoint-blocking.
- This architectural assessment is not CP1 acceptance and does not authorize CP2/CP3.
- Actual token/cost usage is **UNAVAILABLE**.
