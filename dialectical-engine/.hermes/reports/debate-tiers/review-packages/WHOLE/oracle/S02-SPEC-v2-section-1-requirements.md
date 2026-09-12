<!-- VERBATIM extract of /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S02/SPEC-v2.md lines 32-168 (S02 §1 Requirements) — cut 2026-09-12 12:59 by the orchestrator; the SPEC of record is the highest-numbered SPEC-v<n>.md of the slice; nothing here is a judgment -->
## 1. Requirements

### The rosters

- **R1.** S02 reads the tier→roster declaration S01 created (S01 SPEC R11): `free` →
  [`gpt-5.6-luna`, `claude-sonnet-5`], `premium` → [`gpt-5.6-sol`, `claude-opus-5`, `grok-4.6`].
  `grep -rn` for each of the five model ids across `apps/` and `packages/`, excluding `*.test.*` and
  build output, still finds each id written as a roster member in exactly one file after S02.
- **R2.** The rosters are data, not code paths: adding, removing or reordering a member changes only
  that declaration. No `if` on a tier name selects models anywhere else.

### The filter

- **R3.** `evaluateAskAdmission` (`apps/api/src/index.ts:1195-1231`) resolves the discovered panel as
  it does today (`:1205`), then keeps only the members whose `model_id`
  (`packages/db/src/index.ts:973-979`) appears in the roster of `ask.plan_tier`, in roster order.
  Everything downstream in that function — `makers` (`:1206`), `makerAvailability` (`:1207-1214`),
  `assertMakerAdmission` (`:1216`), `panelSize` (`:1225`) and the returned `discoveredPanel`
  (`:1230`) — is computed from the FILTERED panel, not the raw one.
- **R4.** For an admitted ask, the number passed as `panelSize` to `resolveEnvelopeBasis` equals the
  number of model ids in that tier's roster — `2` for `free`, `3` for `premium` — and the
  `discovered_panel` persisted on the run (`packages/db/src/schema.ts:123`) contains exactly those
  members and no others. (Contradiction C7: `packages/register/src/index.ts:185-199` already computes
  the composition for any panel size ≥ 1, so no formula changes.)
- **R5.** Both rosters name models from at least two distinct makers, so a fully present filtered
  panel keeps `runMakerReachability` true and `classification` `CAPABLE` — both computed in
  `evaluateAskAdmission` from `makers.length >= 2` (`apps/api/src/index.ts:1209-1210`). A roster that
  would leave fewer than two makers is a configuration this declaration must not express, and the
  check that says so lives next to the declaration, not in the admission path.
  *The mechanism, corrected at pass 2 (finding N4 — v1 attributed the classification to the wrong
  function, and it is the mechanism a BUILD seat would write a test against).*
  `assertMakerAdmission` (`packages/critique/src/index.ts:328-340`) classifies nothing and reads
  neither `runMakerReachability` nor `classification`: it throws `MAKER_INVENTORY_UNSATISFIED` iff
  `new Set(availability.configuredMakers).size < 1` (`:334-339`), and its own comment states the rule
  — "every nonempty discovered panel serves" (`:332-333`). A one-maker panel is therefore admitted,
  not refused; the consequence lives in `applyCriticUnavailableCap`
  (`packages/critique/src/index.ts:342-357`, called at `apps/api/src/index.ts:1230`), which for
  `runMakerReachability` false returns `serves: true` with the marks `SINGLE-LINEAGE` and
  `CRITIQUE-UNAVAILABLE` and `confidenceBandCapRequired: true`. R5's conclusion is unchanged: both
  rosters span two makers or more, so neither the throw nor the cap follows from a roster that is
  fully present. What refuses a roster that is NOT fully present is R6, and only R6.

### The refusal

- **R6.** If one or more roster members of the ask's tier are absent from the discovered-and-healthy
  panel, `evaluateAskAdmission` raises a `TypedDomainError` with the code
  `ASK_PLAN_TIER_MODEL_UNAVAILABLE` and passes it through `markAskRefusal`
  (`apps/api/src/index.ts:299-302`), so it leaves the API as an `AskRefusal`.
  **The ORDER, pinned at pass 2 (finding B1): the roster check runs immediately after the R3 filter
  and BEFORE `assertMakerAdmission` (`apps/api/src/index.ts:1216`), so an empty or short filtered
  panel is refused as `ASK_PLAN_TIER_MODEL_UNAVAILABLE` and never as `MAKER_INVENTORY_UNSATISFIED`.**
  Placing the check anywhere after `:1216` is a build this SPEC refuses, and the two failures it
  produces are these:
  - *Empty filtered panel.* On today's dev stack no `gpt-5.6-luna` and no `claude-sonnet-5` target is
    configured (`00-intake.md:52`), so for `plan_tier: "free"` the R3 filter leaves the panel empty →
    `makers` is `[]` (`:1206`) → `configuredMakers` is `[]` (`:1211`) → `assertMakerAdmission`
    (`:1216`) throws `MAKER_INVENTORY_UNSATISFIED` (`packages/critique/src/index.ts:334-339`) →
    `markAskRefusal` (`:1218`) → `422 { "error": "MAKER_INVENTORY_UNSATISFIED", "message": "No healthy
    maker was discovered for standard (provider_probe:…)" }`. That body carries the wrong code for
    acceptance step 7 and names no model for step 6.
  - *Short filtered panel.* For `plan_tier: "premium"` with only `grok-4.6` missing, the filtered
    panel has two members from two makers, `assertMakerAdmission` does not throw, and the run starts
    with two of three — the shrinking R9 forbids. The order is load-bearing in both directions.

  R3 does not settle this: it lists `assertMakerAdmission` (`:1216`) among the CONSUMERS of the
  filtered panel, which is the reading that leaves the throw at `:1216` standing in front of the
  roster check. R6 settles it here, in control-flow terms, and R15 carries the RED test.
