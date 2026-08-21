# HYG-01 — Opus 5 lens verdict (rev 2)

**Ticket:** `t_4a1f8654` · **Lane:** DR-153 dual diamond (Opus 5 + Grok) · **Route:** both lenses must greenlight
**Reviewer:** Opus 5 · **Date:** 2026-08-12
**Method:** verification by execution under DR-163 — isolated APFS clone, byte-identity verified before any
mutation, every RED/GREEN below produced by running the mutation, every restore md5-verified.

**VERDICT: APPROVED.** All three rev1 blockers are closed by execution. The diamond completes; HYG-01 closes.

Five advisories carry forward. None of them is a re-cut of this ticket: each is either a narrowing the rev2
directive explicitly scoped out, or an over-inclusive (loud, never silent) edge in a check that now works.

---

## 0. Method and isolation

`cp -Rc` clone of `DebateAI-V3` + `cp -Rc` of the repository's `.git` (the git root is the **parent**
`DebateAIRO`, not `DebateAI-V3` — rev1 hit this as a "clone artifact"; the control-byte guard shells out to
`git ls-files`, so a clone without `.git` cannot test B3 at all). The parent `.gitignore` was copied too,
without which the scanned population inflates from 739 to 11,172 paths.

Clone fidelity, measured:

```text
HEAD            real 56b256c…  clone 56b256c…                     match
ls-files pop.   real 740       clone 739                          delta = apps/v2-ui/lib/makerIdentity.ts
10 review files byte-identical (md5) at clone time and after
```

The single-path delta is **not** HYG-01: it is the concurrently-running UI-02c Codex session landing a new
file after my snapshot. See the process note below.

**I made exactly one write to the real repository: this verdict file.** The ten HYG-01 files were hashed at
20:20:09 and again at 20:29 — all ten identical (`apps/runner/src/index.ts` =
`94a9bf2b28748509589dd676e04bc709` before and after).

### Process hazard — recurring, and worth the orchestrator's attention

Rev1 flagged a concurrent lens mutating the same tree. It happened again, from a different direction. During
my clone, `tests/unit/v2ui-pages.test.ts` changed underneath the copy:

```text
PID 53376  codex exec resume 019ff616… /goal UI-02c rev1 diamond: Grok APPROVED, Opus 5 CHANGES REQUESTED…
           cwd = the repo, appending a UI-02c describe block; mtime 20:19:21
```

`tests/unit/v2ui-pages.test.ts` is a **HYG-01 file** (the item-4a drawer ratchet lives in it). This time the
collision was benign — UI-02c appended a new `describe` and touched nothing HYG-01 asserts — but a rework
session and a review session sharing one uncommitted tree is the same hazard DR-163 was written for. DR-163
currently binds *mutating lenses*; the evidence says it should bind *rework workers* too, or reviews will keep
being taken against a tree that is moving.

---

## 1. BLOCKING-1 — CLOSED. `FIXED_SINGLE_ROOT_SERVE_VIOLATED` now has a witness that is not itself

Rev2 took the pure-function route: `buildFixedSingleRootServeNodes` (`apps/runner/src/index.ts:250–270`),
consumed at the single construction site `:849`, asserted at `tests/unit/pro01-runner-tree.test.ts:43–75`.

**The decisive pair, re-run exactly:**

| # | Mutation | Focused | Full enforced suite |
|---|---|---|---|
| D′ | widen projection to **both** authored roots **+ delete the guard** | **RED** | **RED** — `1 failed \| 470 passed (471)` |
| D | widen projection to both roots, **guard in place** (honest control) | **RED** via `FIXED_SINGLE_ROOT_SERVE_VIOLATED` | — |
| — | **delete the guard only**, projection untouched (rev1 Evidence 1 replay) | **RED** | **RED** — `1 failed \| 470 passed (471)` |

D′ fails on the *output*, with no guard anywhere in the file:

