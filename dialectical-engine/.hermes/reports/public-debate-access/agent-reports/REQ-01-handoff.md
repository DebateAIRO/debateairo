READY FOR PEER REVIEW — REQ-01 Grok requirements seat · ticket t_5c7a1e7f

## SUMMARY
Frozen mission compass + four slice SPECs for public-debate-access. INSTRUCTIONS.md is 62 lines (≤100). PLAN.md files are skeletons only (Architecture fills steps). V criterion-3 FULL PARITY ruling and Router READ-vs-mutation assumption are seeded in DECISIONS.md. No requirement contradictions routed up. Self-report filed at .hermes/reports/public-debate-access/agent-reports/REQ-01-grok.md.

## SLICE TABLE
| code | name | what Done means | files touched |
|---|---|---|---|
| S01 | Public publication envelope + publish path | New publishes carry tree + public-safe honesty fields; old-shape snapshots still read; no silent loss for the one existing publication | packages/contract PublicDebateSchema; apps/api publications.ts + public routes; contract/API tests |
| S02 | Public debate READ-parity UI | Anonymous/non-owner public page offers view toggles, tree, node cards, scoring diagnostics, honesty drawer, export; mutations absent | apps/ui/app/public/debate/[id]/; shared view components; public export/honesty surfaces |
| S03 | Your Debates / Public Debates navigation | Selectable accessible controls; Your → own debates (or sign-in CTA); Public → published list; works logged-out for Public | apps/ui/app/page.tsx (+ possible public list route) |
| S04 | Anonymous-exposure review | No user-linked identifiers; standing public-route bans hold; error/id invariants; explicit node-text identity verdict before mission close | s8 publication contract tests; QA verdict artifact |

## SPEC↔PLAN TRACE
S01 R1–R6 → PLAN traces R1–R6 (clusters S01-C1..C4 reserved).
S02 R1–R9 → PLAN traces R1–R9 (clusters S02-C1..C5 reserved).
S03 R1–R7 → PLAN traces R1–R7 (clusters S03-C1..C4 reserved).
S04 R1–R6 → PLAN traces R1–R6 (clusters S04-C1..C4 reserved).
No PLAN steps authored (requirements contract: Architecture fills). Every SPEC requirement has a trace heading.

## CONTRADICTIONS
(none). Tension recorded, not escalated as contradiction: owner export/scoring currently use owner-only side channels; SPEC requires public READ surfaces from public-safe data with label-honest typed absence — Architecture resolves HOW without violating security carriers ban. Already-published tree absence deferred as Architecture choice under ban on silent 404 / silent answer-only (S01 R4). Router READ-vs-mutation assumption remains a confirm row for V, not a contradiction.

## FILES WRITTEN
- docs/missions/public-debate-access/INSTRUCTIONS.md (62 lines)
- docs/missions/public-debate-access/slices/S01/{SPEC,PLAN,PROGRESS,DECISIONS}.md
- docs/missions/public-debate-access/slices/S02/{SPEC,PLAN,PROGRESS,DECISIONS}.md
- docs/missions/public-debate-access/slices/S03/{SPEC,PLAN,PROGRESS,DECISIONS}.md
- docs/missions/public-debate-access/slices/S04/{SPEC,PLAN,PROGRESS,DECISIONS}.md
- .hermes/reports/public-debate-access/agent-reports/REQ-01-grok.md
- .hermes/reports/public-debate-access/agent-reports/REQ-01-handoff.md

## VERDICT BLOCK
VERDICT: Mission decomposes cleanly into S01→S02 dependency with S03 parallelizable and S04 as close gate; anonymous plumbing already ships so criteria 1–2 are the nav build and criterion 3 is envelope+UI parity. (INFERRED from INTAKE + targeted READ of contract/publish/UI)
CONFIDENCE: high
STRONGEST COUNTER: Architecture may need a fifth slice or S01 split if public-safe scoring projection is a larger subsystem than envelope widening.

VERDICT: Back-compat optional/nullable (or versioned) fields are mandatory; required-field widen would 404 the live publication. (READ publications.ts catch-return-null; READ PublicDebateSchema .strict(); INTAKE)
CONFIDENCE: high
STRONGEST COUNTER: A one-shot migration of the single live publication at deploy could make required fields safe — still needs an explicit policy, which SPEC demands.

VERDICT: "Same UI options" for anonymous readers excludes delete/unpublish/replay and also challenge/investigation-record/memory-unlink. (INFERRED from Router assumption + READ of DebatePageClient mutation controls)
CONFIDENCE: medium
STRONGEST COUNTER: V confirm row might later include some of those as READ-adjacent; only V can widen.

VERDICT: Public export must not require the owner ledger-digest endpoint. (READ answerExport.ts ledger gate; READ s8 test forbidding public ledger-digest route)
CONFIDENCE: high
STRONGEST COUNTER: Architecture could mint a public-safe ledger digest projection into the snapshot — still not the owner endpoint.

VERDICT: Confirm-row existence on the V DECISIONS PACKET for the Router READ-vs-mutation assumption is UNVERIFIED (packet cited it; no absolute path given; seat did not hunt). (UNVERIFIED)
CONFIDENCE: UNVERIFIED
STRONGEST COUNTER: The row may already be filed under a path this seat did not open.

## COMMENTS READ THROUGH
ROUTER DISPATCH 2026-08-29T07:46Z; WORKER CLAIM (this seat).
