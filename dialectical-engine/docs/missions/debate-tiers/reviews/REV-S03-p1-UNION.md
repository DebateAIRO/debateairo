# REV(S03) pass 1 — UNION of the three lenses (orchestrator, 2026-09-13 22:07 EEST)

Slice `S03` (`config/models.yaml` — Free = `gpt-5.6-luna` + `glm-5.3-flash` over API keys; both tiers' models declared in one file), lane `slice/tiers-s03` @ **cc014550**, package `review-packages/S03-p1/`, three blind claude-opus-5 lenses in their own worktrees.

## Verdict: **REWORK** (pass 1 of 3) — PASS needs every lens; two lenses returned REWORK with one blocking finding each

| Lens | Ticket | Verdict | Blocking | Non-blocking | Artifact |
|---|---|---|---|---|---|
| correctness-tests | `t_2fe87227` | **REWORK** | B1 — R18 unmet for `cli: claude` / `cli: grok` | N1–N6 | `reviews/REV-S03-p1-correctness-tests.md` |
| product-truth | `t_31d988e8` | **REWORK** | B1 — `/new`'s tier cards empty for every session | N1–N3 | `reviews/REV-S03-p1-product-truth.md` |
| security-data-safety | `t_8f344263` | **PASS** | — | N1–N7 | `reviews/REV-S03-p1-security-data-safety.md` |

All three re-measured the four cluster commands and the §5 integrated run and matched the gate (17 files ×3, only the two inherited `register-support-publication` titles). No lens disagrees with another on a finding; the two B1s are disjoint (different files), so no single-finding re-check node is needed. Every prediction about "the other lenses" was written blind; the correctness lens predicted neither other lens would find its B1, and neither did.

## The two blocking findings and the FIX nodes they cut (by finding surface — disjoint, so parallel)

**B1-correctness (`t_ad04e504`) — SPEC-v3 R18 unmet: the Claude relay is asked for `opus`, Grok for nothing.** `apps/runner/src/dev-cli-provider-panel.ts:121-129` writes `model` through `as unknown as` casts into relay option types that have no `model` member; `acceptance/claude-relay.ts:41,:142,:176` builds `--model opus`, and its alias pattern (`:60/:117`) rejects a full id; `acceptance/grok-relay.ts:96-117` has no model input and no `--model` flag; the C3 case *"passes the full Claude model id without a modelAlias key"* pins the inert shape and forbids the fix. Remedy crosses `acceptance/**` → **row V-43** (default in force: widen the surface for one FIX node). **FIX-S03-p1-F1** — surface: `acceptance/claude-relay.ts`, `acceptance/grok-relay.ts`, their tests, `apps/runner/src/dev-cli-provider-panel.ts` (the casts), `tests/unit/dev-cli-provider-panel.test.ts` (the case re-titled to assert the ARGV). **Waits on V's word** (the two relay files carry another session's uncommitted edits in the main tree — a merge hazard V must weigh). The "no" branch: re-title/delete the pinning case inside S03 and record R18 partially unmet.

**B1-product-truth (`t_fcdecc36`) — `/new`'s tier cards are empty for every browser session, silently.** `page.tsx:114-123` reads `GET /v1/deployment` (`auth: "operator"`, `apps/api/src/index.ts:139`), refused 403 for every cookie session (`:475-477`), the error swallowed; green only because the render suite mocks the read. Fails R16/R23.5; acceptance step 2 cannot pass. **Row V-44** (default in force: fix inside S03 before merge). **FIX-S03-p1-F2** — surface: a user-readable roster surface (`apps/api/src/index.ts` route + handler reading the same register row the deployment payload carries; `packages/contract/src/index.ts` route type + schema, `client.ts` method; `tests/unit/s7-authorization.test.ts` + `tests/unit/contract.test.ts` route pins; `tests/unit/api.test.ts` cases), `apps/ui/app/new/page.tsx` (read the new surface; a REJECTED read is SHOWN, never a silent blank — R31's honesty law), `tests/render/tier01-new-plan-tier.test.tsx` (the rejection RED the slice lacks + the resolved case). **Dispatched now** — it does not wait on V.

