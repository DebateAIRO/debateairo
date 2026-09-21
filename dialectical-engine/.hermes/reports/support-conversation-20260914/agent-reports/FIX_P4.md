# FIX_P4 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## What happened

The immediate defect was small and specific: a shared Romanian credential matcher covered `cod`, `codul`, and `codurile`, but not `coduri`, `codului`, or `codurilor`. The surrounding operation and negation logic worked. That one lexical hole let an unsafe positive validation claim cross parsing, model-answer storage, HTTP-equivalent return, summary parsing, and summary persistence.

The first reviewer probe was valuable because it tested a real composed sink rather than only the regex. It proved the exact boundary and prevented an unnecessary rewrite of the already-correct operation-scoping logic.

## What repeatedly cost tokens

1. Credential vocabulary was represented as hand-written alternatives in several regexes. Review found one inflection at a time, then every sink needed another proof cycle.
2. Similar unsafe/safe sentence pairs are repeated manually across lexical, policy, answer-service, and case-summary tests. The duplication makes coverage hard to census and makes late gaps expensive.
3. The full 25-file union is effective but expensive when a lexical defect is discovered late. Earlier generated contract checks would have failed before live-preview and final-review stages.
4. The evidence protocol requires several logs and receipts. That is useful for custody, but manually restating commands, counts, hashes, and paths creates avoidable author work and mismatch risk.

## What to upgrade

- Keep credential concepts in one typed bilingual lexicon with grammatical-form arrays and compile the matcher from it. Category membership, redaction, and output policy should consume the same facts.
- Generate a single security-vector corpus containing language, credential category, noun form, operation, separator, negation, and expected predicate. Feed it into lexical, parser, answer-service, summary-service, and redaction tests.
- Add a fast preflight that enumerates every shipped credential label/form and proves classification plus paired positive/negative behavior before any preview or real-relay check.
- Generate the receipt and evidence index from captured commands and `git diff --name-only`, rejecting missing files, duplicate logs, unclean lanes, or out-of-scope paths mechanically.

## Toward a one-prompt machine

A single execution prompt should name the finding and invariant, while repository tooling derives the rest: expand the typed bilingual lexicon into boundary cases; run RED; apply the smallest shared definition change; run affected sinks; run the exact integrated union once; compare typecheck output to the pinned baseline; commit only declared paths; and emit hashes/receipts. The agent should decide implementation details, while the invariant generator and evidence tool remove repeated prose, manual test enumeration, and late coverage surprises.

This correction demonstrates that pattern: one shared noun family, generated category/form coverage, composed sink checks, one final union, and a seven-file scoped commit. Separate pass5 still owns the correctness/security disposition; this report makes no checkpoint acceptance claim.
