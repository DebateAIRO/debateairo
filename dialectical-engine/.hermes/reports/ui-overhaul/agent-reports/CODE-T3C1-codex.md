# CODE-T3C1 case file — signed-in library chrome

## Cause and repair

- The route split changed `page.tsx` but not the layout-owned `TopBar`, so anonymous `/` still composed two specified chromes until CSS could observe the landing marker and suppress the direct global-bar child.
- Signed-in chrome also lacked its contracted mode mount and asker chip; the composer retained pre-T3 copy. The bounded repair adds those exact surfaces without moving the publication slice or touching token blocks.
- The new render file tests the real signed-in server branch, a client-mounted TopBar toggle, and the real stylesheet; synthetic CSS alone would not have pinned the signed-in no-marker premise.

## Evidence and price

- REDs were discriminating: the final truthful chip pin missed `ASKER`, composer exposed the old example placeholder, TopBar had no mode toggle, and landing-with-marker computed `display: flex` instead of `none`.
- Five targeted mutants each went RED: removed TopBar mount, removed suppression rule, broadened unconditional selector, signed-in landing marker, and changed submit copy. The benign non-toggle child reorder stayed 6/6 GREEN.
- Every mutant restore matched the GREEN SHA-256 for its file; this was the required substitute for Git because the packet forbids every Git command.
- The canonical current dispatch row passed three times at 12 files / 92 tests; the full render suite passed 20 files / 89 tests, root typecheck exited 0, and TypeScript 7.0.2 reported only the two named UI baselines with 0 new errors.
- The AM3 syntax-derived ranges remained `5,72,74,114`, the owned-product colour residual was 0, and the exact suppression rule occurred once.
- The packet says “10-file command” while its source-of-truth row currently has 12 paths. Reconciling that defect cost one source re-read and six extra file-runs across the mandated three executions; the 12-file superset was used and the discrepancy was declared at CLAIM.

## Near misses, dead ends, and upgrades

- I nearly pinned lowercase `Your debates` in T3-C1, which would have seized T3-C2’s explicit selector-copy ownership. I corrected the boundary before product GREEN and retained the cell’s allowed `+ New debate` discriminator.
- The final safety audit caught a second near-miss: the artboard’s `cobalt-falcon-0fa351` is sample identity, not runtime truth. A fresh RED then replaced it with the truthful role chip `ASKER`, avoiding fake product data without inventing a client-side identity source.
- The routed PDA harness renders `HomePage` only, not `TopBar`; its one-line scoped query therefore continues to pin the landing mount itself. No mock expansion or `s8-publication-contract` re-anchoring was needed.
- One `rg` probe failed because this machine lacks `rg`; the already-recorded grep fallback worked immediately. No new tooling trap was found, so `.hermes/TOOLING-TRAPS.md` was not duplicated.
- The one-prompt machine should generate packets from the live dispatch row (including count and paths) so a late AM6 amendment cannot leave the prose count stale.
- A shared render helper for `HomePage + TopBar + globals.css` would remove duplicated mocks and make future route-composition cells cheaper while preserving real-product evidence.

## RW1 — AM7 real-render pins and honest placeholder mechanics

### Review findings and root cause

- F-B1 reproduced before test work: deleting only the `authTopBar` `<ModeToggle />` left the canonical 12-path command at 12 files / 92 tests. The mount existed, but no T3-C1 acceptance selected that branch.
- F-B2 reproduced before test work: nesting `<TopBar />` one wrapper below `.appShell` in `layout.tsx` also left the canonical command at 12 / 92. The original suppression tests authored their own DOM shape, so they could not observe the product layout that owns the direct-child contract.
- F-N2 was a semantic mismatch, not a fabricated-identity request: the truthful `ASKER` placeholder used interactive `.btn` styling and an unreliable role-less `aria-label` that claimed a session state `TopBar` cannot know.

### RED → GREEN and refutation evidence

