# S03 — The VPS kit's §11 says what the shipped code does, and a pin keeps it saying it

ui: no
SUPERSEDES `SPEC-v2.md` (and through it `SPEC.md`; both frozen and byte-identical) — written by REQ-FIX-PES-p5 at node REQ-FIX pass 5 on V's ruling V-14 ("Yes, reword all three", `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, row V-14 — `:27` at this pass), not on a review verdict; no REQ-REV follows. Requirements CHANGED from v2: **R3.4b** only (NEW, after R3.4: every other `deploy/vps/README.md` mention of `COST_ENVELOPES_NOT_SEALED` — §11's refusal-table row and §10's production-maker-path bullet — says what R3.4 says; the table keeps the row). Requirements UNCHANGED, byte for byte: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8, R3.9; §1, §2, §4 and §5 are unchanged. S03's C1 and C2 are ALREADY BUILT on `slice/provider-env-selection-s03` (604b15158, ec66d5e7c); R3.4 and R3.4b are one fix cluster on top of C2. §6 records V-14 as ruled. This file is the SPEC of record; every later packet names it by this file name.

FROZEN at REQ-FIX-PES-p5's READY marker on t_7b7c43d6 (2026-09-25). A change after that marker is a
V row or `SPEC-v4.md` with a supersession header, never an in-place edit.

Independent of S01 and S02: nothing here reads their output, and nothing there reads this.

## 1. Why this slice exists (the measured gap)

Intake §10 item (b), plus the cost note item (d) leaves behind. Measured in
`.worktrees/pes-base/dialectical-engine` @ 776359c3:

