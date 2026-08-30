SKILLS LOADED: heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review, superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion

# S03-CODE Codex case file

**Status:** READY FOR PEER REVIEW on 2026-08-30 under new QA-defect ticket `t_880241fd`. The visual selected-state defect is addressed without changing S03 product logic or page markup.

## Executive finding

Two dispatch defects correctly stopped earlier attempts: the original PLAN conflated feature assertions with already-green baselines, and the original worktree lacked an isolated pnpm dependency layout. Both were repaired before implementation. The first implementation's product behavior was sound, but its accessibility test made a source-text oracle stand in for rendered behavior. Rework ticket `t_b065763f` replaces that oracle with a real `HomePage` render and proves the repaired assertion against hostile rendering and destination mutants. The separate port-3000 limitation remains environmental and is still recorded honestly.

## Findings, cause, and price

### 1. The PLAN was reviewed as a design, not executed as a pre-fix acceptance program

**Cause:** Several acceptance steps validate standing availability or pre-authored documentation rather than the behavior S03 adds. Architecture did not execute each command against pre-fix code and classify the expected pre-fix result before approving the PLAN under the packet's universal RED law.

**Evidence:** On untouched `apps/ui/app/page.tsx`, S03-C3-2 returned `1` for both `/?tab=public` and default `/`, exit 0. S03-C4-1 returned `2`, exit 0. S03-C2-2 asserts pre-existing banner copy and a pre-existing session gate. S03-C1-5 declares acceptance `N/A`. The PLAN contains no pre-fix-failing residual test for public-list leakage into Your Debates or private-list leakage into Public Debates.

**Price:** One coding seat round stopped before implementation; one Architecture/Router rework is now required. Without the stop, the higher price would have been false TDD evidence and tests that could not prove the feature.

**Upgrade:** Before dispatch, execute every acceptance command on the base commit and store `expected_pre_fix = RED | BASELINE_GREEN | N/A`. A universal RED law may cover only feature-changing assertions. If it truly covers every row, verification-only and documentation-only rows need explicit pre-fix-failing assertions. Add behavior-specific residual tests for both directions of list leakage and for logged-in/logged-out default selection.

### 2. A root `node_modules` symlink is not an isolated pnpm-workspace setup

**Cause:** The worktree's `node_modules` points to the main checkout. Package-local links such as `apps/api/node_modules` do not exist in the worktree, while root links such as `node_modules/@debateai/crypto -> ../../packages/crypto` resolve to the main checkout's source. TypeScript therefore sees missing external/workspace packages and two identities for classes with private fields.

**Evidence:** Pre-fix `pnpm run typecheck` exits 1 with missing `@hatchet-dev/typescript-sdk`, `@debateai/evaluator`, and `hash-wasm`, plus main-checkout/worktree type incompatibilities for `AuditContextHasher`, `ContentCipher`, `PublicationCipher`, and `PostgresPublicationRepository`.

**Price:** Two global typecheck executions (the second caused by the quoting incident below), thousands of diagnostic lines, and an acceptance gate that cannot reach GREEN within S03's file contract.

**Upgrade:** Provision each worktree with its own pnpm link layout before dispatch, or define a genuinely scoped UI typecheck/build command whose dependency graph is present. The packet should record a measured `pnpm run typecheck` baseline when that command is a step acceptance gate; a passing unrelated Vitest file is not evidence for it.

### 3. Board workspace metadata disagrees with the dispatch

**Cause:** The ticket was created as `workspace_kind: scratch` with no workspace path, while its body and packet assign `.worktrees/prog-b-s03/dialectical-engine`. Claiming it therefore created a generic Hermes workspace under `~/.hermes/kanban/...`.

**Price:** One extra board inspection and a discrepancy that could have split edits across two workspaces.

**Upgrade:** Pre-dispatch validation should compare the ticket's resolved workspace metadata to the absolute packet worktree and refuse dispatch on mismatch.

### 4. My Hermes comment quoting corrupted the first blocker record

**Cause:** I passed a markdown-rich comment through a double-quoted shell argument. Backticks were executed by zsh, exactly the class of escaping failure the coding instructions warn about. This was my error, not a packet defect.

**Price:** One malformed 34,115-character board comment, one unintended second typecheck run, several harmless failed shell lookups, and one corrective comment. No repository file changed.

**Upgrade:** Use a single-quote escape function for Hermes' positional comment body. Better, add `hermes kanban comment --file` or stdin support so evidence never traverses shell interpolation. Add this exact transport recipe to tooling guidance; the current trap notes that the body is positional but not how to transport markdown safely.

