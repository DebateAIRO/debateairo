# DECISIONS — S02 · The tier picks the fleet (append-only)

One line per decision: date · question · choice · reason · who ruled. Checked before any question
goes to V — a question answered here is re-asked to nobody. Never rewritten, only appended.

## Decisions taken

| Date | Question | Choice | Reason | Ruled by |
|---|---|---|---|---|
| 2026-09-09 | Where does the tier filter the panel? | Inside `evaluateAskAdmission`, straight after `resolveDiscoveredPanel` (`apps/api/src/index.ts:1205`) | That function is the single place where the panel becomes `makers`, maker admission and `panelSize` (`:1206-1225`), and the only place whose typed errors are already marked as refusals (`markAskRefusal`, `:299-302`). Filtering later would leave `panelSize` computed from the wrong panel. | REQ |
| 2026-09-09 | What is the filter key? | `model_id` on `DiscoveredPanelMember` (`packages/db/src/index.ts:973-979`) | It is the field the probe fills with the model the target actually answers as (`apps/api/src/provider-discovery.ts:143-153`), and it is the string V's goal names (`gpt-5.6-luna`, `claude-sonnet-5`, …). `provider_ref` names the bridge, not the model, and would break the day a bridge is renamed. | REQ |
| 2026-09-09 | What HTTP status does an unavailable roster member produce? | `422`, via `TypedDomainError` → `markAskRefusal` → `AskRefusal` | `400`/`MALFORMED_REQUEST` means the body did not parse — the body here is perfectly valid. The existing branch already maps a refusal to 422 with the typed code and the real message (`apps/api/src/index.ts:506, 512-520, 530-533`), so the message can name the missing model without new plumbing. | REQ |
| 2026-09-09 | Does the panel size change the composition math? | No | `packages/register/src/index.ts:185-199` computes nodes and reviews from `panelSize` for any size ≥ 1. Two-model Free and three-model Premium are both already covered (contradiction C7). | REQ, from the intake |
| 2026-09-09 | Does S02 add UI for the refusal? | No | The message already travels: `ContractHttpError` keeps the server `message` (`packages/contract/src/client.ts:82-83`) and `/new` renders `exc.message` (`apps/ui/app/new/page.tsx:134-135, 155`). Acceptance step 6 proves the path rather than a new component. | REQ |
| 2026-09-09 | Which slice declares the rosters? | S01 (see `slices/S01/DECISIONS.md`) | S01 must render the model names on the selector, so it needs the declaration first; a second declaration here would let the screen and the fleet disagree. | REQ (charge 4) |
| 2026-09-09 | WHERE in `evaluateAskAdmission` does the roster check fire? | Immediately after the R3 filter and BEFORE `assertMakerAdmission` (`apps/api/src/index.ts:1216`) | Placed after `:1216`, an empty filtered panel throws `MAKER_INVENTORY_UNSATISFIED` first (`packages/critique/src/index.ts:334-339` throws iff `configuredMakers` is empty), so `POST /v1/asks` answers 422 with the wrong code and a message naming no model — and that is the ONLY acceptance path runnable before row V-7 is answered, because today the whole Free roster is missing. In the other direction, a Premium ask missing only `grok-4.6` leaves 2 members from 2 makers, `assertMakerAdmission` does not throw, and the run starts shrunk — which R9 forbids. Both failures are closed by the order and by nothing else. | REQ-FIX pass 2 (finding B1) |
| 2026-09-09 | Who writes down the R12 read-back command V runs in acceptance step 9? | The implementing seat, in its own READY handoff and self-report; the orchestrator relays it into `PROGRESS.md` and the review package | `PROGRESS.md` has one writer, the orchestrator (`slices/S02/PROGRESS.md:1`, `.claude/skills/heartbeat-requirements/SKILL.md:44`, `.claude/skills/heartbeat-orchestrator/SKILL.md:78`). A requirement that ordered the BUILD seat to write it left the seat a choice between crossing its file contract and leaving the command unrecorded — and step 9 is the only verification of R11 and row V-11, the row that decides whether a migration happens. An artifact the seat owns has neither problem. | REQ-FIX pass 2 (finding B4) |
| 2026-09-09 | Does a one-maker filtered panel refuse the ask? | No — it serves, with `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE` marks and `confidenceBandCapRequired` | `assertMakerAdmission` throws only on an EMPTY set of makers (`packages/critique/src/index.ts:334-339`, comment at `:332-333`). The two-maker threshold lives in `applyCriticUnavailableCap` (`:342-357`, called at `apps/api/src/index.ts:1230`), and `classification` is computed in the API at `:1210`, not in the critique package. R5's conclusion is unaffected — both rosters span two makers — but a BUILD seat would have written a test against the mechanism R5 named, and that mechanism did not exist. | REQ-FIX pass 2 (finding N4) |

## Alternatives rejected (the brainstorming discharge — nobody re-derives these)

