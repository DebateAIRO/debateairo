# PARALLEL-01 Grok independent review (rev1) — UI-02b ‖ DEPTH-01

**Reviewer:** Grok (falsification pass; DR-156 standing law)  
**Input claim:** `reviews/PARALLEL-01-disjointness-analysis.md` (orchestrator)  
**Tickets read live:** `hermes kanban --board debateai-v3 show t_35a2b742` (UI-02b), `… show t_d5d1a650` (DEPTH-01)  
**Product/source code:** not edited. No parallel session dispatched.

---

## Verdict

**DISSENT — shared live acceptance stack (PG `55432`, API `8790`, shim `8791`, UI `3000`) + single scratch working tree: UI-02b must mutate and restart modules the standing serve process owns; concurrent DEPTH-01 inherits that same process, data dir, and tree.**

Source-path write sets can be *argued* disjoint under a perfectly disciplined DEPTH-01 worker. Shared **runtime** state cannot. DR-156's own scope note (decisions-ledger) treats port/DB collision as fatal as file collision — this pair fails that limb.

---

## Primary evidence (live board bodies)

### `t_35a2b742` UI-02b — Maker attribution per node (served-contract change)

- `packages/contract/src/index.ts` `NodeSchema` is `.strict()` and has **no** maker/model field; Edge/Inspection likewise.
- Maker exists only server-side in `ledger.raw_artifact`, via each node's `provenance_ref`.
- Scope: extend **served contract** with per-node maker/model lineage (or a dedicated inspection resource), populate serve path from real recorded lineage, surface on V2 node cards. DR-115: typed absence, never guessed labels / `'shim'`.
- Depends on UI-02a (done). Lane: Claude codes, Grok reviews.

### `t_d5d1a650` DEPTH-01 — Cost debate per depth; envelope table for V

- Register `runCostEnvelope` currently one member `{standard, depth 1, max_model_attempts 9}` in `acceptance/seed-register.ts`.
- **This pass DELIVER:** derivation + proposed table as  
  `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md`,  
  then **STOP and hand up**. Do **not** seed values V has not ratified.
- **Only after V rules:** seed rows, update byte-faithful `acceptance/seed-register.test.ts`, unpin `acceptance/runtime-policy.ts`.
- Ticket also flags: `runtime-policy.ts` pins a **one-member** envelope tuple and will refuse to boot if a second member is seeded without unpinning in the same pass; register content change forces a **fresh** `acceptance/.pgdata` (back up first; DR-151).
- Cost must be counted from **shipped organs / real call sites** (JUDGE, COMPOSER, CONFORMANCE, FAIR-01 critic), with and without blocked PRO-01 / PANEL-01 multipliers.

---

## Attack surface (a) — Is DEPTH-01's this-pass write set really one markdown file?

**Orchestrator claim:** exactly one new file under `docs/missions/.../ratification/`; everything else is READ.

**What the ticket actually binds:**

| Phase | Named paths |
|---|---|
| This pass (proposal only) | `docs/missions/2026-08-06-v3-programming/ratification/DEPTH-01-envelope-proposal.md` only (seed/unpin forbidden until V rules) |
| After V rules (out of this pass) | `acceptance/seed-register.ts`, `acceptance/seed-register.test.ts`, `acceptance/runtime-policy.ts`, plus **fresh** `acceptance/.pgdata` |
| Protocol-forced side writes (CODING-LOOP-PROTOCOL) | `docs/missions/2026-08-06-v3-programming/handoffs/DEPTH-01-progress.log`, `handoffs/DEPTH-01-codex-handoff.md`, and status rows in `~/.hermes/kanban/boards/debateai-v3/kanban.db` |

**Pinned reality on disk today:**

- `acceptance/runtime-policy.ts:39-45` — `runCostEnvelope.members` is `z.tuple([{ depth: 1, risk_tier: "standard", max_model_attempts: 9 }])` (literal one-member pin).
- `acceptance/seed-register.ts` carries the single-member seed the ticket cites.
- `acceptance/.pgdata` exists and is owned by the live postgres on `55432`.

**Plausible overshoot (not required by the body, but real worker risk):**

