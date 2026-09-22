# REQ-REV-SUP — verdict on SupportAgent requirements (round 2)
SKILLS LOADED: using-superpowers (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`), heartbeat-protocol (`.claude/skills/heartbeat-protocol/SKILL.md` and `.grok/skills/heartbeat-protocol/SKILL.md`), heartbeat-reviewer (`.claude/skills/heartbeat-reviewer/SKILL.md`), verification-before-completion (`superpowers/6.3.0/skills/verification-before-completion/SKILL.md`), systematic-debugging (`superpowers/6.3.0/skills/systematic-debugging/SKILL.md`), receiving-code-review (`superpowers/6.3.0/skills/receiving-code-review/SKILL.md`)
## Verdict: PASS
Round 2 of 3. Scoped re-review of r1 B1–B2 and N1–N12 against the current artifacts named in `REQ-SUP-REWORK-R1.md` `## Changed files`. Round-1 verdict `docs/missions/observability-agents/reviews/REQ-REV-SUP.md` is preserved (`## Verdict: REWORK`). Reviewer is Grok 4.6 by direct user instruction. Blindness: listed `reviews/` and did not open sibling product-review verdict files.

`HERMES AUTHORIZED NEXT` is comment 4 on `t_d819e88e` (author `codex-orchestrator`): verify B1–B2 and N1–N12 only; N4 is non-reversible; write this r2 file.

## Finding close-outs (r1 order)

B1 · ADDRESSED · `requirements/supportagent.md:57` and `slices/SUP-01/SPEC.md:90-92` now seed publish at `apps/api/src/index.ts:995-1039`, unpublish `:1040-1081`, private-debate deletion `:675-703`. Independent grep of `supportagent.md` and `slices/SUP-*/{SPEC,PLAN}.md` for `apps/api/src/index.ts:693`: **zero hits**. Enclosing-route check this round: `:675` is `api.delete("/v1/debates/:id")` ending `:703`; `:995` is `api.post("/v1/runs/:id/publish")` with `grantToken: input.step_up_grant` at `:1011`, handler ends `:1039`; unpublish starts `:1040` ends `:1081`.

B2 · ADDRESSED · Frozen pre-model list now names the exact English phrase. `slices/SUP-01/SPEC.md:106-110` and `slices/SUP-02/SPEC.md:41-44` contain `I am being told what to type by someone on the phone` (and the Romanian twin). Co-occurring zone intent → `REFUSE_ZONE` precedence is stated in both. SUP-02 acceptance step 9 (`SPEC.md:147-149`) still types that exact English sentence and expects REFUSE_SAFETY + E2. PLAN R01 (`SUP-02/PLAN.md:31`) and SUP-01 PLAN R05 (`SUP-01/PLAN.md:41`) trace the new classifier split.

N1 · ADDRESSED · `requirements/supportagent.md:205` now reads "Bot A's model context receives no secrets" (no `handle`). Independent `grep -nE 'improve|better|robust|handle|appropriate'` over supportagent + compass + all SUP SPEC/PLAN/PROGRESS/DECISIONS: **seven hits**, all the PLAN scaffolds' forbidden-word law sentence. Zero hits in `supportagent.md` or any SPEC acceptance criterion.

N2 · ADDRESSED · `requirements/supportagent.md:89` and `:289` cite `packages/contract/src/index.ts:642`. File at `:642`: `export const contractInventory = Object.freeze({`. Line 641 is still blank. Grep for `:641` in the requirements file: **zero**.

N3 · ADDRESSED (disk) · residual board marker is controller-owned · `requirements/supportagent.md:315` is `## Handoff`; `:317-318` opens with `SKILLS LOADED:` and explicitly says the block is reconstructed by the rework worker and does not impersonate the dead author. Slice/trace table, contradictions, packet defects, and `comments read through: 3` are present (`:323-342`). Original author still has no `READY FOR PEER REVIEW` on `t_217e59bf`; comment 4 there is `REQ-SUP-REWORK`, not the ended REQ-SUP seat. That remaining board gap is outside the repo-only rework contract and is not re-opened as a product defect.

N4 · ADDRESSED (honest residual disclosure; historical opus spawn not reversed) · `requirements/supportagent.md:344-358` (`### Sub-delegation receipts`) names ids `a085f12963927c6cc`, `a40bd49ad9f2da6e2`, `af6f2f68214726cd7`, states `model: opus` contrary to the Fable roster, states no replacement child was launched, and does not rewrite the historical provider or describe a second spawn. Independent close-out of the five cited lines this round: `apps/api/src/index.ts:432-433` operator 403; `apps/ui/app/new/page.tsx:27-36` RISK then BUDGET option arrays; `apps/ui/app/admin/workers/page.tsx:12-15` operator-only refusal copy; `acceptance/relay-core.ts:122` `spawn(` inside `:118-128`; `migrations/0037_run_ownership.sql:289` `core.run_is_owned_by` inside `:286-296`. This is disclosure of a past roster violation, not a compliant past.

N5 · ADDRESSED · `slices/SUP-04/SPEC.md:84-89` step 5 now probes `test -f apps/ui/components/support/ConsentToggle.tsx` → `SUP-03_PRESENT` / `SUP-03_ABSENT`. Help button required in both cases; consent preselection only if present; absence does not fail SUP-04. Parallel-safety still "Depends on SUP-01" (`:106`). PLAN R05 (`SUP-04/PLAN.md:33`) traces "when SUP-03 is present".

N6 · ADDRESSED · `slices/SUP-04/SPEC.md:49-50` requires `data-support-widget-panel` and `data-support-primary-control`. Step 4 (`:77-83`) pastes a rectangle-intersection IIFE at 1280×800 and 390×844; expected `false`; `MISSING_SELECTOR` fails. Stranger-markable Boolean. PLAN R04 (`SUP-04/PLAN.md:32`) traces the data attributes.

N7 · ADDRESSED · `slices/SUP-03/SPEC.md:117-120` guards `jsonb_object_keys` with `jsonb_typeof(result) = 'object'` and maps non-objects to `'{}'::jsonb` so an enum does not crash the query. Step 6 (`:123-124`) separately expects `result #>> '{}'` = `NOT_OWNED`.

N8 · NOT ADDRESSED · `slices/SUP-03/SPEC.md:104-109` now requires `find .local/dev-auth -maxdepth 1 -name 'qa-account-*.json' -print | wc -l` ≥ 2, then "sign in as QA-B". Independent `find` this round: **2** files. Key-only inspection (no secret values): `qa-account-20260826183130-recovery.json` keys `{email, generated_at, purpose, recovery_codes}` — not a login identity; `qa-account-20260828070616-d3e68cfc.json` is the one password/login_proof account. Input: V runs the named `find | wc -l` → `2` (green) then tries to sign in as QA-B from the recovery file → no password, step 1 cannot be finished. The r1 defect (one sign-in-capable QA fixture) remains; the new probe false-greens. See also new N13.

N9 · ADDRESSED · `slices/SUP-01/SPEC.md:171-172` defines nullable `support.session.identity_owner_ref`, copied only from the authenticated identity session, null when anonymous. SUP-01 PLAN R12 (`PLAN.md:48`) traces that column. SUP-07 step 1 (`slices/SUP-07/SPEC.md:75-76`) still selects that field and now has a foundation definition in the dependency slice.

N10 · ADDRESSED · `slices/SUP-06/SPEC.md:103-105` replaces "a few seconds" with QUEUED after 3.0 s and no later than 3.5 s from enqueue, matching R03 (`:53` "waiting more than 3 s"). Grep for `for a few seconds` in SUP SPEC/PLAN: **zero**.

N11 · ADDRESSED · `slices/SUP-01/SPEC.md:94` and `requirements/supportagent.md:57` cite `apps/ui/components/landing/cards.ts:107`. Grep for bare `` `cards.ts:107` ``: **zero**.

N12 · ADDRESSED · `slices/SUP-06/SPEC.md:43-45` states `support:limits set` accepts every mutable `support_*` register row, including `support_model_ref` (SUP-01-R08) and SUP-07 retention rows, and rejects other prefixes. Step 5 (`:110`) therefore has a named command for `support_model_ref`. PLAN R01 (`SUP-06/PLAN.md:28`) traces that sentence.

## New breakage in fix-touched clauses

N13 · `slices/SUP-03/SPEC.md:104-109` · Important · V runs the step-1 fixture probe `find .local/dev-auth -maxdepth 1 -name 'qa-account-*.json' | wc -l` with the two files that exist today → count `2` (the step's pass condition) while only one file is a sign-in account (the other is recovery-codes-only). Wrong outcome: the acceptance step reports the two-owner fixture as present when QA-B cannot sign in. Evidence: key sets listed under N8; this is the N8 class (searching by glob instead of by "login-capable identity"), not a new product behavior. Same-day ticket: tighten the probe to files that contain a login credential field, or provision a second QA identity. Not blocking for architecture of other slices.

No new Critical. No other Important in the touched publish-seed, classifier, handoff, widget, limits, or session-column clauses.

## What I verified and how

Independent greps and enclosing-route reads this round (not copied from `REQ-SUP-REWORK-R1.md`):
- `:693` absent from requirements + SUP SPEC/PLAN; publish/unpublish/delete ranges match `apps/api/src/index.ts` handlers.
- Exact coercion phrase present in SUP-01-R05, SUP-02-R01, and SUP-02 step 9; zone precedence written.
- Banned-word sweep: 7 PLAN-law hits, 0 actionable.
- Contract inventory `:642` is the `contractInventory` export.
- `## Handoff` / receipts text read in full (`supportagent.md:315-359`).
- N4 cited path:line sample re-read (five lines above).
- SUP-03/04/06/07 acceptance steps named by r1 N5–N12 re-read.
- QA fixture glob counted and classified by JSON keys only.

## What I did NOT verify

- Live `pnpm dev:auth:up` or actually signing in as either QA file.
- Child jsonl transcripts (N4 judged on current on-disk receipts + the five path:line samples).
- Unrelated SUP-05 body except as listed in the banned-word / stale-reference greps.
- Sibling product-review verdict files (directory listed; those files not opened).
- Whether comment 4 on `t_217e59bf` (`REQ-SUP-REWORK`) satisfies the original packet's author-handoff duty — judged as controller/rework-board, not as product.

## Predictions

A sibling requirements re-reviewer who only greps `qa-account-*.json | wc -l` will mark N8 ADDRESSED and miss that one of the two files cannot log in. I would check that first. I also expect someone to treat N4 as NOT ADDRESSED because the children are still opus — that would be re-litigating history; the honest close-out is the residual disclosure, which is present.

## comments read through: 6
