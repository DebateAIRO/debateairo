# CODE-T5C1-REV case file — t_ee9e4f48, epoch=34

SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers,
superpowers:verification-before-completion

Verdict delivered: **REWORK** (B1, B2 blocking; N1–N4 non-blocking). Round 1 of 3.

---

## 1. What cost the most, and why

**The dump is a fixture, and a fixture is a sample of one.** My exclusive cell
(T5-C1-8) measures a DOM dump emitted from a fixture the worker chose. All six items
measured GREEN, in both modes, and I report them GREEN. But item (5) — "the three
condition pills resolve to three different colour values" — is **only true of that
fixture**. The fixture hand-lists exactly the design's three marks. The product enum has
**18**, and the shipped ternary paints **16 of them the same red**. Six realistic marks
give `DISTINCT = 1 of 6`.

So the browser half, executed exactly as written, produced a **true measurement of a
false property**. Had I stopped at the six numbers — which is literally all cell
T5-C1-8 asks for — I would have certified the drawer's pill grammar and shipped B2.

**Price:** this is the third time this mission has paid for the same thing. AM12a's B2
(review outcome enum), AM12a's N4 (`Role` catch-all), now T5-C1's two ternaries. AM12a
even named the mechanism — *"the helper was typed by hand, so the third member was
unconstructible and no RED could exist"* — and the identical gap shipped one wave later.

**The upgrade:** a DOM-dump cell must name the **enum coverage of its fixture**, not just
the assertions. Concretely, add to the FIDELITY LAW: *a fixture that instantiates a
contract enum must either cover the enum or declare the uncovered members in the cluster
report.* That is mechanical, cheap, and it would have converted both B-findings into
worker-side REDs before review.

## 2. What I nearly got wrong

**I mis-measured item (4) first and nearly filed it as a defect.** My alpha parser
matched `rgba(...)`; Chromium serialises `color-mix(in srgb, …)` as `color(srgb r g b /
a)`. The first run returned `alpha: null, strictly_between: false`. A reviewer in a hurry
files "scrim has no alpha — REWORK" and burns a worker round on a probe bug.

What saved it: the value was *structurally* wrong (`null`, not a number), which reads as
a parser failure rather than a product failure. I re-measured with a two-form parser
**and** an independent canvas composite of the scrim over black and over white, which
recovered `0.2` by a completely different route. **Two independent derivations, not one
better regex.** That habit is worth making standard for every computed-colour claim in
this mission, because `color-mix()` is now all over `globals.css` and every future
browser-half seat will hit this exact serialisation.

## 3. Dead ends — do not re-derive these

- **`.playwright-mcp/` did NOT need restoring.** AM14 step 5 warns that the directory may
  be tracked and that `rm -rf` deletes committed files. In this worktree the four tracked
  files live at the **repo root** (`DebateAIRO/.playwright-mcp/`) while the MCP writes to
  `dialectical-engine/.playwright-mcp/`. Different directories. `rm -rf` on the latter is
  safe; `git status --porcelain .playwright-mcp` showed no deletions and all four tracked
  files verified PRESENT afterwards. Future seats: check the path, do not skip the check.
- **The MCP screenshot does not land in `.playwright-mcp/`.** `browser_take_screenshot`
  with a relative filename wrote `t5-terracotta.png` into the **worktree root**, outside
  the directory the teardown step names. The packet's teardown clause ("delete any
  `.playwright-mcp/` the MCP writes into the cwd") would have left it behind and dirtied
  the tree at verdict. Teardown must be `git status`-driven, not path-driven.
- **`position: fixed` containing-block risk is real but does not bite here.** A dump
  measurement of "flush right" is only transferable if no ancestor in the real app
  establishes a containing block. I checked: the six `transform`/`backdrop-filter` rules
  in `globals.css` resolve to `.brandDiamond`, `.canvasZoomCluster`, `.synthDiamond`,
  `.popAnchor`, `.toast`, `.splitBattleLine`, and the drawer renders in
  `DebatePageClient.tsx:1410` under `{/* ---- overlays ---- */}`, a sibling of the layout
  tree. Clean. Worth one grep on every future browser half; it is the one way a dump can
  lie about geometry.

## 4. Where the packet fought me

