# FIX_P2_DEGRADED author self-report

## Identity and result

- Node/ticket/session: `FIX_P2_DEGRADED` / `t_7f51fcb1` / `/root/requirements`
- Model: `gpt-5.6-sol`
- Source revision: `446c685e977104ecf2b0b5ee0519f7123968429f`
- Product base: `606b2eabea1dc9212159e53c193cf69655424e77`
- Final one-test commit: `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`
- Usage: UNAVAILABLE.

The integrated failure was fixture drift. The degraded test forced structured snapshot handling while its cast entry lacked the newly required `modelProjection`; deterministic ranking excluded it and returned `NO_SOURCE` before the model call. Adding only the safe projection restored the intended test path. The absent fallback remains intentional, so the screened draft still produces `REFUSE_SAFETY`, preserves usage `3/4/0.001`, persists model accounting, and clears degraded relay health after successful transport.

Targeted RED: one failed, seven skipped. Complete affected file GREEN: eight of eight passed. The final commit changes one test file; all runtime, configuration, content, acceptance, compose, and deploy paths remain equal to the base.

## Skills loaded

Actual bodies read and retained in this same native author session:

- `using-superpowers` — SHA-256 `30f2ab78e20ddc27ee7158ae8d4a2abe161c360981c7cc3548070913142d3dc3`
- `heartbeat-protocol` — SHA-256 `9f5c803cbdfb92a98bb749601b96d5fa1f2bdcba3805e7cff5be200fd98f3bb3`
- `heartbeat-worker` — SHA-256 `2cc1cb1676e582648002989f75259127421a223bbea1e47814f52366a9ca94c1`
- `systematic-debugging` — SHA-256 `808fc5717aa88ad65efff312b11c186294d3e6ee301afb584e2f86599b137787`
- `test-driven-development` — SHA-256 `bf1b8216e523851a411e91d429a7c1c2a173e79d88957bc78e348218d50edd54`
- `verification-before-completion` — SHA-256 `2befe7fc55bcadaa3d97dd9e8efeb633d2561c0ebe74c5a8b17c4d9e7e4520b3`

## Process review

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Cause: the final union retained a hand-built `LoadedHelpCorpus` cast written before recovery projections became required. The fixture bypassed the strict loader, so production admission tests could pass while this isolated integration fixture silently modeled an impossible final corpus shape.

Price: one 79.82-second final 25-file run was recorded as 977 pass/1 fail/1 todo, followed by a separate diagnosis node, about 27 minutes of deliberate lease wait while the live sample completed, one focused RED, and one full eight-test file GREEN. Token usage is unavailable. No additional live sample or broad suite was spent.

I nearly could have fixed only the expected outcome to `NO_SOURCE`, which would have hidden that the model was never called and weakened the health and spend oracle. I also could have added a fallback, which would have changed the branch to `ANSWER_GROUNDED`. Static source-to-sink tracing showed that the precise correction was the projection alone.

The packet was clear once it named the no-source distinction and conditional lease. Future corpus-schema changes should include a mechanical scan for `unknown as LoadedHelpCorpus` and similar hand-built fixture objects, with a shared fixture factory that requires the same projection fields as production admission. The final-union generator could validate fixture entries against the current `HelpCorpusEntry` contract before dispatch. That would turn this into a single planned correction rather than a post-union closure.

## Limits

The existing LIVE_P2 sample ran at `606b2eab`, not this later test-only revision. No runtime, preview, browser, provider, HTTP, or actual model execution occurred here. REV1_P3 owns correctness disposition. The Forgot password destination and owner acceptance remain unresolved; no CP1 readiness or acceptance is claimed.
