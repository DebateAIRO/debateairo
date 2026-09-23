# PLAN — slice S03

**Revision 3 — `ARCH-FIX(S03)` (seat ARCH-FIX-S03, ticket `t_06759d41`), 2026-09-13, pass 3 of 3 — THE
LAST, under the REWORK verdict `reviews/ARCH-REV-S03-p2.md`. Revision 2 (ticket `t_f14aab0f`, verdict
`reviews/ARCH-REV-S03-p1.md`) closed B1/B2/B3 and N1–N6 and raised F-ARCH-4; the reviewer verified every
one of them closed, and its per-step list is in `DECISIONS.md` and in that pass's handoff.**
Changed by THIS revision: **S1** (N6-p2 — `pnpm-lock.yaml` is a declared write; `pnpm-workspace.yaml`
measured NOT written; a `pnpm install` / `git status --porcelain` criterion) · **S10** (**B1-p2** — it
no longer writes `tests/architecture/dev-deployment-register.test.ts`; its ordering case moves to
`tests/architecture/tier01-roster.test.ts`, C1-owned, so ONE cluster writes that file) · **S21**
(**B1-p2** — that suite enters C3's Files line with its `:14` call-text update, which is also
**N2-p2**'s measurement that the CLI passes its new argument, plus one case over all four CLIs;
**N1-p2** — the done-criterion names ONE build, driving the module-private predicate through
`assembleDevelopmentApiEnvironment` `:409`) · **§2** (**B1-p2(e)** C1 18 paths / C3 24 · **N3-p2** C3's
expected AFTER set by title · **N4-p2** nine test files in C3's command, eight in its surface) · **§7**
· **`surfaces.mjs`** (the completeness assertion, its printed denominator, a non-zero exit).
**`:98-362` (S1–S17) KEEPS ITS LINE COUNT** — S1 and S10 were re-punctuated within their own lines, so
the BUILD(S03-C1) and BUILD(S03-C2) packets' Revision-2 anchors still resolve.

**Filled by `ARCH(S03)` (seat ARCH-S03, ticket `t_6b7afd11`), 2026-09-13.** REQ owns the trace
skeleton and the laws restated below; every word under §1–§6 is ARCH's.
There is **no line cap on this file** (V, 2026-08-28): a slice gets as many steps as it has.

Binding SPEC: **`docs/missions/debate-tiers/slices/S03/SPEC-v3.md`**, frozen at REQ-FIX-S03's READY
marker (pass 3 of 3, under the verdict `reviews/REQ-REV-S03-p2.md`); PASS at `reviews/REQ-REV-S03-p3.md`.
`SPEC-v2.md` and `SPEC.md` beside it are byte-identical to their freezes and kept as the historical
record — read v3, and never a memory of v1 or v2.
`ui: no` — this slice passes through no MOCK gate and no `DONE.md`; its done oracle is SPEC-v3's
`## 2. Acceptance`, run by V.

## The quantifiability law — every step below obeys it

A step is finite, categoric and mechanically checkable: a stranger can mark it done without asking
its author what it meant. WRONG: "improve error handling". RIGHT: "requests with a missing id return
400 with a message, and the test asserting this passes". Banned in any step or criterion: improve,
better, robust, handle, appropriate. Every pinned number carries its derivation in the same sentence.
Line citations are re-measured in the LANE (`.worktrees/tiers-s03/dialectical-engine` @ **`9a000c37`**)
at the moment they are written; the main tree's `apps/api/src/index.ts` is 13 lines ahead.

---

## 0. The direction, and the four measurements that forced it

`superpowers:brainstorming` before `superpowers:writing-plans`. The rejected directions are in
`DECISIONS.md` under *Ruled at ARCH*; the four measurements that closed them are here because every
step below rests on them. All four were run in the lane at `9a000c37`, 0 dirty, from
`/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/96555a10-dafb-468d-88b3-f6c3afd4c825/scratchpad/seats/ARCH-S03/`.

- **M1 — `@debateai/contract` is evaluated inside the browser bundle, so it cannot read the file.**
  `apps/ui/components/LoginFlow.tsx:5` and `apps/ui/components/PublicationControl.tsx:6` are **value**
  imports of `@debateai/contract` (not `import type`), and `packages/contract/src/index.ts:3` is
  `export * from "./plan-tiers.js"`. A `node:fs` read at the top of `plan-tiers.ts` therefore enters
  the client graph, where `apps/ui/next.config.mjs:15` transpiles the package. **Consequence: the
  YAML read cannot live in `packages/contract`.** (log `m01-contract-imports.log`, `m02-surface.log`)
- **M2 — but `PLAN_TIER_ROSTERS` must stay on contract's MAIN index.**
  `tests/architecture/tier01-roster.test.ts:33-40` reads it off `import * as contract from
  "@debateai/contract"` and fails with *"PLAN_TIER_ROSTERS is not exported from @debateai/contract"*.
  R27 keeps that suite at 1/1. **Consequence: a subpath-only export is refused by the pin.**
  (log `m03-pins.log`)
- **M3 — both roster oracles already exclude a generated module, and the repo already requires the
  generator.** `tier01-roster.test.ts:27` filters `!file.startsWith("packages/contract/generated/")`;
  `tiers-s02-rosters.test.ts:76-81` puts `generated` in `EXCLUDED_DIRECTORIES`.
  `packages/contract/generated/` is gitignored (`.gitignore:7`), produced by
  `pnpm run generate:contract` (`package.json:21`), which the S03 lane setup already runs
  (`setup-tiers-s03.log`, *"--- generate:contract --- generate rc=0"*) and which
  `TOOLING-TRAPS.md:294` already states as law for a fresh worktree. **Consequence: a generated,
  gitignored data module under `packages/contract/generated/` is the one seam that satisfies M1 and
  M2 at once, with no oracle filter edited.** (log `m03-pins.log`)
- **M4 — `/new` needs no new route.** `GET /v1/deployment` exists (`apps/api/src/index.ts:867`), the
  contract client already exposes it (`packages/contract/src/client.ts:506`
  `readDeployment: () => request("/v1/deployment", DeploymentSchema)`), and `/new`'s own defaults
  module already reads register rows by key (`apps/ui/app/new/defaults.tsx:27`
  `deployment.register.rows.find((row) => row.row_key === "riskTier")`).
  **Consequence: the tier lists travel as one more register row, and `/new` reads it the way it
  already reads `riskTier`.** (log `m05-probe-route.log`)

**The shape this produces.** `config/models.yaml` is read by exactly one Node-only module,
`@debateai/model-config`. Three consumers take its output by three different routes, each chosen by
what the consumer can physically do: the **generator** writes
`packages/contract/generated/plan-tier-rosters.ts` so `PLAN_TIER_ROSTERS` keeps its name, its home and
its main-index export with no id literal left in its source; the **runner** reads the file directly,
because `apps/runner` is Node-only and already owns every slot, port and relay; the **browser** reads
the `planTierRosters` register row out of the deployment payload, because a bundle can read neither a
file nor a module written after it was built.

---

## 1. Steps

Each step names its file surface, the assertion that closes it, and — for a production step — the
case that goes RED if the step is omitted. A step whose criterion is a rejection names the guard it
expects **and every guard that fires before it on the same operation**, so the oracle observes the
invariant it claims. Every JSON/YAML example is labelled EXACT or CONTAINS. A count that serves as a
later oracle names its members.

### Cluster S03-C1 — the file, its loader, and the contract feed

**S1. Create the package `@debateai/model-config`.**
Files — Create: `packages/model-config/package.json`, `packages/model-config/tsconfig.json`,
`packages/model-config/src/index.ts`, `docs/architecture/01-decisions/ADR-NNNN-tier-fleet-configuration-file.md`;
Modify: `pnpm-lock.yaml` — TRACKED, and `pnpm install` rewrites it when this package and its `yaml`
dependency appear, so it is a DECLARED write of this step (N6-p2). `NNNN` is measured with
`ls docs/architecture/01-decisions/` at write time. `pnpm-workspace.yaml` is NOT written: its `:2-3`
already globs `apps/*` and `packages/*` (measured in the lane at `9a000c37`).
Done when: `pnpm --filter @debateai/model-config exec tsc --noEmit` exits 0; `packages/model-config/package.json`
names `yaml` at the workspace-store version `yaml@2.9.0` (F11); and after `pnpm install`,
`git status --porcelain` lists exactly the paths in `S03-C1`'s column and no others.
RED if omitted: S2's suite cannot resolve `@debateai/model-config`.

**S2. `loadModelConfig` parses the file and returns typed entries.**
Files — Create: `packages/model-config/src/load.ts`, `tests/unit/model-config-file.test.ts`.
Export `loadModelConfig(repositoryRoot: string): ModelConfig`, where
`ModelConfig = { free: readonly ModelConfigEntry[]; premium: readonly ModelConfigEntry[] }` and
`ModelConfigEntry` is the discriminated union
`{ transport: "cli"; tier: PlanTierWord; cli: "codex"|"claude"|"grok"; model: string }`
` | { transport: "api"; tier: PlanTierWord; api: "openai"|"zai"; model: string; baseUrl: string; keyVariable: string }`.
Done when: loading a fixture whose content is EXACTLY SPEC-v3 R7's block returns `free.length === 2`,
`premium.length === 3`, `free[0].transport === "api"`, `free[0].keyVariable === "OPENAI_API_KEY"`,
`free[1].baseUrl === "https://api.z.ai/api/coding/paas/v4"` and `premium[2].model === "grok-4.6-build"`.
RED if omitted: that case throws `Cannot find module './load.js'`.

**S3. The reader never rewrites the file (R1).**
Files — Modify: `packages/model-config/src/load.ts`; `tests/unit/model-config-file.test.ts`.
Done when: a case takes a `sha256` of the fixture, calls `loadModelConfig` twice, and asserts the
`sha256` is unchanged and the file's mtime is unchanged. `loadModelConfig` opens the path with
`readFile` only — a case asserts `packages/model-config/src/load.ts` contains neither `writeFile` nor
`appendFile` nor `rename` (source-text assertion, the `sup-04-widget` idiom).
RED if omitted: nothing today writes the file, so this case passes vacuously at first — it is a
**regression guard**, and its RED is produced by the mutant in S4's refutation row, not by base.

**S4. The six shape classes refuse, one typed code each (R2–R6, R20).**
Files — Create: `packages/model-config/src/shape.ts`, `tests/unit/model-config-shape.test.ts`.
`loadModelConfig` throws `ModelConfigShapeError` carrying `{ classNumber, tier, model, detail }`.
The six classes and their codes, each reachable from a FILE value:

| # | Class (R20) | Code | The file value that produces it |
|---|---|---|---|
| 1 | malformed file / R2 shape | `MODEL_CONFIG_FILE_MALFORMED` | a tab-indented list; a third top-level key `enterprise:`; `free: {}` |
| 2 | unknown transport | `MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN` | `api: acme`; `cli: gemini`; an entry with `cli` **and** `base_url`; an entry missing `model` |
| 3 | a CLI that is not installed | `MODEL_CONFIG_CLI_ABSENT` | `cli: grok` when the probe for the binary reports absent |
| 4 | malformed key name | `MODEL_CONFIG_KEY_NAME_INVALID` | `key: sk-live-abc`; `key: zai_api_key`; `key: ZAI-API-KEY` |
| 5 | a roster the tiers may not express | `MODEL_CONFIG_TIER_ROSTER_INVALID` | one entry in `free:`; two `claude` entries in `premium:`; two entries of one maker |
| 6 | malformed base URL — R11's **first five** | `MODEL_CONFIG_BASE_URL_INVALID` | a username, a password, a `?query`, a `#fragment`, `ftp://…` |

Done when: `tests/unit/model-config-shape.test.ts` has **exactly six** `it` cases, one per class, each
asserting the thrown `classNumber` and code; and one further case asserts the union of the six codes
equals `MODEL_CONFIG_SHAPE_CODES` exported from `shape.ts` (so a seventh code cannot be added without
the class list moving).
Guard order, stated because the criterion is a rejection: class 1 (YAML parse / top-level shape) fires
before class 2 (per-entry keys), which fires before classes 4 and 6 (per-field values), which fire
before class 5 (per-tier arithmetic), which fires before class 3 (the only class that touches the
world). **No earlier guard exists**: `loadModelConfig` is the first thing that reads the file, and
`packages/providers`' `normalizedProviderBaseUrl`
(`packages/providers/src/index.ts:109-132`) and the panel's `expectedBaseUrl` gate
(`apps/runner/src/dev-provider-panel.ts:87-89, 100-101`) both run strictly later, on a target built
from an already-accepted entry — which is why class 6 must re-state the five URL conditions here
rather than defer to them.
RED if omitted: each of the six cases throws `ModelConfigShapeError is not a constructor`.

**S5. Class 3 asks the world through one injected port.**
Files — Modify: `packages/model-config/src/shape.ts`; `tests/unit/model-config-shape.test.ts`.
`loadModelConfig` takes an optional second argument
`{ isCliInstalled?: (cli: "codex"|"claude"|"grok") => boolean }`, defaulting to an implementation that
resolves the binary on `PATH` and checks the executable bit.
Done when: the class-3 case passes `isCliInstalled: () => false` and asserts the refusal; a second
case passes `() => true` and asserts the same file loads. No test shells out.
RED if omitted: the class-3 case depends on which CLIs this Mac has, and answers differently on
another machine.

**S6. The key-name rule is a rule about NAMES, and the file carries no secret (R5, R12).**
Files — Modify: `packages/model-config/src/shape.ts`; Create:
`tests/architecture/model-config-no-secret.test.ts`.
Done when: (a) every `key:` value matches `/^[A-Z][A-Z0-9_]*$/u` or class 4 fires; (b) a NEW
architecture case reads the committed `config/models.yaml` and asserts it contains none of the
substrings `sk-`, `Bearer`, and that no line matching `^\s*key:` contains an `=`. The case asserts on
the committed file, not on a fixture.
RED if omitted: (b) fails once S12 writes the file only if the file carries a secret — so its RED is
produced by the mutant in the refutation table (a `key: sk-test` line in a scratch copy), not by base.

**S7. The tier words are cross-checked against the wire, never re-declared as truth (ADR-0024 §3).**
Files — Modify: `packages/model-config/src/index.ts`; Create: `tests/unit/model-config-tiers.test.ts`.
`@debateai/model-config` declares its two tier words as a literal union and does **not** import
`@debateai/contract` (which would make the wire a dependency of the loader that feeds it).
Done when: a case imports `PLAN_TIERS` from `@debateai/contract` and `MODEL_CONFIG_TIERS` from
`@debateai/model-config` and asserts `[...MODEL_CONFIG_TIERS].sort()` deep-equals `[...PLAN_TIERS].sort()`;
and a source-text case asserts `packages/model-config/src/` contains no `@debateai/contract`.
This is the pattern ADR-0024 §3 already blessed for `packages/db` ("The store's input types name the
tier with a literal union, and a test compares that union to the wire's declaration").
RED if omitted: nothing catches a future `PLAN_TIERS` gaining a third value.

**S8. The generator writes the roster module.**
Files — Create: `packages/model-config/src/generate-plan-tier-rosters.ts`,
`packages/contract/generated/plan-tier-rosters.ts` (its output — gitignored by `.gitignore:7`, and
excluded from both roster oracles, M3).
It imports `@debateai/model-config` **only** — never `@debateai/contract` — and writes
`packages/contract/generated/plan-tier-rosters.ts` exporting
`export const GENERATED_PLAN_TIER_ROSTERS = Object.freeze({ free: Object.freeze([...]), premium: Object.freeze([...]) });`
with the ids in file order.
Done when: running it against R7's fixture produces a file whose default-parsed export deep-equals
`{ free: ["gpt-5.6-luna","glm-5.3-flash"], premium: ["gpt-5.6-sol","claude-opus-5","grok-4.6-build"] }` (EXACT).
**The import direction is the point:** `packages/contract/src/generate.ts:3` is
`import { contractInventory } from "./index.js"`, so contract's own generator depends on contract's
index; if the roster generator lived there, index → plan-tiers → the not-yet-written generated module
would deadlock on a fresh checkout. A separate entry has no cycle.
RED if omitted: S9's import of `../generated/plan-tier-rosters.js` fails to resolve.

**S9. `PLAN_TIER_ROSTERS` keeps its name, its home and its main-index export, and loses its literals (R8, R27).**
Files — Modify: `packages/contract/src/plan-tiers.ts`, `tests/architecture/tier01-roster.test.ts`.
It becomes
`import { GENERATED_PLAN_TIER_ROSTERS } from "../generated/plan-tier-rosters.js";` plus
`export const PLAN_TIER_ROSTERS = GENERATED_PLAN_TIER_ROSTERS satisfies Readonly<Record<PlanTier, readonly string[]>>;`
`PlanTierSchema` and `PLAN_TIERS` are untouched. No `node:fs` enters the file (M1).
Done when: `tests/architecture/tier01-roster.test.ts` — with `MODEL_IDS` changed to the five live ids
(`gpt-5.6-luna`, `glm-5.3-flash`, `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6-build`) — expects **`[]`**
for every id's quoted-exact declarations, and its `rosters!.free` / `rosters!.premium` assertions take
the new lists. It **stays 1/1** and does **not** carry R8's positive limb (N3(p2)).
A sixth id, `claude-sonnet-5`, is asserted **absent**: a new expectation that its quoted-exact
declarations are `[]` over the same file list.
RED if omitted: the suite reports `["packages/contract/src/plan-tiers.ts"]` where `[]` is expected.

**S10. The generator runs before anything that imports contract.**
Files — Modify: `package.json` (the repository root's), `tests/architecture/dev-deployment-register.test.ts`.
`"generate:contract"` becomes
`"tsx packages/model-config/src/generate-plan-tier-rosters.ts && tsx packages/contract/src/generate.ts"`.
Done when: in a tree with `packages/contract/generated/` deleted, `pnpm run generate:contract` exits 0
and `packages/contract/generated/plan-tier-rosters.ts` exists; and `pnpm exec vitest run
tests/architecture/tier01-roster.test.ts` then exits 0. Order is load-bearing and is asserted by a NEW
case in that same C1-owned suite — **never in `dev-deployment-register.test.ts`, which C3 owns (B1-p2)**:
a source-text assertion that `generate:contract`'s value has `generate-plan-tier-rosters` at a lower
index than `packages/contract/src/generate.ts`.
RED if omitted: the deleted-generated-directory run fails at `contractInventory` import.

**S11. `tiers-s02-rosters` changes its matcher, deletes its allow-list, and gains the positive limb (R8, R27).**
Files — Modify: `tests/architecture/tiers-s02-rosters.test.ts`.
Four changes, case by case, against the base measured this pass (4/4):
- Case 1 `:204-214` **kept and re-fixtured**: `PLAN_TIER_ROSTERS.free` deep-equals
  `["gpt-5.6-luna","glm-5.3-flash"]`, `.premium` deep-equals the three unchanged ids.
- Case 2 `:216-227` **matcher changed** from `source.includes(modelId)` to
  `source.includes(JSON.stringify(modelId))` in both `sourceFilesContaining` and
  `sourceOccurrencesContaining`; the `expectedFiles` map becomes `[]` for all five live ids **plus**
  `claude-sonnet-5`; the two `apps/ui/components/landing/cards.ts` allow-list entries are **deleted**.
- Cases 3 `:239` and 4 `:243` stand unchanged.
- **Case 5, new — R8's positive limb, carried by this suite alone:** it reads `config/models.yaml`
  from `PROJECT_ROOT`, derives each tier's ids, and asserts they deep-equal `PLAN_TIER_ROSTERS.free`
  and `.premium`. **4 kept + 1 new = 5/5.**
RED if omitted: case 2 reports the three support files
(`apps/api/src/support/model.ts`, `apps/runner/src/dev-support-model.ts`,
`apps/runner/src/dev-auth-stack.ts`) for `glm-5.3-flash` under the bare matcher — the exact failure
DECISIONS 2026-09-13 (B1) measured.

**S12. Write `config/models.yaml` (R1, R7).**
Files — Create: `config/models.yaml` (a `config/` directory does not exist today — F11, re-measured
this pass, `m02-surface.log` *"NO config/ directory"*).
Content EXACTLY R7's block (`SPEC-v3.md:56-74`), preceded by the header comments V chose
(`00-intake-S03.md:26-29`) with the `# CLIs:` line extended to name the `api:` form, and followed by
the *"Put Grok in Free too:"* block carried over **verbatim** (`00-intake-S03.md:45-48`).
Done when: `tests/architecture/model-config-no-secret.test.ts` passes; `loadModelConfig(repoRoot)`
returns the five entries of S2's criterion; a case asserts the file contains `claude-sonnet-5` zero
times; **and a case asserts the comment text mechanically (N6 — the pass-1 plan left a human as the
oracle for a checkable property).** That case asserts the committed file contains, as exact
substrings: `"# config/models.yaml"`, `"# Which models debate in each tier."`,
`"# Edit, then restart the stack."`, a line beginning `"# CLIs:"` that contains both `"codex"` and
`"api:"`, and the four-line block `"# Put Grok in Free too:"` / `"#   add under free:"` /
`"#   - cli: grok"` / `"#     model: grok-4.6-build"` (CONTAINS — the file also holds the entries).
The five comment strings are R7's requirement carried from `00-intake-S03.md:26-29` and `:45-48`.
RED if omitted: S11's case 5 fails with `ENOENT config/models.yaml`.

**S13. `PLAN_TIER_ROSTERS`' remaining consumers are the server and the suites (N2(p2)).**
Files — none modified by this step; it is a **measurement step** that closes the cluster.
Done when: a source-text case (added to `tests/architecture/tiers-s02-rosters.test.ts`, reusing its
`rosterSelectors` machinery at `:121-131`) asserts that **no file under `apps/ui/` selects
`PLAN_TIER_ROSTERS`**. After S24 removes the `/new` import, the expected set of selecting files is
exactly `{ apps/api/src/index.ts, apps/runner/src/dev-cli-provider-panel.ts }` plus the suites.
RED if omitted: `apps/ui/app/new/page.tsx:10,200` keeps a second, bundle-compiled source of the lists
beside the register row S23 publishes, and nothing says so.

### Cluster S03-C2 — the transports, the two gates, the probe, and R33

**S14. A remote HTTPS base URL is admitted; the five URL refusals still refuse (R10, R11a).**
Files — Modify: `packages/providers/src/index.ts:127-130`; Create:
`tests/unit/provider-base-url-admission.test.ts`.
**One instruction (corrected at Revision 2 under N5; the pass-1 text said both "delete" and "keep"
of the same line).** Delete ONLY the `/v1` demand — lane `:128-130`,
`if (!parsed.pathname.endsWith("/v1")) { throw … }`. **KEEP** lane `:127`
`parsed.pathname = parsed.pathname.replace(/\/+$/u, "")`. The two readings diverge on exactly one
input, which is why the choice must be written down: for `https://api.z.ai/api/coding/paas/v4//`,
keeping `:127` collapses every trailing slash and returns `…/paas/v4`, while deleting it leaves `:131`
`return parsed.toString().replace(/\/$/u, "")` to strip one slash only and return `…/paas/v4/` — a
base URL that yields `…/paas/v4//chat/completions` at call time.
Done additionally: a case asserts `normalizedProviderBaseUrl("https://api.z.ai/api/coding/paas/v4//")`
returns `"https://api.z.ai/api/coding/paas/v4"` EXACTLY.
Done when: `normalizedProviderBaseUrl("https://api.z.ai/api/coding/paas/v4")` returns that string
EXACTLY; `("https://api.openai.com/v1")` returns that string EXACTLY;
`("http://127.0.0.1:8795/v1")` returns that string EXACTLY; and five cases each throw
`PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` for a username, a password, a `?q=1`, a `#f`, and
`ftp://api.z.ai/v4`.
Guard order: `requiredProviderTargetText` (`:102-107`, same code string) fires first on a non-string
or untrimmed value; `new URL()` (`:115-118`, same code) fires second on an unparseable value; the
five-condition check at `:120-126` fires third. A test asserting "a query is refused" must pass a
**parseable, trimmed** URL or it observes one of the two earlier guards instead.
RED if omitted: the Z.ai case throws where a string is expected.

**S15. The panel's second gate admits an `api:` slot (R11b).**
Files — Modify: `apps/runner/src/dev-provider-panel.ts:100-101`. (The cluster surface note: this file
belongs to **S03-C3**; S15 is listed here for the requirement's sake and is **built in C3 as S31**.
It is named twice on purpose so R11's two gates read together; the single-writer rule puts the edit
in C3.)

**S16. One probe budget, and one measured per-maker extension (R13).**
Files — Modify: `apps/api/src/provider-discovery.ts:54-62`; Modify:
`tests/unit/api-provider-discovery.test.ts`.
`max_tokens` becomes `64` for every target. A frozen map
`PROBE_BODY_EXTENSIONS = { "Z.AI": { thinking: { type: "disabled" } } }` is merged into the body when
the target's `maker` is a key of it, and contributes nothing otherwise.
Derivation, measured and cited, not re-run (F14, `00-intake-S03.md:59`): `max_tokens: 64` with
`thinking: { type: "disabled" }` returned `"OK"` on every try (reasoning tokens 12–18);
`max_tokens: 8` failed in either mode. **`max_tokens: 64` without the `thinking` field is
UNVERIFIED on Z.ai** — it was never measured, so the plan takes the pair that was.
The extension is keyed by maker rather than carried in the file because R4 fixes an API entry's key
set at exactly `api`, `model`, `base_url`, `key`.
Done when: a case asserts the body sent to a `maker: "Z.AI"` target parses to an object whose
`max_tokens` is `64` and whose `thinking` is `{ type: "disabled" }` (CONTAINS); a case asserts the body
sent to a `maker: "OpenAI"` target has `max_tokens: 64` and **no** `thinking` key (the assertion is
`expect(Object.hasOwn(body, "thinking")).toBe(false)`, because OpenAI rejects an unknown body field
with 400 and a silently-sent field would turn every Luna probe ABSENT); and the three relay suites
(`acceptance/model-shim.test.ts`, `claude-relay.test.ts`, `grok-relay.test.ts`) keep their
`passed/total` — no relay source file is edited (R13's "without changing the CLI relays' probe").
RED if omitted: the Z.AI case reports `max_tokens: 8`.

**S17. No request leaves the machine for a slot with no credential (R33).**
Files — Modify: `apps/api/src/provider-discovery.ts:131-142`; Create:
`tests/unit/provider-discovery-uncredentialed.test.ts`.
In `resolve`'s map, a target with `authorizationHeader === undefined` is **not** passed to
`probeTarget`. It records, through `input.probes.record`, an ABSENT observation
`{ state: "ABSENT", modelId: null, failureCode: "PROVIDER_PROBE_SKIPPED_UNCREDENTIALED" }`
(**CONTAINS** — `probes.record` takes a full `ProviderProbeRecord`, so the observation also carries
`probeEvidenceRef`, `providerRef`, `maker` and `probedAt`; a seat reading this as EXACT writes an
assertion that cannot pass), and
`fetchImplementation` is never called for it.
`authorizationHeader === undefined` is the discriminator rather than the sentinel model because
`apps/api` must not import `DEVELOPMENT_UNAVAILABLE_CLI_MODEL` from `apps/runner`, and because
`apps/runner/src/dev-provider-panel.ts:103-108` already forces the two to coincide: a target is either
(healthy **and** credentialed) or (sentinel-model **and** uncredentialed).
The failure code needs no migration: `migrations/0022_dr181_discovery.sql:7` constrains `failure_code`
only to `IS NULL OR length(btrim(failure_code)) > 0`, and `:10` requires ABSENT ⟹ `failure_code IS NOT
NULL`; `migrations/0048_provider_probe_capability.sql:21-22` repeats both in the writing function.
Measured this pass (`m05-probe-route.log`).
Done when — **asserted per uncredentialed SLOT, never per host** (fold N1(p3)): a case builds a
resolver over five targets of which two carry no `authorizationHeader`, injects a
`fetchImplementation` that pushes every URL it is given into an array, resolves once, and asserts
(a) the array's length equals 3, (b) the array contains no entry whose host is `api.openai.com` or
`api.z.ai`, (c) `probes.record` was called for all five refs, and (d) the two uncredentialed refs'
records are `state: "ABSENT"` with `failureCode: "PROVIDER_PROBE_SKIPPED_UNCREDENTIALED"`.
Guard order: `isFreshMatchingRecord` (`:16-31`) runs before the skip on every ref; it returns `false`
for an ABSENT record (`:28` demands `state === "HEALTHY"`), so an uncredentialed slot re-enters the
skip each window and never re-enters `probeTarget`. A test that asserts "zero calls" without first
seeding a stale record observes the same thing either way and does not distinguish the two paths —
case (c) is what separates them.
RED if omitted: the array's length is 5 and (b) finds both hosts.

### Cluster S03-C3 — the slots, the publication, api.env, and the restart command

**S18. The slot catalogue: one row per slot the file's grammar can express.**
Files — Modify: `apps/runner/src/dev-provider-panel.ts:25-56`.
`DEVELOPMENT_CLI_PROVIDER_ROSTER` is replaced by `DEVELOPMENT_PROVIDER_SLOT_CATALOGUE`, a frozen list
of **ten** rows — the full cross product of the grammar: tiers `{free, premium}` × CLI makers
`{codex, claude, grok}` (6 rows, each with a loopback `port`) and × API makers `{openai, zai}`
(4 rows, no port). Each row carries `{ tier, word, transport, providerRef, maker, adapterKind }` plus
`port` for a CLI row.

| tier | word | transport | providerRef | maker | port |
|---|---|---|---|---|---|
| premium | codex | cli | `development:codex-premium-cli` | OpenAI | 8795 |
| premium | claude | cli | `development:claude-premium-cli` | Anthropic | 8796 |
| premium | grok | cli | `development:grok-cli` | xAI | 8793 |
| free | codex | cli | `development:codex-cli` | OpenAI | 8791 |
| free | claude | cli | `development:claude-cli` | Anthropic | 8792 |
| free | grok | cli | `development:grok-free-cli` | xAI | **8797 (new)** |
| premium | openai | api | `development:openai-premium-api` | OpenAI | — |
| premium | zai | api | `development:zai-premium-api` | Z.AI | — |
| free | openai | api | `development:openai-free-api` | OpenAI | — |
| free | zai | api | `development:zai-free-api` | Z.AI | — |

**The five refs live today keep their exact spelling** — a ref rename is what
`apps/runner/src/dev-api-environment.ts:354-357` calls out as forbidden ("slots are ADDED, never
removed or renamed"), and R24's subject is two refs REMOVED and two added, not five renamed.
Done when: a case asserts the catalogue has exactly 10 rows; that its `providerRef` values are
unique; that its six CLI ports are `[8791,8792,8793,8795,8796,8797]` sorted; that **no catalogue port
equals `HERMES_SUPPORT_PORT`** (8794, `acceptance/hermes-relay.ts:19`, re-measured at Revision 2
under N1) — the one collision that would
take V's support widget down (R26); and that for every `(tier, word)` the grammar admits there is
exactly one row (a cross-product assertion, not a count).
RED if omitted: the derivation throws `DEV_PROVIDER_SLOT_UNRESOLVED` for `api: zai` in `free`.
**The case hand-builds a `ModelConfig` value, or deletes a catalogue row, and never uses a fixture
file** (N3): because this catalogue is the complete cross product of the grammar, `loadModelConfig`'s
class 2 rejects every unrepresentable word first, so no YAML can reach this throw. See S19's guard-order
paragraph.

**S19. Entry → slot: the ref is a function of `(tier, word)`, and a `model:` edit cannot move it (R14.1, R14.2).**
Files — Modify: `apps/runner/src/dev-provider-panel.ts`; Modify: `tests/unit/dev-cli-provider-panel.test.ts`.
`developmentProviderSlots(config: ModelConfig)` maps each entry to the catalogue row whose `tier` and
`word` it matches (`word` = the entry's `cli:` or `api:` value) and throws
`DEV_PROVIDER_SLOT_UNRESOLVED` when no row matches.
**Guard order, and the guard that makes this one unreachable from a file (N3):**
`loadModelConfig`'s class 2 (`MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN`, S4) fires first on the same
operation and rejects every `cli:`/`api:` word outside the grammar. Because S18's catalogue is the
**complete** 10-row cross product of that grammar, no file that passes the shape check can reach
`DEV_PROVIDER_SLOT_UNRESOLVED` — it is a total-function assertion, not a file-reachable refusal.
**S18's and this step's RED case for it therefore hand-build a `ModelConfig` value in the test (or
delete a catalogue row), never a fixture file.** A seat that tries to reach it from YAML will observe
class 2 instead and conclude the code is dead.
**This is the answer to the ARCH-REV check the pass-3 verdict named** (`REQ-REV-S03-p3.md` §8):
`model` is not an input to the ref. A one-line `model:` edit on a keyed slot therefore yields the same
`provider_ref` and the same `configuredProviderSet` row.
**It DOES publish a new register version, and that is the intended behaviour** (corrected at Revision 2
under B1/B3; the pass-1 text claimed the opposite). The version is a function of every publication row
(`apps/runner/src/dev-deployment-register.ts:635` `computeRegisterSnapshotSha256(rows)` feeding `:639`
`developmentProviderSetPublicationId(input.baseRegisterVersion, snapshotSha256)`), and S23 adds
`planTierRosters`, whose value **is** the file's model ids — so a `model:` edit moves that row, moves
the digest, and publishes. **Acceptance step 6 requires exactly this**: `/new` shows the edited id
after a restart, which it can only do if the row that carries the ids moved.
What R14.2 forbids is narrower and still holds: **a key appearing publishes no version** — a key
changes neither `configuredProviderSet` nor `planTierRosters` (S23 builds the latter from the FILE, not
from the panel's targets, so a sentinel model never reaches it), and is confined to
`PROVIDER_DISCOVERY_TARGETS_JSON`, the same-version runtime-refresh path. S29 is the case that pins it.
Done when: three cases — (1) **one slot per entry**: R7's file yields 5 slots, adding the commented
grok-under-free entry yields 6, removing the premium grok entry yields 4, and two entries never share
a `provider_ref`; (2) **stability under a `model:` edit**: loading R7's file and loading it with the
Z.ai entry's `model:` changed to `glm-5.3` yields slot lists whose `providerRef` sequences are
deep-equal while the `model` at the zai slot differs — and the `configuredProviders` projections
(`providerRef` + `maker` + `adapterKind`) are deep-equal, which is the exact input
`buildDevelopmentDeploymentRegisterRows` puts in the `configuredProviderSet` row
(`apps/runner/src/dev-deployment-register.ts:322-335`, the row object; `providers:` at `:331`).
**Case (2) asserts the `configuredProviderSet` row is byte-identical across the edit AND that the
`planTierRosters` row is NOT** — the two halves of the corrected sentence, pinned together so neither
can be built alone; (3) **duplicate models are admissible**:
a file with `grok-4.6-build` in both tiers yields two slots with distinct refs and equal `model`
(which is what makes acceptance step 10a parseable), refused by nothing, because
`packages/providers/src/index.ts:175-177` uniques on `provider_ref` only.
RED if omitted: case (2) reports two different `providerRef` sequences.

**S20. Slot order puts a CLI relay at slot 0 (R14.3, F8).**
Files — Modify: `apps/runner/src/dev-provider-panel.ts`.
Order = every `cli:` entry (premium's in file order, then free's), then every `api:` entry (premium's
in file order, then free's).
Derivation: `apps/runner/src/main.ts:65-71` copies slot 0's `baseUrl`/`model`/`authorizationHeader`
into the api.env primary triple `VLLM_BASE_URL`/`VLLM_MODEL`/`VLLM_AUTHORIZATION` and throws
`RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` otherwise (re-measured this pass at
`apps/runner/src/main.ts:65-71` in the lane — re-measured at Revision 2 under N1: the file is 150
lines and the drift check is at `:65-71`; the pass-1 citation `:207-213` was a line number read off my
own measurement LOG, not off the source).
Keeping slot 0 a loopback relay keeps V's paid API key out of that triple.
Done when: a case asserts R7's file yields the ref order
`["development:codex-premium-cli","development:claude-premium-cli","development:grok-cli","development:openai-free-api","development:zai-free-api"]`
(EXACT) and that `slots[0].transport === "cli"`.
**A file with no `cli:` entry at all is legal under R2–R6 and puts an `api:` slot at 0.** That is a
custody consequence of a file V may write, it is not one of R20's six classes, and adding a seventh
class is a SPEC change. It goes to V as the row in `DECISIONS.md` §*Rows for V*; until V rules, the
order rule above stands and the case is recorded UNVERIFIED in §5.
RED if omitted: the ref order case reports the two Free api slots first.

**S21. The panel builder takes its configured set as an argument (R23.1–3).**
Files — Modify: `apps/runner/src/dev-provider-panel.ts:79-85, 91-101, 119, 138-166`,
`apps/runner/src/dev-api-environment.ts:310, 336, 376, 387, 493`,
`apps/runner/src/dev-api-process.ts:166`, `apps/runner/src/dev-runner-process.ts:55, 59, 62, 133`,
`apps/runner/src/dev-deployment-register-cli.ts:13`, `apps/runner/src/dev-auth-data-plane-cli.ts:15`,
`apps/runner/src/dev-api-environment-cli.ts:24`, `apps/runner/src/dev-provider-set-publish-cli.ts:18`,
`tests/integration/dev-provider-panel.test.ts`, `tests/architecture/dev-deployment-register.test.ts`,
`tests/architecture/dev-real-provider-only.test.ts`.
**`tests/architecture/dev-deployment-register.test.ts` is C3's, and only C3's (B1-p2).** Its `:14` is
`expect(cli).toContain("loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment())")`
— measured in the lane at `9a000c37`. S21 gives `dev-deployment-register-cli.ts:13` a second argument, so
that exact substring (with `)` immediately after `loadDevelopmentCommandEnvironment()`) no longer occurs
and the assertion fails. **S21 updates it to the two-argument call text**, which makes `:14` the case
that MEASURES that this CLI passes its new argument (N2-p2). S10 (C1) no longer writes this file: its
ordering case moved to `tests/architecture/tier01-roster.test.ts`, C1-owned, so one cluster writes it.
**The other three CLIs get the same measurement, in a file C3 already owns.** Measured: no source-text
case asserts their CALL text today — `tests/unit/dev-auth-data-plane.test.ts:157-160`,
`tests/architecture/dev-auth-data-plane.test.ts:9,23` and `tests/integration/dev-api-environment.test.ts:429,440`
read those CLIs but assert only their `package.json` script string (`.toBe("tsx apps/runner/src/…-cli.ts")`),
which S21 does not change; `dev-provider-set-publish-cli.ts` has no source-text case at all. So S21 adds
ONE case to `tests/architecture/dev-real-provider-only.test.ts` (C3's, S34's) asserting each of the four
CLI sources contains its two-argument call text. Without it the defaulted-parameter build is excluded by
prose alone.
**The four `*-cli.ts` files are in this list because S21's signature change breaks them** (B2.2,
measured in the lane): `dev-deployment-register-cli.ts:13`, `dev-auth-data-plane-cli.ts:15` and
`dev-api-environment-cli.ts:24` each call `loadDevelopmentProviderPanelFromEnvironment(...)` with ONE
argument, and `dev-provider-set-publish-cli.ts:18` calls `developmentConfiguredProviderPanel()` with
none. Each gains the configured set from `loadModelConfigConfiguredProviders(process.cwd())`, and
`dev-provider-set-publish-cli.ts` additionally passes `planTierRosters` for S23. Left out, they are
exactly the diagnostics S36 forbids, with no cluster permitted to fix them.
The module-level `const configuredProviders` (`:79-85`, derived from the static roster) becomes a
function of the loaded config. `buildDevelopmentProviderPanel(observations, configuredProviders)`
gains the set as a second parameter; `parseDevelopmentProviderPanelTargets(source, configuredProviders)`
likewise; `developmentConfiguredProviderPanel(config)` and
`loadDevelopmentProviderPanelFromEnvironment(source, configuredProviders)` pass it through.
**How the value REACHES each call site — one signature line per site, so two seats cannot build it
two ways** (corrected at Revision 2 under B1; the pass-1 text named a source that is out of scope at
four of the five sites). Measured in the lane at `9a000c37`: the three predicates at
`dev-api-environment.ts:310`, `:336` and `:387` are **module-scope functions taking two strings** —
there is no `input` in any of them — and `createRunnerEnvironment` (`dev-runner-process.ts:55`) takes
`(commandEnvironment, apiEnvironment)` with no `repositoryRoot`. So the value is threaded as an
explicit parameter, and each new signature is written here:

| Site | New signature (the text BUILD writes) | Where its argument comes from |
|---|---|---|
| `apps/runner/src/dev-api-environment.ts:310` | `function isExactProviderRuntimeRefresh(existing: string, expected: string, configuredProviders: readonly DevelopmentConfiguredProvider[]): boolean` | the `:493` closure |
| `apps/runner/src/dev-api-environment.ts:336` | `function isExactPublishedRegisterRefresh(existing: string, expected: string, configuredProviders: readonly DevelopmentConfiguredProvider[], heldConfiguredProviderSets?: ReadonlyMap<string, readonly string[]>): boolean` | the `:493` closure (both values) |
| `apps/runner/src/dev-api-environment.ts:376` | `function isExactProviderRuntimeRefreshWithLegacyProbeTimeout(existing: string, expected: string, configuredProviders: readonly DevelopmentConfiguredProvider[]): boolean` | the `:493` closure; it forwards to `isExactProviderRuntimeRefresh` |
| `apps/runner/src/dev-api-environment.ts:387` | `function isExactLegacyEnvironmentWithoutSupportModelTarget(existing: string, expected: string, configuredProviders: readonly DevelopmentConfiguredProvider[]): boolean` | the `:493` closure |
| `apps/runner/src/dev-api-environment.ts:493` (the closure inside `assembleDevelopmentApiEnvironment`, `:409`) | `(existing) => isExactProviderRuntimeRefresh(existing, source, input.providerPanel.configuredProviders) \|\| … \|\| isExactPublishedRegisterRefresh(existing, source, input.providerPanel.configuredProviders, input.heldConfiguredProviderSets) \|\| …` | `input` — the ONLY scope in this file that has it |
| `apps/runner/src/dev-api-process.ts:159` | `function validateExactEnvironment(values, repositoryRoot: string, registerReceipt): void` — **unchanged**; `:166` becomes `parseDevelopmentProviderPanelTargets(values.PROVIDER_DISCOVERY_TARGETS_JSON!, loadModelConfigConfiguredProviders(repositoryRoot))` | `repositoryRoot`, already its second parameter |
| `apps/runner/src/dev-runner-process.ts:55` | `function createRunnerEnvironment(commandEnvironment, apiEnvironment, repositoryRoot: string)` — **gains a third parameter**; `:59` and `:62` both take the derived set | its one caller, `:133` `input.operations.startRunner(createRunnerEnvironment(…))`, inside `startDevelopmentRunnerProcess` (`:125`), whose `input` carries `repositoryRoot` |

`loadModelConfigConfiguredProviders(repositoryRoot)` is one exported helper in
`@debateai/model-config` returning the `configuredProviders` projection for the committed file, so the
two process entry points do not each re-derive it.
Done when: `tsc --noEmit` reports no diagnostic in the files above, **and** the threading is measured
by ONE build, named here because two are possible (N1-p2). Measured in the lane at `9a000c37`,
`apps/runner/src/dev-api-environment.ts` exports exactly three things — `:29`
`DEVELOPMENT_API_ENVIRONMENT_KEYS`, `:73` the receipt type, `:409` `assembleDevelopmentApiEnvironment` —
so **all four predicates are module-private and no test can import one.** The build is therefore:
**drive it through `assembleDevelopmentApiEnvironment` (`:409`)**, not by exporting the predicate, which
would widen a module surface this plan does not authorise. The case writes an outgoing `api.env` whose
`PROVIDER_DISCOVERY_TARGETS_JSON` names the five current refs, calls `assembleDevelopmentApiEnvironment`
with an `input.providerPanel.configuredProviders` that does NOT contain them, and asserts the OUTCOME —
`DEV_API_ENVIRONMENT_DRIFT` is thrown and the file on disk is byte-identical to what it was.
**What this case catches and what it does not** (N1-p2's second half): it catches a predicate that
IGNORES its new parameter. It does **not** catch one that keeps the old module-level set as a
DEFAULT value — that build passes this case, because the caller supplies the argument. The default is
caught instead by the source-text case S21 adds to `tests/architecture/dev-real-provider-only.test.ts`
(above), which measures that each call site passes the argument, and by S25's ban on reading the file at
module load.
RED if omitted: `dev-api-environment.ts:318` validates the OUTGOING api.env against a **static**
five-slot set, so after an entry-set edit the drift predicate answers about a set the deployment no
longer configures — the silent-wrong-answer failure, caught by S34's legitimate-removal case.

**S22. The relay starts follow the `cli:` entries, and the alias derivation is deleted (R9, R18).**
Files — Modify: `apps/runner/src/dev-cli-provider-panel.ts:27-35, 49-97, 99-150`; Modify:
`tests/unit/dev-cli-provider-panel.test.ts`.
`DevelopmentCliProviderPanelOperations.starts` stops being a fixed 5-tuple and becomes
`readonly DevelopmentCliRelayStart[]`, one per `cli:` slot in slot order. `DEVELOPMENT_CLI_MODEL_PINS`,
`rosterModel` (`:99-103`) and `claudeAlias` (`:105-110`) are **deleted**; each start is given the
entry's full `model` id, so the Claude relay is asked for `claude-opus-5` and never for `opus` (F10).
An `api:` slot starts no process and is allocated no port (R10).
Done when: `tests/unit/dev-cli-provider-panel.test.ts` — 6/6 at base — deletes the two alias cases and
the prefix-match case and gains three full-id cases; the delta is named case by case in §5. A case
asserts that starting a panel over R7's file calls exactly **three** starts, and that the
`startClaudeRelay` argument is `{ model: "claude-opus-5" }` with no `modelAlias` key.
RED if omitted: the Claude case reports `modelAlias: "opus"`.

**S23. The tier lists become a register row (R16, R24).**
Files — Modify: `apps/runner/src/dev-deployment-register.ts:322, :472, :498, :509, :618, :656`;
Modify: `tests/integration/dev-deployment-register.test.ts`; Modify: `tests/support/registerFixtures.ts`;
Modify: `tests/architecture/register-support-publication.test.ts`; Modify:
`tests/integration/register-support-publication.test.ts`; Modify:
`tests/integration/production-database-principals.test.ts`.
`buildDevelopmentDeploymentRegisterRows` gains a second row beside `configuredProviderSet`:
`{ rowKey: "planTierRosters", value: { kind: "PLAN_TIER_ROSTERS", free: [...], premium: [...] }, sourceRef: DEVELOPMENT_SOURCE_REF }`
(**CONTAINS** — the row object's shape beside the existing `configuredProviderSet` row; the surrounding
list also carries `DEVELOPMENT_DEPLOYMENT_REGISTER_STATIC_ROWS`), taking the ids in file order.

**The value is built from the FILE, never from the panel's targets.** A keyless slot's target carries
the sentinel model (R31), so a `planTierRosters` derived from `providerPanel.targets` would change the
moment V placed a key — republishing the register on an event that is not a file edit, which is exactly
what R14.2 forbids and what S29 pins. The source is the `ModelConfig`.

**How it reaches the row builder — one signature line per function** (the same discipline B1 forced on
S21; without it this step re-creates B1's defect in a new file). `buildDevelopmentDeploymentRegisterRows`
takes only `providerPanel` today, and the four functions above it pass only `(bootstrap, providerPanel)`:

| Function | New signature |
|---|---|
| `dev-deployment-register.ts:322` | `buildDevelopmentDeploymentRegisterRows(providerPanel, planTierRosters: Readonly<Record<PlanTierWord, readonly string[]>>)` |
| `:472` | `developmentRows(bootstrap, providerPanel, planTierRosters)` — forwards at `:490` |
| `:498` | `expectedRunnerRows(bootstrap, providerPanel, planTierRosters)` — forwards at `:502` |
| `:509` | `buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, providerPanel, planTierRosters)` — forwards at `:513` |
| `:618` | `publishDevelopmentDeploymentRegisterProviderSet({ …, planTierRosters })` — forwards at `:631` |
| `:656` | `seedDevelopmentDeploymentRegister({ …, planTierRosters })` — forwards at `:673` |

The two entry points take it in their input object, supplied by their CLIs from `loadModelConfig`
(`dev-provider-set-publish-cli.ts:18`, `dev-deployment-register-cli.ts:13` — both in C3's surface).

**The pinned deterministic v4 snapshot moves, and the sweep is four assertions in three suites**
(F-ARCH-4 — a break this plan missed at pass 1 and the verdict did not reach). The publication digest
is a function of the rows, so a new row changes it. `tests/support/registerFixtures.ts:22` declares
`DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 = "42b90bca671d96d6e1c53de5c3115ca2ab7a5e11b33ad0d9eb0437f44a32c6eb"`,
and its own comment records that S02 moved it on 2026-09-12 for precisely this kind of change (*"Moved
2026-09-12 when the development provider set grew from one slot per maker to one per plan-tier roster
member … The previous three-slot snapshot was 120bdfea9776cff5…"*) — so moving it is the established,
documented practice, not a new liberty. Every member:

1. `tests/support/registerFixtures.ts:22` — the constant itself, recomputed, with a new dated comment
   naming the previous value (the convention the existing comment set).
2. `tests/architecture/register-support-publication.test.ts:356-357` — asserts the constant equals a
   **literal** hash; the literal moves with it. (Case *"pins the exact pre-migration legacy v1 and
   deterministic test-panel v4 snapshots"*.)
3. `tests/architecture/register-support-publication.test.ts:368` — `expect(developmentRows).toHaveLength(32)` → **33**;
   `:370-371` re-compares the digest. (Case *"preserves the exact legacy hashes while the actual port
   input owns all 248 policy decimals"*.)
4. `tests/integration/register-support-publication.test.ts:322` and `:337` (the latter seeds a row
   `{ register_version: "4", snapshot_sha256: … }`), and
   `tests/integration/production-database-principals.test.ts:2754`.

`LEGACY_REGISTER_V1_SNAPSHOT_SHA256` (`registerFixtures.ts:16`) and the 14-row historical count do
**not** move: they pin the pre-migration bootstrap, which this slice does not touch. A change to that
constant is a defect of this step.
**`tests/architecture/register-support-publication.test.ts` keeps its `12/14`** — SPEC R27 says delta
zero for it, and delta zero holds only because members 2 and 3 move in the same change; a seat that
adds the row and leaves the constant takes that suite to 11/14 and has caused a regression.
Done when: the publication row count moves from 32 to **33** — asserted, not recalled: the criterion is
that `buildDevelopmentDeploymentRegisterPublicationRows(...)` returns a list whose length is
`previousLength + 1` and whose row keys contain `planTierRosters` exactly once, which
`dev-deployment-register.ts:503-505` already guards against duplication via
`DEV_RUNNER_REGISTER_DEFINITION_INVALID`; a case asserts the row's `free`/`premium` arrays deep-equal
the file's; and all four sweep members above are updated in the same change.
RED if omitted: S24's `/new` fetch finds no `planTierRosters` row and renders an empty tier list; and
if the row is added without the sweep, `register-support-publication.test.ts` drops to 11/14.

**S24. `/new` reads the lists from the deployment payload (R16, R23.5).**
Files — Modify: `apps/ui/app/new/page.tsx:10, 199-210`; Modify:
`tests/render/tier01-new-plan-tier.test.tsx`.
The `PLAN_TIER_ROSTERS` import at `:10` is deleted. The page calls
`contractClient.readDeployment()` and reads
`deployment.register.rows.find((row) => row.row_key === "planTierRosters")`, the idiom
`apps/ui/app/new/defaults.tsx:27` already uses for `riskTier`. No new route, no new client method,
and `DeploymentSchema` is unchanged — a register row's value is already carried through it (M4).
**The lists shown are the FILE's, never the healthy panel's** (R16, R23.5): the page reads the
register row, which S23 fills from the file, and never `discovered_panel`.
Done when: `tests/render/tier01-new-plan-tier.test.tsx` — 22/22 at base — feeds the tier lists through
a deployment fixture carrying a `planTierRosters` row instead of importing the compiled roster; its 9
literal ids take the new Free pair; a case asserts the Free card renders `gpt-5.6-luna` and
`glm-5.3-flash` and that `claude-sonnet-5` appears nowhere in the markup; and a case asserts each of
the five ids renders a non-empty name and a `--dot` custom property (R17 — `glm-5.3-flash` falls to
the `default` family of `apps/ui/lib/models.ts:26-35`, so the dot is `var(--m-default)` and the name is
the raw id; what fails this case is a blank dot, an empty name or a throw). It stays 22/22 or gains cases.
RED if omitted: the render case reports `claude-sonnet-5` in the markup.

**S25. The restart command checks the file before it touches anything (R19, R21, R22).**
Files — Modify: `apps/runner/src/dev-auth-stack.ts:58-72, 138-180, 240-250`; Modify:
`tests/unit/dev-auth-stack.test.ts`.
A stage `checkModelConfig()` is added as the **first** stage, ahead of `isPublicPortOccupied`
(`:141`). It calls `loadModelConfig(repositoryRoot)` and converts a `ModelConfigShapeError` into
`DEV_AUTH_STACK_MODEL_CONFIG_INVALID`, printed as one line per refused entry naming **the tier, the
entry's `model` value and the class number**, and no key value.
**The slot catalogue must not read the file at module load**, or a malformed file would throw at
`import` of `dev-auth-stack.js` — before stage 0 could name the class. The catalogue stays a static
constant (S18) and the file is read only through `loadModelConfig`, called by the stage.
Done when: a case asserts the stage order array starts with `checkModelConfig`; a case with a
class-2 fixture asserts the process exits non-zero, that the message contains the tier word, the model
id and the class number, and that it contains neither `sk-` nor `Bearer` nor the string `OPENAI_API_KEY=`;
and **the nothing-is-rewritten invariant is measured, not asserted** (R21): the case takes a `sha256`
of the fixture `api.env` before and after, asserts the two digests are equal **without reading the
file's contents into the assertion message**, asserts no `publishGeneral` call was made, and asserts
no relay start was called.
Guard order: `checkModelConfig` precedes `isPublicPortOccupied` (`:141`), which precedes
`startProviderPanel` (`:148`), which precedes `startSupportModelRelay` (`:153`),
`startDataPlane` (`:158`), `provisionHatchetToken` (`:166`) and `assembleApiEnvironment` (`:170`) —
the order measured this pass. A shape refusal at stage 0 therefore reaches none of them, which is
what makes "nothing rewritten and nothing stopped" a property of the stage list and not of a rollback.
RED if omitted: the class-2 case reports exit code 0 and a changed `api.env` digest.

**S26. The two availability classes start the stack with the slot absent and a named warning (R31, R32, V-38).**
Files — Modify: `apps/runner/src/dev-auth-stack.ts`; Modify: `apps/runner/src/dev-provider-panel.ts`;
Modify: `tests/unit/dev-auth-stack.test.ts`.
For an `api:` slot, the stack reads the variable named by the entry's `key:` from
`.local/dev-auth/provider-keys.env` under the custody checks (S27). If the file is absent, the
variable is absent, or its value is empty — class **(a)** — or if the slot's probe fails or echoes a
different `model` (R30) — class **(b)** — the slot's observation is built with the sentinel model
`DEVELOPMENT_UNAVAILABLE_CLI_MODEL` and **no** `authorizationHeader`.
That shape is not a choice: `dev-provider-panel.ts:103-108` throws
`DEV_CLI_PROVIDER_PANEL_TARGET_INVALID` unless a target is (healthy **and** credentialed) or
(sentinel **and** uncredentialed), and `:120-122` builds `healthyProviderRefs` by excluding exactly the
sentinel-model targets. The constant keeps its spelling (`SPEC-v3.md:466-468` puts the rename out of scope).
Done when: two cases, one per class, each asserting (1) exit code 0, (2) the slot is present in
`panel.configuredProviders`, (3) the slot is absent from `panel.healthyProviderRefs`, (4) exactly one
warning line names the tier, the entry's `model` and which of (a)/(b) applied, and (5) the warning
contains no key value; plus the **R32 case**: with R7's merged file and **no**
`.local/dev-auth/provider-keys.env` at all, the stack starts, all five slots are configured, the three
Premium refs are healthy, and both Free refs are absent from the healthy panel with one warning each.
Guard order: `buildDevelopmentProviderPanel`'s set check (`:95-97`
`DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`) fires before the base-URL check (`:100-101`, same code),
which fires before the credential-shape check (`:104-108`
`DEV_CLI_PROVIDER_PANEL_TARGET_INVALID`). A case that means to observe the credential shape must
supply the full slot set at the right base URLs, or it observes one of the two earlier guards under a
different code.
RED if omitted: the class-(a) case reports a thrown `DEV_CLI_PROVIDER_PANEL_TARGET_INVALID`.

**S27. Key custody, read once, never printed (R12).**
Files — Create: `apps/runner/src/dev-provider-keys.ts`; Modify: `tests/unit/dev-auth-stack.test.ts`.
`readProviderKeys(repositoryRoot)` reads `.local/dev-auth/provider-keys.env` under the custody shape
`readGlmCredential` already asserts for the Hermes store (`acceptance/hermes-relay.ts:33-54`,
re-measured at Revision 2 under N1 — the file is 168 lines and the pass-1 citation `:248-258` was read
off a measurement log): the directory is not a symlink, is owned by the running uid and
is mode `0700`; the file is not a symlink, is owned by the running uid, is mode `0600`, and has
`nlink === 1`. A missing file returns an empty map (class 31(a)), not a throw. Wrong custody throws
`DEV_PROVIDER_KEYS_CUSTODY_INVALID`.
**No seat writes this file, reads its values, or prints it** — V places the keys (ruling R-S03-1,
rows V-34/V-35). Every test writes its own fixture under a `mkdtemp` root and never touches
`.local/`.
Done when: cases assert a `0644` file and a hard-linked file each throw
`DEV_PROVIDER_KEYS_CUSTODY_INVALID`; a `0600` fixture returns the variable names it declares; an
absent file returns an empty map; and a source-text case asserts `dev-provider-keys.ts` contains no
`console.log` and no template literal interpolating a map value.
RED if omitted: the `0644` case returns a map.

**S28. A published removal is told from a stale reconstruction by what the register holds (R25, C14).**
Files — Modify: `apps/runner/src/dev-api-environment.ts:336-374, 409-411, 489-497`; Modify:
`apps/runner/src/dev-auth-stack.ts:271-275`; Modify: `tests/integration/dev-api-environment.test.ts`.
`assembleDevelopmentApiEnvironment` gains one optional input,
`heldConfiguredProviderSets?: ReadonlyMap<string, readonly string[]>` — register version text → the
`provider_ref` values that version's `configuredProviderSet` row names, supplied by the publication
stage, which is the only code with the pool.
**How it reaches the predicate (corrected at Revision 2 under B1):** `isExactPublishedRegisterRefresh`
is a module-scope function taking two strings (`dev-api-environment.ts:336`) and cannot see `input`.
It takes the map as its **fourth parameter**, and the closure at `:493` — the only scope in the file
that holds `input` — supplies `input.heldConfiguredProviderSets` alongside S21's
`input.providerPanel.configuredProviders`. The full signature is the one written in S21's table; the
two steps edit the same four signatures and **S21 is the single writer of those lines**, with S28
adding only the fourth parameter's use inside the body.
The map arrives at `assembleDevelopmentApiEnvironment` from `dev-auth-stack.ts:271-275`
`assembleApiEnvironment(providerPanel, registerReceipt, supportModelTarget)`, which gains a fourth
argument from the publication stage that just ran. `isExactPublishedRegisterRefresh` keeps its
additive-only rule and gains **one** further admission: the outgoing environment's `REGISTER_VERSION`
is a key of that map **and** the outgoing file's `provider_ref` set, as a set, equals that version's
refs exactly.
**Why the map and not a database read:** the eleven cases of
`tests/integration/dev-api-environment.test.ts` are filesystem fixtures with no pool
(`tests/integration/dev-api-environment.test.ts:1-30`), and
`publishExactFile`'s `acceptPreviousSource` is a synchronous predicate
(`dev-api-environment.ts:269-270`). A map is data the caller already holds; a pool would make eleven
green cases need a database.
The map is bounded: the publication stage reads at most the newest 64 `configuredProviderSet` rows.
Done when: (1) the pin `rejects v4 reconstruction and removed-provider fallback`
(`tests/integration/dev-api-environment.test.ts:348-360` — **`:348` is the LANE's line**; SPEC-v3 R25
and the ARCH packet both say `:352`, which is the MAIN tree's number and four lines off after
`4df0b2b5`, re-measured at Revision 2 under N1/P1) **keeps its case and its assertion text** — it
passes no map, so the outgoing version `4`
is in no map and the refusal is unchanged; (2) a **new** case passes a map
`{ "424241": [the five current refs] }` (**EXACT** — the map passed to the call has this one entry
and no other), writes an outgoing env at version `424241` naming exactly
those five, assembles an incoming env at `424242` naming four of them, and asserts the result is
`reused: false` with no throw; (3) a **new** case passes the same map but an outgoing env whose ref
set is the five **plus** `development:local-vllm`, and asserts `DEV_API_ENVIRONMENT_DRIFT`.
Guard order on the same operation: `publishExactFile` compares the two sources for byte equality
(`:268`) before consulting any predicate; the predicate chain at `:493-496` runs
`isExactProviderRuntimeRefresh` **first**, then the legacy-probe-timeout variant, then
`isExactPublishedRegisterRefresh`, then the legacy-without-support-target variant. A removal case must
therefore differ in a key that `isExactProviderRuntimeRefresh` compares (it skips only
`PROVIDER_DISCOVERY_TARGETS_JSON` and `SUPPORT_MODEL_TARGET_JSON`, `:314-317`) — the moved
`REGISTER_VERSION` is that key — or the first predicate admits it and the new admission is never
observed. **This is the single likeliest false-green in the slice.**
RED if omitted: case (2) throws `DEV_API_ENVIRONMENT_DRIFT`.

**S29. A key arriving publishes no version (R14.2, R24).**
Files — Modify: `tests/integration/dev-deployment-register.test.ts`; Modify:
`tests/integration/dev-api-environment.test.ts`.
No production change: S19 already makes the ref independent of the key, so the configured set is
byte-identical before and after a key appears, and the change is confined to
`PROVIDER_DISCOVERY_TARGETS_JSON` — the same-version path
`isExactProviderRuntimeRefresh` (`:310-318`), first in the chain at `:493`.
Done when: a case builds the publication rows for R7's file with no keys and with both keys and
asserts the two row lists are deep-equal (so `publishGeneral`'s snapshot digest, and therefore the
version, cannot move); and an api.env case writes an outgoing env with two sentinel Free targets,
assembles an incoming env at the **same** `REGISTER_VERSION` with the two targets carrying models and
authorization headers, and asserts `reused: false` with no throw.
RED if omitted: the deep-equal case reports two different row lists, which is the Build B the pass-3
verdict rejected (`DECISIONS.md`, 2026-09-13, B1(p2) member (ii)).

**S30. An entry-set change publishes a new version, including a smaller one (R24).**
Files — Modify: `tests/integration/dev-deployment-register.test.ts`.
Done when: a case builds the rows for R7's file and for the same file with the `grok` entry removed
from `premium:`, asserts the two `configuredProviderSet` rows differ, asserts the second names four
refs, and asserts nothing in the publication path rejects the smaller set (F7: nothing in the database
forbids it). It stays 11/11 or gains cases.
RED if omitted: nothing shows that a smaller set publishes.

**S31. The panel's base-URL gate admits an `api:` slot (R11b) — the edit S15 names.**
Files — Modify: `apps/runner/src/dev-provider-panel.ts:87-89, 100-101`.
`expectedBaseUrl(port)` applies to a **CLI** catalogue row only. For an `api:` row the observed base
URL must equal the entry's `base_url` as `normalizedProviderBaseUrl` returns it.
**R11's sixth refusal survives and stays an observation:** a `cli:` slot whose observed base URL is
not that slot's loopback port still throws `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`. No file
fixture can produce it, because an R3 CLI entry has exactly the keys `cli` and `model` (N1(p2)) — so
it is tested as a panel-build case, never as a file fixture.
Done when: a case builds a panel whose `development:zai-free-api` observation carries
`https://api.z.ai/api/coding/paas/v4` and asserts no throw; a case with a `cli:` observation at
`http://127.0.0.1:9999/v1` asserts `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`; and a case with an
`api:` observation whose base URL is not the entry's asserts the same code.
Guard order: `byRef.size !== catalogue length` (`:95-97`) fires first under the **same** code as the
base-URL check (`:100-101`). A case meaning to observe the base-URL rule must supply the complete slot
set, or it observes the set check under a code that does not distinguish them — and would pass while
the base-URL rule was deleted.
RED if omitted: the Z.ai case throws `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID`.

**S32. `tests/integration/dev-provider-panel.test.ts` is re-fixtured to the live slot set.**
Files — Modify: `tests/integration/dev-provider-panel.test.ts`.
**This suite is RED at base in the lane — 2/3 — and SPEC-v3 R27's table omits it.** Measured this
pass at `9a000c37`, 0 dirty: the case *"loads the exact live CLI targets without changing the fixed
maker order"* fails with *"expected [ 'development:codex-cli', …(3) ] to deeply equal
[ 'development:codex-cli', …(1) ]"* — it expects two refs and the panel returns four. Cause: the
suite was last touched `7b3a3063` (2026-08-28) while `apps/runner/src/dev-provider-panel.ts` went to
five slots in `6a05a0d0` (2026-09-13, the S02 ops commit). **Pre-existing, caused by S02, not by S03**
— a finding on R27 (see §6).
Done when: the suite's fixture is the five live slots of S20's order and it reports **3/3**.
RED if omitted: the cluster command stays `Tests 1 failed | 55 passed (56)`.

**S33. `tests/support/developmentProviderPanel.ts` and `tests/support/registerFixtures.ts` move with the provider set.**
Files — Modify: `tests/support/developmentProviderPanel.ts`, `tests/support/registerFixtures.ts`.
Done when: `TEST_DEVELOPMENT_PROVIDER_PANEL` is built over the five live slots in S20's order and
every suite importing it (`tests/integration/dev-api-environment.test.ts:23-24` and the register
suites) passes; the pinned dev-register snapshot takes the 33-row count of S23.
RED if omitted: `dev-api-environment.test.ts` fails at import with
`PROVIDER_DISCOVERY_TARGET_SET_MISMATCH`.

**S34. `dev-real-provider-only` keeps its seam assertions under the new slot set (R26, R27).**
Files — Modify: `tests/architecture/dev-real-provider-only.test.ts:27-41`.
Done when: the five `toContain` ref assertions (`:27-31`, re-measured at Revision 2 under N1 — the
file is 54 lines; the pass-1 citations `:218-222` / `:227-236` were read off a measurement log) become
the five **live** refs of S20's order; the GLM case (`:41-42`) keeps `expect(panel).not.toContain("hermes-glm-5.3-flash")`
and `not.toContain("startHermesSupportRelay")` **unchanged** and gains one sentence of intent: a
`glm-5.3-flash` **debate** entry now exists under its own ref (`development:zai-free-api`), on a
different port, from a different credential, and this slice edits none of the support seam's files
(F9/R26). It stays 3/3.
RED if omitted: the ref assertions report the two retired refs as live.

### Cluster S03-C4 — the admission surface and its suites

**S35. Admission is unchanged; only its fixtures move (R15).**
Files — Modify: `tests/unit/tiers-s02-admission.test.ts`, `tests/unit/tiers-s02-wire.test.ts`,
`tests/unit/api.test.ts`.
**No product edit.** `evaluateAskAdmission` (`apps/api/src/index.ts:1196-1259`) already filters the
discovered panel to the tier's list in list order (`:1215-1217` as measured), refuses with
`ASK_PLAN_TIER_MODEL_UNAVAILABLE` naming **every** missing id (`:1218-1228`) **before**
`assertMakerAdmission` (`:1239`), passes `panelSize = filteredPanel.length` (`:1248`) and persists
exactly those members (`:1256`). It reads `PLAN_TIER_ROSTERS`, which S9 makes file-fed, so the new
lists arrive with no code change.
Done when: the 36 literal ids in `tiers-s02-admission` take the new Free pair; every R15 behaviour
assertion stands; and a case asserts that with a discovered panel containing neither Free id, a Free
ask is refused with `ASK_PLAN_TIER_MODEL_UNAVAILABLE` whose message names **both** `gpt-5.6-luna`
and `glm-5.3-flash`, and that no run is created.
Guard order: the tier-vocabulary check (`:1207-1211` `ASK_PLAN_TIER_INVALID`) fires before the
roster filter; `assertMakerAdmission` (`:1239`) fires after. A case meaning to observe the
missing-model refusal must send a **valid** tier word, or it observes `ASK_PLAN_TIER_INVALID`; and it
must leave at least the shape that reaches `:1218`, or a maker refusal would be the observed code on
a different invariant.
RED if omitted: the refusal-message case reports `claude-sonnet-5`.

**S36. `pnpm typecheck` gains no diagnostic outside BASELINE.md's pins (R29).**
Files — none.
Done when: `pnpm typecheck` is captured at base and after, and the **delta** is asserted file by file;
it is RED at base from other missions (`00-intake-S03.md:83`, 15 baseline errors), so the absolute is
never claimed. A new diagnostic in a file BASELINE.md does not pin is a defect of the cluster that
introduced it.
RED if omitted: nothing separates an inherited error from a new one.

---

## 2. Clusters — BUILD units, one verification command each

Clusters are the smallest step-groups verifiable independently. Each is a BUILD node with ONE
command, run three times, worst run wins. **The review unit is the whole slice** (`REV(S03)`), never
a cluster: no cluster waits on a review.

Every command below was **RUN by me at base in the lane** (`9a000c37`, 0 dirty) from
`scratchpad/seats/ARCH-S03/c-base-verdicts.sh`, `c-base-v2.sh` and `c-base-v3.sh`; the logs sit beside
them. Paths a step CREATES are omitted from the base run and named in the "new paths" column, per the
packet's verification rule.

| Cluster | Steps | Files it may touch | Verification command (one) | Base verdict (measured, 3 runs not needed at base — a single run is the record of the START state) | Depends on |
|---|---|---|---|---|---|
| `S03-C1` | S1–S13 | `config/models.yaml` · `packages/model-config/{package.json,tsconfig.json,src/index.ts,src/load.ts,src/shape.ts,src/generate-plan-tier-rosters.ts}` · `packages/contract/src/plan-tiers.ts` · `packages/contract/generated/plan-tier-rosters.ts` (generated, gitignored) · `package.json` (repo root) · **`pnpm-lock.yaml`** (tracked; `pnpm install` rewrites it when S1's package and its `yaml` dependency appear — N6-p2) · `docs/architecture/01-decisions/ADR-NNNN-tier-fleet-configuration-file.md` (number measured at write time) · `tests/architecture/tier01-roster.test.ts` · `tests/architecture/tiers-s02-rosters.test.ts` · `tests/architecture/model-config-no-secret.test.ts` (new) · `tests/unit/model-config-{file,shape,tiers}.test.ts` (new) — **18 paths**. `tests/architecture/dev-deployment-register.test.ts` is **NOT** here: it moved to C3 at Revision 3 (B1-p2), and S10's ordering case moved with it into `tier01-roster.test.ts`. | `LANG=en_US.UTF-8 npx vitest run tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts tests/unit/model-config-file.test.ts tests/unit/model-config-shape.test.ts tests/unit/model-config-tiers.test.ts tests/architecture/model-config-no-secret.test.ts` | **GREEN at base over the two existing paths** (re-run at Revision 3, after `dev-deployment-register.test.ts` moved to C3): `Test Files 2 passed (2)` · `Tests 5 passed (5)` · rc=0. New paths omitted at base and created by S2/S4/S6/S7: `model-config-file`, `model-config-shape`, `model-config-tiers`, `model-config-no-secret`. | — |
| `S03-C2` | S14, S16, S17 | `packages/providers/src/index.ts` · `apps/api/src/provider-discovery.ts` · `tests/unit/api-provider-discovery.test.ts` · `tests/unit/provider-base-url-admission.test.ts` (new) · `tests/unit/provider-discovery-uncredentialed.test.ts` (new) — **5 paths**. `tests/unit/provider.test.ts` is in the command and NOT in the surface: it never calls `normalizedProviderBaseUrl` and its `/v1` endpoints are gateway fixtures, so S14 cannot move it — run-but-not-written, verified harmless (N4-p2). | `LANG=en_US.UTF-8 npx vitest run tests/unit/api-provider-discovery.test.ts tests/unit/provider.test.ts tests/unit/provider-base-url-admission.test.ts tests/unit/provider-discovery-uncredentialed.test.ts` | **GREEN at base over the two existing paths** (re-run at Revision 2): `Test Files 2 passed (2)` · `Tests 14 passed (14)` · rc=0. New paths omitted at base: `provider-base-url-admission` (S14), `provider-discovery-uncredentialed` (S17). | — |
| `S03-C3` | S18–S23, S25–S34 | `apps/runner/src/{dev-provider-panel,dev-cli-provider-panel,dev-auth-stack,dev-api-environment,dev-deployment-register,dev-api-process,dev-runner-process}.ts` · `apps/runner/src/dev-provider-keys.ts` (new) · the four CLIs S21's signature change breaks — `apps/runner/src/{dev-deployment-register-cli,dev-auth-data-plane-cli,dev-api-environment-cli,dev-provider-set-publish-cli}.ts` · `tests/support/{developmentProviderPanel,registerFixtures}.ts` · **`tests/architecture/dev-deployment-register.test.ts`** (C3's, and only C3's — B1-p2: S21 breaks its `:14` call-text assertion) · `tests/architecture/{dev-real-provider-only,register-support-publication}.test.ts` · `tests/integration/{dev-provider-panel,dev-deployment-register,dev-api-environment,register-support-publication,production-database-principals}.test.ts` · `tests/unit/{dev-auth-stack,dev-cli-provider-panel}.test.ts` — **24 paths**. Of the **nine** test files in the command, **eight** are in the surface; `tests/architecture/dev-runner-provider-set.test.ts` is run-but-not-written — it imports `createRunnerProviderTopology` and builds its own targets, referencing none of the symbols S21 re-signs, so no step can move it (N4-p2, verified harmless). | `LANG=en_US.UTF-8 npx vitest run tests/unit/dev-cli-provider-panel.test.ts tests/unit/dev-auth-stack.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/dev-deployment-register.test.ts tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts tests/architecture/dev-deployment-register.test.ts tests/architecture/dev-runner-provider-set.test.ts tests/architecture/register-support-publication.test.ts` | **RED at base, 3 failures, all pre-existing** (re-run at Revision 3): `Test Files 2 failed \| 7 passed (9)` · `Tests 3 failed \| 67 passed (70)` · rc=1. **The three base failures by title:** (1) `dev-provider-panel.test.ts` → *"loads the exact live CLI targets without changing the fixed maker order"* (2026-09-13 `6a05a0d0`, closed by S32); (2) and (3) `register-support-publication.test.ts` → *"recognizes hostile static SQL concatenation…"* and *"classifies every register relation access…"* (2026-09-12, SPEC R27 delta zero). **The expected AFTER set, by title (N3-p2):** exactly `2 failed` — titles (2) and (3) only, and title (1) GONE. **A seat reading `3 failed` after C3 is RED**, whichever title remains: if (1) survives, S32 is unfinished; if a `register-support-publication` title count rises, S23's digest sweep is unfinished. No path in this command is new. | `S03-C1` (S21 and S25 call `loadModelConfig`) |
| `S03-C4` | S24, S35, S36 | `apps/ui/app/new/page.tsx` (**added at Revision 2 under B2.1** — S24 modifies it and the destination row never received it) · `tests/render/tier01-new-plan-tier.test.tsx` · `tests/unit/tiers-s02-admission.test.ts` · `tests/unit/tiers-s02-wire.test.ts` · `tests/unit/api.test.ts` — **5 paths** | `LANG=en_US.UTF-8 npx vitest run tests/render/tier01-new-plan-tier.test.tsx tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts tests/unit/api.test.ts` | **GREEN at base** (re-run at Revision 2): `Test Files 4 passed (4)` · `Tests 64 passed (64)` · rc=0. No path is new. | `S03-C1` (the new ids arrive through `PLAN_TIER_ROSTERS`) |

**Every column above is DERIVED, not written by hand** (Revision 2, under B2).
`scratchpad/seats/ARCH-S03/surfaces.mjs` parses §1, takes only the paths that follow a `Create:` or
`Modify:` marker in each step's `Files` line — a path a step merely *cites* is not a write — maps each
step to its cluster, and prints the column plus a disjointness check. Its output is
`surfaces.log`: **18 / 5 / 24 / 5 paths and `none — every file sits in exactly one cluster`.**
**At Revision 3 it also carries a COMPLETENESS assertion (B1-p2), because a check that says "none" must
first prove it looked.** Every path-shaped token inside a `Files —` paragraph is either CAPTURED as a
declared write or explicitly CLASSIFIED a citation in a reviewed, step-keyed table in the script; any
other token is UNCLASSIFIED and the script **exits non-zero**. It prints its denominator:
**123 seen = 78 captured + 45 classified citations, 0 unclassified**, then `PASS`. That is what makes
the disjointness verdict meaningful — Revision 2's `none` was computed over a set that silently omitted
a declared write (`tests/architecture/dev-deployment-register.test.ts`, dropped when the marker-walk hit
S10's parenthetical), so the guarantee the plan rested on was void for exactly the file that needed it.
Re-run it after any step edit; a column that disagrees with it is the defect, not the script.
Running it is what found four omissions this revision fixed, three of them mine from pass 1 and one
introduced by B1's own fix — **S21 re-signs functions in `dev-api-process.ts` and
`dev-runner-process.ts` and its pass-1 `Files` line named neither**, which is B2's class recurring
inside B2's remedy. That is the reason the derivation is mechanical rather than a re-check.

**S24 crosses a cluster boundary and is assigned to one cluster.** It edits
`apps/ui/app/new/page.tsx` and `tests/render/tier01-new-plan-tier.test.tsx`, and it depends on S23's
register row, which is C3's. The single-writer rule decides it: **S24 is built in `S03-C4`**, whose
command already owns the render suite, and `S03-C4` therefore depends on `S03-C3` as well as `S03-C1`.
Both of its files are in C4's column above.

**Parallelism.** `S03-C1` and `S03-C2` have disjoint surfaces and run at once. `S03-C3` waits on
`S03-C1`. `S03-C4` waits on `S03-C1` and `S03-C3`. The critical path is C1 → C3 → C4.

**The RED test each cluster must show failing before its code exists:**
- `S03-C1`: `tests/unit/model-config-shape.test.ts`'s six class cases (S4) — each throws
  `ModelConfigShapeError is not a constructor` before `shape.ts` exists.
- `S03-C2`: `tests/unit/provider-discovery-uncredentialed.test.ts` (S17) — the recorded-URL array has
  length 5, not 3, before the skip exists.
- `S03-C3`: `tests/unit/dev-auth-stack.test.ts`'s class-2 refusal case (S25) — exit code 0 and a
  changed `api.env` digest before the stage exists.
- `S03-C4`: `tests/render/tier01-new-plan-tier.test.tsx`'s Free-card case (S24) — `claude-sonnet-5`
  present in the markup before the page reads the register row.

---

## 3. SPEC ↔ PLAN trace — every requirement is covered by at least one step

| SPEC | What it requires (one clause) | Step(s) | Cluster |
|---|---|---|---|
| R1 | `config/models.yaml` exists, is committed, is not rewritten by the reader | S3, S12 | C1 |
| R2 | exactly two top-level keys, each a list | S2, S4 (class 1) | C1 |
| R3 | CLI entry = `cli` + `model`, full model id | S2, S4 (class 2), S22 | C1, C3 |
| R4 | API entry = `api` + `model` + `base_url` + `key` | S2, S4 (class 2) | C1 |
| R5 | `key:` is a variable NAME; no secret in the file | S4 (class 4), S6 | C1 |
| R6 | ≥ 2 entries, ≥ 2 makers, ≤ 1 entry per maker, per tier | S4 (class 5) | C1 |
| R7 | the exact content at merge (Z.ai = the subscription endpoint), V's comments carried over | S12 | C1 |
| R8 | the file is the ONLY declaration — quoted-exact oracle, no allow-list — plus the positive limb in ONE suite | S9, S11, S13 | C1 |
| R30 | a key-based entry's `model` is an id its endpoint ECHOES exactly (F13) | S12 (the id), S26 class (b) | C1, C3 |
| R9 | a `cli:` entry is served by its local relay, unchanged | S22 | C3 |
| R10 | an `api:` entry is called directly over HTTPS with a bearer from the key file | S14, S26, S27 | C2, C3 |
| R11 | a remote HTTPS base URL is admitted; **six** refusals still refuse | S14 (five, URL gate), S31 (the sixth, panel gate) | C2, C3 |
| R12 | key-file custody (0600, owner, no symlink, nlink 1); never read, never printed by a seat | S27 | C3 |
| R13 | HEALTHY probe record whose `modelId` is the entry's id exactly (mechanism measured: F14) | S16 | C2 |
| R14 | the slot set = the file's entries on every machine, keyed or not · refs stable, a key arriving publishes NO version · order: Premium's `cli:` first | S18, S19, S20, S29 | C3 |
| R15 | admission unchanged from S02 R3–R10 with the new lists | S35 | C4 |
| R16 | `/new` shows the lists after edit + restart, no UI rebuild | S23, S24 | C3, C4 |
| R17 | every id renders with a non-empty name and a visible dot | S24 | C4 |
| R18 | CLI pins are full ids from the file; alias derivation removed | S22 | C3 |
| R19 | `pnpm dev:auth:up` checks the file before it changes anything | S25 | C3 |
| R20 | six SHAPE classes — refuse, always; one FILE fixture each | S4, S25 | C1, C3 |
| R21 | on a SHAPE refusal nothing is rewritten and nothing is stopped | S25 | C3 |
| R22 | the refusal names tier + model + class, and no key value | S25 | C3 |
| R31 | availability → the stack STARTS, the slot stays CONFIGURED (sentinel, no credential), leaves the HEALTHY panel only; the reason is named | S26 | C3 |
| R32 | the post-merge start on a machine with NO keys | S26 (the R32 case) | C3 |
| R33 | no request leaves the machine for a slot with no credential | S17 | C2 |
| R23 | the five surfaces named separately | S18+S19 (1), S21+S26 (2), S21 (3), S26 (4), S23+S24 (5) | C3, C4 |
| R24 | an ENTRY-SET change publishes a NEW version; a key arriving does not | S23, S29, S30 | C3 |
| R25 | api.env follows a real removal and still refuses a reconstruction | S28 | C3 |
| R26 | the support seam (ref, port 8794, credential) is untouched | S18 (the port-collision case), S34 | C3 |
| R27 | the baseline suites keep `passed/total` or the delta is named | S9, S11, S22, S24, S28, S29, S30, S32, S33, S34, S35 + §5 | all |
| R28 | a RED test per listed behaviour, shown failing first | every step's "RED if omitted" + §2's four cluster RED tests | all |
| R29 | `pnpm typecheck` gains no diagnostic outside BASELINE.md's pins | S36 | C4 |

**Reverse trace — every step to a requirement, no orphan.** S1 → R1 (the loader's home, enabling
R2–R6); S2 → R2/R3/R4; S3 → R1; S4 → R2–R6/R20; S5 → R20 class 3; S6 → R5/R12; S7 → R2 (the tier
vocabulary the file's two keys are checked against); S8–S10 → R8/R16/R27; S11 → R8/R27; S12 → R1/R7;
S13 → R8/R16; S14 → R10/R11; S15/S31 → R11; S16 → R13; S17 → R33; S18 → R14/R26; S19 → R14.1/R14.2;
S20 → R14.3; S21 → R23.1–3; S22 → R9/R18; S23 → R16/R24; S24 → R16/R17/R23.5; S25 → R19/R20/R21/R22;
S26 → R31/R32/R30; S27 → R12; S28 → R25; S29 → R14.2/R24; S30 → R24; S32 → R27; S33 → R27; S34 →
R26/R27; S35 → R15; S36 → R29. **Zero orphans, zero gaps, 33 requirements, 36 steps.**

---

## 4. Boundaries, DDD impact and ADRs

**Bounded contexts touched.**
- **Deployment configuration (new).** `@debateai/model-config` owns one invariant: *the file's text is
  a valid tier declaration, or it is refused by class*. It owns the domain terms **entry**,
  **transport** (`cli` | `api`), **maker word**, and **key variable**. It depends on `yaml` and
  `node:fs` and on nothing else in this repository — in particular not on `@debateai/contract` (S7),
  so the loader that feeds the wire is not a consumer of it.
- **The wire (`@debateai/contract`).** Keeps `PlanTierSchema`, `PLAN_TIERS` and the **name and home**
  of `PLAN_TIER_ROSTERS`; loses every model-id literal. It gains one import of a generated sibling and
  no new runtime dependency, which is what keeps it browser-safe (M1).
- **The development deployment (`apps/runner`).** Owns the slot catalogue, the ports, the relays, the
  key custody, the register publication and `api.env`. It is the only place that reads
  `config/models.yaml` at run time.
- **Discovery (`apps/api` + `packages/providers`).** Owns the probe and the base-URL grammar. It
  learns one new fact — that a target may have no credential — and one new behaviour, the skip (S17).

**Domain terms introduced:** *slot catalogue*, *configured-but-absent slot*, *shape class*,
*availability class*, *held configured provider set*.

**The single-writer rule.** No file appears in two clusters' surfaces; the one step that crossed a
boundary (S24) is assigned to one cluster in §2 and the dependency is stated.

**What must NOT be touched — the `forbidden` set every BUILD packet inherits:**
- `.local/**` in every form. `.local/dev-auth/provider-keys.env` is V's: **no seat writes it, reads
  its values, prints it, or tests against them** (R12, ruling R-S03-1). Every custody test writes its
  own `mkdtemp` fixture.
- The support seam (F9/R26): `acceptance/hermes-relay.ts`, `apps/api/src/support/model.ts`,
  `apps/runner/src/dev-support-model.ts`, port **8794**, the ref
  `development:hermes-glm-5.3-flash`, and `SUPPORT_MODEL_TARGET_JSON`. S18's port-collision case is
  the guard.
- The running `:3000` / `:8790` stack, and every provider: **no call, not even a probe.** F13 and F14
  are measured facts, cited from `00-intake-S03.md:58-59`, never re-measured by a seat.
- The main tree's other-mission dirt (133 entries on 2026-09-13). BUILD commits from the **lane**
  only — `TOOLING-TRAPS.md:3049` is the law and `6a05a0d0` is the instance that produced it.
- `SPEC-v3.md` and every earlier SPEC; `PROGRESS.md`; the intake; the V packet.
- Out of scope stays out (`SPEC-v3.md:459-468`): Premium's transport, production key management,
  billing, the support bot, the `-build` lineage, the composition formula, a `glm` identity colour,
  and the renaming of `DEVELOPMENT_UNAVAILABLE_CLI_MODEL`.

**ADRs.**
- **One new ADR is warranted: `docs/architecture/01-decisions/ADR-00NN-tier-fleet-configuration-file.md`**,
  where `NN` is **measured with `ls docs/architecture/01-decisions/` at write time and never
  pre-assigned**. Measured this pass the directory's highest is `ADR-0024`, so the next free number is
  **0025** — re-measure before writing, because another mission may take it first. Its subject is the
  decision that outlives the mission: *a deployment's model fleet is declared in one committed file,
  read by exactly one Node-only module, and reaches a browser only as a register row*. It records the
  three-route consequence of M1/M2, and the rule that a `provider_ref` is a function of
  `(tier, maker word)` and never of a model id — which is what keeps a configuration edit from
  republishing a register version.
- **ADR-0024 is touched but not superseded.** Its rejected alternative *"Mint `PLAN_TIERS` in
  `@debateai/kernel` now … Revisit when the roster declaration is next touched"* names this moment.
  It is **not** taken here: `SPEC-v3.md:459-468` does not put it in scope, S7 achieves the same
  guarantee with one cross-check test, and moving a vocabulary a frozen SPEC declares is a
  supersession this slice has no finding to justify. Recorded in `DECISIONS.md` so the next seat does
  not re-derive it.
- No other standing ADR changes. ADR-0011 (register mechanism) is relied on, not amended: S23 adds a
  row to an existing publication, and `dev-deployment-register.ts:503-505` already refuses a duplicate
  row key.

---

## 5. Verification list for the slice — what `REV(S03)` runs

Every suite below is reported as `passed/total`, **three runs, worst run wins**, with every failure
named and dated pre-existing or the slice's own. The baseline of record is
`.hermes/reports/debate-tiers/logs/setup-tiers-s03.log` **as corrected at its line 28**, and
`docs/missions/debate-tiers/BASELINE.md` for typecheck.

**1 — the integrated suite run (one command, the twelve of R27 plus the four R27 omits):**

```
LANG=en_US.UTF-8 npx vitest run \
  tests/architecture/tier01-roster.test.ts tests/architecture/tiers-s02-rosters.test.ts \
  tests/unit/tiers-s02-admission.test.ts tests/unit/tiers-s02-wire.test.ts \
  tests/render/tier01-new-plan-tier.test.tsx tests/unit/dev-cli-provider-panel.test.ts \
  tests/unit/dev-auth-stack.test.ts tests/integration/dev-deployment-register.test.ts \
  tests/integration/dev-api-environment.test.ts tests/architecture/dev-real-provider-only.test.ts \
  tests/architecture/register-support-publication.test.ts tests/unit/api.test.ts \
  tests/integration/dev-provider-panel.test.ts tests/architecture/dev-deployment-register.test.ts \
  tests/architecture/dev-runner-provider-set.test.ts tests/unit/provider.test.ts \
  tests/unit/api-provider-discovery.test.ts
```

`Test Files` is pinned as well as `Tests`: vitest silently DROPS a filter matching no file and exits 0
with the rest (`TOOLING-TRAPS.md:3012`). Expected `Test Files` count: **17**.

| Suite | Lane base @ `9a000c37` | What S03 expects | Source of the base number |
|---|---|---|---|
| `tests/architecture/tier01-roster.test.ts` | 1/1 | **1/1**, ids and expectations per S9 | setup log + my C1 run |
| `tests/architecture/tiers-s02-rosters.test.ts` | 4/4 | **5/5** (4 kept + 1 new, S11) | setup log + my C1 run |
| `tests/unit/tiers-s02-admission.test.ts` | 14/14 | **14/14** or more (S35) | setup log |
| `tests/unit/tiers-s02-wire.test.ts` | 2/2 | **2/2** | setup log |
| `tests/render/tier01-new-plan-tier.test.tsx` | 22/22 | **22/22** or more (S24) | setup log |
| `tests/unit/dev-cli-provider-panel.test.ts` | 6/6 | delta named case by case (S22): 2 alias cases + 1 prefix case deleted, 3 full-id cases added | setup log |
| `tests/unit/dev-auth-stack.test.ts` | 15/15 | **15/15** or more (S25, S26, S27) | setup log |
| `tests/integration/dev-deployment-register.test.ts` | 11/11 | **11/11** or more (S23, S29, S30) | setup log |
| `tests/integration/dev-api-environment.test.ts` | **10/10** | **10/10** plus S28's two new cases. **A seat reporting 9/10 as "pre-existing" is reporting a regression** (the 9/10 was `6a05a0d0`'s swept foreign hunk, fixed by `4df0b2b5`, cherry-picked as `9a000c37`) | setup log line 28 (the correction) + my C3 run |
| `tests/architecture/dev-real-provider-only.test.ts` | 3/3 | **3/3** (S34) | setup log |
| `tests/architecture/register-support-publication.test.ts` | **12/14 — RED at base in both trees** | **12/14, delta zero.** Both failures pre-existing, dated 2026-09-12 | setup log |
| `tests/unit/api.test.ts` | 26/26 | **26/26** | setup log |
| `tests/integration/dev-provider-panel.test.ts` | **2/3 — RED at base in the lane; R27 OMITS this suite** | **3/3** (S32). The failure is pre-existing, dated **2026-09-13 (`6a05a0d0`)** — see §6 | **measured by me this pass**, `c-base-v2.log` / `c2-diagnose.sh` |
| `tests/architecture/dev-deployment-register.test.ts` | 3/3 — R27 omits it | **3/3** or more (S10's ordering case) | **measured by me this pass**, `c-base-v3.log` |
| `tests/architecture/dev-runner-provider-set.test.ts` | included in the 8-file C3 run — R27 omits it | delta zero unless S21 moves it | **measured by me this pass**, `c-base-v3.log` |
| `tests/unit/provider.test.ts` | included in the 2-file C2 run (14 total with api-provider-discovery's 5 → 9) — R27 omits it | delta zero unless S14 moves it | **measured by me this pass**, `c-base-v3.log` |
| `tests/unit/api-provider-discovery.test.ts` | 5/5 | **5/5** or more (S16, S17) | **measured by me this pass**, `c-base-v2.log` |

**1b — the three suites that pin the deterministic v4 publication snapshot (S23 / F-ARCH-4).**
`tests/architecture/register-support-publication.test.ts` is inside `S03-C3`'s command, so it is caught
at cluster time. The two heavy ones need embedded postgres and are slice-level only:

```
LANG=en_US.UTF-8 npx vitest run \
  tests/integration/register-support-publication.test.ts \
  tests/integration/production-database-principals.test.ts
```

Both assert `DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256`; both move with `registerFixtures.ts:22`.
Their base `passed/total` is measured by the seat that first runs them — **not recorded here, because I
did not run them** (they are outside the four cluster commands my packet named): **UNVERIFIED at
Revision 2**, and the REV(S03) lens records them.

**2 — the cross-cluster mounts** (a cluster can be green and the slice still wrong):
- `pnpm run generate:contract` from a tree with `packages/contract/generated/` **deleted** exits 0 and
  `tests/architecture/tier01-roster.test.ts` then passes (S10). This is the mount between C1's
  generator and every consumer of contract, and it is the one failure mode a per-cluster run cannot
  see, because every cluster runs in a tree where the directory already exists.
- `loadModelConfig(repoRoot)` over the **committed** `config/models.yaml` yields the five slots in
  S20's order, and `PLAN_TIER_ROSTERS` deep-equals the file's two lists (C1 ↔ C3 ↔ C4).
- `tests/support/developmentProviderPanel.ts`'s panel and the register fixtures agree with the live
  slot set (C3's internal mount, S33) — asserted by `dev-api-environment.test.ts` importing it.

**3 — the cross-slice mounts:** S01's contract change (`plan_tier` on `AskRequestSchema`) and S02's
admission behaviour are both consumed unchanged by S35; `tests/unit/tiers-s02-wire.test.ts` and
`tests/unit/api.test.ts` are the guards, and both stay at their base numbers.

**4 — typecheck:** `pnpm typecheck` captured before and after, **delta asserted file by file**; RED at
base from other missions, 15 errors pinned in `BASELINE.md` (S36).

**5 — the acceptance steps V runs** (`SPEC-v3.md:383-457`), with their gates restated so no seat
reports one as passed that could not run: steps **3, 4 and 10b** wait on V's keys (rows V-34 / P2) and
are recorded UNVERIFIED until then, never dropped. Steps 1, 2, 5, 6, 7, 8, 9, 10a and 11 are runnable
on merge day. **Step 4's read-back command must be recorded verbatim** by the implementing seat in its
READY handoff and its self-report — if it appears in none of the three places the SPEC names, step 4 is
UNVERIFIED, not passed.

**6 — recorded UNVERIFIED by this plan, for the reviewer to carry, not to re-derive:**
- **`max_tokens: 64` without `thinking: { type: "disabled" }` on Z.ai** — never measured (F14 measured
  only the pair). S16 takes the measured pair; no seat may call a provider to settle it.
- **Whether OpenAI sells the model under the id `gpt-5.6-luna`** — UNVERIFIED until V's key exists
  (row V-34); BUILD runs against the product's fakes and is not blocked.
- **A file with no `cli:` entry at all** puts an `api:` slot at index 0 and therefore V's key into the
  api.env primary triple. Legal under R2–R6, not one of R20's six classes. **A row for V**, in
  `DECISIONS.md`; until V rules, S20's order rule stands and this case is UNVERIFIED.

---

## 6. Findings this plan raises (each with `file:line`, each needing a ticket the same day)

- **F-ARCH-1 (blocking for R27's completeness, not for BUILD).**
  `tests/integration/dev-provider-panel.test.ts` is **2/3 at lane base `9a000c37`**, and SPEC-v3 R27's
  table omits it. The failing case is *"loads the exact live CLI targets without changing the fixed
  maker order"* (`tests/integration/dev-provider-panel.test.ts`, the first `it` of the
  `real development CLI provider panel` describe), reporting *"expected [ 'development:codex-cli',
  …(3) ] to deeply equal [ 'development:codex-cli', …(1) ]"*. Cause: the suite was last touched
  `7b3a3063` (2026-08-28) and `apps/runner/src/dev-provider-panel.ts` went five-slot in `6a05a0d0`
  (2026-09-13, S02's ops commit) — the fixture was never moved. **Pre-existing; not S03's.** R27's own
  last sentence makes it a finding on R27: *"A suite the lane's own grep finds touching a roster id, a
  discovery target or the api.env guard and this table omits is a finding on this requirement."*
  Closed by **S32**; the class is swept below.
- **F-ARCH-2 (the class of F-ARCH-1, swept member by member).** R27's table names twelve suites. The
  lane's own grep over the discovery-target surface finds **four more**:
  `tests/integration/dev-provider-panel.test.ts` (2/3, RED — F-ARCH-1),
  `tests/architecture/dev-deployment-register.test.ts` (3/3, green),
  `tests/architecture/dev-runner-provider-set.test.ts` (green within my C3 run),
  `tests/unit/provider.test.ts` (green within my C2 run). All four are added to §5's run and to the
  cluster commands, so the sweep is mechanical rather than a claim.
- **F-ARCH-4 (blocking for R27's "delta zero", found at Revision 2 — neither pass-1 me nor the
  ARCH-REV verdict reached it).** S23's `planTierRosters` row changes the development publication
  snapshot digest, and that digest is **pinned as a constant asserted in four places across three
  suites**: `tests/support/registerFixtures.ts:22`
  (`DETERMINISTIC_DEVELOPMENT_V4_SNAPSHOT_SHA256 = "42b90bca…"`),
  `tests/architecture/register-support-publication.test.ts:356-357` (the literal) and `:368` + `:370-371`
  (`toHaveLength(32)` and the digest compare), `tests/integration/register-support-publication.test.ts:322`
  and `:337`, and `tests/integration/production-database-principals.test.ts:2754`. Adding the row without
  moving them takes `register-support-publication.test.ts` from **12/14 to 11/14** — a regression **S03
  would have caused**, against a suite SPEC-v3 R27 pins at *delta zero*. Not a SPEC contradiction and not
  a V row: `registerFixtures.ts:22`'s own comment records S02 moving the same constant on 2026-09-12 for
  the same reason (*"the development provider set grew from one slot per maker to one per plan-tier
  roster member … The previous three-slot snapshot was 120bdfea9776cff5…"*), so the move is the
  documented practice and the sweep is named in S23. `LEGACY_REGISTER_V1_SNAPSHOT_SHA256` and the 14-row
  historical count do NOT move. **Root cause of the miss at pass 1:** I checked the two register suites
  the SPEC named and never asked who else consumes the publication rows — the same one-hop-short habit
  that produced N1 and B1.
- **F-ARCH-3 (non-blocking, a packet/SPEC ambiguity worth one line).** SPEC-v3 R13 ends *"Whatever is
  chosen applies to `gpt-5.6-luna` too."* Read as "send the same body to both", it would put an
  unknown `thinking` field in an OpenAI request, which OpenAI answers 400 — turning every Luna probe
  ABSENT and making R13 unsatisfiable for the entry it was written for. S16 reads it as "one probe
  budget for both, the maker-specific extension only where measured", and states the reading so a
  reviewer checks the reading rather than inferring it.

### Rows for V

**V-ROW: NEW · S03 · slice ticket `t_f14b0ca0` · A file with no `cli:` entry puts V's API key into the
runner's primary provider triple.** `config/models.yaml` may legally declare both tiers entirely with
`api:` entries — R2–R6 admit it, and none of R20's six shape classes refuses it. The runner copies
**slot 0's** `baseUrl`/`model`/`authorizationHeader` into `api.env`'s
`VLLM_BASE_URL`/`VLLM_MODEL`/`VLLM_AUTHORIZATION` and throws
`RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT` otherwise (`apps/runner/src/main.ts:65-71`, re-measured
at Revision 2 under N1 — the file is 150 lines, so `:207-213` does not exist). S20's order rule puts every `cli:` entry ahead of every `api:` entry, so
slot 0 is a loopback relay **whenever the file has at least one `cli:` entry** — which R7's merge
content does. With none, V's paid bearer lands in that triple.
Recommended default: **leave it as it is for this slice.** The merged file has three `cli:` entries,
the order rule keeps slot 0 local, and closing the hole means a seventh shape class — which moves
R20's class list and R28's fixture count, both frozen.
Smallest yes/no for V: *"If you ever write a models file with no CLI entry at all, your API key ends
up in the runner's primary provider slot. Ship S03 without a check for that, and add the check later
if you ever write such a file?"*
VERDICT ship without the check / CONFIDENCE medium / STRONGEST COUNTER: this slice exists so V can
edit the file freely, and "freely" is exactly when the un-refused case gets written; a seventh class
costs one fixture and one `it`, and a SPEC that is being read by ARCH-REV this week is the cheapest
moment it will ever have to move.

---

## 7. Refutation — I attack my own plan before ARCH-REV does

**Per step: the concrete failure the criterion catches, and one it does NOT.**

| Step | Its criterion catches | It does NOT catch |
|---|---|---|
| S2 | a loader that drops `base_url` or `key` from an API entry | a loader that silently lowercases `model`, since no case compares the returned `model` to the file's bytes for an unusual id |
| S3 | a loader that rewrites the file it read | a loader that rewrites a *different* file (the digest is taken of one path only) |
| S4 | a class collapsed into another, or a seventh code added quietly | two distinct faults in one file: the first class to fire is the one reported, so a fixture with a bad key name **and** a bad URL proves only the earlier guard |
| S5 | a class-3 verdict that depends on this Mac's `PATH` | a `isCliInstalled` implementation that is itself wrong, since no case runs the real one |
| S6 | a key value committed into `config/models.yaml` | a key value committed into a *fixture* under `tests/` — the case reads the committed config file only |
| S7 | `PLAN_TIERS` gaining a third value with the loader left behind | the two lists agreeing in content while disagreeing in ORDER, because the assertion sorts both |
| S9 | an id literal surviving in `plan-tiers.ts` | an id literal surviving in a file the two scans exclude — `tests/**`, `packages/contract/generated/**`, any `generated/` directory, and anything outside `apps`+`packages`. **This is the exact hole the positive limb (S11 case 5) exists to close**, and it is why R8 has two limbs |
| S10 | the two generators run in the wrong order | a generator that runs in order and writes malformed TypeScript, which surfaces only at the next import |
| S11 | the bare-substring matcher's three support-file hits | an id that appears quoted-exact in a file the walker never reaches (`EXCLUDED_DIRECTORIES`, non-`SOURCE_EXTENSIONS`) |
| S12 | a file whose content is not R7's | a file whose *comments* were dropped — R7 requires V's header and the "Put Grok in Free too" block, and no case asserts the comment text. **Named as a gap; the reviewer reads the file against `00-intake-S03.md:25-49`** |
| S14 | the `/v1` rule refusing the Z.ai base URL | a base URL that is admitted here and refused later by the panel gate, which is S31's case, not this one |
| S16 | a probe that keeps `max_tokens: 8`, and a `thinking` field sent to OpenAI | whether `max_tokens: 64` alone would have sufficed on Z.ai — UNVERIFIED by construction, and no seat may call the provider to find out |
| S17 | an outbound request for an uncredentialed slot | an outbound request made by something other than the discovery resolver — the support relay (R26) and the gateway's own run-time calls are outside this criterion |
| S18 | a catalogue that cannot express an entry the grammar admits, and a port that collides with 8794 | a catalogue row whose `maker` string is wrong (e.g. `"ZAI"` for `"Z.AI"`), which surfaces only as a maker-count refusal at admission |
| S19 | a `provider_ref` derived from `model`, which is the second build the pass-3 verdict warned about | a ref derived from `(tier, word)` that is nevertheless **misspelled** relative to the live five — S34's `toContain` assertions are what catch that |
| S20 | Free's `api:` slots landing at index 0 | a file with no `cli:` entry at all, which the order rule cannot fix — raised as the V row |
| S21 | a drift predicate validating against a stale static set | a call site that passes the *wrong* configured set (e.g. the incoming one where the outgoing is meant), which reads as a type-correct mistake |
| S22 | `claude` asked for `opus` instead of `claude-opus-5` | a relay started on the wrong port, which S18's port case covers and this one does not |
| S23 | a missing `planTierRosters` row | a row present but stale, because the row is built from the same load the slots are built from and nothing compares it to a second read of the file |
| S24 | `claude-sonnet-5` rendered, and a blank dot or empty name | `/new` reading the HEALTHY panel instead of the file — the render fixture supplies a register row, so a page that also consulted `discovered_panel` would still pass. **Acceptance step 8 is the only oracle for that**, which is why it is flagged runnable on merge day |
| S25 | a refusal that rewrites `api.env`, or one that prints a key | a refusal that is correct but whose message names the wrong class number, since the case asserts the number's presence and the fixture's class agree — a systematically off-by-one class map would pass |
| S26 | a keyless slot that throws instead of going sentinel | a keyless slot that goes sentinel **and** is wrongly left in `healthyProviderRefs`, if `:120-122` were also changed — the case asserts absence from the healthy panel, so this one IS caught; what is not caught is a warning emitted twice |
| S27 | a `0644` or hard-linked key file | a key file that is correctly custodied and contains a malformed line, which returns an empty variable and is then class 31(a) — indistinguishable from "absent" in the warning text |
| S28 | a reconstruction admitted, and a legitimate removal refused | a legitimate removal admitted for the **wrong reason** — if the chain's first predicate `isExactProviderRuntimeRefresh` happened to admit it, the new admission would never run and the case would still be green. **The step names this explicitly as the slice's likeliest false-green**; the guard is that the removal case moves `REGISTER_VERSION`, a key the first predicate compares |
| S29 | a key arrival that republishes the register | a key arrival that changes the register row's *order* without changing its content, since the assertion is a deep-equal on a list |
| S21 (Rev 3) | a predicate that **ignores its new parameter** — the case drives `assembleDevelopmentApiEnvironment` with a configured set the outgoing refs are absent from and demands `DEV_API_ENVIRONMENT_DRIFT` plus a byte-identical file | a predicate that keeps the old module-level set as a **DEFAULT** (the caller supplies the argument, so the case passes either way — N1-p2). That build is caught instead by S21's source-text case over the four CLI call sites, and by S25's module-load ban. It also does not catch a call site that threads the *wrong* set (incoming where outgoing is meant) — type-correct and silently wrong |
| S23 (Rev 2) | a `planTierRosters` built from `providerPanel.targets` (it would carry a sentinel on a keyless machine, and S29's deep-equal case fails), and the digest sweep left undone (the suite drops to 11/14) | a row built from the file but placed in a publication path the `/v1/deployment` reader never sees — only acceptance step 6 observes that |
| S19 (Rev 2) | a build that keeps `planTierRosters` out of the versioned snapshot, which case (2)'s "the `planTierRosters` row is NOT byte-identical" half now forbids | whether the new version is *published* rather than merely *computed* — that needs the real publication path, which acceptance step 6 exercises |
| S32 | the stale two-slot fixture | any further drift between that suite and the panel introduced after S32 lands |
| S35 | a refusal naming one missing id where two are missing | a refusal that names both ids and *also* creates a run, unless the case asserts run-creation separately — it does |

**Per cluster: the mutant class its one command detects.**

| Cluster | Mutant class the command detects | The mutant it would MISS |
|---|---|---|
| `S03-C1` | any change that puts a model id back into a scanned production file, drops a shape class, or breaks the generator chain — the two architecture suites are whole-repo scans, so a stray literal anywhere under `apps`+`packages` fails them | a literal placed inside `packages/contract/generated/` or any `generated/` directory (excluded by both oracles by design) — caught only by S11's case 5 comparing the file to the runtime lists |
| `S03-C2` | a probe that calls a host it must not, a probe budget reverted to 8, a URL grammar that re-imposes `/v1` or drops one of the five refusals | a gateway that makes its own outbound call outside the discovery resolver — no suite in this cluster observes `packages/providers`' `call()` path |
| `S03-C3` | a slot set that does not follow the file, a ref that moves on a `model:` edit, an api.env guard that admits a reconstruction or refuses a real removal, a refusal that rewrites state, a keyless slot that throws | a fault that needs the real `pnpm dev:auth:up` against a real database and real relays — every suite here is a fixture. **Acceptance steps 6, 7, 8 and 9 are the only oracles for the assembled command**, which is why they are runnable without V's keys |
| `S03-C4` | the new ids failing to reach the admission filter or the tier cards, and `claude-sonnet-5` surviving on the page | a browser that renders correctly from a *stale bundled* roster rather than from the register row — S13's "no `apps/ui` file selects `PLAN_TIER_ROSTERS`" case is what closes it, and it lives in C1 |

**The one thing I would look at first if I were ARCH-REV:** S28. It is the only step whose criterion
can be satisfied by a predicate that never runs, and the chain order at
`apps/runner/src/dev-api-environment.ts:493-496` is what decides whether it runs. Second: S12's
comment text, which R7 requires and no automated case asserts.
