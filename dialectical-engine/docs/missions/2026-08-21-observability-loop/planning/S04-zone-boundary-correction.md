# S04 — ZONE BOUNDARY CORRECTION

**Seat:** ARCHITECTURE (Claude Opus, intake amendment A4; fired under V roster amendment **A5 as corrected** — non-code gate, worked by an Opus seat **and** Grok independently and blind).
**Trigger:** blocker on `t_d1e18a14` (S04 zone classifier + manifest), codex@gpt-5.6-sol, 2026-08-26 11:49, escalated by the Router 11:51.
**Scope:** the definition of the excluded-security-zone boundary, the assertion that guards it, the migration of every artifact that restates it, and the S04 existence-check ambiguity.
**Authority:** ARCH correction. The Router applies it. **No ticket edited by this seat. No code written. Nothing inside the excluded zone touched.**
**Verification posture:** every number below was re-derived from the real files at the real commits by this seat. The Router's figures were **not** taken on trust; they are confirmed, and **two findings the Router did not have** are recorded in §1.3 and §1.4.

---

## 0. VERDICT IN ONE PARAGRAPH

The `zone-route-mount region` must stop being a line range and become a **semantic region resolved at check time**: the single top-level `if (options.registration !== undefined) { … }` statement in `buildApi`, from its `if` token through the matching brace that closes its consequent block, required to contain exactly the three named POST mounts in order. Line numbers are demoted to **non-normative, commit-stamped orientation**. The byte-identity assertion is **not re-anchored and not merely supplemented — it is replaced**, by a four-part assertion (ZI-1 shape, ZI-2 content-identity resolved independently on each side, ZI-3 containment, ZI-4 no-import), of which ZI-1 is **baseline-free** and therefore satisfies the Batch-6 Standing Rule that the old assertion silently failed. Resolution failure is **hard-fail-closed at the gate and behaviourally invisible at runtime** — the guard shouts, the product never differs. On the existence-check ambiguity the blocked seat's recommendation is **UPHELD in substance and TIGHTENED in four places**; its framing is also **corrected**: the prohibition partitions by **file**, not by check-type — `index.ts` is content-readable (it is the authorized mount-list source and is not a zone internal), the three zone-internal files are existence-only, and the **identity-table deny set gets no reality check of any kind, in any process, including tests**.

---

## 1. THE DEFECT, INDEPENDENTLY VERIFIED

### 1.1 The plan's numbers were true — at a commit that is now seven days and eleven shifts old

`planning/VerticalSlices.md` §1 preamble states: *"Line numbers are anchors verified at `dc9fd57`."* That is honest, and the anchors were exact. Re-derived from `git show dc9fd57:dialectical-engine/apps/api/src/index.ts` (684 lines):

| Plan claim | Value at `dc9fd57` | Verdict |
|---|---|---|
| `:45` — `./registration.js` import | `} from "./registration.js";` | **exact** |
| `:193` — block opens | `  if (options.registration !== undefined) {` | **exact** |
| `:205` — `/v1/auth/register` | `api.post("/v1/auth/register", …` | **exact** |
| `:217` — `/v1/auth/verify-email` | `api.post("/v1/auth/verify-email", …` | **exact** |
| `:226` — `/v1/auth/resend-verification` | `api.post("/v1/auth/resend-verification", …` | **exact** |
| `:235` — block closes | `  }` | **exact** |
| `:237` — `/v1/session` (S09 TP-4 orientation) | `api.get("/v1/session", …` | **exact** |

**The planning work was not sloppy.** It pinned truthfully against a frozen referent and said so. The referent moved.

### 1.2 The Router's drift report — CONFIRMED at lane base `29f370e`

`git show 29f370e:dialectical-engine/apps/api/src/index.ts` (697 lines):

| Router claim | Re-derived | Verdict |
|---|---|---|
| block opens at `:206`, not `:193` | `:206  if (options.registration !== undefined) {` | **confirmed** |
| `/v1/auth/register` at `:218` | `:218  api.post("/v1/auth/register", …` | **confirmed** |
| `/v1/auth/verify-email` at `:230` | `:230  api.post("/v1/auth/verify-email", …` | **confirmed** |
| `/v1/auth/resend-verification` at `:239`, **outside** `:193-235` | `:239` — outside | **confirmed** |
| `:193` is mid-expression | `        : argon2Unavailable ? 503` | **confirmed** |
| `:235` is mid-verifyEmail | `        token: typeof body.token === "string" ? body.token : ""` | **confirmed** |

Also newly recorded: the block **closes at `:248`**, and the `/v1/session` mount that S09's TP-4 uses for orientation is at **`:250`**, not `:237`. The `./registration.js` import is at **`:47`**, not `:45`. Every anchor in the S09 contract has rotted too, not only the three the Router listed.

### 1.3 FINDING THE ROUTER DID NOT HAVE — the block has moved **eleven times**, and is now at `:708`

The Router attributed the shift to "the accounts mission's argon2 work" and measured it at "~13 lines". Walking `git log` over `dialectical-engine/apps/api/src/index.ts`:

| commit | date | subject (truncated) | file lines | block opens | register | resend |
|---|---|---|---|---|---|---|
| `40791b8` | 2026-08-19 | Accounts Phase 1: S0′-1 + S1 + S2 | 634 | — | — | — |
| `6e58adc` | 2026-08-19 | Accounts Phase 1 checkpoint: S3a verified | 684 | **193** | **205** | **226** |
| `9801f85` | 2026-08-21 | chore(repo): record the 2026-08-17 tree reorganization | 697 | 206 | 218 | 239 |
| `ee0e004` | 2026-08-23 | fix(auth): derive client IP through pinned UI hop | 709 | 210 | 230 | 251 |
| `00d8f88` | 2026-08-23 | feat(accounts): implement S4 TOTP MFA enrollment | 736 | 219 | 220 | 241 |
| `6eedfa9` | 2026-08-23 | Merge branch 'dev' into codex/accounts-s4 | 746 | 229 | 230 | 251 |
| `ec2c1cc` | 2026-08-23 | feat(auth): add secure server sessions and csrf | 957 | 437 | 438 | 459 |
| `9ff7e2b` | 2026-08-23 | fix(auth): close S5 session review gaps | 961 | 441 | 442 | 463 |
| `0cec59e` | 2026-08-23 | feat(accounts): enforce opaque run ownership | 1121 | 534 | 535 | 556 |
| `35be24b` | 2026-08-24 | feat(accounts): add private-by-default publication | 1279 | 601 | 602 | 623 |
| `ef12714` | 2026-08-24 | fix(security): harden publication authorization | 1291 | 601 | 602 | 623 |
| `970870f` | 2026-08-25 | feat(accounts): add secure account erasure | 1448 | 719 | 720 | 741 |
| `4828358` | 2026-08-25 | feat: retire legacy dev-token authentication | 1437 | **708** | **709** | **730** |

`dc9fd57` sits in the `6e58adc` era. **`80362d0` (`dev` HEAD) has the block at `:708-739`.** The boundary has moved **515 lines in six days across eleven commits**, and `29f370e` **is an ancestor of `dev`** (`git merge-base --is-ancestor 29f370e dev` → yes; `git merge-base dev obs-lane-2-capture` → `29f370e`).

**Why this is decisive, not merely worse.** §0's closure law is: *"Every lane produces a branch that V's merge flow integrates into the **mission integration base off `dev`**."* Re-pinning the range to `29f370e` would therefore buy **one lane's worth of correctness and then rot at the first merge onto a `dev`-derived base — by 502 lines.** The drift is not an accident of one upstream commit; it is the steady-state behaviour of the file the mission chose to anchor into. Any fix that produces a number is already wrong.

### 1.4 FINDING THE ROUTER DID NOT HAVE — the assertion is **specification-only; it has never existed in code**

The Router wrote: *"The byte-identity assertion still PASSES because it compares the lane's `:193-235` to HEAD's `:193-235` — both drifted together."* The conclusion (it guards the wrong bytes) is right; the mechanism is not what is in the tree. Verified:

```
grep -rln "zone-route-mount|zoneRouteMount|options.registration !== undefined" tests/ acceptance/ packages/   →  (no matches)
```

There is **no zone-integrity assertion anywhere in the repository.** `H6-selfaudit.md:130` places it on **S09 alone** (*"S09 carries the byte-identity architecture assertion"*), S09 is `t_3c54fdeb`, status **`todo`**, unbuilt. The GLOBAL-FORBID paragraph restated on all 32 tickets carries the *prohibition*; only S09's RED→GREEN carries the *assertion*.

