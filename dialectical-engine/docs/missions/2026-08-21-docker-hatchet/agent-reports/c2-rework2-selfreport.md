# SELF-REPORT — C2-DOCKER-OPUS rework round 2 (Claude Opus 5)

- **Ticket:** `C2-DOCKER-OPUS` · mission `2026-08-21-docker-hatchet` · loop ARCHITECTURE · stage C2
- **Seat:** Claude Opus 5, **same session** `353f7aa5-5955-4e9b-8601-812810039d2b` (resumed)
- **Round:** `rework_round: 2` · `authority_epoch: 3`
- **Comments read through:** H2-rework-1 remaining RED; G3-rework-1 APPROVED preserved
- **Deliverable:** `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` (1691 lines, was 1369)

## Contract compliance

**Writes: exactly the two paths in the rework-2 packet's `allowed` list.**

| Path | Action |
|---|---|
| `docs/missions/2026-08-21-docker-hatchet/architecture/Plan.md` | revised in place |
| `docs/missions/2026-08-21-docker-hatchet/agent-reports/c2-rework2-selfreport.md` | created (this file) |

No other file was written, created, moved or deleted. **No commit. No push.** No board operated.
**Hermes Agent not run.** **No reviewers launched.** **V not contacted.** **Docker not started**;
no `docker` command executed; nothing put on `PATH`. **No compose mutation.** All seven §3.2
baseline hashes re-verified unchanged after the write, including `compose.dev.yaml`
(`a61c779d5b61010c`). No tracked file modified by this seat. **No OPEN-V row closed, and no
2–1 product contest decided** (V-2, V-3, V-5 remain parameterized).

## Scope discipline

The packet scoped this round to **H2-03…H2-09 only**. H2-01, H2-02 and the secondary
replay-service defect are RESOLVED in the re-review and **were not touched**.

**I confirmed the reviewer read this exact artifact:** the re-review cites Plan SHA
`39819b2e6dece970dfe5a078f8a917d8ac9426b46aa3f0f4b9b061e3510060dd`, which matches the round-1
file byte for byte. Every reproduction below is therefore against the text the reviewer saw.

## Reproduce-first

All seven reproduce. `Plan.md` §0.2b is the ledger with the quoted round-1 passage for each.

| Finding | What the round-1 text actually said |
|---|---|
| **H2-03** | §2.7.1's `web` row: *"an **HTTP GET of a page path** served by `next start`"* — a class, not a command. `runner`/dispatcher deferred to U-8/U-11 with no owner. **AR-14**: timing values *"**recorded once** in `deploy/DISCLOSURE.md`"* — deferred, not chosen. |
| **H2-04** | §4.1's D0b row: *"IMPORTANT OPERATIONS: **none**"* though it creates and removes a project. D3's covered only token minting. D4 cited **V-13**, which ratifies values, not permission to mutate. L-3 killed the runner with no authorization at all. |
| **H2-05** | Three incompatible manifest rules (§3.1 single writer D0b; §3.2 every ticket records; §4.3 every slice appends). **DP** had no owned file in §3.1 or §4.3. §3.5 permitted *"an **additive** `.gitignore` line"* for a path in no class. |
| **H2-06** | `OPS` defined as *"operator secret file"* with no path. Crypto row said `MOUNT` with no source or target and named only `api` though `apps/runner/src/main.ts:13` calls `loadKek`. Address rows named variables without values. `API_HOST` absent from the matrix. `DATABASE_URL` *"composed **only** from the row above"* without the composition. |
| **H2-07** | D3 had SQL artifacts but no authorization for `CREATE DATABASE`/`CREATE ROLE`/`GRANT`. **AR-18** said *"a body conforming to `AskRequestSchema`"* and *"any non-empty `x-user-dev-token`"* — a schema and a predicate, not a fixture and a token. |
| **H2-08** | AR-19: route removal *"is routed through a **separate authorized file contract**"* with no producer named, so V-9(b) could be selected with the route still present. |
| **H2-09** | L-rows named triggers in prose: L-1 *"by our own recorded ordering"* without the claim field; L-2 *"evidenced by … separate recorded events"*; L-3 *"let the engine redeliver to the restarted worker"* with no restart step **though AR-7 forbids automatic restart**; L-5 *"a typed retryable failure"* with no assertion path. |

