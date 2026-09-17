# ARCHITECTURE PACKET — F-T1-ORACLE-EVALUATOR · a sound evaluator for the depth oracle's derivation arm · V-ruled (D68) · plan only, no code

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
ticket        : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-T1-ORACLE-EVALUATOR.md
V's ruling    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/V-DECISIONS-PACKET.md — row "F-T1-ORACLE-LOGINFP — V's ruling" · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md — D68
the history   : lane/t1-oracle-loginfp (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp @ 60641339) — three rounds of heuristics, each fixing the reported false positive and each with a hole codex could name:
                r1 /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/codex-r1-verdict.final-snapshot.md · r2 …/codex-r2-verdict.final-snapshot.md · r3 …/codex-r3-verdict.final-snapshot.md
                the seat's reports: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md · -self.md   (read the three verdicts FIRST; they are the specification's negative space)
the oracle    : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts at 60641339 (its 27 layout classes, three bare option-domain controls and eight mutants are your control corpus) and at 2af816f1 (the pre-lane oracle)
the corpus    : the shipped files the oracle scans (packages/, apps/, web/ under /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine; six skipped directory names declared in the scan configuration)
role          : heartbeat-architecture (read /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.claude/skills/heartbeat-architecture/SKILL.md as markdown if the Skill tool cannot load it) · load superpowers:brainstorming and superpowers:writing-plans
output        : ONE plan file — /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md — plus /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-arch-self.md. No code. No worktree needed; read only.
```

## OUTCOME (D58)
A plan a worker seat can execute in rounds of max 3 and codex can review for soundness BEFORE any code exists, for an evaluator that decides
"does this single declaration derive the ruled option domain 1..5?" soundly for a DECLARED grammar, conservatively outside it, with one
occurrence decision per declaration and a lexer that knows what is not syntax.

## What the three verdicts require (turn each into a plan section with an acceptance test)
1. **Lexical structure first (r3 B3):** strings, template literals and regex literals are not syntax; occurrence addressing and declaration
   boundaries come from a token stream, not from punctuation in raw text. Comments handled once, in place. State how regex-vs-division
   ambiguity is resolved or bounded, and what the existing lexer already does (`kindOfCeilingLiteral`, `kindOfExclusiveBound`, the
   declaration lexer — reuse or replace, say which and why).
2. **One occurrence, one decision (r2 B2, r3 B3):** a single classification per declaration with source correspondence carried to every
   reporting window; no second pass over a normalised representation that can disagree.
3. **A declared grammar with real semantics (r2 B1, r3 B1, r3 B2):** array literal (with trailing comma, `as const`, parenthesised),
   member operations by NAME not position (`slice` with integer-literal args incl. negatives, `reverse`, `sort` default and comparator-
   unknown, `map` with a declared callback subset — identity, `n => n || k`, arithmetic on n — else unknown, `filter` unknown, computed access
   `["slice"]`), composition in order (permutation THEN slice), wrapping (`new Set(...)`, spread, destructuring with rest, sentinel drop),
   terminal selection (a terminal operation can still yield the domain — r3 B1). Give the abstract domain (concrete value list; ordered;
   plus `unknown` with a "can a later selector reach 1..5 from this" answer) and the rule for every operator. OUTSIDE the grammar →
   `undetermined` → REPORTED as a site (a false positive is visible; a miss is not).
4. **The ruled domain:** a run spelling 1,2,3,4,5 is a site wherever it sits and however wrapped (the three bare option-domain controls);
   `[1,2,3,4,5,6]` bare is NOT (a six-page list); `[1..6].slice(0,-1)` IS.
5. **dev's LoginFlow six login slots** (`apps/ui/components/LoginFlow.tsx:252`, `{[0, 1, 2, 3, 4, 5].map((slot) => (<span …/>))}`): a MODELLED
   case — a 0-based index run whose terminal callback renders JSX and whose result is not a selector — not a filename or shape exemption.
   Say exactly which rule makes it negative and prove the same rule keeps `[0..5].map(n => n || 1)` inside `new Set` positive.
6. **Controls and mutants:** the 27 layout classes and eight mutants from 60641339 are the floor; add codex r3's classes (terminal selection,
   permutation-then-slice, literal punctuation in strings/templates/regexes). Each mutant must map to one clause of the design.
7. **Module boundary:** where the evaluator lives (inside the test file as now, or a `tests/support/` module the test imports — the
   oracle scans packages/apps/web, not tests, so this is test infrastructure), its size, and how the existing arm is replaced without
   touching the ceiling-literal and exclusive-bound arms (codex confirmed they are intact and must stay so).
8. **Rounds:** split the work into worker rounds of ≤ 1 file each with RED-first acceptance per round; name what each round's codex review
   must check. Say plainly what is day-scale and what is not.
9. **STRENGTH (D67):** every claim in the plan carries entailed / consistent-with / undetermined; unknowns are listed, not smoothed.

## Method
Read the three verdicts and the round-3 test; brainstorm alternatives (superpowers:brainstorming) before committing — at least: a hand-written
recursive evaluator over a tiny AST vs. using TypeScript's own parser (`typescript` is in the repo's dependencies — say whether it is
available to tests and what it costs) vs. keeping heuristics with declared limits (V rejected this; say why it fails on r3's classes so the
record shows it was weighed). Recommend one. Do not write code. Do not run suites.

## Contract (D61)
allowed  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-arch-self.md
readonly : everything named above · the repo at /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp (read only; do not create a worktree; do not run pnpm)
forbidden: all_others · no code · no git mutation · no edits to the board or the DECISIONS file · no credential values (D18)
Markers: `comments read through: t1-oracle-loginfp-codex-r3-2026-09-06`; end with `PLAN READY FOR REVIEW` or `BLOCKED <reason>`.
Self-report: the router §3 question verbatim ("treat it like a murder case…").

# ---- AMENDMENT 1 (09:19 2026-09-06) — ARCHITECTURE ROUND 2 OF 3 · after codex PLAN review r1 (CHANGES: 8 blocking, 2 follow-ups) ----
verdict (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/codex-plan-r1-verdict.final-snapshot.md — read it WHOLE; its section "Exact revision requested
from the architecture seat" is this round's contract, and B1–B8 are the reasons. In one line each:
B1 successful lexing is not evidence of correct lexical context (specify the successful-token contract: control-condition vs expression parentheses,
JSX tags/attributes/text/expression containers, nested templates, balanced transitions; assertions on the named inputs) · B2 NOT_NUMBERS absorbs
incorrectly across value-producing callbacks (distinguish "all current elements nonnumeric" from "later results cannot be numeric"; re-evaluate
map/flatMap output sort independently; UNKNOWN where concrete info was discarded; define joins) · B3 an opaque filter is not necessarily a
subsequence of the pre-call values (subsequence only for callbacks proven unable to mutate/invalidate; arbitrary bodies → UNKNOWN; state purity and
built-in-binding assumptions) · B4 no complete expression-ownership / wrapper-binding grammar (closed expression/binding grammar with parse-result and
consumed-span contracts; which parent acts on which value; where evaluation stops; rule-1 precedence; unknown surrounding constructs → UNKNOWN
without losing the occurrence) · B5 token punctuation still does not identify the enclosing statement/occurrence (obtain the owning statement
structurally or revise the address policy to candidate offsets/lines; stable occurrence identity by offsets; ceiling-arm dedup separate; assert
exact addresses/spans/cardinality incl. ASI cases) · B6 the "zero cost" measurement used the OLD candidate population (state candidate eligibility
incl. empty/mixed arrays and numeric syntax; inventory the population; measure exact candidate/verdict/reason/site lists for the selected design;
model proven nonnumeric uses such as includes or account for them) · B7 the promised acceptance and round states are mutually inconsistent
(complete the five callback fixtures and four group entries with their wrapping/comment variation; separate truncated-input conservative controls;
declare the floor adaptation; replace round-2 predictions with an exact list generated from the defined stub or give round 2 a different explicit
acceptance) · B8 twelve mutants neither cover every clause nor discriminate (build a clause → non-equivalent mutant → exact discriminating control
matrix after B1–B7; remap m4/m7; derive m3′'s failing set; cover unassigned clauses; separate m6's expected-survival check; twelve is not a ceiling).
F1: retaining the old ceiling lexer for the other arms is acceptable scope, with its inherited limit stated concretely.
The plan is REVISED IN PLACE by dated sections (a "Revision 2" block per affected section; the original text preserved and marked superseded where
it is), not rewritten — the reviewer cites line numbers. Same grants (the plan and your self-report). STRENGTH on every claim. No code.
Markers: `comments read through: t1-oracle-evaluator-plan-codex-r1-2026-09-06`; end with `PLAN READY FOR REVIEW` or `BLOCKED <reason>`.

# ---- AMENDMENT 2 (15:34 2026-09-06) — ARCHITECTURE ROUND 3 OF 3, THE LAST · after codex PLAN review r2 (CHANGES: 6 blocking, 2 follow-ups) ----
verdict (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/codex-plan-r2-verdict.final-snapshot.md — read it WHOLE; "Exact changes for the architecture
seat's LAST round" is this round's contract; R2-B1–B6 are the reasons. The classic-parser architecture is RETAINED (the reviewer says so). In one line each:
R2-B1 the callback value domain cannot implement its own predicate controls (define a concrete primitive expression-result type preserving boolean
truth until operators/conditionals/filters consume it; when results abstract into array cells; ToBoolean for NaN and strings) · R2-B2 the NOT_ARRAY
list includes operations that return arrays (split the operation list by actual return contract and receiver knowledge; unsupported reduce → UNKNOWN;
find/at/indexing need known element info or → UNKNOWN; .length vs member access distinguished; keep the narrow includes → boolean) · R2-B3 the
ownership walk stops before unmodelled value-producing syntax (unmodelled enclosing calls → UNKNOWN and advance the consumed span to the rejected
containing use; rule-1 precedence; the internal ownership result for nested array/binding extraction, collection kind, multiple bound outputs) ·
R2-B4 parse failure and the carried fixture floor require incompatible outputs (file-level parse failure conservative: exactly one INCONCLUSIVE with
path/line/diagnostic per deliberate truncated fixture, no fabricated DOMAIN occurrence; public signatures and relationship of parseModule / the
fragment harness — which must NOT silently re-lex the ceiling arms, F1) · R2-B5 the revised round states still cannot all be green as scheduled
(preserve candidate-vs-emission separation with ONE explicit stage contract; per-round green sets that are actually reachable) · R2-B6 the clause
matrix still has equivalent controls and missing assignments (finish the clause → non-equivalent mutant → discriminating control matrix).
F1 (inherited ceiling lexical defect) is correctly scoped: carry it as the named follow-up; pin ceiling behaviour during extraction.
F2 (round 0 needs an execution gate in the worker dispatch) is the ORCHESTRATOR's — I write it into the round-0 dispatch; you may list what it must
prove. D-R2-1 authority is CLEAR (D68 ADDENDUM): mark the stale "grant does not exist" / U9 text SUPERSEDED in this revision.
Revise in place as before (dated "§N — REVISION 3" blocks; originals preserved and marked). STRENGTH on every claim. No code. This is the LAST
architecture round: what the reviewer still finds open after it goes to V as a plan decision. Markers: `comments read through:
t1-oracle-evaluator-plan-codex-r2-2026-09-06`; end with `PLAN READY FOR REVIEW` or `BLOCKED <reason>`.

# ---- AMENDMENT 3 (16:39 2026-09-06) — V-AUTHORISED BOUNDED ARCHITECTURE ROUND (V's ruling, V-DECISIONS-PACKET) · after codex PLAN r3 (CHANGES: 5 bounded) ----
V ruled: one more architecture round, LIMITED to the five items codex names in "## For V — the residual" and specified in R3-B1–B5 of
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/codex-plan-r3-verdict.final-snapshot.md. Read that verdict WHOLE. Nothing else in the plan changes in this round.
1. R3-B1 — preserve primitive information across array operations, or use UNKNOWN explicitly where the stored abstraction cannot decide; repair
   exact unary coercion and Set equality together (the reviewer executed the examples: primitive values disappear before the next operation needs them).
2. R3-B2 — a member must be the call's CALLEE before its named return contract applies; a method reference used as an argument is not an
   invocation → consume/report the unknown containing call.
3. R3-B3 — make the discovery/evaluated records and the INCONCLUSIVE union TYPE-VALID at their first round; state the actual stub RED set.
4. R3-B4 — route 27 ceiling controls and three bare DOMAIN controls to their proper harness/stage in the WORKER STEPS (not only in §5.4), preserving
   both omitted standalone negatives.
5. R3-B5 — replace mutation labels with the operative rule-edit / control / observable / result MANIFEST; require the four O1 semantic controls
   before evaluator implementation; display/identity mutation coverage may stay a named follow-up with exact address/display assertions.
Also: the Node runtime — V accepted the round-0 gate under Node 25.7.0 with "Node 22.23.1 UNVERIFIED" as a named fact (D68 ADDENDUM 2); adjust
§9.12 R3 fact 2 accordingly (record the versions actually used; do not claim 22.23.1).
Revise in place ("REVISION 4" blocks, originals preserved). STRENGTH on every claim. No code. Execute every example against its own rule before
filing (the seat's own named failure mode). Markers: `comments read through: t1-oracle-evaluator-plan-codex-r3-2026-09-06`; end with
`PLAN READY FOR REVIEW` or `BLOCKED <reason>`. This round exists by V's authority only; after it, the plan's disposition is V's.
