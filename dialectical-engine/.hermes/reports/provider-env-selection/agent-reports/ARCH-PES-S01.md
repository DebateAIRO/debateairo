# Case file — ARCH-PES-S01 (node ARCH(S01), pass 1 of 3, ticket t_96e1881a)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: Claude Opus 5.5 (`claude-opus-5-5`), transcript `agent-a03aa13cd0b01b6b1.jsonl`. Wall-clock 08:44 → 09:40 EEST
(~56 min), with one context compaction in the middle. Output: `slices/S01/PLAN.md` (25 steps, 4 clusters, 12
verification items), 36 DECISIONS rows + one `V-ROW: NEW`, ADR-0027, and 8 probes, including a real end-to-end dry
run of SPEC-v3 §5.

## The victims — what nearly shipped wrong, and why

**1. The SPEC's suite list was blind to the two suites that would have killed BUILD.** *Cause:* the intake picked
the 36 baseline suites by "reads the provider surface". The suites that scan EVERY file — the source-rule audit
(`tools/orphan-audit/src/index.ts:671-698` via `scaffold.test.ts:68`) and the register SQL census
(`register-support-publication.test.ts:492-587`) — read no provider symbol, so they were left out. The most obvious
way to write the command, `process.env.PROVIDER_HOSTED_ROSTER_PATH` in the CLI, passes all 36 suites and fails only
in the audit. *Price if missed:* one BUILD pass plus one REV pass (~2 seat-hours) spent learning it at REV. *What
caught it:* running the whole `tests/architecture` directory at base, which took 50 s. *Upgrade:* every mission's
intake adds `tests/architecture` (whole directory, measured as one pair plus its failing-name set) to the baseline.
It is the tree-wide law, and it is cheap.

**2. Two laws together left no house-pattern way to read one env key.** R1.13 keeps the roster key out of
`runtime-environment.ts`, and the audit keeps `process.env` out of every other file. REQ wrote R1.13 without knowing
the audit existed; three REQ passes and three REQ-REV passes never ran it. *Price:* ~15 min of mine, plus an ADR
(0027). Unpriced, it would have been a V row at BUILD. *Upgrade:* the REQ packet gets one line: "grep
`tools/orphan-audit` for rules your requirements will meet".

**3. SPEC-v3 §5 cannot pass as written, through no fault of the code.** Two causes, both measured:
- pnpm 11.20.0 writes its `$ tsx …` echo to STDERR, so it becomes the first line of a `2>&1` log, and `-s` does not
  suppress it. On failure pnpm writes `[ELIFECYCLE]` to STDOUT, after the FAIL line.
- `startTestDatabase()` logs through `console.info`, which goes to stdout.

Step 3 ("the first line is `PES-S01 SCRATCH-DB`") and step 6 ("the last line is FAIL…") are therefore false by
construction. *Cause:* REQ-REV-p3 marked the acceptance UNVERIFIED (`REQ-REV-p3.md:113-122`) and nobody ran anything
end to end before ARCH. *Price:* at V's gate this is V running the command, seeing a "wrong" first line and
bouncing the slice. That is a whole V round trip, the most expensive unit in the fleet. *What I did:* I executed it.
p2 ran a real embedded PG with real `importHistorical` and `publishGeneral`. p8 ran the full §5 dry run with
reference code: 12 lines, PASS. I routed the pnpm lines as a V-ROW and fixed the `console.info` problem in the plan.
*Upgrade:* **no SPEC acceptance passes REQ-REV while UNVERIFIED if it can be executed on this Mac in under 5
minutes.** Make the REQ-REV seat run it with a stub command.

**4. A credential-path leak nobody specified.** V8's `JSON.parse` error quotes the source text around the bad byte,
for example `..."ion_file":/etc/debat"...`. A "print the parser's message" refusal leaks a credential FILE PATH,
which R1.9 forbids. I found it only because p1 fed a malformed roster through the real parser. *Class:* every
operator command that parses JSON sitting beside a secret path. *Upgrade:* add a TOOLING-TRAPS heading, "V8
JSON.parse messages quote input".

## Where the tokens went — ranked

1. **Grep-reading code beyond the packet's line ranges: ~35% of my tokens.** The packet named ranges, but SPEC-v3
   cites many ranges the packet omits. Among them: `register-publication.ts:426-432/:868-873`,
   `configured-provider-set.ts:26-28/:64-85/:172-196`, `testDatabase.ts:84-126`, `registerFixtures.ts:115-118` and
   `dev-deployment-register.ts:316-331`. An ARCH seat cannot plan the call chain without them. Each one was a
   separate grep → read → re-anchor. *Cause:* the packet generator copies the REQ packet's code surface, not the
   SPEC's citations. *Upgrade:* `gen-arch` extracts every `path:LINE` from the SPEC of record into the packet's
   reading list, automatically (a regex over the SPEC; ~20 lines of script).
