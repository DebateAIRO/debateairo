# REV(S03) pass 3 of 3 — lens `security-data-safety` · slice `S03` reviewed at `3f488b3f` · ticket `t_005aaddc`

SKILLS LOADED: `superpowers:using-superpowers` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) · `heartbeat-protocol` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`) · `heartbeat-reviewer` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`) · `superpowers:verification-before-completion` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

Seat `REV-S03-p3-security-data-safety`, blind, **pass 3 of 3 — the last lawful pass**. Worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p3-security-data-safety/dialectical-engine`,
detached at `3f488b3f`, `git status --porcelain` = 0 at claim **and 0 at handoff** (three temporary
probe files created under `tests/unit/` and deleted; no git write of any kind). `.local/**` was never
read and never printed; every key value below is this seat's own fake
(`FAKEKEY-rev-s03-p3-security-DO-NOT-USE`). No provider call, no dev server, no live database, no port
bound, no process left running, nothing opened on V's desktop. The sibling lens worktrees, the S03
lane and the main checkout's product tree were never opened.

---

## 1. The packet and package review (a defect here is a finding against the orchestrator)

Every constant checked against its source from this seat's cwd at `3f488b3f`:

| Packet / package claim | Verdict |
|---|---|
| ticket `t_005aaddc`, `comment cursor at dispatch: 1` | **correct** — exactly one comment (the DISPATCHED) existed when I claimed. My pass-2 cosmetic defect on this line is not repeated. |
| cwd + detached HEAD `3f488b3f`, porcelain empty | correct — measured `3f488b3f`, 0 entries |
| pass base `cd043907`; slice base `9a000c37`; slice head `0fe14637` | correct (`commits-since-p2.txt`: the single commit `0fe14637`) |
| FIX diff "2 files changed, 55 insertions(+), 1 deletion(-)" | correct — `diffstat-since-p2.txt`, identical to the ALL-paths form |
| merge delta "5 files changed, 156 insertions(+), 10 deletions(-)" | correct — `diffstat-merge-S03-files.txt`, and the patch contains **exactly 5** `diff --git` headers (measured: `grep -c '^diff --git'` → 5) |
| "`/v1/deployment` stayed operator-only" | correct — `apps/api/src/index.ts:150` `{ route: "GET /v1/deployment", auth: "operator", … }` |
| "the reader's strictness (no `.passthrough()`, no widened object)" | correct — `packages/contract/src/index.ts:308-311` is still `z.object({free, premium}).strict()`; `grep -n passthrough packages/contract/src/index.ts` returns **nothing** |
| freeze pair given as a CONCRETE `06e98e06..8b49350c` with the CWD-relative pathspec warning | **correct, and it closes my pass-2 N10a.** Ran first try from my cwd: 22 files changed, 986 insertions(+), **0 deletions** — the mission record is append-only for this pass (the F1 self-report +62, `LEDGER.md` +1, the S03-p3 package, `slices/S03/PROGRESS.md` +1). No finding. |
| `merge-delta-commits.txt` | **my pass-2 N10 is CLOSED by this package.** It now carries two sections — "Files with a net delta" (5 files, each with its `(+n/−m)`) and "Files touched by commits in the range whose net delta is ZERO — not part of the delta" (`tests/integration/dev-api-environment.test.ts`, net 0). That is precisely the class fix I named ("derive the per-file section list from the same `--numstat` the diffstat comes from"). |
| charge 2: *"P4's envelope-keys assertion is stated from the gate log"* | **N12, non-blocking packet defect** — see §5. I measured it myself instead. |

**The author's `SKILLS LOADED`**, checked against the worker floor (`heartbeat-protocol` §1) in
`board/FIX-S03-p2-F1.t_2ab42655.txt:18`: `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`,
`receiving-code-review`, `test-driven-development`, `verification-before-completion`,
`systematic-debugging` — **7/7, no shortfall against the floor and no fabrication I can detect from the
handoff text.**

---

## 2. What I re-ran (verbatim, from my worktree root; every argv is on line 1 of the log beside the number)

Logs promoted to `.hermes/reports/debate-tiers/probes/REV-S03-p3-security-data-safety/`.

| Command | My result at `3f488b3f` | The package's claim | Match |
|---|---|---|---|
| **C3, the nine-suite form** (`dev-cli-provider-panel` · `dev-auth-stack` · `dev-provider-panel` · `dev-deployment-register` (int) · `dev-api-environment` · `dev-real-provider-only` · `dev-deployment-register` (arch) · `dev-runner-provider-set` · `register-support-publication`) | rc=1 · `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 89 passed (91)` · 144.32s | **the package does not re-run C3 at this head**; this is the only C3 record at `3f488b3f` | new evidence; **identical counts to my own pass-2 run at `d35a9634`** |
| **§5 integrated, 17 files** (exactly as `cluster-map-PLAN-sections-2-and-5.md:74-83` prints them) | rc=1 · `Test Files 1 failed \| 16 passed (17)` · `Tests 2 failed \| 186 passed (188)` · 141.69s | `1 failed \| 16 passed (17)` · `2 failed \| 186 passed (188)`, three identical runs (`reverify-3f488b3f.txt`) | **yes, exactly — all three runs** |
| **the carried pass-2 P4/P1/P2/P3/E file, unchanged** | rc=0 · `Test Files 1 passed (1)` · `Tests 11 passed (11)` · 1.88s | the README states P4's envelope keys from the gate log | measured here instead (N12) |

`Test Files` is **17** in the §5 run, so vitest dropped no path (the silent-drop trap).

**The two failures in both runs, named and dated:**
`tests/architecture/register-support-publication.test.ts` → *"recognizes hostile static SQL
concatenation, interpolation, and tagged builders"* and *"classifies every register relation access and
bans open writers, latest selection, and unsafe version coercion"* — both **pre-existing at the lane
base, dated 2026-09-12** (COMMON §6). The failure SET is unchanged from my pass-1 and pass-2 runs.
I make no blanket claim about any other suite: every number above is a number I ran.

---

## 3. Charge 2 — **the wire answer of `GET /v1/plan-tiers` after F1**

### 3.1 What F1 actually did, read at head

`apps/api/src/index.ts:1536-1546`:

```ts
async readPlanTierRosters(session: Session): Promise<PlanTierRosters> {
  const deployment = await this.readDeployment(session);
  const row = deployment.register.rows.find(({ row_key }) => row_key === "planTierRosters");
  const value = row?.value as Readonly<{ free?: unknown; premium?: unknown }> | null | undefined;
  return PlanTierRostersSchema.parse({ free: value?.free, premium: value?.premium });
}
```

This is **projection to a named allow-list before the strict parse** — the remedy law 3.2 prescribes
for a FIXED key set, and the first of the two branches my pass-2 finding B1 named
(`reviews/REV-S03-p2-security-data-safety.md:132`). **The one-character repair I forbade in writing —
`.passthrough()`, or dropping `.strict()` — was NOT taken.** The wire schema is byte-identical to
pass 2 (`packages/contract/src/index.ts:308-311`), and there are now **three** independent strict
parses of this shape: the application (`:1543`), the route handler (`:927`), and the browser client
(`packages/contract/src/client.ts:509`).

### 3.2 The measurement — PROBE R3, built from the producer, not from any fixture

The row value comes from the real `config/models.yaml` → real `developmentPlanTierRosters()` → real
`buildDevelopmentDeploymentRegisterRows()`, then that exact value to the real
`PostgresAskApplication.readPlanTierRosters` and the real route. Verbatim:

```
S0_PUBLISHED_ROW_KEYS=["kind","free","premium"]
S1_READER_OUTCOME=OK {"free":["gpt-5.6-luna","glm-5.3-flash"],
                      "premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}
S2_ROUTE_STATUS=200 BODY={"free":["gpt-5.6-luna","glm-5.3-flash"],
                          "premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}
S2_WIRE_KEYS=["free","premium"]
```

**Answering the charge point by point:**

- **What an authenticated user receives beyond the two id lists: NOTHING.** The 200 body's key set is
  exactly `["free","premium"]`. **The `kind` discriminator does NOT reach the browser** — asserted
  directly (`body` contains neither `"kind"` nor `"PLAN_TIER_ROSTERS"`), and neither does any bearer,
  base URL or register version (asserted: no `Bearer`, no `api.openai.com`, no `api.z.ai`, no fake key).
- **The publisher did not move.** `S0` re-measures pass 2's fact: the row still carries `kind`. F1 is
  reader-side only, so `/v1/deployment`'s operator view still sees the whole discriminated row
  (`DeploymentSchema`'s row `value` is `z.unknown()`, `packages/contract/src/index.ts:276`) — correct,
  that route is `auth: "operator"`.
- **The strictness is intact, and still bites.** `P4_SCHEMA extra=false blank=false padded=true` —
  the schema refuses an unknown key and a blank id, and still trims (`"  spaced  "` → `"spaced"`,
  re-measured through the whole route in S6). Recorded as a fact, not a finding.
- **`/v1/deployment` stayed operator-only** (`:150`), and the anonymous / retired-dev-header refusals
  still stand: `S7_ANON=401 {"error":"SESSION_REQUIRED"}`, `S7_RETIRED_HEADER=401 {…}`.

### 3.3 The NEW question F1 opens — and the probe that answers it

**A projection DROPS what a strict parse REFUSED.** Pass 2 proved this route fail-closed by smuggling
operator-only members into the APPLICATION's return value, where the handler's strict re-parse caught
them. After F1 the application itself projects, so that probe no longer reaches the interesting layer.
I moved the smuggling one layer down, into the **register row** — the only layer an attacker who can
write a register row actually controls:

```
S3_ROUTE_STATUS=200 BODY={"free":[…],"premium":[…]}      S3_WIRE_KEYS=["free","premium"]
S3b_READER_OUTCOME=OK {"free":[…],"premium":[…]}
```

with the row carrying `authorization_header: "Bearer <fake>"`, `register_version: 9`,
`provider_targets: [{base_url, key: <fake>}]` and `source_key_path: "/Users/v/.local/dev-auth/provider-keys.env"`.
**None of the five smuggled members, and neither the fake key nor the string `.local`, appears in the
response or in the reader's return value.** The allow-list holds at the row layer.

**Defence in depth survived F1**, measured not assumed: `P4_EXTRA_MEMBERS=500
{"error":"INTERNAL_ERROR","correlation_id":"0dd1d201-…"}` — a widened APPLICATION result is still
refused by the handler's strict re-parse, and the 500 envelope's key set is **exactly
`["correlation_id","error"]`** (measured by me, 11/11 rc=0, not taken from the gate log). An upstream
throw whose message carried a fake key and the live database port surfaced neither
(`P4_THROWN`, no `55432`).

**Fail-closed on every degenerate row** (S5, seven cases — `null`, a string carrying the fake key and
the database port, a number, `{}`, `{free}` only, `free` not an array, a blank id): **all seven → 500,
envelope keys exactly `["correlation_id","error"]`, zero leaks.** So the unchecked `as Readonly<…>`
cast at `:1539` is safe at runtime — the schema behind it refuses every non-conforming shape.

### 3.4 F1 **narrowed** the merge's new capture sink (PROBE S8)

The merge added `captureHandled(error, …)` to the API error handler (`apps/api/src/index.ts:531`) and
the default emitter enqueues the error object itself (`packages/obs-capture/src/emit.ts:103-112`,
`payload_ref: error`). What can a `/v1/plan-tiers` parse failure put in there?

```
S8_WHOLE_ROW_SUCCESS=false
S8_WHOLE_ROW_ERROR=[{"code":"unrecognized_keys","keys":["kind","authorization_header","provider_targets"],
                     "path":[],"message":"Unrecognized keys: \"kind\", \"authorization_header\", \"provider_targets\""}]
S8_PROJECTED_SUCCESS=true
S8_WHOLE_ROW_ERROR_CARRIES_KEY_NAMES=true     S8_WHOLE_ROW_ERROR_CARRIES_KEY_VALUE=false
```

Pre-F1 the parse ran over the whole row, so a ZodError named **every unrecognised key of a register
row** (names, never values) and `captureHandled` enqueued it. Post-F1 the parse sees only two members
and succeeds, so **no error object reaches the sink at all on the happy path.** This is the axis on
which F1 is not merely adequate but an improvement, and it is why the projection is the right branch.

The sink itself carries no free text either: `packages/obs-capture/src/**` contains **no**
`String(error)`, no `error.stack`, no `JSON.stringify(error)`, and its only four reads of `.message`
are prefix/allow-list comparisons in `chain/verify.ts:472,473,724,725` — unchanged from pass 2.

---

## 4. Charge 3 — the class F1 swept, checked against my own grep

F1's handoff claims *"Sweep FOUND 17/17 `kind: z.literal(...)` sibling sites … under
`packages/register/src`"*. That is a sweep of the **publishers' discriminators**. The class I named in
pass 2 is the **readers'** side, so I swept it myself.

**Every consumer that reads a register row by `row_key` and what it does with the value:**

| reader | row | what reaches a surface | user-facing? |
|---|---|---|---|
| `apps/api/src/index.ts:1538` | `planTierRosters` | **projected** to `{free, premium}`, strict-parsed | **yes — `auth: "user"`, the only one** |
| `apps/ui/app/new/defaults.tsx:27` | `riskTier` | `String(row.value)` against a 3-member enum | no — reads `Deployment`, i.e. `/v1/deployment`, `auth: "operator"` |
| `apps/ui/lib/v3/adapter.ts:536` | `hiddenNodeScoreThreshold` | `typeof row.value === "number"` + range | no — same operator source |
| `apps/runner/src/dev-runner-policy.ts:106` | `acceptanceOrganCostBounds`, `runDeathPolicy` | declares `kind: z.literal(…)` (`:20`, `:28`, `:60`) | no — runner CLI |
| `apps/runner/src/support-status-cli.ts:104-105`, `support-switch-cli.ts:42` | support rows | operator CLI | no |
| `packages/register/src/index.ts:345-346` | convergence rows | internal | no |

**The sweep is complete for the property my lens owns**: `GET /v1/plan-tiers` is the **only** route in
the governed inventory with `auth: "user"` or `"public"` that serves register-row content — every other
register-row reader sits behind `auth: "operator"` or is an internal/CLI path (measured:
`grep -rn 'readDeployment\|readPlanTierRosters' apps packages`; the sole user-facing consumer is
`:1543`, the sole operator one `:933`). **Publisher and reader now agree on one shape**, and the test
that joins them is F1's `tests/unit/api.test.ts:318-361`, driven by the real
`buildDevelopmentDeploymentRegisterRows` — the joining case whose absence caused B1.

One member of the class is **not** closed the way its siblings are — see **N11**.

---

## 5. Charge 4 — the merge cross-check, from THIS lens

I read `diff-0fe14637..3f488b3f-S03-files.patch` in full (5 files, 156/10). **No hunk changes what
pass 2 measured, and none introduces an exposure on S03's surface.** Point by point:

- **S03's policy row is untouched.** The merge added two `"observability"` rows with `auth: "public"`
  **above** it (`:145-146`) and widened the `resource` union by `"observability"` (`:170-173` of the
  patch); S03's row reads at head exactly as F2 wrote it —
  `apps/api/src/index.ts:149 { route: "GET /v1/plan-tiers", auth: "user", resource: "plan-tier-rosters", action: "read" }`.
- **S03's own row is present in all three lists at the merged head — I measured it myself, not from
  `s03-row-in-three-lists.txt`:** the governed table `apps/api/src/index.ts:149`; `contractInventory.routes`
  `packages/contract/src/index.ts:685`; `EXPECTED_AUTHORIZATION_MATRIX` `tests/unit/s7-authorization.test.ts:51`.
  **No blocking finding on charge 4.**
- **The inherited RED is not S03's.** The route-contract pair is RED at `3f488b3f` for the
  observability branch's two client-report rows, which have no contract-list or matrix entry
  (`apps/api/src/index.ts:145-146`). Recorded, not a finding against S03 (observability board
  `t_acc50b4e`; V-46's fold stands).
- **The new `onRequest` hook is closed** (`:379-396` of the patch). `runWithObsContext` puts a
  `run_ref` in ambient context only for three literal run-scoped route templates AND only when the id
  passes `ResourceIdSchema`. `/v1/plan-tiers` has no params, so its context is the frozen empty object.
  No user data enters the context on S03's route.
- **`captureHandled` covers this route and carries only a route template.** `plan-tier-rosters` is not
  in `obsExcludedCaptureResources` (`identity`, `session-self`, `session-owner`), so a 5xx enqueues
  `{capture_point: "http", route_template: "/v1/plan-tiers"}` — a literal, not user data. Plus the
  error object itself, now narrowed by F1 (§3.4).
- **The 5xx envelope lost its `message` member** (`:580-585` of the patch) — `{error, correlation_id}`
  for every 5xx. This is why the lane and the merged head differ on P4's envelope (the F1 handoff's
  "lane-vs-merged difference"); at `3f488b3f` I measured the merged form directly.
- **`packages/providers/src/index.ts` (+61) emits nothing sensitive.** `emitProviderExhaustion`
  (`:301-347` of the patch) carries `attempt_ref` (a `randomUUID`), `ledger_ref`, a fixed taxonomy and
  `template_parameters: { attempt_count }`. **It does not read `lastError`**, so no upstream body, URL
  or key can reach an obs envelope from the provider path — which matters because S03 replaces two CLI
  relays with direct HTTPS targets over API keys. It also refuses an accessor-backed ambient context
  (`PROVIDER_OBS_CONTEXT_ACCESSOR_FORBIDDEN`) and swallows its own failures, so product semantics win.
- **`config/models.yaml` and `packages/model-config/**` are untouched by the merge** — both are files
  S03 wrote (`s03-product-files.txt`) and neither is among the patch's 5 `diff --git` headers.
- **`package.json` / `pnpm-lock.yaml`** add the obs-listener tool, an `audit:obs-inventory` lint step
  and workspace links. No dependency from a registry, no postinstall, nothing on S03's data path.
- **`tests/unit/api.test.ts`** — the merge's three hunks (`:692-724`) re-point legacy 500 assertions
  from `message: "INTERNAL_ERROR"` to a UUIDv4 `correlation_id`. They do not collide with F1's joining
  case at `:318-361`.

---

## 6. Findings

### N11 — NON-BLOCKING (NEW) · the roster reader is now the only register-row consumer that neither declares nor rejects the row's discriminator

- **Where:** `apps/api/src/index.ts:1539-1546`. F1's projection reads `value?.free` and `value?.premium`
  and never looks at `value.kind`.
- **Concrete inputs → outcome, measured (S4):** a `planTierRosters` row whose value is
  `{kind: "RUN_DEATH_POLICY", free: […], premium: […]}` is served as a plan-tier roster —
  `S4_WRONG_KIND_READER=OK {…}`, `S4_WRONG_KIND_ROUTE=200 BODY={"free":[…],"premium":[…]}`. Before F1
  that row produced a 500; the check has gone from "reject anything with a `kind`" (broken) to "ignore
  the `kind`" (unchecked).
- **Why it is NOT blocking, stated plainly so it is not re-litigated:** it changes **no wire content** —
  the response is still exactly two lists of trimmed non-empty strings, whatever the row says (S3
  proves a maximally hostile row yields the same two lists). It cannot leak. Reaching it requires
  writing a register row, and `register.register_row` rejects UPDATE and DELETE
  (`apps/runner/src/dev-api-environment.ts:337`). And it is the branch **my own pass-2 remedy
  explicitly offered** (`reviews/REV-S03-p2-security-data-safety.md:132`: *"or pick `{free, premium}`
  out of the row explicitly"*) — a fix cannot be blocking for taking a branch the reviewer named.
- **The CLASS and its members** (V-45 states it as "seven of eight register-row readers declare
  `kind: z.literal(...)`"): the siblings at `apps/runner/src/dev-runner-policy.ts:20,28,60` declare the
  literal; after F1, S03's reader is the one that does neither. **Class fix, two lines:** assert
  `kind === "PLAN_TIER_ROSTERS"` (or parse a row-shaped schema declaring the literal) **before**
  projecting, keeping the projection and the strict wire parse exactly as they are. Ticket at end of
  pass; TEST(S03) residue, not a merge blocker.
- VERDICT: keep F1 as merged and fix N11 as a follow-up / CONFIDENCE: high / STRONGEST COUNTER: the
  discriminator is the mechanism that tells a stale or mistyped row from a live one, and a route that
  ignores it can serve a row no publisher in this repository ever wrote as if it were authoritative —
  if the register ever grows a second writer for this key, N11 becomes the bug that hides it.

### N12 — NON-BLOCKING (packet defect, against the orchestrator) · the packet directs the seat to report a number it did not measure

`packets/REV-S03-p3-security-data-safety.md:25`: *"P4's envelope-keys assertion is stated from the gate
log in `…/S03-p3/README.md`"*. This collides with COMMON §4 and law 3.6 ("every number you report is
one you measured in this session"), and with this seat's own dispatch line. The cost of measuring it is
**1.88 s** (the whole P4 file, 11/11, rc=0). **Class fix:** a packet never offers a log-quoted number as
the default path for a value the seat can measure; where a number genuinely cannot be re-measured by
the seat, the packet says so and the seat records it UNVERIFIED with the log as its source.

### N13 — NON-BLOCKING **from this lens** · the merge-day seal refusal is the seal working; the dangerous thing is the obvious fix

Raised by ORCHESTRATOR NOTE (t_005aaddc, 2026-09-16 12:50), measured by the orchestrator on V's LIVE
dev database — **which is no-touch for this seat, so the runtime string
`REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` is the orchestrator's measurement, not
mine.** What I verified myself is the mechanism, statically at `3f488b3f`:

- `seedDevelopmentDeploymentRegister` (`apps/runner/src/dev-deployment-register.ts:691-723`) builds
  `buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, providerPanel, planTierRosters)` and
  hands them to `importHistorical({ registerVersion: DEVELOPMENT_REGISTER_VERSION, rows })` — i.e. it
  replays a **sealed historical** version with the **current** row set, which since S03 carries the
  `planTierRosters` row (`:343-350`).
- **The file's own doc comment says this cannot work** (`:641-649`, verbatim in substance): the
  historical bootstrap "is sealed: `register.register_row` rejects UPDATE and DELETE outright, and the
  historical import is capped at version 4 in both TypeScript and SQL. So a deployment that grows a
  provider … supersedes the old set by **publication**". The seed path contradicts the rule the same
  file documents, and S03's new row is what makes the contradiction reachable.

**Why this is non-blocking from `security-data-safety` and what only this lens can say:** the refusal
is the **integrity guard succeeding**. A sealed register version that could be re-imported with a
different row set is a rewritable audit history; nothing was overwritten, nothing leaked, and the
failure is loud. **The remedy must NOT be to relax the seal, lift the version-4 cap, or make
`importHistorical` tolerate a grown row set** — that is the same shape as the `.passthrough()` repair I
forbade for B1 in pass 2: the one-line change that turns the suite green by deleting the property that
caught the defect. The correct fix is the one the file already names: growth supersedes by
`publishDevelopmentDeploymentRegisterProviderSet` (`:650+`), so the seed must publish a NEW version
rather than replay a sealed one.
**Price:** it makes SPEC-v3 §2's restart command fail on every pre-S03 dev database, so acceptance
steps 6-10 are unrunnable there — a **blocking product finding for another lens**, and I say so
explicitly rather than letting it fall between lenses (see §7 predictions). Every pass-1/2 measurement
ran on fresh embedded postgres, where the drift cannot appear — which is the real cause: **the slice's
verification never ran the one substrate the acceptance steps run on.** That is V-46's rule
("a slice's verification list must run every test file the slice edits") extended one step further —
*and every substrate its acceptance steps name.*
VERDICT: non-blocking for this lens, blocking for the slice through product-truth / CONFIDENCE: high on
the mechanism (read at head), medium on the runtime string (not mine) / STRONGEST COUNTER: if the
orchestrator's published-version workaround becomes the merge-day procedure, the seed path stays broken
and the next database to be created hits it again.

### N14 — NON-BLOCKING **from this lens** · the `api.env` drift refusal is custody working; the workaround is one keystroke from destroying it

Raised by ORCHESTRATOR NOTE 2 (t_005aaddc, 2026-09-16 12:53). Verified statically at `3f488b3f`:
`apps/runner/src/dev-api-environment.ts:269-273` refuses to overwrite an existing `api.env` whose
content is neither byte-identical nor one of the named accepted transitions
(`isExactProviderRuntimeRefresh :312`, `isExactPublishedRegisterRefresh :344`,
`isExactProviderRuntimeRefreshWithLegacyProbeTimeout :399`,
`isExactLegacyEnvironmentWithoutSupportModelTarget :412`) → `DEV_API_ENVIRONMENT_DRIFT`. The S03
transition (five CLI slots → two healthy CLI + two keyless API slots absent) is not among the four.

**From this lens:** `api.env` is the file that holds provider **authorization headers** (COMMON §6:
"NEVER print api.env"). A writer that refuses to clobber it on an unrecognised transition is correct
fail-closed custody, and the same reasoning as N13 applies: **the fix is to add the specific S03
transition as a fifth named predicate, never to widen the guard to accept an arbitrary previous source
or to make the write unconditional.** Two further data-safety notes: (a) the orchestrator's workaround
— moving the copy's `api.env` **aside**, not deleting it — is the right operation; an `rm` there
destroys the only copy of a bearer set that cannot be rebuilt without V's keys, and this is the same
class as the 2026-09-12 worktree-removal incident. (b) The guard's own accepted-transition list is the
mechanism V-41 already flags (an absent held-version map makes every removal read as a stale
reconstruction); N14 is that seam biting on merge day rather than a new one.
**Price:** SPEC-v3 R32 ("the restart completes") holds only on a custody with no pre-S03 `api.env`, or
after a manual move-aside — a documented manual step V must be told about before the test point.
VERDICT: non-blocking for this lens, and a named manual step for TEST(S03) / CONFIDENCE: high on the
mechanism / STRONGEST COUNTER: a manual move-aside that V performs unsupervised on the wrong custody is
exactly how a bearer set gets lost, so the fifth predicate is worth writing before the test point
rather than after.

### Pass-2 N8 and N9 at `3f488b3f` — re-checked, not assumed (charge 5; neither was assigned to F1)

| # | at `d35a9634` | at `3f488b3f` |
|---|---|---|
| **N8** the Grok relay puts a caller-supplied `model` into a vendor CLI's argv with no validation | held | **still holds, unchanged.** `acceptance/grok-relay.ts:105` is still `...(model === undefined ? [] : ["--model", model])` with no pattern anywhere between `config/models.yaml` and the spawn. Re-measured: all **eight** hostile values reach argv (`P2_GROK_ARGV`, `refusedBeforeArgv: false` ×8); the Claude relay still refuses all eight with `CLAUDE_CLI_MODEL_INVALID` behind `CLAUDE_MODEL_ID_PATTERN` (`acceptance/claude-relay.ts:61`, enforced `:129-134`). Still argument injection into the vendor parser, **not** shell injection (`relay-core.ts` spawns with no `shell: true`). Class fix unchanged: a `GROK_MODEL_ID_PATTERN`, and the real bound at `packages/model-config/src/shape.ts:117-118` so it is refused once at the file for every transport. |
| **N9** the user-authenticated route performs the operator route's entire read | held | **still holds, same shape.** `apps/api/src/index.ts:1537` still calls `readDeployment(session)` and discards all but one row; `readDeployment` (`:1483-1533`) still issues three parallel queries including `SELECT DISTINCT ON (…) … FROM scorecard.scorecard_cell ORDER BY …` (`:1497-1503`) with **no `WHERE` and no `LIMIT`** — re-grepped at head; only the `register_row` query is version-scoped. Every `/new` mount by every authenticated user materialises the whole scorecard table. Nothing leaks (the projection is correct and the 500 envelope is bare) — this is blast radius and cost. Class fix unchanged: read the one row with `WHERE register_version=$1 AND row_key='planTierRosters'`. |
| **N10** (package defect) | held | **CLOSED by this package** — §1. |
| **N10a** (ambiguous freeze range) | held | **CLOSED by this packet** — a concrete pair, and the diff ran (§1). |

Pass-1 **N1–N5, N7** were re-checked at `d35a9634` in my pass-2 artifact §"Pass-1 N1–N7" and none of
them is in a file F1 or the merge touched (`grep`ed against the 2-file FIX diff and the 5-file merge
patch); I did not re-measure them at `3f488b3f` and record that under UNVERIFIED rather than restate
pass-2 numbers as pass-3 ones. **N6 is closed** (pass 2).

---

## 7. Verdict — **PASS** (lens `security-data-safety`, REV(S03) pass 3 of 3, the last lawful pass)

No blocking finding **for this lens**. Four new non-blocking findings (**N11**, **N12**, and **N13**,
**N14** priced from the orchestrator's two mid-run notes), two carried non-blocking findings still
standing (**N8**, **N9**), and two of my pass-2 package/packet defects closed (**N10**, **N10a**).

**A PASS here is a lens verdict, not a merge recommendation.** N13 makes SPEC-v3 §2's restart command
fail on every pre-S03 dev database and N14 makes R32 hold only after a manual move-aside; both are, in
my reading, **blocking for the slice through product-truth**, and I name them rather than let them fall
between lenses. From `security-data-safety` neither is an exposure — both are integrity guards
refusing correctly — so neither can be blocking here without misusing this lens's bar.

**The bar this pass sets, from the packet: a finding is BLOCKING only if S03's own promise is unmet at
`3f488b3f`, or a NEW exposure was introduced by F1. Neither is true, and I measured both.**

**The promise is met.** `GET /v1/plan-tiers` returns **200** with the real config file's ids for an
authenticated session, built end-to-end from the real publisher — `{"free":["gpt-5.6-luna",
"glm-5.3-flash"],"premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}` — and the body's key set
is **exactly** `["free","premium"]`. Pass 2's B1 is closed by a producer→consumer probe I built from
the CLAIM, not by reading F1's test.

**No new exposure.** The remedy took the shape law 3.2 prescribes for a fixed key set — projection to a
named allow-list — and the one-character repair I forbade in pass 2 was not taken: the wire schema is
byte-identical and `.passthrough()` appears nowhere in the contract. The allow-list holds against
smuggling at the **row** layer (S3/S3b: five operator-only members, none reaches the wire or the
reader's result); the handler's strict re-parse still refuses smuggling at the **application** layer
(P4_EXTRA_MEMBERS 500, envelope exactly `["correlation_id","error"]`); every one of seven degenerate row
values is fail-closed with zero leaks (S5); anonymous and retired-header requests are still 401 (S7);
the register publication still carries no bearer (E); and F1 measurably **narrowed** what a parse
failure can put into the merge's new capture sink (S8). The merge cross-check over all five files
changes nothing this lens measured at pass 2, and S03's own route is present in all three governed
lists at the merged head.

**What I did NOT verify** (each named for TEST(S03) and V's test point): any real OpenAI, Z.ai,
Anthropic or xAI call and its echo · how the **real** `grok` CLI parses an injected
`--model --mcp-config=…` (I proved what reaches argv, not what the vendor binary does with it — no
vendor CLI was executed by this seat) · the live `:3000` stack, the live database on `127.0.0.1:55432`,
and any browser step · whether V's signed-in dev session renders `/new`'s cards end to end against a
live register (S2 predicts the five ids; I measured the API, not the page) · the live population of
S28's held-version map (V-41, unchanged) · `pnpm typecheck` (the package records rc=1 with 69
diagnostics, none in a file S03 wrote; I did not re-run it) · my pass-1 N1–N5/N7 at this exact head
(re-checked at `d35a9634`, and in no file F1 or the merge touched) · the `register-support-publication`
failures' own subject matter, which is R27's · whether the obs runtime is actually installed in the
`:3000` API process, which decides whether `captureHandled`'s enqueue reaches Postgres or the default
no-op queue (`packages/obs-capture/src/emit.ts:131-137`) — it changes nothing in §3.4's direction, only
its stakes · **the two merge-day runtime strings in N13 and N14**
(`REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`, `DEV_API_ENVIRONMENT_DRIFT` on a real
custody), which the orchestrator measured on V's LIVE dev database — a no-touch surface for this seat.
I verified both **mechanisms** statically at `3f488b3f` and price them on that basis; the runtime
observations are the orchestrator's, cited as such.

**Predictions about the other two lenses** (falsifiable, written before any contact). I expect
**correctness-tests** to confirm F1's joining case RED→GREEN and its four-mutant table, and to land its
sharpest finding on the *other half* of that joining case: F1's test builds the roster half from the
real `buildDevelopmentDeploymentRegisterRows` but hand-casts the panel half
(`{requiredDistinctMakers: 1, configuredProviders: []} as never`, `tests/unit/api.test.ts:322`) and
constructs `PostgresAskApplication` through five `as never` casts — so the case joins one side of the
seam to the producer and the other to a literal, which is a weaker version of exactly the defect it
exists to prevent. If they miss it, it is because the case is green and its title reads like a
round-trip. I also expect them to re-raise `resolveClaudeModel`'s `entries.length === 1` early return
(`acceptance/claude-relay.ts:120`), which returns the sole reported model without comparing it to the
requested id — I deliberately did not file it again because it is lineage truth, not data safety. The
divergence risk I would flag to the orchestrator in advance: **I predict at least one lens returns
REWORK on the `kind` question, from the opposite side of where I landed.** Correctness may call the
unchecked discriminator (my N11) a blocking type-confusion; **product-truth is the likelier one**, via
its carried case 3b, which asserts the PERSISTED `value_json` has no `kind` — the *writer-side* remedy
— and is therefore RED at this head by construction, because F1 correctly did not move the writer. If
product-truth reads 3b's RED as an unmet promise, the resolution is measurement, not argument: S2/S3
show the browser receives exactly two lists, and the persisted `kind` is what the operator view
(`/v1/deployment`, `value: z.unknown()`) and the other seven readers legitimately rely on. I also
expect product-truth to re-derive its case C (which mocks `readPlanTiers` to REJECT at
`REV-S03-p2-product-truth-newpage.test.tsx:127`, so its Free card is `[]` at every head) and, once
re-derived, to find `/new` listing the file's ids. **But I predict product-truth's verdict is decided
by the two orchestrator notes, not by `/new`:** if it prices N13/N14 it must return REWORK, because
SPEC-v3 §2's restart command — the command acceptance steps 6-10 are written against — fails on every
pre-S03 dev database, and a slice whose acceptance steps cannot be run is not done. The failure mode I
would bet on is the opposite one: that a lens reads "the orchestrator served the merged tree" as the
problem being handled and prices it as residue. It is not handled; the seed path
(`dev-deployment-register.ts:691-723`) is still wrong at head. If all three lenses PASS, that is the
single most likely place we were collectively wrong this pass, and the evidence is §6 N13, not argument.

---

## 8. Rows for V

**None new.** N11, N12, N8 and N9 are engineering tickets with named class fixes and named members,
not decisions V must make. The contested product questions this lens touched remain **V-39** (a file
with no `cli:` entry puts a paid bearer in the legacy `VLLM_*` triple — measured in pass-1 probe I) and
**V-41** (S28's held-version map has no producer, so every removal refuses — measured in pass-1 probe
F); both already carry defaults that bind. **V-45**, the row this pass exists to answer, is met by F1
exactly as its recommended default was written ("makes the published row and the reader agree and adds
the one test that joins publisher → route → page on the REAL row shape") — I record that as measured,
and the decision whether to close it is the orchestrator's transcription, not a new row. Adding a row
for N11 would cost V a decision whose engineering answer is two lines and unambiguous.