- **Read-order item 4 pointed at a section that does not exist in my tree.** It names
  `§AM16's four-way fidelity split` in `dispatch-order.md`. AM16 landed at `06e70eb7`
  (dev, slice/r2), which is **not an ancestor of `6b3651e9`**; my tree's file ends at
  AM15. The packet says "all paths relative to YOUR cwd", so obeying it literally finds
  nothing. I recovered it read-only via `git show 06e70eb7:…`. **No harm only because the
  packet quoted the AM16 LAW substance inline** — which is the lesson: quoting the law
  beat citing it. Cost ~4 minutes and three exploratory commands.
- **The packet carries neither AM16 worktree-precondition line.** AM16 states that every
  packet dispatched into a slice worktree carries `pnpm install` **and** `pnpm run
  generate:contract` ahead of its verify command, and explicitly rules that naming only
  the second is as broken as naming neither. Mine names neither, while demanding four
  verify commands. It worked purely because the worker's dispatch had already prepared
  this tree. In a fresh worktree this packet is an AF-1.
- **The packet's write bounds and its required work disagree.** §3 lists writes as
  self-report + board comments, then §2 requires a mutant battery with `cp+sha256
  isolation` (writes under `apps/`) and §1 requires driving a browser that writes into
  the cwd. Both are in fact authorised elsewhere in the same packet, but a
  contract-obedient seat reading §3 as the allow-list would stop. State the transient
  write surface in the `allowed` list explicitly.

## 5. Toward a one-prompt machine

1. **Ship the browser half as a kit script, not as prose.** I re-derived a loopback
   server, a fetch-based wrapper that injects the dump without authoring its bytes, an
   alpha parser for two serialisations, and a teardown — all of which the next
   browser-half seat will re-derive from the same eleven lines of AM14. That is pure
   repeated cost, three seats and counting. One committed `tools/dom-dump-kit/` with
   `serve.py` + a measurement preamble turns a 40-minute cell into a 5-minute one. The
   wrapper's *design constraint* is the part worth encoding: it must contain **zero bytes
   of the dump** (fetch + `innerHTML`), which is what makes AM16 compliance mechanical
   rather than a promise.
2. **Make "refute the fixture" a numbered step of the reviewer contract.** My two
   blocking findings both came from one move: take every ternary over a contract enum and
   probe it over the **full union** rather than the fixture. That move is currently folk
   knowledge recorded in an AM12a post-mortem; it should be step 3 of `heartbeat-reviewer`
   §2. Cost to run: one temporary probe, ~90 seconds. Value: it has now caught the same
   class three times.
3. **Pin the artifact the mutants ran against.** The worker's mutant table restores to
   `563b5fff…`; the shipped component is `82ad460d…` (an ADR-001 cleanup landed after the
   battery). No mutant in the handoff was proven against the artifact under review. I
   re-ran all six against the shipped SHA and they hold, so the substance survived — but
   the handoff template should require `mutant baseline SHA == final artifact SHA` as a
   self-check the worker fails loudly, instead of a reviewer noticing a hash mismatch in a
   table.
4. **The governance tax is real and the worker priced it.** 3,119 lines of protocol before
   mission artifacts, for a bounded drawer cluster. I read ~2,900 lines across
   `dispatch-order.md` alone to resolve three cells. A role-scoped, hash-verified digest —
   the worker's own proposal — is the right fix, and the reviewer's digest is a different
   slice than the worker's: I needed AM12a/AM14/AM15/AM16 and the two ADR gate scripts,
   and nothing else.

## 6. What I did NOT verify — for the next lens

- **T5-C1-9 (V-QA) is not mine and I did not answer it.** I looked at a screenshot to
  sanity-check the composition and then deleted it; V answers on the running app.
- **Only the dump's fixture state.** One node, `review.outcome = "agree"`, three condition
  marks, `abstention = null`, no scoring error, no generation history unlocked. Drawer
  states not measured in a browser: `dispute`, `cannot-assess`, review absent, zero
  condition marks, long values that wrap the 150px key column.
- **One viewport pair only** (1280×900, re-checked at 1440×900). `width: min(440px,
  100vw)` will breach the cell's own `>= 380px` floor below a 380px viewport; no cell
  names a viewport, so I did not file it.
- **Scrollbar gutter is 0 on this machine** (macOS overlay scrollbars). Item (1) compares
  `rect.right` to `window.innerWidth`; on a platform with classic scrollbars those differ
  by the gutter and the assertion as written would fail on a correct panel. The cell
  should compare against `document.documentElement.clientWidth`.
- **No merge, no push, no board state mutated** beyond my two comments. I did not run the
  full suite — only row 11 (3×), `tests/render`, and the two ADR gates.