## Findings → clause

| Finding | Flipped by |
|---|---|
| **H2-03** | **§2.7.1** exact `CMD-SHELL` per unit (`pg_isready` ×2; `node -e` fetch of `/v1/session` with a health marker; `node -e` fetch of `/`); **AR-21** makes **D3a** the hard discovery predecessor with an exact-or-`ABSENT` rule per surface; **§2.7.1a** chooses the timing values outright |
| **H2-04** | **V-14** (privileged DB), **V-15** (product data), **V-16(a)/(b)/(c)** (destructive lifecycle), each with a stated scope and each wired into §4.1 as a hard entry criterion. The plan now states plainly that **authorization is not a value decision** |
| **H2-05** | **§3.2** one hash-record file per slice (`path-manifest/<slice>.md`) — one writer per path, a per-ticket record and an append-only history, with no rule contradicting another; **DP** gains `deploy/compose/prod/00-prod.yaml` + `deploy/PRODUCTION-TARGET.md` and a writer; **AR-21a** moves the operator secret outside the repository so **no `.gitignore` edit exists** |
| **H2-06** | **§3.6** re-cut: exact `OPS` path, a crypto-mount table with host source / container target / mode / **every** consumer (`KEK_PATH` now also `runner`), a ports-and-hosts table with values and their justification, `API_HOST` added, and the **literal composition** of all eight derived URLs |
| **H2-07** | **V-14** authorizes the DB writes; **AR-18 re-cut** into an artifact — `deploy/fixtures/acceptance-ask.json` (all thirteen `.strict()` fields), the fixed token `acceptance:dispatch-probe`, the **deterministic** derived asker id, and explicit retention semantics under **V-15** |
| **H2-08** | **AR-22** — `AC60-ROUTE-CONTRACT`, orchestrator-owned, with its deliverable named; **D5's entry under V-9(b) is that ticket accepted and closed**, and until then D5 is BLOCKED rather than falling back to V-9(a) |
| **H2-09** | **§2.6.2** re-cut: a fixed evidence surface (`core.work_item`, `ledger.ledger_entry`, `ledger.raw_artifact` with the exact columns), **L-0** preconditions, exact procedures and numeric assertions per case, an explicit `start` step because **AR-7 forbids automatic restart**, and an **ABSENT rule** forbidding any claim that an unproven law was proven |

**Findings BLOCKED or deferred: none.**

## G3 preservation

**G3-rework-1 recorded PEER REVIEW APPROVED (F-1…F-7 FLIPPED)**, so this round's changes are
**surgical section edits, not a rewrite** — the approved clauses are preserved by construction
rather than by re-typing. `Plan.md` §0.2a is the audit table; verified by anchor count after
the edits:

- **Untouched:** AR-2 / AR-2a (F-2, F-6), §2.8's command table, §1.1's unit-class column,
  §3.2's hashed-path classification and GENERATED OUTPUT class (F-7), DP's V-2(b)/(c) gating
  (F-5), and AR-1…AR-13, AR-15…AR-20.
- **Extended, never reversed:** AR-17 gained an authorization (V-14) but the same mechanism;
  §2.7.1 gained exact probes but the same per-unit requirement (F-4); AR-14 chose its values
  instead of deferring them; AR-15's ruling is unchanged, only §2.7.2's completion rows gained
  exact commands (F-1).
- **No G3 flip is unwound.**

## New V rows, and why each is V's

**V-14 · V-15 · V-16** are **authorizations, not values** — H2-04's sharpest point was that
round 1 cited V-13 (which ratifies *what values are*) against D4's product-data writes. Each
carries an exact scope; each is a hard entry criterion of the slice performing the mutation;
none weakens AR-2a, and **DR-188 holds throughout — no scope includes `-v` or any volume
deletion**. They are separated from the value rows deliberately: a seat may know every value
and still lack permission to write.

