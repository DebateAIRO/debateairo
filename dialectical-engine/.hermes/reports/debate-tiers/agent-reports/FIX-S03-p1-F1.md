# Case file — FIX-S03-p1-F1

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding assigned

`t_ad04e504` was one defect class with two transport members: a configured full model id crossed the panel boundary through an erased type cast, then the Claude relay ignored it in favour of its default alias while the Grok relay had no model input at all. The compiler exposed both missing option members when the casts were deleted (`apps/runner/src/dev-cli-provider-panel.ts:121-129`). The runtime cause was the alias-only request path at the old `acceptance/claude-relay.ts:116-142` and the model-less argv at the old `acceptance/grok-relay.ts:84-105`.

The shipped repair separates Claude alias and full-id requests, validates them with separate patterns, gives `model` precedence, and keeps observed lineage sourced from the CLI envelope (`acceptance/claude-relay.ts:60-82,127-161,165-173,189-199`). Grok now appends the documented model flag only when `model` is present, while its reported lineage path is unchanged (`acceptance/grok-relay.ts:84-108,111-119,128-139`). The panel passes both full ids without casts (`apps/runner/src/dev-cli-provider-panel.ts:121-129`).

## Evidence and price

| Item | Measured price | Result |
|---|---:|---|
| Reviewer RED reproduction | 1 mutant bundle, about 4 seconds | M1 produced 2 × TS2353; M2 failed the old Claude title; restore SHA matched with 0 porcelain entries. |
| TDD cycles | 3 Claude cases, 1 Grok case, 1 added panel boundary case | Claude RED 3/18 then GREEN 18/18; Grok RED 1/11 then GREEN 11/11; panel's real argv RED received `opus`, expected `claude-opus-5`, then GREEN 12/12. |
| Refutation | 5 defect mutants and 4 neighbouring mutants | Every defect mutant failed its named case; every neighbouring prompt/default mutation stayed green; every product path restored byte-equal with the identical per-path porcelain line. |
| Required variance | relay/panel 49/49 ×3; C3 89/91 ×3 with only 2 inherited titles; integrated 185/187 once with only the same 2 inherited titles | Required frames reproduced. Reviewer independent probe: 21/21. |
| Typecheck delta | 67 inherited diagnostics before and after; 0 in an allowed path | M1's two TS2353 diagnostics are absent with the casts deleted. |
| Wall clock | 8h55m from CLAIM 22:58:32 to report measurement 07:53:53 EEST | Dominated by closed-lid sleep during the long embedded-Postgres gate, not execution. Valid C3 and integrated runs were about 128 seconds each. |
| Token accounting | exact token count unavailable to this seat | Session store was 1,283,708 bytes / 746 JSONL lines at 07:53:53. Reporting that proxy avoids inventing a token number. |

The two inherited failures, dated 2026-09-12, are `recognizes hostile static SQL concatenation, interpolation, and tagged builders` and `classifies every register relation access and bans open writers, latest selection, and unsafe version coercion` in `tests/architecture/register-support-publication.test.ts`.

## What nearly went wrong

- The first panel RED fixture omitted the OpenAI request's `model` field, so it failed at response decoding instead of at the argv assertion. It was corrected and rerun before product work; the valid frame was `Expected: "claude-opus-5" / Received: "opus"`.
- A full id could have been routed through `modelAlias`; `claude-opus-5` intentionally fails the alias regex. Separate discriminated paths avoid that category error.
- The first C3 runs appeared to implicate `dev-deployment-register`, but captured PostgreSQL timestamps showed 16–19 minute suspend gaps. `ioreg` then measured `AppleClamshellState = Yes`. Treating those timeout frames as a code regression would have sent the fix outside its contract.
- `caffeinate -i` was a dead end: it blocks idle sleep, not closed-lid system sleep. On AC power, command-scoped `caffeinate -s -i` kept the exact inner test command alive and yielded the expected frames.
- Two initial mutation substitutions matched nothing and therefore produced false green signals. Adding a printed changed slice before the run exposed the no-op; both mutants were rerun with content anchors that actually changed the product.
- One patch draft contained a placeholder and was replaced before any test run. One regex-mutant command had a Perl quoting error and was rerun under a new log name. These retries were not separately timed; they cost five extra tool round trips.