Consequences for this correction, both favourable:
1. **Nothing has to be un-shipped.** This is a specification change plus a first implementation, not a migration of running code. The blast radius is documents and tickets.
2. **The "both drifted together" defence never even got its chance.** The assertion as specified — *"`apps/api/src/index.ts:193-235` is byte-identical to its pre-slice state"* — would have compared a stale range against itself and passed vacuously. It is worth stating precisely **why it would have been vacuous**, because that diagnosis is what the replacement must fix: the assertion's expected value was *"whatever was there before"*, which is computable only by reading the artifact under test. That is exactly the failure the mission already named.

### 1.5 The Standing Rule this defect violates — already binding, already earned

`research/POST-SYNTHESIS-RULINGS.md`, Batch 6, *Standing rule earned this round (binding, mission-wide)*:

> **A pin whose expected value cannot be computed by a party that has never seen the implementation is not a pin.** … Every future acceptance criterion that names a hash, a baseline, or a target set must state who can compute the expected value, from what frozen referent, without access to the artifact under test.

`:193-235` names a **target set**. Its expected value — *which bytes are the zone mount block* — cannot be computed by anyone who has not opened the current file, because the number carries no evidence of what it points at. The rule was written for hashes and baselines; it generalises without amendment:

> **Corollary (this correction, mission-wide): a boundary whose violation cannot be detected by a party that has never seen the drift is not a boundary.** A file-contract region must be stated so that its referent is recoverable from the region's own definition, not from a coordinate that only a prior reader can validate.

This is why the answer is semantic rather than "re-pin and be more careful". Care is not a mechanism. `6e58adc → 9801f85` was a **`chore(repo)` tree-reorganization commit** — it shifted the security boundary by thirteen lines while touching nothing about authentication. No amount of diligence catches that; only a definition that does not depend on position does.

### 1.6 The same defect class, elsewhere in this mission's contracts

Re-derived across the three revisions that matter (`dc9fd57` = plan anchor · `29f370e` = lane base · `dev` = integration-base lineage):

| Anchor | contract | @`dc9fd57` | @`29f370e` | @`dev` | status |
|---|---|---|---|---|---|
| `apps/api/src/index.ts:193-235` zone-route-mount region | GLOBAL-FORBID ×32 | exact | **`:206-248`** | **`:708-739`** | **ROTTED — this correction** |
| `apps/api/src/index.ts:45` registration import | GLOBAL-FORBID ×32 | exact | **`:47`** | shifted | **ROTTED — this correction** |
| `apps/api/src/index.ts:235`/`:237` TP-4 insertion point | S09 `allowed` | exact | **`:248`/`:250`** | **`:739`/`:778`** | **ROTTED — this correction** |
| `packages/db/src/index.ts:587-603` identity re-export | GLOBAL-FORBID ×32 | exact | **exact** | **`:1477-1495`** | **intact now, rots at merge — §9.1** |
| TP-2 "APPEND after `:603` (EOF)" | H5-09 / TP-2 | EOF | EOF (604 ln) | **mid-file of 1496** | **ACTIVE HAZARD — §9.1** |
| `apps/api/src/index.ts:158-191` error-handler | S08 `allowed` | exact | **`:160`+** | **`:418`+** | **ROTTED — §9.2** |
| `apps/api/src/index.ts:130-140` `resolveSession` | S08/S09 `readonly` | exact | shifted | shifted | **ROTTED — §9.2** |
| `packages/providers/src/index.ts:371-385` exhaustion throws | S11 `allowed` | exact | to re-verify | to re-verify | **§9.2** |
| `vitest.config.ts` include = 2 globs | GLOBAL-TEST-SURFACE | 2 globs | 2 globs | **3 globs** (`acceptance/**/*.test.ts` added, committed) | **ROTTED — §9.3** |

**`packages/db/src/index.ts:587-603` deserves emphasis.** It is the *other* GLOBAL-FORBID zone anchor, it is still exact at the lane base, and it moves to `:1477-1495` on `dev`. TP-2's instruction to **append after `:603`** would, executed against a `dev`-derived integration base, **write into the middle of a 1496-line file at `function rejectKnownFailure(…)`**. That is not a stale document; it is an instruction that will cause a bad write, and it is scheduled.

---

## 2. WHY SEMANTIC, AND WHAT "SEMANTIC" HAS TO EARN

### 2.1 The plan already ruled this way; it just did not build the mechanism

`VerticalSlices.md` §1 preamble, already binding:

> *"where a region is defined syntactically (a block, a function), the **syntax is authoritative** and the number is the anchor."*

S09's contract restates it: *"**SYNTAX IS AUTHORITATIVE**: the insertion point is 'after the registration block's closing brace', NEVER a line number inside it."*

So **the semantic definition is not a new law — it is the existing law, which had no enforcement mechanism and was therefore overridden in practice by the numbers printed next to it.** A rule that appears only as prose loses to a rule that appears as a machine-checkable integer. This correction supplies the missing mechanism and removes the competing integer.

This matters for adjudication: a reviewer may reasonably ask whether ARCH is expanding scope. It is not. It is making an already-ruled property executable, and deleting the numbers that contradicted it.

### 2.2 The empirical case: the region's **content** never drifted at all

Resolved semantically at each revision and hashed (sha256 of raw region bytes):

| revision | resolved lines | region bytes | content sha256 (first 12) |
|---|---|---|---|
| `6e58adc` | 193–235 | 1986 | `6df1ec02d937` |
| `dc9fd57` (plan anchor) | 193–235 | 1986 | `6df1ec02d937` |
| `29f370e` (lane base) | **206–248** | **1986** | **`6df1ec02d937`** |
| `dev` (`80362d0`) | **708–739** | 1653 | `bff20f70edcf` |

**Between the plan's anchor and the lane base the zone-route-mount region is byte-identical.** Nothing about the excluded zone's mount block changed. Only its coordinates moved. A semantic assertion would have held a *true, passing, meaningful* claim straight through the exact drift that broke the line-number one — while a line-number assertion was, over the same interval, comparing an argon2 ternary against a verifyEmail token field and reporting success.

Between the lane base and `dev` the content **does** change, legitimately: the accounts mission replaced `{ config: { auth: "public" } }` with `routePolicy("POST /v1/auth/register")`. This is the second load-bearing datum: **the baseline for a content assertion cannot be a frozen commit pin**, or every lane fails the moment the integration base advances. It must be *the lane's own merge-base, resolved independently on each side*. §5.3.

### 2.3 What a semantic definition must earn to be admissible

A boundary that is harder to check than the thing it guards will be skipped, waived, or quietly stubbed. Four bars, all met and all evidenced in §4:

| bar | requirement | met |
|---|---|---|
| **Falsifiable** | there exist concrete edits it must reject, and it rejects them | §4.4 — 15/15 mutants behave as specified |
| **Cheap** | affordable in every lane's gate | §4.5 — **4.14 ms** mean over the 1437-line `dev` file |
| **Dependency-free** | no package that may vanish or lack the needed API | §4.1 — **mandatory here**: this repo's `typescript` is 7.0.2 native-preview and **ships no compiler API** |
| **Self-checking** | its own mis-resolution is detected, not silently returned | §4.3 — two independent methods must agree or the gate fails closed |

### 2.4 The constraint that forces the implementation — verified, and it would have blocked the seat again

The natural implementation is a TypeScript AST walk. **In this repository that is not available:**

```
package.json:67   "typescript": "7.0.2"
node_modules/typescript -> .pnpm/typescript@7.0.2/node_modules/typescript
node_modules/typescript/lib/  →  getExePath.js  tsc.js  version.cjs  version.d.cts     ← no typescript.js
require.resolve("typescript") →  .../typescript@7.0.2/node_modules/typescript/lib/version.cjs
```

TypeScript 7.0.2 is the native-preview build: it provides the `tsc` executable and **no compiler API**. A `typescript@5.9.3` copy exists in the pnpm store as a transitive dependency but is **not resolvable as `typescript`** from the repo or from `tests/`. `oxc-parser` is not installed (only `@oxc-project/types@0.143.0`).

So an AST resolver would require adding a dependency — and `package.json` is **`contract.forbidden` on S04** and granted by §P.2 to no deliverable. A seat that specified an AST resolver would hand the codex seat a second blocker of the same shape as the first. **The resolver must be dependency-free.** §4 specifies one, and it is verified working.

---

## 3. THE CORRECTED BOUNDARY DEFINITION — NORMATIVE TEXT

### 3.1 The replacement GLOBAL-FORBID bullet (ticket form) — apply byte-identically to all 32 slice tickets

**FIND** (present byte-identically on 32/32 slice tickets):

```
 · apps/api/src/index.ts:193-235 — the `zone-route-mount region` (H5-01 BLOCKER): the `if (options.registration !== undefined)` block and the three zone route mounts inside it (/v1/auth/register :205-216 · /v1/auth/verify-email :217-225 · /v1/auth/resend-verification :226-234), each dispatching into ./registration.js (imported :45). NO slice may write inside this range; any new mount goes strictly after the block closes.
```

**REPLACE WITH:**