## Where this round exceeds the findings, and the one ruling to scrutinise

- **AR-14's numerals (§2.7.1a) are the only numbers this plan mints.** H2-03 required them to
  be chosen; AR-14's classification under §5.4c's own test (changing an interval cannot move a
  produced artifact) is what makes choosing them lawful rather than an AC-76 breach. **If that
  classification is wrong, the timing table is the only thing that falls, and it falls back to
  V.** Flagged in §10 as the round-2 ruling to look at hardest.
- **Every port value is an existing convention or a vendor default, not a choice**:
  `API_PORT=8790` is already the tree's convention (`web/.env.local`), `WEB_PORT=3000` is
  hardcoded by both Next apps, and `5432`/`7077`/`8888` are the image and vendor defaults
  already in `compose.dev.yaml`.
- **Two defects in my own edits, found by self-audit and fixed**: the timing block landed
  between §2.7.1 and §2.7.2 (renumbered **§2.7.1a**, which is also more accurate — it continues
  the health-check subject), and D0a still claimed a manifest write that now belongs to D0b.

## Round-2 verification (read-only, no runtime)

Five code facts were established so the H2-09 and H2-07 proofs name real objects rather than
concepts:

1. **Claim columns** — `packages/battery/src/index.ts:284-297`: `core.work_item`, `state`,
   `claimed_by`, `claim_deadline`, `FOR UPDATE SKIP LOCKED`; `claimed_by` carries
   `RUNNER_WORKER_ID` (`apps/runner/src/index.ts:1250-1252`).
2. **Ledger tables** — `packages/ledger/src/index.ts:184-218`: `ledger.ledger_entry`
   (`sequence`, `run_id`, `attempt_id`, `action_kind`, `call_site_key`, `subject_item_id`,
   `outcome`) and `ledger.raw_artifact`.
3. **`AskRequestSchema` is `.strict()` with thirteen required fields**
   (`packages/contract/src/index.ts:107-122`) — which is what makes a fixture specifiable.
4. **`KEK_PATH` is required by `runner` too** (`apps/runner/src/main.ts:13`) — round 1's matrix
   named only `api`.
5. **`packages/crypto/SECRET_STORE_LAYOUT.md`** fixes the store's shape and modes, so §3.6's
   mount targets are **taken from it, not chosen**.

## Assumptions and risks

- **AR-14's numerals** — above; the single most overturnable ruling this round.
- **V-14/V-15/V-16 could be refused.** If V declines V-15, MB-9 has no lawful trigger and D4
  stops at the health checks; if V declines V-16(b), L-3/L-4/L-6 are UNPROVEN by authorization
  rather than by vendor absence. Both are recordable outcomes, and §2.6.2's ABSENT rule already
  forbids describing the affected laws as proven.
- **D3a can come back empty.** If `deploy/VENDOR-SURFACES.md` records `ABSENT` in §W or §E,
  MB-3 is unmeetable for `runner` or the dispatcher and the answer is a blocker, not a weaker
  check. What round 2 changed is **when** that surfaces — at D3a on a known date, rather than
  inside the load-bearing slice.
- **AR-22 adds an external dependency.** Under V-9(b), D5 waits on a ticket this mission does
  not own. That is the honest shape: the route change is outside this mission's file contract,
  and pretending otherwise was H2-08's finding.
- **V-13 remains the largest executability gap**, unchanged from round 1.

```
REWORK READY FOR PEER REVIEW:
- mission/step: 2026-08-21-docker-hatchet / C2-rework-2
- owner CLI session: 353f7aa5-5955-4e9b-8601-812810039d2b
- findings addressed: H2-03, H2-04, H2-05, H2-06, H2-07, H2-08, H2-09
- findings BLOCKED/deferred: none
- comments read through: H2-rework-1 remaining RED; G3-rework-1 APPROVED preserved
```