- §11's hosted target example at `deploy/vps/README.md:848` reads
  `{"provider_ref":…,"base_url":…,"model":…,"authorization_file":…}` and its member table at
  `:841-846` lists those four members and no price. Both services REQUIRE the price in hosted mode
  (`apps/api/src/main.ts:312`, `apps/runner/src/main.ts:87`, both calling
  `assertPricedProviderTargets`, `packages/providers/src/index.ts:679`). The kit's own notice says
  it: `deploy/vps/README.md:19-23` — provisioned exactly as printed, each unit refuses at boot with
  `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref.
- §11's refusal table at `:770-782` carries none of the six codes the notice at `:25-27` names.
  `git grep -n` over the README finds each of those six ONLY inside the notice at `:20-27`,
  never in the table.
- The reason the drift was not caught: the pin at
  `tests/unit/v9-provider-credential-files.test.ts:394-435` reads codes out of the source and
  asserts each appears in §11 — but the constant it reads is
  `PROVIDER_CREDENTIAL_REFUSAL_CODES` (`packages/providers/src/index.ts:740-744`), which holds
  exactly three codes. `packages/providers/src/index.ts:727-731` claims "the kit's §11 table is
  pinned against it, so the two cannot drift"; the pin covers one constant, and the table drifted
  around it. That is the CLASS, and R3.5 sweeps it.
- **(d), the cost note.** `probeFreshnessMs` reaches the resolver from the register row
  `panelDiscoveryPolicy`, validated as `z.number().int().positive()`
  (`packages/register/src/index.ts:444-467`) — the only floor is 1 ms. The probe spends
  `max_tokens: 8` per target per staleness window
  (`packages/providers/src/provider-probe.ts:82`). The dev seed publishes `600_000`
  (`apps/runner/src/dev-deployment-register.ts:344`). No mode-aware minimum exists:
  `git grep -n probe_freshness_ms -- apps packages tests` finds the seed, the parser and one
  fixture. Whether a FLOOR should exist is V's, not this mission's — `docs/architecture/05-register-skeleton.md:506`
  records provider call bounds as "values — none stated", and
  `docs/architecture/01-decisions/ADR-0015-deployment-maker-inventory.md:127-131` bars stating a
  probe budget outside the register. So this slice DOCUMENTS the exposure and builds no floor;
  the floor is `V-ROW: NEW` in `../S01/DECISIONS.md`.

## 2. What is out of scope, stated so no coder invents it

- No refusal code is added, renamed, reworded or removed. This slice writes down codes the tree
  already emits.
- No probe floor, no rate limiter, no new register row. R3.6 writes a paragraph, not a guard.
- The §11 stale bullets this slice does not fix stay in the "Known-stale sections" list untouched
  (`deploy/vps/README.md:32-38`).
- No product behaviour changes. `git diff --stat` for this slice touches `deploy/vps/README.md`
  and test files, and no file under `apps/` or `packages/`.

## 3. Requirements

**R3.1** §11's hosted target member table (`deploy/vps/README.md:841-846`) lists
`input_price_micros_per_million` and `output_price_micros_per_million`, each with the value the
shipped checker requires, stated from `packages/providers/src/index.ts:679`'s own rule.

**R3.2** §11's worked example line (`deploy/vps/README.md:848-849`) carries both price members in
both the `runner.env` form and the `api.env` form, so a target pasted from §11 boots.

**R3.3** §11's refusal table (`deploy/vps/README.md:770-782`) carries a row for each of the six
codes the notice at `:25-27` names — `PROVIDER_TARGET_PRICE_REQUIRED`, `PROVIDER_TARGET_PRICE_ZERO`,
`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`, `COST_ENVELOPE_POLICY_UNRESOLVED`,
`COST_ENVELOPE_POLICY_INVALID`, `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` — and each row's Meaning
column states the condition that emits it, taken from the line of source that throws it, with that
`path:line` recorded in `PROGRESS.md`.

**R3.4** The §11 support-chat sentence at `deploy/vps/README.md:747-751` no longer says the daily
call cap is the only ceiling. It states the shipped behaviour in two parts. First, what a hosted
operator meets: a hosted deployment reads the `costEnvelopePolicy` row in force at its own register
version and refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` when that version sealed none,
or with `COST_ENVELOPE_POLICY_INVALID` when it sealed one that is malformed
(`packages/register/src/cost-envelope-policy.ts:163-166`, `:131-134`; both service roots read it in
hosted mode, `apps/api/src/main.ts:241-242` and `apps/runner/src/main.ts:111`). Second,
`COST_ENVELOPES_NOT_SEALED` is named as what it is — a check on the integrity of the build, which
fires only when the build's in-source envelope row was removed, emptied or made invalid, and which
the shipped source never reaches at runtime (`packages/register/src/runtime-environment.ts:112-115`,
the live gate named at `:118-124`). V ruled this wording
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:23`, V-11).

**R3.4b** Every other mention of `COST_ENVELOPES_NOT_SEALED` in `deploy/vps/README.md` says what
R3.4 says. Measured in the S03 lane at C2's head (`ec66d5e7c`) with
`grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md`, the file has three such lines: `:737`
is inside the support-chat paragraph R3.4 owns, and the other two are this requirement's (at the
base, `776359c3`, they were `:779` and `:711-713`).
(a) §11's refusal-table row whose first cell is `` `COST_ENVELOPES_NOT_SEALED` `` (`:769`) stays in
the table, because R3.5's class is every refusal code the cost-envelope surface can emit and a build
whose in-source envelope row is broken emits this one
(`packages/register/src/runtime-environment.ts:143-147`). Its Meaning cell says that the code is a
check on the integrity of the build — the envelope row this build ships was removed, emptied or
made invalid, and with the shipped source it is unreachable at runtime (`:112-115`) — and that the
refusal a hosted operator meets is `COST_ENVELOPE_POLICY_UNRESOLVED` or
`COST_ENVELOPE_POLICY_INVALID`, the table's rows at `:776-777`. The cell no longer says the
envelopes "are not published yet" or that "a hosted runner refuses to claim work until they are".
(b) §10's bullet that begins `**The production maker path is now ruled` (`:692-700`) no longer
says a hosted runner "refuses to start with `COST_ENVELOPES_NOT_SEALED`". It says that until V-28's
cost-envelope policy is sealed at the register version a hosted deployment runs, that deployment
refuses to start with `COST_ENVELOPE_POLICY_UNRESOLVED` or `COST_ENVELOPE_POLICY_INVALID`, and it
names no other code for that refusal.
After the edit, `grep -n COST_ENVELOPES_NOT_SEALED deploy/vps/README.md` prints exactly two lines:
one inside R3.4's support-chat paragraph and the table row of (a). The known-stale list at the top
of the README (`:14-27` at C2's head) holds no bullet about the envelopes, and none is added.
`tests/architecture/vps-deployment-baseline.test.ts:359` requires the code somewhere in the README,
which (a) keeps true. The pin of R3.5 enumerates twelve codes (`union.size` 12,
`tests/unit/v9-provider-credential-files.test.ts:423`), and `COST_ENVELOPES_NOT_SEALED` is not among
them: no anchor of that pin reads `CostEnvelopesNotSealedError`, so neither edit moves the pin's
count. V ruled this (`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table,
row V-14 — `:27` at this pass).

**R3.5** The drift pin is widened from one constant to the CLASS, and the sweep is recorded
member by member. The class: **every operator-facing refusal code the provider, credential, price
and cost-envelope surface can emit appears in §11's refusal table.** A test enumerates those codes
by reading them out of the source — not from a list retyped in the test — and asserts each appears
in `deploy/vps/README.md` §11. The enumeration's source constants are named in `PLAN.md` and each
is recorded in `PROGRESS.md` with its `path:line` and the codes it yielded, so a reviewer checks
the sweep mechanically rather than by trusting it.

