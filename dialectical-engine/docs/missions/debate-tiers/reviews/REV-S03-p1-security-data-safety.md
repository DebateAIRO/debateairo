# REV(S03) pass 1 — lens `security-data-safety` · slice `S03` @ `cc014550` · ticket `t_8f344263`

SKILLS LOADED: `superpowers:using-superpowers` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/using-superpowers/SKILL.md`) · `heartbeat-protocol` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`) · `heartbeat-reviewer` (`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`) · `superpowers:verification-before-completion` (`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`).

Seat `REV-S03-p1-security-data-safety`, blind, pass 1 of 3. Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s03-p1-security-data-safety/dialectical-engine`, detached at `cc0145507738325ed951ac867f0ca85e565be20c`, `git status --porcelain` = 0 at claim. No git write of any kind was made. `.local/**` was never read and never printed; every key value in this review is this seat's own fake (`FAKEKEY-rev-s03-p1-security-DO-NOT-USE`, `sk-FAKE-rev-s03-p1-security-DO-NOT-USE`). No provider call, no dev server, no live database, no process left running, no port taken.

---

## 1. The packet review (a defect here is a finding against the orchestrator)

Checked against their sources at `cc014550`, from this seat's cwd:

| Packet claim | Verdict |
|---|---|
| ticket `t_8f344263`, comment cursor 1 | correct — one comment (the DISPATCHED line) existed when I claimed |
| cwd + detached HEAD `cc014550`, porcelain empty, `generate:contract` run | correct — measured `cc0145507738325ed951ac867f0ca85e565be20c`, 0 entries; the roster suites import the generated file and pass |
| base `9a000c37`; ONE range, four clusters | correct (`README.md:6-7`) |
| probe 7 `dev-provider-keys.ts:35` = the directory-mode check | correct |
| probe 4 `dev-api-environment.ts:384` = `const heldRefs = …` | correct |
| probe 8 `shape.ts:16` / `packages/providers/src/index.ts:112` | correct, both |
| probe 9 `dev-provider-panel.ts:181` = the healthy⟺bearer pairing | correct |
| freeze range `b6ecee09..8e89d5d4`, run with CWD-relative pathspecs | correct — 14 files, 1882 insertions, all record (ARCH-REV p3 review + report, the C3/C4 packets, launch scripts, V rows, DECISIONS/PROGRESS); no product code and no key material in the range |
| the lens's own charge list (a)–(h) | well posed; each is answered below |

**N6 (packet/package defect, non-blocking).** The package's cluster map gives C4 a **four-suite** command (`cluster-map-PLAN-sections-2-and-5.md:19`), while `README.md:13` reports C4 as **`73/73` ×3**. I ran the package's own C4 command verbatim and measured **`Test Files 4 passed (4)` · `Tests 67 passed (67)`**. The missing 6 are `tests/architecture/tiers-s02-rosters.test.ts`, which the C4 seat actually ran as a fifth suite (`board/BUILD-S03-C4.t_f0797f95.txt:80-82`, and the orchestrator's own CONSUMED re-run at `:113`, both `5 passed (5)` / `73 passed (73)`). A reviewer who runs the command the package prints cannot reproduce the number the package prints. The C4 seat already reported the packet half of this (`BUILD-S03-C4.md:10` "5 paths/four suites"); the package inherited it. Fix the CLASS: the cluster-map row and the README table must be generated from the same command string the seat ran.

**N6b (record defect, cosmetic).** `probes.md` lists its items in the order 1…11, **13, 12**; probe 12 is the last block in the file. Nothing is lost, but a packet that says "probe 13" sends the reader to the second-to-last block.

Not verified by me: probes.md item 13's UI citations (`apps/ui/app/new/page.tsx:114,116`) and item 11 — outside this lens; `page.tsx` was not read.

---

## 2. What I re-ran (verbatim, from the worktree root, each through the capture runner)

Runner for every command: `LOG=<abs> zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh env LANG=en_US.UTF-8 npx vitest run <paths>`.

| Cluster command | My result | Package's claim | Match |
|---|---|---|---|
| C1 `tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/unit/model-config-file.test.ts tests/unit/model-config-shape.test.ts tests/unit/model-config-tiers.test.ts tests/architecture/model-config-no-secret.test.ts` | rc=0 · `Test Files 6 passed (6)` · `Tests 24 passed (24)` | 24/24 ×3 | yes |
| C2 `tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts tests/unit/provider-base-url-admission.test.ts tests/unit/provider-discovery-uncredentialed.test.ts` | rc=0 · `Test Files 4 passed (4)` · `Tests 26 passed (26)` | 26/26 ×3 | yes |
| C3 (nine paths, as printed at `cluster-map…:18`) | rc=1 · `Test Files 1 failed \| 8 passed (9)` · `Tests 2 failed \| 88 passed (90)`, duration 142.72s | same | yes |
| C4 (the four paths printed at `cluster-map…:19`) | rc=0 · `Test Files 4 passed (4)` · `Tests 67 passed (67)` | README says 73/73 | **no — see N6** |
| §5-1 integrated, 17 files | recorded in §2.1 below | `Test Files 1 failed \| 16 passed (17)` · `Tests 2 failed \| 179 passed (181)` | see §2.1 |

**The two failures in C3, named and dated:** `tests/architecture/register-support-publication.test.ts` → *"recognizes hostile static SQL concatenation, interpolation, and tagged builders"* and *"classifies every register relation access and bans open writers, latest selection, and unsafe version coercion"* — both **pre-existing at the lane base, dated 2026-09-12** (COMMON §6 row "S03 base + baseline"; the package's expected AFTER set is exactly these two titles). Neither is caused by this slice's diff. I make no blanket claim about any other suite: every number above is a number I ran.

### 2.1 The §5 integrated run
One run of the seventeen paths exactly as `cluster-map-PLAN-sections-2-and-5.md:74-83` prints them:

```
rc=1
 Test Files  1 failed | 16 passed (17)
      Tests  2 failed | 179 passed (181)
```

`Test Files` is **17**, so vitest dropped no path (the silent-drop trap). The two failures are the same two `tests/architecture/register-support-publication.test.ts` titles named in §2 — pre-existing, dated 2026-09-12, delta zero from this slice. This reproduces the gate's `reverify-cc014550.txt` numbers exactly.

---

## 3. My own probes — property · attack · outcome · restore

All probes are this seat's own fixtures, written from the CLAIM, not from the authors' tests. Files (temporary, in this worktree, deleted at handoff; promoted copies in `.hermes/reports/debate-tiers/probes/REV-S03-p1-security-data-safety/`):
`tests/unit/rev-s03-p1-security-probe.test.ts` · `tests/unit/rev-s03-p1-security-removal-probe.test.ts` · `tests/unit/rev-s03-p1-security-custody-probe.test.ts`.

### A — base-URL admission, both gates (charge c)
**Property:** https only, no credentials, query or fragment; enforced at the file loader AND at the discovery wire.
**Attack:** eleven URL shapes through `validateModelConfig` (loader) and `parseProviderDiscoveryTargets` (wire).
**Outcome** (`ADMISSION_TABLE`, run 1):

| URL | loader | wire |
|---|---|---|
| `https://api.openai.com/v1` | admits | admits |
| `https://user:pw@api.openai.com/v1` | refuses | refuses |
| `https://198.51.100.9/v1` (IP literal) | **admits** | **admits** |
| `https://provider.internal/v1` | **admits** | **admits** |
| `https://api.openai.com/v1/../../admin` | **admits** (normalised to `/admin`) | **admits** |
| `http://api.openai.com/v1` | refuses | **admits** |
| `http://198.51.100.9/v1` | refuses | **admits** |
| `https://аpi.openai.com/v1` (Cyrillic а, homograph) | **admits** | **admits** |
| `https://api.openai.com/v1?key=leak` | refuses | refuses |
| `https://api.openai.com/v1#frag` | refuses | refuses |
| `https://api.openai.com` (no `/v1`) | **admits** | **admits** |

Both gates exist and both enforce the credential/query/fragment rules, so charge (c)'s "both, or one?" is **both**. The differences are: the wire admits `http:` for any host (N4), and C2 deleted the wire's `/v1` suffix rule (`packages/providers/src/index.ts`, `-3` lines in the diff) so a bare origin now passes. A host allow-list is not a SPEC-v3 requirement (probes.md 8), so the IP-literal / `.internal` / homograph admissions are recorded as facts, not findings.
**Restore:** nothing mutated. `git status --porcelain` after: 3 entries, all my own probe files.

### B — uncredentialed discovery (charge d)
**Property (S17):** a remote target with no key is RECORDED and never CALLED; the record carries no bearer.
**Attack 1:** a keyless target, a `fetch` that throws if called.
**Outcome:** `UNCREDENTIALED_CALLS=0 PANEL=[] RECORDED=["probe:nokey:ABSENT:PROVIDER_PROBE_SKIPPED_UNCREDENTIALED"]` — property holds, no socket, no bearer in the record.
**Attack 2 (refutation):** the same keyless target, with one **fresh HEALTHY** record in the store.
**Outcome:** `STALE_ADMISSION calls=0 panelSize=1 recorded=[] panel=[{"provider_ref":"probe:nokey",…,"model_id":"m-1",…}]` — the target is **published to the panel as healthy while carrying no bearer, and nothing is recorded for that resolve**. See N2.

### C — the probe response bound (charge g)
**Property:** `MAX_PROBE_RESPONSE_BYTES = 64 * 1024` bounds the probe response.
**Attack:** a `fetch` returning a 64 MiB streamed body.
**Outcome:** `FLOOD_BYTES_DELIVERED=67108864 (cap is 65536)` — the whole 64 MiB was pulled into the process, then rejected. The constant is a post-hoc check, not a bound. See N3.

### D — what the probe request carries (charge g)
**Property:** a fixed prompt, `max_tokens: 64`, `thinking: disabled`, and nothing about the run.
**Outcome**, verbatim from the recorded request:
```
url:     https://api.z.ai/api/coding/paas/v4/chat/completions
headers: {"content-type":"application/json","authorization":"Bearer <this seat's fake>"}
body:    {"model":"glm-5.3-flash","max_tokens":64,"messages":[{"role":"user",
          "content":"DR-181 discovery health probe. Reply exactly: OK"}],
          "thinking":{"type":"disabled"}}
```
No run ref, no ask id, no user text, no custom user-agent; the `thinking: disabled` extension **is** applied for maker `Z.AI` (the catalogue's maker string at `apps/runner/src/dev-provider-panel.ts:62,72` is exactly the extension key at `apps/api/src/provider-discovery.ts:57`), which settles the C2 seat's UNVERIFIED line for the dev panel's own maker names. The body map is rebuilt per call and frozen; a second call cannot see a mutated object.

### E — the register publication (charge f, credential half)
**Property:** a register version carries the configured set, never a credential.
**Attack:** build the rows from a panel whose targets all carry `Bearer <fake>`, then grep every published value.
**Outcome:** the serialized rows contain neither the fake key nor the string `Bearer`; `configuredProviderSet` carries `{providerRef, adapterKind, maker}` only, `planTierRosters` carries model ids only — while the same panel's `targetsJson` does carry the bearer (`PANEL_TARGETS_JSON_CARRIES_KEY=true`). The publication boundary holds: `buildDevelopmentDeploymentRegisterRows` (`apps/runner/src/dev-deployment-register.ts:329-354`) projects to a named field set, which is the right remedy shape for a fixed key set.

### F — a slot REMOVAL, end to end (charge f, the headline; charge e)
**Property (R25):** `api.env` follows a removal publication instead of refusing it as drift; a removal is admitted only against the outgoing version's EXACT held set (S28).
**Attack:** a scratch `mkdtemp` root with a complete custody tree built from this seat's own fake values (0700 dirs, five 32-byte 0600 secrets, an 11-principal `database-principals.env`, a synthetic Hatchet token, a written register receipt), then `assembleDevelopmentApiEnvironment` twice across a set change.
**Outcome** (each line the probe's own output):

| scenario | result |
|---|---|
| ADD a slot, no held map | `OK reused=false keys=41` — admitted |
| **REMOVE a slot, no held map** | **`THROW DEV_API_ENVIRONMENT_DRIFT`** |
| REMOVE a slot, correct held map | `OK reused=false keys=41` — admitted |
| REMOVE a slot, **wrong** held map (a set the version never held) | `THROW DEV_API_ENVIRONMENT_DRIFT` |
| REMOVE a slot **and rewind** `REGISTER_VERSION` | `THROW DEV_API_ENVIRONMENT_DRIFT` |

**The answer to the headline charge: at `cc014550` a removal REFUSES.** The gate itself is correct and fail-closed — it admitted only the removal proved by the exact outgoing set, and refused both the forged set and the version rewind. What is missing is the producer (V-41): with the held map absent, `heldRefs` is `undefined` (`apps/runner/src/dev-api-environment.ts:384-391`) and every removal reads as a stale reconstruction. Security posture: **fail-closed, no exposure**. Product consequence: SPEC-v3 **R25's observable sentence is not yet true for the running stack**, and acceptance step 8 refuses on merge day — which is exactly what V-41 states and defaults to shipping.

**R25's key-equality half (charge e), measured:** across an admitted removal exactly three `api.env` keys move — `REGISTER_VERSION`, `REGISTER_DEPLOYMENT_RECEIPT_SHA256`, `PROVIDER_DISCOVERY_TARGETS_JSON` (`R25_MOVED_KEYS`). Every other key is byte-equal. The removed slot's ref and its bearer are **absent** from the new file (`R25_REMOVED_SLOT_STILL_IN_FILE=false OLD_BEARER_STILL_IN_FILE=false`): no credential residue survives a removal.

### G — key custody (charge a)
**Property (R12):** mode 0600, owner the running uid, not a symlink, `nlink === 1`; the value reaches no log, error or record.
**Attack:** a 14-cell matrix on scratch roots.
**Outcome** (`CUSTODY_MATRIX`): file mode **0600 only** — `0400`, `0640`, `0644`, `0666`, `0700` all refuse with `DEV_PROVIDER_KEYS_CUSTODY_INVALID`; directory mode **0700 only** — `0750`, `0755`, `0770` refuse; a **symlinked leaf** refuses (`O_NOFOLLOW` works); a **second hard link** refuses (`nlink === 1` works); an absent custody root returns an empty map and does not throw. **One admission I could build: a symlinked PARENT.** With `<root>/.local` itself a symlink to a directory elsewhere, `readProviderKeys` admits the file and returns the key (`"parent .local is a symlink": "OK [[…]]"`), because only the leaf `dev-auth` is `lstat`ed (`apps/runner/src/dev-provider-keys.ts:23-37`). See N5.
**Leak checks:** a malformed line throws `DEV_PROVIDER_KEYS_FORMAT_INVALID` with no value in the message (asserted, not eyeballed); the two availability warnings carry `tier=` and `model=` only (`dev-provider-panel.ts:232,258`); the stack's error chain keeps only `/^DEV_[A-Z0-9_]+$/` messages (`dev-auth-stack.ts:117-125`) and the CLI prints the code alone, so a `ModelConfigShapeError` detail never reaches stdout. A grep of the whole slice diff for secret-shaped literals found none, and a grep of the three mission trees (names only, values never printed) found two relay-handshake fixture bearers (`Bearer codex-…`, `Bearer claude-…`) and **no `sk-…` anywhere**: R12's "no log line, no error message, no test fixture, no committed file" holds for V's provider keys.
**Value carriage:** the value is taken verbatim after the first `=` (`dev-provider-keys.ts:69`) — `KEY="…"` keeps its quotes, padding survives the reader (the panel `.trim()`s at `:230`), `=` inside the value survives correctly, an empty value is returned as `""` and read downstream as an absent key. See N7.

### H — the restart check touches nothing (charge h)
**Property (R19–R22, S25):** on a refusal nothing is rewritten and no later stage runs.
**Attack:** drive `startDevelopmentAuthStack` with a `checkModelConfig` that throws a shape error and with every other operation replaced by a recorder that throws if called; take a `sha256` of `api.env` before and after.
**Outcome:** `RESTART_REFUSAL code=DEV_AUTH_STACK_MODEL_CONFIG_INVALID touched=[] digestBefore=e68b0c15… digestAfter=e68b0c15… same=true` — **no later stage was entered at all** (not even the port preflight), and `api.env` is byte-identical. The check is the first statement of the stack (`apps/runner/src/dev-auth-stack.ts:152-155`), so the register is never opened on any refusal class. Charge (h): **proved with my own frames.**

### I — slot order and the legacy `VLLM_*` triple (charge e)
**Property (V-39):** the order rule keeps a `cli:` slot at index 0, so the legacy triple never carries a remote maker's bearer.
**Attack:** load a file with **no `cli:` entry** (two `api:` entries per tier — legal under R2–R6: two distinct makers per tier).
**Outcome:** `SLOT_ORDER_NO_CLI=["api:development:openai-premium-api","api:development:zai-premium-api","api:development:openai-free-api","api:development:zai-free-api"]` — index 0 is a remote api slot, so `VLLM_BASE_URL/VLLM_MODEL/VLLM_AUTHORIZATION` (`apps/runner/src/dev-runner-process.ts:114-118`, pinned at `apps/runner/src/main.ts:65-71`) would carry **V's paid bearer**. With any `cli:` entry present the order holds: `SLOT_ORDER_MIXED=["cli:development:codex-premium-cli","cli:development:claude-premium-cli",…]`. This is **V-39 exactly**, now measured rather than reasoned: the case is reachable at `cc014550` and the loader admits such a file. No new row — V-39's yes/no is the decision, and its default ships.

**Mutant (charge b).** `config/models.yaml` was mutated twice in this worktree and restored from a byte copy taken first.
- Mutant 1: a trailing comment carrying a plausible xAI-style credential. `tests/architecture/model-config-no-secret.test.ts`, `tests/unit/model-config-file.test.ts`, `tests/unit/model-config-tiers.test.ts` → **`Test Files 3 passed (3)` · `Tests 8 passed (8)`** — the credential is committed and the custody gate is green, and the file still loads.
- Mutant 2: `base_url: https://svc:<fake token>@api.z.ai/api/coding/paas/v4`. `tests/architecture/model-config-no-secret.test.ts` → **`Tests 1 passed (1)`** — green with a credential in the committed file (the loader would refuse this one at startup, but the custody gate is the thing that stops it reaching git).
- **Restore:** `cp` from the byte copy; `shasum -a 256 config/models.yaml` = `97af8017bf45e3d2b1da2b8907318475b044d3ba765a6ef12e8e10a9ad8654ea`, identical to the pre-mutation copy; `git status --porcelain` after restore listed only my three probe files. See N1.

---

## 4. Findings

No blocking finding. Seven non-blocking; each is a class with its members named, and each needs a ticket the same day (§5 of the reviewer contract).

**N1 — the committed-file custody gate does not enforce its class.** `tests/architecture/model-config-no-secret.test.ts:16-18` denies exactly two literal substrings (`sk-`, `Bearer`) and one punctuation rule (`key:` lines carry no `=`). Demonstrated: a comment carrying an `xai-…` credential and a credential in `base_url` userinfo both pass, with the suites green (evidence above). Any maker prefix that is not `sk-` (xAI, Z.ai, Google), any token in a comment, and any credential in a non-`key:` value is outside the gate. **Class fix by shape, not by confidence:** the file's grammar is closed (R2–R6 — `free`/`premium`, `cli|api`, `model`, `base_url`, `key`), so the gate should assert the allow-list — every non-comment line matches the entry grammar, every `key:` value matches `/^[A-Z][A-Z0-9_]*$/`, every `base_url` parses to an https URL with empty userinfo — instead of denying two strings. Price of not fixing: a pasted key in a committed file is in git history forever, and this slice exists to make V edit that file often.

**N2 — the freshness short-circuit runs before the credential check.** `apps/api/src/provider-discovery.ts:140` returns a fresh HEALTHY record before `:141` tests `authorizationHeader === undefined`. Demonstrated: a target with no bearer is published to the panel as HEALTHY, and no observation is recorded for that resolve, so S17's "recorded, never called" is not total. Reachability at `cc014550` is limited — the dev panel forces `model === CLI_HANDSHAKE_UNAVAILABLE` on any keyless slot (`apps/runner/src/dev-provider-panel.ts:181-186`), and a fresh record would have to carry that sentinel as its `modelId` — so no shipped path reaches it today; it is one hand-edited `api.env`, or one future non-dev publisher, away. **Class fix:** move the credential branch above the freshness branch, so every resolve re-establishes the invariant; the same ordering question applies to any future short-circuit added to this loop.

**N3 — `MAX_PROBE_RESPONSE_BYTES` is checked after the body is buffered.** `apps/api/src/provider-discovery.ts:71-72` does `await response.text()` and only then compares `Buffer.byteLength(raw)` to the 64 KiB constant at `:9`. Demonstrated: 67,108,864 bytes entered the process before the rejection. The time bound is `PROVIDER_PROBE_TIMEOUT_MS`, which this stack sets to `180000` (`apps/runner/src/dev-api-environment.ts:504` via `DEVELOPMENT_CLI_CALL_TIMEOUT_MS`), so a slow-drip or hostile endpoint has three minutes of streaming per probe, per target, against V's API process. **Class fix:** read the body through a counting reader that aborts at the cap (or check `content-length` first and then cap the stream); the same pattern should be applied to any other place a remote body is `text()`-ed whole.

**N4 — the discovery wire admits `http:` for any host, and no longer requires a `/v1` path.** `packages/providers/src/index.ts:120-126` accepts `http:` so the loopback CLI relays work, but nothing ties `http:` to a loopback host: `http://198.51.100.9/v1` is admitted **with an `authorization_header` attached**, i.e. a bearer over cleartext. C2 additionally deleted the `/v1` suffix rule (the `-3` lines in the diff) to accommodate Z.ai's `/api/coding/paas/v4`. Not reachable from `config/models.yaml` (the loader forces https, and the dev panel pins every base URL to the catalogue at `apps/runner/src/dev-provider-panel.ts:176-177`), so this is a wire-level hardening item: **class fix** — admit `http:` only for a loopback host, and keep the path rule as an explicit per-maker allow-list rather than deleting it.

**N5 — the custody rule is asserted on the leaf but not the parent, and the two readers of the same tree disagree.** `apps/runner/src/dev-provider-keys.ts:23-37` `lstat`s only `.local/dev-auth`, so `.local` may be a symlink — demonstrated: the key is read from a directory outside the repository. `assembleDevelopmentApiEnvironment` asserts both (`apps/runner/src/dev-api-environment.ts:441-444`, `assertPrivateDirectory(localRoot)` then `assertPrivateDirectory(custodyRoot)`), and `readDevelopmentDeploymentRegisterReceipt` asserts only the receipt's own directory (`dev-deployment-register.ts:224`). Same custody tree, three rules. **Class fix:** one `assertCustodyPath(root, …)` helper that walks every component, used by all three readers.

**N6 / N6b — the package's C4 command does not produce the package's C4 number; `probes.md` is numbered out of order.** Evidence in §1.

**N7 — the key file's format is unwritten, and only one mode is legal.** `apps/runner/src/dev-provider-keys.ts:69` stores the value verbatim: `OPENAI_API_KEY="sk-…"` (the ordinary `.env` idiom V is likeliest to type) keeps its quotes and becomes `Bearer "sk-…"` at `dev-provider-panel.ts:252`, which the maker rejects, which surfaces to V as the class-(b) warning `DEV_PROVIDER_SLOT_UNAVAILABLE … model=<id>` — a correct-looking key with an unexplained unavailable slot. Separately, `:53` demands exactly `0600`, so a **stricter** `0400` file is refused as `DEV_PROVIDER_KEYS_CUSTODY_INVALID`. Neither is a leak; both are the kind of silent degradation R31/V-38 exist to prevent. **Class fix:** reject (or strip) a quoted value explicitly with a named class, accept `0400` alongside `0600`, and state the file's format wherever V is told to create it.

**Carried, not re-found:** V-39 (§3 probe I) and V-41 (§3 probe F) are confirmed with measurements, and the PLAN defects listed in the S03 DECISIONS folds were not re-opened.

---

## 5. Verdict — **PASS** (lens `security-data-safety`, REV(S03) pass 1 of 3)

No blocking finding. What I verified, and how: the key never reaches the register (probe E, a fake bearer greped out of every published value), never reaches a log or an error message (probe G plus a grep of the diff and of all three mission trees, values never printed), and does not survive a removal in `api.env` (probe F). Custody is enforced on mode, owner, symlink and link count, with the parent-directory gap at N5. Uncredentialed discovery opens no socket in the shipped path (probe B), the probe body carries nothing about the run (probe D), and a refused restart check touches nothing at all (probe H). The removal gate is correct and fail-closed; only its producer is missing, which is V-41's open row and not a security exposure. The seven findings above set WHEN, not WHETHER.

**UNVERIFIED by me** (all outside this seat's contract, each named for TEST(S03) and V's test point): any real OpenAI or Z.ai call and its echo; the real CLI relays' handling of a full model id (V-40); whether V's signed-in dev session carries the scope `/v1/deployment` demands (probes.md 13 — the C4 seat's mount, a UI/product-truth question I did not enter); the `:3000` stack, the live database and any browser step; the live population of S28's held-version map (V-41) — I measured the filesystem rules, not a source-to-sink run; `pnpm typecheck` (the package records rc=1 with 67 diagnostics, all in files BASELINE.md pins; I did not re-run it).

**Predictions about the other two lenses** (falsifiable, written before any contact): *correctness-tests* will land on the same `provider-discovery.ts` freshness branch I hit in N2 but from the opposite side — they will probe `isFreshMatchingRecord`'s clock handling (a record with a future `probedAt`, the `ageMs < 0` guard) and the single-flight `inFlight` sharing at `:174-184` under concurrency above the authors' parameters, and I expect them to report the C4 four-vs-five-suite number as a test-inventory defect too; I also expect them to find that `tests/architecture/model-config-no-secret.test.ts` never fails for any input they can write, which is my N1 seen as a test-quality finding, and possibly a mutation check on `validateRoster`'s `entries.length < 2`. *product-truth* will center on probes.md 13 — `/new` calling `readDeployment` against a route pinned to 403 for an ordinary user — and on whether V can tell WHICH shape class refused a restart, because the stack's error chain keeps only `DEV_*` messages and drops the `MODEL_CONFIG_*` code and its detail (`dev-auth-stack.ts:117-125`), which reads to me like a live R22 gap they will call blocking and I deliberately did not, since R22 governs the refusal *print* and I only proved the negative half (no key value is printed). I expect at least one of them to raise the acceptance-step-8 refusal (V-41) as blocking; my measurement says the mechanism is right and only the producer is absent, so I would answer that with probe F's table rather than a rework of the gate.

---

## 6. Rows for V

**None new.** The two contested product questions this lens touched are already open and already carry defaults that bind: **V-39** (a file with no `cli:` entry puts a paid bearer in the legacy `VLLM_*` triple — reachable, measured in probe I) and **V-41** (S28's held-version map has no producer, so every removal refuses — measured in probe F, including that the gate correctly refuses a forged set and a version rewind). Both rows already say what I would have said; adding a third would cost V a decision he has already been asked for. N1–N7 are engineering tickets, not V decisions.
