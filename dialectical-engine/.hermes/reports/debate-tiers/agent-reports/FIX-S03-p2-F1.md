# FIX-S03-p2-F1 case file — the roster publisher/reader seam

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The defect was not a malformed roster and not an authorization failure. It was an untested producer/consumer join. The register publisher emits a closed internal row value `{ kind: "PLAN_TIER_ROSTERS", free, premium }` (`apps/runner/src/dev-deployment-register.ts:343-350`), while `PostgresAskApplication.readPlanTierRosters` passed that whole value to the strict public-wire schema `{ free, premium }` (`apps/api/src/index.ts:1487-1490`; `packages/contract/src/index.ts:308-311`). Zod rejected the producer's discriminator, the route returned 500, and `/new` rendered the named refusal with no ids.

The ruling is reader-side projection. The writer keeps the register convention; the wire stays `{ free, premium }`; the application projects those two named keys before the strict wire parse (`apps/api/src/index.ts:1487-1497`). The authenticated browser therefore receives no register-only key, including `kind` or a future sibling.

## Cause chain and price

1. FIX-S03-p1-F2 tested the route with an application stub and tested the application with a hand-built row lacking `kind` (`tests/unit/api.test.ts:242-315` at the pre-fix head). Every layer was green while their real join was absent.
2. REV(S03) pass 2 had to build the missing join and found the fault. Price: one whole review pass, one second FIX node, and the final lawful REV pass must now inspect a two-line semantic change plus its evidence.
3. This seat ran from 11:59 to the completed verification at 12:19 EEST, about 20 minutes. The integrated 17-file run alone cost 133.10 seconds. Exact Codex token accounting is not exposed. The mandatory fully-read packet, contracts, mission records, probes, and two writable tests totalled 2,827 lines before the Superpowers bodies and selected ranges; the 628-line append-only `DECISIONS.md` was the largest single replay cost.
4. The permanent test cost is one API case: `api` grew 29/29 → 30/30; C4 grew 78/78 → 79/79. No production schema, client, writer, route policy, page, or deployment policy moved.

## Class sweep

Class: a fixed-key public projection parsed an internal register-row object wholesale, so a producer-only discriminator became a strict-schema failure. The remedy for this fixed key set is a named allow-list projection, not `.passthrough()`.

- `packages/register/src/product-role-policy.ts:36` — declares `PRODUCT_ROLE_POLICY`.
- `packages/register/src/session-policy.ts:9` — declares `SESSION_POLICY`.
- `packages/register/src/recovery-policy.ts:9` — declares `RECOVERY_POLICY`.
- `packages/register/src/auth-policy.ts:11,29,40,68,73,171` — six discriminated auth-policy readers.
- `packages/register/src/index.ts:62,125,210,219,261,319,324` — seven discriminated core register readers.
- `packages/register/src/mfa-policy.ts:8` — declares `MFA_POLICY`.
- `packages/register/src` contains 17 `kind: z.literal(...)` sites and zero `PLAN_TIER_ROSTERS|planTierRosters` mentions. The S03 roster is the lone browser-facing projection and lives in the contract/API seam rather than the register package.
- `apps/api/src/index.ts:1494-1497` now projects `free` and `premium`; `packages/contract/src/index.ts:308-311` remains strict; `apps/api/src/index.ts:878-880` re-parses the projected result; `packages/contract/src/client.ts:509` still parses the same two-key wire shape.

## Evidence that changed the conclusion

- Untouched reviewer probes: `Test Files 2 failed (2)`; `Tests 4 failed | 6 passed (10)`, with real-row cases 2/3/3b and page case C RED.
- Slice-owned joining case: RED with `unrecognized_keys ["kind"]`, then GREEN after projection.
- Re-derived probes: 10/10. Case 3b now records that persisted register text intentionally keeps `kind`; page case C resolves the now-working route rather than forcing the obsolete 500.
- Direct-whole-row, compiled-application, compiled-handler, and schema-passthrough mutants all went RED. A harmless object-key-order neighbour stayed GREEN. Every product mutant was restored byte-equal with identical path-specific porcelain.
- C4: 79/79 ×3; route pins: 41/41 ×3; runner marker: `CLUSTER_GREEN`; integrated gate: 186/188 with only the two inherited `register-support-publication` titles; typecheck before/after logs are byte-identical with no diagnostic in an allowed path.

## What I nearly got wrong

The first version of the joining test fed the publisher the current file roster. That caught the `kind` failure but would have let an application mutant returning compiled `PLAN_TIER_ROSTERS` pass by coincidence. I replaced the input with distinctive roster values passed through the real publisher; the output remains independently literal. The prior compiled-roster mutant then failed.

I also considered adding `kind` to `PlanTierRostersSchema`. That schema is simultaneously the handler and client wire validator, so doing so would either expose an internal key to every authenticated browser or fail the second parse after an application transform. Splitting the schemas would require an import edit outside the packet's named API blocks. Projection closes the assigned class inside the legal surface.

## Dead ends nobody should re-derive

- Changing the writer to drop `kind` abandons the register-row convention carried by all 17 sibling readers.
- `.passthrough()` makes the current failure disappear by admitting every future row member onto a user-readable response; the existing closed-contract test correctly kills it.
- Reusing current config values in the join does not distinguish the sealed row from a compiled fallback.
- The promoted probe cannot become wholly GREEN unchanged under a reader-side ruling: persisted case 3b hard-codes a writer-side outcome, and page case C hard-codes the old rejection. Those two temporary assertions must be re-derived and explicitly disclosed.

## Packet and machine upgrades

1. The requested order posts CLAIM before the packet and COMMON are read, but COMMON contains the complete CLAIM schema (transcript path, HEAD, dirty count, cursor). This forced a second corrective CLAIM. Put the full CLAIM template in the DISPATCHED comment or permit COMMON before CLAIM.
2. The worker floor requires all 628 append-only DECISIONS lines although this node depends on the pass-2 tail. A generated, hash-stamped decision excerpt plus a pointer to the full record would remove the dominant context replay while keeping provenance checkable.
3. The verification contract names `run-suites.sh` as the marker authority, while charge 4 orders the aggregate commands through `run-capture.sh`. Both were run here. A machine-readable manifest should distinguish aggregate variance runs from per-suite marker adjudication.
4. Packet generation should fail if a producer-backed value is tested only with a hand-built consumer fixture. The manifest can name `producer`, `consumer`, `wire`, `fixtureFactory`, and required mutant; packet-check can then generate the join skeleton and reject a literal row.
5. One-prompt execution should ship an immutable JSON manifest beside the prose packet: allowed commit paths and named hunks, ordered reads, RED commands, expected summaries, mutants with restore paths, GREEN commands, inherited failures, commit subject, and the eight handoff fields. The prose then explains judgment; the manifest drives capture, counters, staging, and READY formatting without repeated transcription.

## Unverified

No live stack, browser, provider, live database, `.local/**`, main tree, or V desktop surface was touched. V's browser acceptance step 2 remains V/TEST(S03)'s operation. Exact model token use is unavailable from this transport.
