# DECISIONS — slice S03 (append-only; one line per decision: date · question · choice · reason · who ruled)

A question answered here is re-asked to nobody. Checked before anything goes to V.

## Ruled at REQ (2026-09-13, seat REQ-S03) — the alternatives are recorded because a fleet seat has no human to say yes to (`heartbeat-requirements` §Superpowers)

- 2026-09-13 · **`ui:` yes or no?** · **`ui: no`** · `/new` already draws a model chip per roster
  member (`apps/ui/app/new/page.tsx:199-210`); S03 changes what those chips SAY, not what exists on
  the page. `heartbeat-requirements` §2: "a slice whose only browser step is watching existing
  components render stays `ui: no`". Rejected: `ui: yes`, which would open a MOCK gate and hand V a
  DONE.md to write for a slice that adds no surface — a mock of an unchanged page, priced at one
  seat and one V round-trip for nothing. C15 (`00-intake-S03.md:74`) says the page changes in data
  only, and the intake left the flag to REQ (`:58`) · REQ-S03.
- 2026-09-13 · **File format and path** · **YAML at `config/models.yaml`** · it is the preview V
  chose, verbatim down to the path in its first comment line (`00-intake-S03.md:23-49`), and its
  instructional comments ("Put Grok in Free too…") are the thing that makes it editable by hand.
  Rejected: JSON — no new dependency, but it cannot carry a comment, which deletes the half of V's
  preview that teaches the edit. Rejected: TOML — not what V saw. Note for ARCH: `yaml@2.9.0` sits
  in the workspace store but is no package's dependency, and no `config/` directory exists (F11) ·
  REQ-S03.
- 2026-09-13 · **How a Free entry declares its transport** · **`api: <maker>` with explicit
  `base_url:` and `key:` lines** (SPEC R4) · every value V may need to change is visible in the file,
  including the Z.ai endpoint that row V-35 says may move. Rejected: `api: zai` alone with the base
  URL and key-variable defaulted in code — two lines per entry instead of four, but it puts a value
  V is expected to change back into a TS file, which is the thing this slice exists to stop; the
  first V-35 edit would be a code change. Rejected: `transport: api` + `maker: zai` as separate keys —
  one more line than `api:` and no gain. **This departs from V's two-line preview, so it also goes to
  V as the row below** · REQ-S03, default binding until V rules.
- 2026-09-13 · **Where the key lives** · **`.local/dev-auth/provider-keys.env`, mode 600, the file
  naming only the VARIABLE** (SPEC R5, R12) · ruling R-S03-1, named at intake so V can act before
  ARCH; the custody shape is the one `readGlmCredential` already asserts
  (`acceptance/hermes-relay.ts:33-40`). Rejected: reading the Z.ai key from the Hermes store as the
  support relay does — it works today and needs no V action, but it couples the debate fleet to a
  third-party tool's credential file and gives the two Free entries two different custody paths.
  ARCH may still choose it for Z.ai by a line here; the SPEC's R10 is written so either satisfies it,
  as long as the file names a variable and never a key · REQ-S03.
- 2026-09-13 · **One slice or two (file first, keys second)?** · **one slice** · ruling R-S03-2: the
  transport is declared IN the file, so a file of `cli:` entries only would not carry V's goal.
  Rejected: S03a (the file) → S03b (the key transport) — a smaller review package each, but the first
  would ship a file shape that the second immediately re-freezes, and V's goal is one sentence ·
  orchestrator at intake, recorded here.
- 2026-09-13 · **Does the SPEC pin how `/new` gets the lists at runtime?** · **no — it pins the
  observable only** (SPEC R16) · C15 names two candidates (an API route, or a generated module the
  restart rewrites) and the choice is ARCH's. REQ states what V runs: edit, restart, reload, read the
  new id, with nothing under `apps/ui/` rebuilt · REQ-S03.
- 2026-09-13 · **Does the SPEC pin how the probe passes on GLM 5.3 Flash?** · **no — the observable
  is a HEALTHY record whose `modelId` is `glm-5.3-flash` exactly** (SPEC R13) · the two candidates
  the intake measured are Z.ai's `thinking: {type: "disabled"}` (UNVERIFIED on this key) and a larger
  probe budget for that target; both are mechanisms, and F6 is a measurement, not a design ·
  REQ-S03.
- 2026-09-13 · **The identity dot for `glm-5.3-flash`** · **accept the `default` family** (SPEC R17) ·
  `modelKey` (`apps/ui/lib/models.ts:26-35`) has no `glm` branch, so the chip shows the raw id with
  `var(--m-default)` — legible, distinct from the GPT chip beside it, and nothing renders blank.
  Rejected: adding a `glm` family now — one map entry plus a `--m-glm` token, and a new colour
  literal in `globals.css` lands on the token-contract suite (`tests/unit/t9-mode-tokens.test.ts`,
  already 2 failed | 7 passed at base), which buys a colour at the price of a RED suite inside a
  wiring slice. Reversible in one line later; NOT sent to V, because both outcomes satisfy R17 and
  V's queue is not the place for a grey dot · REQ-S03.
- 2026-09-13 · **`claude-sonnet-5` after Free loses it** · **it survives in no production file** (SPEC
  R8) · the id is quoted-exact in exactly one file today
  (`tests/architecture/tier01-roster.test.ts:43-52` proves it), so removing the Free entry removes the
  id from the product entirely; only the suites that pin it change. Rejected: keeping it declared as
  an unused constant "in case V switches back" — a second declaration is precisely what R8 forbids,
  and switching back is an edit of one line in the file · REQ-S03.
- 2026-09-13 · **Acceptance in both display modes?** · **once, in whichever mode V is in** · S03 adds
  no element and no token; the chips it changes were exercised in both modes by S01's acceptance.
  Rejected: the S02 pattern of running everything twice to prove the mode changes nothing — S02 said
  so explicitly (`slices/S02/SPEC-v2.md:182-183`) and it held; repeating it here prices V's time for
  a result already recorded · REQ-S03.
- 2026-09-13 · **Which tree's line numbers the SPEC cites** · **the S03 LANE at `7188b167`** · BUILD
  works in the lane. The main tree carries another mission's uncommitted `+13` lines in
  `apps/api/src/index.ts`, which is why the intake's F1 citations into that file (`:1227`, `:1229`,
  `:1236`) are 13 lines ahead of the lane (`:1214`, `:1216`, `:1223`). Every other file the intake
  cites is byte-identical between the trees (`git diff --stat 7188b167..HEAD` over them is empty) ·
  REQ-S03.

## Rows for V (numbered by the orchestrator at transcription — never by a seat)

V-ROW: NEW · S03 · slice ticket `t_f14b0ca0` · **A Free entry is four lines, not the two V's preview
showed.** V chose a file shape where an entry is `cli: codex` + `model: gpt-5.6-luna` — two lines. A
Free entry now names an HTTPS API instead of a CLI, and two more facts have to live somewhere: which
URL the maker is called at, and which variable in `.local/dev-auth/provider-keys.env` holds the key.
This SPEC puts both in the file:

```yaml
free:
  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/paas/v4
    key: ZAI_API_KEY
```

Premium's entries stay exactly two lines, as previewed.
Recommended default: keep the four lines. Row V-35 already says the Z.ai base URL may have to change
(the pay-as-you-go endpoint answered 429; the coding endpoint answers 200) — with the URL in the
file, that is an edit and a restart, which is the whole point of the slice; with it defaulted in
code, it is a code change on V's first switch.
Smallest yes/no for V: "Is it fine that a Free entry carries two extra lines — the API's URL and the
name of the key variable — so both can be changed in this file?"
VERDICT keep the four lines / CONFIDENCE high / STRONGEST COUNTER: V asked for "a simple config file
where things happen easily", and doubling an entry's height is the first step of every config file
that ended up unreadable; the two-line form with `openai` and `zai` defaults in code is genuinely
simpler to read, and V may never edit a base URL again after V-35 is settled.

