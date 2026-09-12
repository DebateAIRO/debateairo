# SPEC — S02 · The tier picks the fleet (ticket `t_e4b4ab3a`)

ui: no

**FROZEN at the REQ node's READY marker.** A change after that marker is `SPEC-v2.md` with a
supersession header, V-ratified — never an in-place edit.

## 0. The slice, end to end

An ask arrives carrying `plan_tier`. The tier names a roster of model ids. The admission path
intersects that roster with the models it has just probed and found healthy. If a roster member is
missing, the ask is refused with a typed error that names the missing model and the run never starts.
If all members are present, exactly those models form the panel, the composition math is sized by the
roster, and the run records which tier produced it. No substitute is ever chosen for a missing model.

S02 has no new screen. Its acceptance runs in a browser only because that is where V starts a debate;
the observable results are which models argue on the debate page, and the refusal message.

**S02 depends on S01.** `plan_tier` does not exist on the ask until S01 lands (S01 SPEC R12), and the
tier rosters are declared once, by S01, in `packages/contract` (S01 SPEC R11). S02 reads both; it
declares neither. The lane rebases onto S01's merged contract change — `DECISIONS.md`, row V-12.

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
- **R5.** Both rosters name models from at least two distinct makers, so the filtered panel still
  satisfies `runMakerReachability` (`apps/api/src/index.ts:1209`) and `assertMakerAdmission`
  (`packages/critique/src/index.ts:328`) classifies `CAPABLE`. A roster that would leave fewer than
  two makers is a configuration this declaration must not express, and the check that says so lives
  next to the declaration, not in the admission path.

### The refusal

- **R6.** If one or more roster members of the ask's tier are absent from the discovered-and-healthy
  panel, `evaluateAskAdmission` raises a `TypedDomainError` with the code
  `ASK_PLAN_TIER_MODEL_UNAVAILABLE` and passes it through `markAskRefusal`
  (`apps/api/src/index.ts:299-302`), so it leaves the API as an `AskRefusal`.
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
  a run V has just started, and that command is written into `PROGRESS.md` by the seat that
  implements R11 so V can run it in step 9 of the acceptance.

### Suites

- **R13.** These suites are run three times in the lane, worst run wins, reported as `passed/total`
  against `BASELINE.md`: `tests/unit/api.test.ts`, `tests/unit/contract.test.ts`,
  `tests/unit/load01-live-proof.test.ts`, `tests/unit/s7-authorization.test.ts`,
  `tests/architecture/s14-contract.test.ts` (base 2/5, RED at base — state the delta case by case),
  plus every suite that constructs an ask literal and every suite naming `evaluateAskAdmission`,
  `resolveDiscoveredPanel` or `panelSize`, enumerated by grep in the lane before the first RED test
  and listed in `PROGRESS.md`.
- **R14.** `pnpm typecheck` gains no diagnostic outside the files pinned in `BASELINE.md:43-65`.
- **R15.** A RED test exists, and is shown failing, for each of: the free filter (R3/R4), the premium
  filter (R3/R4), the single-missing-member refusal (R6/R7), the several-missing-members refusal
  (R7), no-run-on-refusal (R8), and the tier read back from the run (R11).

## 2. Acceptance — V runs these, in a browser, on the real dev stack

Precondition A (steps 1–4 and 8–9 only): row V-7 — V has added discovery targets for `gpt-5.6-luna`,
`claude-sonnet-5` and `grok-4.6` in `.local/dev-auth/api.env`, and all five models probe HEALTHY. No
seat edits that file. **Until V does this, steps 1–4 and 8–9 are UNVERIFIED and steps 5–7 are the
whole acceptance** — the refusal is testable today precisely because the Free models are missing.
Precondition B: V is signed in on the `:3000` stack, which serves the merge candidate.
Steps run once in **Terracotta** and once in **Chamber** (the `☾` / `☀` button in the top bar); the
mode changes nothing here, and the second pass exists to prove that.

1. Open `/new`, choose **Free**, type a question, press `Start run`. The debate page opens.
2. On the debate page, read the model names on the arguments. Exactly two distinct models argue, and
   they are `gpt-5.6-luna` and `claude-sonnet-5`. Neither `gpt-5.6-sol`, `claude-opus-5` nor
   `grok-4.6` appears anywhere in the run.
3. Open `/new` again, choose **Premium**, type a question, press `Start run`.
4. Exactly three distinct models argue: `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`. Neither
   `gpt-5.6-luna` nor `claude-sonnet-5` appears.
5. Make one member of a tier unavailable — the cheapest way is to stop the local bridge process for
   one model; V may instead remove its target. Wait for the probe freshness window to lapse.
6. Open `/new`, choose the tier that member belongs to, type a question, press `Start run`. The page
   does NOT navigate to a debate. An error appears on the form, and it names the model that is
   missing, by the same id the roster uses.
7. In devtools, the `POST /v1/asks` response is `422` and its body's `error` is
   `ASK_PLAN_TIER_MODEL_UNAVAILABLE`. Reload the library at `/`: no new debate was created.
8. Restore the member, wait for a fresh probe, and repeat step 6 for that tier: the run now starts,
   and the models that argue are exactly the tier's roster.
9. For the run started in step 1 and the run started in step 3, run the command `PROGRESS.md` records
   for R12: the first returns `free`, the second returns `premium`.

## 3. Out of scope for S02

The selector, the locks, the ask field itself, and anything on `/new` — all S01. Adding the missing
discovery targets — row V-7, V's own operation; no seat touches `.local/**` or prints it. Billing or
any gate on who may choose Premium — row V-6: none in this mission. Changing the composition formula
for a given panel size — `packages/register/src/index.ts:185-199` already covers every size ≥ 1.
