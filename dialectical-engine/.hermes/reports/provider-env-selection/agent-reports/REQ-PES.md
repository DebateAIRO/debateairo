# Self-report — seat REQ-PES · node REQ pass 1 of 3 · ticket t_c677f87a · mission `provider-env-selection` · 2026-09-24

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock: 13:41 dispatch → 14:0x READY, ~25 min. Tool calls: 4 Skill, 24 Bash, 8 file writes.
No rework, no blocker, no retry. Output: `INSTRUCTIONS.md` (91 lines), 3 slices × 4 files, 33
requirements, 2 V rows.

---

## 1. The body: what the inputs got wrong, and what it nearly cost

**FINDING 1 — the intake's baseline table is arithmetically malformed. `docs/missions/provider-env-selection/00-intake.md:43-80`.**
Every cell of the 36-row table reads `<passed>/<passed><failed>` instead of `<passed>/<total>`.
Proof by the intake's own prose at `:41`: it says `dev-api-environment` is `9/10`, and the table
row at `:55` says `9/91` — that is `9/` then `9` concatenated with `1`. Same shape for every row:
`dev-api-process` `5/10` → `5/55`; `dev-provider-panel` `3/4` → `3/31`; `t16-algorithm-register`
`20/21` → `20/201`; `v9-deployment-mode` (201 cases, 0 failures, `:109`) → `201/2010`;
`prompt-injection-corpus` → `253/2530`.
**Cause, not symptom:** the table was hand-typed from a script's output instead of being emitted by
the script. **Price to me:** ~4 minutes and one near-miss — I was about to restate totals in three
SPEC verification sections. **Price to the mission if it had survived:** every BUILD seat compares
its run against a total that is off by an order of magnitude, reads GREEN as RED, and burns a FIX
node. The packet's own rule saved me by accident — charge 4 says *cite the baseline line, never
restate the 36 pairs* — so my three SPECs cite `00-intake.md:40` and carry no number.

**FINDING 2 — a binding V row whose evidence contradicts the file it cites. `V-DECISIONS-PACKET.md:6` (row V-2).**
V-2 says hosted deployments should read provider targets "(with the Bearer keys)" from a `0600`
file, evidenced by "`runner.env.example:59` (today: inline JSON)". Re-measured in the lane,
`deploy/vps/env/runner.env.example:52-55` states the credential is a FILE named by
`authorization_file` and that an inline `authorization_header` is REFUSED in hosted mode;
`deploy/vps/README.md:776` gives the refusal code; `tests/unit/v9-provider-credential-files.test.ts:110`
pins it. **No key is inline today.** V-2's default, applied literally, would have produced a whole
slice building `PROVIDER_DISCOVERY_TARGETS_PATH` — a second composition mechanism for a secret that
is already out of the environment, and against the packet's own charge 5 ("no second mechanism").
**Cause:** the intake re-measured the SPIKE against dev (§7, §10, excellently) and did not re-measure
its OWN V rows against that same measurement. §4 and §10 were written from different reads of the
same tree, minutes apart. **Price:** ~6 minutes to catch; one slice (~3 nodes, 3 REV passes) not
built. This is the single most expensive near-miss of the run.

**FINDING 3 — two packet input ranges stop mid-sentence, and one omits the crux. `packets/REQ.md:24`.**
The packet names `deploy/vps/README.md:721-804`. Line 804 ends "…and the first one is not" — the
word "optional" is on `:805`. Worse: the four-step "Adding a vendor" procedure runs to `:873`, and
**step 4, the register publication path, is `:853-869`** — entirely outside the named range. That
step contains the sentence that decides gap (a): `:862` "There is no hosted publish command yet."
The same cut hits `:14-26`, which stops in the middle of the second stale bullet. **Cause:** the
ranges were taken by line arithmetic, not by section boundaries. **Price:** 2 extra reads, ~3.5k
tokens, ~3 minutes — and the protocol's reading floor makes me declare them, which I did.

**FINDING 4 — the packet's verification line contradicts its own charge, on any mission with no UI.
`packets/REQ.md:17` vs `:26`.** Line 17: "every acceptance step a numbered human-runnable **browser**
step". Line 26: "the acceptance section = numbered **OPERATOR** steps V runs alone on THIS Mac".
This mission has zero `ui: yes` slices and zero browser surfaces. I followed charge 4. **Cause:** a
template line written for UI missions that is not gated on the mission having a UI slice. **Price:**
~2 minutes of deciding which one binds; on a less careful seat, three SPECs full of fictional
browser steps.

## 2. What I nearly got wrong (my own mistakes, caught before the freeze)

