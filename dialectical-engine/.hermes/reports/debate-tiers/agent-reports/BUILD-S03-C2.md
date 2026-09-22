# BUILD-S03-C2 case file — ticket `t_6a2ba493`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The implementation was committed as `a9179644` on `slice/tiers-s03`. The final three cluster runs were each 26/26 across 4/4 files, the per-suite runner printed `CLUSTER_GREEN`, the three relay gates retained 8/8, 15/15 and 10/10, and `pnpm typecheck` emitted no diagnostic in an owned path. No provider was called. Elapsed seat time from CLAIM to commit evidence was about 17 minutes.

## Findings

### F1 — the packet expresses two different orders for the first RED

CAUSE: `BUILD-S03-C2.md:10` and `:27` require implementation order S14 → S16 → S17, while `:27` also requires the S17 test and its five-URL RED before any product edit. Those are compatible only if “implementation order” and “test creation order” are treated as different orders; the packet does not say that.

PRICE: one deliberate scheduling interpretation, one early S17 test run, and extra narration so a reviewer can reconstruct why S17 evidence precedes S16 implementation. No code retry resulted.

NEAR MISS: implementing S14 immediately after its RED would have violated the S17-before-any-product-edit sentence.

VERDICT / make the packet say “create and run S14 RED, then create and run the cluster S17 sentinel RED, then implement S14 → S16 → S17” / CONFIDENCE high / STRONGEST COUNTER: the current prose contains all constraints and a careful seat can derive that order.

### F2 — the required S17 RED frame is stronger than Vitest's default diagnostic

CAUSE: `BUILD-S03-C2.md:27` requires both remote hosts to appear in the frame, but `toHaveLength(3)` formats a five-element URL array as `[…(5)]`. The first valid RED proved 5 versus 3 but hid the hosts.

PRICE: one extra 0.6-second Vitest run, one test-only diagnostic message, one log inspection, and one additional command/result exchange. Exact token telemetry is unavailable.

DEAD END: `/tmp/debate-tiers-BUILD-S03-C2/s17-red-1.log` is a correct RED but cannot satisfy the host-visibility clause. The usable frame is `s17-red-2.log`.

VERDICT / include the diagnostic-message shape in the packet's test sketch when verbatim output must reveal array members / CONFIDENCE high / STRONGEST COUNTER: requiring the observable but leaving assertion design to the worker tests whether the worker understands the evidence contract.

### F3 — the S16 constant and the allowed hunk pull in opposite directions

CAUSE: `BUILD-S03-C2.md:15` confines S16 writes to the existing request-body block at `provider-discovery.ts:54-62`, while PLAN S16 requires a named frozen `PROBE_BODY_EXTENSIONS` map. A conventional module-scope constant would write outside the authorized hunk. The compliant implementation therefore scopes the frozen map inside the body-producing expression and constructs it per probe.

PRICE: several minutes of boundary analysis and a less direct request-body expression. Runtime cost is one tiny frozen object graph per probe; it was not benchmarked.

NEAR MISS: placing the constant beside `MAX_PROBE_RESPONSE_BYTES` would read cleanly but cross the exhaustive write contract.

VERDICT / authorize one explicit module-scope declaration line for S16, or prescribe the local expression in the packet / CONFIDENCE high / STRONGEST COUNTER: probe frequency is low, the current expression is typechecked, and keeping the diff inside one hunk makes review mechanical.

### F4 — the capture-first law lacks a ready C2 runner

CAUSE: `BUILD-S03-C2.md:18` requires every run to originate from a `.sh` that captures the full log first, but supplies only the later `run-suites.sh` marker runner. The seat had to create `/tmp/debate-tiers-BUILD-S03-C2/run-vitest.sh` and a typecheck companion before measurements.

PRICE: two scratch scripts, two setup calls, and repeated care around shell quoting. The scripts are outside git and cannot aid the next seat.

VERDICT / ship one repository-owned capture runner that accepts a log path and literal suite arguments, and name it in every BUILD packet / CONFIDENCE high / STRONGEST COUNTER: a local script is small and lets each packet control exactly what it prints.

### F5 — the baseline reading floor is much wider than this cluster's diagnostic need

CAUSE: the packet requires `BASELINE.md` in full although this cluster needs only the typecheck rule and the fact that none of its owned paths is pinned. The file is 376 lines, 3,104 words and 25,351 bytes, most of it unrelated lane history and pasted failure output.

PRICE: a byte proxy of 25,351 input bytes, roughly 6k–8k model tokens depending on tokenizer, plus attention spent separating S01/S02 history from S03. Exact token telemetry is unavailable.

VERDICT / give each packet a generated baseline excerpt containing the relevant diagnostic rows and suite pairs, with a digest back to the full authority / CONFIDENCE high / STRONGEST COUNTER: reading the authority in full can expose inherited failures a narrow extract accidentally omits.

### F6 — shared-lane status is truthful but noisy and creates an index race

CAUSE: C1's `package.json`, `pnpm-lock.yaml`, ADR, package directory and test appeared during every restore status. The packet correctly warns not to touch them, but `git status --porcelain clean of everything outside allowed` at `BUILD-S03-C2.md:18` cannot literally hold while the authorized parallel seat is still writing.

PRICE: every restore produced five unrelated entries, each requiring classification. Commit needed an explicit empty-index check and an exact staged-path assertion. No cross-seat file was staged.

VERDICT / define the gate as “no unexplained path outside allowed” for parallel lanes and provide an expected-foreign-path manifest plus a per-lane commit mutex / CONFIDENCE high / STRONGEST COUNTER: literal cleanliness is simpler and becomes true once the parallel seat commits.

## Near misses caught before damage

- The first draft of the S17 test parsed the Z.AI URL through the still-unfixed S14 gate. That would have produced the wrong RED (`PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`) instead of five recorded URLs. I replaced parsing with hand-built typed targets before running it.
- The first S17 record assertion pinned Promise completion order. The requirement is membership, not asynchronous order. I changed it to length plus exact set membership and re-ran the no-record mutant RED before the final gate.
- The mutation workflow never used `git checkout --`; byte snapshots in `/tmp/debate-tiers-BUILD-S03-C2/` preserved the uncommitted green implementation through every restore.
- The shared git index was empty immediately before staging. The commit command asserted the exact five staged paths before creating `a9179644`.

## One-prompt machine upgrade

VERDICT / compile each BUILD packet into a machine-readable execution manifest: ordered RED events, owned hunks, expected initial/final suite pairs, canonical capture commands, concrete mutant patches, restore hashes, allowed foreign dirty paths, and the exact READY schema. Let the seat consume the manifest while humans read the Markdown rendering / CONFIDENCE high / STRONGEST COUNTER: generated manifests can faithfully encode a mistaken plan faster than prose review notices it, so packet-check must validate both forms from one source.

The highest-return fields for this ticket are: `pre_product_red_order`, `allowed_hunks`, `expected_foreign_dirty_paths`, `capture_runner`, `mutants[]`, `suite_pairs_before`, `suite_pairs_after`, and `handoff_lines[]`. Those fields would have removed every interpretation and scratch-runner cost above without weakening the evidence.
