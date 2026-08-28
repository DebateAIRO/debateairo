# S04 ZONE-ROUTE-MOUNT BOUNDARY — GROK ARCHITECTURE RULING

- **Seat:** ARCHITECTURE, Grok (intake amendment **A5** — independent parallel seat). Blind to the sibling Opus architecture seat; that artifact was not opened.
- **Occasion:** coding-seat blocker on `t_d1e18a14` (S04), Router-accepted 2026-08-26. File-contract defect: GLOBAL-FORBID's `zone-route-mount region` is defined by a line range that has already drifted, and the byte-identity guard still passes because it guards the drifted window.
- **This seat writes no ticket and no product/test file.** The Router applies the correction. The only write is this document.
- **Inputs read:** `planning/VerticalSlices.md` §0 GLOBAL-FORBID, §1 region-granularity rule, slice S04, S08/S09, H5-01 ledger; `planning/FinalPlan.md` §E; `research/POST-SYNTHESIS-RULINGS.md` R-E5; `research/SYNTHESIS-requirements.md` OBS-R130/R131/R133/R134 and DIV-07 (enumeration oracle); `hermes kanban --board observability-loop show t_d1e18a14` (board flag before the verb); real `apps/api/src/index.ts` in workspace HEAD and in `.worktrees/obs-lane-2`. Sibling correction *style* (`S03a-contract-correction.md`, `S02-registry-pin-correction.md`) consulted for document shape only. No excluded-zone file was opened.

---

## 0. The defect, independently verified

Prompt line numbers were not treated as facts. Both live copies of `apps/api/src/index.ts` were text-scanned (no import of `apps/api` or of any excluded-zone module). Observed hits:

### 0.1 Lane worktree (`.worktrees/obs-lane-2`, commit `29f370e`)

| Semantic site | Observed line | Plan (`dc9fd57` / GLOBAL-FORBID) |
|---|---|---|
| `if (options.registration !== undefined) {` | **:206** | :193 |
| `api.post("/v1/auth/register"` | **:218** | :205–216 |
| `api.post("/v1/auth/verify-email"` | **:230** | :217–225 |
| `api.post("/v1/auth/resend-verification"` | **:239** | :226–234 |
| block close `}` | **:248** | :235 |
| `from "./registration.js"` | :47 | :45 |

Inside the pinned window `:193-235` on this file:

- line 193 is mid-expression `: argon2Unavailable ? 503` (error-handler ternary, not the registration `if`);
- line 235 is mid-`verifyEmail` `token: typeof body.token === "string" ? body.token : ""`;
- the third mount (`api.post("/v1/auth/resend-verification"`) occurs **zero** times in `:193-235` (it is at 239).

`:193-235` is therefore **not a complete registration block** on the lane. The coding seat was right to refuse to read past 235 and right to refuse to echo the third route from ticket prose.

### 0.2 Workspace HEAD (commit `80362d0`)

| Semantic site | Observed line |
|---|---|
| `if (options.registration !== undefined) {` | **:708** |
| `api.post("/v1/auth/register"` | **:709** |
| `api.post("/v1/auth/verify-email"` | **:721** |
| `api.post("/v1/auth/resend-verification"` | **:730** |
| block close `}` | **:739** |
| `from "./registration.js"` | :68 |

HEAD `:193-235` contains **none** of the four needles (opener + three `api.post` mounts). Line 193 is a blank line above `AskPrincipal`; line 235 is the closing brace of `AskRefusal`. The accounts-mission work that shifted the lane ~13 lines has, on HEAD, shifted the same block by **five hundred lines**.

A new numeric pin taken from either tree is already stale in the other tree before it can be written. That is the proof that a line range cannot be the definition.

### 0.3 Why the current guard is worse than no guard

VerticalSlices S09 GREEN promised: an architecture test asserts `apps/api/src/index.ts:193-235` is byte-identical to its pre-slice state. Independently verified: **that test is not present under `tests/`**. Grep over `tests/**/*.{ts,tsx}` finds zero `193-235`, zero `zone-route-mount`, zero `obs-l4-s09`. The "every lane runs" assertion is today a ticket obligation only. Even once implemented as specified, it would compare the same numeric window on both sides of a shared upstream shift, and would pass while both sides guarded the wrong bytes.

