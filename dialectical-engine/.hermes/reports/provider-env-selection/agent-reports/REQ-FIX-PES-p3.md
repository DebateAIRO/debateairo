# Self-report — REQ-FIX-PES, node REQ-FIX pass 3 of 3 (t_690beb44), mission provider-env-selection

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: the REQ-PES subagent session (agent a221353758f20db46), third node in the same transcript.
Dispatched 15:14:36, CLAIM 15:17:08, cut off 15:20:23 (HTTP 429), resumed 19:08:00, READY about
19:55. The CLAIM recorded model claude-opus-5; after the resume this session reports
claude-opus-5-5. Verdict worked: `docs/missions/provider-env-selection/reviews/REQ-REV-p2.md`.

## 1. The body: two blocking findings, one cause

**B1 (S01).** My pass-2 SPEC said a roster repeating `vendor:a` prints
`PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_DUPLICATE`. Executed in the lane, it
cannot: the row builder throws `CONFIGURED_PROVIDER_SET_INVALID` first
(`packages/register/src/configured-provider-set.ts:82`), and handed to the parser as the configured
set, that roster gives `CONFIGURED_PROVIDER_DUPLICATE` (`packages/providers/src/index.ts:255`).
The second member: the acceptance created an empty database and then read a base row from it.

**B2 (S02).** Four rules in four paragraphs (custody layout, stdout law, step 5, step 7) that no
single directory tree satisfies.