---
**Fold by the orchestrator, 2026-09-13 15:35 (REQ-S03 finding 3, N — no SPEC edit):** SPEC R27's row `tests/integration/dev-api-environment.test.ts | 9/10 — RED at base in the LANE` is stale. The cause was the orchestrator's own commit `6a05a0d0` sweeping another session's uncommitted hunk into that file (finding `t_ec1eda80`); fixed by `4df0b2b5`, cherry-picked to the lane as **`9a000c37`**, where the file is **10/10**. BUILD seats read the lane baseline at 9a000c37 (`setup-tiers-s03.log` rows + this line); the SPEC's RED row is superseded here, not by a SPEC-v2. Findings 4–5 (packet ambiguities: "append only" vs the slice-table row; both-modes rule on a `ui: no` slice) are template notes for the orchestrator; finding 6 (`apps/runner/src/main.ts:65-71` first-slot pin) is ARCH's, carried by SPEC R14.

---
**Fold by the orchestrator, 2026-09-13 16:45 (REQ-REV-S03 pass 1 = REWORK; verdict `reviews/REQ-REV-S03-p1.md`).** B1 `t_1292cc86`, B2 `t_748b2433`, B3 `t_d502e39f` go to REQ-FIX(S03) `t_9ee87d3d` (SPEC-v2). N-findings folded here, closed on the board: **N1** the lane constant is `9a000c37` (SPEC-v2 states it) · **N2** the 9/10 row — see the 15:35 fold; `setup-tiers-s03.log` carries a dated correction line · **N3** the refusal list has six members, not five (SPEC-v2 counts them) · **N4** R14's entry→slot mapping is undefined — SPEC-v2 states its observables (one slot per entry, refs stable across restarts, an explicit order rule; the runner's first-slot pin `apps/runner/src/main.ts:65-71` makes the order load-bearing); the mechanism stays ARCH's · **N5** SPEC-v2(S02):36-39 still spells `grok-4.6` — S02's document is history; SPEC-v2(S03) §0 names what it supersedes · **N6** packet wording (orchestrator), template fixed `cdaf24aa`; the seat's slice-table insert was inside the contract · **N7** a CLAIM's "session id" from an Agent-tool subagent is the parent's — template edit pending (name the transcript file instead). **V rows in force for the rework:** V-35 answered (subscription endpoint), V-36 default (four-line Free entry), V-37 default (`glm-5.3-flash`), V-38 default (a missing key or a failing probe starts the stack with the slot absent + a named warning).

---

## Ruled at REQ-FIX, pass 2 (2026-09-13, seat REQ-FIX-S03) — under the verdict `reviews/REQ-REV-S03-p1.md` and V's 16:05 update. Output: `SPEC-v2.md`; `SPEC.md` is untouched.

- 2026-09-13 · **Requirement numbering across v1→v2** · **R1–R29 keep their ids and meanings; the new
  requirements are R30, R31, R32** · every "SPEC Rn" reference already written in this file, in
  PLAN.md and in the folds above keeps resolving, and a BUILD seat reading a pass-1 ticket comment is
  not sent to a renumbered requirement. Rejected: renumbering into a clean R1…R32 — tidier to read
  once, and it silently invalidates every citation made by three nodes before it · REQ-FIX-S03.
- 2026-09-13 · **B1 — what "declaration" means** · **a string literal that IS the id (quoted-exact),
  the oracle `tests/architecture/tier01-roster.test.ts:43-52` already uses; `tiers-s02-rosters.test.ts`
  changes its matcher from bare-substring to match** · measured this pass in the lane at `9a000c37`
  for all six ids plus V-37's alternative: under the bare matcher `glm-5.3-flash` **and** `glm-5.3`
  each hit the same three support files (`apps/api/src/support/model.ts`,
  `apps/runner/src/dev-support-model.ts`, `apps/runner/src/dev-auth-stack.ts`), because the id is a
  substring of `"development:hermes-glm-5.3-flash"` and `"z-ai/glm-5.3-flash"` — and `glm-5.3` is in
  turn a substring of `glm-5.3-flash`, so **no id V can choose makes the bare oracle true.** Under
  quoted-exact, all three support files and both `cards.ts` hits fall away and every id's expectation
  is `[]`. Rejected: allow-listing the three support files — R8 said "exactly one allow-list", the
  occurrence counts would have to become 2/1/2, and the allow-list would grow again the next time a
  provider ref embeds a model id. Rejected: deleting the id from the support files — R26 forbids it
  and it breaks V's live support widget. The third exit is the one taken, and it is not silent: R27
  names the suite, the matcher, the deleted allow-list and the new total · REQ-FIX-S03.