## What I nearly got wrong

- I nearly treated already-GREEN availability probes as acceptable TDD evidence. The explicit residual-test warning forced the pre-fix run before code.
- I nearly interpreted a RED global typecheck as the desired C1-1 RED. Its failures are unrelated to S03 and would remain after the feature, so it is not a valid feature pin.
- I did not run `pnpm install` after resolution failed. Although the packet conditionally permits a fresh install when resolution fails, the shared symlink means that action would write into the main checkout and outside the parallel lane's file surface.
- I could have followed Hermes' generated scratch workspace after CLAIM. The direct packet and ticket body instead bind this seat to the existing linked worktree.

## Dead ends worth deleting from future prompts

- A positive probe that public debates are visible cannot prove tab mutual exclusion; it already passes when both lists are always stacked.
- Grepping an Architecture-authored decision cannot be an implementation RED frame.
- Repository-wide typecheck is not a local syntax test when workspace dependency isolation is absent.
- A root-only `node_modules` symlink does not reproduce pnpm's per-package workspace links.

## Exactly where the packet was unclear

1. Packet §3 says RED before GREEN on every step, no exceptions, while PLAN S03-C1-5 says acceptance `N/A` and several verification/documentation steps are pre-fix GREEN. The precedence is clear; the executable reconciliation is not.
2. Packet §6 permits a fresh install after a resolution failure, while §5 and §5's single-writer rule prohibit touching dependency surfaces outside S03. Because `node_modules` is a shared main-tree symlink, the permitted installation target is unclear.
3. The packet assigns one worktree, but the board claim resolves another. It does not say whether the coding seat should avoid `hermes kanban claim` and use only a CLAIM comment marker.
4. The packet explicitly demands pre-fix-failing residual leak tests, but the approved PLAN names only the keyboard source test as a new S03 test. Adding residual behavior tests would be a design change unless explicitly authorized.

## Turning this into a better one-prompt machine

Add one automated pre-dispatch gate that reads the packet and PLAN, verifies every absolute path and allowed output, compares board workspace metadata, checks dependency resolution from the assigned cwd, executes every acceptance command on the base commit, and rejects any feature assertion whose expected pre-fix state is GREEN. Emit that machine-generated matrix into the packet. This would have caught all three external blockers before consuming a coding seat.

The prompt should also separate three concepts currently overloaded as “acceptance”: regression baseline, pre-fix RED assertion, and post-fix verification. Each row needs an explicit category and expected result before and after implementation. With that distinction, the coding seat can execute mechanically in one pass instead of interpreting contradictions.

## Resume addendum — implementation complete locally, live evidence blocked

The first two blockers were genuinely repaired: PLAN now categorizes feature assertions versus baselines and adds the negative C3-3 probe; the fresh worktree has a real pnpm installation and clean typecheck. The implementation and its planned test were therefore written under valid RED-first evidence.

### 5. A shared long-lived server is not worktree acceptance evidence

**Cause:** The live commands name one global URL, `https://localhost:3000`, but the listener is owned by a dev stack whose cwd is the main checkout. The coding seat edits an isolated worktree. The pre-dispatch gate confirmed the commands' pre-fix behavior but did not attest that the runtime would serve the seat's artifact after edits.