**CAUSE, shared.** At pass 2 I wrote claims about the OUTPUT of a chain of shipped functions by
reading one function in that chain. I never ran them in order, and I never built the concrete
directory tree the SPEC described. The pass-2 detectors had the same flaw: they checked that
strings were present (the packet names this exactly: "check_b1 passes when six member names
appear in a table"), so they passed on a SPEC that was wrong.

**PRICE.** Two graph nodes: REQ-REV pass 2 and this REQ-FIX pass 3. It also used up the mission's
last rework pass, so anything REQ-REV pass 3 finds now goes to V.

**What executing found that reading had missed, at this pass alone:**
(a) v2's loopback fixture named no scheme, and the `http:` reading stops earlier, at
`PROVIDER_BASE_URL_TLS_REQUIRED:` (`index.ts:646`);
(b) v2's R2.8 gave the resolver the PARSED targets, which carry no `authorizationHeader`, so the
probe would send no header (`provider-probe.ts:71-72`) and the fake vendor would answer 401;
(c) v2's step 5 required a ref after `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT`, a code that
carries none (`index.ts:307`);
(d) my own pass-2 DECISIONS row claimed a non-`https:` base URL "makes the shipped parser throw",
but the parser admits `http:` (`index.ts:218`).
None of the four was assigned, and all four would have reached a BUILD seat.

## 2. What I NEARLY got wrong at this pass (each caught late, by a mechanical check, not by reading)

1. **An equivalent mutant.** My first "uniqueness rule dropped" mutant rewrote only the words "is
   unique". The rule survived in the same sentence ("a roster in which a `provider_ref` appears in
   two elements is refused here"). The mutant run said MISSED 12/13, and I first read that as a
   weak checker. It was half right: the replay (`probes/REQ-FIX-PES/p3_mutant3_replay.py`) shows
   the mutant was equivalent, AND the detection was a keyword regex that the print-format clause
   "the repeated ref, for a repeat" satisfies alone. Both are fixed; a 14th mutant keeps that clause
   to prove the detection now reads the rule sentence. Final: 14/14.
2. **Overclaimed evidence in the SPEC.** S01 §5 said every case line "was produced by the shipped
   functions". Two codes (`PES_PUBLISH_ROSTER_INVALID:`, `PES_PUBLISH_BASE_ROW_ABSENT:`) come from
   the NEW command's own rules, which my executor models; no shipped function prints them. I
   reworded it before the freeze. Left in place, that is a fabrication finding.
3. **False "UNCHANGED" declarations on line 4.** I declared R1.9, R2.2 and R2.5 unchanged by hand.
   A per-requirement v2↔v3 diff showed their text had changed: R1.9 now names the two lines
   literally, and R2.2 and R2.5 lost their review citations. Line 4 of both SPECs is corrected.
4. **Line pointers typed from memory.** Four of the ten `SPEC-v3.md:NN-MM` ranges in my S01
   DECISIONS append were wrong until I measured them with grep.

Each of the four is the same class as B1: a claim written from memory instead of from a measurement.

## 3. The interruption (15:20:23 → 19:08:00)

**Wall-clock.** 3h48m idle on the account limit, against about 51 min of active work across the
node (3 min before the cut, the rest after).

**What was lost.** Nothing on disk: the orchestrator measured this at 19:03, and I had written no
deliverable yet. The in-context output of the read-only walks was lost; I re-ran
`scratchpad/b1walk.ts` (seconds).

**What cost more.** The session later ran out of context and was compacted once. The first
mutant run's verbatim output survived only as a three-line summary. That is why
`p3-runs.txt` §4 quotes those three lines from the session record and marks them as such, instead
of re-executing them. After compaction I re-read about 900 lines (p3_checks.py, both SPEC-v3
sections, both PLANs, both DECISIONS) to regain state.

**Transcript.** 1,887,344 bytes at CLAIM, about 3.9 MB now: about 2 MB for this node.

**The model.** It changed at resume (see header). No output depended on it.

## 4. Dead ends (so nobody re-derives them)

- `node --experimental-strip-types` cannot import lane modules: `.js` specifiers do not resolve to
  `.ts`. Use the LANE's own `node_modules/.bin/tsx` with absolute `import()` paths and `cwd` =
  lane. A relative import from outside the lane fails under tsx too.
- `createProviderDiscoveryResolver` with empty `targets` throws
  `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` before anything else of interest. A probe of the two
  integers needs one target that matches the configured set.
- zsh: `echo ====` fails (`=cmd` expansion; quote it). macOS `cat` has no `-A` (use `od -c`).
- A pinned `git show HEAD:` in a checker breaks once the orchestrator commits the fix. Pin the
  commit the lens reviewed (`0e625a59`), as `detectors.py` pins `84106e07`.

## 5. Where the packet was unclear, exactly

- `REQ-FIX-p3.md` charge 1: "in the order line 3 names". The skills are on packet line 4 (line 3
  is "Read FIRST…"). The dispatch message said line 4.
- Charge 2: "`baseRegisterVersion` … required at `:632`". Line 632 of
  `packages/register/src/register-publication.ts` is in `validateSupportPublication`'s key list.
  `publishGeneral` requires it at `:871`. SPEC-v3 cites `:871`.
- Charge 5 asks for every SPEC line pointer in DECISIONS.md to be "re-pointed", but DECISIONS.md
  is append-only. I resolved it by appending a v3 pointer map under each slice's pass-3 heading.
  The orchestrator's fold rows keep their v2 pointers, which stay true of the frozen file.
- Inputs line: "V rows V-1..V-8". The packet now holds V-9 (from ARCH-REV S03). INSTRUCTIONS now
  says "numbered from V-1", so it does not go stale again.
- Model line: "claude-opus-5". The resumed session reports claude-opus-5-5.

## 6. Upgrades, ranked by tokens saved

1. **Any SPEC sentence of the form "fixture X prints code Y" must come from an executor that runs
   beside the SPEC** (this pass's `p3_exec.ts` pattern: shipped functions run in the composition
   root's order, the SPEC's fixtures verbatim). Make it a REQ gate in `heartbeat-requirements` §4.
   *Saves:* the whole REQ-REV p2 → REQ-FIX p3 round trip, about two nodes. The biggest item.
2. **A checker is not done until its mutants are CAUGHT, and each mutant must delete every
   statement of the rule it targets.** Its MISSED line must be diagnosed (equivalent mutant or
   weak detection) before the checker is edited. *Saves:* a false-green pass at REQ-REV.
3. **Generate line 4 from a diff.** The per-requirement CHANGED/UNCHANGED list should come from the
   snippet I ran, not be typed by hand. *Saves:* a near-certain REQ-REV finding on every
   supersession.
4. **Line-range pointers from a script.** Emit `:NN-MM` per requirement from the file. Hand-typed
   ranges were wrong 4 times in 10.
5. **Tee every probe into the probes dir as it runs.** Two losses at this node (the 429, then the
   compaction) would each have cost zero. COMMON §4 already says "write every artifact the moment
   it is ready"; extend it explicitly to probe OUTPUT.
6. **A skill-level executor template** (tsx + absolute lane imports + one op per claim type).
   *Saves:* about 15 minutes of import dead ends per mission.

**One-prompt machine.** Upgrades 1–4 turn a REQ seat's claims into things a script produces. That
is the only route I see to a REQ pass the blind reviewer cannot fail on facts. What remains for
the reviewer is judgment: scope, alternatives, V rows.