```
 · apps/api/src/index.ts — the `zone-route-mount region` (H5-01 BLOCKER; SEMANTIC, NOT A LINE RANGE). The region is the SINGLE top-level `if (options.registration !== undefined) { ... }` statement in buildApi, spanning from the first character of its `if` token through the matching `}` that closes its consequent block, inclusive of both. It contains EXACTLY three route mounts and no other: api.post("/v1/auth/register", ...) then api.post("/v1/auth/verify-email", ...) then api.post("/v1/auth/resend-verification", ...), in that order, each dispatching into ./registration.js. NO slice may write inside this region — not one byte, including whitespace-only reformatting. Any new mount goes STRICTLY AFTER the region's closing brace, at the same nesting level. The region is located AT CHECK TIME by resolveZoneRouteMountRegion() (tests/support/zone-boundary.ts) and NEVER by line number. LINE NUMBERS ARE NON-NORMATIVE; where quoted at all they MUST carry the commit they were true at. For orientation only: the region was :193-235 at dc9fd57, is :206-248 at lane base 29f370e, and is :708-739 at dev 80362d0 — it moved eleven times in six days, which is why the number is not the definition. If the resolver cannot resolve exactly one such block containing exactly those three mounts in that order, the gate FAILS CLOSED with ZONE_BOUNDARY_UNRESOLVED: the lane STOPS and posts a blocker. Re-locating this boundary is never a lane's decision.
```

### 3.2 The replacement §0 bullet (VerticalSlices.md markdown form)

**FIND:**

```
- **`apps/api/src/index.ts:193-235` — the `zone-route-mount region` (H5-01, BLOCKER).** The `if (options.registration !== undefined)` block and the three zone route mounts inside it (`/v1/auth/register` `:205-216` · `/v1/auth/verify-email` `:217-225` · `/v1/auth/resend-verification` `:226-234`), each dispatching into `./registration.js` (imported `:45`). These are the same three mounts S04's manifest enumerates as its "three-route mount list". **No slice may write inside this range.** Any new mount goes **strictly after the block closes**.
```

**REPLACE WITH:**

```
- **`apps/api/src/index.ts` — the `zone-route-mount region` (H5-01, BLOCKER; SEMANTIC, NOT A LINE RANGE).** The region is the **single top-level `if (options.registration !== undefined) { … }` statement in `buildApi`**, from the first character of its `if` token through the matching `}` closing its consequent block, inclusive. It contains **exactly three route mounts and no other**, in this order: `api.post("/v1/auth/register", …)` · `api.post("/v1/auth/verify-email", …)` · `api.post("/v1/auth/resend-verification", …)`, each dispatching into `./registration.js`. These are the same three mounts S04's manifest enumerates as its "three-route mount list". **No slice may write inside this region — not one byte, whitespace-only reformatting included.** Any new mount goes **strictly after the region's closing brace**, at the same nesting level. The region is located **at check time** by `resolveZoneRouteMountRegion()` (`tests/support/zone-boundary.ts`), **never by line number**. **Line numbers are non-normative and must carry their commit wherever quoted.** Orientation only: `:193-235` at `dc9fd57`, `:206-248` at `29f370e`, `:708-739` at `dev` — eleven moves in six days (§1.3). Resolution failure ⇒ **`ZONE_BOUNDARY_UNRESOLVED`, fail closed**, lane STOPS and posts a blocker (§6).
```

### 3.3 The definition restated for adjudication — what is and is not normative

**NORMATIVE** (a change to any of these is a boundary change and needs V):
1. The **file**: `apps/api/src/index.ts`.
2. The **anchor construct**: the `if` statement whose condition is exactly `options.registration !== undefined`, with a block consequent and **no `else`**, at the **top level of `buildApi`'s body**.
3. **Uniqueness**: exactly one such statement in the file.
4. The **extent**: `if` token start → matching close brace of the consequent, inclusive.
5. The **contents invariant**: exactly three route mounts, `post` verb, path string literals `"/v1/auth/register"`, `"/v1/auth/verify-email"`, `"/v1/auth/resend-verification"`, **in that order**, and no fourth mount of any verb.
6. The **write prohibition**: no slice writes inside the resolved extent.
7. The **placement rule**: new mounts go strictly after the resolved `endOffset`.

**NON-NORMATIVE** (may be stale without being wrong; must be commit-stamped):
line numbers; byte counts; the `./registration.js` import line; the neighbouring `/v1/session` mount used for orientation; the region's own byte length or hash at any particular commit.

**Deliberately NOT part of the definition** — and this is a live distinction, not a hypothetical: at `dev` HEAD a **sibling** guard block `if (options.mfa !== undefined) { … }` (`:741-776`) mounts four further `/v1/auth/mfa/*` routes into `./mfa.js`. It is **outside** this region and this correction does not annex it. The uniqueness clause (3) and the exact-three clause (5) are what keep the definition from silently swallowing it. See §10.2 — its zone membership is a **V question**, not an ARCH assumption.

### 3.4 Why the definition survived the drift — checked, not asserted

The definition above was evaluated against all four revisions (§4.4 table A). At `dev` HEAD, where four MFA routes appeared 2 lines below the block and the mount signature changed from `{ config: { auth: "public" } }` to `routePolicy("POST /v1/auth/register")`, the resolver still returns **exactly the three registration mounts, `:708-739`, `shapeOk = true`**. The definition absorbed a 515-line displacement, a signature rewrite, and the arrival of four sibling auth routes **without a single amendment**. That is the property `:193-235` never had and could not have.

---

## 4. THE RESOLVER — NORMATIVE SPECIFICATION

### 4.1 Location, ownership, dependencies

- **Path:** `tests/support/zone-boundary.ts`.
- **Dependencies:** **none.** Node built-ins (`node:crypto`, `node:fs`, `node:child_process`) only. No `typescript`, no parser package. Forced by §2.4; also the right default for a guard 32 lanes depend on.
- **Ownership:** `tests/support/**` is **GLOBAL-FORBID readonly to every lane** — §0: *"a lane needing a new shared fixture escalates to H6 rather than editing it."* The resolver is therefore authored **once, by the Router/H6 as part of applying this correction**, and is **read-only to all 32 lanes**. Lanes import it; no lane can weaken it. This is deliberate: the guard inherits the same human-owned-invariant protection as the 110 pre-existing tests (RT-30), which is precisely the protection a security guard needs.
- **Collection:** `tests/support/*.ts` are **not** `*.test.ts` and are not vitest-collected; they are imported. Consistent with the seven fixtures already there.
- **Custody:** whether this file additionally joins the **OBS-R104 self-modification set** is **V's call — §10.1.**

### 4.2 Exported surface

```ts
export const ZONE_ROUTES: readonly string[];           // the three path literals, frozen, in order

export type ZoneRegion =
  | { ok: false; reason: string }                       // reason starts "ZONE_BOUNDARY_UNRESOLVED: "
  | { ok: true;  shapeOk: boolean;
      startLine: number; endLine: number;               // 1-based, NON-NORMATIVE, evidence only
      startOffset: number; endOffset: number;           // normative extent
      mounts: { verb: string; path: string | null; line: number }[];
      bytes: number; region: string; contentHash: string };

export function maskNonCode(src: string): string;
export function resolveZoneRouteMountRegion(src: string): ZoneRegion;
export function assertZoneBoundaryIntact(opts: {
  repoRoot: string; baseRef: string; slice: string;
}): void;                                               // runs ZI-1..ZI-4; throws on any failure
```

### 4.3 Algorithm — and its self-check

1. **Mask.** One pass over the source producing a same-length, same-newline string in which every character that is not code is replaced by a space: line comments, block comments, `'…'`, `"…"`, backtick template text (**template `${…}` expressions are kept as code, with brace depth tracked**), and regex literals (detected by previous-significant-token class). All structural searching runs on the **masked** text; all content extraction runs on the **original**.
2. **Locate (method A).** Find occurrences of `if\s*\(\s*options\.registration\s*!==\s*undefined\s*\)\s*\{` in the masked text, not preceded by an identifier/`.` character. **Require exactly one.** Brace-match from its `{` to depth 0 → `endOffset`.
3. **Locate (method B, independent).** From the opener's line, take its leading whitespace `I`; scan forward for the first masked line equal to exactly `I + "}"`.
4. **AGREE OR DIE.** If A and B disagree on the closing line → `ZONE_BOUNDARY_UNRESOLVED: resolver methods disagree (brace=…, indent=…)`. **This is the resolver's own falsifiability**: if the masker ever mishandles a construct, the two methods diverge and the gate fails closed instead of silently returning a wrong extent. Verified firing — §4.4 mutant G4.
5. **Extract mounts.** Within the resolved extent, find `api.<verb>(` in the masked text; read the first argument's string literal from the **original**. Record verb, path, line.
6. **Shape.** `shapeOk` ⇔ exactly 3 mounts ∧ every verb `post` ∧ paths deep-equal `ZONE_ROUTES` in order.
7. **Hash.** `contentHash = sha256(region raw bytes)`.

