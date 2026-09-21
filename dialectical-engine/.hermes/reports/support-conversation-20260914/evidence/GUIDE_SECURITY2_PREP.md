# GUIDE_SECURITY2_PREP — sealed future recheck preparation

## Status

**PREPARED, NOT EXECUTED.** This is not a security verdict. It binds a future actual-route synthetic recheck to the immutable reference `c34c64d4e643e404cefe96dfaf167536ae364a94` and to the independently approved PG-1/PG-6 semantics. The active author output was not inspected.

## Planned matrix

The matrix contains **31 unique cases**:

| Class | Cases | Expected route behavior |
|---|---:|---|
| Token/code credential operations without a password literal | 6 | fixed `REFUSE_ZONE`, exact operation guidance, zero answer/actions/sources |
| Predicate-local negation across comma, conjunction, order, and period | 8 | any affirmative operation keeps fixed `REFUSE_ZONE`, zero answer/actions/sources |
| Previously fixed semicolon regressions | 3 | fixed Forgot guidance, zero answer/actions/sources |
| Benign recovery navigation | 2 | fixed actionless Forgot guidance, zero answer/actions/sources |
| Solely negated recovery operation | 2 | ordinary synthetic answer path, `NO_SOURCE`, no returned actions/sources |
| Explicit Support account-operation actor | 3 | `REFUSE_ZONE`, zero answer/actions/sources |
| User-facing account-menu navigation, including negated Support operation | 4 | ordinary synthetic answer path, `NO_SOURCE`, no returned actions/sources |
| Private-record boundary | 2 | fixed `REFUSE_ZONE`, zero answer/actions/sources |
| Injection plus private-record request | 1 | `REFUSE_INJECTION`, zero answer/actions/sources |

The exact five GUIDE_SECURITY failures are retained verbatim under IDs `gs1_exact_en_token`, `gs1_exact_ro_code`, `gs2_exact_en_comma`, `gs2_exact_ro_comma`, and `gs3_exact_en_support_where`. The other 26 cases are bounded transformed and benign neighbors derived from the PG-1 public-only boundary and PG-6 subject × predicate × polarity × modality × clause-order contract. No unsupported language or open-ended corpus was added.

Across the matrix, 25 deterministic operation/private/injection/recovery-navigation cases require zero answer calls. Six benign or solely-negated cases require one ordinary answer call each. Every case requires zero returned actions and zero returned sources because the eventual harness uses an inert `NO_SOURCE` answer and keeps the unresolved Forgot destination actionless.

## Future runner contract

`run-security2-probe.mts` requires three environment parameters: exact clean target root, full target revision, and its immutable product manifest. Before importing product modules it checks:

1. `git rev-parse HEAD` equals the supplied revision;
2. `git status --short` is empty;
3. manifest revision equals the supplied revision;
4. every manifest product-file digest and byte count matches; and
5. every manifest deleted path remains absent.

Only after custody succeeds does it dynamically import the target's actual `installSupportRoutes`, classifier, recovery guidance, and public-guide boundary. It creates EN and RO synthetic sessions, posts all 31 cases through Fastify injection, and measures route outcome, answer-call delta, returned actions/sources, exact deterministic recovery text, classifier outcome, recovery kind, private boundary kind, and account-location predicate. It composes no private-context, account-operation, authentication, reset, recovery, case, or incident port.

The sealed command template is in `COMMAND.txt`. The exact future command is:

```text
env LOG=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_SECURITY2-route.log zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh env TSX_DISABLE_CACHE=1 GUIDE_SECURITY2_TARGET_ROOT=[EXACT_CLEAN_TARGET_ROOT] GUIDE_SECURITY2_TARGET_REVISION=[FULL_40_HEX_REVISION] GUIDE_SECURITY2_TARGET_MANIFEST=[ABSOLUTE_IMMUTABLE_PRODUCT_MANIFEST] node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_SECURITY2_PREP/run-security2-probe.mts
```

It must run only after final revision handoff, custody freeze, dependency preparation, and explicit heavy-lease transfer. Any failed first attempt remains evidence; the matrix oracle must not be edited in response to a product failure.

## Static custody and source receipt

The indexed-input check covered all 18 frozen inputs with zero mismatches. The matrix parsed to 31 unique IDs and retained all exact five failures. No prepared probe was executed. Static log: `GUIDE_SECURITY2_PREP-static.log`, SHA-256 `5f25fbdbef0fda566d4188f036d190aa439d0739c5eb8e3620eb056de296834b`, 212 bytes.

Immutable c34 source hashes used to derive the runner:

| Source | SHA-256 |
|---|---|
| `apps/api/src/support/recovery-intent.ts` | `c3cda8dcd5764c84e8b56dffb99f883eb92b1a1a42eb3aaa514b7133e1e624ab` |
| `apps/api/src/support/public-guide-boundary.ts` | `a267aca9cfb95ec3311ff66eabf7475e443db555cad639ac6e44b272a5ea824b` |
| `apps/api/src/support/classify.ts` | `287490d68366b96cde811c7a220e51f0da477409a44478d16bb8112014d164dd` |
| `apps/api/src/support/security-guidance.ts` | `a61234d0b24f64a0739f996fcc52ffea0d1a29a66fd8388ce60f462d7d66b12b` |
| `apps/api/src/support/index.ts` | `b9c26d9658a6de0ae8c8c1ca8f994693f21d51faaa65831ce8a95d2b68c10a7e` |

The immutable security checkout remained clean at c34. No primary/author bytes, product files, tests, Git state, dependency links, runtime, database, browser, HTTP, model, provider, or private data were touched.

## Artifact hashes

| Artifact | SHA-256 | Bytes |
|---|---|---:|
| `probes/GUIDE_SECURITY2_PREP/matrix.json` | `9b0438841af1dfe9b7fa6925f660a401f8c398887445ffedd8eccc9c4e18c53f` | 7779 |
| `probes/GUIDE_SECURITY2_PREP/run-security2-probe.mts` | `cbe8c90c6bd098df6c70c74cc2838c2a07d1237ed192d2bf0c16ad09321b9640` | 7286 |
| `probes/GUIDE_SECURITY2_PREP/COMMAND.txt` | `d4cd451e4df16017586b2737316e78cd4d5455f9ab7744cfe18e2e47cdd17e47` | 1106 |
| `logs/GUIDE_SECURITY2_PREP-static.log` | `5f25fbdbef0fda566d4188f036d190aa439d0739c5eb8e3620eb056de296834b` | 212 |
| `evidence/GUIDE_SECURITY2_PREP-inputs.json` | `1dc5ffa4c898315c80b5c189269f2d0162950045d9463edae64ab676dfef95d6` | 5078 |

## Limits

Preparation does not prove that the author correction works, that the TypeScript runner loads at the eventual target, or that all natural-language members are covered. The later GUIDE_SECURITY2 reviewer must preserve launcher/custody failures, run this sealed matrix at the verified final revision, inspect the changed guard implementation and its smallest affected tests, and issue the actual verdict. Existing role-denial evidence may be retained only if its defining source and migration hashes remain unchanged.

Ticket `t_ff1f3a30`; session `/root/forgot_destination`; comments read through `1789653868`; usage unavailable.
