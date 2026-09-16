# REV1 case file — CP1 correctness review, pass 2

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `REV1_P2`, ticket `t_b600a319`, reviewer session `/root/plan_review`, exact product revision `e0dcfe77f49655bea774bdfacf988b911be4ff06`, correction base `6e5ab5fc41acebbff4264efc7d481df3db8dce44`, evidence freeze `bb933856a4d8ca6781988a6cc548785da635fcff`.

## Cause and verdict

The scoped correctness verdict is **REWORK**. The request-local alias implementation solves the narrow identity and canonical-mapping problem: distinct request namespaces produce distinct source/action references, current references translate before canonical resolution, and stale, unknown, duplicate, alias-in-prose and canonical-ID-in-prose cases fail closed. It does not satisfy the governing F1 invariant because the context builder appends each selected article body verbatim. A bounded scan of the 24 frozen article bodies found literal route-like strings in 14 bodies, including `/new`, `/settings`, `/login`, `/sign-up`, `/public/debate` and `/help`. This scan does not enumerate legacy or in-code entries; the final correction must validate every entry and language in each shipped snapshot. The tests that claim the model projection has no routes use route-free fixture bodies, so they do not exercise the shipped corpus.

The practical failure remains separate and measured. The exact LIVE_P1 run made seven sequential one-attempt model calls; three returned useful grounded answers and four returned the generic safety replacement. The four diagnostics were `PATH_OR_ROUTE` three times and `CREDENTIAL_OPERATION` once. No rejected draft text or triggering span was retained, so this review does not call those rejections false positives or attribute them to the corpus route strings. It does establish that the current accepted-or-generic-refusal architecture fails CP1-A09 for ordinary creation and Settings questions.

The bounded upgrade is one reviewed-response architecture with two exact-byte KB projections. Each shipped article needs a complete model-facing factual projection that uses human labels and contains no canonical IDs, routes or repository metadata, plus a concise visitor-facing fallback in each shipped language. Both projections remain part of the immutable KB snapshot and editorial hash. Valid model drafts keep the current alias-to-canonical path. If a successful single model attempt produces a rejected draft for an otherwise source-matched request, the server discards the draft and returns the exact reviewed fallback for the deterministic top-ranked article, with canonical sources and only actions already admitted by the trusted resolver. Missing or invalid fallback bytes retain `REFUSE_SAFETY`; transport/degraded/no-source behavior stays unchanged. The server must record the bounded rejection diagnostic and the original model usage, and no rejected text may enter storage, HTTP, UI or case summaries.

This requires an explicit amendment of the current internal CP1-R14/R15/R16 contract: CP1-R14-ALIASES currently forbids generated server-owned replacement answers, while reliable CP1-A09 behavior cannot be obtained from another stochastic prompt cycle. It remains within the owner-visible product intent only if a reviewed, source-attributed fallback after a real model attempt counts as a model-backed Support answer. If “model-backed” requires the final narrative bytes to originate from the model, that interpretation needs an owner decision rather than a silent implementation change.

## Price of the defect

- The latest correction changed 16 files with 604 insertions and 94 deletions, and its focused evidence covered 381 tests. The final integrated command then spent 79.78 seconds running 23 files and reported 935 passing tests plus one Forgot-password TODO, yet the real seven-row matrix still produced only 3/7 useful responses.
- Four of seven actual model calls consumed their one allowed attempt without delivering useful guidance. Exact provider tokens and cost were not exposed, so a monetary or token total is **UNAVAILABLE**.
- The recurring cost came from treating prompt conformance and rejection precision as a reliability mechanism. Recognized rejected drafts took the safe fallback, but every remaining stochastic deviation became a visitor-visible dead end. The security lens reports current accepted-output gaps, so this review makes no general safe-sink claim. The alias change also addressed only catalog headings and the output arrays; it did not mechanically check the selected article bodies that form most of the prompt.

## What I nearly got wrong

I nearly accepted F1 after checking the alias factory, canonical translation and route-free unit fixtures. Tracing `articleSection` to the exact frozen corpus changed the result: the function concatenates `entry.body`, and 14 real bodies contain route-like strings. The invariant had to be checked against production inputs, not inferred from a synthetic fixture.

I also avoided a stronger unsupported claim. The three `PATH_OR_ROUTE` diagnostics are compatible with the model repeating a supplied route, but the discarded text is unavailable. They do not prove which token appeared or that the screen rejected safe text. The one `CREDENTIAL_OPERATION` event likewise does not establish whether the Romanian Settings draft was safe or unsafe.

## Dead ends to stop repeating

- Another prompt wording pass leaves usefulness dependent on one unconstrained completion.
- Relaxing `PATH_OR_ROUTE` or `CREDENTIAL_OPERATION` from category-only evidence risks reopening the already demonstrated output classes.
- Replacing substrings in arbitrary model prose can change meaning and does not prove the repaired sentence is grounded.
- More model sampling or richer rejected-text logging would spend traffic and weaken the privacy boundary without creating a deterministic product contract.
- Reusing the full article body as a fallback would expose the same routes, markdown and credential-operation phrasing that the current model screen is designed to contain.

## Making the coding and review loop more efficient

The first implementation packet should carry three machine-checkable contracts: the exact model-visible projection, the accepted public projection, and the deterministic behavior after a rejected draft. A corpus-wide invariant should load every shipped entry and reject any canonical capability/source/action ID, catalog route or repository-path metadata before model use. Synthetic service tests should force every rejection predicate and prove the exact reviewed fallback, storage/HTTP equality, trusted actions, accounting and raw-draft absence before the one live matrix is authorized.

That would make the mission closer to a one-prompt machine: the initial prompt would select the already-decided architecture and finite oracle instead of asking successive agents to rediscover what “safe and useful” means after each live refusal. The independent review remains necessary, but it can check a frozen representation and deterministic recovery contract rather than reconstructing distributed prompt, policy and corpus assumptions.

## Measurements and limits

- The 21-input lens index and all 103 current product hashes were mechanically verified against the frozen manifests with zero mismatches. GATE_P2 manifest SHA-256 was `656c3390c7e65de70f3708eb38ac24e89efcbfaf7a0426e48686abe291b44949`.
- Static article-body scan: `route-bearing bodies: 14/24`; this was a read-only regex inventory of the 24 frozen article bodies, not a census of legacy or in-code entries or a formal proof that no other machine identifier class exists. The correction must cover every entry and language in each shipped snapshot.
- Author/runtime evidence was consumed as evidence, not rerun: 381 focused tests; 23/23 integrated files, 935 passed plus one TODO; 3/7 useful actual responses.
- The product was not modified or executed by REV1_P2. Final readback returned exact HEAD `e0dcfe77f49655bea774bdfacf988b911be4ff06` and empty porcelain status. No model, browser, HTTP, database, account, credential, reset or external-connector request occurred. Source working-byte exactness was not asserted; only required HEAD `446c685e977104ecf2b0b5ee0519f7123968429f` was checked.
- After drafting, root relayed category-only security-pass2 interim results. I did not read or reproduce that evidence and did not use it to infer any LIVE_P1 cause; the architectural recommendation now explicitly delegates fallback admission to the final security invariant rather than the current lexical predicate set.
- The Forgot-password destination and both click paths remain **UNVERIFIED**, independently blocking CP1.
- Actual token/cost usage for this reviewer is **UNAVAILABLE**.

## Skills actually loaded in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging` (retained from the same continuing reviewer session)