- M1b before the pin: 12 / 92 GREEN, mutant `TopBar.tsx` SHA-256 `c09471c6fe55a7901d00577353ae61dd342e3b8007ca9e8cf4b4b001ac87a55a`. After adding T3-C1-5, the focused case went RED at `.authTopBar [data-mode-toggle]` (`expected null not to be null`); restoring the mount returned 1 / 1 GREEN and the pre-RW1 file hash `850f85be515694714ed460afadd9769cb9dbe83df05b09b3a4f16d33d631ed8b`.
- M6 before the trio: 12 / 92 GREEN, mutant `layout.tsx` SHA-256 `93e0bc0fba6d6b24bc3120ed931f4f604f1a99c132a7d4afa3b48080c46a9607`. With AM7 P1/P2/P3 present, the file was 9 passed / 1 failed: P1 and P2 stayed green and P3 rejected the wrapper. Restoring M6 returned 10 / 10 GREEN and layout SHA-256 `c9961a2069ee50257308d044c7bdef1a40ad6ce5c18fbef5cb1bb340eb0ec52f`.
- N2 test-first RED: the existing old chip failed the required `roleChip` class (`false` vs `true`). Minimal GREEN changed one JSX line to `<span className="roleChip" title="Asker role placeholder">ASKER</span>` and removed the signed-in claim. Focused file: 10 / 10 GREEN.
- N2 refutations independently went RED for re-adding `.btn` (line 130), removing the placeholder title (line 131), and re-adding `aria-label="Signed-in asker"` (line 132). All were restored.
- Neighbor control: reordering `BrandMark` and `ModeToggle` inside `authTopBar` left the full focused file 10 / 10 GREEN, so the new mount pin does not seize child order. Restored final `TopBar.tsx` SHA-256: `1e1571a014af8293469ba6d0753c3f83dce8134b692ee0a079b860c4a73a7ef0`.

### Acceptance and price

- Canonical dispatch row 3, three independent runs: 12 files / 96 tests; 12 / 96; 12 / 96. Worst verdict GREEN.
- `pnpm exec vitest run tests/render`: 20 files / 93 tests, GREEN.
- `pnpm run typecheck`: exit 0.
- ADR-006 workspace-root gate: TypeScript 7.0.2; compiler emitted only `DebatePageClient.tsx(1488,11) TS2322` and `layout.tsx(3,8) TS2882`; named baseline lines 2, residual new errors 0.
- AM3 grep fallback: syntax-derived ranges `5,72,74,114`; owned-product residual colour literals 0; exact suppression-rule occurrences 1.
- `auth-front-door-parity` + `pol01-policy`: 2 files / 10 tests, GREEN.
- Product net change is only `apps/ui/components/TopBar.tsx`, exactly one line replaced (one insertion / one deletion). Streaming that one line back to the pre-RW1 form reproduces SHA-256 `850f85be515694714ed460afadd9769cb9dbe83df05b09b3a4f16d33d631ed8b`. `page.tsx`, `LibraryComposer.tsx`, `globals.css`, `layout.tsx`, the routed PDA file, and the conditional s8 file retain their first-pass hashes.
- Final test hash: `tests/render/t3-library.test.tsx` = `07d13752cc83ee3e1a3fe83cc55bc07cc052d8423964a4d7b9449c42d056f2bc`.

### Boundaries and residual

- `layout.tsx` was a transient M6 surface only and has zero net change. No Git command was used.
- AM7 names one residual outside this rework form: hoisting `{children}` outside `.appShell` still matches P3. The cell routes that lower-plausibility shape to V closure; the RW1 packet permits only M6 on the transient layout surface, so it was not silently expanded here.
- The review's N7 is an environment distinction: `rg` was present in the reviewer's environment, while this Codex sandbox again returned `zsh: command not found: rg`. The report keeps the sandbox-scoped fact and used the already-recorded grep fallback.
- No new tooling trap was found.