**R3.6** §11 carries one paragraph stating the paid-probe cost exposure in numbers taken from the
tree: the probe spends `max_tokens: 8` per target per staleness window
(`packages/providers/src/provider-probe.ts:82`); the window is the `panelDiscoveryPolicy` register
row's `probe_freshness_ms`, validated only as a positive integer
(`packages/register/src/index.ts:457`); the value the development seed publishes is `600000`
(`apps/runner/src/dev-deployment-register.ts:344`); and no minimum is enforced in hosted mode, so
the number an operator publishes is the whole control. The paragraph states no recommended value.

**R3.7** The two bullets §11 owns in the "Known-stale sections" list —
`deploy/vps/README.md:19-23` (the hosted provider target example) and `:24-27` (the incomplete
refusal-code table) — are removed from that list, because R3.1–R3.3 make them false. The bullets
at `:28-31`, `:32-34` and `:35-38` are re-read against the tree and each is either left exactly as
it is or, where already false, removed with the `path:line` that shows it false recorded in
`PROGRESS.md`.

**R3.8** Every assertion of `tests/architecture/vps-deployment-baseline.test.ts` that reads
`deploy/vps/README.md` (`:333`, `:351`, `:378-379`, `:446`, `:459`, `:463`, `:480`, `:500`) is
re-run after the edits. The suite is GREEN at base; it is GREEN after. Any assertion this slice
changes is named in `PROGRESS.md` with its line, its text before and its text after, and the
requirement number that forced the change.

**R3.9** §11's shell blocks keep the property `tests/architecture/vps-deployment-baseline.test.ts:378`
asserts — no angle-bracket placeholder inside a §11 shell block — so a block stays safe to paste.

## 4. Verification

The base pairs are the intake's baseline table, cited and not restated:
`docs/missions/provider-env-selection/00-intake.md:40`; the logs are
`.hermes/reports/provider-env-selection/logs/baseline-intake-suites.log` and
`baseline-intake-typecheck.log`.

The four suites RED at base stay EXACTLY at their pairs — no requirement above touches the dev
composition, the dev provider panel or the algorithm register:
`tests/integration/dev-api-environment.test.ts`, `tests/integration/dev-api-process.test.ts`,
`tests/integration/dev-provider-panel.test.ts`, `tests/integration/t16-algorithm-register.test.ts`.

`pnpm typecheck` is judged by the per-file DELTA against `baseline-intake-typecheck.log`, never by
its exit code. This slice edits Markdown and test files, so its expected delta is zero.

## 5. Acceptance — numbered steps V runs alone on this Mac

Every step starts with `export PATH="/opt/homebrew/bin:$PATH"`. No step starts a process, opens a
port or reaches the network.

1. `cd` into the slice lane the orchestrator names in the TEST(S) ticket.
2. Run the widened pin and the kit baseline by their exact repository paths:
   `pnpm vitest run tests/unit/v9-provider-credential-files.test.ts tests/architecture/vps-deployment-baseline.test.ts`.
   Both report every case passing, and the reported pair for
   `tests/architecture/vps-deployment-baseline.test.ts` is its base pair from the intake's
   baseline table.
3. Read the six codes in the table with
   `grep -nE 'PROVIDER_TARGET_PRICE_REQUIRED|PROVIDER_TARGET_PRICE_ZERO|PROVIDER_DISCOVERY_TARGET_PRICE_INVALID|COST_ENVELOPE_POLICY_UNRESOLVED|COST_ENVELOPE_POLICY_INVALID|SUPPORT_ADMISSION_SCOPES_NOT_SEALED' deploy/vps/README.md`.
   Each of the six appears on a line inside §11's refusal table, and no longer only inside the
   known-stale notice near the top of the file.
4. Read the price members in the example with
   `grep -n 'input_price_micros_per_million' deploy/vps/README.md`. A hit falls inside §11's member
   table and a hit falls inside §11's worked example line.
5. Read the known-stale list with `sed -n '14,40p' deploy/vps/README.md`. It no longer carries the
   hosted-provider-example bullet or the incomplete-refusal-table bullet.
6. Read the cost paragraph with `grep -n 'max_tokens' deploy/vps/README.md`. One hit is in §11, in
   a sentence that also names `probe_freshness_ms`, and the paragraph recommends no value.
7. Confirm no product file moved: `git diff --stat origin/dev...HEAD -- apps packages` prints
   nothing.

## 6. Open question routed to V

Whether a hosted probe-freshness FLOOR should exist at all is `V-ROW: NEW` in
`../S01/DECISIONS.md`. R3.6 writes the exposure down either way, so this slice does not wait on it.

V-11 is ruled ("Yes, name real codes"); R3.4 is that ruling. The pass-4 `V-ROW: NEW` on §11's
refusal-table row and §10's envelope bullet was transcribed as V-14, and V ruled "Yes, reword all
three" (`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md`, rulings table, rows V-11 and
V-14); R3.4b is that ruling. None open.
