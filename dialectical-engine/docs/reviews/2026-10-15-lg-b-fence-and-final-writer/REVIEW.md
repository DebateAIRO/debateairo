# LG-B security review: one fence per call, and the final-writer tier

Task 9 of R1b (LG-B). Owner answer 3: "The same prompt fence/canary is kept for the 2 tries of one call; every new call gets a fresh one. A security review checks it during the build (LG-B)." The owner explicitly requires and approves this report file.

- Diff reviewed: `git diff origin/dev...HEAD -- dialectical-engine/` (origin/dev = `dafbfd517`, HEAD = `5f32ea487`, 14 commits from Task 1 to Task 8 plus their fix rounds, 60 files).
- Line numbers are in the HEAD tree, under `dialectical-engine/`.
- Read-only review. No code was edited, no test suite was run, nothing was committed.
- Three read-only helpers each read one part of the diff: the gate's Python, test weakening, and fence reuse across calls. I checked each finding below against the code myself before writing it down.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 8 (2 of them are the accepted residual) |
| Info | 11 |

There is nothing to fix now (Step 2 disposition: Critical, High and Medium findings are fixed now; there are none).

Within one call, the fence and the canary are the first POST's on every try. Every new call that a step builds mints its own fence and canary.

Three paths still send one finished packet to more than one maker or member:
- **Accepted residual:** the two cost fallbacks (F1, F2).
- **Not on the accepted list:** the writer's and checker's switch to their backup member (F3). It needs a ruling.

In none of the three does one AI's reply text reach another AI's packet, so there is no way to exploit them. The cost is only that a canary echo cannot be pinned to one maker.

The final-writer tier is bounded by its per-call cap, its slots and the day's pot. The gate refuses the tier where the GO names no slots.

## Findings

