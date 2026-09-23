# T14a CODEX PEER-REVIEW SELF-REPORT — r1

## CASE SUMMARY

The root cause of the failed gate is an invalid exhaustiveness inference. The evidence report
proved that one development launcher pins `REGISTER_VERSION=4`, then promoted that fact into
"the runner is launched only by the dev stack" and `NOT-BROKEN`. The repository contains a
second launch surface: `apps/runner/package.json:8` starts `src/main.ts` directly, while
`packages/register/src/runtime-environment.ts:174-195` accepts any positive register version.
The checkout contains no production deployment or environment receipt that identifies the
version/provenance actually selected there. Absence of that evidence was treated as proof of
absence instead of the packet-mandated `CANNOT-ASSESS` disposition.

PRICE: this opens r2 and requires a substantive rewrite of Gate 2, the T14b consequence, and
the proposed DECISIONS lines. The mechanical review also needed a second, wider writer/launcher
search after the six required re-runs; without it, the false conclusion would have entered an
append-only decision record.

## WHAT MUST BE UPGRADED

1. Every negative or exhaustive claim needs a declared search universe. "Only launcher",
   "exactly two seeders", and "nothing in the repository" cannot be supported by a citation
   to one positive path. The packet should provide the exact repository-wide command and its
   exclusions, then require the seat to list every returned candidate before classifying them.
2. Deployment-state gates need deployment-state evidence. Source code can prove which inputs a
   binary accepts; it cannot prove which environment or register a production process currently
   uses. A production manifest/receipt, deployed environment attestation, or database readback
   must be named as required evidence. If none is available, the one-prompt machine should
   mechanically select `CANNOT-ASSESS`.
3. Evidence rerun packets should carry literal commands, not labels such as "E8 — the two
   seeder families". The label already assumes the result and makes confirmation bias cheap.
4. Commands quoted with an output claim must encode their exclusions. The report says its
   shallow `find` excluded `node_modules`, but the command does not; it returns
   `./node_modules/.pnpm/docker-compose@1.4.2`.

## WHAT NEARLY WENT WRONG

I nearly marked E10 as agreement because lines 70 and 148 do exactly pin the development
wrapper. The report's claim, however, was universal: the runner is launched *only* by that
wrapper. Searching the claimed subject rather than merely re-reading the cited lines exposed
the package-local start script and the unpinned production environment parser. The reusable
lesson is to split every `X is the only Y` claim into two probes: verify X, then independently
enumerate all Y.

I also nearly accepted E8's "two seeders" wording as shorthand for dev and acceptance. A
full non-test INSERT search found `packages/register/src/index.ts:467-539`, which writes and
seals bootstrap version 1 and is invoked by the development seeder at
`apps/runner/src/dev-deployment-register.ts:320`. The development family therefore includes
both historical v1 and current v4 behavior; the omitted path is also the strongest counter to
the report's broad claim that the deployment does not seal non-dev rows.

## DEAD ENDS AND TOKEN COST

- An unscoped repository-wide `rg` crossed archived review transcripts and produced roughly
  30k tokens of output before truncation. Restricting the search to `apps/`, `acceptance/`, and
  `packages/register/src/`, while excluding tests, reduced the decisive result to seven lines.
- The exact E11 `find -maxdepth 3` was useful only to refute the reported output; it cannot
  support "anywhere in the tree". A second full-depth search with explicit `.git`,
  `node_modules`, and `.worktrees` pruning returned no first-party Docker/Compose/Terraform
  files. The corrected search supports that narrow repository fact, not a claim about live
  production.
- Tracing all test INSERT fixtures was not needed to decide the gate. The decisive overlooked
  writer was non-test product code; future probes should classify product writers before
  expanding into fixtures.

## WHERE THE PACKET FOUGHT THE REVIEW

The review packet was precise about writable files, base commit, stop conditions, and the six
mandatory checks. Its weak point was E8: "the two seeder families/versions" encoded the
author's conclusion instead of supplying a neutral command. The upstream evidence packet also
labels an expanded paraphrase as "verbatim" and inherits the false "both UNWIRED" premise.
Those wording choices encourage a verifier to confirm the packet rather than test it.

The upgrade with the highest leverage is a generated evidence table in each packet with four
columns: claim, exact command, expected scope/exclusions, and decision if output is empty or
ambiguous. That would turn this class of review into a one-prompt machine while preserving the
mandatory failure direction.

## CONTRACT COMPLIANCE

The checkout, board, packets, and work under review remained read-only. I ran no tests, builds,
installs, database queries, or git state changes, and did not read the 1959-line spine. This
self-report was filed before the review marker, as required.

## r2

### Case outcome

All four routed r1 findings were implemented: Gate 2 is now `CANNOT-ASSESS`; the third
non-test register writer is enumerated; E11 uses the pruned command with its literal empty
result; and the speculative T14b reinforcements are gone. The rework nevertheless introduced
two new quantifier errors and one wrong line anchor, so r2 cannot be approved.