- 2026-09-13 · **The `cards.ts` allow-list** · **deleted as unnecessary** · measured:
  `apps/ui/components/landing/cards.ts:27-28` are `"Anthropic · Claude · claude-opus-5"` and
  `"OpenAI · GPT · gpt-5.6-sol"` — display copy that contains the id and never was a quoted-exact
  declaration. The allow-list existed only to hold the bare matcher off marketing prose; the matcher
  change removes its reason. (The verdict did not state this; it is this pass's own measurement.)
  · REQ-FIX-S03.
- 2026-09-13 · **R8 needs a positive limb** · **a suite reads `config/models.yaml` and asserts each
  tier's ids against the lists the product exposes at runtime** · with only the negative limb ("no
  file declares these ids") R8 is satisfied by a build that deletes the ids entirely. Neither scan
  reaches the file — both are rooted at `apps`+`packages` (`tier01-roster.test.ts:17-27`,
  `tiers-s02-rosters.test.ts:8-9`) and `.yaml` is not in `SOURCE_EXTENSIONS` — so the limb is a new
  case, not a widened scan, and `tiers-s02-rosters` becomes 5/5. Rejected: widening a scan root to the
  repo root, which would drag every root-level file into two architecture suites · REQ-FIX-S03.
- 2026-09-13 · **V's "Switch the 5.3 to GLM 4.7"** · **the file names `glm-5.3-flash`, not `glm-4.7`,
  and V's subscription is what it calls** · F13, measured ≈14:35 (this stamp was first written "16:05", an estimate — corrected 17:02): on the subscription endpoint a
  request for `glm-4.7` is answered with `model: "glm-5.3-flash"`; `glm-4.6` and `glm-5-turbo` the
  same; `glm-5` → `glm-5.3`; only `glm-5.3` and `glm-5.3-flash` answer under their own id. The probe
  demands an exact echo (`apps/api/src/provider-discovery.ts:77-79`) and DR-115 says the app records
  the id the maker reports, so naming `glm-4.7` would either fail the probe or make the app claim a
  model the maker never served. V gets the subscription V asked for; the id is the one it answers as
  (row V-37's default, one line to change). Rejected: naming `glm-4.7` and letting the panel relabel
  it — that is precisely the silent substitution the honesty law forbids · REQ-FIX-S03, on V-37's
  binding default.
- 2026-09-13 · **The Z.ai base URL** · **`https://api.z.ai/api/coding/paas/v4` in R7 at merge** ·
  row V-35 is ANSWERED by V's words *"we got a subscription, use them API_TOKENS"*; the token on this
  Mac answers 200 there while the pay-as-you-go base still answers 429. v1 pinned the pay-as-you-go
  URL, which would have made V's first act after merge an edit of the file the slice just shipped ·
  REQ-FIX-S03.
- 2026-09-13 · **B2/B3 — what the restart does when a key is missing or a model does not answer** ·
  **row V-38's default: shape refuses, availability starts with the slot absent and a named warning**
  (R20 vs R31/R32) · under v1, R20.5 made a failing probe a refusal and R21 rolled everything back, so
  acceptance step 8 could never produce the refusal it demanded (the old stack kept serving), and the
  merged file — naming two keys nobody has — made `pnpm dev:auth:up` refuse on any machine but V's.
  The split keeps every class V named as a refusal (*"typos, a CLI that isn't installed"*,
  `00-intake-S03.md:22`) and moves only the two classes that are about the world being absent rather
  than the file being wrong. Rejected: weakening R20 — the verdict is right that the defect was in the
  step, not the rule. Rejected: leaving step 8 UNVERIFIED until V rules — it is the only acceptance of
  R15, the honesty law this mission is built on, and V-38's default makes it the cheapest step there
  is. R31 carries one sentence saying exactly what moves if V rules the other way · REQ-FIX-S03, on
  V-38's binding default.
- 2026-09-13 · **N4 — the slot order** · **Premium's `cli:` entries first, in file order, then Free's**
  · the runner copies slot 0's `authorizationHeader` into the api.env primary triple
  (`apps/runner/src/main.ts:65-71`), so a Free `api:` entry at slot 0 would put V's paid API key there.
  Keeping slot 0 a local relay costs nothing and keeps the key out. The verdict's counter is recorded:
  order is what REQ was told to leave to ARCH — but slot 0's identity is an observable with a custody
  consequence, and R14 pins the observable while the derivation mechanism stays ARCH's · REQ-FIX-S03,
  adopting the verdict's N4 recommendation.
- 2026-09-13 · **N3 — the refusal count** · **six, enumerated** (username, password, query, fragment,
  non-`http(s)` scheme — the five conditions of `packages/providers/src/index.ts:113-126` that survive
  — plus the `cli:`-slot loopback-port rule of `dev-provider-panel.ts:87-89`) · v1 listed six and then
  wrote "five" twice, so a seat would have written five RED tests or six · REQ-FIX-S03.
- 2026-09-13 · **N1/N2 — the lane constant and the stale baseline row** · **lane is `9a000c37`;
  `tests/integration/dev-api-environment.test.ts` is 10/10 there** · re-measured this pass:
  `git show --stat 9a000c37` is one test file, +1/−5, so no product line moved and all sixteen of v1's
  cited ranges still land (spot-checked seven, all OK). SPEC-v2 §0, PLAN.md and INSTRUCTIONS.md carry
  the corrected constant, and R27 carries 10/10 with the warning that reporting 9/10 as pre-existing
  is reporting a regression · REQ-FIX-S03.
- 2026-09-13 · **N5 — the S02 supersession trace** · **SPEC-v2 §0 states that S03 R8 replaces S02
  SPEC-v2 R1** (`slices/S02/SPEC-v2.md:36-39`, which also still spells `grok-4.6` where the fleet is
  `grok-4.6-build`), and that S02 R3–R10 stay live, carried by R15 · without it a later REV lens reads
  a stale sentence as a live contradiction · REQ-FIX-S03.
- 2026-09-13 · **What was NOT changed** · R1–R6, R9, R10, R12, R15–R18, R22, R24, R25, R29 are
  byte-equivalent in meaning to v1 · the verdict found no defect in them and re-opening a frozen
  requirement without a finding is scope. In particular the `ui: no` ruling stands — the verdict
  checked the skill body itself and recorded the quote as real and correctly applied · REQ-FIX-S03.

---
**Fold by the orchestrator, 2026-09-13 17:55 (REQ-REV-S03 pass 2 = REWORK; verdict `reviews/REQ-REV-S03-p2.md`).** Pass-1 B1/B2/B3 CLOSED by the reviewer (tickets closed). **B1(p2)** `t_d8d52693` → REQ-FIX(S03) pass 3 `t_19ed95ac` (SPEC-v3): R23's "minus any slot absent under R31" distributes over five surfaces — `/new` must keep the FILE's lists (R16/R31/step 8), and the register/api.env/discovery set needs ONE build: the verdict's Build A (five targets always; a keyless Free slot configured but absent from the HEALTHY panel; `authorization_header` already optional, `packages/providers/src/index.ts:171-177`) unless contested with a measurement. **The positive limb of R8 stays** (ruled IN, §5: without it a build that never reads `config/models.yaml` passes every suite — the file would be decorative). N folds: **N1(p2)** R20 class 6 vs R11's sixth refusal (an observed base URL no file fixture can produce) — the class list and R28's fixture count must agree · **N2(p2)** R27's `tiers-s02-rosters` row is silent on the suite's first case; 5/5 holds only if `PLAN_TIER_ROSTERS` survives fed from the file at runtime — say so · **N3(p2)** R8 names one suite for the positive limb, R27 gives it to both — one suite · **N4(p2)** the handoff said 430 lines, `wc -l` says 454 — counts are measured at write time · **N5(p2)** `COMMON.md:7` still said base 7188b167 — fixed (orchestrator). Rows for V: none new (the reviewer's §9). Pass 3 is the last rework: a REWORK at REQ-REV pass 3 becomes a V row ("does the published register set follow the file, or the entries that could start?").

---

## Ruled at REQ-FIX, pass 3 of 3 (2026-09-13, seat REQ-FIX-S03) — under the verdict `reviews/REQ-REV-S03-p2.md`. Output: `SPEC-v3.md`; `SPEC.md` and `SPEC-v2.md` untouched.

- 2026-09-13 · **B1(p2) member (i) — does `/new` lose an absent slot?** · **no: `/new` always shows the
  FILE's entries** (SPEC-v3 R23.5, R16) · three sentences of v2 already said so (R16 `:213-214`, R31
  `:269`, step 8 `:413`) and only R23's blanket clause disagreed. The clause was mine and it was
  wrong: written to carry R31's absent slot, it attached to a list of five surfaces and emptied the
  Free card on exactly the machine R32 describes. v3 replaces the one clause with five numbered
  surfaces, so the subtraction can only be read where it belongs — the healthy panel · REQ-FIX-S03.