**Raw bytes, not a normalized projection.** A normalized hash would let a lane reformat the excluded zone's mount block and pass. No lane has any business reformatting it, so the strict form is correct here. (Note the contrast with the Batch-6 `Pg0-b` ruling, which pins *content, not bytes*, for the policy bundle — that is right there because S17 owns the bundle's format. No lane owns this region's format; nobody may change it at all. Different problem, different answer, deliberately.)

### 4.4 Falsification matrix — executed, not proposed

Reference implementation run against real file contents. **Table A — historical revisions:**

| revision | ok | shapeOk | resolved | bytes | contentHash | resolve |
|---|---|---|---|---|---|---|
| `6e58adc` | ✔ | ✔ | 193–235 | 1986 | `6df1ec02d937` | 5.68 ms |
| `dc9fd57` | ✔ | ✔ | 193–235 | 1986 | `6df1ec02d937` | 3.71 ms |
| `29f370e` | ✔ | ✔ | 206–248 | 1986 | `6df1ec02d937` | 3.94 ms |
| `dev` | ✔ | ✔ | 708–739 | 1653 | `bff20f70edcf` | 7.31 ms |

**Table B — mutants of lane base `29f370e`.** `changed` = region contentHash differs from unmutated base.

| # | mutation | ok | shapeOk | changed | gate |
|---|---|---|---|---|---|
| F1 | decoy opener inside a **string literal** | ✔ | ✔ | no | **PASS** (correctly ignored) |
| F2 | decoy opener inside a **block comment** | ✔ | ✔ | no | **PASS** (correctly ignored) |
| F3 | **two** real registration guard blocks | ✖ | — | — | **FAIL CLOSED** — `found 2` |
| F4 | guard block **removed** | ✖ | — | — | **FAIL CLOSED** — `found 0` |
| F5 | **fourth mount added inside** the region | ✔ | **✖** | yes | **FAIL** |
| F6 | third mount **path renamed** | ✔ | **✖** | yes | **FAIL** |
| F7 | **one-line edit inside** the region | ✔ | ✔ | **yes** | **FAIL** ← the claim `:193-235` could not make |
| F8 | **40-line insert before** the region (pure drift) | ✔ | ✔ | **no** | **PASS** ← rot immunity |
| F9 | **new mount after** the region closes (S09's lawful act) | ✔ | ✔ | **no** | **PASS** ← S09 stays lawful |
| F10 | **whitespace-only reformat inside** the region | ✔ | ✔ | yes | **FAIL** (intended, §4.3) |
| G1 | regex literal with unbalanced `{` before the region | ✔ | ✔ | no | **PASS** |
| G2 | regex literal containing `"` and `{{` before the region | ✔ | ✔ | no | **PASS** |
| G3 | template literal `${…}` **inside** the region | ✔ | ✔ | yes | **FAIL** (it is an in-region edit) |
| G4 | stray same-indent `}` injected inside the region | **✖** | — | — | **FAIL CLOSED** — `methods disagree (brace=250, indent=231)` |
| G5 | opener **split across three lines** | ✔ | ✔ | yes | resolves correctly; fails only as an in-region edit |

F7/F8 are the pair that matters. **F7** is what the current specification cannot detect and **F8** is what it would falsely tolerate; the replacement gets both right, and **F9** confirms the fix does not criminalise S09's own deliverable.

### 4.5 Cost

**4.14 ms mean** (20 runs) resolving the 1437-line `dev` HEAD file, single-threaded, zero dependencies, no I/O beyond one `readFileSync`. `ZI-2` adds one `git show` subprocess. **Affordable in every lane's gate by an order of magnitude.** The cheapness bar (§2.3) is met with room to spare, which is what removes the incentive to skip it.

### 4.6 Reference implementation

Transcribed from the prototype that produced every number in §4.4/§4.5. The implementing seat **must re-run the full matrix** and commit its output as RED→GREEN evidence — this listing is a starting point, not a certificate.

```ts
// tests/support/zone-boundary.ts  — dependency-free. Readonly to every lane.
import { createHash } from "node:crypto";

export const ZONE_ROUTES = Object.freeze([
  "/v1/auth/register", "/v1/auth/verify-email", "/v1/auth/resend-verification"
]);
const OPENER = /(^|[^\w$.])if\s*\(\s*options\.registration\s*!==\s*undefined\s*\)\s*\{/;
const regexAllowed = (prev: string) => prev !== "val" && prev !== "lit";

/** Replace every non-code character with a space, preserving length and newlines. */
export function maskNonCode(src: string): string {
  const out = Array.from(src);
  const blank = (i: number) => { if (out[i] !== "\n") out[i] = " "; };
  let i = 0, prevSig = ""; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") blank(i++); continue; }
    if (c === "/" && d === "*") { blank(i++); blank(i++);
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) blank(i++);
      if (i < n) { blank(i++); blank(i++); } continue; }
    if (c === '"' || c === "'") { blank(i++);
      while (i < n && src[i] !== c) { if (src[i] === "\\") blank(i++); if (i < n) blank(i++); }
      if (i < n) blank(i++); prevSig = "lit"; continue; }
    if (c === "`") { blank(i++);
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { blank(i++); if (i < n) blank(i++); continue; }
        if (src[i] === "$" && src[i + 1] === "{") {           // template expr: real code
          i += 2; let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++; else if (src[i] === "}") depth--;
            if (depth > 0) i++;
          }
          if (i < n) i++; continue;
        }
        blank(i++);
      }
      if (i < n) blank(i++); prevSig = "lit"; continue; }
    if (c === "/" && regexAllowed(prevSig)) {                  // regex literal
      let j = i + 1, inClass = false, ok = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) { while (i <= j) blank(i++);
                while (i < n && /[a-z]/.test(src[i])) blank(i++);
                prevSig = "lit"; continue; }
    }
    if (/\S/.test(c)) prevSig = /[\w$)\]]/.test(c) ? "val" : "op";
    i++;
  }
  return out.join("");
}

const lineOf = (src: string, off: number) => src.slice(0, off).split("\n").length;
const fail = (reason: string) => ({ ok: false as const,
  reason: `ZONE_BOUNDARY_UNRESOLVED: ${reason}` });