```text
AssertionError: expected [ {…primary}, {…secondary} ] to deeply equal [ {…primary} ]
 ❯ tests/unit/pro01-runner-tree.test.ts:63:75
```

The third row is the one that settles rev1. At rev1, deleting the guard left the full suite **GREEN at 467**.
It is now **RED**. A check whose only witness was itself now has two independent ones: the projection shape,
and the throw.

### Why the guard could never fire before — the mechanical answer

Rev1 could not explain *why* the guard was inert; the pre-extraction source (recovered from
`logs/HYG-01-codex.log:6241`) does:

```ts
const servedNodes = Object.freeze([Object.freeze({ nodeId: servedRoot.nodeId, … })]);
if (servedNodes.length !== 1) { throw new TypedDomainError("FIXED_SINGLE_ROOT_SERVE_VIOLATED", …); }
```

The guard tested `length !== 1` on a **one-element array literal**. It was not weakly witnessed — it was
*structurally dead*, unfalsifiable by construction. No fixture anywhere could ever have killed it. Rev1's
"survives its own deletion" was the visible symptom of that.

The extraction makes it live: the new body filters the authored slice by `nodeId === servedRootNodeId`, so
the guard now fires on 0 matches or ≥2. This is the ticket's own defect class — a check that cannot fail —
found and repaired in the guard the ticket was cut over.

**Behaviour preservation — verified field by field, not asserted.** `servedRoot` is
`selectServedRoot(authoredNodes.slice(0, effectiveMakerCount)).root` = `configuredProviderRoots[0]`, i.e. an
element *of the slice the filter runs over*. So the filter yields exactly `[authoredNodes[0]]`, and the seven
mapped fields (`nodeId`, `text`, `wayOfKnowing`, `provenanceRef`, `locator`, `restatementStatus`,
`loadBearing: true`) are identical to the old literal. The projection cannot newly throw in production; it can
only throw on inputs the old code would have served wrongly. Strictly louder, never different.

---

## 2. BLOCKING-2 — CLOSED. The 49 are quarantined and the manifest cannot silently fall behind

```text
active .mjs under apps/v2-ui : 3   (next.config.mjs, scripts/run-node-tests.mjs, lib/scoringResponse.test.mjs)
quarantined *.mjs.disabled   : 49  (content preserved; verified against a sample)
manifest                     : ["lib/scoringResponse.test.mjs"]  — now a shared JSON file
```

Both directions are proven RED by execution:

| Mutation | Result |
|---|---|
| plant a stray `apps/v2-ui/test-phantom.test.mjs` | **RED** focused **and** full suite (`1 failed \| 470 passed`) — `+ "test-phantom.test.mjs"` |
| silently un-quarantine one of the 49 (`DebateCanvas.accessibility.test.mjs.disabled` → `.mjs`) | **RED** — `+ "components/DebateCanvas.accessibility.test.mjs"` |

The quarantine is real, not cosmetic: `.mjs.disabled` matches no runner's discovery, the root vitest config
includes only `tests/**/*.test.ts`, and `apps/v2-ui`'s `test` script executes the manifest alone. ADV-5
(manifest drift) is closed properly — `node-test-manifest.json` is read by *both* the runner and the
assertion, and the runner `readFile`s every manifested path, so drift fails loudly in both directions.

`pnpm --dir apps/v2-ui test` → `V2_UI_NODE_TESTS_DISCOVERED=1 / # tests 27 / # pass 27 / # fail 0`.

---

## 3. BLOCKING-3 — CLOSED. The guard now scans the population that matters, and the live NUL is repaired

Scanner is `git ls-files -z --cached --others --exclude-standard` (`tools/check-text-control-bytes.ts:39`),
with the dotfile fix (`name.startsWith(".")`) and `.mjs.disabled` folded in (`:35`).

**The live NUL is gone.** On the **real** tree, `reviews/ui02b-opus-rev1.md` now holds **0** raw NUL bytes;
offset 17229 reads the escaped form the sentence intended:

