# REQ-SUP rework — round 1 case file

Seat: fresh Codex Sol rework worker (`gpt-5.6-sol`) · source verdict:
`docs/missions/observability-agents/reviews/REQ-REV-SUP.md` · 2026-09-02.

## Scope and method

This rework changes requirements and cited SUP slice documents only. It does not change
product code, the reviewer verdict, packet text, board state, or git index/history. Each
finding was reproduced against the pre-edit files before any patch. Requirements outside
the cited B1–B2 and N1–N12 clauses remain frozen.

## Pre-edit reproduction evidence

| Finding | Reproduced defect |
|---|---|
| B1 | `apps/api/src/index.ts:675-703` is the private-debate DELETE handler; line 693 branches on an already-published delete attempt. The publish route is `apps/api/src/index.ts:995-1039`, including `step_up_grant` at lines 1004 and 1011. Both `supportagent.md` and SUP-01-R04 cited only `:693` for publish/unpublish/delete. |
| B2 | Exact-phrase search found `I am being told what to type by someone on the phone` only in SUP-02 acceptance step 9. No frozen deterministic safety phrase list or classifier precedence named it; SUP-01 named coercion only as an outcome-category gloss. |
| N1 | Banned-word sweep found one non-law hit: `requirements/supportagent.md:205`, `Bot A handles no secrets`. The other seven hits are the PLAN scaffolds' literal forbidden-word law. |
| N2 | `packages/contract/src/index.ts:641` is blank; `contractInventory` begins at line 642. Two requirements-file citations used `:641`. |
| N3 | Heading/search sweep found no `## Handoff`, `SKILLS LOADED:` or `READY FOR PEER REVIEW` in `requirements/supportagent.md`. The board-comment half of the finding is outside this repo-only worker's write authority. |
| N4 | No `## Sub-delegation receipts` exists in the author artifact. The original self-report records three read-only Explore children run with explicit `model: opus`, while COMMON required Fable. This historical provider violation cannot be undone by a document patch. |
| N5 | SUP-04 acceptance step 5 unconditionally requires SUP-03 consent/preselection while SUP-04 declares itself parallel-safe with SUP-03 and depends only on SUP-01. |
| N6 | SUP-04 acceptance step 4 says to resize and "check" that the widget does not cover the submit control; it names no selector, measurement, or Boolean expected value. |
| N7 | SUP-03-R05 permits `support.tool_call.result` to be an object or the JSON enum `NOT_OWNED`; acceptance step 5 applies `jsonb_object_keys(result)` to every row, which is invalid for a JSON string. |
| N8 | SUP-03 acceptance step 6 asks V to find another account's run but names only a single wildcard QA identity and no two-owner setup. |
| N9 | SUP-07 acceptance step 1 selects `support.session.identity_owner_ref`; SUP-01-R12's foundation schema omits that column, while SUP-02-R02 adds it only to `support.case`. |
| N10 | SUP-06 acceptance step 3 expects QUEUED for "a few seconds" although SUP-06-R03 defines the observable threshold as a wait longer than 3 seconds. |
| N11 | SUP-01-R04 cites bare `cards.ts:107`; the real path is `apps/ui/components/landing/cards.ts:107`. |
| N12 | SUP-06 acceptance step 5 uses `support:limits set support_model_ref`, but SUP-06-R01 lists only limit/cap rows and never states that this command may write the SUP-01 `support_model_ref` row. |

## Finding-by-finding close-out