**Evidence:** At 2026-08-29T22:05:40+03:00, port 3000 listener PID 43352 had cwd `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. After the worktree implementation, the exact commands still returned the main checkout's pre-fix values: labels `0/0`, and the negative `?tab=yours` public-link probe `1` instead of `0`.

**Price:** One coding pass reached finished local implementation but could not enter three-run live verification; one human coordination decision is required. No rework round was consumed, and no shared process or main-tree product file was changed.

**Upgrade:** Give every coding worktree a distinct attested runtime origin in its packet, or coordinate exclusive ownership of the canonical port for the verification window. The gate must record the listener PID and cwd both before RED and before GREEN. A command at the right URL is still wrong-target evidence when the process behind that URL serves another checkout.

### What I nearly got wrong on resume

- I nearly treated the unchanged live RED as an implementation failure. Process cwd proved the server had never observed the diff.
- I considered an alternate-port UI launch. That would be useful diagnostic evidence but would silently substitute for the PLAN's exact command, so I stopped.
- I did not stop the shared stack or copy the page into main. Either would cross lane/runtime authority merely to manufacture GREEN.

### Resume dead ends and packet ambiguity

- Hot reload cannot bridge checkouts: a Next process watches the cwd it started from.
- The committed goal packet still names the retired `prog-b-s03` absolute path while the direct dispatch names `s03-code`. Direct instruction resolved execution, but the artifact remains factually stale.
- `hermes kanban claim` still resolves the ticket's generic scratch workspace, not the dispatched worktree. The CLAIM comment must continue to carry the actual path.

### Local evidence preserved before the runtime block

- Feature RED: missing C1 structure and labels, missing C2/C3 gates, and C3-3 public-link count `1` where `0` is required.
- Assertion RED: the new accessibility test failed `1/1` because neither native tab link existed.
- Local GREEN: accessibility test `1 passed/1`; repository typecheck exit 0; structural check `OK`.
- Refutation: replacing the Your Debates `Link` with `div` failed `1/1`; changing only its styling class passed `1/1`; both mutants were restored.

## Final resolution and verification receipt

- Superseding ticket `t_23b9245c` was created ready with the corrected `s03-code` worktree and claimed by this seat. The original `t_895ef432` remains superseded.
- S03-C1 cluster runs: three GREEN runs, each structural `OK` plus accessibility `1 passed/1`; worst run GREEN.
- S03-C2 regression-baseline cluster runs: `1`, `1`, `1`; worst run GREEN. These responses come from the shared main-checkout runtime and prove only that the pre-existing banner baseline remains available there.
- S03-C3 regression-baseline cluster runs: `1`, `1`, `1`; worst run GREEN. These responses likewise prove only the shared runtime's public-link baseline.
- S03-C4 verification-only cluster runs: `2`, `2`, `2`; worst run GREEN. Manual cross-check confirms `token !== null ? "yours" : "public"` matches logged-out → Public Debates and logged-in → Your Debates.
- Repository typecheck exited 0. The standing publication-contract suite passed `5/5`. `git diff --check` was clean before handoff.
- C1-3 is `UNVERIFIED-BY-RUNTIME`: the exact anonymous label probes still return `0/0` because PID 43352 serves `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, not this worktree.
- C3-3 direction 1 is `UNVERIFIED-BY-RUNTIME`: `curl -sk 'https://localhost:3000/?tab=yours' | grep -c '/public/debate/'` returns `1` from that same wrong-target runtime; it is not a verdict on this patch. The server was not stopped, restarted, or reconfigured.
- C2-2 and C3-3 direction 2 remain `UNVERIFIED-BY-ARCHITECTURE` for QA with a real signed-in cookie, exactly as the PLAN records.
- Mutation sensitivity/specificity evidence is deliberate: the `Link` → `div` mutant produced a real `1 failed/1`, while the neighboring styling-class mutant correctly remained `1 passed/1`. Both were reverted and the intended test returned `1 passed/1` after each restoration.

## Rework round 1 — B1 source-text oracle replaced

**Cause:** The first test read `page.tsx`, regex-selected `<Link>` source blocks, and used substring checks. Its PASS was produced by text existing in the file, so it could not distinguish rendered controls from dead JSX or distinguish a real destination from decoy attribute text.

**Price:** One blind-review rework round and roughly one additional verification cycle. The earlier `Link` → `div` mutation was a useful sample but not proof of the whole reachability property.

**Required reproduction before repair:** wrapping both links in `{false ? (...) : <span>Tabs disabled</span>}` left the old test GREEN at `1 passed/1`; changing both real destinations to `/` while adding decoy attributes containing the expected `href="/?tab=..."` text also stayed GREEN at `1 passed/1`. Both mutants were restored, and `git status --porcelain` was printed after each restoration.

**Remedy:** The test now calls the real async `HomePage`, uses the existing `next/headers` test boundary plus a focused public-contract-client mock, renders with `renderToStaticMarkup`, parses the result with JSDOM, and inspects rendered DOM properties. For both `tab=yours` and `tab=public`, it requires two rendered native navigation anchors, exact accessible names and real `href` attributes, `tabIndex === 0`, enabled state, no borrowed tab ARIA, and `aria-current="page"` only on the selected destination.

**RED → GREEN:** With the revised assertion held against the false-ternary mutant, both cases failed `2/2` at rendered tab count `0` (expected `2`). Restoring the intended page returned `2 passed/2`.