- 2026-09-13 · **B1(p2) member (ii) — does the published register set follow the file, or only the
  entries that could start?** · **the FILE (the verdict's Build A): five slots on every machine,
  keyed or not** · not contested — and the measurement that decides it is stronger than the
  verdict's own argument. `isExactProviderRuntimeRefresh`
  (`apps/runner/src/dev-api-environment.ts:310-318`) already admits a change confined to
  `PROVIDER_DISCOVERY_TARGETS_JSON` at the **same** register version. Under Build A, V placing a key
  later changes only that target's model and authorization header → a same-version runtime refresh →
  R14.2 ("a register version is not republished by restarting alone") is TRUE. Under Build B the
  configured set itself would change, so a key appearing would publish a new register version with no
  file edit at all — which makes R14.2 false and forces R24 to admit a cause whose subject is not an
  entry-set change. **Build A is the build the product's existing refresh seam already implements;
  Build B would need two requirements rewritten to accommodate it.** Rejected: Build B (fewer wasted
  slots on a keyless machine, but it moves a register publication onto an event that is not a file
  edit) · REQ-FIX-S03.
- 2026-09-13 · **The verdict's counter to Build A — unauthenticated probes to OpenAI and Z.ai every
  freshness window — is closed by a requirement, not accepted** · **R33: no request leaves the machine
  for a slot with no credential** · measured this pass: the resolver probes every configured target
  with no exemption (`apps/api/src/provider-discovery.ts:131-141`) and sets an authorization header
  only when the target has one (`:44-47`), so the counter is real and its exact shape is an
  unauthenticated `POST /chat/completions` to two third parties. R33 states the observable (zero
  outbound connections to either host on a keyless machine) and leaves the mechanism to ARCH. With it,
  Build A's only disadvantage against Build B is gone, and the tie is not merely broken — it is
  broken without a cost to carry · REQ-FIX-S03.
- 2026-09-13 · **How a configured-but-keyless slot is SHAPED** · **the product's existing
  unavailable-slot convention: the sentinel model and no authorization header** · measured, and it is
  not a choice: `apps/runner/src/dev-provider-panel.ts:103-108` throws
  `DEV_CLI_PROVIDER_PANEL_TARGET_INVALID` unless a target is either (healthy AND credentialed) or
  (sentinel-model AND uncredentialed), and `:120-122` builds `healthyProviderRefs` by excluding exactly
  the sentinel-model targets. So "configured but absent from the healthy panel" is a shape the product
  already has and already enforces. v2's R31 wording ("every other entry's slot is configured and
  served") was what made a reader infer Build B; v3 says configured, and names what is lost as the
  healthy-panel place only. The constant is spelled `DEVELOPMENT_UNAVAILABLE_CLI_MODEL`; generalising
  that name is ARCH's and is listed out of scope · REQ-FIX-S03.
- 2026-09-13 · **N1(p2) — R20 class 6 against R28's fixture count** · **class 6 is R11's FIRST FIVE
  refusals; R11's sixth gets a panel-build test, not a file fixture** · R11's sixth is a `cli:` slot
  whose OBSERVED base URL is not its loopback port, and an R3 CLI entry has exactly the keys `cli` and
  `model` — no file value can produce it. R28 now reads "six file fixtures, one per shape class, plus
  one panel-build case for R11's sixth": seven tests for six classes, and the seventh is named as not
  a file fixture. Rejected: dropping the sixth refusal from R11 — it is a live guard
  (`dev-provider-panel.ts:100`) and S03 is the slice that changes the rule around it · REQ-FIX-S03.
- 2026-09-13 · **N2(p2) — does `PLAN_TIER_ROSTERS` survive?** · **yes, as an export of
  `@debateai/contract` taking its values from `config/models.yaml` at load time; what R8 removes is the
  id literals in its source, not the export** · measured: `tiers-s02-rosters.test.ts` imports it at `:6`,
  asserts on it at `:205`/`:209`, and scans for its NAME as a selector at `:78`, so deleting the export
  would silently gut three of that suite's four cases. R27's row now states case 1's fate explicitly
  (kept, re-fixtured to the new Free pair) so the arithmetic is 4 kept + 1 new = 5/5 and not 3+1. Note
  for ARCH, already implied by R16: `apps/ui/app/new/page.tsx` stops importing it — a browser bundle
  cannot read the file — so the export's consumers after this slice are the server and the suites ·
  REQ-FIX-S03.
- 2026-09-13 · **N3(p2) — which suite carries R8's positive limb** · **exactly one:
  `tests/architecture/tiers-s02-rosters.test.ts`, as its fifth case** · v2 said "R27 names which suite"
  and then described both. R8 and R27 now name the one suite, and `tier01-roster`'s row says in as many
  words that it does NOT carry the limb, so neither seat can assume the other suite has it ·
  REQ-FIX-S03.
- 2026-09-13 · **N4(p2) — a handoff's own counts** · **every count in this pass's handoff is measured at
  write time with `wc -l` / `grep -c` and pasted, never recalled** · at pass 2 I reported SPEC-v2 as
  430 lines; `wc -l` says 454. Nothing depended on it, which is exactly why it was easy to get wrong —
  and a handoff's measurable facts are what a reviewer is asked to trust · REQ-FIX-S03.
- 2026-09-13 · **What was NOT changed at pass 3** · R1–R7, R9–R13, R15–R19, R21, R22, R25, R26, R29,
  R30, R32 · the pass-2 verdict closed B1/B2/B3 and found no defect in them; re-opening a frozen
  requirement without a finding is scope. `ui: no` stands, re-checked by the reviewer against the skill
  body · REQ-FIX-S03.

---
**Fold by the orchestrator, 2026-09-13 18:50 (REQ-REV-S03 pass 3 = PASS, the cap; verdict `reviews/REQ-REV-S03-p3.md`). SPEC-v3.md is the SPEC of record; planning closed.** B1(p2) closed on both members (Build A confirmed at the call site `dev-api-environment.ts:493` — `isExactProviderRuntimeRefresh` is the FIRST predicate of the reuse chain); R33 ruled IN (an observable: `fetchImplementation` is injected at `provider-discovery.ts:125`); N1–N3(p2) retired. Folds: **N1(p3)** the R33 test asserts per uncredentialed SLOT, never per host (ARCH packet charge 2e) · **N2(p3)** INSTRUCTIONS.md:18's S01/S02 prose stays; every S03 packet names SPEC-v3.md. The reviewer's first ARCH-REV check is carried into the ARCH packet (charge 2b): a one-line `model:` edit on a keyed slot must not become a different `provider_ref`. No V row.

---

## Ruled at ARCH (2026-09-13, seat ARCH-S03, ticket `t_6b7afd11`) — `superpowers:brainstorming` before `superpowers:writing-plans`; the rejected directions are recorded because a fleet seat has no human to say yes to

- 2026-09-13 · **Where the YAML read lives** · **a new Node-only package `@debateai/model-config`;
  never `packages/contract`** · measured in the lane at `9a000c37`:
  `apps/ui/components/LoginFlow.tsx:5` and `apps/ui/components/PublicationControl.tsx:6` are **value**
  imports of `@debateai/contract`, and `packages/contract/src/index.ts:3` is
  `export * from "./plan-tiers.js"`, so contract's index is evaluated inside the browser bundle that
  `apps/ui/next.config.mjs:15` transpiles. A `node:fs` import at the top of `plan-tiers.ts` therefore
  enters the client graph, where a node builtin does not resolve. Rejected: reading the file inside
  `packages/contract` — one fewer package, and it breaks the UI build. Rejected: putting the loader in
  `apps/runner` — the runner is the biggest consumer, but `packages/contract`'s generator and the
  suites would then depend on an app · ARCH-S03.
- 2026-09-13 · **How `PLAN_TIER_ROSTERS` keeps its name and its main-index export while losing its
  literals** · **a generated, gitignored data module at `packages/contract/generated/plan-tier-rosters.ts`,
  imported by `plan-tiers.ts`** · three measurements make this the only seam that satisfies every pin
  at once: (1) `tests/architecture/tier01-roster.test.ts:33-40` reads the value off
  `import * as contract from "@debateai/contract"` and fails with *"PLAN_TIER_ROSTERS is not exported
  from @debateai/contract"*, so a subpath-only export is refused; (2) `tier01-roster.test.ts:27` already
  filters `!file.startsWith("packages/contract/generated/")` and
  `tiers-s02-rosters.test.ts:76-81` already puts `generated` in `EXCLUDED_DIRECTORIES`, so **no oracle
  filter is edited**; (3) `packages/contract/generated/` is gitignored (`.gitignore:7`) and produced by
  `pnpm run generate:contract` (`package.json:21`), which the lane setup already runs
  (`setup-tiers-s03.log`) and which `TOOLING-TRAPS.md:294` already states as law for a fresh worktree —
  so the fresh-checkout cost is one the repository already pays. Rejected: a **committed** generated
  module — it would leave V's config edit showing as a dirty source file, which is half of what this
  slice exists to remove. Rejected: a lazy getter or a guarded dynamic `import("node:fs")` — the
  bundler still resolves the specifier, and the mechanism fails the stranger test · ARCH-S03.
- 2026-09-13 · **Which generator writes it** · **a separate entry
  `packages/model-config/src/generate-plan-tier-rosters.ts`, run BEFORE
  `packages/contract/src/generate.ts`** · `packages/contract/src/generate.ts:3` is
  `import { contractInventory } from "./index.js"`, so contract's own generator depends on contract's
  index; putting the roster write there would make index → plan-tiers → a not-yet-written generated
  module a bootstrap deadlock on a fresh checkout. Rejected: extending `generate.ts` — one fewer
  script, and it cannot run · ARCH-S03.
- 2026-09-13 · **How `/new` gets the lists at runtime (C15, R16)** · **one more register row,
  `planTierRosters`, read out of the deployment payload the page already has access to** · measured:
  `GET /v1/deployment` exists (`apps/api/src/index.ts:867`), the contract client already exposes it
  (`packages/contract/src/client.ts:506`), and `/new`'s own defaults module already reads register rows
  by key (`apps/ui/app/new/defaults.tsx:27`, `riskTier`). No new route, no new client method, and
  `DeploymentSchema` is unchanged. It also puts the tier lists inside the sealed deployment record,
  which is where this repository keeps the rest of its configuration. Rejected: a new
  `GET /v1/plan-tiers` route — a smaller blast radius on the register suites, and it leaves the
  deployment record silent about which models each tier claims. Rejected: a generated module the UI
  imports — that is the compiled-in roster R16 exists to remove · ARCH-S03.
- 2026-09-13 · **The entry→slot derivation, and the ARCH-REV check the pass-3 verdict named** ·
  **the `provider_ref` is a function of `(tier, maker word)` and never of the `model` id; the ten
  slots the file's grammar can express live in a static catalogue in
  `apps/runner/src/dev-provider-panel.ts`** · this is what makes R14.2 true for the *rename* case the
  verdict asked about (`reviews/REQ-REV-S03-p3.md` §8): a one-line `model:` edit on a keyed slot yields
  the same ref, the same `configuredProviderSet` row
  (`apps/runner/src/dev-deployment-register.ts:318-322` puts only `providerRef` + `maker` +
  `adapterKind` in it), and therefore no new register version. A static catalogue also keeps the ref
  literals in the panel source, which is the oracle
  `tests/architecture/dev-real-provider-only.test.ts:218-222` uses. **The five live refs keep their
  exact spelling** — `apps/runner/src/dev-api-environment.ts:354-357` names a rename as the thing the
  drift guard refuses, and R24's subject is two refs removed and two added, not five renamed.
  Rejected: deriving the ref string and allocating ports by index — fewer literals, and a file edit
  would move a running relay's port and strip the panel source of the refs its own suite greps for ·
  ARCH-S03.
- 2026-09-13 · **Slot order** · **every `cli:` entry first (premium's, then free's), then every `api:`
  entry** · `apps/runner/src/main.ts:65-71` copies slot 0's `authorizationHeader` into api.env's
  primary triple, so keeping slot 0 a loopback relay keeps V's paid key out of it (R14.3, N4). The
  residue — a file with **no** `cli:` entry at all — is legal under R2–R6, is not one of R20's six
  classes, and goes to V as the row below rather than being closed by a seventh class this seat may
  not add · ARCH-S03.
- 2026-09-13 · **R33's mechanism** · **skip the probe when `target.authorizationHeader === undefined`,
  and record an ABSENT observation with `failureCode: "PROVIDER_PROBE_SKIPPED_UNCREDENTIALED"`** ·
  `authorizationHeader` is the discriminator rather than the sentinel model because `apps/api` must not
  import `DEVELOPMENT_UNAVAILABLE_CLI_MODEL` from `apps/runner`, and because
  `apps/runner/src/dev-provider-panel.ts:103-108` already forces the two to coincide. No migration is
  needed: `migrations/0022_dr181_discovery.sql:7` constrains `failure_code` only to non-empty, and
  `:10` requires ABSENT ⟹ non-null, which the new code satisfies (measured this pass). Recording rather
  than staying silent keeps the probe store honest about why a slot is absent, at the same write volume
  as today's failed local probe. Rejected: skipping silently — the slot would read as never probed ·
  ARCH-S03.
- 2026-09-13 · **R13's probe change** · **`max_tokens: 64` for every target, plus a frozen per-maker
  body extension `{ "Z.AI": { thinking: { type: "disabled" } } }`** · F14 measured that exact pair
  returning `"OK"` on every try; `max_tokens: 8` failed in either mode. **`max_tokens: 64` alone is
  UNVERIFIED** — it was never measured, and no seat may call a provider to settle it. The extension is
  keyed by maker rather than carried in the file because R4 fixes an API entry's key set at exactly
  four keys. Sending `thinking` to OpenAI would be answered 400 and would turn every Luna probe ABSENT,
  so R13's closing sentence *"Whatever is chosen applies to `gpt-5.6-luna` too"* is read as "one probe
  budget for both", not "one body for both" — recorded as finding F-ARCH-3 so a reviewer checks the
  reading. Rejected: a larger budget with no extension — it rests on a measurement nobody took ·
  ARCH-S03.
- 2026-09-13 · **R25 — how a legitimate removal is told from a stale reconstruction (C14)** · **the
  caller passes `heldConfiguredProviderSets`, a bounded map of register version → the refs that
  version's `configuredProviderSet` row names; a removal is admitted only when the outgoing
  environment's version is a key of that map and its ref set equals that version's exactly** ·
  measured: the eleven cases of `tests/integration/dev-api-environment.test.ts` are filesystem fixtures
  with no pool (`:1-30`), and `publishExactFile`'s `acceptPreviousSource` is a **synchronous**
  predicate (`apps/runner/src/dev-api-environment.ts:269-270`) — so a database read inside the guard
  would make eleven green cases need a database. A map is data the publication stage already holds.
  With no map passed, the predicate is byte-for-byte today's additive-only rule, which is why the pin
  `rejects v4 reconstruction and removed-provider fallback` (`:352-360`) **keeps its case and its
  assertion text**. Rejected: an async predicate plus a pool — truer to "ask the register", and it
  rewrites a suite that has nothing to do with this slice. Rejected: extending the custody receipt —
  its key set is asserted byte-exact at `apps/runner/src/dev-deployment-register.ts:122` and `:193`,
  so adding a field breaks the receipt contract · ARCH-S03.
- 2026-09-13 · **ADR-0024's open invitation is NOT taken** · **`PLAN_TIERS` stays in
  `@debateai/contract`; `@debateai/model-config` declares its two tier words as a literal union and a
  test cross-checks them** · ADR-0024's rejected-alternatives table says minting `PLAN_TIERS` in
  `@debateai/kernel` is "the right long-term home … Revisit when the roster declaration is next
  touched", and this slice touches it. It is still not taken: `SPEC-v3.md:459-468` does not put it in
  scope, the cross-check test buys the same guarantee for one `it`, and moving a vocabulary a frozen
  SPEC declares is a supersession with no finding behind it. Recorded so the next seat does not
  re-derive the question · ARCH-S03.
- 2026-09-13 · **One new ADR, numbered at write time** ·
  **`ADR-<next free>-tier-fleet-configuration-file.md`** · the decision that outlives the mission is
  *a deployment's model fleet is declared in one committed file, read by exactly one Node-only module,
  and reaches a browser only as a register row* — plus the rule that a `provider_ref` is a function of
  `(tier, maker word)` and never of a model id. Measured this pass, the highest existing is
  **ADR-0024**, so the next free is **0025** — **re-measure with `ls docs/architecture/01-decisions/`
  at write time and never pre-assign it**, because another mission may take it first. The ADR is
  written by the cluster that lands the loader (`S03-C1`), not by this seat · ARCH-S03.
- 2026-09-13 · **What this plan does NOT change** · `evaluateAskAdmission`
  (`apps/api/src/index.ts:1196-1259`) gets **no product edit** — it already filters in list order,
  names every missing id before `assertMakerAdmission`, sizes the panel from the filtered list and
  persists exactly those members; it reads `PLAN_TIER_ROSTERS`, which becomes file-fed, so the new
  lists arrive with no code change (R15). `DEVELOPMENT_UNAVAILABLE_CLI_MODEL` keeps its spelling
  (`SPEC-v3.md:466-468`). The support seam's files are edited by no step (R26) · ARCH-S03.

### Rows for V (numbered by the orchestrator at transcription — never by a seat)

V-ROW: NEW · S03 · slice ticket `t_f14b0ca0` · **A models file with no `cli:` entry puts V's API key
into the runner's primary provider triple.** `config/models.yaml` may legally declare both tiers
entirely with `api:` entries — R2–R6 admit it, and none of R20's six shape classes refuses it. The
runner copies **slot 0's** `baseUrl`/`model`/`authorizationHeader` into `api.env`'s
`VLLM_BASE_URL`/`VLLM_MODEL`/`VLLM_AUTHORIZATION`, throwing
`RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` otherwise (`apps/runner/src/main.ts:65-71`; the drift
check re-measured this pass at `:207-213`). The plan's order rule (PLAN §1 S20) puts every `cli:`
entry ahead of every `api:` entry, so slot 0 is a loopback relay **whenever the file has at least one
`cli:` entry** — which R7's merge content does. With none, V's paid bearer lands in that triple.
Recommended default: **ship S03 without a check for it.** The merged file has three `cli:` entries and
the order rule keeps slot 0 local; closing the hole means a seventh shape class, which moves R20's
class list and R28's fixture count — both frozen, and neither is a seat's to move.
Smallest yes/no for V: "If you ever write a models file with no CLI entry at all, your API key ends up
in the runner's primary provider slot. Ship S03 without a check for that, and add it later if you ever
write such a file?"
VERDICT ship without the check / CONFIDENCE medium / STRONGEST COUNTER: this slice exists so V can edit
the file freely, and "freely" is exactly when the un-refused case gets written; a seventh class costs
one fixture and one `it`, and a SPEC being read by ARCH-REV this week is the cheapest moment it will
ever have to move.

*(The same text is carried in `PLAN.md` §6 so a reader of the plan alone sees the open question; this
block is the one the orchestrator transcribes.)*

---
**Fold by the orchestrator, 2026-09-13 16:42 (stamp CORRECTED 16:50 from an estimated "20:35" — the freeze commit `cd04f1e9` is 16:42 +0300; ARCH-REV-S03 pass 1 = REWORK; verdict `reviews/ARCH-REV-S03-p1.md`).** B1 `t_492abb53` (S21's threading of `configuredProviders` unnamed at four of five call sites; S28's second input likewise), B2 `t_32e0064f` (three cluster surfaces omit files their steps edit — `page.tsx` in C4, four `apps/runner/src/*-cli.ts` broken by S21's signature, the ADR in C1), B3 `t_3642e0f1` (S19's "no new register version" is false once S23's `planTierRosters` row is in the snapshot; the ruling at :328-332 above is SUPERSEDED — a `model:` edit keeps the ref and the configured set and DOES publish a new version, which acceptance step 6 needs; R14.2 forbids republication only for a key appearing) → ARCH-FIX(S03) `t_f14aab0f` (PLAN Revision 2, same session). N folds, closed on the board and carried into the ARCH-FIX packet: **N1** seven "(re-)measured at" citations that were not measured (three out of range) — re-grep in the LANE or drop the annotation · **N2** three JSON examples unlabelled (S17's ABSENT record is CONTAINS) · **N3** S19's `DEV_PROVIDER_SLOT_UNRESOLVED` unreachable past S4's class 2 — S18's RED case hand-builds a `ModelConfig` · **N4** C3's surface says seven suites, the command names eight · **N5** S14's self-contradicting edit instruction · **N6** S12's comment text has no case. **P1** (orchestrator): the R25 pin is at `tests/integration/dev-api-environment.test.ts:348` in the LANE (main-tree :352 is four lines off after 4df0b2b5) — the same class as REQ-S03 F2; every S03 packet cites lane lines. Refuted and sound (verdict §6, not re-argued at pass 2): S28 is NOT a false-green (the first predicate compares REGISTER_VERSION); the maker-keyed probe extension; R33 per slot; both base-URL gates; no key-leak path; "nothing rewritten" structural from the stage list; the boundary; the ADR; C3 cannot be split (S21 and S26 straddle both halves); V-39's default safe. No V row.

---

## Ruled at ARCH-FIX (2026-09-13, seat ARCH-FIX-S03, ticket `t_f14aab0f`, pass 2 of 3) — under the REWORK verdict `reviews/ARCH-REV-S03-p1.md`. PLAN.md is revised in place as Revision 2; nothing above this line is edited.

- 2026-09-13 · **SUPERSEDES the ruling at `:328-332` above** (*"…and therefore no new register
  version"*) · **a one-line `model:` edit keeps the `provider_ref` and keeps the
  `configuredProviderSet` row byte-identical, and it DOES publish a new register version** · the
  superseded clause was true only before S23. Measured in the lane at `9a000c37`: the version is a
  function of the rows — `apps/runner/src/dev-deployment-register.ts:635`
  `computeRegisterSnapshotSha256(rows)` feeds `:639`
  `developmentProviderSetPublicationId(input.baseRegisterVersion, snapshotSha256)` — and S23's
  `planTierRosters` row carries the file's model ids, so a `model:` edit moves the row, the digest and
  the version. **Acceptance step 6 requires exactly that**: `/new` shows the edited id after a restart,
  which it can only do if the row carrying the ids moved. What R14.2 forbids stays true and is narrower:
  **a key appearing publishes no version**, because a key changes neither `configuredProviderSet` nor
  `planTierRosters` (the latter is built from the FILE, never from the panel's targets, so a sentinel
  model never reaches it) and is confined to `PROVIDER_DISCOVERY_TARGETS_JSON` — the same-version
  runtime-refresh path. Pinned by S19 case (2) (the `configuredProviderSet` row byte-identical across a
  `model:` edit **and** the `planTierRosters` row not) and by S29 (the key-arrival deep-equal).
  The earlier ruling's OTHER two clauses — the ref is a function of `(tier, maker word)`, and the static
  catalogue — are unchanged and still binding · ARCH-FIX-S03, under B3 `t_3642e0f1`.
- 2026-09-13 · **How a new input reaches a module-scope function** · **it is threaded as an explicit
  parameter and the plan writes the resulting signature line, site by site** · B1 was right and the
  measurement is unambiguous: `isExactProviderRuntimeRefresh` (`dev-api-environment.ts:310`),
  `isExactPublishedRegisterRefresh` (`:336`) and `isExactLegacyEnvironmentWithoutSupportModelTarget`
  (`:387`) are module-scope functions taking two strings — `input` exists only inside
  `assembleDevelopmentApiEnvironment` (`:409`), whose closure at `:493` calls them — and
  `createRunnerEnvironment` (`dev-runner-process.ts:55`) takes `(commandEnvironment, apiEnvironment)`
  with no `repositoryRoot`. Only `dev-api-process.ts:159` `validateExactEnvironment` already has one.
  Rejected: capturing the value in a module-level mutable set at stage 0 — no signature changes, and it
  makes a pure predicate depend on load order, so a test importing the module alone reads an empty set.
  Rejected: turning the predicates into closures built inside `assembleDevelopmentApiEnvironment` —
  fewer parameters, and it moves four tested functions out of module scope where the suite reaches
  them. **The rule this leaves behind: a plan that adds an input to a function names the signature, not
  the source** · ARCH-FIX-S03, under B1 `t_492abb53`.
- 2026-09-13 · **Cluster surfaces are DERIVED from the steps, never written by hand** ·
  **`scratchpad/seats/ARCH-S03/surfaces.mjs` parses §1, takes only paths following a `Create:`/`Modify:`
  marker, maps step → cluster, and prints the column plus a disjointness check; its output IS §2's
  column** · B2 was three omissions, and the hand-written column is why: disjointness is what the table
  invites you to check, and an omission does not show up in that check. Running the derivation found
  **four** omissions, one of them created by B1's own fix — S21 re-signs functions in
  `dev-api-process.ts` and `dev-runner-process.ts` and its pass-1 `Files` line named neither. Result at
  Revision 2: 17 / 5 / 23 / 5 paths, `none — every file sits in exactly one cluster` · ARCH-FIX-S03,
  under B2 `t_32e0064f`.
- 2026-09-13 · **The pinned deterministic v4 snapshot moves with the new register row** · **recompute
  `DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256` (`tests/support/registerFixtures.ts:22`) and sweep its
  four assertions across three suites** · found at this pass (F-ARCH-4), reached by neither pass-1 me
  nor the verdict. Adding `planTierRosters` changes the publication digest; leaving the constant takes
  `tests/architecture/register-support-publication.test.ts` from 12/14 to **11/14**, against SPEC-v3
  R27's *delta zero* for that suite. It is not a SPEC contradiction and not a V row: that constant's own
  comment records S02 moving it on 2026-09-12 for the identical reason, so moving it is the documented
  practice. `LEGACY_REGISTER_V1_SNAPSHOT_SHA256` and the 14-row historical count do not move; a change
  to either is a defect of S23. Rejected: keeping the tier lists out of the register and adding a
  `GET /v1/plan-tiers` route to dodge the digest — it re-opens a question settled at pass 1 on other
  grounds, and it would leave the deployment record silent about which models each tier claims ·
  ARCH-FIX-S03.
- 2026-09-13 · **The citation class behind N1** · **a `path:line` is quoted only from the SOURCE FILE,
  never from a measurement log** · all seven N1 misses share one mechanism: my `sed -n 'X,Yp'` runners
  print the excerpt WITHOUT line numbers, so when I annotated *"(re-)measured at `:NN`"* I read the
  number off the log's own line position. Three of the seven pointed past the end of the file
  (`main.ts:207-213` in a 150-line file; `hermes-relay.ts:248-258` in 168; `dev-real-provider-only.test.ts:218-222`
  in 54) — which is the tell, and which nothing in my own process checked. **The rule: every measurement
  runner prints `grep -n` or `sed -n` output that carries the line number, and a citation with no
  numbered line in a log is not a measurement.** Applied at Revision 2 to all seven, plus the R25 pin at
  `tests/integration/dev-api-environment.test.ts:348` (the LANE's line; SPEC-v3 R25 and the ARCH packet
  both say `:352`, the main tree's number, four lines off after `4df0b2b5` — orchestrator finding P1) ·
  ARCH-FIX-S03, under N1 `t_9c8bed6b`.

---
**Fold by the orchestrator, 2026-09-13 17:24 (ARCH-REV-S03 pass 2 = REWORK, scoped; verdict `reviews/ARCH-REV-S03-p2.md`).** B1–B3 of pass 1 verified closed (§3–§5), all six N folds retired (§8), F-ARCH-4 `t_4fdd4c5a` verified — closed by S23 as written, three forced edits (`registerFixtures.ts:23`, `architecture/register-support-publication.test.ts:357`, `:368` 32→33), NO V row. **B1-p2 `t_21cf2dc8`** (blocking, C3-scoped): `tests/architecture/dev-deployment-register.test.ts` is written by S10 (C1) and broken by S21 (C3) at its `:14` source-text assertion, and owned by no cluster because `surfaces.mjs`'s marker-walk stops at S10's parenthetical (PLAN :222) — the mechanical guarantee is void for exactly the file that needs it, and a fold cannot fix it because :854 makes the script authoritative → ARCH-FIX(S03) pass 3 `t_06759d41` (the last; a REWORK at ARCH-REV p3 `t_3fe3198c` is a V row). N folds, closed on the board and carried into the ARCH-FIX p3 packet: **N1-p2** `t_75d81376` S21's done-criterion calls a module-private predicate (exports are :29/:73/:409) — name ONE build (drive it through `assembleDevelopmentApiEnvironment`) · **N2-p2** `t_c1f10e3c` nothing measures the three CLIs pass their new argument — the updated `:14` assertion is that case · **N3-p2** `t_b59af9e4` C3's row names the base failures, not the expected AFTER set · **N4-p2** `t_112df324` two harmless command-vs-surface gaps; C3 prose "eight" vs nine in the command, seven in the surface · **N5-p2** `t_7e3dcc6b` PACKET DEFECT against the orchestrator: charge 5 compared BASELINE's typecheck-diagnostic count (15) with a test count — the class: a number quoted without the heading it sits under · **N6-p2** `t_4d657ee9` (orchestrator, unread by the reviewer — its handoff read comments through 2): `pnpm-lock.yaml` is tracked and in no surface while S1/S2 add `yaml` and a workspace package — C1's column, single writer C1. **Orchestrator ruling (scheduling, not product): BUILD(S03-C1) `t_77c0cb5f` ∥ BUILD(S03-C2) `t_6a2ba493` start on PLAN Revision 2 in parallel with ARCH-FIX pass 3**, on the reviewer's charge-8 answer ("neither cluster touches the defect"); the fix keeps §1 :98-362 line-count-stable so the C1/C2 packets' anchors hold, and the BUILD seats are launched after the fix's READY with the anchors re-measured. C3 waits for ARCH-REV p3 PASS; C4 behind it. No V row.

---

## Ruled at ARCH-FIX (2026-09-13, seat ARCH-FIX-S03, ticket `t_06759d41`, pass 3 of 3 — THE LAST) — under the REWORK verdict `reviews/ARCH-REV-S03-p2.md`. PLAN.md becomes Revision 3 in place; nothing above this line is edited.

- 2026-09-13 · **Who owns `tests/architecture/dev-deployment-register.test.ts`** · **C3, and only C3** ·
  B1-p2 is correct and reproduces: `:14` is
  `expect(cli).toContain("loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment())")`
  (measured in the lane at `9a000c37`), and S21 gives `dev-deployment-register-cli.ts:13` a second
  argument, so that exact substring stops occurring and the assertion fails. C3 owns it because **S21 is
  the breaking change and C3 runs after C1**. What S10 (C1) does instead: **its ordering case moves into
  `tests/architecture/tier01-roster.test.ts`**, which C1 already owns through S9 — same cluster, same
  command, no new file. Rejected: C1 writes it and C3 re-writes it — two clusters, one file, which is the
  single-writer rule broken in the name of keeping a line. Rejected: C1 keeps it and S21 stops touching
  the CLI — that abandons B2.2 · ARCH-FIX-S03, under B1-p2 `t_21cf2dc8`.
- 2026-09-13 · **A derivation may not report "none" over a set it never proved complete** ·
  **`surfaces.mjs` gains the completeness assertion from the reviewer's `p2-dropped-paths.mjs`: every
  path-shaped token in a `Files —` paragraph is CAPTURED or explicitly CLASSIFIED a citation in a
  reviewed, step-keyed table, the script prints its denominator, and it exits non-zero otherwise** ·
  Revision 2's disjointness verdict was computed over a set that silently omitted a declared write, so
  the mechanical guarantee was void for exactly the file that needed it. Denominator at Revision 3:
  **123 seen = 78 captured + 45 classified, 0 unclassified**, then `PASS`. Rejected: fixing only the C3
  column — `PLAN.md` makes the script authoritative, so the next run would drop the file again and the
  fix would silently revert (the reviewer's own first pass-3 prediction). **The classification is
  step-keyed, not global**, so a path that is a citation in one step and a write in another cannot be
  waved through · ARCH-FIX-S03, under B1-p2.
- 2026-09-13 · **The completeness checker was validated on known-GOOD input before its verdict was
  quoted** · **the path predicate accepts only repo-rooted paths and the four repo-root files, never
  package specifiers, model ids, URLs, regexes or property accessors** · the first predicate (anything
  with a dot or slash) flagged **80** tokens, of which ~70 were phantoms — `yaml@2.9.0`, `gpt-5.6-luna`,
  `rosters!.free`, `/^[A-Z][A-Z0-9_]*$/u`. A checker that cries wolf 70 times trains its reader to skip
  it, which is how the original defect survived. `TOOLING-TRAPS.md:214` names this exact discipline and I
  re-derived it rather than read it. After tightening: 10 candidates, each judged against the sentence it
  sits in, **all 10 genuine citations and zero new declared writes** — reported rather than suppressed,
  because the reviewer predicted the assertion would surface more writes and it did not · ARCH-FIX-S03.
- 2026-09-13 · **How the module-private predicate is measured** · **driven through
  `assembleDevelopmentApiEnvironment` (`:409`), never by exporting it** · measured:
  `apps/runner/src/dev-api-environment.ts` exports exactly `:29` `DEVELOPMENT_API_ENVIRONMENT_KEYS`,
  `:73` the receipt type and `:409` the assembler, so all four predicates are module-private and no test
  can import one. The case writes an outgoing `api.env` naming the five current refs, calls the assembler
  with a `configuredProviders` that does not contain them, and asserts the OUTCOME —
  `DEV_API_ENVIRONMENT_DRIFT` thrown and the file byte-identical. Rejected: exporting the predicate —
  it widens a module's public surface this plan does not authorise, to make one assertion convenient.
  **And the honest limit is written into §7**: this case catches a predicate that IGNORES its parameter,
  not one that keeps a module-level set as a DEFAULT; the default is caught by the source-text case over
  the four CLI call sites and by S25's module-load ban · ARCH-FIX-S03, under N1-p2 `t_75d81376`.
- 2026-09-13 · **What measures that the CLIs pass their new argument** · **the updated `:14` for
  `dev-deployment-register-cli.ts`, plus ONE new case over all four CLIs in
  `tests/architecture/dev-real-provider-only.test.ts` (C3's, S34's)** · measured: no source-text case
  asserts the other three CLIs' CALL text today — `tests/unit/dev-auth-data-plane.test.ts:157-160`,
  `tests/architecture/dev-auth-data-plane.test.ts:9,23` and
  `tests/integration/dev-api-environment.test.ts:429,440` read those files but assert only the
  `package.json` script string (`.toBe("tsx apps/runner/src/…-cli.ts")`), which S21 does not change, and
  `dev-provider-set-publish-cli.ts` has no source-text case at all. The new case lives in a file C3
  already owns, so no cluster gains a path. Rejected: adding cases to each CLI's own suite — three files
  enter C3's surface, one of them (`dev-auth-data-plane.test.ts`) in neither cluster's command ·
  ARCH-FIX-S03, under N2-p2 `t_c1f10e3c`.
- 2026-09-13 · **`pnpm-lock.yaml` is a declared write of S1; `pnpm-workspace.yaml` is not** · measured:
  `git ls-files pnpm-lock.yaml` returns it (tracked), and `pnpm-workspace.yaml:2-3` already globs
  `apps/*` and `packages/*`, so S1's new package needs no workspace edit. `pnpm install` rewrites the
  lockfile when the package and its `yaml` dependency appear, so the write is S1's and the single writer
  is C1 — the only cluster that adds a dependency or a package. S1's Done-when now says `pnpm install`
  leaves `git status --porcelain` listing exactly C1's column · ARCH-FIX-S03, under N6-p2 `t_4d657ee9`
  (the orchestrator's; the reviewer did not read it).
- 2026-09-13 · **An aggregate `N failed` is not a verdict unless its members are named** ·
  **C3's §2 row names the expected AFTER set BY TITLE** — exactly `2 failed`, the two
  `register-support-publication` titles, with `dev-provider-panel`'s title GONE · base and after are both
  `3 failed`-shaped if S32 is done and S23's digest sweep is not, or vice versa, so the count alone
  cannot tell a finished cluster from a half-finished one. A seat reading `3 failed` after C3 is RED
  whichever title remains · ARCH-FIX-S03, under N3-p2 `t_b59af9e4`.

---
**Fold by the orchestrator, 2026-09-13 17:50 (ARCH-FIX-S03 pass 3 = READY, consumed; the pass-3 rulings are `## Ruled at ARCH-FIX … pass 3` :504-570 above).** B1-p2 `t_21cf2dc8` ADDRESSED with all four remedies; **single writer for `tests/architecture/dev-deployment-register.test.ts` = C3** — S10's ordering case moves to `tier01-roster.test.ts` (C1-owned via S9), C1's command DROPS the suite (base `Test Files 2 passed (2)` · `Tests 5 passed (5)`), `pnpm-lock.yaml` is a declared write of S1 (N6-p2), counts 18 / 5 / 24 / 5; `surfaces.mjs` carries the completeness assertion and prints its denominator (123 = 78 + 45 + 0). N1-p2…N4-p2, N6-p2 retired (the seat's lines). **Two findings against the orchestrator's packet, accepted:** (1) "a Revision 3 line under the title" conflicts with "S1 unchanged" — the seat held the header height by compressing the Revision 2 block; a frozen-anchor packet freezes the header or anchors by content (TRAPS entry); (2) "S18 moved by the lines you added" presupposed contiguity — S18 stayed at :363. **Scheduling:** BUILD(S03-C1) `t_77c0cb5f` and BUILD(S03-C2) `t_6a2ba493` launch on PLAN Revision 3 (the C1 packet re-issued: six suites, 18 paths, `tier01-roster` 1/1 → 2/2) in parallel with ARCH-REV p3 `t_3fe3198c` (the cap; a REWORK is a V row; the reviewer runs no cluster command in the lane while the seats build). C3 waits on ARCH-REV p3 PASS and C1's READY; C4 behind C3. No V row.
