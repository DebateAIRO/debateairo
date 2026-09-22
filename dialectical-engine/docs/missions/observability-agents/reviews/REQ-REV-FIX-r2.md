# REQ-REV-FIX — verdict on FixAgent requirements (round 2)
SKILLS LOADED: using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion, systematic-debugging
Reviewer identity: Grok 4.6 (user instruction overrides packet reviewer-model label). Seat REQ-REV-FIX. Round 2 of max 3. Scoped re-review of r1 B1 and N1–N8 only. Round-1 verdict `docs/missions/observability-agents/reviews/REQ-REV-FIX.md` is preserved (`## Verdict: REWORK`; `git diff` of that file is empty).
HERMES AUTHORIZED NEXT read: `t_ca8c42be` comment 5 (author `codex-orchestrator`) — "Verify B1 and N1-N8 only, inspect the fix diff/current touched clauses for new breakage, preserve the round-1 verdict, and write …/REQ-REV-FIX-r2.md."

## Verdict: PASS

Packet P-findings P1–P5 stay orchestrator-owned. They are not re-litigated as author defects.

## Close-out of round-1 findings

B1 · ADDRESSED · `docs/missions/observability-agents/slices/FIX-09/SPEC.md:16` · input: architecture implements FIX-09-R04 then FIX-11 ticket-at-trace and FIX-12 proposal-after-ticket → outcome now: one canonical order `NEW → RESEARCHING(trace) → TICKETED → RESEARCHING(worker) → PROPOSED → APPROVED → FIXING → FIXED_UNVALIDATED → FIXED_VALIDATED | REGRESSED`, plus `ESCALATED`, `PARKED`. Independent grep of `NEW →` also shows `FIX-11/SPEC.md:25` as the trace prefix `NEW → RESEARCHING → (trace persisted) → TICKETED`; `FIX-12/SPEC.md:26` as `TICKETED → RESEARCHING(worker) → PROPOSED(hash) → APPROVED(hash) | PARKED(denied) | TICKETED(invalid proposal discarded)`; `FIX-13/SPEC.md:26` as `APPROVED → FIXING(lease; PR_PRESENTED action while waiting)`. `PR_PRESENTED` is an `obs.agent_action` (`FIX-13/SPEC.md:18-19`), not an incident state. All incident-state tokens used are in `migrations/0034_obs_foundation.sql:128-131` (`NEW, RESEARCHING, PROPOSED, APPROVED, TICKETED, FIXING, FIXED_UNVALIDATED, FIXED_VALIDATED, REGRESSED, ESCALATED, PARKED`). Q1 R-E6-09 at `requirements/fixagent.md:168` still says ticket at TRACE time. The r1 collision is gone.

