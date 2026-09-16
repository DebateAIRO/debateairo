# REV(S03) pass 2 — lens `security-data-safety` · slice `S03` reviewed at `d35a9634` · ticket `t_8a000762`

SKILLS LOADED: `superpowers:using-superpowers` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) · `heartbeat-protocol` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`) · `heartbeat-reviewer` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`) · `superpowers:verification-before-completion` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

Seat `REV-S03-p2-security-data-safety`, blind, pass 2 of 3. Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p2-security-data-safety/dialectical-engine`, detached at `d35a9634939e89cac231ce80d7ce7451362aae25`, `git status --porcelain` = 0 at claim. No git write of any kind. `.local/**` was never read and never printed; every key value below is this seat's own fake (`FAKEKEY-rev-s03-p2-security-DO-NOT-USE`). No provider call, no dev server, no live database, no port bound, no process left running, nothing opened on V's desktop. The sibling lens worktrees, the S03 lane and the main checkout were never opened.

---

## 1. The packet and package review (a defect here is a finding against the orchestrator)

Checked against their sources from this seat's cwd at `d35a9634`:

| Packet / package claim | Verdict |
|---|---|
| ticket `t_8a000762`, comment cursor 1 at dispatch | **defect, cosmetic** — three orchestrator comments existed when I claimed (DISPATCHED 11:28, FREEZE CORRECTION 11:29, FREEZE 11:29); the packet's `comment cursor at dispatch: 1` was written before the two freeze comments were appended. I read all three. |
| cwd + detached HEAD `d35a9634`, porcelain empty | correct — measured `d35a9634939e89cac231ce80d7ce7451362aae25`, 0 entries |
| pass base `cc014550`; slice base `9a000c37`; slice head `cd043907` | correct (`commits-since-p1.txt`: `b678f336` then `cd043907`) |
| FIX diff "14 files changed, 450 insertions(+), 35 deletions(-)" | correct — `diffstat-since-p1.txt`, identical to the ALL-paths form |
| merge delta "5 files changed, 156 insertions(+), 10 deletions(-)" | correct — `diffstat-merge-S03-files.txt`, and the patch contains exactly those five `diff --git` headers |
| "S03's `GET /v1/plan-tiers` row and handler are untouched" by the merge | correct — the policy row appears only as unchanged context in the merge patch, and reads identically at `apps/api/src/index.ts:149` |
| the C4 command of record is the FIVE-suite form (pass-1 N6) | **addressed** — `README.md:16` now prints the five-suite command and says every command is printed with its argv in its log. My pass-1 N6 is closed by this package. |
| `probes-p1-carried.md` names the head each probe was written against | correct |
| freeze range `d35a9634..<freeze commit>` given as prose, not a concrete pair | **defect, non-blocking (N10a)** — the packet's own instruction demands "a CONCRETE `<previous>..<latest>` pair stamped at write time" and then, in the same bullet, substitutes the words *"the freeze commit that carries this packet and the package (stamped in the DISPATCHED comment)"* for the latest SHA. The DISPATCHED comment stamps `d1de4ee3`, and two later FREEZE comments move it to `bd516cfd` and then `e56063c5`, so the range the packet literally names is ambiguous between three commits. I did not run the mission-tree diff: it is the orchestrator's own record of the pass and carries no product code, and the packet gives me no single latest SHA to run it against. Recorded UNVERIFIED in §6. |

**N10 (package defect, non-blocking).** `merge-delta-commits.txt` is headed *"Per-file authorship of the merge delta on the files S03 wrote (cd043907..d35a9634)"* and carries a section `## tests/integration/dev-api-environment.test.ts ()` listing three commits (`350609c2`, `b7ca2c41`, `4df0b2b5`). That file has **zero** delta in `cd043907..d35a9634` — it is absent from `diff-cd043907..d35a9634-S03-files.patch` (measured: 0 occurrences; the patch's five `diff --git` headers do not include it) and absent from `diffstat-merge-S03-files.txt`. The empty `()` where every other section carries `(+n/−m)` is the tell: `git log --no-merges -- <file>` was run over a file with no delta and its whole history printed anyway. The FREEZE comment at 11:29:51 claims this file is "MEASURED into the package"; the measurement is right for the five files that changed and spurious for the sixth. **Class fix:** derive the per-file section list from the same `--numstat` output the diffstat comes from, so a file with no delta cannot acquire an authorship section.

**The authors' `SKILLS LOADED` lines**, checked against the worker floor (`heartbeat-protocol` §1) in `board/FIX-S03-p1-F1.t_87ecea60.txt:24` and `board/FIX-S03-p1-F2.t_d5ccdd90.txt:25`: both name `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `verification-before-completion`, `systematic-debugging` and `receiving-code-review`. **No shortfall against the floor and no fabrication I can detect from the handoff text.** Two path hygiene notes, neither a new finding because the orchestrator already caught and folded both at CONSUMED: F2's line cites `…/.worktrees/tiers-s03/dialectical-engine/.codex/skills/heartbeat-protocol/SKILL.md`, the in-lane `.codex` mirror COMMON §1 forbids citing — it also cites the `.claude` path beside it, and the CONSUMED comment records "both heartbeat-protocol mirrors disclosed — the .claude copy is the authority"; and F2 sourced `using-superpowers` from `~/.codex/plugins/cache/openai-curated-remote/…` as well as the `~/.claude/plugins/cache/claude-plugins-official/…` path COMMON §1 names.

---

## 2. What I re-ran (verbatim, from my worktree root; every argv is in the log beside the number)

Logs: `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/REV-S03-p2-security-data-safety/{c3,int,probe-run1,probe-rowshape}.log`.

| Command | My result | Package's claim | Match |
|---|---|---|---|
| **C3, the nine-suite form** `LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts` | rc=1 · `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 89 passed (91)` · 140.81s | **the package does not re-run C3 at `d35a9634`** — `reverify-d35a9634.txt` covers the §5 run, §5-1b, the generator, the two mounts and typecheck only | new evidence, supplied here |
| **§5 integrated, 17 files** (exactly as `cluster-map-PLAN-sections-2-and-5.md:74-83` prints them) | rc=1 · `Test Files 1 failed \| 16 passed (17)` · `Tests 2 failed \| 185 passed (187)` · 136.08s | `1 failed \| 16 passed (17)` · `2 failed \| 185 passed (187)`, three identical runs | **yes, exactly** |

`Test Files` is **17**, so vitest dropped no path (the silent-drop trap).

**The two failures in both runs, named and dated:** `tests/architecture/register-support-publication.test.ts` → *"recognizes hostile static SQL concatenation, interpolation, and tagged builders"* and *"classifies every register relation access and bans open writers, latest selection, and unsafe version coercion"* — both **pre-existing at the lane base, dated 2026-09-12** (COMMON §6). The failure SET is unchanged from my pass-1 run. Test counts rose (C3 90→91, §5 181→187) with the FIX round's new cases. I make no blanket claim about any other suite: every number above is a number I ran.

---

## 3. My own probes — property · attack · outcome

Written from the CLAIM, not from the authors' tests. Temporary files in my worktree, deleted before handoff; promoted copies in `.hermes/reports/debate-tiers/probes/REV-S03-p2-security-data-safety/`. 11/11 then 4/4 pass.

### Charge 2 — `GET /v1/plan-tiers`

**P4 — the route's policy and projection.** Verbatim from the probe:

```
P4_ANON=401 {"error":"SESSION_REQUIRED"}
P4_RETIRED_HEADER=401 {"error":"SESSION_REQUIRED"}
P4_OK=200 {"free":["free-a","free-b"],"premium":["premium-a","premium-b"]}
P4_EXTRA_MEMBERS=500 {"error":"INTERNAL_ERROR","correlation_id":"08f09ae8-…"}
P4_THROWN=500 {"error":"INTERNAL_ERROR","correlation_id":"02a37ecc-…"}
P4_NO_READER=500 {"error":"INTERNAL_ERROR","correlation_id":"d9199ca9-…"}
P4_SCHEMA extra=false blank=false padded=true paddedValue=["spaced"]
```

Answering the charge point by point:
- **What the response carries beyond the two id lists: nothing.** The 200 body's key set is exactly `["free","premium"]`. No register version, no keys, no targets.
- **An unauthenticated request is 401**, and so is one presenting the retired dev header (`apps/api/src/index.ts:480-482`).
- **Nothing operator-only reaches the user projection.** I smuggled `register_version`, `authorization_header: "Bearer <fake>"` and a `provider_targets` array **beside** the two lists in the reader's return value: the route answered **500** and the body contained neither the fake key, nor the string `authorization_header`, nor `register_version`, nor `provider_targets`. The 500 envelope's key set is exactly `["correlation_id","error"]` — the merge's error-handler rewrite (`:583-585`) dropped the `message` member for every 5xx, so no free-text from the sealed read can reach a client at all. An upstream throw whose message carried a fake key and the live database port surfaced neither (`P4_THROWN`).
- **The strict schema refuses extra members**: `.strict()` on `{free, premium}` (`packages/contract/src/index.ts:308-311`) rejects both an unknown key and a blank id. It also **trims** (`z.string().trim()`), so `"  id  "` in the row is served as `"id"` — recorded as a fact, not a finding.
- **The two log sinks are allow-lists, not free text.** `apiOperationalErrorDiagnostic` (`apps/api/src/index.ts:95-111`) emits only a code matching `/^[A-Z][A-Z0-9_]{2,63}$/` — a ZodError becomes the literal `ZOD_ERROR`, never its issue JSON. The merge's new `captureHandled(error, …)` sink (`:531`) covers this route (resource `plan-tier-rosters` is not in `obsExcludedCaptureResources`), and `@debateai/obs-capture` never reads `error.message` into an envelope: a repo-wide grep of `packages/obs-capture/src/**` for `.message` returns four hits, all prefix or allow-list comparisons in `chain/verify.ts`. No new leak path from the merge.

**Probe E (pass 1), re-run at `d35a9634`:** the register rows built from a panel whose every target carries `Bearer <this seat's fake>` contain neither the fake key nor the string `Bearer`, while the same panel's `targetsJson` does (`E_PANEL_TARGETS_JSON_CARRIES_KEY=true`). The publication boundary still holds.

### Charge 2, continued — **PROBE R, the refutation that landed**

I refused to trust the F2 seat's fixture and built the row from the **producer** instead: the real `config/models.yaml` → the real `developmentPlanTierRosters()` → the real `buildDevelopmentDeploymentRegisterRows()`, then that exact value handed to the real `PostgresAskApplication.readPlanTierRosters` and to the real route. Verbatim:

```
R_PUBLISHED_ROW_VALUE={"kind":"PLAN_TIER_ROSTERS","free":["gpt-5.6-luna","glm-5.3-flash"],
                       "premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}
R_PUBLISHED_ROW_KEYS=["kind","free","premium"]
R_READER_OUTCOME=THROW [ …ZodError… ]
R_ROUTE_STATUS=500 BODY={"error":"INTERNAL_ERROR","correlation_id":"4063291f-…"}
R_READER_WITHOUT_KIND=OK {"free":["gpt-5.6-luna","glm-5.3-flash"],
                          "premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}
```

See **B1**.

### Charge 3 — the relay `model` value's path to argv

**P1 — what the file loader admits as a `cli` `model`.** The loader's only bound is `typeof value.model === "string" && value.model.length > 0` (`packages/model-config/src/shape.ts:117-118`, and `:122-123` for an `api` entry); `normalizeEntry` (`:226`) passes it through untouched. All eight hostile values below are **admitted**; only `""` is refused.

**P2 — the argv the relays actually build.** Captured from the real spawned process's `process.argv`, through the real `startGrokRelay` / `startClaudeRelay`:

| value in `config/models.yaml` | Grok argv tail | Claude |
|---|---|---|
| `grok-4.6-build` | `["--model","grok-4.6-build"]` | refused (`CLAUDE_CLI_MODEL_INVALID`) |
| `--disable-web-search` | `["--model","--disable-web-search"]` | refused |
| `--mcp-config=/tmp/rev-s03-p2-evil.json` | `["--model","--mcp-config=/tmp/rev-s03-p2-evil.json"]` | refused |
| `-c` | `["--model","-c"]` | refused |
| `grok-4.6-build --sandbox danger-full-access` | `["--model","grok-4.6-build --sandbox danger-full-access"]` | refused |
| ``grok;id`whoami`$(id)|cat`` | ``["--model","grok;id`whoami`$(id)|cat"]`` | refused |
| `grok-4.6-build\n--sandbox\ndanger-full-access` | `["--model","grok-4.6-build\n--sandbox\ndanger-full-access"]` | refused |
| `../../../../etc/passwd` | `["--model","../../../../etc/passwd"]` | refused |

All eight reach the Grok argv unrefused; all eight are refused by the Claude relay before argv with `CLAUDE_CLI_MODEL_INVALID`. See **N8**, and read its tier carefully — the honest reading of "shell metacharacter" is in there.

**P3 — the alias path is unchanged.** `P3_ALIAS_ONLY=sonnet` (no `model` supplied → `--model sonnet`, the pre-F1 behaviour), `P3_BOTH=claude-opus-5` (the full id wins over `modelAlias`, as F1's contract says), and a hostile alias is still refused: `P3_HOSTILE_ALIAS=CliRelayFailure: CLAUDE_CLI_MODEL_ALIAS_INVALID`. **Confirmed: the alias path is unchanged.**

---

## 4. Charge 4 — the merge cross-check, from THIS lens

I read `diff-cd043907..d35a9634-S03-files.patch` in full (five files, 156/10). **No hunk changes what pass 1 measured.** Point by point:

- **The `GET /v1/plan-tiers` policy row is unchanged in the merged route inventory.** It appears in the patch only as unchanged context, and reads at head exactly as F2 wrote it: `apps/api/src/index.ts:149` `{ route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" }`. The merge added two `"observability"` rows (`auth: "public"`) **above** it and widened the `resource` union by `"observability"` — neither touches S03's row, and `s7-authorization.test.ts`'s matrix still pins S03's row.
- **`packages/register/src/runtime-environment.ts` gained `OBS_FLUSH_DEADLINE_MS`: it admits nothing S03's key custody (C3) refused.** `loadDevelopmentCommandEnvironment` (`:40-59`) is a closed named allow-list of ten members; the merge added exactly one optional string. It is not a provider-key name, not an authorization header, and no wildcard was introduced. S03's key custody is a different surface entirely — key NAMES come from `config/models.yaml`'s `key:` field under `/^[A-Z][A-Z0-9_]*$/` (`packages/model-config/src/shape.ts:144`) and key VALUES are read from `.local/dev-auth/provider-keys.env` under the 0700/0600/`O_NOFOLLOW`/`nlink===1` rules (`apps/runner/src/dev-provider-keys.ts:24-56`), never from this environment list. One inconsistency worth a line, and it is the observability branch's, not S03's: `OBS_FLUSH_DEADLINE_MS: z.string().optional()` (`:49`) is the **only** member without `.min(1)`, so an empty value is admitted and then forwarded by the `typeof === "string"` filter (`:55-57`) where every sibling cannot be empty.
- **`config/models.yaml` and `packages/model-config/**` are untouched by the merge — stated from the patch.** Both are files S03 wrote (`s03-product-files.txt:20` and `:26-31`), and neither appears among the patch's five `diff --git` headers. The merge left them byte-unchanged.
- **Line numbers that moved are merge artefacts, and I re-grepped rather than citing pass 1.** `packages/providers/src/index.ts` gained +61 lines above the base-URL admission, so pass-1's `:120-126` is now `:126`. `apps/api/src/index.ts` gained +54, moving the error handler and the route.

---

## 5. Findings

### B1 — BLOCKING · `GET /v1/plan-tiers` refuses the only register row its own publisher writes

- **Producer:** `apps/runner/src/dev-deployment-register.ts:344-349` publishes the row value `{ kind: "PLAN_TIER_ROSTERS", free: […], premium: […] }`. The slice's own integration test pins that exact shape at `tests/integration/dev-deployment-register.test.ts:179-187`.
- **Consumer:** `apps/api/src/index.ts:1536-1540` does `PlanTierRostersSchema.parse(row?.value)`, and `packages/contract/src/index.ts:308-311` is `z.object({free, premium}).strict()` — **no `kind` member**.
- **Concrete inputs → wrong outcome, measured (PROBE R, §3):** the real config file's roster row, taken from the real producer, fed to the real reader → **ZodError**; driven through the real route with an authenticated session → **500 `INTERNAL_ERROR`**. Drop `kind` from the same value and it returns 200 with both lists. There is exactly **one** producer of this row and **one** consumer in the repository (`grep -rn 'planTierRosters' apps packages | grep -E 'rowKey|row_key'` → two hits, the two cited above), and they disagree.
- **Consequence:** F2 exists to close pass-1's product-truth B1 ("`/new`'s tier cards empty behind the operator-only `/v1/deployment`"). Against any register the slice publishes, `/new` now renders **zero** model ids and the refusal line F2 added — the same empty cards, with an error message on top. The F2 unit test that appears to prove the sealed read (`tests/unit/api.test.ts:637-671`) feeds its fake pool `value_json: { free, premium }`, a shape the producer never writes; that invented fixture is why the suite is green.
- **The CLASS, swept member by member:** *a register-row value read back through a contract schema must account for the `kind` discriminator the publisher writes.* Every other register-row consumer in the repository declares it — `apps/runner/src/dev-runner-policy.ts:20` `kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS")`, `:28` `z.literal("RUN_DEATH_POLICY")`, `:60` `z.literal("MAXIMIZE_WEIGHTED_TAU")`. `PlanTierRostersSchema` is the sole consumer that both omits the discriminator and is `.strict()`.
- **Remedy, chosen by SHAPE not by confidence (law 3.2), and this is why the security lens is raising it:** the key set of a register row value is FIXED and known, so **project** — read the row through a row-shaped schema that declares `kind`, then hand the wire the two lists; or pick `{free, premium}` out of the row explicitly. **Do NOT loosen the wire schema.** Replacing `.strict()` with `.passthrough()` (or dropping `.strict()`) is the one-character repair that makes the test go green and would serve every present and future member of that register row — and of anything later merged into it — to every authenticated user. The wire schema's strictness is the property that made this route fail-closed under my P4 smuggling probe; it must survive the fix.

### N8 — NON-BLOCKING · the Grok relay puts a caller-supplied `model` into a vendor CLI's argv with no validation

`acceptance/grok-relay.ts:105` appends `...(model === undefined ? [] : ["--model", model])` with no pattern test anywhere between `config/models.yaml` and the spawn. Measured in P2: all eight hostile values reach argv.

**What this is NOT, stated plainly:** it is **not** a shell injection. `acceptance/relay-core.ts:131` calls `spawn(command.binary, [...], { cwd, env, stdio })` with no `shell: true`, so `;`, backticks, `$(…)`, `|` and a newline are inert characters inside one argv element, and an embedded space cannot split into extra arguments. I built those values specifically to refute the stronger claim, and they do refute it.

**What it IS:** argument injection into the vendor CLI's own parser. A single argv element beginning with `-` is a complete flag (`--model --disable-web-search`), and with `=` it is a complete flag **and** value (`--model --mcp-config=/tmp/evil.json`) — enough to contradict the hardening the relay sets two arguments earlier (`--sandbox`, `--no-memory`, `--no-subagents`, `--disable-web-search`, `--tools ""`). Reachability today is a committed edit to `config/models.yaml`, so this is a supply-chain/typo class, not a live exploit — which is why it is non-blocking — but the committed-file gate that would catch a hostile line denies only two literal substrings (my pass-1 **N1**, still open), so nothing else stands in the way.

**The CLASS, swept member by member** — *a caller-supplied `model` that becomes a vendor CLI argument is pattern-checked before argv:*

| relay | how the value reaches argv | check | closed |
|---|---|---|---|
| `acceptance/model-shim.ts` (codex) | `-c model="${model}"` (`:167`) | `CODEX_MODEL_PIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u` (`:148`, enforced `:151`) — alnum-initial, and no `"` so it cannot break the quoted config expression | yes |
| `acceptance/claude-relay.ts` | `"--model", request.value` (`:159`) | `CLAUDE_MODEL_ID_PATTERN = /^claude-[a-z0-9.-]+$/u` (`:93`, enforced `:149-157`) — the mandatory `claude-` prefix is what makes a leading `-` unreachable | yes |
| `acceptance/grok-relay.ts` | `"--model", model` (`:105`) | **none** | **no** |
| `acceptance/hermes-relay.ts` | `"--model", HERMES_GLM_CLI_MODEL` (`:102`) | not caller-supplied — a module constant | n/a |

**Class fix:** give `grok-relay.ts` a `GROK_MODEL_ID_PATTERN` and a `GROK_CLI_MODEL_INVALID` refusal in the shape F1 already gave Claude; and put the bound where it belongs for all of them — `packages/model-config/src/shape.ts:117-118`, so a `model` that cannot be a model id is refused at the file, once, for every transport, instead of three times in three relays with one forgotten.

### N9 — NON-BLOCKING · the user-authenticated route performs the operator route's entire read

`apps/api/src/index.ts:1536-1537`: `readPlanTierRosters` calls `this.readDeployment(session)` and then discards all but one row. `readDeployment` (`:1488-1515`) issues three queries in parallel, including `SELECT DISTINCT ON (…) … FROM scorecard.scorecard_cell ORDER BY …` (`:1498-1503`) with **no `WHERE` and no `LIMIT`**. Before F2 that work sat behind `GET /v1/deployment`, `auth: operator`; it is now reachable by every authenticated user on every `/new` mount. Nothing leaks — the projection is correct and P4 proves the 500 envelope is bare — but the blast radius and the cost of a user-facing route now include the whole scorecard table. **Class fix:** read the one row (`WHERE register_version=$1 AND row_key='planTierRosters'`) instead of materialising the deployment and filtering in JavaScript; the same question applies to any future user-facing projection built on an operator-scoped reader.

### N10 — NON-BLOCKING (package defect, against the orchestrator) · `merge-delta-commits.txt` attributes an empty delta. Evidence in §1. N10a, the ambiguous freeze range, is in §1 too.

### Pass-1 N1–N7 at `d35a9634` — each re-checked, not assumed

| # | at `cc014550` | at `d35a9634` |
|---|---|---|
| **N1** committed-file custody gate denies two literals | **still holds**, unchanged — `tests/architecture/model-config-no-secret.test.ts:16-18` still asserts only `not.toContain("sk-")`, `not.toContain("Bearer")`, and the `key:`-carries-no-`=` rule. It now also gates **N8**'s hostile `model:` line, which raises its price. |
| **N2** freshness short-circuit before the credential check | **still holds**, same lines — `apps/api/src/provider-discovery.ts:140` returns a fresh HEALTHY record before `:141` tests `authorizationHeader === undefined` |
| **N3** `MAX_PROBE_RESPONSE_BYTES` checked after the body is buffered | **still holds**, same lines — `:9` constant, `:71` `await response.text()`, `:72` `Buffer.byteLength(raw)` compared afterwards |
| **N4** the wire admits `http:` for any host | **still holds, line moved** — `packages/providers/src/index.ts:126` (was `:120-126`; the merge's +61 lines pushed it down — a merge artefact, re-grepped, not a new finding) |
| **N5** custody asserted on the leaf but not the parent; three readers, three rules | **still holds** — `apps/runner/src/dev-provider-keys.ts:24` builds `<root>/.local/dev-auth` and `lstat`s only that leaf, so `.local` may still be a symlink; `apps/runner/src/dev-api-environment.ts:98-99` asserts both roots; `apps/runner/src/dev-deployment-register.ts:223` asserts only the receipt's own directory |
| **N6 / N6b** the package's C4 command did not produce the package's C4 number | **CLOSED by this package** — `README.md:16` names the five-suite form as the command of record and prints every argv in its log. My pass-1 finding is answered; no ticket needed beyond the one already raised. |
| **N7** the key file's format is unwritten and only one mode is legal | **still holds** — `apps/runner/src/dev-provider-keys.ts` stores the value verbatim after the first `=` (`keys.set(name, rawLine.slice(separator + 1))`), so `KEY="…"` keeps its quotes; and `:6`/`:53` demand exactly `PRIVATE_FILE_MODE = 0o600`, so a stricter `0400` is still refused |

---

## 6. Verdict — **REWORK** (lens `security-data-safety`, REV(S03) pass 2 of 3)

One blocking finding (**B1**) and four non-blocking (**N8, N9, N10, N10a**), plus six of my seven pass-1 N-findings still standing and one (N6) closed by this package.

**What I verified and how:** the new route is fail-closed on every axis this lens owns — 401 without a session and with the retired header; a 200 body whose key set is exactly the two lists; operator-only members smuggled beside those lists **refused** rather than forwarded, with neither the fake key nor any smuggled key name in the response; a 5xx envelope that, after the merge, carries no free-text message at all; and two log sinks that are allow-lists rather than free text, including the merge's new `captureHandled`, which never reads `error.message`. The register publication still carries no bearer (probe E re-run). The alias path is unchanged and hostile aliases are still refused. The C3 and §5 runs reproduce the package's failure set exactly, with `Test Files` pinned at 17.

**Why a fail-closed route is nevertheless a REWORK.** B1 is not a leak; it is the opposite — the strictness that made every smuggling probe fail is the same strictness that refuses the producer's own `kind` member, so the route 500s in production and F2 does not do what it was dispatched to do. I raise it blocking from this lens for two reasons. First, I measured it with my own producer-to-consumer probe rather than reading the author's fixture, and a lens that measures a break and files it as someone else's concern is the failure mode §2 of the reviewer contract names. Second, the obvious one-character repair — loosening `.strict()` — is a security regression that only this lens is positioned to forbid, and the FIX packet must carry that constraint in writing.

**UNVERIFIED by me** (each named for TEST(S03) and V's test point): the mission-tree freeze diff, because the packet names no single latest SHA (§1, N10a) · any real OpenAI, Z.ai, Anthropic or xAI call and its echo · how the **real** `grok` CLI parses an injected `--model --mcp-config=…` (I proved what reaches argv, not what the vendor binary does with it — no vendor CLI was executed by this seat) · the live `:3000` stack, the live database on `127.0.0.1:55432`, and any browser step · whether V's signed-in dev session renders the `/new` cards end to end against a live register (B1 predicts zero ids and a visible refusal; I measured the API, not the page) · the live population of S28's held-version map (V-41, unchanged since pass 1) · `pnpm typecheck` (the package records rc=1 with 69 diagnostics, none in a file S03 wrote; I did not re-run it) · the two `register-support-publication` failures' own subject matter, which is R27's and not this slice's.

**Predictions about the other two lenses** (falsifiable, written before any contact). I expect **correctness-tests**, which owns B1-relays, to land on F1 from the opposite side and find the `kind` mismatch too — but as a *fixture* finding, that `tests/unit/api.test.ts:637-671` hand-wrote `value_json` instead of calling `buildDevelopmentDeploymentRegisterRows`, and I expect them to propose the same producer-to-consumer round-trip test I built as PROBE R; if they do not reach it, it is because they scoped to the relay half and cross-checked F2 only through its own suite, which is exactly the trap. I also expect them to attack `CLAUDE_MODEL_ID_PATTERN`'s laxity after the prefix (`claude-....` or `claude-` followed by dots and dashes only) and to call `resolveClaudeModel`'s `entries.length === 1` early return (`acceptance/claude-relay.ts:120`) a hole — it returns the sole reported model **without** comparing it to the requested id, so a CLI that reports one wrong model satisfies the new full-id contract; that is a genuine correctness gap I deliberately did not file, because it is lineage truth rather than data safety. For **product-truth**, which owns B1-cards, I predict the single most likely miss: that they mount `/new` against the *render test's* mocked `readPlanTiers` (which resolves `{free, premium}` with no `kind`, `tests/render/tier01-new-plan-tier.test.tsx:95-98`) or against the fixture deployment, see five ids, and pass F2 — the mock reproduces the invented shape rather than the published one, so the whole UI layer is green over a route that 500s. If product-truth passes F2 while I return REWORK on B1, that divergence is the evidence, and the resolution is PROBE R, not argument. I also expect at least one of them to raise the acceptance-step-8 refusal (V-41) as blocking; my pass-1 probe F says the mechanism is right and only the producer is absent, and I would answer with that table rather than a rework of the gate.

---

## 7. Rows for V

**None new.** B1, N8, N9 and N10 are engineering tickets with named class fixes, not decisions V must make. The contested product questions this lens touched remain **V-39** (a file with no `cli:` entry puts a paid bearer in the legacy `VLLM_*` triple — measured in pass-1 probe I) and **V-41** (S28's held-version map has no producer, so every removal refuses — measured in pass-1 probe F); both already carry defaults that bind, and adding a third row would cost V a decision he has already been asked for. N8's deeper question — whether the `model` bound belongs in `config/models.yaml`'s grammar rather than in each relay — is an engineering choice with an obvious answer (the file, once), not a V row.
