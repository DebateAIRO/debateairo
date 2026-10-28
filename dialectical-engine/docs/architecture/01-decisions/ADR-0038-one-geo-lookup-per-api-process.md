# ADR-0038 — One geo lookup per API process, opened in hosted mode whether or not the country gate is published

- **Status:** Proposed (mission `italy-clause-approval`, slice S01, ARCH(S01) pass 1, seat ARCH-ICA-S01, 2026-10-23). It is accepted when V does not veto the slice (the final whole-branch review replaced REV(S01): V, 2026-10-24, no heartbeat for the build).
- **Number:** measured with `ls docs/architecture/01-decisions/` at write time. `ADR-0037` was the highest in the main tree (origin/dev @ 368d578bb ends at `ADR-0032`; no branch or worktree holds `ADR-0038`), so this is `0038`. If another branch merges an `ADR-0038` first, this file is renumbered at its merge.
- **Source of record:** `docs/missions/italy-clause-approval/slices/S01/SPEC-v3.md` S01-R14 to S01-R17; V's ruling V-1 (a) (`docs/missions/italy-clause-approval/V-DECISIONS-PACKET.md`, 2026-10-23 12:01 EEST); `slices/S01/DECISIONS.md` § ARCH-ICA-S01 ("charge 2, the lookup"); `slices/S01/PLAN.md` steps P15 and P18.

## Context

The API resolves a source IP to a country with a local DB-IP file (`@debateai/geo`, `openGeoLookup`). Until this mission it opened the file only when a country policy was published (`apps/api/src/main.ts:376`), because the country gate was its only reader at sign-up; billing reads the same object inside a branch that also requires the policy (`main.ts:1365`, `:1422`).

The Italy-specific approval (articles 1341–1342 of the Italian Civil Code) needs the lookup at sign-up whether or not any country is closed: a person whose IP is in Italy must see the approval box (S01-R9, R14). V ruled (V-1 (a)) that a hosted server with no country policy and no geo file still starts, with the IP leg off and logged.

## Decision

1. **One lookup per API process.** `composeGeoLookup` (`apps/api/src/italy-approval.ts`) opens it once at boot and the same object is handed to every reader: the country gate, billing and the Italy decision. Nothing opens a second lookup (`main.ts` contains exactly one `openGeoLookup(`).
2. **Local mode never opens it** (S01-R16). Every sign-up then logs the skip line with reason `NO_LOOKUP`.
3. **Hosted with a country policy: fail closed.** A lookup that cannot open refuses the boot, as before. The gate's behaviour does not change.
4. **Hosted without a country policy: fail open.** The API starts, writes one line `{"event":"italy_approval.ip_leg_off","code":"<open error code>"}`, and the IP leg is off. Every sign-up then logs `{"event":"italy_approval.ip_leg_skipped","surface":…,"reason":"NO_LOOKUP"}`, and the picked leg still decides.
5. **Readers keep their own gates.** The country gate and billing still require a published policy (`main.ts:426`, `:1365`). A lookup that exists without a policy does not switch them on.
6. **Nothing the lookup returns is stored or shown.** The Italy row stores the leg (`PICKED`/`IP`/`BOTH`), never the country. The log lines hold neither the IP nor the country. `GET /v1/geo/availability` keeps its three booleans. This is ADR-0028/0029's "one resolver, nothing stored" rule applied to a second reader.

## Consequences

- A hosted deploy that publishes no country policy must still ship the DB-IP file, or the IP leg is off. The boot line is the signal, and the deploy checklist (ticket t_cde6277e) carries it.
- A future reader of the country (another per-country rule) takes the same object from the composition root. It does not get its own open, and it decides its own fail-open or fail-closed rule against this ADR.
- The process holds the file's memory in hosted mode even with no policy published. Before this ADR it did not.

## Rejected

- **A second, Italy-only lookup.** It keeps the gate's boot path byte-identical, but it opens the same file twice, doubles the memory, and lets the two answers drift if one is reloaded.
- **Fail closed without a policy.** It would refuse every hosted boot that lacks the file, against V-1 (a).
- **The edge's country header** instead of the lookup. REQ recorded this rejection: the edge country is not the source the country gate uses (S01-R14 "same source").
- **A pre-check route that exposes the server's country view to the page.** It conflicts with `country-gate.ts:105` ("Booleans only: the page never learns the country the server saw"). See DECISIONS, charge 1.

*Line numbers re-pointed to origin/dev d78d58b4f by ARCH-FIX-ICA-S01-r2 (2026-10-23): `apps/api/src/main.ts` moved; the cited lines are byte-identical (`probes/ARCH-ICA-S01/line-map.py`). The decision is unchanged.*