| ID | Severity | File:line | What could happen | Recommended fix |
|---|---|---|---|---|
| F1 | Low (**accepted residual**, ruling PF-B3.13) | `apps/runner/src/index.ts:3112` (`callServeRoleWithFallback`; planned call at `:3093`; moves on at `:3117`) | The answer writer's, checker's, storyteller's and story checker's cost fallback re-sends the SAME packet (same fence and canary) to a cheaper maker (story: `storyCostFallback` `:3183`, `packages/story/src/writer.ts:570-573`). The planned maker may already have sent it: the money check runs before each TRY, not once per call (`packages/providers/src/index.ts:2113`), so try 1 can be sent and billed and try 2 refused for money; a maker that sits out after the vendor's unbilled "busy" refusal had also sent it. No reply text crosses. In plain words: if the canary ever shows up echoed, we cannot tell which maker saw it first. | No fix in LG-B. **Owner question:** keep it, or a later runner + providers change that builds the request per maker (a builder in place of a finished request) so each maker gets its own fence and canary? |
| F2 | Low (**accepted residual**, ruling PF-B3.13) | `apps/runner/src/index.ts:3310` (`callBodyRoleWithFallback`; moves on at `:3321` money, `:3322-3324` transport death, `:3326` content refusal) | The judge legs and reviews (`bodyCallMayMove` `:3214`) re-send the same packet to every cheaper maker in turn, also after a maker that really sent it and was refused for its content or lost its transport. No reply text crosses. The comment at `:3191-3193` ("every refused try is free") is true only for the refused try, not for the call. | As F1 (the same owner question). Correct the comment when this code is next touched. |
| F3 | Low (**new**, not on the accepted list) | `apps/runner/src/index.ts:9760-9762` and `:9838` (writer), `:9940-9941` and `:9981` (checker); `apps/runner/src/run-seats.ts:893`, `:910` | The writer and checker build the round's packet once. `seatCaller.callSeat` sends it to the seat's main member and then, after a transport failure that used up its retries or a usage cap (`run-seats.ts:559-574`), to the runner-up member, with the same fence and canary. The main member had already sent it. This can stack with F1 (main, then runner-up, then cheaper makers). The judge legs, reviews and panel seats do not have this problem: each member's `judge/review/assess` builds its own frame. No reply text crosses. | No fix in LG-B: the fix is outside LG-B's files and the risk is the same as F1's. Controller: carry it next to F1 as the same owner question; the same fix covers it (build the writer's and checker's frame inside the per-member closure, together with the checker's repair builder that captures `framed`). |
| F4 | Low | `packages/providers/ops/preview_budget_helper.py:1190` | Anthropic M3 booking: a 200 whose `usage` is a list, string or number is booked at its reservation without the premium checks (speed, tier, region, server tools, cache write) or the count check. A reply with `usage: [{"speed":"fast",…}]` is booked; the helper confirmed this by calling `bookable_unreported` directly. The test `usage_a_list` locks it in. In practice the request cannot ask for fast speed or tools, and the hold bounds the bill. | Book case (a) only when `usage` is absent or null, and halt on any other non-object `usage`. Or run the premium scan over the whole reply. |
| F5 | Low | `packages/providers/ops/preview_budget_helper.py:1191-1194` | The Anthropic 5xx scan does not look for `server_tool_use`, `cache_creation`, `container` or `context_management` at the top level. A 503 carrying `{"server_tool_use":{…},"cache_creation":7}` is booked at its reservation (confirmed). | Add those names, and `ANTHROPIC_UNPRICED_REPLY_KEYS` (`:747`), to the 5xx refusal list. |
| F6 | Low | `packages/providers/ops/preview_budget_helper.py:378`, `:681-690` | DeepInfra cost evidence is read only under `estimated_cost`/`cost`, and counts only under `*_tokens`/`tokens_*`. `usage: {"total_cost": 5, "input": 1000000000}` is booked (confirmed), while `{"total_cost": "5.00"}` halts. | Do not book when `usage` holds any member outside DeepInfra's known set, as Anthropic's R3 rule already does. |
| F7 | Low | `packages/providers/ops/preview_budget_authority.py:233` (`MAX_IPC_BYTES = 3 * 1024 * 1024`, checked at `:2087`); `deploy/preview-gate/v3/systemd/*.service` | The gate's message limit rose from 1 MiB to 3 MiB for every message, not only final writers. 32 connections × 3 MiB plus parse copies is a few hundred MB of short-lived memory, and the gate's units set no `MemoryMax=`. Only peer UIDs on the allow-list can send (`:2127-2133`). | Add `MemoryMax=` to both gate units, or accept the risk explicitly in the README. |
| F8 | Low | `packages/providers/src/index.ts:1908-1917` (`packetByteCap`/`outputTokenCap`/`lengthRetry` checks), `packages/providers/src/preview-test.ts:566-572` | The gateway trusts these request fields. Only the preview policy refuses them from a caller. Off the preview (hosted, local) a future caller that set `outputTokenCap` would replace the target's `maxOutputTokens` clamp with no upper limit. `packetByteCap` is capped at 1 MiB (`:1411`). No caller sets them today. | Add a source pin (architecture test) that only `preview-test.ts` sets these three fields, or have the gateway refuse them unless an option turns them on. |
| F9 | Info | `packages/providers/src/preview-test.ts:845-855`, `packages/providers/src/preview-models.ts:467-470` | The guarded fetch now admits any body up to 1 MiB and labels it FINAL_WRITER by size alone (deviation 2, ruling 5). Other steps stay within 256 KiB only because of the gateway's default cap (`index.ts:1916`, `:2137-2143`) and the policy's refusal of caps a caller sets. | Accepted by ruling 5. Optionally pin that the API's own guarded-fetch callers (support chat, the question-language check, probes) build bodies under 256 KiB. |
| F10 | Info | `packages/providers/ops/preview_budget_authority.py:449-458`, `:1064` | The gate accepts an explicit `callTier: "STANDARD"`, which is a little wider than deviation 2's "five keys, byte for byte". It is handled exactly as if the key were absent, so it has no money effect. The app never sends it. | Refuse any `callTier` but `FINAL_WRITER`, or record this as accepted. |
| F11 | Info | `packages/providers/src/index.ts:1966`, `:2550` | A lowered length retry (L25) changes effort but stays marked, so it pays the +25% cache write on its material with no read (Task 7's known minor cost leak; deviation 5 accepts it). Fractions of a cent. | None (accepted). |
| F12 | Info | `packages/providers/src/index.ts:2617-2630`, `:1946` | The gateway checks that a full re-ask packet is framed (`assertFramedPrompt(repair)`), but not that its fence equals the first POST's. "Same fence on the re-ask" holds by each step's builder passing its own `framed` (deviation 11), and Task 8's tests pin it, including a negative control. This predates the branch. | Optional hardening: at `:2629`, refuse a repair packet whose `readPromptFrame(repair).fence !== frame.fence`. |
| F13 | Info | `packages/providers/src/prompt-frame.ts:893-900`; `packages/providers/src/prompt-tripwire.ts:133` | The door refuses the declared fence inside the model's own answer turn, but not the canary. That is by design: the canary echo is the tripwire's signal (`PROMPT_CANARY_ECHOED`). An echo does not change how the door reads the next POST, because the door reads the fence and canary only from the system message's last lines (see check 1). | None. |
| F14 | Info | `packages/providers/ops/preview_budget_authority.py:2093` | A 200 booked as unreported throws its answer away, so the app retries and pays again. Each try is bounded by the pot. This costs money and time, not safety. | Watch the `charge_unreported` alert count in the practice. |
| F15 | Info | `deploy/preview-gate/v3/README.md`, `README-anthropic.md` | The READMEs do not yet mention `max_final_writer_calls` or the larger minimum pot it needs. For example, four DeepInfra rows with 10 calls at once and 1 final-writer slot need $1.79, not the README's $1.43 (pinned in the v3 Python `FinalWriterTierTests`). | Task 11 (READMEs) should state it. |
| F16 | Info | `tests/support/preview-gate-stubs.ts:462-466` | The test gate stub's `/remaining` never offers final-writer slots, so the integration suites never run the final-writer path. Unit tests cover it. | Optional: one integration case with a stub that offers the tier. |
| F17 | Info | `tests/unit/preview_budget_authority_anthropic_test.py:1539` | `assertGreaterEqual((len(sent), len(refused)), (3, 20))` compares the pairs left to right, so the refused count barely counts. This predates the branch; Task 7 moved one refused case (25 to 24). | Assert the two counts separately. |
| F18 | Info | `apps/runner/src/index.ts:3191-3193`; `apps/api/src/support/answer.ts:335-337` | Two comments are out of date: "every refused try is free" (see F2), and "the queue may run the operation again" (it runs it once, `queue.ts:181-205`). | Correct when touched. |
| F19 | Info | `packages/providers/src/index.ts:1497-1511`, `packages/db/src/schema.ts:335-337` | On an encrypted run, `actual_words` stores a word count: numbers only. It reveals the reply's length, which the existing output-token count already reveals. | None. |

### security-review skill

The `security-review` skill was run. Its preloaded diff used the wrong base (the repository's default branch, over the whole repository, more than 64 MB). I re-scoped its step 1 to the LG-B diff above, with the skill's full brief, categories and exclusions.

| ID | Severity | File:line | What could happen | Recommended fix |
|---|---|---|---|---|
| — | — | — | **No vulnerabilities found** at the skill's bar (>80% confidence of exploitability). | — |

The skill considered and rejected eleven candidates, which overlap with F7 to F10 above:
- the app declaring FINAL_WRITER (allow-listed peers, by design);
- the 3 MiB IPC limit (resource use, excluded by the skill);
- M3 booking (a budget control, not a security boundary);
- the cache-mark shape (`JSON.stringify` blocks with exact keys);
- the new log and `on_settled` paths (codes and amounts only, the reply redacted);
- a malformed `callTier` (refused without a crash);
- slot races (theoretical);
- `/remaining` parsing;
- the word and token measures;
- `alert.mjs` (fixed wording only);
- the `packetByteCap`/`outputTokenCap` checks.

Step 2 (false-positive filtering) had nothing to filter.

## Checks

### 1. Can model text reach a later POST of the same call anywhere but its own assistant turn?

No. There are three repair forms, and in each the model's text can travel only as its own assistant turn, if at all:

1. **Patch follow-up.** `buildFramedPatchPrompt` (`prompt-frame.ts:682-713`) puts the model's reply in its own assistant turn and nowhere else. It refuses a reply that holds the call's fence (`:689-693`). The block after the reply carries only a code, machine paths, size limits, an optional plain-word reason and `PATCH`, and it is checked by `patchLocatorValid` (`:683`).
2. **Full re-ask.** `appendFramedRejection` (`:505-528`) refuses anything but a typed code, a whitelisted machine path, the value's own size limit, and a reason that must be one of LG-A's fixed sentences (`isContentFollowUpSentence`, `content-follow-up.ts:11`, `:41`). The step builders get the reply's raw text (`index.ts:2617-2625`). They pass it through `schemaFailureLocator` (`prompt-frame.ts` "DL4-F4 / L4-F11"), which copies nothing from it: the path segments are re-checked against `^[A-Za-z0-9_]{1,40}$`.
3. **LG-A's structure repair.** It is a NEW call with its own frame (`structure-repair.ts:532-537`). The broken reply rides there as fenced material under the new fence, as designed.

In the gateway loop, the length retry re-sends the very first packet (`index.ts:2551`). The patch is built from `request.packet` (`:2600`). Every repair packet goes through the door again (`:1880`, `:2629`).

**Can an echoed fence or canary change how the door reads the next POST?** No:
- The door (`assertFramedPrompt`, `prompt-frame.ts:800-918`) reads the fence and the canary only from the system message's last lines, by position and label (`:810-837`).
- It requires the first fence prefix and the first canary prefix in the system message to sit exactly there (`:866-874`).
- A model turn is never the system message.
- An answer turn holding the declared fence is refused (`:897-900`).
- Material holding the declared fence is refused (`readMaterialBlock`, `:747-752`).
- A canary echo stays in the model's own turn and is the tripwire's signal (F13).

### 2. Does every NEW call mint a new fence and canary?

**Within one call, yes, by design.** The patch, the full re-ask, the length retry and the preview's unbilled resend reuse the first packet (pinned by `tests/unit/lg-b-fence-per-call.test.ts:61-107`).

**Across calls**, I traced each path:
- **The runner's final retry after a cooldown.** `withCooldownRetry` (`apps/runner/src/index.ts:1252`) calls `attempt()` again at `:1324`. Every caller's closure builds a new frame:
  - `:1878` goes to `judge.review` (`packages/judgement/src/index.ts:758`);
  - `:7170`, `:7403` go to `judge.judge` (`:669` → `:469`);
  - `:7689` goes to `judge.review`.
  - Root 0's loop over makers calls `openFirstPosition` again each time (`:7198-7205`).
- **The next round** builds a new frame every time:
  - writer `buildSynthesisRolePrompt` (`:9760`) and checker (`:9940`), once per round;
  - storyteller and story checker (`packages/story/src/writer.ts:272`, called per round at `:589`, `:625`);
  - map (`packages/map/src/specs.ts:172` from `apps/runner/src/map-stage.ts:93`);
  - evaluator (`packages/evaluator/src/index.ts:534`, `:1556`, `consumer.ts:231`).
  - No built frame is cached anywhere.
- **LG-A's structure-repair call** mints its own (`structure-repair.ts:532`). It takes from the original only the answer form, which sits before the per-call markers (`framedAnswerForm`, `prompt-frame.ts:785-792`).
- **The API's own calls** each build a fresh frame per call: publication check `check.ts:109`, question-language `fast-check.ts:52`, support `prompt.ts:152-178`.

The paths that reuse one `FramedPrompt` across calls:
- the serve and story cost fallback (F1, `index.ts:3112`);
- the body cost fallback (F2, `:3310`);
- the writer's and checker's backup-member switch (F3, `:9838`, `:9981` with `run-seats.ts:893`, `:910`).

F3 is the one not named in the plan.

### 3. The Anthropic cache mark (Task 7)

**Can a cached prefix serve one call's material to another call, run or account?** No. Anthropic's prefix cache matches exact bytes and is kept apart per organisation/workspace. The cached prefix up to the material mark holds the system message, which ENDS with the call's own fence and canary (`prompt-frame.ts:474`), and then the material, which opens with the fence line. Another call, run or account cannot send those bytes without that call's fence and canary. A cache hit also returns only usage numbers, never content.

**Is anything in the blocks not in today's text?** No:
- `markFirstUserTurn` (`anthropic-messages.ts:158-164`) splits only turn 0: part 0 carries the mark, and every later part gets the blank line `"\n\n"` the join puts there.
- The texts joined give today's turn byte for byte (`lg-b-anthropic-material-cache.test.ts:33`).
- Every other turn is today's string (`:206`).

**Every POST of one call has the same body form.** `markMaterial` is decided once, before the first byte (`index.ts:1966`), and passed to the door's pre-check (`:1997`), every attempt's body (`:2084`) and the patch packet (`:1880` via `:2600`). `callAttempts()` (`:1933-1938`) can only grow, and only after a patch was the second POST, so a call decided as one POST stays unmarked. The preview's unbilled resend re-runs `gateway.call` with the same request, so it reaches the same decision.

**Marked bodies are reserved at the write price.**
- The gate allows the mark only on block 0 of message 0, with at most 4 blocks of exact shape (`preview_budget_helper.py:950-969`).
- Any marked body sets `cache_write_requested` (`:971-978`), and its whole input is reserved at the 5-minute write price, 1.25× input (`:909-923`).
- Unmarked bodies are reserved at today's prices.
- The app's mirror refuses the fixture's 10 `material_refused` bodies before any reservation (`lg-b-anthropic-material-cache.test.ts:62`; the gate side at `preview_budget_authority_anthropic_test.py:1659-1675`).

### 4. The final-writer tier

The app declares the tier and the gate cannot see the step (ruling 5). The worst a buggy or hostile app process on an allow-listed UID can do with it:
- **Per call:** at most $0.75 (DeepInfra) or $1.00 (Anthropic) held, and refused above that (`validate_request`, `preview_budget_authority.py:1108-1109`). Each row's full-size worst case must fit that cap at review (`:548-557`): MiMo $0.509, Haiku $0.977. Profile ceilings are unchanged (`MAX_PROFILE_CALL_CAP_USD` $1.00, `MAX_PROFILE_REQUEST_BYTES` 1 MiB, `:560-568`).
- **Reservation:** at the tier's own output bound (`tier_row` `:483-492`, `body_valid` caps `max_tokens` there), so a reply cannot overrun the hold. Anything above still halts as `charge_overrun` (`:1659`).
- **Slots:** at most `max_final_writer_calls` (1 to C) final writers at once. A final writer takes its final-writer slot first, then a general slot. It gives the first back if the general slot is not granted (`:1486-1498`), and both are released once in the outer `finally` (`:1627-1630`). Standard calls never wait on final-writer slots, so nothing can deadlock. A hostile app can starve only its own calls, which it could already do with standard calls.
- **Day's pot:** `day_spend + reserved > daily_budget_usd` is checked under the lock (`:1180`). One GO is at most $12.00 and the team at most $16.00 (M1, `:293-294`, `:638`). Activation requires (C−F) × the standard worst case + F × the final-writer worst case to fit the pot (`:605-614`, `:1007`).
- **IPC:** 3 MiB per message (`:233`) over the allow-listed socket with the existing 32 connections. That is memory use, not money (F7).

**Refusal where the GO names no slots:**
- `callTier: "FINAL_WRITER"` is refused with `PREVIEW_CALL_TIER_INVALID` when the GO has no `max_final_writer_calls`, and always on a probe (`:1070-1072`). This happens before any reservation.
- Any other extra key is refused with `REQUEST_SCOPE_INVALID` (`:1063-1065`).
- Without the member, activation is C × standard as before (`:610-611`), and `/remaining` and the ledger are today's (`:663-668`, `:1721-1725`, `:1198`).
- On the app side, the tier is asked for only when `/remaining` names `finalWriterMaxInFlight` (`preview-test.ts:597-602`). Otherwise the call is STANDARD, with the content-free notice `PREVIEW_FINAL_WRITER_TIER_UNREAD` (gate name and reason code only, `:292-295`).
- Small wideners: F9, F10.

### 5. The new columns and ledger fields

All are numbers or codes:
- **App side:** `cached_input_tokens` and `actual_words` (`packages/db/src/schema.ts:335-337`) are bounded whole numbers or null (`usageCounterIn`, `index.ts:1458-1462`; `replyWordsOf`, `:1497-1511`, which also nulls a throwing or non-integer counter). `answerTokens` and `cachedInputTokens` on the result are the same.
- **Gate side:**
  - `call_tier` is `FINAL_WRITER` only (`:1198`);
  - the reason is `charge_unreported`, and `http_status` is a whole number;
  - the accounting objects hold counts, Decimal strings and fixed text;
  - Anthropic's `reply_outline` holds only `[a-z0-9_]` names and kinds (`preview_budget_helper.py:795-824`);
  - `reply_model` is null or the row's model.
- `alert.mjs` changed only fixed wording.

No reply text is stored or logged, on an encrypted run or any other. The word count reveals length only (F19).

### 6. Anything else that weakens a safeguard

None beyond the findings above:
- **Protected files untouched.** No changed file is the prompt frame, `register.bootstrap.json`, a migration or `packages/db/src/index.ts`. No line touches `buildFramedPrompt`, `buildFramedRepairPrompt` or `buildFramedPatchPrompt`.
- **No test file deleted or skipped.**
- **Python pins match the tests added:** v3 net +12 (141 → 153), Anthropic net +10 (63 → 73), v2 net 0.
- **The one refused fixture case that moved** ("list content in a message", 25 → 24 refused) is Task 7's planned move and reappears as `material_sent[0]`. Ten new refused material cases are run by both the app and the gate.
- **Deviation 6** (`reasoning_tokens: 7`) moved exactly as planned (`model-scorecard-gateway-thinking.test.ts:330-334`).
- **The halt tests removed** are exactly the cases owner answer M3 moved to "booked". Each has a booking test, plus tests that every other case still halts (v3 `UnreportedChargeBookedTests`; the Anthropic speed, tier, region, server-tool, cache-write, unknown-member, tool-block, other-model and 5xx-with-billing cases).
- **One cost check reversed on purpose:** `lg-a-estimate-repair.test.ts:63-71`. The estimate adds both shares (`apps/api/src/preview-budget-estimate.ts:784-797`).
- **The guard tests are tighter, not looser:** `prompt-surface-guard.test.ts:602-605` and `preview-practice-wiring-drift.test.ts:167-169` only add assertions.
- **The gate stub** accepts nothing the real gate refuses (F16 is a coverage note).
- **The M3 booking rule has three Low gaps:** F4, F5, F6.

### 7. Known going in

- **The cost fallback re-sends the same packet: confirmed** (F1 `index.ts:3112`; F2 `:3310`, also after a content refusal at `:3326`). It is pinned by `lg-b-fence-per-call.test.ts:166`.
  - The risk in plain words: if a canary echo turns up after such a fallback, we cannot tell which maker saw the canary first, because more than one did.
  - No reply text crosses between makers, and the fence is a delimiter, not a secret.
  - This is wider than first thought: the planned maker may already have sent the packet (per-try money check, `packages/providers/src/index.ts:2113`).
  - The seat backup switch does the same and is not on the accepted list (F3).
  - **Owner question:** keep it, or a later runner + providers change that mints a frame per maker (and per backup member)?
- **The structure-repair call mints its own frame: confirmed** (`structure-repair.ts:532`, pinned by `lg-b-fence-per-call.test.ts:137`). A fence inside `broken_reply` is the old call's, never the repair packet's: the new fence is fresh random bytes, and the door refuses only its own declared fence inside material (`prompt-frame.ts:747-752`).
- **The replay gateway sends nothing on a hit: confirmed.**
  - `apps/runner/src/run-replay.ts:187-195` matches on `canonicalPromptFingerprint(request.packet.messages)`.
  - On a hit nothing is sent; the recorded reply is rebuilt (`:196-216`).
  - On a miss (`:195`), or when the reply cannot be rebuilt (`:201`), `inner.call(request)` sends the request's own freshly built packet.
  - The fingerprint masks the fence (`#|DEBATEAI-FENCE-<32 hex>|#`) and the canary (`DBAI-CANARY-<24 hex>`), each found first in the system message and then replaced in every message (`packages/scorecard/src/moment.ts:128-158`). This is safe because owner text cannot contain either prefix (`prompt-frame.ts:405-411`).
- **A final writer's structure repair stays STANDARD and fails closed: confirmed.**
  - The route uses the policy-wrapped target gateways (`apps/runner/src/main.ts:411-431`). `previewCallTierOf` gives STANDARD for `REPAIR:STRUCTURE:…` (`preview-test.ts:301-309`), and the policy refuses caps a caller sets (`:569-572`).
  - So the repair call has the 256 KiB cap (`index.ts:1916`) and Haiku's 32,768-token bound, and it is one POST (`structure-repair.ts:552`).
  - An oversized repair packet is refused with `PROVIDER_PACKET_TOO_LARGE` before the fetch (`index.ts:2137-2143`). A cut-off copy ends the one POST.
  - Either way the error is neither a money stop nor a lane stop, so `repairStructure` throws the original call's content refusal (`structure-repair.ts:571-584`, `throw unaccepted()` at `:584`; a build failure at `:539`). It never ends as an overrun.
- **The material mark only where a read can follow: confirmed.**
  - `markMaterial` requires the call option, `callAttempts() >= 2` and the same effort for repairs (`index.ts:1966`), so a one-POST call (including the structure repair) and a `slip_fix` call at another effort send unmarked bodies (`lg-b-anthropic-material-cache.test.ts:139`, positive twin `:151`).
  - A lowered length retry is still marked (F11, accepted).
  - The gate reserves any marked body at the write price (check 3), so there is no overrun.

## Controller disposition (2026-10-16)

- **No Critical, High or Medium finding**, so nothing is fixed inside Task 9 (the brief: Low and Info are recorded).
- **F1, F2 (accepted residual, controller ruling PF-B3.13) and F3 (the same kind, ruled now):** when the runner moves an
  answer, check or story call to a cheaper maker, or the answer writer or checker to its backup seat member, it re-sends
  the planned call's packet, so the same fence and canary reach a second maker. No reply text crosses; the injection
  surface is unchanged. Accepted for LG-B. **Owner question:** keep it, or a later runner + providers change that mints a
  fresh frame per maker and per seat member (a canary echo in that rare fallback cannot be pinned to one maker today).
- **F4, F5, F6 (money, Low):** carried into the branch's final fix wave with the Task 4b review's deferred minors (an
  Anthropic `usage` that is a list, string or number; the Anthropic 5xx key scan; DeepInfra cost and count keys).
- **F11, F17, F18:** carried into the final fix wave (one-term mark fix; a test comparison; two stale comments).
- **F7-F10, F12-F16, F19:** recorded. F15 (READMEs) is Task 11's work; F16 (the stub gate never offers final-writer
  slots) is covered by the Task 13 practice proof on the real gates.