That is not a cheap integrity check. It is a same-to-same tautology on a window that no longer names the thing GLOBAL-FORBID intended to protect.

### 0.4 The document already knew this and then abandoned it

VerticalSlices §1: *“Line numbers are anchors verified at `dc9fd57`; where a region is defined syntactically (a block, a function), the **syntax is authoritative** and the number is the anchor.”* H5-01 then named the region `apps/api/src/index.ts:193-235`. The tickets copied the number. The number became the contract. Syntax was demoted to a parenthetical. The rot is that promotion, not the first measurement.

---

## 1. Decision — semantic definition, not a line range

**The `zone-route-mount region` is a syntactic object, located at check time by a resolver. Line numbers are disposable diagnostic snapshots. They are never the definition, never the readonly grant, never the forbid, and never the window of a byte-identity comparison.**

### 1.1 What the region is

The region is the unique `if (options.registration !== undefined) { ... }` block in `apps/api/src/index.ts` that contains these three `api.post` path-string literals as route mounts, and those three mounts:

1. `"/v1/auth/register"`
2. `"/v1/auth/verify-email"`
3. `"/v1/auth/resend-verification"`

The region is the **entire matched block** (opener through its matching close brace), not the three mount lines in isolation. Helpers that currently live inside the block on one tree (the lane's inner `sourceFor`) are inside because they are inside the block, not because they are named. Helpers that currently live outside the block on another tree (HEAD's lifted `sourceFor` at `:332`, shared with sessions/MFA) are **outside**. The resolver follows the braces; it does not chase identifiers.

`/v1/auth/mfa/*` mounts are **not** zone. On HEAD they sit in a separate `if (options.mfa !== undefined)` block after the registration close. They must not be absorbed.

Mere string occurrences of the three paths that are **not** `api.post("` mounts — on HEAD, the `authorizationPolicyInventory` rows `{ route: "POST /v1/auth/register", ... }` and siblings — are **not** the region and are **not** added to GLOBAL-FORBID. Expanding the forbid over the policy table would block unrelated API work and is not what H5-01 protected.

### 1.2 How the resolver locates it (check-time, text only)

A lane, QA seat, or architecture test locates the region by a **UTF-8 text scan of `apps/api/src/index.ts`**. It does **not** import that module (the file imports `./registration.js`; importing it is an excluded-zone import). It does **not** parse the file with the TypeScript compiler API, does **not** walk an AST that would load zone types, and does **not** boot Fastify to introspect the route table.

Algorithm, cheap enough for every lane (one file read, O(n) over ~700–1500 lines):

1. Read `apps/api/src/index.ts` as text.
2. Find the opener substring `if (options.registration !== undefined)`. It must occur **exactly once**.
3. From that `if`'s opening `{`, brace-match to its closing `}` (a conservative matcher that skips braces inside strings, comments, and template literals). The matched span is the candidate region.
4. Inside the span, find these three mount sites as **`api.post("` + path + `"`** literals:
   - `api.post("/v1/auth/register"`
   - `api.post("/v1/auth/verify-email"`
   - `api.post("/v1/auth/resend-verification"`
   Each must occur **at least once inside** the span.
5. Outside the span, those three `api.post("` sites must occur **zero** times. (Policy-table strings that are not `api.post("` do not count.)

The three path strings are the S04 manifest's "three-route mount list". "String-match `buildApi`" means this text scan of the function that contains the block, **not** `import { buildApi }`.

Falsifiability is immediate and mechanical: a missing opener, a second opener, a failed brace match, a missing named mount, or a named `api.post` mount outside the block each produce a distinct, checkable failure. No human re-measurement of a line number is required for the check to run.

### 1.3 Fail closed

If any step fails, the assertion **fails**. Consequences, all mandatory:

