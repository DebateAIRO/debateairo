CODEX REVIEW S09 r3 — CHANGES · comments read through: s09-r3-2026-09-02
VERDICT: CHANGES — filing r3 is the worker's last lawful round; 2 blocking findings and 1 non-blocking finding (3 total). No round 4 is authorized: V-S09-CODEX-R3-1 through -3 must go to the V DECISIONS PACKET.

# Scope and method

I read the packet in full first, then D35 and its correction, D27 ADDENDUM-2, J28, J12, J25, D24, D28, the heartbeat protocol and reviewer contract, the r2 verdict, ticket and frozen spec, the complete worker and self reports, the r3 diff, the relevant shipped call paths, and the filed S09 logs. This was a **static review only**: I ran no product tests, builds, installs, or provider calls and made no product or Git changes.

Fresh static provenance checks resolved a clean lane at `8aa1357ce29a82facc5bb3ffe56e71789929b09e`, tree `b99d12048521ff23db92af283ed31c9b492a73cd`, four commits over `e040b1ee`, with `16 files changed, 1300 insertions(+), 51 deletions(-)` and zero mode changes. Recomputing the report hash with line 2 omitted returned `5ffeac28a20439239044878200b885ec29ea80ba42656a421de05a88cc71d3df`. The packet path, marker, allowed outputs, quoted tip/tree/diffstat, and report hash all resolve; I found no packet defect.

# Findings

## B1 — J28's inclusive default is not applied, and equality currently destroys the successfully served answer

V row: **V-S09-CODEX-R3-1** — authorize the J28 default micro-fix; there is no lawful r4.

Files: `packages/budget/src/index.ts:158-173,284-292`; `apps/runner/src/index.ts:3037-3087,3267-3273`; `packages/serve/src/index.ts:392-433`; `tests/unit/budget-s09.test.ts:27-92`; `tests/integration/t17-envelope-ledger.test.ts:505-527`; `agent-reports/s09-envelope.md:682-696`.

The seat measured F-S09-8 correctly, but J28 was issued after the filing and its default is not present in the reviewed tree. `assertModelAttemptAllowed` checks before a call and refuses only when the already-consumed count is `>= max`, so the attempt that raises consumption from 108 to 109 is permitted. `decideBudgetPressure`, however, returns WITHIN only for `consumed < max`; at 109 it returns `HARD_STOP`.

Concrete input → wrong outcome: drive the filed M=2/depth=1 fixture through all 109 allowed attempts and let composer, second-round conformance, and post-compose R9 succeed. `runServeGateChain` has already produced a normal served/downgraded result. The final pressure check at runner `:3267-3273` nevertheless takes the hard-stop branch, and `makeEnvelopeTerminal` clears `finalSegments`, the composition artifact, and conformance artifacts before replacing the result with `createEnvelopeExhaustedResult`. That replacement is `terminal: "COMPONENTS_ONLY"`, `answerForm: null`, no segments or conformance, plus `ENVELOPE_EXHAUSTED`. The consequence is therefore larger than the report states: equality does not merely receive a false label; it discards the successfully composed answer.

J28 rules the default unambiguously: reporting follows permission, so equality is WITHIN. Fix `decideBudgetPressure` to return WITHIN for `consumed <= max`; change the equality arm in `budget-s09.test.ts`; change the maximum-ledger expectation from EXHAUSTED to WITHIN; and assert through the persisted answer projection that the completed maximum-path result remains served/downgraded with its composed evidence. `assertModelAttemptAllowed` stays unchanged. If V instead selects the recorded V-S09-8 alternative, that veto must be explicit; the current tree cannot be accepted as the ruled default.

## B2 — The new split receipt is accepted in contradictory forms, and its two required fields are absent from the deletion matrix

V row: **V-S09-CODEX-R3-2** — authorize the receipt-boundary micro-fix and discriminating pins; there is no lawful r4.

Files: `packages/budget/src/index.ts:43-73`; `tests/support/discoveredPanel.ts:19-35`; `tests/integration/obs-l3-s06-runner-binding.test.ts:253-271`; `tests/unit/t17-envelope.test.ts:265-317`.

r3 adds `composition_sites_per_round` and `post_compose_sites_per_run` so the persisted receipt discloses the seven-site decomposition. The parser requires both fields syntactically, but it never checks that `call_sites.serve` equals the arm named by `serve_leg.selected`. Two r3-updated fixtures demonstrate the gap in committed source: each says `call_sites.serve: 8` while also saying `composition_sites: 7`, `synthesis_loop_sites: 6`, and `selected: "COMPOSITION"`. `parseCostEnvelopeBasis` accepts this deterministic contradiction because every individual number and enum passes its zod member check.