## Non-blocking findings (each a ticket; each sets WHEN, never WHETHER)
### correctness-tests
- `t_9eceb1c1` — the S28 residue names acceptance step 8; measured: step 8 (missing keys) is additive and admitted, step 9 (remove the grok entry) is the one refused with DEV_API_ENVIRONMENT_DRIFT when no held map exists (dev-api-environment.ts:38…
- `t_043884ca` — R25 'api.env follows a removal' is green only on a branch no product path executes: heldConfiguredProviderSets is populated in two fixtures only (dev-api-environment.test.ts:441,:493); nothing writes it onto the receipt (dev-auth-…
- `t_4d451841` — readProviderKeys validates the key NAME not the VALUE (dev-provider-keys.ts:66,:69): OPENAI_API_KEY="sk-…" in .env convention yields a bearer with literal quotes → probe fails → class (b) 'probe failed' instead of a format refusal…
- `t_1ff80878` — base-URL admission (shape.ts:153-171) admits a trailing '?' or '#', any host, a non-standard port, an IP literal; the error detail at :169 is narrower than the check — recorded for the security lens; a host allow-list is not a SPE…
- `t_7c7d39a2` — charge 2 states C4 'Test Files 5 passed (5)' while the package's cluster map §2 C4 row names four suites (4 passed (4) · 67 passed (67)); the ruled five-suite command lives only in a DECISIONS fold; README's 73/73 unreachable from…
- `t_36bb05e5` — probe 3 asks what the casts at dev-cli-provider-panel.ts hide, but acceptance/claude-relay.ts and grok-relay.ts are not on the reading grant; the lawful answer was UNVERIFIED and B1 would have shipped — a packet that asks what a c…
- `t_fcc38a3a` — the package's C4 number (73/73, five suites) cannot be reproduced by the package's cluster-map C4 command (four suites → 67/67); same defect as correctness N5
- `t_d219be2f` — the package's C4 command yields 67/67, its README says 73/73 (= correctness N5, product-truth N3); probes.md numbered out of order (13 before 12)
- `t_00c717d2` — the key file's format is unwritten: OPENAI_API_KEY="sk-…" keeps its quotes (dev-provider-keys.ts:69) → Bearer "sk-…" → maker rejects → class-(b) warning with a correct-looking key; :53 demands exactly 0600 (= correctness N3)…
### product-truth
- `t_13d08f99` — probes.md (orchestrator) carries a false precedent: deriveRiskTierDefault has zero call sites, so 'the page already reads the deployment for riskTier defaults' is untrue; lane-only paths; V-41 cited step 8 (corrected to 9)…
- `t_fffda6e4` — SPEC-v3 acceptance steps 6/10a tell V to edit config/models.yaml and never to restore it; three suites go RED on the edited file meanwhile — the acceptance needs a restore line (a SPEC row for REQ or the TEST packet)…
- `t_fcc38a3a` — the package's C4 number (73/73, five suites) cannot be reproduced by the package's cluster-map C4 command (four suites → 67/67); same defect as correctness N5
- `t_d219be2f` — the package's C4 command yields 67/67, its README says 73/73 (= correctness N5, product-truth N3); probes.md numbered out of order (13 before 12)
### security-data-safety
- `t_4502672b` — model-config-no-secret.test.ts:16-18 denies only 'sk-', 'Bearer' and '=' on key: lines: an xai-… token in a comment and a credential in base_url userinfo both pass (two mutants green) — the custody gate does not enforce its class…
- `t_7fc66f4b` — provider-discovery.ts:140 returns a fresh HEALTHY record before :141 checks authorizationHeader === undefined: a keyless target can be published HEALTHY with no observation recorded; reachability limited by the panel's CLI_HANDSHA…
- `t_3e493864` — MAX_PROBE_RESPONSE_BYTES (64 KiB) is compared AFTER response.text() buffers the whole body (provider-discovery.ts:71-72): 64 MiB entered the process before rejection; the time bound is PROVIDER_PROBE_TIMEOUT_MS=180000 — read with …
- `t_ff3f897d` — packages/providers/src/index.ts:120-126 admits http: for ANY host (a bearer over cleartext to http://198.51.100.9/v1) and C2 dropped the /v1 suffix rule; not reachable from config/models.yaml (the loader forces https) — pin http: …
- `t_b9eced76` — dev-provider-keys.ts:23-37 lstats only .local/dev-auth, so .local itself may be a symlink (key read from outside the repository); assembleDevelopmentApiEnvironment asserts both parents (dev-api-environment.ts:441-444) — the two re…
- `t_d219be2f` — the package's C4 command yields 67/67, its README says 73/73 (= correctness N5, product-truth N3); probes.md numbered out of order (13 before 12)
- `t_00c717d2` — the key file's format is unwritten: OPENAI_API_KEY="sk-…" keeps its quotes (dev-provider-keys.ts:69) → Bearer "sk-…" → maker rejects → class-(b) warning with a correct-looking key; :53 demands exactly 0600 (= correctness N3)…

## Packet / package defects against the orchestrator (folded, fixed for pass 2)
- The package's C4 number (73/73, five suites) was not reproducible by the package's cluster-map C4 command (four suites → 67/67): named by all three lenses. Pass 2's package prints the argv beside every number and carries the RULED commands.
- probes.md: probe 13's riskTier precedent was false (`deriveRiskTierDefault` has no caller); every probe path pointed at the S03 lane instead of `$WORKTREE`; numbered out of order. Pass 2's probes are `$WORKTREE`-relative and re-grepped claims only.
- Probe 3 asked what the panel's casts hide without granting the relay files: the lawful answer was UNVERIFIED and B1-correctness would have shipped. A packet that asks what a cast hides grants the file on the other side.

## Rows for V raised by this pass
- **V-43** (widen the surface to the two relay files for FIX-F1 — yes/no) · **V-44** (fix `/new`'s blank cards inside S03 — default yes). Corrected by measurement: V-41 (step 9, not 8; R25 green only on a fixture-fed branch).

## What pass 2 reviews
The FIX handoffs, the diff since cc014550, the orchestrator's re-verification, and the pass-1 promoted probes (`.hermes/reports/debate-tiers/probes/REV-S03-p1-*`) re-run at the new head; scoped to the two B1s and the N findings the FIX nodes chose to take. The security lens's PASS carries unless a FIX touches its surface (F2 adds a route — it does; the security lens re-checks the new route's policy only).