- **No fallback** to `:193-235` or to any other remembered line range, including a range printed as a diagnostic snapshot in this document or on a ticket.
- **No silent shrink** of the forbid to the mounts that happened to be found (two of three is not a region).
- **No silent enlarge** to the rest of `buildApi`, to the MFA block, or to the whole file as a write prohibition beyond what GLOBAL-FORBID already states for zone internals.
- The region is **unlocatable**. No slice may treat any numeric window of `index.ts` as a substitute write or read grant for the zone-route-mount region. Humans (Router / ARCH) re-bind the *semantic predicates* if the code legitimately changed (renamed condition, changed `api.post` to another Fastify form). Lanes do not invent a new range.
- A resolver failure is a **hard gate**, not a warning, not a skip.

This is the same fail-closed posture OBS-R134 already requires of uncertain zone attribution: when you cannot prove membership, you do not guess.

### 1.4 What this does to S04's readonly grant (the immediate unblock)

S04's `contract.readonly` today names `apps/api/src/index.ts:193-235` as the mount-list source. On the lane that window does not contain the third mount, so GREEN is unsatisfiable without crossing the grant.

**Corrected S04 readonly (Router applies):** `apps/api/src/index.ts` may be read **as text** solely to run the resolver and extract the three `api.post` path-string literals. That is not an import grant, not a write grant, and not ownership of any other named region (`error-handler`, `obs-client-report-mount`). S08 and S09 remain the only writers of their regions. Reading the whole file as text is required because a resolver that started at a line number would reintroduce the defect.

This is the coding seat's proposed unblock (*"explicitly grant read-only access to `apps/api/src/index.ts` solely for static mount-string extraction"*), taken. The alternative it offered — "correct `contract.readonly` to the current semantic registration-mount block" — is the same grant described semantically rather than as a new `:N-M`. Do not pin the lane's `:206-248` or HEAD's `:708-739` as the replacement grant.

---

## 2. What replaces the line-range byte-identity assertion

**Replace** the line-range as the definition.
**Replace** `:193-235` (or any successor `:N-M`) as the window of the integrity comparison.
**Re-anchor** byte-identity onto the **resolver-selected span**.
**Supplement** with structural predicates the identity check cannot see.

A new frozen `:N-M` is **refused**. HEAD and the lane already disagree; pinning either is the same bug with a fresh number. VerticalSlices §1 already forbade this; this ruling enforces that sentence.

### 2.1 The replacement assertion (every lane, including before S09 exists)

Call it the **resolved-span integrity assertion**. It has two limbs; both must pass; either limb failing fails closed as in §1.3.

**Limb A — structure (absolute, vs the file in the tree under test):**

1. The resolver locates exactly one region.
2. All three named `api.post("` mounts are inside it.
3. None of those three `api.post("` mounts exist outside it.

