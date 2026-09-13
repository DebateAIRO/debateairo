# Self-report — seat REQ-S03 · node REQ · mission `debate-tiers` slice S03 · ticket `t_089ce7cc`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `96555a10-dafb-468d-88b3-f6c3afd4c825`, Opus 5, background Agent tool. One pass, no rework.
Main tree at start: `ed09cd88`, 134 dirty. Wall clock ~25 min, ~40 tool calls, no retries, nothing
blocked. Output: `slices/S03/{SPEC,PLAN,PROGRESS,DECISIONS}.md` + 9 lines into `INSTRUCTIONS.md`.

## 1. The body on the floor: an intake fact that was true and incomplete

**F4 is the finding.** `00-intake-S03.md:98` says the `/v1` base-URL rule
(`packages/providers/src/index.ts:128`) refuses Z.ai's path, and then: *"The gateway needs no new
adapter kind … a remote HTTPS target with a bearer already works once the URL rule admits it."*

That sentence is wrong in the way that costs a build. There is a **second** gate, and it is stricter:
`buildDevelopmentProviderPanel` (`apps/runner/src/dev-provider-panel.ts:100`, with `expectedBaseUrl`
at `:87-89`) throws `DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID` unless each slot's base URL is
**exactly** `http://127.0.0.1:<that slot's port>/v1`. Every Free entry in this slice is a remote
HTTPS target. Relaxing only the `/v1` rule produces a stack that refuses to start, and the failure
surfaces at stack-start time — not in a unit test.

- **Cause, not symptom:** the intake extracts facts by grepping the *symbol* (`normalizedProviderBaseUrl`)
  and then reasons forward from that one site. Nothing in the process forces the question "what else
  validates this value on its way in?" The caller-check section at `00-intake-S03.md:115-121` does
  exactly the right thing for five symbols — and `normalizedProviderBaseUrl` is not one of them.
- **Price if it had survived:** one BUILD cluster written against one gate, one runtime failure at
  `pnpm dev:auth:up`, one FIX node, one extra REV pass. Call it 2–3 hours and a review package.
- **Price to catch it:** 1 tool call. I read `dev-provider-panel.ts:1-160` because I wanted the slot
  table, and the check was 40 lines below it.
- **Upgrade (cheap, mechanical):** any intake fact phrased as *"X already works once Y changes"* or
  *"no new adapter/kind/migration is needed"* must carry the exhaustive grep that proves it, in the
  caller-check block, the same way symbols already do. A claim of sufficiency is a claim about
  **every** call site, and it is the only claim in an intake that cannot be checked by reading the
  line it cites.

## 2. What repeatedly cost tokens

**a. Two baselines, two trees, two file sets, no stated authority.** `00-intake-S03.md:83` gives a
main-tree baseline (`Tests 2 failed | 97 passed (99)`, 10 files). `logs/setup-tiers-s03.log` gives a
lane baseline (12 files, 128 tests) — and carries a **third** failing suite,
`tests/integration/dev-api-environment.test.ts` at 9/10, that the main-tree number does not contain.
My charge 3j is written against the lane log, so the lane is what the SPEC had to use. Cost: 4 calls
to notice, confirm and find the cause. The cause was already written down at `LEDGER.md:13`
("atomically assembles the exact environment…" at `:139`, lane-only, cause not established) — I
nearly re-ran an integration suite to learn a fact the orchestrator had already measured 25 minutes
earlier. **Upgrade:** one baseline per lane, in `BASELINE.md`, with its file set enumerated, and the
intake pointing at it rather than carrying a second differently-scoped number. A number in two places
with two values is a number nobody can cite.

**b. Line numbers that belong to a tree nobody names.** `00-intake-S03.md:86` says the extracts were
"re-grepped 2026-09-13 at `7188b167`". F1's citations into `apps/api/src/index.ts` (`:1227`, `:1229`,
`:1236`) are 13 lines ahead of `7188b167`: they were measured in the MAIN tree, which carries another
mission's uncommitted +13 lines in that one file. Every other cited file is byte-identical between
the trees (`git diff --stat 7188b167..HEAD` over them: empty). Cost: 3 calls, and a near-miss —
I had already drafted R15 citing the intake's numbers, and BUILD works in the lane, where they point
13 lines off into the middle of a different function. **Upgrade:** stamp every extract with the tree
it was measured in, and have `packet-check` diff the cited files between that tree and the lane. This
mission has known for a month that the main tree carries other missions' dirt (`COMMON.md:7` says so
in bold) — and still measures product lines in it.

**c. The reading floor works.** Packet + COMMON + 4 named inputs + 14 product ranges = the whole run,
no exploration, no re-reads. This is the cheapest planning seat I have run. The floor is not the cost
centre; the facts' provenance is.