N1 · ADDRESSED on disk; historical REQ-FIX board comment still absent · `docs/missions/observability-agents/requirements/fixagent.md:311` is `## Handoff`, opening with `SKILLS LOADED` at `:312` and `READY FOR PEER REVIEW`, with 16 trace counts totalling 153/153 and `comments read through: 3`. `t_80ef9dec` still has no post-CLAIM comment from author `REQ-FIX`. A `REQ-FIX-REWORK` READY comment now sits as comment 5 on that ticket (board mirror by the rework seat, not a resurrection of the dead author's handle). Disk obligation closed; original-author board comment remains history/controller, not an open author-file defect.

N2 · ADDRESSED · `docs/missions/observability-agents/slices/FIX-01/SPEC.md:13` cites `packages/obs-capture/package.json:12`. `nl -ba packages/obs-capture/package.json` line 12 is `"./runtime": "./src/runtime/index.ts"`; line 11 remains `./install/*`. PLAN scaffold `FIX-01/PLAN.md:14` matches `:12`. Zero remaining `:11` hits in those files.

N3 · ADDRESSED · the r1 sample steps are now pasteable without the named holes:
- `FIX-02/SPEC.md:35` step 6: `pnpm typecheck; echo "exit=$?"` → `exit=0` (no handoff baseline).
- `FIX-03/SPEC.md:35` step 2: `FIX03_PROVIDER_URL=http://127.0.0.1:1 pnpm exec vitest run tests/integration/fix03-runner-fault.test.ts --reporter=verbose`.
- `FIX-04/SPEC.md:35-36` steps 5–6: exact `{"error":"SESSION_REQUIRED"}` / `401`, and `pnpm exec vitest run tests/architecture/fix04-*.test.ts` printing `zone-route-mount: byte-identical` (no `<base>..<tip>`).
- `FIX-05/SPEC.md:28` step 1: `FIX05_PROVIDER_URL=http://127.0.0.1:1 FIX05_QUESTION_CANARY=CANARY-QUESTION-4419 pnpm exec vitest run tests/integration/fix05-provider-exhaustion.test.ts --reporter=verbose`.
- `FIX-06/SPEC.md:30` step 2: `setTimeout(() => { throw new Error("FIX06_V_DRILL"); }, 0)` in devtools Console.
- `FIX-07/SPEC.md:31` step 4: `touch "$OBS_CONTROL_DIR/CAPTURE_OFF"`; `FIX-07/DECISIONS.md:19` appends the path (the 2026-09-01 OPEN row stays above it because DECISIONS is append-only).
Needle scan of those §5 sections found none of: `handoff states both`, `pre-slice recording`, `<base>`, `<tip>`, `ARCH seat names`, `fingerprint = …`.

N4 · ADDRESSED · `docs/missions/observability-agents/slices/FIX-15/SPEC.md:31-32`. Step 4 selects the latest `source='hatchet'` occurrence for both `obs.source_link` and `obs.incident` (no `fingerprint = …`). Step 5 is `WHERE o.source='hatchet' AND (o::text ILIKE '%traceback%' OR … OR COALESCE(d::text, '') ILIKE '%stack%')`. Independent live parse against `debateai-v3-postgres-1`: step-4 link count `0` exit 0; step-4 incident query empty (no hatchet row) exit 0; step-5 count `0` exit 0. No missing-column error.

N5 · ADDRESSED · `docs/missions/observability-agents/requirements/fixagent.md:9` now: "at the authoring snapshot `apps/api/src/index.ts:490` substitutes the fixed error code for internal prose on 500s but still returns a `message` key, so OBS-R053 remains partial until FIX-04 removes that key and adds `correlation_id`".

N6 · ADDRESSED · `docs/missions/observability-agents/requirements/fixagent.md:3`: `authoring snapshot dev @ 4f764037 (the packet's older SHA and +111 dirty count are not repeated as measured state)`.

N7 · ADDRESSED · `docs/missions/observability-agents/slices/FIX-14/SPEC.md:13` (R01) defines `obsctl quick-arm <on|off> --custodian-token <token>` as solely the authenticated canonical-bundle re-pin wrapper, not a mutable flag; `:30` step 3 invokes that same command.

N8 · ADDRESSED · `docs/missions/observability-agents/slices/FIX-14/SPEC.md:14` R02(g): "every runtime emits a verified commit-bearing `build_ref` that is not `UNTRACKED-DEV`; ROW-GIT proves the tree is tracked but does not satisfy this runtime-identity precondition." Aligns with Q1 OBS-R033 at `requirements/fixagent.md:51` (installers still seed `UNTRACKED-DEV`; real identity is ARCH's).

## New breakage on rework-touched clauses

r2-N1 (Important, non-blocking) · `docs/missions/observability-agents/requirements/fixagent.md:304` vs `slices/FIX-06/SPEC.md:30` · input: architecture reads U-F5 "The exact real client-side fault V can cause in unmodified `apps/ui` code (FIX-06 §5 step 2) — ARCH names the site with `path:line`" → wrong outcome: FIX-06 §5 step 2 no longer waits for ARCH; V pastes `setTimeout(() => { throw new Error("FIX06_V_DRILL"); }, 0)`. The N3 sample was fixed; this sibling gap row in the same edited product file was not swept. Same-day ticket; does not reopen B1.

No new Critical / blocking breakage. No invented incident states outside 0034. Banned-word scan on touched SPEC/requirement files: no criterion-sense hits. Reconstructing `## Handoff` names `receiving-code-review`, which the original REQ-FIX CLAIM and the orchestrator skills-gate did not measure — recorded as a near-miss, not a fabrication finding against the dead author (packet §1c still holds).

## What I verified and how

- B1 probe: `grep -n 'NEW →'` on FIX-09/11/12/13 SPECs and `fixagent.md`; read FIX-09-R04, FIX-13-R06/R07, 0034 CHECK list. Output captured in scratch `probes/B1-state-machine.txt`.
- N1: `grep -n '^## Handoff'` → `311:## Handoff`; `hermes kanban --board observability-agents show t_80ef9dec --json` → 5 comments, authors REQ-FIX, claude-router, claude-router, REQ-REV-FIX, REQ-FIX-REWORK.
- N2: `nl -ba packages/obs-capture/package.json` lines 11–12; grep `:11` vs `:12` on FIX-01 SPEC/PLAN.
- N3: read current §5 of FIX-02..07; needle scan for the r1 placeholder phrases.
- N4: executed the three repaired SQL statements via `docker exec debateai-v3-postgres-1 psql …`; exits 0; counts `0` / empty / `0`.
- N5/N6: `sed -n '1,12p'` of `fixagent.md`.
- N7/N8: `FIX-14/SPEC.md:13-14,30` vs `fixagent.md:51`.
- Preserve r1: `grep -n '^## Verdict' reviews/REQ-REV-FIX.md` → `7:## Verdict: REWORK`; `git diff -- reviews/REQ-REV-FIX.md` is 0 bytes.
- Touched-file `git diff --stat` (read-only): 15 files, 44 insertions / 28 deletions, matching the rework report's `## Changed files` minus the report itself.

## What I did NOT verify

- I did not re-run r1 probes P1–P10 on untouched FIX slices, compass, or PLAN scaffolds.
- I did not open sibling `reviews/REQ-REV-OBS*.md` or `reviews/REQ-REV-SUP*.md`.
- I did not re-derive packet P1–P5 as author defects.
- I did not execute FIX-03/FIX-05 vitest files (they do not exist yet; they are the slice's future surface).
- I did not re-check live `obs` table contents beyond the three FIX-15 statements parsing.

## Predictions

Synthesis will paste the compass and miss r2-N1 (U-F5 lives only in `fixagent.md` UNVERIFIED). A later ARCH seat for FIX-06 will waste a cycle "naming a product site" unless U-F5 is struck. OBS/SUP reviewers, if they grep `NEW →` the way this seat did in r1, should see a clean FixAgent machine and not re-file B1.

## comments read through: 6
