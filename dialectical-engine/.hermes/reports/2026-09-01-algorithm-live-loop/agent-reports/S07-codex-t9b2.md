CODEX REVIEW T9B 2 — CHANGES · comments read through: t9b2-2026-09-03

# S07 T9B third mechanism — static review

The filed tip is not fit to merge. The two-segment scenario does return an answer with the standing-objection mark, terminal `DOWNGRADED`, no untraced citation in its basis, and an explicitly unclaimed band. Two independent blockers remain: that absent band does not implement V's stated value-producing floor, and the same tracing-failed outcome throws for a schema-valid one-segment candidate.

## Findings

### BLOCKING — T9B2-B1 → F-T9B-5 / V-S07-CODEX-T9B2-1 — the mapping does not preserve V's stated band outcome

V's recorded wording is “band floored to UNSUPPORTED” and expressly chooses a value over an absence (`DECISIONS.md:2597-2600`). The implementation instead skips `deriveBandCeiling`, returns `confidenceBand: null` and `bandCeiling: null`, and emits `BAND_CEILING_UNBANDED` (`packages/serve/src/index.ts:912-944`). That is a deliberate absence, not a floor.

The vocabularies expose a real decision conflict:

- `UNSUPPORTED` is a verdict-label value, not a confidence band or terminal (`packages/serve/src/index.ts:806`; `migrations/0000_s00.sql:265`). Read literally, V's named value requires forcing the label. That would deliberately override confirm-item 3 and the S06 invariant that the label is computed from propagated numbers before synthesis.
- The actual band order is `CAPPED | FULL` (`packages/register/src/engine-shape.ts:19`), while `CAPPED` is not a terminal. The actual terminal union is `SERVED | DOWNGRADED | BLOCKED | COMPONENTS_ONLY` (`packages/serve/src/index.ts:483`).
- `DOWNGRADED` plus a null band implements neither literal `UNSUPPORTED` nor a non-null floor such as `CAPPED`.

I cannot assess which corrected vocabulary V intended from the contradictory phrase alone. The orchestrator correctly protected the acyclic label invariant, but it materially replaced V's explicit “value rather than absence” outcome. V must ratify one code-representable result. If V meant `UNSUPPORTED` literally, say plainly that this is a deliberate label override; otherwise specify the actual band result. This blocks merge independently of T9B2-B2.

### BLOCKING — T9B2-B2 → F-T9B-6 — a valid one-segment tracing-failed result still crashes

When citation tracing fails, every segment is marked non-conforming and `citedNodes` becomes empty (`packages/serve/src/index.ts:760-827`). The expression `citedNodes.every(node => node.state === "REASONING")` is then vacuously true. It enters the all-reasoning downgrade form and throws `COMPOSITION_CONTRACT_ERROR` whenever the candidate has fewer than two segments (`packages/serve/src/index.ts:839-878`). The standing mark was produced by the loop, but no served result containing it is returned.

This is reachable production input, not merely provider noncompliance. The composition schema permits one or two segments (`apps/runner/src/index.ts:128-135`). The prompt asks for two only when cited digest nodes rest on reasoning alone (`apps/runner/src/index.ts:4022-4024`). The repinned serve-s05 tracing-failed fixture cites a `LOOKED_UP` node, so a single segment is explicitly within the production contract.

Required resolution: distinguish “no conformance-verified cited node because tracing failed” from “all cited nodes are REASONING,” define the valid served form for a one-segment candidate under the ratified V outcome, and add a regression using the schema-valid one-segment case. “Serve after round 3 regardless” must not depend on segment count.

### NONBLOCKING — T9B2-N1 → F-T9B-7 — the reported added-expectation count is not reproducible

The range `9a3a5f60..19fb7570b7464a038695a6dd83b74493f5e3f299` removes zero lines matching `it(`/`test(`/`describe(`, and removes 8 lines containing `expect(`. Under the same symmetric added-line predicate it adds 328, not 324, such lines. This does not indicate test retirement—the net addition is substantial—but the campaign record should state its exact counting predicate or correct the number.