## 3. What I nearly got wrong

- **`ui: yes`.** C15 makes `/new` change how it *gets* its data, which means a UI file changes, and I
  started to read that as a UI slice. What settled it was one sentence in the contract —
  `heartbeat-requirements` §2: "a slice whose only browser step is watching existing components
  render stays `ui: no`". Had I set `ui: yes`, the mission would have paid a MOCK seat and a V gate
  to mock a page that draws nothing new. **That sentence is load-bearing and it is in the skill, not
  in the packet** — which is the right place, and the reason the skill floor is not optional.
- **Freezing the Free entry at V's two-line shape.** V chose a preview where an entry is two lines.
  Honouring it literally would have pushed the Z.ai base URL into TypeScript — and row V-35 says that
  URL may have to move. The slice would have shipped a config file whose first real edit was a code
  change. I froze four lines and sent V the smallest yes/no instead.

## 4. Dead ends, named so nobody re-derives them

- Do not re-run `tests/integration/dev-api-environment.test.ts` to find its lane failure: it is
  `atomically assembles the exact environment…` at `:139`, pre-existing, lane-only, 10/10 in the main
  tree, `LEDGER.md:13`. The C14/F7 pin `rejects v4 reconstruction and removed-provider fallback`
  (`:352`) is **green** at base — the slice's own target is not the thing that is red.
- `yaml@2.9.0` is in the pnpm store but is no package's dependency, and no `config/` directory exists
  (F11, re-confirmed). ARCH does not need to hunt for a parser; it needs to add a dependency.
- `glm-5.3-flash` already exists in this repo — as the **support** seam
  (`development:hermes-glm-5.3-flash`, port 8794, Hermes credential store). It is a different ref, a
  different port and a different credential from the Free debate entry. Do not "reuse" it, and do not
  read `dev-real-provider-only.test.ts:36-41` as a contradiction to delete: its subject is
  `dev-provider-panel.ts`, and it stays true.

## 5. Where this packet was unclear — exactly

1. **`allowed` says `INSTRUCTIONS.md (append only)`; the output line demands "the S03 row".** The
   slice table is at lines 12–15. A row appended at the end of the file is not in the table and the
   compass stops pointing. I inserted the row into the table (no existing line altered, nothing
   removed) and appended the rest as a section. **Fix the template:** say "additive — insert the
   slice row in the table, append everything else; alter no existing line."
2. **Charge 4 pins both display modes only for `ui: yes`; S02 is `ui: no` and ran both anyway.** With
   the flag mine to set, the mode question came back to me with no rule. I ruled once-only and wrote
   the reason into DECISIONS. **Fix:** state the mode rule as a property of the slice's *surface
   delta* (new element or new token → both modes), not of the `ui:` flag.
3. **Charge 3(j) names the lane log as the suite authority; charge 1 names the intake as the fact
   authority — and they disagree** (§2a). The packet should name one of them the tiebreaker.
4. Charge 2 says "Freeze the file's exact shape from the preview V chose … with the Free entries
   carrying a key-based transport instead of `cli:`" — that instruction *is* the departure from V's
   preview, and it does not say whether the departure needs V's word. I treated it as contested and
   raised the row. Saying so in the packet would have saved the deliberation.

## 6. How this becomes more of a one-prompt machine

- **Make sufficiency claims illegal without a sweep.** §1 is the whole report in one line: the phrase
  "already works once X changes" is the highest-cost sentence shape in an intake, because it reads
  like a fact and is actually an unchecked universal. Every one of them gets a grep in the caller
  block or gets rewritten as "UNVERIFIED beyond `<file:line>`".
- **One tree, one baseline, one stamp.** Every measured line number and every `passed/total` carries
  the tree it came from. `packet-check` fails a packet whose cited files differ between the tree of
  measurement and the lane of work. Both of this run's real findings (§2a, §2b) die here, and both
  were latent for anyone downstream — ARCH and BUILD would each have paid for them again.
- **The intake already knows how to do this.** `00-intake-S03.md:115-121` is a caller check, and it
  is excellent. It covers five symbols. The discipline exists; it just is not applied to the
  sentences that assert *absence* of work. Absence is the expensive claim.
- **Where the tokens actually go in this seat:** re-verifying facts the previous node measured. Not
  because the facts are wrong often — two of fourteen were off — but because a REQ seat cannot tell
  which two without checking, and a frozen SPEC built on an unchecked one is a rework round for every
  node downstream. A provenance stamp per fact turns "verify all fourteen" into "verify the three
  that claim sufficiency", which is most of this run's read budget.
