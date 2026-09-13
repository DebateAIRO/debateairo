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
  and V's subscription is what it calls** · F13, measured 16:05: on the subscription endpoint a
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
