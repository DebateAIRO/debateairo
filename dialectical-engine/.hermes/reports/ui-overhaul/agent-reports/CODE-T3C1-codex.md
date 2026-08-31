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
