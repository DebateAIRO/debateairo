# AI Provider Register — what to fill in after hosting

2026-09-30. The Privacy Policy (§5) says the Register at `/providers` is part of the policy.
Japan (APPI Art. 28) and South Korea (PIPA Art. 28-8) need most of the same facts, and we show
them to every user.

## What changed

- `/providers` now shows one table per provider with these rows: models, company, home country,
  what it receives and why, where it processes, how long it keeps data, zero data retention,
  whether it may train on your data, transfer basis, contact, and the date last checked.
- The page has a new row for the **support chat's model**. It had none before, although the
  support chat sends what users type to a model (`apps/api/src/support/model.ts`; in development
  that is `z-ai/glm-5.3-flash` through Hermes).
- Privacy Policy §5 now says the Register applies to every user, lists the four jobs (arguments,
  judging and checking, verdict story, support chat), adds "how to contact it", and says that
  support chat messages go to the support chat's model. This is in all 35 languages.

## Where the facts live

All facts are in `PROVIDER_REGISTER` in `apps/ui/lib/legal/pages.ts`. Filling a fact there
updates all 35 languages at once. A value in square brackets is shown exactly as written and
means "not confirmed yet". Contact emails become links once the brackets are removed.

| Field | Now | Fill with |
| --- | --- | --- |
| `entity` | `[Anthropic …]`, `[OpenAI …]`, `[Google …]`, `[xAI …]`, support `[…]` | the legal entity named in the contract we sign |
| `homeCountryKey` | United States (cloud), `[to confirm]` (support) | a country key in `legal.json` |
| `purposes` + `purposesConfirmed` | all three debate jobs, not confirmed | the jobs the production roster gives that provider; then `purposesConfirmed: true` |
| `locationKey` | `[to confirm]` | the region the endpoint processes in |
| `retentionKey` | `[to confirm]` | a new `legal.json` key with the period and the reason (all 35 locales) |
| `zeroRetention` | `"unconfirmed"` | `"yes"` or `"no"` for the endpoint and features we use |
| `training` | `"unconfirmed"` | `"no"` once the contract says so (also remove the bracket in `legal.providers.intro`) |
| `basisKey` | `usBasis` (bracketed) | DPF or SCCs, per provider |
| `contact` | `[…]` | the provider's privacy contact (email or page) |
| `checkedOn` | `null` → "[not checked yet]" | the ISO date you checked the row, e.g. `2026-10-15` |

The render tests (`tests/render/legal-pages.test.tsx`) refuse a cloud row whose contract facts
are filled while `checkedOn` is still `null`. So a row is filled and dated in the same change.

## Open questions for V

- The Gemini row stays, as before. The legal-pages intake notes Gemini is not wired.
- Other recipients in §5 (hosting, Cloudflare, email relay, payments) say they are "in the
  Register", but the Register lists only model providers. Adding them is a separate change.
- The support chat's development model (GLM, Z.ai) is a China-based provider. Your working plan
  says no China-hosted APIs, so production needs a different support model or an EU-hosted copy.