2. **Probes: ~25%.** This was worth it. p2 and p8 turned four "UNVERIFIED" items into measured facts, and every
   EXACT oracle in the PLAN comes from a probe run through the SHIPPED functions, not from my arithmetic. Keep it.
3. **The compaction: ~15%.** The session ran out of context before the PLAN was written, because the design lived
   in probes and my head rather than in the file. *Upgrade:* ARCH seats write PLAN.md INCREMENTALLY: §1 after the
   base runs, §6 per cluster as each is designed. A compaction then loses nothing.
4. **Cluster base runs: ~10%.** Each `tests/architecture` run is 50 s, and four cluster commands plus three
   stability runs came to ~7 min. It was necessary once. *Upgrade:* the orchestrator publishes a per-lane
   "architecture-dir failing-name set @ HEAD" file, measured once, which every seat cites.

## Packet defects, file:line

- **ADR numbering by `ls` collides.** The packet tells ARCH to take the next free number from
  `docs/architecture/01-decisions/`. `ls` shows 0024, but ADR-0025 (`62a4c367`) and ADR-0026 (`5ef138b7`) exist on
  other missions' refs. I took 0027. *Upgrade:* reserve ADR numbers on the board. One ticket comment
  "ADR-00NN RESERVED by <seat>" and a grep before choosing is enough.
- **The newest-transcript rule picked the wrong file.** "Your transcript file = the newest agent-*.jsonl" pointed at
  ARCH-PES-S02's transcript, because S02 was dispatched in parallel and wrote later. My CLAIM records that mine is
  NOT the newest by mtime. *Upgrade:* the dispatcher passes each seat its agent id, or the seat greps the
  transcripts for its own seat name.
- **The lane's `.pnpm` is a symlink into `.worktrees/i18n-turn12`.** Removing that worktree (the memory file
  "worktree untracked serve entrypoints" records exactly such removals) turns every command in this slice BROKEN.
  COMMON does not say so. *Upgrade:* COMMON's START frame lists `realpath node_modules/.pnpm` per lane.
- **README row law is unclear.** The packet names the ADR but not whether the index README gets a row. The lane's
  index ends at 0022, so 0023/0024 have none. I added no row and wrote down why.

## Dead ends — do not re-derive

- A `loadHostedPublishEnvironment()` in the loader violates R1.13 by name. `import {env} from "node:process"` beats
  the audit's regex and defeats its intent. Both are rejected in DECISIONS.
- A head check on `REGISTER_VERSION` is impossible without a latest-version read, and the census bans those
  (`:539-554`). The port itself has no head check (p2: stale base → version 6).
- Spawning `pnpm …` in the integration suite breaks every EXACT stderr oracle (pnpm's echo). Spawn
  `node --import tsx` instead, which writes 0 stderr bytes on a clean run (p5).
- A test asserting `undefined toBe undefined` passed at RED (my first draft of S01-01 #3). Assert `typeof … ===
  "function"` first.

## What I nearly got wrong

- I14's first design (re-run with E on base 4) would only REPLAY version 5, which proves nothing about the base.
  A changed maker forces a new publication, and then `base_register_version` is read.
- C3's architecture pair moves from 719 to 723 when H1–H4 land. A cluster command copied from C2 would have gone
  CLUSTER_RED on a correct build.
- The RECEIPT line's literal `"registerVersion":"5"` belongs in `tests/` only. The census bans `REGISTER_VERSION: "5"`
  in `acceptance/`, so K1 uses a regex and `BigInt > 4n`.

## The one-prompt machine — what to upgrade, in order of tokens saved

1. **Execute before freezing.** REQ-REV runs the SPEC's acceptance with a stub. This would have removed items 1, 3
   and 4 above one node earlier, at one seat's cost instead of V's.
2. **Generate the packet's reading list from the SPEC's own `path:LINE` citations.** This alone saves ~1/3 of an
   ARCH seat.
3. **A per-lane measured-facts file** (HEAD, node path, `.pnpm` realpath, architecture-dir failing set, typecheck
   delta set), written once by the orchestrator and cited by every seat. Each seat currently re-measures it
   (~10 min × every seat).
4. **Reference code as a first-class ARCH output.** My `proposed/*.ts` type-check under the lane's `tsc` (p7:
   0 diagnostics) and ran end to end (p8). BUILD copies behaviour rather than re-deriving it. Make it part of the
   ARCH contract, with sha256 in the PLAN, which I did.
5. **ADR numbers reserved on the board.** This removes a merge-time collision class.
