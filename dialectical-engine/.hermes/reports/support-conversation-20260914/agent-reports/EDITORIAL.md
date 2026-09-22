# EDITORIAL case file — CP1 exact-byte bilingual review pass 1

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `EDITORIAL`, pass 1/3, ticket `t_48916645`, reviewer session `/root/plan_review`, reviewed product commit `fb47b34eac5d72b324def7499828de15cf44b9ba`.

## Cause and result

The knowledge set is structurally disciplined: one manifest identifies the 24 new or changed article bytes, the catalog has a canonical serialization, action destinations are constrained, and the unresolved Forgot password action remains unavailable. The pass still found a user-facing truth collision. The human-case article says Support does not promise a response shorter than 48 hours, while the full-page Support rail promises weekday replies within one working day. Both statements are reachable in the same product and cannot be presented as one coherent SLA. No editorial attestation was emitted for these bytes.

The MFA article also calls the post-password requirement an “authenticator step” before explaining that a saved recovery code is an alternative. The live page describes a required second step that can use either method. That wording is recoverable without changing the policy, but the article should use the product’s two-step language.

## What must improve

- Put the human-response target in one product-owned constant or template consumed by the server receipt, full-page Support rail and knowledge article. A single source would prevent a future 48-hour/one-working-day split.
- Generate an editorial claim matrix from article front matter before review: article sentence, source locator, action IDs, route, EN text and RO text. The reviewer should only need to confirm each row against live composition.
- Make packet tooling resolve and print both the repository worktree root and the nested product cwd. I initially ran `git rev-parse HEAD` from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, which resolves to the source checkout, then incorrectly inferred that the review lane had moved. Explicit `git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1 ...` showed the lane remained at the required commit. The inference was corrected and no mutation occurred.
- Avoid whole-tree archival for an exact-byte content review. The temporary archive was about 624 MB although only the KB and a small set of source windows were needed. The exact worktree was already available.
- Keep source reads claim-sized. One broad parallel source batch produced truncated output and forced smaller rereads. A generated source-window list would cut tokens and make missing evidence visible.
- Add an automated visitor-copy consistency check for duplicated promises such as SLAs, security prerequisites and route labels. Hash checks prove byte identity; they do not prove that two shipped surfaces agree.

## Dead ends and token costs

- The source-checkout/lane-path confusion produced an unnecessary state alert and extra worktree inspection. The packet had the exact nested cwd; every git command should have used it literally.
- A full commit archive was unnecessary and consumed disk I/O. Direct reads from the clean KB subtree at the exact lane commit were sufficient.
- A 26k-token batched source read was truncated. Smaller targeted reads recovered the evidence but duplicated work.
- Re-reading already summarized article prose was useful for exact line citations but could have been replaced by a prebuilt bilingual sentence table.

## Measurements and limitations

- Exact manifest hashes: 33/33 matched the required lane bytes.
- Article inventory: 36 files, 18 complete EN/RO pairs.
- Canonical catalog: 6,655 UTF-8 bytes; SHA-256 `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe`.
- Visitor-body internal-path/reviewer/evidence leakage matches: 0.
- Heavy tests, builds, services, providers and runtime preview checks: 0.
- Owner ratification, the exact Forgot password destination, runtime behavior and UI acceptance remain unverified.
- Exact model-token usage is **UNAVAILABLE** from this harness.