## Packet ambiguities

1. Charge 5 says M2 with `modelAlias` beside `model` must be RED on the precedence case. A correct precedence implementation should stay green merely because both keys are present. I interpreted the intended defect as reversing precedence while the case supplies both keys; that re-derived mutant failed only the precedence case. The original reviewer M2 was also rerun after commit and failed both new panel boundary cases.
2. Charge 4 says to re-title and re-assert the existing 11th panel case, while charge 5 requires the panel suite to grow from 11 to at least 12. I retained the required real-argv case and added a separate typed-boundary case, yielding 12/12.
3. The original mutant bundle refuses a dirty tree, so it cannot be rerun against an uncommitted fixed revision. It was run RED before edits and rerun at the clean committed head; the independent 21-case detector ran before commit on the exact committed bytes.
4. The worker contract asks for `DECISIONS.md` in full, while the packet says only named ranges and names the decisions tail. A full 623-line read exceeded one tool response and was truncated. The binding tail at lines 602 and 623 was then located and read directly. This is reading-floor friction with no product value for this finding.

## Upgrades for the one-prompt machine

1. Ship a machine-readable execution manifest beside the prose packet: exact read ranges, exhaustive write paths, commands, expected counts derived arithmetically, inherited failure titles, mutation transformations, and log destinations. Validate it before dispatch. **VERDICT:** adopt for the next mission / **CONFIDENCE:** high / **STRONGEST COUNTER:** a second representation can drift unless prose is generated from the manifest.
2. Make every mutation script fail non-zero when its content replacement count is not exactly one, and print the mutated hunk before running its detector. The current reviewer script reports “inspect by hand” and exits successfully on M1 after the fix; my first two hand-written substitutions likewise no-op-passed. **VERDICT:** mandatory replacement-count gate / **CONFIDENCE:** high / **STRONGEST COUNTER:** one-to-many class sweeps sometimes intentionally replace several members, so the expected count must be declared per mutant.
3. Add a command wrapper that detects closed-lid AC execution and selects `caffeinate -s -i` before long embedded-database suites; record suspend gaps as `BROKEN`, not RED. **VERDICT:** add to the capture runner / **CONFIDENCE:** high on macOS / **STRONGEST COUNTER:** platform-specific power assertions do not belong in portable test semantics and should remain an outer transport concern.
4. Expose small, pure argv builders as supported test seams for CLI relays. The packet allowed this; using the process seam gave stronger end-to-end evidence but added roughly 90 lines of duplicated panel-test harness. **VERDICT:** extract pure builders in the relay owner when that surface next changes / **CONFIDENCE:** medium / **STRONGEST COUNTER:** a pure-builder assertion can pass while the adapter calls a different builder, so one process-seam integration case must remain.
5. Compute expected test totals from the declared case deltas. Here 15 + 10 + 8 + 11 = 44 and the declared additions (+3, +1, +1) imply 49, but the prose only gave lower bounds. **VERDICT:** emit exact arithmetic in packet-check / **CONFIDENCE:** high / **STRONGEST COUNTER:** parameterized suites and conditional skips can make static case arithmetic unreliable without a measured baseline.

## Bottom line

The repeated cost was not the five-line runtime change. It was evidence plumbing: mock-only assertions, casts that suppressed the contract, mutation scripts that can no-op successfully, and a long gate unaware of closed-lid suspension. The shortest future route is a generated manifest, count-checked mutations, one pure argv seam plus one process-seam case, and a capture runner that classifies host suspension before a reviewer sees a false regression.