| Finding | Disposition | Exact close-out evidence |
|---|---|---|
| B1 | CLOSED | `requirements/supportagent.md:57` and `slices/SUP-01/SPEC.md:90-92` now name publish `apps/api/src/index.ts:995-1039`, unpublish `:1040-1081`, and private-debate deletion `:675-703`. A stale-reference sweep finds no `apps/api/src/index.ts:693` in the requirements/SUP SPEC/PLAN set. |
| B2 | CLOSED | `slices/SUP-01/SPEC.md:105-110` and `slices/SUP-02/SPEC.md:40-45` now put the exact English and Romanian coercion phrases in deterministic pre-model classification and state that a co-occurring zone intent takes precedence as `REFUSE_ZONE`. SUP-02 step 9 still uses that exact English phrase. |
| N1 | CLOSED | `requirements/supportagent.md:205` now says the model context receives no secrets. Post-edit banned-word sweep returns exactly seven hits, all the PLAN scaffolds' binding forbidden-word sentence; zero hits occur in the requirements file or any SPEC acceptance criterion. |
| N2 | CLOSED | Both requirements-file references now cite `packages/contract/src/index.ts:642`, the line on which `contractInventory` begins. Stale-reference sweep finds no `:641`. |
| N3 | PARTIAL — controller action remains | On-disk `## Handoff` begins at `requirements/supportagent.md:315`, opens with actual rework skills at `:317`, includes slice/trace counts, contradictions, packet defects and comment cursor. This worker did not post the missing board marker because the task is repo-only; controller must post it if still required. |
| N4 | RESIDUAL — non-reversible | `requirements/supportagent.md:344-358` records all three child ids, scopes, the historical `model: opus` violation, zero-write evidence from the verdict, and independently checked repo citations. No replacement subagent was launched. The past provider selection cannot be changed by editing an artifact. |
| N5 | CLOSED | SUP-04 step 5 now runs a presence probe and states separate objective expectations for `SUP-03_PRESENT` and `SUP-03_ABSENT`; absence of SUP-03 no longer fails SUP-04. Its dependency remains SUP-01 only. |
| N6 | CLOSED | SUP-04-R04 requires stable panel/control data attributes. Step 4 pastes a rectangle-intersection expression at both 1280×800 and 390×844; expected result is Boolean `false`, and `MISSING_SELECTOR` is an explicit failure. |
| N7 | CLOSED | SUP-03 step 5 guards `jsonb_object_keys` with `jsonb_typeof(result) = 'object'` and maps enum rows to `{}`; step 6 separately reads the scalar and expects `NOT_OWNED`. |
| N8 | ROUND-1 ATTEMPT REJECTED; CLOSED IN ROUND 2 REWORK BELOW | The first repair counted filenames, so a recovery-only JSON false-greened as QA-B. The round-2 repair below supersedes that predicate. |
| N9 | CLOSED | SUP-01-R12 now defines nullable `support.session.identity_owner_ref`, copied only from the authenticated identity session and null for anonymous sessions. SUP-01 PLAN R12 traces the added column; SUP-07 step 1 now targets a defined foundation field. |
| N10 | CLOSED | SUP-06 step 3 replaces "a few seconds" with QUEUED after 3.0 seconds and no later than 3.5 seconds from enqueue, matching R03's threshold. |
| N11 | CLOSED | SUP-01-R04 now cites `apps/ui/components/landing/cards.ts:107`; stale-reference sweep finds no bare `` `cards.ts:107` ``. |
| N12 | CLOSED | SUP-06-R01 now explicitly defines `support:limits set` as accepting every mutable `support_*` register row, including `support_model_ref` and SUP-07 retention rows, and rejecting other prefixes. The PLAN R01 trace was updated. |

## Packet/controller dispositions

- Verdict P1–P8 are packet/orchestrator findings and are not edited by this worker.
- N3's missing board `READY FOR PEER REVIEW` comment requires controller board authority.
- N4's historical use of Opus children is an author process defect, not a packet defect;
  it is non-reversible. The on-disk handoff will disclose exact retrospective receipts,
  and this worker launched no replacement subagents.

## Checks

- `git diff --check` — exit 0, no whitespace errors.
- Banned-word sweep over `supportagent.md`, compass, and all SUP SPEC/PLAN/PROGRESS/DECISIONS
  files — seven hits, all the PLAN scaffolds' literal forbidden-word law; no actionable hit.
- Stale-reference sweep for `apps/api/src/index.ts:693`,
  `packages/contract/src/index.ts:641`, bare `` `cards.ts:107` ``, and `for a few seconds`
  — zero matches.
- SPEC/PLAN equality — SUP-01 `18/18`; SUP-02 `10/10`; SUP-03 `8/8`; SUP-04 `6/6`;
  SUP-05 `6/6`; SUP-06 `8/8`; SUP-07 `6/6`; total `62/62`.
- No product test suite was run: this is requirements-only rework with no product code.

## Changed files