The one-field refusal table then repeats r1 B3's exact test gap. Its comment claims every newly required v3 disclosure is deleted individually, but the table still contains only the old nine members; neither `serve_leg.composition_sites_per_round` nor `serve_leg.post_compose_sites_per_run` appears. Making either new schema member optional would leave the production constructor, round-trip assertion, full `serve_leg` equality, stale-v2 case, all nine deletion cases, and the filed M5 mutant unchanged. No current assertion discriminates that weakening.

Fix the two fixtures to a coherent seven-site call count; make the receipt parser refuse a selected arm whose count disagrees with `call_sites.serve` (and refuse a `selected` value inconsistent with the larger arm); extend the deletion table to all eleven lane-added members; and add a discriminating mutation for the two r3 fields. This is blocking because the ticket explicitly updates receipts and the high-risk receipt currently accepts mutually incompatible topology claims.

## N1 — The r3 artifact-generated truthfulness sweep still has five stale claims

V row: **V-S09-CODEX-R3-3** — route a report/source-only D28 sweep, then recompute the report hash. Non-blocking does not mean optional.

Files: `agent-reports/s09-envelope.md:252-256,352-353,430-431,489`; `packages/register/src/index.ts:243-246`; `tests/integration/t17-envelope-ledger.test.ts:120-127`.

The live code and logs settle these facts, but the filed prose still contradicts them:

1. Report `:252-256` and the register comment call `max` a tight cover “in both worlds” and retain `8`/`14`; r3 measures 7 current composition sites, the sum is 13, and the post-T9 six-site world remains the already-filed F-S09-4 slack until that arm is retired.
2. Report `:352-353` says the three GREEN logs ran at `4bbb13e5`/`f77b804a`; all three logs are stamped `8aa1357c`/`b99d1204`.
3. Report `:430-431` resurrects the rejected `e526e5b4` “pristine tree” and old filed tip `4bbb13e5`; the corrected proof is base tree `2131932e`, overlay tree `0681125e`, and HEAD `8aa1357c`/`b99d1204`.
4. Report `:489` records M8 as `25 failed | 68 passed`; the D24 transcript says `25 failed | 67 passed (92)` because the integration file is a collection failure under that mutant.
5. The maximum-provider comment at integration test `:120-127` still says panel and serve organs answer first time and that failing serve ends the run early; the implementation immediately below gives both a nonzero failure budget and the test depends on those failures to reach 109.

The underlying results remain assessable, so this is non-blocking, but D28 now calls for a generated sweep rather than another point edit. Correct every enumerated sentence and refresh line 2's sha256 after the report changes.

# Verified without a finding

The r2 maximum-path blocker is otherwise closed. Source has composer plus conformance inside the two-round loop and post-compose R9 once after it. The fixture forces round 1 with valid-but-false conformance and succeeds in round 2; the ledger assertions pin `COMPOSER:1/2`, four round/segment conformance keys, and `POST_COMPOSE_R9:2` at three attempts each. The R9 key comes from `compositionAttempt`, last set by the second composer before the post-loop call. The independently written unit enumerator walks rounds and segment sites, then appends one R9 site; it no longer copies `maxRecompose * fixedOrgansPerComposition`.

The headline arithmetic is correct: 8 author sites × 4 + 8 reviewer sites × 4 + 8 panel sites × 3 + 7 serve sites × 3 = **109**. DR-184-v2's 88 omitted the panel leg (+24) and over-billed one serve organ (-3); the per-site allowances were already right. The active filing describes 92 only as the earlier bracketing run.

The prior provenance blocker is factually closed despite N1's stale prose. The corrected resolved-tip check independently printed only `TIP=8aa1357c…` and no STALE rows. Git identifies base `e040b1ee…` with tree `2131932e…`; the recorded `0681125e…` overlay differs from that tree only by the two lane-added T17 tests, and the HEAD arm is clean at the filed tree. The seven unit-zone failure names match the b8 authority.

Filed evidence records typecheck exit 0; each of three cluster runs at `91/93` with the same two named authority failures; the maximum-ledger test green in each; nine mutants CAUGHT and the provenance neighbour NOT_CAUGHT; and the campaign ending clean at `b99d1204`. I did not independently execute any of those gates under the packet's static-only restriction. I also did not run a provider probe, the W12 ceremony, or the unmerged T9 path.

# PREDICTIONS

Another lens will likely approve after checking 109 and treat J28 as a one-word state-label change; following the hard-stop result through `makeEnvelopeTerminal` will show that equality currently erases the composed answer. A lens focused on the production constructor will likely miss the receipt defect because that constructor is coherent; `fixtureStructuralCeiling` is the falsifying input already in the tree, with serve 8 beside selected composition 7. A lens that searches only for the retracted `2*judge + final` text may call the prose sweep clean while missing the old GREEN tip, old overlay tree, M8 denominator, and first-attempt provider comment enumerated above.