**Limb B — identity (relative, vs the same worktree's pre-slice / merge-base git object of the same path):**

1. Run the same resolver on `git show <pre-slice>:<apps/api/src/index.ts>` (or the lane's named starting commit).
2. Byte-compare the two resolved spans.
3. They must be identical.

Limb B is S09's original intent (*"byte-identical to its pre-slice state"*) with the window chosen by the resolver on **each** side, not by a number copied from a plan. Comparison is **not** against whatever workspace HEAD happens to be. HEAD and a lane on `29f370e` currently contain different lawful spans of the same semantic region because other missions landed in between; comparing them would false-fail a lane that did not touch the block.

Limb A is what the old assertion never did: it actually looks at the three mounts. A same-to-same drift of code *above* the block no longer rotates the window onto an error-handler ternary. A deletion of the third mount fails A even if B would have nothing to compare.

Cost: two reads of one file (worktree + `git show`), same O(n) scan. Fit to run on every lane as a few-millisecond architecture check. Until S09 lands the collected test, the recipe is this document; QA / Router / any lane can execute it as a text scan. S09 still owns the architecture test that implements it; S04's manifest-reality test reuses Limb A (and only Limb A) to prove the three mounts string-match `buildApi`. Do not duplicate a second numeric pin "until the test exists."

### 2.2 What the assertion does *not* do

- It does not import `apps/api/src/index.ts`.
- It does not hash `:193-235` or any other numeric slice of the file.
- It does not treat MFA mounts, `/v1/session`, or the policy inventory as part of the span.
- It does not, by passing, prove the excluded-zone *internals* are untouched; those remain GLOBAL-FORBID by path (`registration.ts`, `mail-channel.ts`, `identity.ts`, identity re-export block, migrations `≤0033`).

---

## 3. Existence-check ruling — evaluated, not rubber-stamped

The coding seat flagged a second conflict and recommended: *authorize metadata-only existence checks in the S04 test process, while expressly prohibiting file-content reads/imports and any runtime classifier or error difference based on path or identity-table existence; no identity schema/table query.*

The Router called that recommendation "exactly right." **It is directionally right and under-specified. This seat does not adopt the phrase "metadata-only existence checks" as written.** An over-broad reading of "metadata" or of "any … difference based on path … existence" would either reopen the enumeration oracle or accidentally forbid producing-module classification.

### 3.1 The two clauses that actually conflict

S04 GREEN: *“manifest-reality test asserts every path exists and the three mounts string-match `buildApi`.”*

S04 launch contract / GLOBAL-FORBID: zone paths are **path-string data only**, never imported; OBS-R130/R134 — no inspection inside the zone; the D03 manifest is held *outside*.

FinalPlan §E.5 names the manifest members: zone path-prefix set (`apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts`, `migrations/0030..0033`) + compiled-shape alternate prefixes + the three-route mount list + identity-table deny set.

"Exists" cannot mean the same operation on all four of those sets. Treating them as one "metadata" grant is the mistake.

### 3.2 What the closed oracle actually is

DIV-07 / SYNTHESIS: a stored or served distinction between `VERIFICATION_TOKEN_INVALID` and `ACCOUNT_ABSENT` is an enumeration oracle. R-E5 closed it at residue granularity: zone-origin errors leave an **anonymous daily counter only** — no codes, no payloads, no traces. Classification is by **producing module**, not request route (OBS-R131): a `packages/db` pool failure on an auth route stays fully captured, route reduced to `zone`. Zone frames never survive in any sink (RT-07). Uncertain-under-context defaults excluded (OBS-R134).

The oracle is a **runtime, observer-visible discrimination** (response body, stored code, classifier branch, error class) that answers "does this identity/account/table/path-in-the-secret-sense exist?" The S3b constant-time patterns exist to suppress exactly that.

A test-time `stat` of a path string the human-owned manifest **already publishes** is not that oracle. The paths are not a secret; leaking their names in a CI log of a failed existence assertion discloses nothing the manifest does not already name. Forbidding the existence bit on those strings would make OBS-R134's "test-enforced so it cannot drift" unsatisfiable and would recreate, for files, the same silent rot this gate is correcting for line numbers: a list that still type-checks after the referent has moved or vanished.

PlanReview already recorded the complementary residual: *nothing tests zone-file coverage from outside (testing it would require reading the zone, forbidden).* That residual stands. Existence of **enumerated** paths is not coverage of **undeclared** zone files. Directory listing of zone directories to discover omitted members remains forbidden.

### 3.3 The split this seat actually authorizes

| Referent | Test-time (S04 manifest-reality only) | Runtime (classifier, capture, flusher, HTTP, SQL) |
|---|---|---|
| Source path-prefix strings in the manifest (`registration.ts`, `mail-channel.ts`, `identity.ts`, `migrations/0030..0033`) | **`exists`/`lstat` existence bit only**, repo-root-relative, on the already-enumerated strings. Fail the **test** if a named source path is absent. | **Forbidden** as an input. Classifier matches **stack-frame path strings** against the manifest prefix set (producing-module classification, OBS-R131). It must not `stat`, `open`, or branch on whether the file is present on disk. |
| Compiled-shape alternate prefixes (`dist/…` and kin) | **Must not hard-fail** if the prefix is absent in a unit-test tree. They are match prefixes for compiled stacks, not source-tree furniture. If a compiled artifact happens to be present, it is still only a prefix string. | Same as source prefixes: string match on frames, never FS existence. |
| Three-route mount list | **Not a filesystem existence check.** "Exists" here **is** Limb A of §2.1: the resolver finds the three `api.post("` literals inside the registration block. No HTTP probe, no Fastify boot, no `import` of `buildApi`. | Mount presence is not a classifier input. Classification is by producing module, not by whether a route is mounted. |
| Identity-table deny set | **String list in the manifest only.** No `information_schema` query, no Drizzle introspect, no `SELECT` against `identity.*`, no content-read of `packages/db/src/identity.ts` to harvest table names. Completeness of the deny-set strings is the same accepted OBS-R134 residual as undeclared zone files. | **Forbidden.** A runtime difference keyed on identity-table or identity-row existence **is** the enumeration oracle this mission already closed. |
| Decoy `identity.ts` outside the zone (RT-11) | Lawful fixture, not a zone path. Planted by the test in a non-zone directory; matcher must non-match. Must not be written into the zone. | N/A |

**Prohibited in every process, including tests, with no "metadata" exception:**

- `open` / `readFile` / `git show` of excluded-zone internals (`registration.ts`, `mail-channel.ts`, `identity.ts`).
- `import` of those modules, of `apps/api/src/index.ts`, or of any barrel that loads them.
- Directory listing of zone directories to enumerate undeclared files.
- Hash, size, mtime, mode, inode, or permission of a zone file (those are inspection of zone internals, not the existence bit).
- Any SQL against the `identity` schema/tables.

GREEN already required "every path exists." This ruling does not add a new class of check; it says **how** "exists" is proven and **what it must not become**. The launch contract's "never inspected" is resolved as: never inspect **contents**, never import, never query identity schema, never let existence change a **runtime** classifier or error. Filesystem existence of already-enumerated source path-strings in the S04 test process is verification that the string list still names files.

### 3.4 Where the seat's recommendation is refused or tightened

1. **"Metadata-only" is too broad.** Authorized metadata is the existence bit of enumerated source path-strings. File size/mtime/hash/mode are metadata too, and they are **not** authorized.
2. **"Any runtime classifier … difference based on path … existence"** must not be read as forbidding **stack-frame prefix match** against the manifest. That match *is* producing-module classification. The forbidden runtime operation is **filesystem or schema existence** as a classifier or error-class branch. Frame-path string match stays.
3. **"If that is intended"** is not left open. It **is** intended: S04 GREEN already said so. This is a clarification of means, not a new authorization V must re-ratify.
4. Identity-table "existence" is **not** analogized to file existence. The seat was right to say no identity schema/table query should ever occur; this seat makes that a hard split in the table above rather than a sibling clause of `fs.existsSync`.

An imagined sibling ruling that quotes the Router's "exactly right" and stops would under-specify the compiled-shape case, the mount-list case, and the frame-match case, and would leave a future coding seat free to `stat` identity via SQL under the word "metadata." That is the rubber stamp this gate is supposed to refuse.

---

## 4. Same rot class, recorded, not expanded

This gate does **not** re-pin or re-specify these; they are the same defect class and will rot the same way if left as numbers:

- **S08 `error-handler` `:158-191`.** On the lane, `api.setErrorHandler` opens at **160** and the handler continues through **204** (the `:193-235` window starts *inside* it). Syntax is already the real region (`api.setErrorHandler(...)`); the number is an anchor. Out of scope here.
- **Identity re-export block `:587-603`.** Intact on the lane (`auditEvent` 588, `channelBinding` 589, block 587–603). On workspace HEAD the analogous export block sits near **1477–1495**. Same silent-shift class. Out of scope here.
- **`./registration.js` import `:45`.** Observed at **47** (lane) and **68** (HEAD). A citation, not a region. Stop restating it as a pin.

A later correction may apply this document's pattern (syntax + resolver, numbers as snapshots) to those regions. Do not do it as a rider on S04.

---

## 5. Migration path — Router applies; this seat edits no ticket

Source of truth after this ruling is **this document + VerticalSlices §0 as the Router will restate it**. Tickets remain copies. Historical correction files (`S03a-contract-correction.md`, `TP-10-typecheck-criterion-correction.md`) that *quote* `:193-235` as then-current GLOBAL-FORBID may keep the quote as history; they are not the operative contract.

**Mechanical restatement, all 32 slice tickets** (every card that restates GLOBAL-FORBID, plus the extra S04/S08/S09/L2/L4 clauses):

1. In the GLOBAL-FORBID bullet currently headed `apps/api/src/index.ts:193-235 — the zone-route-mount region`, **delete the line range from the definition.** Replace with the verbatim definition in §END.1. Parenthetical mount ranges `:205-216` / `:217-225` / `:226-234` and the import anchor `:45` are removed from the contract. They may appear once, if at all, as a *diagnostic snapshot tagged with commit `dc9fd57`*, never as a grant.
2. Every other occurrence of `apps/api/src/index.ts:193-235` or `zone-route-mount region :193-235` on those 32 cards becomes the named region `zone-route-mount region` with the semantic definition, or a pointer at GLOBAL-FORBID, **without a number**.
3. **S04 `contract.readonly`:** replace `apps/api/src/index.ts:193-235 as the mount-list source` with: `apps/api/src/index.ts` as text, resolver + mount-string extraction only; never imported. Zone paths remain strings only, never imported.
4. **S04 GREEN** "every path exists": keep the clause; bind it to §3.3 (source-path existence bit; mounts via resolver Limb A; compiled-shape prefixes not a hard-fail; identity-table deny set is strings, never SQL). Keep "three mounts string-match `buildApi`" as Limb A, never as an import.
5. **S08 / S09 `forbidden:`** name the `zone-route-mount region` semantically. Drop `:193-235`.
6. **S09 TP-4 allowed:** already says syntax is authoritative (*after the registration block's closing brace*). Delete `:235 at dc9fd57` as an insertion coordinate. `/v1/session` remains a *recommended neighbor*, not a pin — on HEAD, session is at `:778` with the MFA block in between; the lawful insert is still immediately after the registration close, not "wherever session is."
7. **S09 GREEN zone-integrity assertion:** replace "asserts `:193-235` is byte-identical to its pre-slice state" with the resolved-span integrity assertion (§2.1, both limbs). Comparison base = that lane's pre-slice git object, not workspace HEAD.
8. **LANE-PLAN-APPROVAL** L2 readonly and L4 forbidden/TP-4 lines: same substitutions, because that document restates the same numbers. Router applies; this seat does not edit it.

No ticket is split. `rework_round` on `t_d1e18a14` is unchanged (no worker defect; no S04 file was written). After the restatement, S04 is unblocked to text-scan `index.ts` for Limb A and to `stat` enumerated source path-strings as specified in §3.3.

---

## 6. Independence note

A sibling Opus ruling is expected to agree on "syntax, not `:193-235`." This seat would disagree with that sibling if it:

- re-pins HEAD `:708-739` or lane `:206-248` as the new definition "for now";
- implements or requires a TypeScript AST / `buildApi` import to locate the mounts;
- absorbs `/v1/auth/mfa/*` or the policy-inventory rows into the region;
- rubber-stamps "metadata-only existence checks" without splitting compiled-shape prefixes, mount-list "existence," identity-table SQL, and stack-frame prefix match;
- compares resolved-span bytes against workspace HEAD rather than the lane's pre-slice object.

Those are the failure modes this text is written to close.

---

## 7. V question

**None.** Smallest candidates considered and declined:

- *May S04 `stat` enumerated source path-strings?* GREEN already required "every path exists"; this is means, not a new zone-access grant. Retracting it would be a V reopen of FinalPlan §E.5, which this gate does not ask for.
- *Pin HEAD `:708-739` until a resolver lands?* Empirically stale against the lane before it is written. Architecture can refuse it without V.
- *Identity `:587-603` and S08 `:158-191`?* Same rot class; expanding this gate is the rider the objective forbids.

R-E5, OBS-R130/R134, and producing-module classification are already ruled. This document applies them.

---

# END STATE

## END.1 Corrected boundary definition (verbatim)

```text
zone-route-mount region :=
  the unique `if (options.registration !== undefined) { ... }` block
  in apps/api/src/index.ts whose body contains these three route
  mounts as `api.post("` path-string literals, and those three mounts:

    "/v1/auth/register"
    "/v1/auth/verify-email"
    "/v1/auth/resend-verification"

  Located at check time by a UTF-8 text scan of that file (brace-match
  from the unique opener; never an import of apps/api or of any
  excluded-zone module; never a TypeScript AST; never a Fastify boot).
  The region is the entire matched block. Line numbers are diagnostic
  snapshots only and are not the definition.

  Not in the region: /v1/auth/mfa/* mounts; /v1/session; path strings
  that are not `api.post("` mounts (including authorizationPolicyInventory
  rows).

  Fail closed if the opener is missing or not unique, if brace-match
  fails, if any named `api.post("` mount is missing from the block, or
  if any named `api.post("` mount appears outside the block: the
  assertion fails; there is no fallback to :193-235 or to any other
  line range; the forbid is not silently shrunk or enlarged.

  No slice may write inside the resolved block. Any new mount goes
  strictly after the block's closing brace.
```

## END.2 What replaces the byte-identity assertion

The `:193-235` (or any successor `:N-M`) byte-identity comparison is **withdrawn** as both definition and guard.

It is replaced by the **resolved-span integrity assertion**:

- **Limb A (structure):** the resolver of END.1 locates exactly one region in the tree under test; all three named `api.post("` mounts are inside it; none of those three `api.post("` mounts exist outside it.
- **Limb B (identity):** the same resolver is run on that lane's **pre-slice / merge-base** git object of `apps/api/src/index.ts`; the two resolved spans are byte-identical. Comparison is not against workspace HEAD.

A new frozen line range is not the definition. S09 owns the collected architecture test that implements both limbs; S04 manifest-reality reuses Limb A only. Until that test exists, the recipe in this document is the obligation any lane/QA may execute as a text scan.

## END.3 Migration path for the 32 tickets (Router applies; this seat edits none)

On every slice ticket that restates GLOBAL-FORBID, and on the extra S04/S08/S09 clauses: delete `:193-235` / `:205-216` / `:217-225` / `:226-234` / import `:45` from the contract; restate the named `zone-route-mount region` as END.1. S04 readonly becomes a text-scan of `apps/api/src/index.ts` for the resolver (never import). S04 GREEN "exists" binds to END.4. S09 zone-integrity GREEN binds to END.2, comparison base = that lane's pre-slice object. S09 TP-4 insertion coordinate is "after the registration block's closing brace," not `:235`. Restate the matching LANE-PLAN-APPROVAL L2/L4 lines the same way. Do not split `t_d1e18a14`; `rework_round` unchanged.

## END.4 Ruling on the existence-check ambiguity

Authorize **test-time existence-bit (`exists`/`lstat`) checks of already-enumerated source path-prefix strings** in the S04 manifest-reality test. That is how GREEN's "every path exists" is proven. It is not content inspection, not an import, and not the enumeration oracle.

Prohibit, with no metadata exception: content reads; imports of zone modules or of `apps/api/src/index.ts`; directory listing of zone directories; hash/size/mtime/mode of zone files; any SQL or schema query against `identity.*`.

Do **not** hard-fail compiled-shape alternate prefixes if absent in a unit-test tree. Three-route "existence" is resolver Limb A (text), not FS and not HTTP. Identity-table deny set is a string list; it has no existence check.

Runtime classifier and error paths must not branch on filesystem or identity-table/row existence. Stack-frame **string** prefix match against the manifest remains required (producing-module classification, OBS-R131). Residue of a zone-origin error remains an anonymous daily counter (R-E5). A runtime difference keyed on path or identity-table existence is the oracle already closed, and stays closed.

The Router's "exactly right" is accepted as direction and rejected as specification.

## END.5 V question

None.
