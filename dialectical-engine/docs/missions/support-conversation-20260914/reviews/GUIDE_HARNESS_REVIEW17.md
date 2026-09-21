# GUIDE_HARNESS_REVIEW17 — oracle and segmented affected-check plan

- Ticket: `t_994ae292`; run `209`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T18:05:29.783594Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `c1d7b4cbfcea80cb31918f5f24bd0025f157e104`
- Verdict: **PASS_BOUNDED_ORACLE_AND_SEGMENTED_PLAN**

## Oracle correction

The changed matrix admits `app-navigation`, `guide-how-it-works`, or `debate-workspace-menus` as the primary source for only the two broad guide rows, sequences 25 and 26. The imported observation verifier still requires the selected primary source to belong to the row's production-derived proof context. It additionally requires a useful answer: `app-navigation` answers must name or explain Method, Transcripts, or the library's Compact Help; Guide/workspace answers must describe debate-local guide content. A generic sentence fails even with a valid source ID.

The local-control boundary remains closed. English and Romanian questions about the named `How it works` control in an already-open debate accept only Guide or debate-workspace authority and must describe debate-local content. `app-navigation` alone is rejected, and generic library Compact Help cannot substitute for the named debate-local control. Empty, duplicate, changed and proof-external source sets remain rejected by the retained source-policy and membership controls. API/DOM equality, action binding, fixed diagnostic attribution, deterministic privacy/recovery/injection behavior and actionlessness remain unchanged.

The focused evidence accurately distinguishes an old-oracle RED from a corrected-oracle GREEN. BIND16 rejects the observed row-26 public projection because `app-navigation` is absent from the old expected-primary set. BIND17 accepts that same already-observed public answer because its source is in the real proof context and the answer describes library Compact Help. This is an oracle correction; it does not relabel LIVE8 as successful and does not substitute a new favorable model response.

## Retained LIVE8 boundary

Retention is proved for only the first two complete LIVE8 groups:

- `lifecycle-full-en`: sequence `1`;
- `full-ro`: sequences `2,7,11,15,19,23,27,31,35,39,41,47,51,43`.

The 15 rows match both the old and corrected matrix bytes row-for-row, so neither changed broad-guide row is retained. Each retained row binds its public prompt, branch and proof, HTTP 200 body, visible DOM projection, diagnostic, attribution, selected locale, session-create count and a separately indexed screenshot path/hash. All 15 have equal API/DOM text, sources and actions. The manifest binds product revision `152eed4d...`, KB version `fd3c63e...`, runtime model `development:hermes-glm-5.3-flash`, actual Support API/relay/browser configuration, no synthetic Support override, no private records and zero credential/recovery operations.

The first row created session 1. The language-boundary first row of group 2 created session 2, and all remaining group-2 rows completed in its canonical order through terminal injection sequence 43. The later compact/RO group created a distinct session 3, which bounds the end of the retained group. The five successful compact/RO rows `3,10,14,18,22`, failed row 26 and the rest of that partial group are excluded. LIVE8 remains a failed 20-of-54 capture.

Conversation history does not cross the composition boundary: production passes `historyText: ""`, the KB rejects nonempty history, and the fresh work begins with a new profile. PROBE6 is retained only for unchanged browser transition behavior; it supplies no fabricated continuity between capture segments.

## Fresh affected execution

The capture is closed to complete groups 3–5 in their existing order:

- compact Romanian, 13 rows: `3,10,14,18,22,26,30,34,38,46,50,6,54`;
- full English, 12 rows: `9,13,17,21,25,29,33,37,45,49,5,53`;
- compact English, 14 rows: `4,8,12,16,20,24,28,32,36,40,42,48,52,44`.

This requires exactly 39 actual message requests and exactly three new Support sessions. Both changed broad-guide rows, 25 and 26, are fresh. Group 3 starts in a new browser profile. Before groups 4 and 5, the adapter deletes the one Support conversation session-storage key, verifies its absence, remounts the required surface and then requires one new, unique session on the first response. Later rows in each group must preserve that session. There is no skip, resume, partial-group acceptance or retry path. Request starts follow the canonical list at least 31 seconds apart, with no more than 20 starts in any rolling ten-minute interval.

The final artifact may state only `15 retained + 39 fresh = 54 logical rows`. It must not state that 54 rows ran fresh or that LIVE8 passed. If any retained binding changes or cannot be proved at dispatch, the fallback is a fresh full54 after natural capacity becomes available.

## Capacity, browser and sealed composition

The fresh gate must be measured no more than 120 seconds before validation, with at most five seconds of future clock skew. It must show at least three free anonymous session slots for the hour, zero anonymous messages in the recent ten-minute window, at least 39 daily anonymous-message slots, at least 14 messages per session, at least 84 characters per message, one relay slot, one queue slot, at least 42 remaining daily model calls, injection lock threshold at least two, no IP cooldown, no relay waiters and relay state `AVAILABLE`. These are admission checks against unchanged limits; the harness does not mutate quotas.

The BIND16 hydration/opening/read/send helper blocks are byte-identical in BIND17, and the checkpoint writer, checkpoint regression and zero-request probe are unchanged. The retained PROBE6 receipt proves five UI transitions with zero Support traffic. BIND17 changes only capture scheduling, the source oracle, capacity thresholds for the affected plan, the fresh-session state machine and their inert controls. The eight-file digest recomputes to `b4880079137a603ffde919dd1f563162d3a1f93878a369ef16dbeba5912e577d`. The sealed proof contains all 136 predecessor purpose names as an exact prefix plus 15 additions, for 151/151; the author verifier frame passed 147/147. Matrix54 and row-proof adapter negatives 3/3 remain bound. All 184 review inputs, 138 author inputs and 43 author receipt artifacts matched their hashes and sizes. The 41 reserved actual outputs were absent at review.

The author disclosed two packaging failures. The first failure log was overwritten and is unavailable; the second retained log records the digest mismatch before the final successful packaging frame. This review does not infer an unrecorded verifier rerun or erase that custody limitation.

## Exact future command contract

Neither sealed BIND17 README contains a literal execution command. Both actual entry points import TypeScript, so the later LIVE9 packet must bind the `tsx` loader explicitly. From the clean product worktree, using one newly measured absolute gate path, run the all-54 inert row proof first:

```sh
node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_ROW_PROOF_BIND17/replay-row-proofs.mjs /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-gate.json 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_ROW_PROOF-run-LIVE9.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_ROW_PROOF-LIVE9.log 2>&1
```

Only after that output reports all 54 proofs passing, and while the same exact gate remains fresh, run the 39-request capture:

```sh
node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND17/capture-public-guide.mjs /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_LIVE9-gate.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_LIVE9-capture.log 2>&1
```

The LIVE9 packet must assert exact argv, cwd, gate, output and log equality before launch. Direct redirection preserves child status. Extra arguments are outside the reviewed contract. The row adapter itself enforces the absolute gate, exact revision and an evidence-root output named `GUIDE_ROW_PROOF-run-*.json`; the capture accepts one absolute gate argument and writes the unique built-in GUIDE17 receipt and 39 screenshot paths.

## Limits

This is a finite static PASS for the corrected oracle and segmented affected-check plan. No row proof, 39-request capture, gate, status/capacity read, browser, runtime, HTTP, database, Support/model request, product/KB/Git/harness mutation or private-data access occurred. It is not a live result, product-quality verdict, readiness, checkpoint acceptance or owner acceptance. Forgot remains unresolved and actionless; CP1 remains incomplete and CP2 gated.
