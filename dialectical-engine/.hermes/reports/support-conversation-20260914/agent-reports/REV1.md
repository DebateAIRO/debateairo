# REV1 case file — CP1 integrated correctness review, pass 1

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-14. Node `REV1`, ticket `t_9cd91ee7`, reviewer session `/root/plan_review`, exact product revision `6e5ab5fc41acebbff4264efc7d481df3db8dce44`, base `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.

## Cause and verdict

The correctness verdict is **REWORK**. The final server, storage, HTTP and UI path is well covered by focused tests, and the earlier 24,000-code-point context-cap and resolved-snapshot interface gaps are repaired. The finite LIVE4 run nevertheless returned the server safety replacement for the ordinary English question “How do I create a debate?”. Its isolated diagnostic window contains one valid `NARRATIVE_INTERNAL_IDENTIFIER` event, so the answer failed CP1-A09 and supplied no English action to verify. The rejected completion was intentionally discarded; its exact text and triggering identifier are unknown and must not be reconstructed from the category.

The deeper cause is a model-facing representation conflict. The prompt supplies canonical capability, source and action identifiers and routes as ordinary text, tells the model to reproduce selected identifiers in the JSON arrays, and simultaneously requires the natural-language field never to repeat them. A correct fail-closed screen can therefore turn a harmless copying error into a useless visitor refusal. Three earlier prompt/policy cycles and FIX4 improved the boundary, but the single remaining LIVE4 failure shows that another prompt-only adjustment is not a sound correction.

The bounded architecture upgrade is to give the model short, per-request opaque references for the selected sources and available actions, omit canonical machine identifiers and routes from every model-visible surface, and map accepted references back to canonical catalog IDs before the existing membership and navigation resolution. The model-visible capability headings, article headings, output contract and any projected metadata must all use the aliases or human labels. The text screen must reject both an alias and a canonical closed ID in narrative prose, so aliases cannot become unclickable visitor instructions. Keep the exact four-key envelope, one model attempt, current model/relay, reviewed content, strict text screen, server-owned labels/hrefs, canonical cipher write, public response shape and usage/refusal accounting. This is an explicit amendment to the mission’s internal CP1-R14 representation contract because its arrays currently carry canonical catalog IDs; it does not change the owner-visible product behavior or any owner requirement. A mission-contract amendment must precede implementation rather than being smuggled in as a parser tweak.

Server-side replacement of identifier substrings is smaller in code but mutates model prose without proving the resulting sentence is semantically sound. Removing the narrative guard would reintroduce the demonstrated visitor-text leak. Deterministic server-owned source/action arrays are robust but change more of CP1-R14 than necessary. Prompt tuning retains the same structural conflict and is rejected by the frozen correction ruling.

The exact Forgot-password destination, resolver action and both UI click paths remain **UNVERIFIED** under CP1-R05/R06/A05. This is a separate checkpoint blocker awaiting the owner-confirmed existing destination; it is not evidence of a code defect at the frozen unresolved state.

## What worked

- The route now passes the exact resolved immutable snapshot object into answer work, and a focused integration oracle asserts object identity before persistence/model work.
- The answer composition now uses the required initial 24,000-code-point ceiling and preserves whole knowledge sections.
- FIX4 centralizes normalized credential facts, separates input redaction from output relation policy, rejects closed narrative identifiers, and emits bounded per-attempt diagnostics. Its mutation logs show the relevant oracles fail when each guard is removed.
- LIVE4 exercised the compiled UI, actual Support API and unchanged relay exactly once for seven prompts. Six responses were useful and grounded; API text, sources and actions matched the DOM for every response; compact Romanian keyboard navigation reached `/login?next=%2Fnew`.
- The UI rejects malformed or noncanonical source/action decorations and bounds stale-snapshot recovery to one new session and one retry.

## Efficiency findings

- The repeated cost came from adjusting prompts and broad lexical rules before separating producer reliability from sink enforcement. After the first live category recurrence, a source-to-sink architecture trace plus two or three discriminating negative controls would have exposed the representation and relation problems earlier.
- A review packet should freeze the model-visible contract, the public response contract and the safety policy as three distinct interfaces. Their current prose is distributed across the spec, context builder, prompt builder and validator, which repeatedly forced reviewers to reconstruct the same boundary.
- Evidence should pair every acceptance row with a stable request sequence, exact revision and bounded diagnostic record from the first run. LIVE4 finally did this; earlier aggregate diagnostic counts could not identify which prompt failed and consumed another preparation cycle.
- Machine-readable manifests with path ownership and hashes made the final pass finite. Keep them. During this review I mistakenly tried `git diff --name-status 58fbaa7d132579a446977ca55b91c16371c40edc..6e5ab5fc41acebbff4264efc7d481df3db8dce44`; the copied pre-UI hash was wrong. The authoritative commit is `58fbaa7d5535dad89b479b98776cf2b8e88b978e`, which root later verified with `git -C <exact product lane> cat-file -t` as a commit. The earlier absence claim was review error, not repository evidence.
- The “one prompt machine” should dispatch implementation and review from one frozen contract that already states the response representation, safe rejection behavior, live matrix, evidence schema and decision rule after a failed matrix. That removes repeated clarification while preserving independent review rather than trying to make a single generative prompt enforce runtime safety.

## Measurements and limits

- Product HEAD and working bytes were verified clean at `6e5ab5fc41acebbff4264efc7d481df3db8dce44`. Source verification established HEAD `446c685e977104ecf2b0b5ee0519f7123968429f` only; the source tree had 56 tracked dirty paths and REV3 records a serialized-diff fingerprint gap, so REV1 does not claim clean or exact source working bytes. Contract and evidence freezes `de7138ffddff8109003d8b4617c509cae5fd8dd2` and `096638486c4f2eab450055c4b1d25ecd58a1ca54` were present.
- GATE records 99 changed product paths and patch SHA-256 `dc4b6087e944d96fc5ed9f9d4a7451c548fa39c70f7824d9770a33fd830e09ae`.
- Author evidence reports 21/21 focused files and 831 tests passed, with one explicit Forgot-password TODO. REV1 did not rerun those tests.
- LIVE4 reports six useful grounded replies of seven and one safely attributed identifier rejection. It made no retry. The raw rejected completion and exact triggering identifier are unavailable.
- No product, Git/index, stack, provider, browser, database or account mutation occurred in REV1. No real or synthetic request was issued.
- Transport-scope mistake: an unrelated `mcp__codex_apps__linear_list_comments` read was started at 16:31:34Z and interrupted by root at 16:42. Linear is outside this mission; no external result was received, read or used in either review artifact. The exact cause of the blocked connector call is unknown.
- The eleven LIVE4 browser console errors are classified as HTTP 401, but their precise origin and harmlessness remain unproved. This is an evidence limitation, not a new correctness finding in this pass.
- Actual token/cost usage is **UNAVAILABLE**.

## Skills actually read in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`

## Evidence-wording amendment

This amendment supersedes only the two evidence statements above. Prior self-report SHA-256 `7e9a6ef25592d607c9a64f4a834cd1e635782fac3df74b90758ca185b274651f` is retained for traceability; the verdict, findings and architectural recommendation are unchanged.
