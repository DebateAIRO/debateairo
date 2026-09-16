# S03 — V's test point (TEST(S03) = ticket `t_f14b0ca0`, READY on the board 2026-09-16 19:0x EEST)

The slice ticket closes only on V's veto. Everything below is the state at the FINAL S03 head **5fc5336a** (544cbf5c + RULING 7 after V's first finding + RULING 8 after V's second) (`integration/all` in `.worktrees/all/dialectical-engine`; slice head 57c3a782 on `slice/tiers-s03`; slice base 9a000c37). Nothing is pushed; the main checkout is still at 446c685e until V runs `ff-main.sh`.

## 1. What is served, and how to restart it

- **The stack:** https://localhost:3000 (front door) → UI :3001 → API :8790 → runner; CLI relays 8793 (grok-premium), 8794 (support GLM), 8795 (codex-premium), 8796 (claude-premium) — `PANEL_READY healthy=3` with `development:grok-cli` since the RULING 8 re-serve at 21:49. Served from the merged tree at 5fc5336a by `bash .hermes/reports/debate-tiers/logs/serve-merged.sh` (idempotent; stop with `serve-merged-stop.sh`). Sign in, click **Use a recovery code** before pasting, then open `/new`.
- **Register on the dev database:** v10 — 33 rows: the five-slot `configuredProviderSet` and the `planTierRosters` row {free: `gpt-5.6-luna`, `glm-5.3-flash`; premium: `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6-build`}, published by the product's own `pnpm dev:auth:up` from the merged tree (attempts 4 and 6 in `review-packages/S03-p3r/live/`).
- **The restart after an edit of `config/models.yaml` is TWO commands until V rules V-51** (row V-53): from `.worktrees/all/dialectical-engine`, `pnpm dev:auth:up` — it validates the file (a broken file is refused by name: `DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=… model=… class N`), regenerates the compiled rosters, seeds, publishes the new register version, rewrites api.env, starts the API, **then exits 1 at the runner stage** (`DEV_AUTH_STACK_RUNNER_FAILED:DEV_RUNNER_PROCESS_READINESS_INVALID`, the pre-existing gate) and stops its stages — then `bash .hermes/reports/debate-tiers/logs/serve-merged.sh` brings the stack up on the new version.
- **Keys:** `.local/dev-auth/provider-keys.env` does not exist → both Free slots are configured but absent from the healthy panel (`DEV_PROVIDER_SLOT_UNAVAILABLE class (a)` — R31a); the stack starts anyway (R32). Steps 3, 4 and 10b wait on V's keys (row V-34: `OPENAI_API_KEY=`, `ZAI_API_KEY=`, mode 600).
- **V's OWN custody** (when the main checkout is fast-forwarded and served from there): its api.env predates S03 — move it aside ONCE before the first S03 restart (`mv .local/dev-auth/api.env .local/dev-auth/api.env.stale-2026-09-16`); the acceptance addendum in `DECISIONS.md`. The copy under `.worktrees/all` was post-S03 and needed nothing.

## 2. The acceptance steps (SPEC-v3 §2, lines 383–458) — V runs them in the browser

