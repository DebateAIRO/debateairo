# REV3 pass 1 product-truth self-report

## Identity, scope, and verdict

- Ticket: `t_3699c305`; slice: `t_e584e488`; reviewer: `/root/baseline`.
- `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`; `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Reviewed revision: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`; intended-product base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`; source HEAD: `446c685e977104ecf2b0b5ee0519f7123968429f`.
- Contract freeze: `de7138ffddff8109003d8b4617c509cae5fd8dd2`; evidence freeze: `096638486c4f2eab450055c4b1d25ecd58a1ca54`.
- Verdict: **REWORK** for the complete product-truth lens. LIVE4 still fails the required English creation question, its pointer path cannot exist in the refusal state, and V-1 Forgot password remains independently UNVERIFIED and checkpoint-blocking.
- SKILLS LOADED from actual reads in this session chain: `using-superpowers`; `heartbeat-protocol`; `heartbeat-reviewer`; `verification-before-completion`.

## Material product finding

**REV3-P1-F1 — P1 — English creation guidance fails the manual oracle.** The exact actual-relay receipt sends `How do I create a debate?` once through the compiled full UI, actual anonymous Support API, and unchanged relay. It receives HTTP 200 with `REFUSE_SAFETY`, the server-authored human fallback, and zero sources/actions. The fixed request window contains one valid unique diagnostic with code `SUPPORT_DRAFT_TEXT_INTERNAL_IDENTIFIER` and predicate `NARRATIVE_INTERNAL_IDENTIFIER`; the other six windows contain no rejection event. The raw rejected completion was deliberately not retained, so the evidence does not identify the exact offending identifier and it must not be reconstructed.

The source-to-runtime trace is concrete at the reviewed revision. `apps/api/src/support/response-policy.ts:183-219` applies the closed narrative-identifier screen. `apps/api/src/support/answer.ts:285-317` diagnoses and parses the completion, substitutes `REFUSE_SAFETY` when parsing rejects it, and empties sources/actions. Lines 319-333 persist the canonical replacement and return the stored text. LIVE4 proves that API text/source/action projections equal the DOM. The product consequence is a direct failure of `SPEC-v2.md:64` (`CP1-A09`): one required benign question gives no prerequisites, limitations, reviewed sources, or Start-a-debate action. The English pointer check is therefore **UNVERIFIED** because there is no rendered action to activate.

Necessary verification after the review union selects an architecture: on a new exact revision, run the same seven-request matrix once with no retry. The first request must return useful grounded English creation guidance with reviewed sources and a canonical context-appropriate action; API and DOM must match; activate that rendered action by pointer. Preserve the six already-useful answer classes and the compact Romanian keyboard path. Do not use another prompt-only sample loop as acceptance.

## Retained findings and final dispositions

- UIFIX1 resolved the literal invalid `/settings#privacy` and `/settings#cookies` Help shortcuts. The final UI still uses the canonical privacy resolver for signed-in state, omits that action for guests, and invokes the existing cookie-preferences opener. No later FIX4 file touches this stable UI scope.
- Signed-in full/compact EN/RO rendering is evidenced only with synthetic identity, data, and Support API conditioning. It proves layout and conditional rendering, not real ownership or private-data authorization.
- LIVE4 improves the actual seven-question matrix to six useful grounded answers. EN/RO Settings and export, RO full creation, and RO compact creation are truthful in the finite manual oracle; all seven API text/source/action projections equal the DOM. Romanian full and compact creation expose `/login?next=%2Fnew`; compact keyboard Enter reached that destination.
- The three saved LIVE4 frames were inspected. Full EN visibly contains the refusal; full RO and compact RO retain the approved visual direction without an observed layout break. Static frames do not expose every transcript message, so the actual receipt remains authoritative for exact text.
- The fixed console classifier records 11 `HTTP_401` entries and zero `HTTP_404`, `JS_OR_HYDRATION`, or `OTHER`. It does not establish each error's origin or that each was expected or harmless.
- FIX4's 11-file kernel/server/test delta is exactly bound by GATE. Its 21-file author suite reports 831 passing tests and one Forgot TODO; the typecheck output matches the already-attributed 76-diagnostic baseline. These are consumed author/mechanical results, not a replacement for the failed actual product oracle.
- **V-1 remains UNVERIFIED.** The owner confirms Forgot password exists, but no exact URL or existing opener has been supplied. Its resolver behavior, required EN/RO phrases, pointer/keyboard activation, and zero Support-originated reset/credential submissions therefore remain unverified. CP1 cannot pass or become ready for owner verification.
- Status-label truth and the one-working-day versus 48-hour SLA presentation alignment remain explicitly deferred to CP3.