## Answers to the six questions

1. **For the supplied two-segment case, yes; for the mechanism generally, no.** The case returns terminal `DOWNGRADED`, carries `SYNTHESIS-OBJECTION-STANDING`, and has `crashClass: null`. Its basis is all zero, so the empty-basis branch deliberately does not call `deriveBandCeiling`; both band fields are assigned `null`. Migration 0006 has no default and explicitly permits the paired-null state. The band is genuinely unclaimed, not silently defaulted. A valid one-segment candidate nevertheless throws before any result is returned.

2. **No, not as presently recorded.** Leaving the label untouched is required by confirm-item 3 and is the correct protection of the acyclic computation. But V's literal `UNSUPPORTED` would force that label, while V's stated preference for a consumer-visible value is incompatible with the implementation's null band. The intended correction is CANNOT-ASSESS until V resolves the vocabulary; `DOWNGRADED` plus an absent band cannot be treated as a faithful translation.

3. **Only one is the mapped ruling.** Changing `SERVED` to `DOWNGRADED` follows the orchestrator's mapping. Replacing the one-segment candidate with two segments is accommodation to the inherited form precondition and hides T9B2-B2; V did not require that fixture shape. The t09 arm is restored verbatim to its `6a0491f0` blob, and the helper parameterisation is reverted.

4. **Yes, the two-segment precondition is a real hole.** One segment is schema-valid, and the prompt does not request two for the `LOOKED_UP` tracing-failed case. Even where the prompt requests two, it is not an engine-level guarantee that can replace handling a valid parsed candidate.

5. **Yes, all six campaign kills are credited to the intended assertions.** B1M1, B1M2 and B1M3 each let the corresponding wrong-role, wrong-producer or wrong-round case resolve and die at that case's rejection assertion. F1M1 returns `SERVED` against the direct `DOWNGRADED` assertion; F1M2 rejects against the direct `.resolves` assertion after restoring the empty-cited-set refusal; F1M3 rejects at the same assertion when the real `deriveBandCeiling` receives an empty basis. F1M3 also causes permissive-fixture failures in neighbouring serve-s05 arms, but those secondary wrong-cause deaths are not needed for its credit. The two declared neighbours survive, and the manifest/index/transcript set is complete.

6. **No.** T9B2-B1 needs a vocabulary-correct V decision, and T9B2-B2 needs a production-safe one-segment result plus regression coverage before the mission-closing run.

## Static evidence and provenance

- Lane `lane/s07` was clean and filed at `19fb7570b7464a038695a6dd83b74493f5e3f299`; both requested earlier tips are ancestors.
- Removing line 2 from `agent-reports/s07-synthesis.md` reproduced sha256 `1f5ee75ec2da92f45b7a83136ceab9df449582b94116ce1de7bcfef1fd692672`.
- The product `packages/serve/src/index.ts` blob is identical at the fix commit and filed tip. The supplied RED correctly stamps pre-fix `29649564` and reports `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE`. The dirty RED test's exact bytes were not hashed, so exact oracle-byte identity is CANNOT-ASSESS.
- `SERVE_CRASH_CLASSES` has exactly four members; `CITATION_TRACING_FAILED` occurs zero times in serve source. `BAND_CEILING_UNBANDED` is additive to `LiveGateTrace`; no separate closed runtime vocabulary pins that union.
- Supplied final suite records report typecheck exit 0 ×3; the T9 cluster reports `83 passed (83)` ×3; database reports `1 failed | 83 passed (84)` ×3. The same named database failure appears in earlier records. No suite was executed in this static review.
- Campaign records derive CLEAN: 8 declared transcripts, 6 killed, 2 survived, 0 missing/extra/invalid. Raw failure causes were inspected rather than inferred from exit status.

## PREDICTIONS

- A narrow patch that only changes the empty-basis branch will still miss the earlier one-segment form throw; the regression must use one segment.
- Without a vocabulary-explicit V line, a follow-up can again conflate verdict label, terminal, and confidence band while appearing to satisfy “floor.”