| Step | What | Needs a key? | Status before V |
|---|---|---|---|
| 1 | `config/models.yaml` reads as two tiers, five entries, two `api:` entries, no key in the file | no | file committed (`config/models.yaml`) |
| 2 | `/new`: Free lists exactly `gpt-5.6-luna` + `glm-5.3-flash`; Premium exactly `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6-build`; `claude-sonnet-5` nowhere; a dot and a name per id | no | V's first run showed `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: INTERNAL_ERROR` (the route reused a read the API's role may not run — fixed under RULING 7 `t_1af1f40a`); after V's reload the UI log shows the route answering 200 twice, and the same SQL under the API's role returns both lists — the banner in V's second screenshot is the pre-fix render of an older tab; a FRESH load of `/new` lists the five ids |
| 3 | Free debate runs on both models | **V-34** | UNVERIFIED (no keys) |
| 4 | `discovered_panel` for that run names the two | **V-34** | UNVERIFIED |
| 5 | Premium debate runs on the three CLI models | no | V's second run: refused `ASK_PLAN_TIER_MODEL_UNAVAILABLE … needs grok-4.6-build` — the panel's grok slot fails on every S03 start because the relay asks grok 1.0.30 for `--model grok-4.6-build`, an id the CLI reports but cannot be asked for (its list: `grok-4.6`, `grok-4.5`); FIXED under RULING 8 `t_120e8940` (row V-55; lane 57c3a782, merged 5fc5336a): the relay no longer passes `--model` to grok and refuses a reported-lineage mismatch by name; re-served 21:49 with `PANEL_READY healthy=3`. **MET on V's own run 22:31:** run `7afc29f0` (21:51→22:31, 40 min) — `discovered_panel` = `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6-build`; 57 raw artifacts across the three makers; answer `COMPOSED` / `SUPPORTED`. The page is `/debate/7afc29f0-3c88-488f-a3f4-1271b8b96235` (no debates list exists; the library on `/` does not carry it). Pre-existing, not S03: the engine's 60 s task cancellation warning (`t_4271aa04`) |
| 6 | edit one line, restart, `/new` shows it; nothing under `apps/ui/` rebuilt | no | the two-command restart (V-53); V-49 measured: the card and the run read the same file |
| 7 | a broken edit is refused by name (tier, model id, class); api.env sha unchanged; register version unchanged; the stack keeps serving | no | RULING 5: the curated line is back (all four faults swept) — V confirms live |
| 8 | with no keys the restart completes, warns per Free entry, `/new` still lists both, a Free debate is refused with `ASK_PLAN_TIER_MODEL_UNAVAILABLE` naming both ids | no | the warning reads `class (a)` rather than the words "missing key" (N3, residue) |
| 9 | remove the grok entry, restart, Premium lists two, the register version moved (R24) | no | the version moves on every entry-set change (measured: v9 → v10) |
| 10a / 10b | add grok under `free:`, restart, Free lists three / that debate runs on all three | no / **V-34** | 10a runnable; 10b UNVERIFIED |
| 11 | the support widget still answers (port 8794) | no | the relay is up; its handshake flaked twice today at start (residue `t_7fac45e5`) |

## 3. Rows for V (`V-DECISIONS-PACKET.md`; the defaults bind until ruled)

V-34 (keys) · V-41 · V-42 · V-48 = NO (residue) · **V-50** (RULING 4 = the same FIX node — default taken) · **V-51** (the runner readiness gate: one line, V's call) · **V-52** (RULING 5 inside S03 — default taken, landed f43b3f8b) · **V-53** (V-51 sequencing: the two-command procedure by default) · **V-54** (V's first test finding — the roster route's privilege gap: RULING 7 inside S03, default taken, landed 1a1c4ede) · **V-55** (V's second test finding — the grok relay asks the CLI for the file's reported id, which grok 1.0.30 cannot select: RULING 8 inside S03 on `t_120e8940`, default taken; the alternative is a SPEC change to how the file spells a grok model).

## 4. Residue (ticketed; shown, not hidden)

Pass 1 — 17 tickets · pass 2 — 10 (`reviews/REV-S03-p2-UNION.md`) · pass 3 — `t_f0767487` `t_ff8a497d` `t_d2f82945` `t_6f44048e` `t_1f84c179` `t_39fcc4d4` (`reviews/REV-S03-p3-UNION.md`) · the re-check (`reviews/REV-S03-p3r-UNION.md`) — correctness N12 `t_6c5ed985`, N13 `t_8f9c2e92`, N14 `t_90c036f2`, N15 `t_06e3b004`; product-truth N2 `t_8d8a1151`, N3 `t_8106e863`, N4 `t_d99b6ae0`, N5 `t_415cee4b` · today's — `t_14d21a1a` (pre-S03: the seed replayed v4 with the live panel's set), `t_657958bd` (the CLI drops non-DEV codes), `t_7fac45e5` (no retry on the support-relay handshake), `t_b1926a72` (V's first finding, fixed) → `t_7830f09e`, `t_829994c9` (V's second finding — the grok relay's `--model`, fixed under RULING 8) (the operator route `/v1/deployment` broken live since 08-25 — the accounts mission's).

## 5. The evidence trail

`reviews/REV-S03-p3r-UNION.md` (the last verdicts) · `review-packages/S03-p3r/` (README, live attempts 1–6, the four register diagnostics, the gate frames `reverify-b97985a8.txt` / `reverify-544cbf5c.txt`, my RULING 5/6 re-verification) · `.hermes/reports/debate-tiers/LEDGER.md` (every exit) · the graph PNGs sent with the gate message.
