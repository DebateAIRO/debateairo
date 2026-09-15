# Prompt and payload audit — every model call in the system

Ordered by V, 2026-09-03: *"let's also check all the instructions/payloads for all the calls
that are being made to each AIs in each step/round, so we know we have the correct prompts for
each, because I think we're missing some important things here."*

Method: enumerated every `role: "system"` construction in the repository, then read each call
site's full message pair, its bound, and what the user message actually serializes. Static read
at integration tip `7dda3cc0`. No run was executed.

## The complete census — there are EIGHT, not thirteen

An earlier working note listed thirteen call sites. That was wrong: it counted *roles* and
*policy rows*, not prompt constructions. The repository contains exactly eight places where a
system prompt is built. Composer, conformance and restatement are NOT separate prompts — T9
retired the first two into the SYNTHESIZER/EVALUATOR pair, and the restatement survives only as
a boolean criterion inside the evaluator's schema.

| # | Call | Site | Bound | Identity leak | Other defect |
|---|---|---|---|---|---|
| 1 | JUDGE (authoring) | `packages/judgement/src/index.ts:263` | JUDGE | none | none found |
| 2 | REVIEW (cross-maker) | `packages/judgement/src/index.ts:372` | JUDGE | **`author_maker`** | — |
| 3 | PANEL ASSESS | `packages/judgement/src/index.ts:462` | JUDGE | **`author_maker`** | — |
| 4 | SYNTHESIZER | `apps/runner/src/index.ts:4037` | COMPOSER | `roleRef`,`round`,`stage`,`registerVersion` | **unstated rule** |
| 5 | EVALUATOR | `apps/runner/src/index.ts:4113` | CONFORMANCE | `roleRef`,`round` | — |
| 6 | BLIND GRADE | `packages/evaluator/src/index.ts:528` | evaluator policy | none — actively blinded | — |
| 7 | DOMAIN TAG | `packages/evaluator/src/index.ts:1548` | caller bound | none | — |
| 8 | CONSUMER AGGREGATE | `packages/evaluator/src/consumer.ts:217` | consumer policy | none — forbidden in prompt | — |

Three of eight are clean by construction. Site 6 builds an explicitly blinded sample and tells
the model "Do not infer authorship". Site 8 says "Never infer identity, authorship, routing".
Site 7 sends only the raw question and a domain list. Those three already implement
V-BLIND-CONTEXT and are the pattern the other five should match.

## Finding A — the reviewer is told the vendor that wrote what it reviews

`review` (site 2) and `assess` (site 3) both send:

```
{ name: "author_maker", content: input.authorMaker }
```

`authorMaker` is the vendor family string. Its real job is upstream, in
`selectDifferentMakerReviewer` (`apps/runner/src/index.ts:249`), which has ALREADY guaranteed
the reviewer is a different vendor before the call is built. So the routing decision is made in
code, and then the answer to that decision is handed to the model as well.

The model cannot use it. The response schemas are `{outcome, reasons, edge_bearings}` and the
five assessment scores; nothing keyed to the author. It is a pure inference channel: a reviewer
told "the author was vendor X" can weight its own judgement by its opinion of vendor X.

The system prompts compound it. Site 2 opens "Review an existing debate node authored by a
**different maker**"; site 3 opens "Assess an existing debate node authored by **another
maker**". Both sentences assert a fact about provenance that the model does not need and cannot
verify, and both are false-in-principle under V's own single-model ruling — when one model runs
every seat, the reviewer is being told something untrue.

Removal cost is bounded: two test sites pin the field
(`tests/unit/judgement.test.ts:263`, `acceptance/adversarial-corpus.test.ts:276`). The database
tests that mention `author_maker` read a COLUMN, not a prompt, and are unaffected — the
provenance stays recorded exactly as V required.

Ticketed as W7.

## Finding B — the synthesizer is judged on a rule it is never told

The evaluator's schema (site 5) contains `statement_label_agreement`, and its system prompt
requires that criterion to be true for `satisfied`.

The synthesizer (site 4) receives `codeLabel` in its payload. Its system prompt — quoted in
full — is:

> Return only JSON with a segments array of at most two {segment_id,text,node_refs,
> served_number_refs} entries. node_refs must name the node ids of the digest nodes whose
> facts the segment asserts, so every load-bearing claim traces to a digest node. Preserve the
> digest and add no facts. When the digest nodes a segment cites rest on reasoning alone, with
> no measured or looked-up evidence behind them, return at least two segments in order: the
> first segment states the provisional answer as a hypothesis; the second segment states the
> research plan that would lift it.

The label is never mentioned. The synthesizer must infer from a field's bare presence that its
prose is required to agree with it. The evaluator then rejects it for disagreement.

Cost: every disagreement burns a full round. Worse, the retry carries the objection but still
never states the rule, so the loop can converge only if the model guesses correctly from the
objection text.

This is NOT a V-BLIND-CONTEXT violation. Telling a party the standard it will be judged against
is the minimum information the task requires — it is the same category as the instructions
themselves, and the opposite of telling it who made the data.

Ticketed as W9 (F-W9-1).

## Finding C — the digest is clean, and one mark class cannot be cleaned

Checked because the synthesizer reads the whole digest. `DigestSourceNode` and
`DigestNodeEntry` (`packages/serve/src/synthesis.ts:32-68`) carry node id, statement summary,
strength, way of knowing, marks and polarity relations. **No maker field, at any level.** The
runner's construction at `apps/runner/src/index.ts:3802` confirms it. This is correct today and
should be pinned by a test so it stays correct.

One residue, and I cannot remove it: the mark vocabulary includes `SINGLE-LINEAGE`,
`DEGRADED-DIVERSITY` and `PANEL-DEGRADED-SINGLE-VOICE`. None names a vendor, but each states
that one maker produced everything. A model that knows its own identity and reads
`SINGLE-LINEAGE` can conclude it is reading its own output.

**This is a place where the strategy cannot be fully applied, and it should not be.** Those
marks are the honesty disclosure — a mono-maker debate has to say so, or the served answer
overstates its own independence. Suppressing them to protect blindness would trade a real
guarantee for a weaker one. Flagged for V's judgement, with the recommendation to keep them.

## Finding D — nothing checks the prompt surface

The `author_maker` leak survived every gate because no test asserts over what LEAVES the
process. `assertFreshContextRequest` inspects the request object; contract hashes are computed
from version strings, not prompt text; `inputHash` is recorded but never compared to anything.

One guard closes this whole class: fail if any model-facing payload carries a vendor name, a
routing address, a round counter, or register metadata. Without it, the next leak is found the
same way this one was — by reading.
