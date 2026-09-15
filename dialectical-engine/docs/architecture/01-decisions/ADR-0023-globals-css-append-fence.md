# ADR-0023 — `apps/ui/app/globals.css` has a closed tail: new CSS goes before the consent blocks

**Status: Proposed** — V ratifies this ADR. No seat writes `Accepted`.

| Field | Value |
|---|---|
| **Date** | 2026-09-09 — written by seat `ARCH-S01` (node `ARCH(S01)`, ticket `t_dfd8f52d`) of mission `debate-tiers`, slice S01. |
| **Proposed by** | Measured by this node in the lane `.worktrees/tiers-s01/dialectical-engine` at `dev` @ `7f89f7b7`. Recorded as fact **F3** of `docs/missions/debate-tiers/slices/S01/PLAN.md` and as a decision row in `docs/missions/debate-tiers/slices/S01/DECISIONS.md`. |
| **Source of record** | `.hermes/planning/debate-tiers/packets/ARCH-S01.md` (this node's contract allocates `ADR-0023-*.md`). The frozen requirement this arose under is `slices/S01/SPEC-v2.md` R17. |
| **Numbering note** | `0023` is the orchestrator's **allocation**, carried in this node's `allowed` list. At write time the directory held `ADR-0001`…`ADR-0018` plus `ADR-0021` and `ADR-0022`; `0019` and `0020` are reserved by the halted `translation` mission, and no file existed at `0023`. |
| **Numbering, re-measured 22:35 after an orchestrator note** | An orchestrator comment on `t_dfd8f52d` at 22:32 reported `0023` "TAKEN twice (an existing globals-css ADR, and ARCH(S02)'s ADR now renumbered)" and asked for the next free number. **Re-measured: there is no collision, and this file is the file the note calls pre-existing.** Evidence: `git log --all -- '…/ADR-0023*'` is empty, so `0023` has never been committed on any branch; `git status` shows it untracked (`??`); its mtime is `Sep 9 22:29:08`, three minutes *before* the note; and it carries this seat's own authorship marker in the row above. `ADR-0024-plan-tier-storage-and-layering.md` — `ARCH(S02)`'s, mtime `22:32:01` — is the only other file in the 002x range. So `0023` is held once, by this ADR, and `0024` by S02's. The number is **kept**, because renumbering here would act on a misreading and would strand the citations in `slices/S01/PLAN.md` §10 and `slices/S01/DECISIONS.md`. The orchestrator owns allocation and may still direct a renumber; the cost is one filename and three citations. |

## Context

`apps/ui/app/globals.css` is 8980 lines and is the single stylesheet every `apps/ui` surface shares.
Two slices of mission `consent-ui` each appended their whole stylesheet as ONE delimited block at the
end of the file, and each wrote a suite that pins its own block's delimitation. Measured in the lane
at `7f89f7b7`:

```
8188:/* === consent-ui S01 === */
8559:/* === end consent-ui S01 === */
8561:/* === consent-ui S02 === */
8980:/* === end consent-ui S02 === */          <- last line of the file
```

The two guards, both **green at base** (`consent-s02-style-contract` 10 passed (10),
`consent-bar` 7 passed (7)):

- `tests/unit/consent-s02-style-contract.test.ts:248-249`

  ```
  const after = css.slice(css.indexOf(CLOSE_MARKER) + CLOSE_MARKER.length);
  expect(after.trim()).toBe("");
  ```

- `tests/render/consent-bar.test.tsx:270-280` admits, after the consent-S01 close marker, only
  whitespace — or consent-S02's one block and then whitespace. Its own comment states the property:
  *"A third block, a stray rule between the two, or anything at all after S02's closing marker still
  fails here."*

Together these two make the tail of the file a **contract**: the last non-whitespace text in
`globals.css` is consent-S02's closing marker, and nothing may follow it.

The problem is not that the contract exists — it is deliberate and it works. The problem is
**discoverability**. Appending new rules at the end of a stylesheet is the ordinary thing to do, the
two most recent slices in this repo both did exactly that, and nothing in the file says otherwise.
A slice that appends at end-of-file turns two suites red that name neither that slice nor its
mission, in a file the slice legitimately owns and writes. Mission `debate-tiers` slice S01 writes
`globals.css` for its tier selector; its frozen SPEC (R17) constrains *where colours are declared*
and says nothing about where rules go, and the two guards above appear in no requirement of that
mission. The failure would have been found by a coding seat mid-cluster, reading two consent-mission
failures with no connection to the tier selector it was building.

This is the class `.hermes/TOOLING-TRAPS.md` §"Disjoint WRITE surfaces do not imply independent
EFFECTS" records: the missing question is not *"will two seats collide?"* but *"which STANDING tests
READ the file each slice WRITES?"*

## Decision

**New CSS is inserted before the consent-ui S01 open marker (`/* === consent-ui S01 === */`), in or
beside the region that already owns the surface being styled. Nothing is appended after the last
consent block.**

Consequences by category:

- **Rules for an existing surface** join that surface's existing region. Mission `debate-tiers` S01
  puts the tier selector's rules with the rest of the `/new` vocabulary, after `.ndKeyHint`
  (`globals.css:6206`).
- **Design tokens are unaffected.** They belong in the single `:root {` block (`:5-113`) and the
  single `html[data-mode="chamber"] {` block (`:115-178`), both far above the fence, and are
  independently governed by `tests/unit/t9-mode-tokens.test.ts`.
- **A future slice that wants its own delimited block** places it before `:8188`, or moves the fence
  deliberately by amending both guards in the same commit — which is a change to two other missions'
  contracts and is therefore a decision, not a side effect.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Relax the two consent guards so anything may follow | They are the only thing pinning that each consent slice's CSS lives in exactly one block; relaxing them to make an unrelated slice's append legal trades a real invariant for a convenience. The `consent-bar` guard was already relaxed once, deliberately, for the S02 merge, and its comment records exactly what that relaxation gave up and who took over the property. |
| Add a third delimited block after consent-S02's, for each new mission | Fails `consent-s02-style-contract:248-249` as written, and turns the tail into a growing stack of blocks whose order no one owns. |
| Say nothing and let each slice discover it | This is the status quo, and the cost is one coding seat's cluster block per slice that touches `globals.css`, spent reading two failures from a mission it has never heard of. |
| Split `globals.css` into per-surface files | The right answer eventually, and far outside a slice about a tier selector. It would also invalidate `tokenContract.ts`, the 34 published contrast rows, and both consent guards at once. Noted as the standing alternative; not taken here. |

## Consequences

- Any slice writing `globals.css` reads this ADR and inserts before `:8188`.
- The two consent guards become part of the verification list of every such slice, whether or not its
  own SPEC names them — S01 of `debate-tiers` carries both in its cluster C4 command, together with
  the other nine standing readers of `globals.css`.
- A seat that must place a rule after the fence has to amend `tests/unit/consent-s02-style-contract.test.ts`
  and `tests/render/consent-bar.test.tsx` in the same commit, and say so.
- The general rule this instance serves, and the reason it is an ADR rather than a mission note:
  **a file's END can be contractual even when the file has no owner**, and the contract is written in
  suites that name neither the file's editor nor its mission. The check is mechanical — sweep the
  standing suites that READ each file a slice WRITES, before planning the writes.