- **R7.** `POST /v1/asks` therefore answers `422` with the body
  `{ error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE", message: <text> }`
  (`apps/api/src/index.ts:506, 512-520, 530-533`), and `<text>` contains the tier name and the
  model id of EVERY missing roster member, verbatim as written in the roster. With more than one
  missing, all are named.
- **R8.** No run row is created for a refused ask, and no work item is enqueued: the refusal is raised
  inside `evaluateAskAdmission`, which runs before `startRun` (`apps/api/src/index.ts:1284` precedes
  `:1293`).
- **R9.** No substitution and no shrinking: there is no path in which a model outside the ask's tier
  roster joins the panel, and no path in which a roster whose members are only partly available
  starts a run with the members that are present. A reviewer checks this by reading every place the
  filtered panel is built and every fallback branch around it, and records the sweep place by place.
- **R10.** The refusal message reaches the browser unchanged: `ContractHttpError` carries the server
  `message` (`packages/contract/src/client.ts:82-83`) and `/new` renders `exc.message` in its error
  block (`apps/ui/app/new/page.tsx:134-135, 155`). S02 adds no UI code; it relies on this path and
  the acceptance below proves it end to end.

### The run records its tier

- **R11.** After a run starts, the tier its ask carried is readable back from the run, for a run
  created by a `server` principal (a signed-in user), WITHOUT decrypting run content.
  *The measured constraint:* for a `server` principal with a cipher configured, `startRun` replaces
  the stored ask contract with `CONTENT_JSON_SENTINEL` and encrypts the real one into
  `content_ciphertext` (`packages/db/src/index.ts:1156-1170, 1201`). A `plan_tier` placed inside
  `askContract` is therefore NOT plaintext-readable, and could not be read later by billing — which
  is the stated reason for recording it at all (C2 / row V-6). A column beside
  `composition_budget_tier` (`packages/db/src/schema.ts:120`) is plaintext, and costs a migration
  plus an update to `core.create_encrypted_run` (`packages/db/src/index.ts:1182`). The choice between
  them is opened to V as row **V-11** (`DECISIONS.md`), with the column recommended. S02 is already
  classified HIGH risk (`00-intake.md:20`), so the migration does not change its tier.
- **R12.** Whichever placement V rules, one command run against the dev database returns the tier for
  a run V has just started.
  *Who writes it down, corrected at pass 2 (finding B4 — v1 ordered the implementing seat to write
  `PROGRESS.md`, which no seat but the orchestrator may write: `slices/S02/PROGRESS.md:1`,
  `.claude/skills/heartbeat-requirements/SKILL.md:44`, `.claude/skills/heartbeat-orchestrator/SKILL.md:78`).*
  The seat that implements R11 writes the command **verbatim, with its expected output, in the
  artifacts it owns**: its READY handoff on the cluster's ticket (line 4 of the handoff shape,
  `heartbeat-protocol` §5) and its self-report. The orchestrator then relays that command into
  `slices/S02/PROGRESS.md` and into the review package it assembles at
  `.hermes/reports/debate-tiers/review-packages/S02-p<r>/` for the `REV(S02)` pass. Acceptance step 9
  names both places, so the step is runnable from whichever of them V has in front of them. A command
  that exists in no seat's handoff is a finding on this requirement.

### Suites

- **R13.** These suites are run three times in the lane, worst run wins, reported as `passed/total`
  against `BASELINE.md`: `tests/unit/api.test.ts`, `tests/unit/contract.test.ts`,
  `tests/unit/load01-live-proof.test.ts`, `tests/unit/s7-authorization.test.ts`,
  `tests/architecture/s14-contract.test.ts` (base 2/5, RED at base — state the delta case by case),
  plus every suite that constructs an ask literal and every suite naming `evaluateAskAdmission`,
  `resolveDiscoveredPanel` or `panelSize`, enumerated by grep in the lane before the first RED test
  and listed — with the grep that produced the list — in the enumerating seat's own READY handoff
  (corrected at pass 2, finding B4: `PROGRESS.md` is the orchestrator's file, and the orchestrator
  relays the list there and into the review package). A suite the lane's own grep finds and this list
  omits is a finding on this requirement.
- **R14.** `pnpm typecheck` gains no diagnostic outside the files pinned in `BASELINE.md:48-70` — the
  `tiers-s02` lane's typecheck block. (Corrected at pass 2: v1 cited `:43-65`, which was right when
  v1 was frozen and moved by five lines when the `tiers-s01` section gained its N3 and B2 suite rows
  on 2026-09-09 at 21:00–21:02. A line citation into an append-only file is checked at the moment it
  is used, never trusted from an earlier pass.)
- **R15.** A RED test exists, and is shown failing, for each of: the free filter (R3/R4), the premium
  filter (R3/R4), the **all-members-missing refusal** (R6's order — added at pass 2, finding B1), the
  single-missing-member refusal (R6/R7), the several-missing-members refusal (R7), no-run-on-refusal
  (R8), and the tier read back from the run (R11). Seven in all.
  *The all-members-missing test, in full, because it is the one the wrong build passes silently:* an
  ask whose tier leaves the filtered panel EMPTY answers `422` with `error:
  "ASK_PLAN_TIER_MODEL_UNAVAILABLE"` and a message naming every roster member of that tier, and the
  test asserts the code is **not** `MAKER_INVENTORY_UNSATISFIED`. Today's Free tier is exactly this
  case (`00-intake.md:52`), which is why it is the case V can run before row V-7 is answered.