```text
 bytes**, 25,430 bytes. The `\u0000` at `:632` is a source escape inside a template lite…
```

**The guard's own sources are now covered.** All six HYG-01-created files remain untracked *and* are now in
the scanned population — the exact inversion of rev1's finding:

```text
UNTRACKED  IN_SCAN  tools/check-text-control-bytes.ts
UNTRACKED  IN_SCAN  tests/unit/text-control-bytes.test.ts
UNTRACKED  IN_SCAN  apps/v2-ui/scripts/{run-node-tests.mjs,node-test-manifest.json}
UNTRACKED  IN_SCAN  docs/…/reviews/ui02b-opus-rev1.md
```

**Plant matrix — every case run through both the CLI and the enforced vitest ratchet:**

| # | Plant | CLI | Ratchet |
|---|---|---|---|
| a | NUL in an **untracked** text file | `hyg01-untracked-probe.md:17:0x00`, exit 1 | **RED** |
| b | NUL in a **tracked dotfile with a non-text extension** (`.env.compose`) | `.env.compose:26:0x00`, exit 1 | **RED** |
| c | NUL in the **tracked `.gitignore`** (rev1 ADV-6 headline) | `.gitignore:116:0x00`, exit 1 | **RED** |
| d | NUL in a **quarantined `.mjs.disabled`** | `…DebateCanvas.responsive.test.mjs.disabled:894:0x00`, exit 1 | **RED** |
| e | **binary PNG containing 20 NULs** | `REPOSITORY_TEXT_CONTROL_BYTES=0`, exit 0 | **GREEN** |

(b) and (c) are ADV-6 closed: `extname(".gitignore") === ""` and `extname(".env.compose") === ".compose"`,
so neither is reachable through the extension set — only the new dotfile rule catches them. (e) confirms
binary assets are still correctly exempt. All four mutated files restored with md5 match.

### An unplanned live proof: this verdict tripped the guard

Writing the paragraph above, I transcribed the repaired `ui02b-opus-rev1.md` line and emitted a **raw NUL**
where the source has the six-character escape. The first run of `audit:text-bytes` after saving this file:

```text
docs/missions/2026-08-06-v3-programming/reviews/hyg01-opus-rev2.md:7464:0x00
[ELIFECYCLE] Command failed with exit code 1.
```

This is the ticket's own narrated infection — "propagated into THREE separate documents that merely quoted
the offending line (a review file, …)" — reproduced live, by a reviewer, while reviewing the fix for it. Two
things follow, and both favour rev2:

- the byte landed in an **untracked** file, which is precisely the population rev1's BLOCKING-3 said the guard
  could not see. The rev1 scanner would have printed `TRACKED_TEXT_CONTROL_BYTES=0`. The rev2 scanner caught
  it on the first run. B3's fix is not theoretical — it just worked, unprompted, against a real defect;
- the failure mode is real and recurrent enough that it caught the lens that came looking for it.

Repaired to the escaped form; `REPOSITORY_TEXT_CONTROL_BYTES=0` on the real tree afterwards.

---

## 4. Canary — the rev1-accepted work is intact

Spot-checked the centerpiece kill, mutation (c), the one rev1 called "the real win":

```text
mut: conditionMarkRecords = preserveEnvelopeTerminalConditionMarkRecords(…)  →  Object.freeze([…])
× runs a depth-2 two-maker tree and preserves the single-root disclosure at envelope terminal
Serialized Error: { code: 'CONDITION_MARK_RECORD_REQUIRED' }
restored md5 match: YES
```

**All gates green at clone baseline**, matching the orchestrator's measurement:

```text
pnpm test                                             67 files / 471 passed (471)
pnpm exec vitest run --config acceptance/…            9 files / 35 passed (35)
pnpm run typecheck  &&  pnpm --dir apps/v2-ui …       both exit 0
pnpm run lint                                         {"edgeRowsChecked":27,…} / {"blocking":[]}
pnpm run audit:text-bytes                             REPOSITORY_TEXT_CONTROL_BYTES=0
```

