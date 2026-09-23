# FIX-S03-p1-F2 — agent case report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding and cause

The victim was the declared plan-tier list on `/new`: every signed-in browser saw two complete-looking cards with zero model ids. The cause was a cross-boundary authorization mismatch, not a missing render branch. `apps/ui/app/new/page.tsx` read the operator-only `/v1/deployment` surface; `apps/api/src/index.ts` rejects every ordinary cookie session on that policy; the page discarded the rejection and retained its empty initial state.

The defect class is **a fixed declared roster silently collapsing at a runtime boundary**. The member sweep was:

- contract response: a strict `{ free: string[], premium: string[] }` schema;
- contract inventory: `GET /v1/plan-tiers` declared;
- client: `readPlanTiers()` uses that route and validates the response;
- authorization inventory: `auth: "user", resource: "plan-tier-rosters", action: "read"`;
- application boundary: `readPlanTierRosters(session)` projects the `planTierRosters` row from the same sealed deployment read used by `readDeployment`;
- API handler: returns only the two roster lists, never the compiled constant or the operator deployment payload;
- UI success: both lists replace the empty initial state;
- UI refusal: zero ids plus `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: <message>` in the existing `.error` presentation.

## Price

- Wall clock: 22:11:54–22:33:24 EEST, about 21.5 minutes through completed formal verification.
- Review passes: one FIX round after REV(S03) pass 1; finding `t_fcdecc36` addressed in this round.
- Executions: 30 captured logs. The required evidence accounts for 3 C4 runs, 3 route-pin runs, 1 integrated run, pre/post typecheck, original and re-derived reviewer probes, the two slice RED cases, and eight defect mutants plus two neighbouring mutants.
- Longest single charge: the 17-file integrated run, 134.37 seconds, because it creates embedded PostgreSQL instances.
- Token price: UNVERIFIED. This Codex seat exposes no authoritative per-session token counter. The largest avoidable transcript payload was the mandated full read of 6,190 lines across the allowed write surface.

## What nearly went wrong

1. The available-skills catalog pointed at `.codex/skills/heartbeat-protocol/SKILL.md`; COMMON later says Codex seats must use the repo `.claude` copy. I read both and will disclose both. This cost one duplicate 128-line read and could have produced a false `SKILLS LOADED` line.
2. Making `readPlanTierRosters` required immediately added 11 typecheck diagnostics in forbidden test fixtures. The final interface keeps the production method present but permits partial test applications to omit it; the route fails closed if an omitted method is invoked. Pre/post typecheck logs are now byte-identical.
3. The first post-fix render run had one failure because the alternate-model fixture still drove `readDeployment`. Moving that fixture to `readPlanTiers` was the only correction.
4. During the first page mutant restore, a broad patch matched the success-path `setPlanTierRostersError(null)` instead of the catch-path occurrence. `cmp` caught it before progress continued; a context-specific reverse patch restored the saved bytes and the identical path status.

## Dead ends and rejected remedies

- Widening `/v1/deployment` was rejected: the existing ordinary-user 403 test remains unchanged and the deployment payload is broader than the page needs.
- Returning `PLAN_TIER_ROSTERS` from the new handler was rejected: it would recreate a build-time source and violate R16. The application-source mutant was watched failing against the unique register-row fixture.
- Letting the UI validate an untyped deployment row was rejected: validation now belongs at the contract boundary, and the page consumes only the closed roster response.
- Treating the original reviewer probe as a permanent GREEN test was rejected: its case B encodes the pre-fix silence. At the fixed head the original case fails, and the re-derived temporary case asserts zero ids plus the visible refusal.

## Packet and tooling defects

1. `FIX-S03-p1-F2.md` points at SPEC-v3 `:255-270` for R31's honesty sentence, but the named sentence is at `:271-274`; it points at `:165-221` for R23.5, but R23.5 is at `:279-292`. A one-prompt packet should validate requirement labels against its line ranges.
2. The packet says the application interface gains `readPlanTierRosters(session)` but does not say whether partial test applications must add the member, while their files are outside `allowed`. State `required` or `optional compatibility boundary` explicitly and include every required fixture surface if the former.
3. The long integrated capture outlived the outer Codex tool cell and did not forward the wrapper summary. Two process/log checks were needed before the final frame appeared. The capture helper should surface the child session id and completion frame through the same tool result.
4. The instruction to read every allowed file in full consumed 6,190 source lines even though the packet named narrow edit regions. Packets could mark large files as `NAMED BLOCK` explicitly and name the reference implementations needed for each hunk.

## One-prompt upgrades

- Resolve and print exact absolute skill files in the packet; do not make the seat discover which mirror is authoritative.
- Run packet-check against requirement labels and line ranges, not only path existence.
- Provide a shared typed `AskApplication` fixture builder on the allowed surface so a new application method changes one test utility rather than eleven unrelated fixtures.
- Ship a re-derivation patch or a second post-fix probe beside every probe whose expectations intentionally encode the defect.
- Have the runner emit one machine-readable record containing command, log path, per-file counts, inherited failures, mutant identity, restore `cmp`, and path-status equality. That removes repeated extraction and hand transcription.

## Evidence addresses

All full logs remain under `/tmp/FIX-S03-p1-F2-01a09c2d/`. Key files are `reviewer-probe-red.log`, `slice-render-red.log`, `contract-api-pins-red.log`, `c4-attempt-{1,2,3}.log`, `route-pins-attempt-{1,2,3}.log`, `integrated-17.log`, `typecheck-before.log`, `typecheck-after-3.log`, and `reviewer-probe-fixed-rederived.log`.