export function resolveZoneRouteMountRegion(src: string) {
  const masked = maskNonCode(src);

  // method A — masked opener + brace match
  const all: number[] = [];
  { let from = 0, m: RegExpExecArray | null;
    while ((m = OPENER.exec(masked.slice(from)))) {
      all.push(from + m.index + m[0].indexOf("if"));
      from = from + m.index + m[0].length;
    } }
  if (all.length !== 1)
    return fail(`expected exactly 1 registration guard block, found ${all.length}`);
  const start = all[0];
  let i = masked.indexOf("{", start), depth = 0, end = -1;
  for (; i < masked.length; i++) {
    if (masked[i] === "{") depth++;
    else if (masked[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return fail("unbalanced braces after registration guard");

  // method B — indentation close, independent of brace counting
  const lines = src.split("\n"), mLines = masked.split("\n");
  const startLine = lineOf(src, start);
  const indent = (lines[startLine - 1].match(/^\s*/) ?? [""])[0];
  let endLineB = -1;
  for (let L = startLine; L < mLines.length; L++)
    if (mLines[L] === indent + "}") { endLineB = L + 1; break; }
  const endLineA = lineOf(src, end);
  if (endLineA !== endLineB)
    return fail(`resolver methods disagree (brace=${endLineA}, indent=${endLineB})`);

  const region = src.slice(start, end), rMasked = masked.slice(start, end);
  const mounts: { verb: string; path: string | null; line: number }[] = [];
  const MOUNT = /(^|[^\w$.])api\s*\.\s*(get|post|put|delete|patch|options|head|all|route)\s*\(/g;
  let mm: RegExpExecArray | null;
  while ((mm = MOUNT.exec(rMasked))) {
    const open = rMasked.indexOf("(", mm.index + mm[0].length - 1);
    let k = open + 1; while (/\s/.test(region[k])) k++;
    const q = region[k];
    if (q !== '"' && q !== "'" && q !== "`") {
      mounts.push({ verb: mm[2], path: null, line: lineOf(src, start + k) }); continue;
    }
    let e = k + 1;
    while (e < region.length && region[e] !== q) { if (region[e] === "\\") e++; e++; }
    mounts.push({ verb: mm[2], path: region.slice(k + 1, e), line: lineOf(src, start + k) });
  }
  const paths = mounts.map(m => m.path);
  const shapeOk = mounts.length === 3
    && ZONE_ROUTES.every((r, x) => paths[x] === r)
    && mounts.every(m => m.verb === "post");

  return { ok: true as const, shapeOk, startLine, endLine: endLineA,
    startOffset: start, endOffset: end, mounts, bytes: region.length, region,
    contentHash: createHash("sha256").update(region).digest("hex") };
}
```

---

## 5. WHAT REPLACES THE BYTE-IDENTITY ASSERTION

**Replaced, not re-anchored and not supplemented.** Re-anchoring keeps a construct whose expected value is *"whatever was there before"* — the exact shape the Batch-6 Standing Rule outlaws. Supplementing leaves a passing vacuous assertion in the suite, which is worse than none: it reports coverage it does not have. The old criterion is **struck** and four assertions take its place.

### 5.1 ZI-1 — SHAPE (baseline-free; the Standing-Rule fix)

```
resolve(read(apps/api/src/index.ts)) satisfies ALL of:
  ok === true                        // exactly one registration guard block
  shapeOk === true                   // exactly 3 mounts, all POST, exact paths, exact order
  no api.<verb>( inside the region other than those three
  region contains no obs-surface identifier
     (/@debateai\/obs-capture|obs-capture|captureError|zoneBoundary|obsInstall/)
```

**Expected value computable by a party that has never seen any lane's implementation** — it is stated in full in §3.1, from the mission's own documents. This is the assertion the old one should have been. It needs no git, no baseline, no prior state; it cannot pass vacuously; and it is what catches an upstream change to the boundary's *meaning* (a fourth zone route landing, a mount being renamed) as opposed to a lane's edit.

### 5.2 ZI-2 — CONTENT IDENTITY, resolved independently on both sides

```
base   = git show <baseRef>:dialectical-engine/apps/api/src/index.ts
work   = read(apps/api/src/index.ts)
resolve(base).ok && resolve(work).ok            // else FAIL CLOSED
resolve(work).contentHash === resolve(base).contentHash
```

The correction is structural, and it is the whole point: the old assertion compared **`base[193..235]` to `work[193..235]`** — two coordinates. This compares **`resolve(base).region` to `resolve(work).region`** — two *meanings*, each located on its own side by its own evidence. Line displacement between the sides is invisible to it (F8, F9 pass); any in-region byte change is fatal (F7, F10 fail).

- `baseRef` = the lane's merge-base against the **mission integration base**, and it is **passed explicitly, never discovered**. A discovered ref is a defeat surface.
- The resolved base commit SHA, both resolved line ranges, and both hashes are **printed in the test output as evidence** (frames-intact discipline, lane-2 packet lesson 6).
- If `git merge-base` cannot be computed, or either side fails to resolve → **FAIL**, never skip.
- **The baseline is the lane's merge-base, not a frozen pin** — §2.2 shows the region legitimately changes between `29f370e` and `dev`, so a frozen pin would fail every lane the day the integration base advances, and would then be waived, which is how guards die.

### 5.3 ZI-3 — CONTAINMENT (every lane; load-bearing for S09)

```
for every api.<verb>("…") this lane's diff ADDS to apps/api/src/index.ts:
    addedMountOffset > resolve(work).endOffset
```

Replaces S09's *"insert after `:235`"* with *"insert after the resolved `endOffset`"*. Lanes that add no mount assert the empty set — trivially true, still run, still evidence. F9 confirms the lawful `POST /v1/obs/client-report` insertion satisfies it.

### 5.4 ZI-4 — NO-IMPORT (every lane)

```
no file authored or modified by this lane imports, requires, or dynamically imports:
    ./registration.js | ./registration | apps/api/src/registration
    ./mail-channel.js | ./mail-channel | apps/api/src/mail-channel
    packages/db/src/identity | @debateai/db/identity | ./identity.js
```

Carries OBS-R130/R134/R135 into a machine check. The zone is path-string data in the manifest and **nothing else, ever**. The Router verified the current obs-capture tree imports nothing from the zone; ZI-4 makes that a standing property rather than a one-time observation.

### 5.5 Who runs what

| assertion | run by | needs git | cost |
|---|---|---|---|
| ZI-1 shape | **every lane** | no | ~4 ms |
| ZI-2 content identity | **every lane** | yes (one `git show`) | ~4 ms + subprocess |
| ZI-3 containment | **every lane** (S09 non-trivially) | no | ~4 ms |
| ZI-4 no-import | **every lane** | no | diff scan |

Every lane, including lanes nowhere near `apps/api`. At ~4 ms the marginal cost is nil, and a lane proving it did not touch the boundary is exactly the evidence the mission wants on file. Nothing about "this lane does not go near it" survives contact with a bad merge.

### 5.6 Where the per-lane assertion lives — and its cost to the test-surface law

Each slice ticket's `tests:` field gains **one** glob:

```
tests/architecture/obs-l<LANE>-<SLICE>-zone-integrity.test.ts
```

Three lines per lane, importing the shared fixture:

```ts
import { assertZoneBoundaryIntact } from "../support/zone-boundary";
it("zone-route-mount region intact", () =>
  assertZoneBoundaryIntact({ repoRoot: ROOT, baseRef: MISSION_BASE, slice: "S04" }));
```

**This is lawful under GLOBAL-TEST-SURFACE** — the partition key is the `obs-l<N>-<S>-` filename prefix and is *"independent of the count and of the suite"*; multi-glob slices already exist (S09, S18, S21). It is a real cost: **32 tickets gain a glob**, folded into the same pass as §8.

**Equivalent the Router may substitute:** a single gate script invoked by every lane's gate command instead of 32 test files. Acceptable **only if** it demonstrably runs for every lane before merge and its output is captured as lane evidence. If that cannot be shown, the per-lane test file is normative — a guard nobody can prove ran is not a guard.

---

## 6. FAIL-CLOSED SEMANTICS

The asymmetry is the whole design and must not be blurred: **the gate is loud; the product is silent.**

### 6.1 Gate side — hard fail, always, no fallback

| condition | code | action |
|---|---|---|
| 0 registration guard blocks | `ZONE_BOUNDARY_UNRESOLVED: found 0` | **FAIL.** Lane STOPS, posts a blocker. Router → ARCH. |
| ≥2 guard blocks | `…: found N` | **FAIL.** Same. |
| braces unbalanced | `…: unbalanced braces` | **FAIL.** Same. |
| methods disagree | `…: resolver methods disagree (brace=X, indent=Y)` | **FAIL.** Resolver is untrustworthy on this input; never guess. |
| resolves, `shapeOk === false`, **<3** mounts | `ZONE_SHAPE_VIOLATION: missing mount(s)` | **FAIL.** A zone route left the block ⇒ boundary shrank ⇒ **V**. |
| resolves, `shapeOk === false`, **>3** mounts | `ZONE_SHAPE_VIOLATION: unexpected mount(s)` | **FAIL.** A new route entered the block ⇒ boundary grew ⇒ **V**. |
| resolves, paths/order/verb differ | `ZONE_SHAPE_VIOLATION: route set mismatch` | **FAIL. V.** |
| `contentHash` differs from base | `ZONE_REGION_MODIFIED` | **FAIL.** Lane wrote inside the region. |
| base ref unresolvable / `git show` fails | `ZONE_BASE_UNRESOLVED` | **FAIL.** Never skip, never "assume unchanged". |

**Never permitted, in any of these cases:** falling back to a line range; widening the search; taking the first of N matches; skipping with a warning; `it.skip`; marking the check advisory. **No lane may re-locate this boundary.** Every unresolved case is an ARCH/V escalation.

### 6.2 Runtime side — the classifier must NOT fail closed *observably*

The shipped capture path **never runs the resolver**, never reads `index.ts`, never performs any existence check. The manifest is static human-owned data; the classifier's decision-row 3 (*"set / no usable repo frame → ZONE, default-excluded"*) already discharges uncertainty **without probing anything**, and `RT-08/IC-2` equal-work forbids any on-path work whatsoever.

Stated as a prohibition because it is the one that closes the oracle:

> **No process on the request path, and no process on the fix-execution path, may perform any operation whose result, error, or DURATION differs according to whether a zone path or an identity table exists.** Not value, not error class, not error message, not timing. Uncertainty resolves to `ZONE` (default-excluded) with no probe.

Duration is named explicitly because `G1-acc-5` is a **timing** falsification test: a `stat()` on the request path would be an oracle even if its result never surfaced anywhere.

---

## 7. RULING ON THE EXISTENCE-CHECK AMBIGUITY

### 7.1 The ambiguity, stated precisely

- S04 GREEN: *"the manifest-reality test asserts every path exists and the three mounts string-match `buildApi`."*
- Launch contract / §0 / OBS-R130/R134: *"The zone is referenced only as path-string DATA in the D03 manifest, never as an import"*; FinalPlan §E.1: *"No imports, no inspection inside the zone."*

Seat's recommendation: authorize metadata-only existence checks; prohibit content reads, imports, and any runtime classifier/error difference based on path or identity-table existence.

### 7.2 The precedent that makes this non-trivial — verified, not paraphrased

`reviews/L1-S01-rework-2.md` MUST-FIX 2, found independently by all three lenses:

> `GRANT USAGE ON SCHEMA identity TO debateai_obs_listener` … creates a working **existence oracle** over the excluded zone — `identity."user"` / `identity.mfa_factor` → 42501 while `identity.no_such_table` → 42P01 — so zone table names become enumerable. Pre-fix, both leaked nothing.

And the lane-2 packet, lesson 3: *"Never strengthen a test by weakening the system."* The mission has already paid for this lesson once, with three review rounds. The seat is right to raise it.

### 7.3 Evaluation — the recommendation is UPHELD in substance

Four independent grounds, each checked:

**(a) The check is load-bearing, not decorative.** Manifest-reality catches the manifest naming a path that no longer exists. If `registration.ts` is renamed and the manifest is not updated, the anchored-prefix matcher (RT-11) silently stops matching, every zone frame reclassifies as `SHARED`, and `registration.ts:line` frames flow into sinks — **the exact RT-07/FID-10 leak the whole slice exists to prevent**, arriving silently. That is the same rot this correction is fixing, in the manifest instead of in a line number. Deleting the check to satisfy a literal reading of "never inspected" would trade a hypothetical oracle for a real leak.

**(b) It does not breach the letter.** FinalPlan §E.1 prohibits *"inspection **inside** the zone"*. `stat()` reads a directory entry; it does not open the file, does not read a byte of zone content, does not execute zone code, and creates no import-graph edge. The prohibition targets content and code-coupling; existence-of-a-name is a property of the filesystem namespace.

**(c) It does not breach the spirit — and this is the argument that actually settles it.** An oracle is dangerous in proportion to **who can ask and what they learn**. The manifest **already names all four paths in plaintext, in-repo, under version control**. A test that asserts those same literal paths exist is readable by exactly the population that can already read the manifest. **The check therefore conveys zero incremental bits to anyone.** Contrast the L1 grant, which handed a *runtime database role* a live probe over names it did not have — that added real bits to a party that lacked them. The two cases differ in kind, not degree.

The corollary is the load-bearing part, and it is why the authorization must be written narrowly rather than as "metadata-only is fine": **this reasoning holds only while the probe set is exactly the manifest's own literal path set.** The moment the probe set becomes dynamic, or a directory is enumerated, the zero-bits property is gone.

**(d) The seat blocked before writing anything.** Correct behaviour, correctly rewarded. No worker defect.

### 7.4 Where the recommendation is TIGHTENED — four gaps

**T1 — the probe set is unbounded in the seat's formulation.** `readdir("apps/api/src/")` is also "metadata-only", and it is an **enumeration primitive**: it discovers zone-adjacent files *not* in the manifest. This is not hypothetical — `apps/api/src/mfa.ts` **does not exist at lane base `29f370e` and does exist at `dev` HEAD**, importing `AuthFlowError` from `./registration.js` and `PostgresIdentityRepository` from `@debateai/db`. A directory enumeration would discover it; a closed-set existence check cannot. → **Existence checks are closed over the manifest's own literal path set. Verification, never discovery. No `readdir`, no glob, no walk, no probe of any path not literally in the manifest.**

**T2 — "in the S04 test process" scopes to the wrong thing.** The same check will be wanted by S12 (CI inventory gate), S18 (daemon), S21 (watchdog). The rule must be about **process class**, not ticket id. → **Permitted** in any process that (i) is not on a request-serving path, (ii) is not the fix-executor or diagnosis worker, and (iii) emits only to a human-read gate. **Prohibited** in `packages/obs-capture` runtime, in the api/runner/scheduler request paths, in the obs-daemon's diagnosis worker, and in the fix executor — in every case, always.

**T3 — "no runtime difference" omits timing.** → extend to **value, error class, error message, AND duration** (§6.2). `RT-08/IC-2` equal-work is a timing property and `G1-acc-5` is a timing test; a value-only prohibition leaves the timing oracle open.

**T4 — the failure *message* is itself an egress channel, and this mission builds the thing that reads messages.** If manifest-reality fails with `apps/api/src/registration.ts does not exist`, that string lands in CI output — and this mission is constructing a listener that ingests error output. → **Manifest-reality failures are gate-local and human-read.** Nothing derived from them may reach a sink. The only zone-drift signal permitted into any sink remains `ZONE_DRIFT_DETECTED` carrying **manifest hash + day bucket only** (RT-12/FID-10); which path drifted is discoverable solely by a human running `obsctl reveal-drift` locally.

### 7.5 Where the recommendation's FRAMING is CORRECTED — partition by file, not by check-type

The seat treated "existence checks" as one category to be authorized or refused. That is the wrong axis, and it is why its own blocker felt unresolvable. **The prohibition partitions by file:**

| file | import | content read | existence check | why |
|---|---|---|---|---|
| `apps/api/src/index.ts` | forbidden | **AUTHORIZED — required** | n/a | **Not a zone internal.** S04's own `readonly` names it the mount-list source. Reading it as text is the *only* way to satisfy "the three mounts string-match `buildApi`", and the only way to resolve the region rather than assume it. |
| `apps/api/src/registration.ts` | **forbidden** | **forbidden** | **authorized** (closed set) | zone internal |
| `apps/api/src/mail-channel.ts` | **forbidden** | **forbidden** | **authorized** (closed set) | zone internal |
| `packages/db/src/identity.ts` | **forbidden** | **forbidden** | **authorized** (closed set) | zone internal |
| `migrations/0030..0033` | **forbidden** | **forbidden** | **authorized** (closed set) | zone-set members |
| **identity schema / tables** | **forbidden** | **forbidden** | **FORBIDDEN OUTRIGHT** | §7.6 |

Once the axis is *file* rather than *check-type*, the S04 contradiction dissolves: **"assert every path exists"** applies to the zone-internal files (existence only) and **"the three mounts string-match `buildApi`"** applies to `index.ts` (content read, authorized). Two different files, two different rules, no conflict. The blocker was real and the ambiguity was real; it was an ambiguity about *which file*, and the ticket's readonly grant of a 43-line window made that impossible to see.

### 7.6 The identity-table deny set — NO reality check of any kind, anywhere

Ruled separately and at maximum strictness:

> **No test, tool, migration, daemon, worker, or gate belonging to this mission may perform any operation capable of distinguishing "this identity table exists" from "this identity table does not exist."** No `information_schema` query, no `pg_catalog` read, no `has_table_privilege`, no `to_regclass`, no probe SELECT, no error-code discrimination, no reading of `migrations/0030..0033` content. In every process, including tests, including local developer runs.

The deny set's correctness is a **custodial** property, established by V at the **RP-1 dual-custody re-pin**, not a test property. This is the L1 finding applied at full strength: L1's oracle existed *only* to sharpen a denial message, and the mission's own verdict was that **the test got stronger by making the system weaker**. A deny-set reality check would be that mistake a second time, with the benefit of hindsight.

### 7.7 The authorized manifest-reality test — normative form

```
MR-1  For each path P in manifest.zonePathPrefixes ∪ manifest.compiledAlternatePrefixes:
        lstat(join(repoRoot, P)) succeeds and P is a literal member of the manifest.
        No readdir. No glob. No walk. No path not literally in the manifest. No content read.
MR-2  resolve(read(apps/api/src/index.ts)) returns ok && shapeOk,
        and manifest.mountList deep-equals resolve(...).mounts.map(m => m.path), in order.
        (Content read of index.ts — authorized, §7.5.)
MR-3  Decoy non-match (RT-11): a synthetic identity.ts OUTSIDE the zone prefixes
        does not match the anchored-prefix matcher. Synthetic fixture; no zone file touched.
MR-4  manifest.identityTableDenySet is asserted NON-EMPTY and WELL-FORMED only.
        Its members are NEVER probed, resolved, or compared against any live catalog. (§7.6)
MR-5  Failures of MR-1..MR-4 are gate-local. No path, filename, table name, or
        identity string derived from a failure reaches any obs sink. (§7.4 T4)
```

`MR-2` is what unblocks `t_d1e18a14`: with `index.ts` readable in full as text, the third mount is reachable, and the assertion **calls the resolver over the real file** instead of echoing the ticket's own numbers — which was precisely the seat's objection (*"asserting the third route from the ticket text would only echo the manifest and would not call/prove product reality"*). That objection was correct and is now satisfied.

---

## 8. MIGRATION PATH FOR THE 32 TICKETS

### 8.1 Ground truth — enumerated from the board, not estimated

`hermes kanban --board observability-loop` over every card: **35 tickets contain the string `193-235`.**

- **32** carry it inside the shared `GLOBAL-FORBID (applies IN ADDITION…)` block — **exactly the 32 slice tickets**, byte-identical, one occurrence each. **These are the migration surface.**
- **3** carry it in prose on **closed planning/gate cards**: `t_a0e77dcf` (G5 VerticalSlices), `t_b7cb7d21` (H5 VerticalSlices gate), `t_24c2f95d` (LANE PLAN APPROVAL). **DO NOT EDIT — §8.4.**

The 32: `t_1fde033d` `t_8e040ec2` `t_489ecbcc` `t_9b5ca941` `t_d1e18a14` `t_6e99d607` `t_5504afe0` `t_9f4e5bfb` `t_c1651ebb` `t_3c54fdeb` `t_6c5e1a6e` `t_7efcd635` `t_a0ce760a` `t_1ca8851f` `t_89061516` `t_a85ad2d8` `t_aab2d3d2` `t_f6593842` `t_220330f5` `t_f4439c53` `t_2a85cd89` `t_0cd47a46` `t_37f2f56f` `t_5aca48c6` `t_27975928` `t_af6161bf` `t_286bde80` `t_d55caea1` `t_49e079f4` `t_28c5c2e2` `t_8cf81861` `t_af2a1c41`.

Three of the 32 carry **additional** body occurrences beyond the shared block (S04 `t_d1e18a14`, S08 `t_c1651ebb`, S09 `t_3c54fdeb`) — §8.3.

### 8.2 Pass 1 — mechanical, all 32

Replace the §3.1 FIND string with the §3.1 REPLACE string. One occurrence per ticket, byte-identical in and byte-identical out.

Add one glob to each `tests:` field (§5.6): `tests/architecture/obs-l<LANE>-<SLICE>-zone-integrity.test.ts`.

**Verification, using the H6A precedent** (*"byte-identical on 32/32"* — `reviews/H6A-diffcheck-opus.md` §2.2):
1. New GLOBAL-FORBID paragraph **byte-identical on 32/32**.
2. Occurrences of `193-235` **in any open ticket body: zero**.
3. `resolveZoneRouteMountRegion` present on 32/32.
4. Added glob present on 32/32; **zero prefix collisions** (partition key unchanged).
5. Ticket count still 32; `risk_tier` + reason on 32/32; GUARD-RAILS byte-identical on 32/32.

### 8.3 Pass 2 — the three tickets with extra occurrences

**S04 `t_d1e18a14` — `contract.readonly`. This is the unblock.**

FIND:
```
contract.readonly: packages/obs-capture/src/{context,emit}.ts (S03b) · the zone paths AS STRINGS ONLY, never imported · apps/api/src/index.ts:193-235 AS THE MOUNT-LIST SOURCE, READ-ONLY (the manifest enumerates these three routes; it never edits them).
```
REPLACE:
```
contract.readonly: packages/obs-capture/src/{context,emit}.ts (S03b) · apps/api/src/index.ts IN FULL, READ-ONLY AS TEXT, AS THE MOUNT-LIST SOURCE — index.ts is NOT a zone internal; reading it in full is REQUIRED, because the zone-route-mount region is RESOLVED at check time, never assumed from a line number (the manifest enumerates the three mounts; it never edits them, and no slice writes inside the resolved region) · the THREE ZONE-INTERNAL files (apps/api/src/registration.ts · apps/api/src/mail-channel.ts · packages/db/src/identity.ts) and migrations/0030..0033: PATH STRINGS ONLY — never imported, never content-read; METADATA-ONLY existence checks are authorized but ONLY over the manifest's own literal path set (no readdir, no glob, no walk) · the identity schema/tables: NO existence check of any kind, in any process, including tests.
```
Also strike from GREEN: *"manifest-reality test asserts every path exists and the three mounts string-match `buildApi`"* → replace with **MR-1..MR-5** verbatim (§7.7).

**S08 `t_c1651ebb` — `contract.forbidden`.** `**the zone-route-mount region :193-235** (GLOBAL-FORBID; H5-01) · the obs-client-report-mount line (S09 / TP-4, post-:235)` → `**the zone-route-mount region** (GLOBAL-FORBID; H5-01; SEMANTIC — resolved, never a line range) · the obs-client-report-mount line (S09 / TP-4, strictly after the region's closing brace)`. Its `contract.allowed` error-handler anchor `:158-191` and `readonly` `:130-140` are separately rotted — §9.2.

**S09 `t_3c54fdeb` — four sites.**
1. `contract.allowed` TP-4: `(:235 at dc9fd57) — recommended immediately alongside the /v1/session mount (:237), i.e. in the post-zone route area :236+` → `at an offset strictly greater than resolveZoneRouteMountRegion().endOffset, at the same nesting level, in the post-zone route area. The insertion point is RESOLVED, never a line number. SYNTAX IS AUTHORITATIVE. (Orientation only, non-normative: that closing brace and its neighbouring /v1/session mount were :235/:237 at dc9fd57, are :248/:250 at 29f370e, and are :739/:778 at dev.)`
2. `contract.forbidden`: same substitution as S08.
3. **RED→GREEN — strike the old criterion outright:** `**ZONE-INTEGRITY ASSERTION (new, H5-01):** an architecture test asserts apps/api/src/index.ts:193-235 is BYTE-IDENTICAL to its pre-slice state.` → `**ZONE-INTEGRITY ASSERTION (H5-01, CORRECTED — S04-zone-boundary-correction.md §5):** ZI-1 shape (baseline-free) · ZI-2 content identity of the SEMANTICALLY RESOLVED region against the lane's merge-base, resolved independently on each side · ZI-3 containment (this slice's new mount resolves strictly after endOffset) · ZI-4 no-import. Any resolution failure FAILS CLOSED per §6.1; no line-range fallback exists.`
4. `risk_tier` reason: `edits the file whose :193-235 range is the excluded zone's route mount block` → `edits the file that contains the excluded zone's route-mount region`.

### 8.4 Pass 3 — what must NOT be edited

- **The 3 closed planning/gate cards** (`t_a0e77dcf`, `t_b7cb7d21`, `t_24c2f95d`). They are **historical evidence**: they record what was true at `dc9fd57`, which §1.1 confirms was true. Rewriting a closed gate record to match later reality destroys the audit trail and would erase the H5-01 finding's own provenance. Leave them. If cross-referencing is wanted, a **comment** may point at this document; the body does not change.
- **Ticket comments** anywhere on the board, including the codex WORKER CLAIM / BLOCKED comments and the Router note on `t_d1e18a14`. Comments are append-only evidence. Never rewritten.
- **`reviews/**`** — H5, H6A, L1-S01 rework records. Same reasoning.

### 8.5 Pass 4 — the source documents, or the rot re-enters at the next ticketization

Tickets are generated **from** `VerticalSlices.md`. Fixing 32 tickets and leaving the source means the next H6 pass re-imports `:193-235`.

| document | site | change |
|---|---|---|
| `planning/VerticalSlices.md` | §0 GLOBAL-FORBID bullet | §3.2 replacement |
| " | §1 preamble | *"Line numbers are anchors verified at `dc9fd57`"* → add: **anchors are non-normative, must carry their commit, and are superseded by the syntactic definition wherever one exists; a syntactically-defined region MUST be resolved, never addressed by number.** |
| " | S04 `readonly` + GREEN | §8.3 |
| " | S08 `forbidden` | §8.3 |
| " | S09 `allowed`/`forbidden`/GREEN/`risk_tier` | §8.3 |
| " | §2 TP-4 row | remove `(:235)` / `(:237)`; state "strictly after the resolved region" |
| " | §8 H5-01 rework-ledger row | **append** a correction note; do **not** rewrite the H5-01 finding — it was correct at `dc9fd57` |
| `planning/FinalPlan.md` | §E.2 | `apps/api/src/index.ts:205-234` → semantic definition. **Note: §E.2 says `:205-234` while §0 says `:193-235` — two different ranges for the same boundary in the same plan set.** Both go. |
| " | §E.2 | `packages/db/src/index.ts:590-603` → the H5-09-corrected block, semantically defined (§9.1) |
| " | §E.5 | manifest-reality sentence → **MR-1..MR-5** |
| `goal-packets/lane-1-s01.md`, `lane-2-capture.md` | GLOBAL-FORBID restatement | §3.1 replacement |
| `planning/H6-selfaudit.md:130` | records the S09 byte-identity assertion | **append** a superseded-by note; do not rewrite history |

### 8.6 Sequencing, authority, and the in-flight lane

1. This document + Grok's independent correction → adjudicated (A5-corrected: non-code gate ⇒ **both** seats, blind, fired together).
2. Router applies §8.2 → §8.5, in that order, then runs the §8.2 verification list.
3. Router (or H6) authors `tests/support/zone-boundary.ts` and re-runs the §4.4 matrix as landing evidence.
4. `t_d1e18a14` → `todo` with corrected contract. **`rework_round` UNCHANGED. No worker defect** — the seat blocked before writing, created no S04 file, and was right on both counts. Its blocker comment stands as the evidence of record.
5. **`t_489ecbcc` (S03a) is `running` right now** with the stale paragraph in its body. S03a is a package scaffold; it goes nowhere near `apps/api`, and the stale bullet only forbids a region it never approaches — so **do not interrupt it.** Edit its body in the same pass **and post a comment** stating the paragraph changed mid-flight, that the change relocates a prohibition S03a does not approach, and that its `tests:` field gained one glob. A silently-mutated contract under a running seat is its own defect class.
6. `t_1fde033d` (S01, `done`, merged at `29f370e`) — body edited for consistency; **its comments and review records are untouched**. Nothing is re-opened: §2.2 proves S01 could not have violated the region, since the region is byte-identical between `dc9fd57` and `29f370e`.

---

## 9. THE SAME DEFECT ELSEWHERE — SCOPED, NOT SWALLOWED

### 9.1 `packages/db/src/index.ts:587-603` — in scope; and TP-2 is an ACTIVE HAZARD

This is the **other GLOBAL-FORBID zone anchor**, so it is squarely inside this correction's remit.

- At `dc9fd57` **and** at lane base `29f370e`: `:587` `export {`, `:588` `auditEvent`, `:589` `channelBinding`, `:603` `} from "./identity.js";` — **exact, both**.
- At `dev`: the same block is at **`:1477-1495`**; `:587` is now `function typedPoolFailure(…)` and `:603` is `function rejectKnownFailure(…)`; the file is **1496 lines, not 603**.

**Semantic replacement:** *the single `export { … } from "./identity.js";` declaration in `packages/db/src/index.ts`, from its `export` token through the terminating semicolon, inclusive; required to contain the `auditEvent` and `channelBinding` specifiers.* Resolvable by the same masked-scan technique, no new machinery.

**TP-2 is the urgent part.** H5-09 restated TP-2 as *"an APPEND after `:603` (EOF), never an edit inside the block."* At `dc9fd57`/`29f370e` `:603` **is** EOF. On a `dev`-derived integration base, appending "after `:603`" writes into the **middle of a 1496-line file, at `function rejectKnownFailure(…)`**. Restate as: **append at end-of-file, after the final `export … from "./identity.js";` declaration — EOF is the anchor, resolved, never a number.** This is a scheduled bad write, not a documentation nit; it should be corrected in the same pass and not deferred.

### 9.2 S08 and S11 anchors — same class, lower tier, must still be re-derived

Not security boundaries; still rotted, still capable of blocking a seat exactly as S04 was blocked.

- **S08 `apps/api/src/index.ts` error-handler `:158-191`** (incl. stream-abort branch `:159-176`): `api.setErrorHandler` is at `:158` at `dc9fd57`, **`:160`** at `29f370e`, **`:418`** at `dev`. Semantic form: *the sole `api.setErrorHandler((…) => { … })` call expression, from callee start to the statement's closing `)`/`;`.*
- **S08/S09 `readonly` `apps/api/src/index.ts:130-140`** (`resolveSession` — flagged THREAT EVIDENCE): rotted. Semantic form: *the `resolveSession` function declaration in full.*
- **S11 `packages/providers/src/index.ts` `call()` `:195-386`, exhaustion throws `:371-379`/`:380-385`**: **not yet re-derived by this seat** — flagged, not asserted. Semantic form: *the `call()` function body, required to contain the post-loop `ProviderContentUnacceptedError` and `ProviderCallFailedError` throws.* The H5-02 finding (round 0's `:195-290` excluded the only site where the obligation could be met) is the same class as H5-01: a range that silently excluded its own target. **Router should re-derive before S11 dispatch.**

**General rule this correction establishes, mission-wide:**

> **Every file-contract region that has a syntactic identity is stated syntactically and resolved at check time. A line number may appear only as commit-stamped orientation and is never normative. A region with no syntactic identity must state its resolution procedure explicitly, or it is not a region.**

### 9.3 `vitest.config.ts` — GLOBAL-TEST-SURFACE is stale too (adjacent; flagged, not ruled)

§0 GLOBAL-TEST-SURFACE asserts, as **verified**: *"`vitest.config.ts` sets `test.include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` … `tests/**` is therefore the repo's only vitest-collected location."*

That was true at `dc9fd57` and at `29f370e`. **On `dev` it is committed with a third entry:**

```
include: [ "tests/**/*.test.ts", "tests/**/*.test.tsx", "acceptance/**/*.test.ts" ]
```

`acceptance/**` is now a collected location. This affects the "only collected location" premise and touches **S16** (acceptance + chaos harness), whose deliverables live under `acceptance/`. Same rot class, different artifact. **Outside this correction's remit** — flagged for Router follow-up before S16 dispatch, and noted here because it will otherwise be discovered by a seat mid-slice, which is how S04 was discovered.

---

## 10. QUESTIONS FOR V

### 10.1 PRIMARY — the smallest question, and the only one blocking nothing but needing an answer

> **Does `tests/support/zone-boundary.ts` — the resolver that every lane's zone-integrity gate depends on — join the OBS-R104 self-modification set (custodian-only, changeable solely by dual-custody re-pin), or is it an ordinary H6-owned shared fixture under the existing `tests/support/**` lane-readonly rule?**

Why it is V's and not ARCH's: OBS-R104 membership is a **custody** decision, and E6-02 was amended in Batch 5 to **single custodian (V alone)**. The file is functionally in the R104 class — it is a security-critical artifact whose compromise silently disables a boundary guard on 32 lanes — but membership was enumerated (policy bundle, allowlist, zone manifest, `obsctl`, audit writer, chain/proof key paths) before this file was contemplated. ARCH should not enlarge a custody set by implication.

Both answers are workable and neither blocks S04:
- **Ordinary fixture:** `tests/support/**` is already GLOBAL-FORBID readonly to every lane, so no lane can weaken it; the Router/H6 owns it. Lighter, and consistent with the existing seven fixtures.
- **R104 member:** changes only by dual-custody re-pin; strictly stronger; adds a custodial step to every future resolver change.

**ARCH's recommendation: ordinary H6-owned fixture**, because `tests/support/**` already carries the RT-30 human-owned-invariant protection and R104 exists for artifacts the *obs system itself* could otherwise mutate at runtime — which this file, never loaded by any runtime process, cannot be. Recorded as a recommendation so V's answer is a ratification or a correction, not a fresh design task.

### 10.2 SECONDARY — merge-time, not S04-blocking, and it is a security question

> **Is `apps/api/src/mfa.ts` a zone internal?**

Facts, verified: it **does not exist at lane base `29f370e`** and **does exist at `dev` HEAD**, where `if (options.mfa !== undefined)` (`:741-776`) mounts four `/v1/auth/mfa/*` routes into it; it imports `AuthFlowError` from `./registration.js` and `PostgresIdentityRepository` from `@debateai/db`. The mission's zone-internals set (`registration.ts`, `mail-channel.ts`, `identity.ts`) was fixed under OBS-R130/R134/R135 **before this file existed**.

Under producing-module classification (the binding R-E5 default), an error thrown inside `mfa.ts` classifies as *"repo frame, not in manifest"* → **SHARED** → **full capture with frames retained**. If `mfa.ts` is identity-zone code, that is an RT-07-class leak arriving through the merge rather than through any lane's defect.

**Not ARCH's to settle**, on two grounds: zone membership was ruled by V, and this seat has deliberately **not read `mfa.ts`'s contents** beyond its import list — reading a candidate zone internal to argue it into the zone would be the same category error §7 rules against. **Deferred to the merge onto the `dev`-derived integration base; must be answered before that merge, not after.** It does not block S04: at lane base the file does not exist, and the §3.1 uniqueness + exact-three clauses keep the boundary from silently absorbing the MFA block either way.

---

## 11. RESIDUALS AND WHAT THIS SEAT DID NOT DO

- **Wrote no code.** §4.6 is a specification transcribed from a verified prototype (run in scratch, outside the repo). The implementing seat re-runs the §4.4 matrix and commits its output.
- **Edited no ticket, no plan document, no goal packet.** The Router applies §8.
- **Touched nothing inside the excluded zone.** No zone-internal file was opened. `apps/api/src/index.ts` was read as text (authorized — §7.5); `mfa.ts` was inspected only for its import list, and is flagged rather than judged.
- **Did not re-derive S11's `packages/providers/src/index.ts` anchors** — flagged in §9.2 for the Router.
- **Did not rule on §9.3** (`vitest.config.ts` / `acceptance/**` collection) — adjacent defect, flagged for the Router before S16.
- **Did not consult Grok's parallel output** and did not seek it (A5-corrected: blind parallel seats).
- **Open dependency:** §10.1 must be answered before `tests/support/zone-boundary.ts` is treated as a settled custody artifact. It does not block authoring the file, applying §8, or dispatching S04.
