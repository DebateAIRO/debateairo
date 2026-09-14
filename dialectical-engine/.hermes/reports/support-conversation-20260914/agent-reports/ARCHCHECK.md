# ARCHCHECK case file — persistent live-response failures

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `ARCHCHECK`, ticket `t_d44075a6`, reviewer session `/root/plan_review`, frozen product revision `43cf9386ea3c9e7c79523ec38debe63271d19292`, baseline `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, source `446c685e977104ecf2b0b5ee0519f7123968429f`.

## Cause and result

The current boundary is secure in the fail-closed sense: arbitrary relay text cannot become a visitor answer until strict JSON parsing, exact-key validation, bounded text screening, source/action membership checks, server action resolution, encrypted persistence and canonical HTTP projection all succeed. The repeated live failures are functional failures created before that sink. The Hermes relay preserves role labels only inside one JSON transcript passed as a single CLI `-z` prompt; it has no native response-schema enforcement. Exact four-key production and factual/language discipline therefore remain prompt-dependent.

One deterministic screening defect is proved independently of the unretained live completions. `containsCredentialOrSecurityAction` detects a credential term across the entire answer, then flags an operation in any clause without requiring that clause to contain the credential term. Safe multi-sentence Settings guidance can therefore be rejected when one clause describes an ordinary setting change and another separately says Support cannot receive passwords. LIVE3's aggregate categories are not request-attributed, so this defect cannot be asserted as the historical cause of either credential-category refusal.

The same implementation scopes negation by asking whether any negation occurs anywhere before an operation in a clause. An early prohibition can therefore suppress a later positive credential operation joined without one of the splitter's recognized boundaries. This is a deterministic screen-design defect independently confirmed by the separate SECDELTA node.

The compact Romanian result proves a second architectural gap: the prompt tells the model not to expose internal IDs, but the server text screen does not reject closed source/action/capability identifiers in prose. `start-debate` therefore passed text validation while the independently resolved action was valid. Server ownership of `href` prevented navigation forgery, but visitor-text hygiene remained prompt-only.

Concurrent SECDELTA evidence, reported by the orchestrator and not rerun here, confirms the cross-clause false positive and same-clause negation false negative, plural solicitation acceptance, accepted/persisted/returned `start-debate` prose, and incomplete labelled/control-obfuscated input redaction reaching storage and model/case-summary transit. Encoded-link probes remained rejected. Its separate artifact remains the provenance for those executable claims.

## Efficiency findings

- Three correction cycles changed selection, prompt wording and lexical policy while aggregate diagnostics could not identify which prompt produced which category. Safe request correlation and predicate subcategories should precede any further behavior patch.
- The full 20-file suite has already passed 776 tests at the frozen revision. Repeating it cannot identify a stochastic producer or an uncorrelated rejection predicate.
- The model is asked to reproduce source/action IDs that the server has already selected, then the server checks those same IDs. This redundant generation step creates key-set and membership failure modes without adding authority.
- Prompt examples can improve frequency but cannot enforce syntax or prevent internal identifiers when the relay exposes no constrained-output channel.
- The smallest evidence-backed next implementation is a shared normalized credential-span layer for input redaction and clause-local output policy, plus a closed internal-identifier text check and request-correlated fixed-enum diagnostics. This preserves the approved model, provenance, actions, accounting and fail-closed replacement behavior; it changes no owner-approved product behavior.

## Measurements and limitations

- LIVE3: seven one-shot HTTP 200 responses, four grounded, three `REFUSE_SAFETY`, three clean manual passes; diagnostics `TEXT_LINK_OR_MARKUP` x1 and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` x2 with no request attribution.
- LIVE2: four grounded and three refused; diagnostics `KEY_SET_INVALID` x1 and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` x2 with no request attribution.
- Exact captured grounded text proves one internal `start-debate` identifier reached both API and DOM. Rejected completion bytes were intentionally not retained and are not reconstructed here.
- Static product and relay paths only were inspected. No tests, builds, stack changes, browser runs, synthetic product probes or provider requests were performed.
- The exact Forgot-password destination and click path remain **UNVERIFIED** and checkpoint-blocking.
- No checkpoint PASS or fourth correction is claimed.
- Actual token/cost usage is **UNAVAILABLE**.

## Skills actually read in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