## Source-custody provenance

The retained intake and BASE receipts prove source HEAD `446c685e...`, an empty index, 56 tracked unstaged paths, and a serialized `git diff --binary` SHA-256 of `606ad70f...`. FREEZE-LIVE2 is the last retained matching fingerprint at `2026-09-14T14:04:30Z`; FREEZE-FIX3 is the first retained `dc9f0caa...` fingerprint at `2026-09-14T14:30:38Z`. The current source still has the same HEAD, empty index, 56 tracked unstaged paths, and `dc9f0caa...` default serialized fingerprint.

This proves a change in the serialized diff representation, not a change in original file bytes. The intake did not retain the full diff bytes, a full-index fingerprint, or hashes for all 56 tracked files. A bounded rerender under current bytes with explicit abbreviation lengths 4, 7, 8, 9, 10, 12, 16, 20, 32, and 40 plus `--full-index` did not reproduce `606ad70f...`; that does not rule out a historical Git configuration, abbreviation, object-count, or other representation change. The underlying cause, changed bytes, actor, and exact time within the interval are **UNVERIFIED**. Intake-wide source preservation must not be claimed.

The product baseline itself remains attributable: all 12 file hashes selected into BASE, including the two untracked evaluator tests, still match `baseline-manifest.json` exactly. GATE independently verifies all 99 reviewed product paths against commit and working bytes at clean `6e5ab5fc`. The unresolved source representation drift does not invalidate that exact isolated product inventory.

## Evidence quality and limits

- GATE manifest SHA-256: `ab6221c1e5e1a4fa3050854005a646242bbc7472522d2745077eea77a2da48f0`; immutable patch SHA-256: `dc4b6087e944d96fc5ed9f9d4a7451c548fa39c70f7824d9770a33fd830e09ae`.
- FIX4 consumption SHA-256: `281a0a333e5faa83f3d672848fe30bd04f27f9e6ea56e5561d67079273cd2c71`; LIVE4 consumption SHA-256: `dbf5c7bd12dc20dbb96dda8b604c66906454541d5d24ea90bd8032a734b882c5`.
- LIVE4 actual receipt SHA-256: `d0b121350586d3b1b7835a48f7fbf2f20dbbb611fb140065451678333e66f41b`; corrected diagnostic projection SHA-256: `71accbb829995b787e4aaa6a3bb66a52eeea0ee0c5c373dcc5197e36d6998377`.
- Preview custody is a consumed worker receipt: PID/PGID `91461`, PPID `1`, ordinary TLS 200, exact revision, and listeners retained after browser exit plus ten seconds. This reviewer did not make a fresh runtime measurement.
- No test, build, browser, provider/model request, service operation, product write, Git/index/ref change, credential/recovery operation, or raw private-log read occurred in REV3.
- Actual model-token usage is **UNAVAILABLE**.

## Process improvement case

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Four retained live gates show the main recurring cost: deterministic tests pass, then a stochastic completion violates a different output predicate and forces another preparation correction. LIVE3 ran 20 files/777 tests plus seven actual prompts; LIVE4 ran 21 files/832 tests plus seven prompts. Both also spent about a minute on an opaque first preview launch that exited before the unchanged second launch succeeded. The final LIVE4 evidence then needed a separate correction because its first diagnostic record exposed twelve fields against a seven-field evidence contract. Separately, an unresolved owner-only Forgot destination stayed in every cycle, and the source fingerprint lacked enough intake material to distinguish byte drift from serialization drift.

The next mission prompt should front-load machine-readable contracts and stop conditions:

1. Freeze the exact live question matrix, manual oracle, diagnostic schema, and artifact manifest before implementation. Generate consumers from one schema so the producer cannot emit an oversized receipt.
2. After the first actual benign false refusal, require an architecture decision before another author cycle. Deterministic tests should include every measured failure class, but a passing suite must never authorize another favorable-sample search.
3. Make the supported launcher return a fixed stage/cause code, PID/PGID, bound revision, ports, and readiness result. This removes manual marker polling and opaque unchanged relaunches.
4. Capture source custody at intake with `git diff --binary --full-index`, the exact Git version/config affecting rendering, and per-path hashes for every tracked diff member. That turns later drift into a bounded comparison rather than an attribution guess.
5. Represent owner-only dependencies such as Forgot as explicit blocked inputs. Continue independent work once, but do not repeat unchanged review or live evidence while that input is absent.
6. Let one orchestrator prompt advance only when structured gates agree: exact revision and inventory, deterministic suite, one immutable live matrix, three independent review verdicts, then owner verification. A known blocker must remain a blocker even when the packaging gate is green.
