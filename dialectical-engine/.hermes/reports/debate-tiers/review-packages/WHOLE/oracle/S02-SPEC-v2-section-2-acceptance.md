<!-- VERBATIM extract of /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S02/SPEC-v2.md lines 169-215 (S02 §2 Acceptance) — cut 2026-09-12 12:59 by the orchestrator; the SPEC of record is the highest-numbered SPEC-v<n>.md of the slice; nothing here is a judgment -->
## 2. Acceptance — V runs these, in a browser, on the real dev stack

Precondition A (steps 1–4 and 8–9 only): row V-7 — V has added discovery targets for `gpt-5.6-luna`,
`claude-sonnet-5` and `grok-4.6` in `.local/dev-auth/api.env`, and all five models probe HEALTHY. No
seat edits that file. **Until V does this, steps 1–4 and 8–9 are UNVERIFIED and steps 5–7 are the
whole acceptance** — the refusal is testable today precisely because the Free models are missing.
*Re-read against R6's pinned order at pass 2 (finding B1):* today's stack gives steps 5–7 BOTH refusal
shapes with no preparation at all — Free is the all-members-missing case (neither `gpt-5.6-luna` nor
`claude-sonnet-5` is a configured target) and Premium is the single-missing-member case (`grok-4.6`'s
bridge answers `CLI_HANDSHAKE_UNAVAILABLE`), `00-intake.md:52`. Steps 6 and 7 are therefore run once
per tier before row V-7 is answered, and they are the steps that catch a build with the roster check
in the wrong place.
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
5. Put a roster member out of reach. **Before row V-7 is answered there is nothing to do** — Free has
   both members missing and Premium has `grok-4.6` missing, as Precondition A records; go straight to
   step 6 and run steps 6–7 once for each tier. **After V has added the three targets**, this step is
   real: stop the local bridge process for one model (the cheapest way) or remove its target, then
   wait for the probe freshness window to lapse.
6. Open `/new`, choose the tier with the missing member, type a question, press `Start run`. The page
   does NOT navigate to a debate. An error appears on the form, and it names **every** missing member
   of that tier, by the same id the roster uses — today that is `gpt-5.6-luna` AND `claude-sonnet-5`
   for Free, and `grok-4.6` for Premium.
7. In devtools, the `POST /v1/asks` response is `422` and its body's `error` reads exactly
   `ASK_PLAN_TIER_MODEL_UNAVAILABLE`. **If it reads `MAKER_INVENTORY_UNSATISFIED`, this step FAILS**
   — the roster check was placed after `assertMakerAdmission` (`apps/api/src/index.ts:1216`) instead
   of before it, and R6's order was not built (finding B1). Reload the library at `/`: no new debate
   was created.
8. Restore the member, wait for a fresh probe, and repeat step 6 for that tier: the run now starts,
   and the models that argue are exactly the tier's roster.
9. For the run started in step 1 and the run started in step 3, run the read-back command of R12: the
   first returns `free`, the second returns `premium`. **Where V reads that command** (corrected at
   pass 2, finding B4): the implementing seat's READY handoff on its cluster ticket is the original;
   the orchestrator relays it into `docs/missions/debate-tiers/slices/S02/PROGRESS.md` and into the
   review package at `.hermes/reports/debate-tiers/review-packages/S02-p<r>/`. Any one of the three
   is enough to run this step; if the command is in none of them, R12 was not met and this step is
   UNVERIFIED, not passed.