CAUSE: the worker repaired the original "only/exactly" claims but did not apply the same
failure-direction check to new phrases introduced during the rewrite. "Any one" missing-
evidence artifact was said to close a gate that explicitly needs two facts. "Any other sealed
version" was said to raise one error without walking the reader's ordered guards. The rework
therefore repeated the same class of defect at a smaller scale: prose quantified beyond what
the cited code establishes.

PRICE: one more review/rework cycle, making r3 the last lawful rework round. The substantive
gate answer does not need to change; the repair is narrow—correct the evidence-sufficiency
matrix, correct the version-1 failure mode, and fix one line citation—but the append-only
DECISIONS proposal cannot carry the current "any one closes it" wording.

### What I nearly got wrong

The four-row r2 disposition table made approval feel mechanical. I nearly stopped after
confirming B1/B2/N1/N2 were present. The packet's explicit warning about a classic rework
over-claim forced an independent pass over every new universal phrase. That pass found the
actual convergence defect.

For the version-1 claim, it was not enough to confirm that bootstrap source refs are non-
development. `readDevelopmentRunnerPolicy` checks row completeness at
`dev-runner-policy.ts:104` before provenance at `:105-110`. None of the bootstrap writer's
row families contains the required runner-policy keys, so bootstrap-only v1 reaches
`DEV_RUNNER_POLICY_UNRESOLVED` first. Acceptance v1 may reach the provenance guard; the two
v1 states cannot be collapsed into one asserted error.

### Dead ends and efficiency upgrades

- One attempted shell loop for comparing row keys failed on zsh regex quoting. A single
  scoped `rg` over the five bootstrap constant-row files settled the question with zero hits.
  Future evidence packets should prefer one literal alternation over shell-generated regex.
- No runtime/database probe was needed or allowed. The ordered source guards plus the static
  bootstrap row construction discriminate the failure mode.
- Missing-evidence lists should be generated as a property-to-artifact matrix. Here the gate
  needs both (A) production-selected version and (B) sealed source refs at that version.
  A launch definition or environment receipt normally proves only A; a register receipt is
  sufficient only when tied to the selected version. That matrix would prevent "any one" from
  being written reflexively.
- Error-code claims should cite the first reachable guard, not merely the most salient later
  guard. This is the static-review equivalent of RED-first reproduction.

### Packet and process

The r2 packet was high leverage: it named the four convergence checks, singled out the new
bootstrap claim, required DECISIONS fidelity, and demanded that the worker's marker-ordering
deviation be verified on the record. The deviation is present in the worker self-report. The
only packet friction is that "no new over-claims" still requires the reviewer to enumerate
new quantifiers manually; a prose lint checklist for `any`, `all`, `only`, `exactly`, and
`never` would make that mechanical.

The checkout, board, packet, worker report, and worker self-report remained read-only. I ran
no tests, builds, installs, database queries, or git state changes, and did not read the
1959-line spine. This r2 section was appended before the r2 verdict marker.

## r3

### Case outcome

The final round converged. All three r2 findings are implemented without changing the gate
answers: the report now requires production-version and sealed-provenance evidence jointly;
it walks completeness before provenance and assigns bootstrap-only v1
`DEV_RUNNER_POLICY_UNRESOLVED`; and the development-seeder callsite is corrected to line 372.
The recommendation remains the pure gate conjunction, and G1–G4 stay within the evidence.

PRICE ACROSS THE CASE: three review rounds. R1 prevented a false `NOT-BROKEN` fact from entering
an append-only decision record; r2 caught smaller quantifier errors introduced by the repair;
r3 needed only localized text verification. The expensive cause was consistent across rounds:
universal prose (`only`, `exactly`, `any one`, `any other`) was written faster than its search
universe or ordered guards were checked.

### What nearly went wrong and what to upgrade

The final packet requested diff-scale scrutiny, but the evidence report is untracked, so Git
has no r2 blob against which to produce a mechanical r2→r3 diff. I used the r2 findings' exact
quoted spans, the full r2 report already read in this same reviewer session, current heading
and quantifier scans, and surrounding decision text. No substantive expansion beyond the
three routed corrections was found.

UPGRADE: every rework packet should preserve the prior artifact as a content hash plus either
a read-only snapshot path or a literal patch. "Only three edits" then becomes a one-command
verification instead of a memory-and-span comparison. This is especially important for
untracked mission artifacts, where `git diff` cannot supply history.

The most efficient final-round check was a three-row matrix: finding → corrected span → source
discriminator. N1 maps to A∧B in the gate and G2; N2 maps to the line-104 completeness guard
before the line-110 provenance guard; N3 maps to the numbered callsite. That format should be
generated by the router for every last-round packet.

### Dead ends avoided

No test, build, database, or runtime probe was needed or lawful. Re-running the entire r1
evidence suite would have added cost without discriminating the three open items. The final
review stayed on the routed spans and their immediate decision consumers.

The checkout, board, packet, evidence report, and r2 findings remained read-only. I ran no
tests, builds, installs, database queries, or git state changes, and did not read the
1959-line spine. This r3 section was appended before the r3 verdict marker.