| Rejected | Why |
|---|---|
| Substitute a healthy model for a missing roster member | The honesty law and contradiction C1: a debate that claims to be Premium and is not is worse than a debate that does not start. V's goal names the models exactly. |
| Start the run with the roster members that ARE available | Same reason, plus it silently changes the panel size and therefore the composition the register computed. |
| Fall back to the full discovered panel when a tier's roster cannot be met | It makes the tier decorative — the case where the tier matters most is the one where it would be ignored. |
| Infer the tier from the persisted `discovered_panel` instead of recording it | Two tiers can share a roster the day the fleet changes, and a run whose panel was later edited would answer wrongly. Row V-8 says the run records its tier. |
| Put `plan_tier` inside `askContract` (no migration) | For a `server` principal the ask contract is replaced by `CONTENT_JSON_SENTINEL` and encrypted into `content_ciphertext` (`packages/db/src/index.ts:1156-1170, 1201`), so the tier would not be plaintext-readable — and billing reading it later is the whole stated reason for recording it (C2 / row V-6). Opened as row V-11. |
| Filter in the runner or dispatcher instead of at admission | The refusal must happen before a run row exists (SPEC R8); by the runner, the row is already there. |
| Give each tier its own discovery target set in provider config | `.local/**` is V's, never a seat's (row V-7), and it would move a product decision into an untracked environment file. |
| Let the roster be resolved at request time from a database table | No such table exists, and no requirement asks for the rosters to change without a deploy. YAGNI — a declaration is one grep away from the truth. |

## Rows opened for V (routed through the orchestrator, never to V directly)

`V-ROW: V-11 · S02 · Where the run records its tier · Recommended default: a plaintext `plan_tier`
column on `core.run` beside `composition_budget_tier` (`packages/db/src/schema.ts:120`), with the
migration and an update to `core.create_encrypted_run` (`packages/db/src/index.ts:1182`). Evidence
against the cheaper placement: `askContract` is sentinel-replaced and encrypted for server
principals (`packages/db/src/index.ts:1156-1170, 1201`), so a tier stored there cannot be read by
billing or by V. S02 is already HIGH risk (`00-intake.md:20`), so the migration does not change its
classification. Smallest yes/no for V: "Add a plan_tier column to the run table?" · VERDICT column /
CONFIDENCE high / STRONGEST COUNTER: a migration on a shared dev database is the one step in this
mission that cannot be undone by reverting a branch — if V wants zero schema change, the honest
fallback is to record the tier nowhere and say so, not to hide it inside encrypted content.`

`V-ROW: V-12 · S02 · How the S02 lane gets `plan_tier` and the rosters · Recommended default: S02's
BUILD nodes start after S01 merges to `dev`, and the lane rebases onto it. Evidence: both lanes were
cut from `7f89f7b7` (`BASELINE.md:7, 40`) and S01 owns `packages/contract/src/index.ts`
(`INSTRUCTIONS.md`); if both lanes edit that file the merge conflicts in the one file whose shape
every other file depends on. Smallest yes/no for V: "May S02's build wait for S01's merge?" ·
VERDICT serialize / CONFIDENCE medium / STRONGEST COUNTER: it costs the parallelism the two lanes
were cut for — S02's ARCH, its RED tests and everything that does not name `plan_tier` can still run
in parallel, and only the clusters that touch the field wait.`

## Corrections appended at REQ-FIX pass 2 (2026-09-09) — the rows above stand as written, never edited

- **A `BASELINE.md` line citation went stale under an append, and this is a class, not a typo.** Row
  V-12 above cites "both lanes were cut from `7f89f7b7` (`BASELINE.md:7, 40`)". Line 7 still reads
  the `tiers-s01` HEAD; **line 40 no longer reads the `tiers-s02` HEAD** — five suite rows were
  appended to the `tiers-s01` section on 2026-09-09 at 21:00–21:02 (findings N3 and B2) and pushed
  that line down to **`BASELINE.md:45`**. The row's claim is unchanged and true; only the pointer
  moved. The same drift hit R14, whose `BASELINE.md:43-65` is corrected to `:48-70` in `SPEC-v2.md`, the
  v2 supersession. Two other citations were re-verified and are still correct: `S01/SPEC-v2.md` R21's
  `BASELINE.md:10-32`, and `BASELINE.md:7`.
  **The rule this yields, for every seat after this pass:** a line citation into an append-only file
  (`BASELINE.md`, `V-DECISIONS-PACKET.md`, any `DECISIONS.md`) is re-measured at the moment it is
  used and never carried forward from an earlier pass. Where the value is what matters, cite the
  value and the file, not the line — which is why the two suites R19 gained at this pass carry
  `57/57` and `8/8` rather than a line range.
  *Still open, and not this seat's file:* `V-DECISIONS-PACKET.md:18` carries the same stale
  `BASELINE.md:7, 40` inside row V-12. Orchestrator's file, orchestrator's fix.