**Class sweep:** The final-form test rejects the false-ternary mutant (`2 failed/2`), wrong real href plus decoy text (`2 failed/2`), `Link` → `div`, reversed selection, `tabIndex={-1}`, native `disabled`, `aria-disabled="true"`, and both `aria-label`/`aria-labelledby` accessible-name overrides. The neighboring active-class rename remains GREEN at `2 passed/2`. Every mutant was restored; no mutant token remains in `page.tsx`.

**Dead ends / near miss:** The first real-render attempt errored with `useRouter is not a function` because the global request stub created a signed-in session and therefore mounted `LibraryComposer`. That was setup failure, not counted as RED. A test-local anonymous `next/headers` boundary removed the unrelated composer while preserving the requirement that both controls render for anonymous visitors. Root typecheck then exposed that the PLAN-pinned `.test.ts` filename cannot statically import TSX or UI-local render declarations under the root compiler; typed `vi.importActual` boundaries keep the real runtime modules without changing the filename, packages, or compiler configuration.

**Final receipt:** Exact S03-C1 cluster command ran three times on the final tree; every run returned structural `OK` and `2 passed/2`, so the worst run is GREEN. Fresh repository typecheck exited `0`; the standing publication-contract suite passed `5/5`; `git diff --check` exited `0`.

**Historical routing note:** B2 (ARIA tabs-pattern design) and N1 (anonymous Your Debates empty-list design) were correctly left to Architecture during B1. Architecture then ruled both and V routed their coding follow-up back to this same session; the addendum below records that separate, uncharged realignment.

**Upgrade:** Accessibility assertions must consume rendered output whenever the claim contains “present,” “reachable,” or a real destination. Mutation matrices should include dead-branch and decoy-text cases before a source-oriented oracle is accepted; a single caught syntax mutation is sensitivity evidence for that mutation only.

## Architecture-parallel B2/N1 realignment — not charged as a second coding rework round

**Cause and price:** Architecture's B2/N1 rulings landed while B1 was being repaired. B2 replaced invalid ARIA-tab semantics with ordinary navigation links carrying `aria-current="page"`; N1 required an anonymous Your-Debates hint inside the switched content area. The parallel dispatch caused one additional coding/verification cycle, but V explicitly left the coding rework count at 1 of 3.

**ARCH-N1 reproduction before correction:** The updated S03-C1 PLAN command contained `if(missing.length\|\|present.length)` inside JavaScript. Run verbatim before edits, Node exited 1 with `Expression expected` / `SyntaxError: Invalid or unexpected token`; Vitest never ran. The unescaped control also exited 1, but by actually evaluating the page and reporting `MISSING [ 'aria-current' ] FORBIDDEN-PRESENT [ 'role="tablist"', 'role="tab"', 'aria-selected' ]`. Evidence was posted to `t_7539734e`; under V Row 7, only those two markdown-escape backslashes were removed provisionally. Architecture ratification remains required.

**RED → GREEN:** The realigned render suite failed 3/3 before the product edit: both mode cases found the forbidden container role, and logged-out Your Debates had no in-panel hint. After the minimal page edit, the suite passed 3/3. The corrected compound C1 command reached its source guard and the rendered tests.

**Class refutation:** The final test rejects dead JSX (`false` ternary: 2 failed/3), real `href="/"` plus decoy destination attributes (2 failed/3), both links always carrying `aria-current="page"` (2 failed/3), reintroduced `role="tablist"` (2 failed/3), reintroduced link `role="tab"` (2 failed/3), reintroduced `aria-selected` (2 failed/3), and moving the anonymous hint to the Public branch (1 failed/3). The neighboring selected-class rename stayed 3 passed/3. Every mutant was restored with `git status --porcelain` read back; no mutant token remains.

**Three-run receipt:** S03-C1 ran three times at `OK` plus 3 passed/3; worst GREEN. S03-C2's local feature step returned `tabEmptyHint=1` three times, and the same rendered C1 suite exercises its location/copy. S03-C4 returned `2` three times. Typecheck exited 0; publication architecture passed 5/5; `git diff --check` exited 0. Source acceptances read: old headings 0, `aria-current=` 2, `role="tab"` 0, `published.items.map` 1.