---

## 5. The records — present

| Required | Where | Status |
|---|---|---|
| ADV-2 `effectiveMakerCount` ternary in the DR-162-A record | handoff `:102`, as the "deepest configuration assumption" | present, and correct against `apps/runner/src/index.ts:491` |
| ADV-1 recorded | handoff `:122` | present, and honest — it states the kill rests on envelope arithmetic, not the tree assertions |
| ADV-3 recorded | handoff `:124` | present, including the tsc-clean alias escape verbatim |

---

## Advisories (carry forward — none blocks closure)

**ADV-A · `*.source-test.mjs` is invisible to the completeness assertion.** The assertion matches
`endsWith(".test.mjs")`. **35 of the 49** quarantined files use the `*.source-test.mjs` naming, which does not
match. Proven by execution: a planted `apps/v2-ui/lib/phantomProbe.source-test.mjs` containing
`assert.equal(1, 2)` leaves the gate **GREEN (2 passed)**. The directive specified this exact glob and it was
implemented exactly as specified, and all 49 existing files are quarantined — so rev2 delivered what was
asked. But the naming the *majority* of the original corpus used can still re-enter silently. One character
(`endsWith("test.mjs")`) would close it.

**ADV-B · The completeness glob descends into dependencies.** `readdirSync(apps/v2-ui, {recursive:true})`
walks 9,984 entries, of which 9,027 are `node_modules` and 818 are `.next`. Clean today by luck; a dependency
shipping a `*.test.mjs` would RED the root gate for a reason no one intends. Over-inclusive, so it fails loud
rather than silent — but it should be scoped.

**ADV-C · The dotfile rule treats every dotfile as text, including binary ones.** A planted binary
`.hyg01probe.icon` (a PNG) reports `:60:0x00`, exit 1. `.DS_Store` is masked only because the root
`.gitignore` excludes it. Loud, not silent; note it before someone commits a binary dotfile.

**ADV-D · rev1 ADV-4 still open.** `pnpm run lint` remains `audit:architecture && audit:source`;
`audit:text-bytes` is not in it. Enforcement is genuine — I proved the vitest ratchet goes RED on all four
NUL plants — so this is presentational only, but a reader scanning `lint` will still conclude otherwise.

**ADV-E · Two active phantom `.mjs` files survive outside `apps/v2-ui`:**
`web/app/api/[...path]/route.test.mjs` and `web/app/api/proxyHeaders.source-test.mjs`. `web` is a pnpm
workspace member whose `package.json` has **no `test` script**, so neither executes in any gate, and the
completeness assertion only globs `apps/v2-ui`. Same class as B2, outside the ticket's named scope — for a
follow-up, not for this one.

**ADV-F · rev1 ADV-3 is recorded, not fixed** — correctly, per the rev2 directive. The header state-write
path still has only a lexical witness; the tsc-clean alias escape remains live. Whoever owns UI-01 A17 next
should extract the decision→state step.

---

## Disposition

Rev1's three blockers each demanded a specific, falsifiable outcome. Each was produced by execution:

1. **D′ goes RED** — focused and full suite — with the guard deleted, plus the honest control RED via the
   guard, plus the guard-only deletion (GREEN at rev1) now RED. The guard was structurally dead; it is now
   live, and the extraction is behaviour-preserving.
2. **The control-byte scan covers untracked files, dotfiles, and quarantined text**; binary assets still pass;
   the live NUL is repaired.
3. **The 49 no longer read as coverage**, and both a new stray test and a silent un-quarantine go RED.

Everything rev1 accepted is unchanged and re-verified. **APPROVED.**

*Every mutation was applied one at a time in the isolated clone and restored with an md5 match; no planted
probe remains; the real working tree is byte-identical to how I found it, save this file.*
