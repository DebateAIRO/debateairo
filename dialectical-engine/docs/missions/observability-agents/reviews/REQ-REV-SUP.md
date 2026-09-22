# REQ-REV-SUP — verdict on SupportAgent requirements (round 1)
SKILLS LOADED: using-superpowers (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`), heartbeat-protocol (`.claude/skills/heartbeat-protocol/SKILL.md` and `.grok/skills/heartbeat-protocol/SKILL.md`), heartbeat-reviewer (`.claude/skills/heartbeat-reviewer/SKILL.md`), verification-before-completion (`superpowers/6.3.0/skills/verification-before-completion/SKILL.md`), systematic-debugging (`superpowers/6.3.0/skills/systematic-debugging/SKILL.md`), heartbeat-requirements (`.claude/skills/heartbeat-requirements/SKILL.md`, author floor, read as markdown), debateai-heartbeat-protocol (`docs/agent-protocols/debateai-heartbeat-protocol.md`), grok-heartbeat-adapter (`docs/agent-protocols/grok-heartbeat-adapter.md`)
## Verdict: REWORK
## Packet review (P-findings against the orchestrator's packet)

P-1 · `.hermes/planning/observability-agents/packets/REQ-SUP.md:8` · packet says review route is "REQ-REV-SUP (Fable 5.1, blind)" → a Fable seat would be dispatched onto a Fable-authored artifact, contradicting H0's 2026-09-02 roster (review is Codex Sol Max / Opus / Fable, cross-house) and this seat's actual dispatch. Evidence: H0 lines 75–87; this packet `REQ-REV-SUP.md:6` names Codex Sol Max; user instruction overrode that label to Grok 4.6.

P-2 · `packets/REQ-REV-SUP.md:6` · packet labels the reviewer "Codex Sol Max (`gpt-5.6-sol` @ `model_reasoning_effort=xhigh`)" → dispatch ran Grok 4.6. Direct user instruction overrides only that label; this is a packet/dispatch mismatch, not an author finding.

P-3 · `packets/COMMON.md:8` and `00-intake-H0.md:34–36` · quoted tree state `dev @ 8d38185c` with **111 dirty working-tree entries**. Commit `8d38185c` exists (`git cat-file -t` → `commit`). The count was already stale when the author measured (`4f764037`, 12 dirty); orchestrator HEARTBEAT on `t_217e59bf` comment 1 said so. Packets that quote a live dirty-count cost a board round.

P-4 · `00-intake-H0.md:48` · quoted D12 demo `PASSED 6 / FAILED 1 / SKIPPED 21` with log path `logs/d12-demo-2026-09-01.log`. Path does not resolve today (`ls: logs/d12-demo-2026-09-01.log: No such file or directory`). Demo numbers are UNVERIFIED by this seat.

P-5 · `packets/REQ-SUP.md` §3 Q2/Q3/Q6 and §2 item 2 · packet did not flag (a) Q2 "user's OWN debates" vs COMMON §3 "no private debate content in any support surface", (b) Q3 "admin page" vs measured absence of operator auth (`apps/api/src/index.ts:432`), (c) Q6 example "open `/`" vs ui-overhaul ownership of `apps/ui/app/page.tsx`, (d) grep `-il 'bot a\|bot b\|evidence bot\|support'` matching every file in the mission. Author named all four in the self-report. They remain packet defects.

P-6 · REQ-SUP `allowed` list vs demanded deliverables: `supportagent.md`, compass, `slices/SUP-*/{SPEC,PLAN,PROGRESS,DECISIONS}.md`, self-report, TOOLING-TRAPS, comments on `t_217e59bf` — all inside `allowed`. §5's `## Handoff` lands in `supportagent.md`. No allowed-list hole.

P-7 · H0 "No `/metrics`, Prometheus, OpenTelemetry, or statsd anywhere in `apps/**` or `packages/**`". Independent grep over source, excluding `.next*` / `node_modules` / `dist`: **0 hits**. Naive `grep -R apps packages` hits Next compiled `@opentelemetry/api` under `apps/ui/.next-build/`. The claim holds for source; the quoted glob is ambiguous.

P-8 · Collision between `REQ-REV-SUP.md` §1c ("death does not excuse missing packet-demanded artifacts") and orchestrator comment 2 on `t_217e59bf` ("receipts were never written and that is NOT charged to the seat"). Reviewer cannot obey both. Filed here; author is judged on disk artifacts plus that comment as evidence, not as a waiver of §1c.

Paths in REQ-SUP §2 all resolve from repo root (COMMON, H0, V-DECISIONS-PACKET, MFA-research dir, `packages/providers`, three relay files, `apps/api/src/index.ts`, `publications.ts`, `provider-discovery.ts`, zone manifest). Ticket ids `t_217e59bf`, `t_d819e88e`, `t_a273e880` resolve on board `observability-agents`.

## Blocking findings B1…

B1 · `docs/missions/observability-agents/slices/SUP-01/SPEC.md:90-91` and `requirements/supportagent.md:57` · Help Corpus seed "the publish/unpublish/delete rules (`apps/api/src/index.ts:693`)" · KB-author / Architecture open line 693 to ground "How do I publish a debate?" → they read the DELETE `/v1/debates/:id` erasure handler (`if (outcome==="PUBLISHED") { return 409 DEBATE_MUST_BE_PRIVATE }`), not the publish path. Actual publish is `POST /v1/runs/:id/publish` at `apps/api/src/index.ts:996-1037`, with the re-authentication (step-up grant) at `:1011`. SUP-01 acceptance step 4 (`SPEC.md:277-280`) then expects an answer that "mentions that publishing is done from the debate page by its owner and requires a re-authentication step" — a fact that lives at `:996-1011`, not `:693`. Frozen SPEC will ship a wrong corpus seed; V's first grounded-Q&A step fails or, worse, the corpus fabricates from the erasure handler. Evidence: this seat read `:675-703` (delete-private-debate) and `:996-1037` (publish + `grantToken: input.step_up_grant`).

B2 · `slices/SUP-02/SPEC.md:144-146` · V types `I am being told what to type by someone on the phone` and must observe REFUSE_SAFETY plus a new case with predicate `E2`. That sentence is in no frozen phrase list and no §Copy template. SUP-01-R05 / Q4 T5 route social-engineering toward recovery/contacts to **REFUSE_ZONE** (pre-model, zone-adjacent). SUP-01 states `REFUSE_SAFETY` as "self-harm, threats, minors, legal process, coercion". Input of that exact sentence → Architecture's classifier, built from the written classes, emits REFUSE_ZONE (or nothing) rather than REFUSE_SAFETY+E2, and V's step 9 is red. The SPEC does not name the phrase; the acceptance step treats it as determined.

## Non-blocking findings N1…

N1 · `requirements/supportagent.md:205` · Q5 secrets-governance cell contains "Bot A **handles** no secrets". Banned-word grep `improve|better|robust|handle|appropriate` hits this line. A requirement table cell containing `handle` is a P2 finding. (PLAN.md hits are the forbidden-word list itself — not findings.)

N2 · `requirements/supportagent.md:89` · "mirrored in the contract inventory (`packages/contract/src/index.ts:641`)". Line 641 is blank; `export const contractInventory` starts at **642**. Off-by-one, not a ghost file. Architecture following `:641` lands on whitespace.

N3 · `requirements/supportagent.md` (file end) and `t_217e59bf` · REQ-SUP §5 demanded `## Handoff` appended to `supportagent.md` and a `READY FOR PEER REVIEW` comment opening with `SKILLS LOADED`. Neither exists. Headings present: Verdict summary, Q1–Q7, Ranked recommendations, UNVERIFIED / gaps, plus extra `## Resolved tensions`. Missing handoff comment is a packet-demanded artifact; death explains it and does not erase it (`REQ-REV-SUP.md` §1c). Self-report exists. Orchestrator comment 2 on `t_217e59bf` records the death. **Author `SKILLS LOADED` absence is NOT a finding**: orchestrator comment 0 on `t_d819e88e` measured invocation AND body for `using-superpowers`, `heartbeat-protocol`, `heartbeat-requirements`, `superpowers:brainstorming` — this seat treated that comment as the floor-skill evidence.

N4 · P8b · three Explore children at 23:41, metadata `~/.claude/projects/-Users-vladmihaimiron-Documents-DebateAIRO/6238e708-3fe9-4c90-be02-a517b6ca3072/subagents/`:
- `a085f12963927c6cc` · Explore · "API and UI surface inventory" · `"model": "opus"`
- `a40bd49ad9f2da6e2` · Explore · "Model-access substrate under DR-179" · `"model": "opus"`
- `af6f2f68214726cd7` · Explore · "Knowledge-source and doc inventory" · `"model": "opus"`
COMMON §3 (as amended) requires `model: "fable"` and `## Sub-delegation receipts`. All three ran on **opus**, not Fable. Write-tool scan of the three jsonl files: 0 Write/Edit. No `## Sub-delegation receipts` on disk or on `t_217e59bf`. Self-report Finding 1 discloses the spawn, the model, and 66 author spot-checks. Roster finding against the author (packet P8b). Orchestrator said receipts are not charged; §1c says death does not excuse — this N is the disclosure, not a second B.

N5 · `slices/SUP-04/SPEC.md:78-79` · acceptance step 5: "with the SUP-03 consent on, the widget shows the current debate as the selected context" while SUP-04 claims parallel-safety with SUP-03 (`SPEC.md:96-97`, compass line 13). V exercises SUP-04 first in a parallel worktree → step 5 has no consent toggle. R05 says "where landed"; step 5 does not.

N6 · `slices/SUP-04/SPEC.md:75-77` · step 4 "expanded, it does not cover the submit control (resize … and check both)". No measurement (bounding-box command, overlay, screenshot tool). A stranger cannot mark done without a judgement call.

N7 · `slices/SUP-03/SPEC.md:114-115` · step 5 `SELECT jsonb_object_keys(result) FROM support.tool_call` expects a JSON object. R05 allows "result keys or enum" (`NOT_OWNED`). Input `NOT_OWNED` → `jsonb_object_keys` errors or returns nothing, not "only keys from the R03 list".

N8 · `slices/SUP-03/SPEC.md:116-119` · step 6 "with a run id V takes from another account". Only the provisioned QA identity is named (`.local/dev-auth/qa-account-*.json`). No second-account fixture. V with one QA user cannot produce the byte-identical cross-account refusal.

N9 · `slices/SUP-07/SPEC.md:74-76` · acceptance step 1 selects `identity_owner_ref` from `support.session`. SUP-01-R12 schema lists `session, message, abuse_event, case, session_key` — no `identity_owner_ref`. SUP-02-R02 adds it to **case**, not session. Q3 prose says the session is bound to `owner_ref`. Parallel SUP-07 after only SUP-01: the column is missing and two slices may both add it.

N10 · `slices/SUP-06/SPEC.md:99-103` · step 3 "the other shows QUEUED with `number 1` for a few seconds". "A few seconds" is not a bound; R03's bound is "waiting more than 3 s". Stranger cannot mark done.

N11 · `slices/SUP-01/SPEC.md:93` · model-count warning cites bare `` `cards.ts:107` ``; the file is `apps/ui/components/landing/cards.ts:107` ("Five frontier models…"). Line is real; the path is incomplete in the frozen SPEC.

N12 · `slices/SUP-06/SPEC.md:107-110` · step 5 `pnpm support:limits set support_model_ref development:none`. `support_model_ref` is a SUP-01-R08 register row, not in SUP-06-R01's listed limit rows. Command name is reused without stating that `support:limits` writes every `support_*` row.

## What I verified and how

Blindness: listed `docs/missions/observability-agents/reviews/` — `REV-WARPLAN-grok.md`, `REV-WARPLAN-grok-r2.md`, `REV-WARPLAN-grok-r3.md`, and this seat's own file only. Did not read any sibling product-review verdict.

P8 floor skills: treated orchestrator comment 0 on `t_d819e88e` as the evidence. Verbatim: "MEASURED, all four floor skills, invocation AND body present exactly once each: superpowers:using-superpowers · heartbeat-protocol · heartbeat-requirements · superpowers:brainstorming. VERDICT ON THE GATE: PASS. … Do not charge the author for a missing SKILLS LOADED line; do cite this comment in your verdict as the evidence you used." Cited. Not charged.

Author ticket `t_217e59bf`: 3 comments (CLAIM by REQ-SUP; orchestrator HEARTBEAT tree-moved; orchestrator seat-died). No author `READY FOR PEER REVIEW`. Self-report on disk.

P1 stranger test: read every numbered acceptance step in SUP-01..07 SPECs. Runnable-as-written after implementation: SUP-01 steps 1–3, 5–11, 13–14 (step 1 `pnpm dev:auth:up` exists in `package.json`; `.local/dev-auth/database-principals.env` exists, mode 0600; QA json files exist); SUP-02 steps 1–8, 10; SUP-05 steps 1–7; SUP-06 steps 1–2, 4, 6–7; SUP-07 steps 2–6, 8. Fails listed under B2, N5–N10, N12. SUP-01 step 4 fails because of B1 (expected product facts seeded from the wrong handler, not from §Copy). PLAN-scaffold rows have empty step ids by law — not V-runnable yet; that is correct scaffold, not a fail.

P2 banned words: `grep -nE 'improve|better|robust|handle|appropriate'` over `supportagent.md`, compass, and `slices/SUP-*/{SPEC,PLAN,PROGRESS,DECISIONS}.md`. Verbatim hits: `supportagent.md:205` ("Bot A handles no secrets"); seven PLAN.md lines that quote the forbidden-word list. No hits in any SPEC acceptance criterion. Compass clean.

P3 trace equality (independent count of `### SUP-nn-Rxx` vs PLAN `| SUP-nn-Rxx |` rows):

```
SUP-01: SPEC reqs=18 PLAN rows=18 declared=(18, 18) equal=True
SUP-02: 10 / 10 equal=True
SUP-03: 8 / 8 equal=True
SUP-04: 6 / 6 equal=True
SUP-05: 6 / 6 equal=True
SUP-06: 8 / 8 equal=True
SUP-07: 6 / 6 equal=True
```

Total 62 = 62. Per-row quoted fragments sampled against SPEC text: present except escaped-pipe `off\|on` in SUP-01-R08 PLAN cell (markdown, not a missing requirement).

P4 contradiction hunt:
- H0 C2 / V-2: both relay-only and key-based specified in Q5. Holds.
- H0 C5 / V-4: Bot B later-phase, diode stated, phase-1 fallback = V reads cases. Holds.
- H0 C1 approval-first: assistant answers / refuses / opens a case; never mutates. Holds.
- COMMON DR-179: relay-only phase 1. Holds.
- COMMON DR-188: no DELETE, retention `keep`, shred = key destruction. Holds (SUP-07).
- COMMON privacy: metadata-only projection, no debate content, no raw payloads. Holds (SUP-03-R03); packet Q2 tension named and resolved in `supportagent.md:304-306`.
- COMMON zone: no zone imports, no `/v1/auth|account` support routes, pre-model refuse. Holds as specified.
- COMMON high-risk floor: provider spend via register rows, V-set. Holds.
- Internal: B1 (seed vs real publish handler); B2 (T5 REFUSE_ZONE vs step 9 REFUSE_SAFETY); N9 (session `identity_owner_ref` missing from SUP-01 schema). Q1 "exactly three tools" plus eight "allowed low-risk actions" is not a fork — SPECs make escalation/language/incidents non-tools.

P5 citation audit. Selection method: unique `path:line` from `supportagent.md` + compass + all `SUP-*/SPEC.md`; sorted by `(cited_path, line)`; every 5th starting at index 2; truncated paths repaired from the citing line; duplicates skipped; filled to 12 unique full paths. Then 23 additional high-risk cites the artifact leans on. Primary 12 all resolved to real lines whose content matched the claim (register_row `:275`, `CLAUDE_MODEL_ALIAS = "opus"` `:39-41`, GROK_BINARY `:12`, `spawn(` `:122`, `SESSION_COOKIE_NAME` `:169`, session authenticate `:408`, `AuthenticatedSession` `:34`, `<html lang="en"` `:34`, GuideModal `:7-41`, operator 403 `:432`, `core.run_is_owned_by` `:289`, `identity_table_deny_set` `:41`). Additional: DR-179 `:1429-1431`, DR-188 `:1611`, ~50s `:1292-1293`, scrubbed env `:67-80`, orphan-audit `:455`, verify-email re-export `:7`, workers refusal `:14`, `dezbatere.ro` `:31`, `[PLACEHOLDER]` pricing `:34`, `obs.incident` `:120`, landing `:21`, missingCapabilities `:8-10`, RISK/BUDGET tiers `:27-33`, CLAUDE_BINARY `:27`, CODEX_BINARY `:15`, Codex usage null `:138`, policy inventory `:98-144`, proxy allow-list `:9-36` (second cookie name is `:37`). Failures: `packages/contract/src/index.ts:641` blank / inventory at 642 (N2); `apps/api/src/index.ts:693` is erasure-of-published, not publish rules (B1).

P6 vertical-slice law: seven slices, each with a V-exercisable beginning and end named in Q6 and the compass. SUP-01 is the smallest complete proof (anonymous `/help`, grounded Q&A, zone refuse, injection recorded, eval gate) and the only dependency of SUP-02..07. Parallel-safety: created-file sets are disjoint except the disclosed `apps/ui/app/page.tsx` overlap with ui-overhaul (SUP-04-R06) and append-only shared files (`apps/api/src/index.ts`, `packages/contract/src/index.ts`, `package.json`). Defect: N5 (SUP-04 step 5 needs SUP-03).

P7 freeze and format: every SPEC opens `**Status:** FROZEN at creation (2026-09-01, REQ-SUP)`. Every PLAN: `**Status:** SCAFFOLD — steps not authored` and "authored ONLY this SPEC-trace skeleton". Every PROGRESS: empty `## DONE / NEXT / TRIED AND FAILED / WORKED` with orchestrator-only writer. Every DECISIONS: append-only format line + seeded standing-law rows (C1, V-2, V-4, zone, DR-188, Done=V). Compass 17 lines (cap 25). REQ-SUP §4 headings all present; extra `## Resolved tensions` is additive. `## Handoff` missing (N3).

P8b receipts sample (five child claims that entered the artifact, verified here at `path:line`):
1. no operator auth path — `apps/api/src/index.ts:432-433` `authPolicy === "operator"` → 403 `OPERATOR_REQUIRED`. Holds.
2. ownership is SQL predicate — `migrations/0037_run_ownership.sql:289` `CREATE OR REPLACE FUNCTION core.run_is_owned_by(`. Holds.
3. relay one child, no queue — `acceptance/relay-core.ts:122` `const child = spawn(`. Holds.
4. new-page risk/budget seeds — `apps/ui/app/new/page.tsx:27-33` (author corrected child's `:19-24`; line 19 is not the options). Holds.
5. admin workers static refusal — `apps/ui/app/admin/workers/page.tsx:14-15`. Holds.
Children wrote nothing (0 Write/Edit in three jsonl). Model opus on all three, not fable.

P9 self-report: `.hermes/reports/observability-agents/agent-reports/REQ-SUP.md` is a case file. Cause (harness prompt ranked above COMMON for sub-delegation), price (461 547 child tokens; 40 min wall-clock; 3 overflow round-trips), near-misses (banned token `handle` in identifiers; "sign me out everywhere"; editing `page.tsx` in SUP-01; config-file kill switch), dead ends (no FAQ in `docs/`; no operator auth; `tools/**` floor-deny; sealed register), packet ambiguities named at exact sections. Not anodyne.

P10 contested decisions: Q7 rows SUP-D1..D11 each have options, pick, confidence, strongest counter. None re-asks V-1..V-6. V-2 and V-4 specified both ways in Q5/Q4. SUP-D9 counter is "none of weight" — still a filled cell.

## What I did NOT verify

- The D12 demo log (path missing); H0's 6/1/21 numbers.
- Whether `docs/visuals/verdict-forensics.png` actually contradicts landing copy (cited, image not inspected).
- Child jsonl full text (sampled cites and Write-tool absence only; files are 449k–1.8M).
- Live `pnpm dev:auth:up` / HTTPS :3000 (H0 said the stack was down at intake; this is a requirements review, not a running product).
- Romanian copy by a native speaker (author marked UNVERIFIED).
- Whether an architecture test already asserts contract↔policy inventory equality (author marked UNVERIFIED).
- `t_b701a8e9` (F-01) beyond H0's description — did not open that ticket.
- Author transcript except the three child `meta.json` files the packet named.

## Predictions

The other two product reviewers, if they only check that a cited line exists, will miss B1: `:693` is a real line containing the token `PUBLISHED`, so it looks green until you read the enclosing route. I expect at least one of them to charge the missing `SKILLS LOADED` line despite the orchestrator gate comment, and to treat the missing handoff as BLOCKED rather than a finding. I expect them to catch the opus children (the ids are in the packet) and to argue about whether receipts are charged. Synthesis will trip on `support.public_incident` vs whatever ObservationAgent actually publishes — REQ-SUP left that as a named interface for REQ-SYNTH, which is correct, but the column set (`severity` ∈ {minor,major}, `affected_surface` ∈ {debates,publishing,sign-in,whole-site}) is frozen here without a matching OBS SPEC in this seat's scope. I also expect a sibling lens to call Q1's 3s/8s latency targets a contradiction with the 50s relay measurement; the author marked feasibility UNVERIFIED and I would not.

## comments read through: 3