- A counting script or temporary test under `scripts/`, `tests/`, or `acceptance/` to "compute exact cost from shipped organs" (ticket's own arithmetic duty invites tooling).
- Touching `acceptance/seed-register.ts` / `runtime-policy.ts` "to verify the pin" mid-proposal — would break the standing serve path that **reads those modules at boot**.

**Verdict on (a):** Under a disciplined reading of the body, **this-pass product write set is one ratification markdown** (plus protocol handoff/progress files that UI-02b does not share by name). That is **not** enough to clear the pair: the post-V paths and the live stack that *already* depends on the one-member pin remain shared hazards if the worker drifts, and the stack is shared even if the worker is perfect (see surface c).

---

## Attack surface (b) — Is UI-02b's footprint wider than predicted?

**Orchestrator predicted writes:**  
`packages/contract/src/index.ts`, maybe `client.ts`, `apps/api/src/index.ts`, `packages/serve/src/index.ts`, `apps/v2-ui/lib/v3/adapter.ts`, `components/DebateCanvas.tsx`, `components/NodeDetailDrawer.tsx`, `tests/unit/v2ui-*.test.ts`, `tests/unit/contract.test.ts`, `tests/architecture/*`.

**Confirmed / extended from repo probes:**

| Path | Why UI-02b hits it |
|---|---|
| `packages/contract/src/index.ts` (`NodeSchema` `.strict()`, lines 262–278) | No maker field today — whole reason for the ticket |
| `packages/contract/src/generate.ts` → `packages/contract/generated/field-inventory.json`, `generated/openapi.json`, `generated/client.ts` | Package `exports` point at `./generated/client.ts`; any NodeSchema field add forces regenerate. Orchestrator under-named this. |
| `packages/contract/src/client.ts` | `readNode` validates with `NodeSchema`; field or new resource path |
| `packages/serve/src/index.ts` | Node projection today sets `provenance_ref` but not maker lineage from `raw_artifact` |
| `apps/api/src/index.ts` | Serve surface for the new field / resource |
| `apps/v2-ui/lib/v3/adapter.ts` | Wire → V2 view models; `grep -a` safe (current `nul_count` 0; `\u0000` only as intentional key separator in `modelLedgerIdentityKey`) |
| `apps/v2-ui/components/DebateCanvas.tsx`, `NodeDetailDrawer.tsx` | Node-card surface |
| `tests/unit/contract.test.ts`, `tests/unit/v2ui-*.test.ts` | Contract + UI assertions |
| `tools/orphan-audit/src/index.ts` | Reads `packages/contract/generated/field-inventory.json`; new fields/surfaces can force inventory / exemption rows |
| `pnpm audit:architecture` / 27-row dependency table (`tests/architecture/scaffold.test.ts`) | Unlikely to need a new **package** edge if only a field is added — but contract shape changes still run through architecture/orphan gates |

**Does UI-02b reach `docs/missions/.../ratification/`?** Not required by the ticket. No forced collision with `DEPTH-01-envelope-proposal.md` on that path alone.

**Verdict on (b):** Write set is **wider than the orchestrator listed** (generated contract artifacts + orphan-audit inventory coupling), still **mostly disjoint from DEPTH-01's proposal path** if DEPTH-01 stays doc-only. Footprint width is not the killing limb; shared runtime is.

---

## Attack surface (c) — Shared non-source state (attack hardest)

Observed **right now** on this machine (same tree both sessions would use):

| Resource | Live fact |
|---|---|
| Working tree | Single repo; both tickets `workspace: scratch`; board default workdir is this mission tree. No per-ticket git worktree. Git is V-gated (CODING-LOOP): both leave uncommitted dirt in one tree. |
| PG `55432` | `postgres` listening; data dir `acceptance/.pgdata` (PG_VERSION present) |
| API `8790` + shim `8791` | Same node process: `tsx acceptance/run-acceptance.ts --token v-dev --serve` (loads `@debateai/contract`, serve, API) |
| UI `3000` | `next-server` with `NEXT_DIST_DIR=.next-dev` under `apps/v2-ui/.next-dev` (git already shows dirty webpack packs / page bundles) |
| Kanban SQLite | `~/.hermes/kanban/boards/debateai-v3/kanban.db` (~966KB); protocol uses `hermes kanban claim/complete` **and** raw `sqlite3 … UPDATE tasks` |

### Why UI-02b cannot share this stack safely with a sibling session

1. **UI-02b is a served-contract change.** It must edit `packages/contract` + `packages/serve` + `apps/api` — the exact modules the live `--serve` process has already imported. Verification of "populate from real lineage + surface on V2 cards" requires the API on `8790` and UI on `3000` to serve the **new** schema. That means **restarting** (or replacing) the standing ceremony process that exclusively holds `55432` / `8790` / `8791`.

2. **`acceptance/standing-db.ts` reuse rule:** if a second session starts a ceremony while PG is reachable on `55432`, it **attaches** to the standing server and runs `migrate()` rather than starting a private DB. There is no second isolated acceptance database on the standard ports. A mid-restart or mid-migrate window is a cross-session fault.

3. **`acceptance/.pgdata` is single-owner state.** DEPTH-01's body warns that a later seed forces a **fresh** data dir (backup first). Even in the proposal pass, any accidental seed/test that rewrites `.pgdata` while UI-02b's serve process has the directory open is catastrophic for both.

4. **UI dist dir:** UI-02b will rewrite `adapter.ts` / drawer / canvas → next recompiles into `apps/v2-ui/.next-dev`. That directory is already live-owned. A concurrent full-suite or UI test from the other session races the same cache.

5. **Kanban board DB:** different ticket ids can both be `claim`ed, but heartbeats, comments, `complete`, and CODING-LOOP's direct `sqlite3` status flips all hit **one** SQLite file. Contention is softer than ports, but it is still shared mutable state with no per-session board.

6. **Harness OPS law already forbids concurrent Codex seats:**  
   `docs/missions/2026-08-06-v3-programming/logs/run-ticket-codex.sh` refuses launch while any `codex exec` is alive (learned 2026-08-11 from DR-155 `Orphan function call output` wedge). DR-156 may override that *after* a genuine disjointness finding — this review finds the finding is **not** genuine on the runtime limb.

### What DEPTH-01 still does against the same stack

Even a pure-read cost derivation:

- Runs in the **same** scratch tree the UI-02b worker is rewriting.
- May import or typecheck packages while `packages/contract` / `packages/serve` are mid-edit.
- Protocol loop after handoff can claim the **next** ready `[Codex]` ticket (HYG-01 / POL-01 / …) while UI-02b is still open — turning a "safe pair" into an accidental third footprint (see surface d).

**Verdict on (c):** **Fatal.** One live stack on `55432`/`8790`/`8791`/`3000`, one `acceptance/.pgdata`, one `.next-dev`, one `kanban.db`, one scratch tree. UI-02b's lawful completion path **requires** mutating and restarting stack-owned code. That is a runtime collision independent of markdown vs TypeScript write-set disjointness.

---

## Attack surface (d) — Further collisions the orchestrator did not weight

1. **Session continuous-flow after DEPTH-01 finishes.** CODING-LOOP-PROTOCOL steps 1 and 7: after a ticket settles, the same session polls for the next ready `[Codex]` ticket. Ready siblings that **collide with UI-02b** if grabbed early:
   - `t_4a1f8654` HYG-01 → `tests/unit/v2ui-pages.test.ts`, `NodeDetailDrawer.tsx`, `apps/v2-ui/lib/v3/adapter.ts` (NUL sweep / dead test runner)
   - `t_a8ad8b2f` POL-01 → `apps/api/src/index.ts` error handler (same API file UI-02b must edit)
   - `t_b8750870` XREV-01 → depends on maker tags landing first; same UI surfaces + runner

2. **Generated contract client is the public export.** Half-written `packages/contract/generated/*` during UI-02b regen can break any concurrent import (DEPTH-01 tooling, vitest, orphan-audit).

3. **No branch isolation.** `workspace_kind` default `scratch`; protocol forbids worker commit/branch. Parallel means **two agents editing one uncommitted tree** — merge semantics are "last writer wins on disk," not git merge.

---

## Safer pair among the six ready tickets?

| Pair | Why still unsafe / why relatively better |
|---|---|
| UI-02b ‖ HYG-01 | **Direct file collision** (`NodeDetailDrawer.tsx`, `v2ui-pages.test.ts`, `adapter.ts`) — orchestrator correctly rejected |
| UI-02b ‖ POL-01 | **Direct collision** on `apps/api/src/index.ts` |
| UI-02b ‖ XREV-01 | Ordering dependency + same UI/runner surfaces |
| UI-02b ‖ S15 | Orphan-audit / field-inventory coupling risk; S15 needs real-run attestation against the **same** stack UI-02b is restarting; S15 still has honest-attestation tension with open human gates |
| DEPTH-01 ‖ HYG-01 | **Relatively better source disjointness** (docs vs UI hygiene) and neither is a served-contract change — **but** HYG-01's repo-wide NUL sweep is a write-set landmine, and both still share the live stack + scratch tree + `kanban.db` |
| DEPTH-01 ‖ S15 | Both heavy on tools/docs/attestation; S15 still wants a real run on shared ports and may edit `tools/orphan-audit` while DEPTH-01 is only reading organs — still not a clean DR-156 pass |

**Recommendation:** run **UI-02b alone** against the standing stack (it owns the contract/serve/UI restart). Run **DEPTH-01 after** (or strictly sequential before UI-02b if you want the envelope proposal without mid-edit package noise). Do **not** parallel-dispatch UI-02b ‖ DEPTH-01.

If throughput pressure forces a second seat despite this dissent, the least-bad *source* pairing is **DEPTH-01 ‖ HYG-01** under explicit goal-packet scoping that **forbids** continuous-flow claim of a third ticket and **forbids** any acceptance ceremony / port bind / `.pgdata` rewrite — and even then Grok would want another dedicated review; this document does **not** greenlight that pair.

---

## Adapter / grep note (as ordered)

- `apps/v2-ui/lib/v3/adapter.ts`: used `grep -a`; file currently has **zero raw NUL bytes** (`nul_count 0`).
- Remaining `\u0000` appears only as an intentional identity-key separator inside `modelLedgerIdentityKey` (string separator, not file corruption). Prior silent-grep hazard is fixed for this review; not a parallel-safety collision by itself.

---

## Bottom line

| Question | Answer |
|---|---|
| Source write sets disjoint if both workers are perfectly disciplined? | **Plausibly yes** (UI-02b code/tests/generated contract vs DEPTH-01 one ratification md + handoffs) |
| Shared runtime disjoint? | **No** — `55432` / `8790` / `8791` / `3000` / `acceptance/.pgdata` / `.next-dev` / `kanban.db` / one scratch tree |
| Orchestrator determination stands? | **No — DISSENT** |

**DISSENT — shared live acceptance stack (ports `55432`/`8790`/`8791`/`3000`) and single scratch working tree under UI-02b's required contract/serve restart.**