**Runtime limitation preserved honestly:** Port 3000 is still PID 43352 with cwd `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, not this worktree. Across three runs, the C2 live baseline returned 1 while the new `tabEmptyHint` marker returned 0; therefore it cannot be credited as product evidence for this patch. C3 public/default positives returned 1, while the exact C3-3 negative probe `curl -sk 'https://localhost:3000/?tab=yours' | grep -c '/public/debate/'` returned 1 all three times from the wrong tree. C2/C3 live directions remain `UNVERIFIED-BY-RUNTIME`; the signed-in direction remains `UNVERIFIED-BY-ARCHITECTURE` for QA, exactly as previously routed. PID 43352 was not stopped, restarted, or reconfigured.

**One acceptance distinction worth preserving:** S03-C2's cluster curl is still a REGRESSION-BASELINE: it can return 1 from the unconditional `Sign in to start` text even when `tabEmptyHint` is absent. It is not credited as proof of C2-3. The discriminating evidence is the step's local `tabEmptyHint` assertion plus the real-render test, which was observed RED before GREEN.

**File ownership:** This seat changed `apps/ui/app/page.tsx`, `tests/unit/pda-s03-keyboard-accessibility.test.ts`, this report, its main-tree receipt, and the single authorized factual `||` correction in S03 PLAN. The already-dirty Architecture/Orchestrator changes in `DECISIONS.md`, the rest of `PLAN.md`, and `PROGRESS.md` were not authored or altered by this seat.

**Late Architecture readback:** Comment `t_7539734e` created_at `1788034635` independently generalized the command defect to “no executable command in a table cell” and repaired C2/C3 in Architecture's main-tree artifact. It explicitly left this worktree's C1 instance to the coding seat pending ratification. Those later Architecture-owned changes were not synced or copied by this seat; the artifact split is disclosed instead of silently crossing lanes.

## Rework round 2 — B3 rendered-but-concealed controls and N2 role precision

**Cause:** The B1 repair upgraded the oracle from source text to a rendered DOM, but it still equated “two anchors exist” with “two controls are exposed.” JSDOM does not compute a browser accessibility tree: its `HTMLElement.prototype.checkVisibility` is absent, and its synthetic `focus()` can set `activeElement` to anchors hidden by `hidden` or `display:none`. No installed repository dependency provides `isInaccessible`, Axe, Playwright, or another accessibility-tree exposure oracle. A machine-installed Chrome exists, but making a unit test depend on undeclared host software would not be a repository-owned oracle.

**Reproduce first:** Before modifying the test, adding `hidden` to both rendered tab links left the suite byte-identical to baseline at 3 passed/3. Restoring the page also returned 3 passed/3. Separately, adding the legitimate `role="navigation"` to the wrapper made the old N2 assertion fail 2/3 with the misleading message “must not claim tablist semantics,” proving it rejected every role rather than only `tablist`.

**Remedy and honest boundary:** The render test now walks each anchor and its ancestors and rejects an enumerated set of known concealment barriers: `hidden`, `aria-hidden="true"`, `inert`, computed `display:none`, `visibility:hidden|collapse`, and `content-visibility:hidden`. This is explicitly a blacklist, not a claim of full reachability or accessibility-tree equivalence. The PLAN's S03-C1-4 `Failure it MISSES` field now names the residual gaps exactly: app/external stylesheet-only concealment, off-screen/clipped/zero-size/occluded layout, opacity/transparency, pointer blocking, closed-details/popover and future unmodelled exclusion mechanisms, and browser/AT-specific accessibility-tree behaviour. N3's Architecture-owned stale source-text description was not edited. N2 now forbids only wrapper `role="tablist"` and link `role="tab"`; a neighbor with `role="navigation"`/`role="link"` passes 3/3.

**RED → GREEN:** With the repaired oracle, the original `hidden` mutant failed 2/3 with `known concealment barrier: hidden`; restoration returned 3/3. The other required B3 mutants each failed 2/3: `aria-hidden="true"` on both links, `inert` on `.sectionHead`, and inline `display:none` on both links. Additional `visibility:hidden` and `content-visibility:hidden` ancestor mutants also failed 2/3. Every restoration returned 3/3 with a status readback.

**Sensitivity and specificity sweep:** Both original B1 mutants remain rejected: the false-ternary/dead-JSX mutant failed 2/3 at rendered-link count zero, and real `href="/"` plus decoy destination attributes failed 2/3 on the actual href. A cosmetic selected-class rename remained GREEN at 3 passed/3. All mutants were restored; no temporary mutant is part of the handoff.

**Price:** One coding rework round and an explicit residual QA boundary. No product behavior change was needed for B3 or N2; the permanent code change is confined to the rendered test, plus this required PLAN failure-boundary receipt and the paired case-file receipts.

**Final verification receipt:** The exact S03-C1 compound acceptance ran three times on the restored final tree; every run returned structural `OK` and 3 passed/3, so the worst run is GREEN. `pnpm run typecheck` exited 0. The standing publication-contract suite passed 5/5. `git diff --check` exited 0. The worktree and main-tree case-file receipts are byte-identical. Ticket comments were read through created_at `1788035502` immediately before this final receipt; no intervening instruction was present.

## QA-N1 new work — sighted selected-state affordance

**Cause and price:** The earlier accessibility work proved DOM presence, native-link keyboard semantics, ARIA current state, and enumerated non-concealment. It never asserted that active and inactive controls compute to visually different styles. S03-C1-5 explicitly inherited `.tab`/`.tabActive` styling without establishing that either class existed, so “not hidden” was incorrectly allowed to stand in for “distinguishable.” QA found the user-visible gap after mission integration. The price was one new first-pass QA ticket and about fifteen minutes of coding-seat investigation/repair; no rework round has been consumed on this ticket.

**Reproduction:** On clean `7bfe662`, every repository CSS/SCSS/Sass file contained zero `.tab` or `tabActive` selectors, while `page.tsx` contained `tabActive` twice. The live response at `/?tab=public` served `class="tab"` and `class="tab tabActive"` with `aria-current="page"`; the served `layout.css` contained zero matching rules. PID 43352 served the main checkout, also at `7bfe662`, so this was valid base-code evidence rather than the earlier wrong-runtime condition.

**RED → GREEN:** The new test renders the real async `HomePage`, injects the real `globals.css` into its JSDOM document, and compares computed styles. Before CSS, both selected-state cases failed: 2 failed/3 passed, with the navigation still `space-between`, no group gap, plain-link font/padding/radius, and identical active/inactive background, foreground, and shadow. The CSS change made the suite 5 passed/5.

**Remedy and sighted result:** The two links are now adjacent, bordered 12px/600-weight rounded controls with 5px × 12px padding; the count remains at the far edge of the existing section header. The inactive control is transparent and muted. The `aria-current="page"` control uses the surface background, ink foreground, and a raised `0 1px 3px` shadow. The distinction is not colour-only: background fill and shadow geometry supplement foreground colour. The existing `a:focus-visible` rule remains effective because `.tab` does not override outline; the final computed probe returned `outline: 2px solid var(--focus)`, `outline-offset: 2px`, and `:focus-visible = true`.

**Why page.tsx stayed untouched:** Its existing `aria-current="page"` is the semantic state CSS needs. Styling `.tab[aria-current="page"]` keeps visual and assistive state on one source of truth; adding product logic or relying on the redundant `tabActive` class would weaken that invariant.

**Refutation sweep:** A wrong `aria-current` selector failed 2/5; removing the base `.tab` selector failed 2/5; breaking the scoped group selector failed 2/5; retaining colour changes while setting the selected shadow to `none` failed 2/5, proving colour-only is rejected. Changing the group gap from 4px to 5px stayed 5/5, so the test does not pin cosmetic spacing. Every mutant was restored.

**Near miss / dead end:** The first colour-only mutation matched the pre-existing `.segment` shadow instead of the new tab shadow because the declaration text was duplicated; its GREEN result was irrelevant and discarded. A later generic restore matched an earlier `.metaLine` gap instead of the mutant. Final diff inspection caught both before handoff; selector-context patches restored the neighbor and the complete three-run verification was restarted. This cost one extra probe and one full final cluster rerun. The durable lesson is that `apply_patch` context must name the selector when mutating duplicated CSS declarations; porcelain alone shows dirt, not whether the right hunk was restored.

**Dispatch findings:** The corrected worktree preflight was clean and at `7bfe662`. The ticket still carries a stale `[claude-opus]` title, null assignee, scratch/no-path metadata, and no typed state/file contract comment, despite the model law and direct V instruction assigning implementation to Codex. The original S03 goal packet also names retired ticket/worktree paths. Direct V scope made this run unambiguous, but the board/packet metadata should be repaired before it is reused as an automated dispatch source.

**Final verification:** The restored final visual-state cluster ran three times at 5 passed/5; worst run GREEN. `pnpm run typecheck` exited 0. The standing publication-contract suite passed 5/5. Live post-fix serving is intentionally not claimed: PID 43352 serves the main checkout and cannot observe this uncommitted worktree diff; the real rendered-HomePage computed-style test is the discriminating local proof, with browser/integration visual confirmation left to peer/QA after integration.