- **A path from memory.** I wrote `.dev-auth/deployment-register.json` into S01's acceptance step 5
  as the dev register receipt. The real name is `deployment-register-receipt.v1.json`, under a
  custody root resolved at runtime (`apps/runner/src/dev-deployment-register.ts:102-103`, `:214-217`).
  Caught because I made myself grep before freezing. A frozen SPEC with a wrong path is a defect V
  discovers at TEST(S), three nodes downstream.
- **A CLI flag that does not exist.** I wrote `pnpm dev:auth:assemble-api-env --print` into S02's
  acceptance. That CLI accepts exactly `--deployment-receipt-file <the exact expected path>` and
  refuses anything else (`apps/runner/src/dev-api-environment-cli.ts:15-19`). Replaced with a suite
  run by exact repository path.
- Both are the same class: **an acceptance step that names a path, a flag or a filename the seat did
  not read in the lane.** Nothing in the packet or the skills checks for it.

## 3. Dead ends — do not re-derive these

- **A loopback fake vendor cannot be the ADMISSION case.** Hosted mode refuses the whole
  `127.0.0.0/8` range and this host's own interface addresses (`deploy/vps/README.md:775`), and
  requires `https:` (`:774`). The escape is that the checker reads the LITERAL address and does no
  name resolution — so a public-DNS name resolving to `127.0.0.1` is admitted. S02 pins
  `api.localtest.me`; `/etc/hosts` was rejected (needs `sudo`, mutates V's machine).
- **Do not invent a probe-freshness floor.** `docs/architecture/05-register-skeleton.md:506` records
  provider call bounds as "values — none stated", and `ADR-0015:127-131` bars stating a probe budget
  outside the register. The number is V's. Routed as a V row.
- **`buildConfiguredProviderSetDeploymentRow` has no shipped caller** and the tree says so at
  `tests/unit/v9-configured-provider-set-deployment.test.ts:209-211`. Do not go looking for the
  hosted publish command; it is not there.

## 4. Upgrades, ranked by tokens saved per mission

1. **`spec-lint.sh`, run by the seat before its READY and by `packet-check.sh` after.** Three
   mechanical checks: (a) every banned word outside a line marked as a counter-example; (b) every
   SPEC requirement id has a PLAN trace row and vice versa; (c) **every absolute path, filename and
   CLI flag quoted inside an acceptance step exists in the lane** — a `test -e` and a `grep` per
   token. Check (c) alone would have caught both of my near-misses, and it catches the whole class
   the tooling traps keep re-recording. *Saves: one FIX node and one REV pass per mission (~150k
   tokens), plus V's time at TEST(S), which is the expensive currency.*
2. **Generate the baseline table, never type it.** `measure-baseline.zsh` already produces the pairs;
   have it write `logs/baselines.tsv` and have the intake include that file rather than a hand-typed
   Markdown table. Finding 1 is impossible after this. *Saves: the arithmetic every seat redoes, and
   the false-RED a bad total causes.*
3. **Re-measure the V rows at the end of intake, not at the start.** §10's measurement invalidated
   §4's row V-2 and nobody looked back. Add a closing intake step: for every V row, re-read the
   `path:line` in its evidence column and mark the row `STALE` when the line no longer says what the
   row says. *Saves: a whole slice, this mission.*
4. **`packet-check.sh`: reject an input range that ends mid-sentence.** A range is legal when its
   last line ends in `.`, `:`, a table pipe, or a blank line, or when the next line starts a
   heading. Pure regex. *Saves ~3-5k tokens per seat, every seat.*
5. **Gate the packet template's browser-step line on `any(ui: yes)` in the mission.** One
   conditional in the generator.

## 5. Toward the one-prompt machine

The run that just happened needed no human turn, and that is the point to defend. What still needs
a human is **judgement about what the tree already does** — and that judgement was needed three
times here (findings 1, 2 and the (d) verdict), each time because a written record disagreed with
the tree. The machine gets closer to one prompt not by writing longer packets but by making the
records **derived rather than transcribed**: baselines generated, V-row evidence re-read
mechanically, acceptance tokens existence-checked. Every one of those is a script, and every one
replaces a paragraph of instruction that a seat can skim. The packet was otherwise good: charge 2's
"re-grep in the lane, never trust `dev-extracts.md`" is the rule that produced findings 1 and 2, and
it should be in every packet of every mission, worded exactly as it is here.

**Where THIS packet was unclear, exactly:** `packets/REQ.md:17` (browser vs operator steps, see
finding 4) and `:24` (the two truncated ranges, see finding 3). Nothing else was ambiguous.
