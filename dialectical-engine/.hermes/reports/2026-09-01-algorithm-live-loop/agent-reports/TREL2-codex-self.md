# TREL2 Codex reviewer self-report

## r1

### Cause

The lane anchored its search on the values accepted by `--setting-sources` and then
treated the minimum inside that one flag as the minimum across the installed CLI.
That is why probes 3/4 correctly established `user` as the only successful settings
source yet the implementation still missed the CLI's separate `--safe-mode` isolation
primitive. The stale research sentence amplified the anchoring: the worker copied its
old “no `~/.claude/CLAUDE.md`” premise into the report instead of rechecking the host
fact before declaring the risk latent.

### Price

- One paid probe ($0.03211875), a 162-insertion/9-deletion patch, and its RED/GREEN,
  mutant, and three-zone evidence now require at least one rework round or an explicit
  V risk decision.
- The next round may spend another of the two remaining authorized success probes to
  discriminate `--safe-mode`; the original worker budget still has room, but the first
  paid probe did not test the strongest isolation candidate.
- Review spent several static-inspection calls extracting the installed native CLI's
  embedded parser and memory-loader paths. One broad `strings | rg` attempt produced a
  multi-megabyte match and was truncated; narrower literal extraction was the useful
  method.

### What I nearly got wrong

I nearly accepted “unique minimum” because the four probe outcomes are internally
consistent. They prove a minimum only over `{user, project, local}` with safe mode
absent. I also nearly labelled the hidden memory as a DR-115 lineage fabrication. That
would overstate the result: the response remains a real call and the CLI-reported model
path is unchanged. The affected property is recorded-input completeness/call purity:
the gateway hashes the JSON prompt packet while an unrecorded user `CLAUDE.md` can also
shape the model context.

### Dead ends

- Broad searches of the 2.1.247 Mach-O mixed Bun runtime strings with Claude Code and
  generated huge, truncated output.
- Tracing the `user_claude_md` cached-content helper first found a downstream consumer,
  not the primary memory-load gate.
- A broad repository search for “honesty” mixed unrelated DR-115 and historical review
  artifacts. The useful evidence was the provider gateway's exact `inputHash` line.

### Packet friction

The codex packet's stale-mitigation question was unusually precise and prevented a
false approval. Its static-only rule conflicts with the generic reviewer contract's
“probe, never read” wording, but static binary extraction supplied an independent probe
without a provider call. The upstream worker packet is less sound: it calls `...` paths
“ABSOLUTE” even though those literals do not resolve from the declared cwd. The board's
absolute path made reconstruction possible, but the packet should not require it.

### One-prompt upgrades

1. For host-dependent security lanes, have packet generation capture existence/size/
   mtime for every premise such as `~/.claude/CLAUDE.md`; never inherit those facts from
   research notes.
2. Require a capability matrix before paid probes: setting-source values, safe/bare
   modes, auth behavior promised by the installed version, and what each mode admits.
3. Require “minimum across mechanisms,” not only “minimum value of the edited flag.”
4. Add an explicit recorded-context check: list every model-visible input and state
   whether its bytes or digest enter persisted request metadata/input identity.
5. Emit literal absolute artifact paths in packets and validate each path from the
   dispatched cwd before the seat starts.

## r2

### Cause and decision

The rework fixed the actual B1 path rather than only rewriting its risk statement.
The useful independent trace was shorter and stronger than the worker's partial one:
the installed CLI sets `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` when safe mode is active,
and its User-memory loader checks that variable before its `userSettings` branch and
returns an empty list. The relay now passes both `--setting-sources user` and
`--safe-mode`, so auth retains the only empirically successful source while user
CLAUDE.md content is stopped before model-context construction.

### Price

- The lane spent its remaining two paid calls. Across both rounds the ledger is three
  paid successes totaling $0.08160375 and three zero-cost auth failures; the authorized
  paid budget is exhausted.
- Review could not rerun tests or provider calls because the r2 packet explicitly made
  the round static-only. I reconciled the committed diff, installed binary, six raw
  envelopes, and supplied RED/GREEN/mutant logs instead.
- The two new probe files are verbatim one-line result envelopes. They prove the
  YES/NO, token, spend, error, and model-count outcomes, but do not themselves serialize
  argv or the prompt. Identical-vector provenance therefore remains in the worker's
  hash-guarded report rather than in a self-describing probe log.

### What I nearly got wrong

I nearly read the packet's word `ONLY` as exact failure-count exclusivity and rejected
the mutant evidence. That would be incorrect: MD, MA, and MB all also trip the shared
full-vector equality test. The discriminating fact is that MD trips the safe-mode test
but neither source-list test, while MA/MB trip source-list tests but not the safe-mode
test. The controls are property-orthogonal even though a deliberately redundant vector
pin observes both.

I also nearly treated the worker's inability to finish the minified User-loader trace
as a residual uncertainty. A narrower extraction found the complete gate:
`if(V.CLAUDE_CODE_DISABLE_CLAUDE_MDS)return[]` precedes the `Li("userSettings")`
branch. That turns the empirical answer into corroboration of a statically closed path,
not the sole basis for approval.

### Dead ends and packet friction

- Minified-symbol searches for `EC`/`bs` collided with unrelated bundled functions.
  Exact literal searches for the default source array and the disable environment
  variable were discriminating.
- The generic reviewer contract asks for independent test reruns, while this packet
  forbids tests, builds, and live calls. The packet's tighter boundary governed.
- The r2 packet's shorthand `each killed ONLY by their own test` is easy to misread.
  Future packets should say `no cross-kill among the dedicated property tests` when a
  separate full-vector assertion is expected to kill every argv mutant.

### One-prompt upgrades

1. Make paid-probe logs self-describing: record a redacted argv digest, prompt digest,
   installed-binary digest, and environment-key names beside verbatim stdout.
2. Distinguish dedicated-test orthogonality from exact mutant failure counts in review
   packets.
3. For version-dependent CLI safety flags, pin both the argv flag in tests and a
   post-upgrade static/empirical conformance check; the current residual risk is semantic
   drift in a future CLI, not an open hook or memory path in 2.1.247.
4. Prefer tracing the disable variable into each loader before relying on a model's
   self-report; token deltas are corroboration, not proof of which bytes disappeared.