- `docs/missions/observability-agents/requirements/supportagent.md`
- `docs/missions/observability-agents/slices/SUP-01/SPEC.md`
- `docs/missions/observability-agents/slices/SUP-01/PLAN.md`
- `docs/missions/observability-agents/slices/SUP-02/SPEC.md`
- `docs/missions/observability-agents/slices/SUP-02/PLAN.md`
- `docs/missions/observability-agents/slices/SUP-03/SPEC.md`
- `docs/missions/observability-agents/slices/SUP-04/SPEC.md`
- `docs/missions/observability-agents/slices/SUP-04/PLAN.md`
- `docs/missions/observability-agents/slices/SUP-06/SPEC.md`
- `docs/missions/observability-agents/slices/SUP-06/PLAN.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-SUP-REWORK-R1.md`

## Case-file lessons

- Cause: citations were checked for token presence, not enclosing-route semantics. Price:
  one blocking review round and duplicate author/reviewer source reads. A packet-level
  citation check must open the enclosing route, not merely resolve the line.
- Cause: acceptance examples were added after the classifier classes without adding the
  example to the frozen deterministic vocabulary. Price: one red manual step before code
  exists. Every exact acceptance phrase must trace back to one closed phrase list.
- Cause: parallel-safe labels were reviewed separately from manual prerequisites. Price:
  four acceptance repairs (N5, N8, N9, N12). A mechanical slice audit should compare every
  acceptance noun (fixture, column, command, predecessor) against the dependency closure.
- Near miss: treating N4 as repairable would have fabricated a compliant historical run.
  The honest close-out is disclosure plus independently checked receipts and a residual.
- Dead end: posting the missing board handoff from a repo-only rework worker would expand
  authority. The controller owns that one external-state transition.

## Round 2 verdict rework (third and final round)

### Verdict interpretation and focused reproduction

`docs/missions/observability-agents/reviews/REQ-REV-SUP-r2.md` has `## Verdict: PASS`, but
its body says `N8 · NOT ADDRESSED` and adds Important N13 for the same fixture-selection
class. Per controller direction, this rework treats the operative result as REWORK.

Before this edit, SUP-03 step 1 passed on a raw count of two
`.local/dev-auth/qa-account-*.json` files. A key-only probe that printed paths but no values
produced:

```text
REJECTED .local/dev-auth/qa-account-20260826183130-recovery.json
LOGIN_CAPABLE .local/dev-auth/qa-account-20260828070616-d3e68cfc.json
COUNTS login_capable=1 rejected=1
```

Cause: the round-1 repair selected by filename shape instead of the capability the manual
step needs. The recovery record has no non-empty `password` and no successful-login proof,
so it cannot serve as QA-B even though the glob count is two.

### N8 / N13 close-out

Disposition: CLOSED in the requirements artifact.

SUP-03 acceptance step 1 (`slices/SUP-03/SPEC.md:104-133`) now:

1. applies a pasteable `jq -e` predicate requiring non-empty string `email`, non-empty
   string `password`, and exact `login_proof = authenticated_then_logged_out`;
2. writes only qualifying paths to a sorted, unique temporary index and requires count ≥2;
3. prints a deterministic `FAIL` and exits 1 when fewer than two qualify;
4. explicitly excludes recovery-only JSON;
5. requires V to provision a second identity through the existing first-party flows,
   prove sign-in then sign-out, store the credential record mode 0600, and rerun the probe;
6. forbids continuing until the probe exits 0, then requires successful browser sign-in
   for both QA-A and QA-B before creating QA-B run `F`.

This prevents the prior false green: the current recovery-only file fails the predicate,
and a credential-shaped file that cannot actually sign in fails the subsequent two-login
observation.

### Focused checks

- `git diff --check`: exit 0 before this report update and again after it.
- Old raw `-print | wc -l` gate and `Expected: at least 2. Designate`: zero SUP-03 matches.
- Current key-only predicate against the two on-disk JSON files: one recovery-only path
  printed `REJECTED`, one credential-shaped path printed `LOGIN_CAPABLE`; counts `1/1`.
  This is the required fail-closed result until V provisions QA-B.
- SUP-03 requirement/PLAN trace count: `8/8`.
- Banned requirement-word sweep over the changed SUP-03 SPEC: zero matches.

### Exact files changed in this round

- `docs/missions/observability-agents/slices/SUP-03/SPEC.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-SUP-REWORK-R1.md`

No board comment, product code, reviewer verdict, packet, git index, or git history was
changed. The controller owns the handoff.
