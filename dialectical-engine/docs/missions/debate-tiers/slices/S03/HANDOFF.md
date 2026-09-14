# S03 handoff ledger — written 2026-09-14 08:52 EEST by the orchestrator (Claude-Router), for whoever picks this up

**The goal (V, 2026-09-13):** "For the free tier, switch Sonnet 5 with GLM 5.3 Flash. Switch to API_KEYS. but only for the free tier. Luna 5.6 and GLM 5.3 Flash with API_KEYS is enough for us, for now." Update: "Switch the 5.3 to GLM 4.7 … we got a subscription" — measured: the subscription answers `glm-4.7` AS `glm-5.3-flash` (row V-37), so the file names `glm-5.3-flash`; `glm-4.7-flash` is free and answers as itself since 21:55 (row V-42, V's call).

## Where things are, in one screen

| What | Where | State |
|---|---|---|
| The slice branch | `slice/tiers-s03` in the lane `.worktrees/tiers-s03/dialectical-engine` | head **`cd043907`** (FIX-F1 consumed 09:0x — REV pass 2 is being assembled) = base `9a000c37` + C2 `a9179644` + C1 `62a4c367` + C3 `43efdb1a` + C4 `cc014550` + FIX-F2 `b678f336` + FIX-F1 `cd043907` |
| The served stack (V's, :3000) | the MAIN checkout `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, branch `integration/debate-tiers` @ `1ef198fd`+ | **still Free = Luna + Sonnet** (the pre-S03 compiled roster, `packages/contract/src/plan-tiers.ts:9`); S03 is NOT merged; nothing pushed |
| The models file S03 introduces | `config/models.yaml` on the lane | Free: `gpt-5.6-luna` (api: openai, key `OPENAI_API_KEY`) + `glm-5.3-flash` (api: zai, `https://api.z.ai/api/coding/paas/v4`, key `ZAI_API_KEY`); Premium: codex `gpt-5.6-sol`, claude `claude-opus-5`, grok `grok-4.6-build` |
| Keys | `.local/dev-auth/provider-keys.env` (never printed) | Z.ai token exists (Hermes store); **OpenAI key still missing (V-34)** → acceptance steps 3/4/10b wait |
| Board | `~/.local/bin/hermes kanban --board debate-tiers` | slice ticket `t_f14b0ca0` (V's); every node ticket done; open: the 17 pass-1 N findings (open, none blocking) |
| Records | `slices/S03/{SPEC-v3,PLAN,DECISIONS,PROGRESS}.md`, `reviews/REV-S03-p1-*.md` + `-UNION.md`, `.hermes/reports/debate-tiers/LEDGER.md` (the full timeline), `V-DECISIONS-PACKET.md` rows V-34…V-44 | all committed on `integration/debate-tiers` in the main checkout (docs only), never pushed |

## What the four clusters built (all green, gate passed at cc014550)
- **C1** — `@debateai/model-config` (the file loader, six shape classes with their own codes), `config/models.yaml`, the generated `PLAN_TIER_ROSTERS` (`pnpm run generate:contract`), ADR-0025. 24/24.
- **C2** — remote discovery admission: https-only base URLs, the widened probe body (`max_tokens: 64`, `thinking: disabled`), an uncredentialed target is recorded, never called. 26/26.
- **C3** — the runner: slot catalogue, entry → slot, the panel builder takes the configured set, the relay starts follow `cli:` entries, the `planTierRosters` register row, the restart check refuses a bad file BEFORE any stage (R19–R22), availability classes start the stack with the slot absent + a warning (V-38), key custody (mode 0600, no symlink, read once), removals against the outgoing version. 88 passed + 2 inherited failures (pre-existing, 2026-09-12).
- **C4** — `/new` reads the lists from the deployment; admission fixtures on the file's ids. 73/73.
- **Whole-slice gate** (PLAN §5, 17 files ×3): `1 failed | 16 passed (17)` · `2 failed | 179 passed (181)` — the only failures are the two inherited `register-support-publication` titles. Embedded-postgres snapshot suites 57/57. Typecheck rc=1 with 67 diagnostics, all in files BASELINE.md pins (other missions').

## The review and the fix round
- **REV(S03) pass 1** = REWORK (`reviews/REV-S03-p1-UNION.md`): correctness-tests B1 — R18 unmet (the Claude relay was still asked for `opus`, Grok for nothing; casts hid it); product-truth B1 — `/new`'s tier cards EMPTY for every browser session (the read hit the operator-only `/v1/deployment`, silently); security-data-safety PASS (N1–N7).
- **FIX-F2** `b678f336` DONE: `GET /v1/plan-tiers` (`auth: user`) from the register row; `readPlanTiers()`; the page names a refusal. C4 78/78 ×3, route pins 41/41 ×3, §5 186 with only the two inherited titles.
- **FIX-F1** `cd043907` DONE (READY 08:56, consumed; relay+panel 49/49 ×3, my re-run 49/49): a `model` member on both relay option types, the Claude adapter's full-id path, `--model` on the Grok argv (`grok --help` documents `-m, --model`), the casts deleted, the C3 case re-titled. Ran under row **V-43's default** (surface widened to `acceptance/claude-relay.ts` + `grok-relay.ts`) — V has not said yes or no; "no, defer" means dropping this commit before MERGE.

## What is next, in order
1. Consume FIX-F1's READY: skills gate on its rollout, commit files vs the 6 allowed paths, my re-runs (relay+panel set — START 44/44; C3 nine-suite; §5 once). Scripts in the orchestrator's scratchpad (`verify-*.sh`, `gate-s03.sh`).
2. **REV(S03) pass 2**, scoped: `zsh gate-s03.sh` at `cd043907` → `zsh assemble-s03-p2.sh cd043907` → README from `README-S03-p2.template.md` → `zsh mk-rev-worktrees-p2.sh cd043907` → three tickets → `python3 gen-rev-s03-p2.py cd043907 <freeze a..b> 1 <t_corr> <t_prod> <t_sec>` → packet-check ×3 → freeze → DISPATCHED + claim → three claude-opus-5 Agent seats (blind). PASS needs all three.
3. **MERGE**: the lane into `integration/debate-tiers` in the main checkout (docs commits there are mine; product files are clean — the other session's `acceptance/**` edits are committed). Then V restarts the stack (`pnpm dev:auth:up` — the S03 restart command checks the file first) — **never restart V's stack without V's word**.
4. **TEST(S03)** = V's acceptance steps (`SPEC-v3.md:383-458`): 1, 2, 5, 6, 7, 8, 9, 10a, 11 runnable on merge day; 3, 4, 10b need the OpenAI key (V-34). Step 4's read-back command is in the C3 seat's self-report. Steps 6/10a: put the file back afterwards (product-truth N2).
5. V pushes. Never the harness.

## Rows V still owes (defaults bind meanwhile)
- **V-34** OpenAI key → `.local/dev-auth/provider-keys.env`.
- **V-42** Free GLM: keep `glm-5.3-flash` (default) or `glm-4.7-flash` (free, reachable; one file edit + restart).
- **V-43** the relay surface: "widen: yes" (taken by default, F1 built) or "no, defer".
- **V-44** `/new`'s cards: fixed inside S03 (default, F2 built).
- **V-41** S28's held-version map has no producer: with no map, a removal (acceptance step 9) refuses fail-closed — a follow-up producer, or accept the refusal for now.
- **V-40** superseded by V-43.

## Laws learned this slice (already in TOOLING-TRAPS / the templates)
Measure a dependent cluster's base AFTER its predecessors land; a seat-exit Monitor must not anchor on `^READY —` (an hour lost); a done-criterion that needs a later cluster is a PLAN defect (S13); run-suites takes exact paths; every stamp is a `date` output; the capture runner `scripts/run-capture.sh` is the only runner.
