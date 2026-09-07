# FIX-09 C3.5/C4 — nameless Git-object admission repair

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v18.md` without changing their bytes. It replaces only the stopped v18 reachable-object row parser and shadow status-cause renderer. Every v18 coherent-snapshot, raw-evidence, replay, security-projection, pair-manifest, claim, collision, preserved-failure, authority, dependency, program, path, permission, signer/session, delivery adapter, materializer, SQL-probe, build/parser, C3.5, 39→32→20, and STOP law remains fail-closed.

## 1. Frozen v18 authority and failure evidence

The direct predecessor is commit `9f105f11c96dbf04b0f022725e9a465eaddf0dae`, parent `09e6da124872f7913644f2cab6ec1a786bdc254b`, tree `79f56185e65e910e38ecaedfe220cc2d1309c44d`, subject `docs(obs): make FIX-09 v18 snapshots coherent`. Its exact authority documents are:

| path | Git blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `bc9d6f84b9634ba1f3665d305f5202958e360452` | `bbb671816312ef128ff10290a57c201fd105f5c3581e882357cfbeff7fbd2330` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v18.md` | `5f38201a7f3411aa3435431410d2702f9883a008` | `7eb2925f405426ca3f110d3495400d348d1b9088a106b59ceafc8b45a38b8e45` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v18.md` | `2c1bd86ed61be254365eddb90a52cc4a17da6c96` | `14ab2f8ea1e650bcea1faf7ee6e564602a9dc47245e75be902fb21c4f673f3ac` |

The exact v18 program is 204,341 bytes, SHA-256 `3d56b8998ee63a3d365737486f5bdaebd25f9a94f8f03d9d0048f55583aad333`, Git blob `790fbbe795fa5a794908ef3703715fd1bb7ab15b`; the exact runner is 21,904 bytes, SHA-256 `c77c9bf9445e3a2325dd2ac0ddd17d95ff37fb85c3acefd2efd19d40fdbb8bcc`, Git blob `dcd6d3c4d5740a5b4641c46e79434ec7e1781f61`.

All v18 precommit and postcommit safe/static gates passed. The sole canonical cryptorandom no-hardlinks shadow used runner token `5066fee7`, then failed closed at rc 2 with empty stdout and exact stderr `FIX09_SHADOW_FATAL code=FIX09_SHADOW_UNEXPECTED\n`. No real v18 scan or Task 0 identity was created. The ignored STOP report is 7,003 bytes, 95 lines, SHA-256 `d066662e8cf8f0fab02b16bbef72027e5f449876b38dab08b1a73bba286fe0b4`.

The preserved Phase-1 diagnostic proved the hidden inner failure was t0-039 rc 2 with exact 38-byte program stderr `FIX09_FATAL code=FIX09_COLLISION_SCAN\n`, SHA-256 `fa2b789ead1c9b9143acab9de4bdd52dfebe4810174148635716a2ebe97c7032`. The rejected raw row was exactly lowercase OID `170396ead5c5d6eb04d9c11b4ec39ac77720b952`, one ASCII space, and LF. The diagnostic report is 10,202 bytes, 187 lines, SHA-256 `4115d648565733471429fece57f3fa2abd49301f2375580bd36dbcfcf1d7e4ce`; its two output-only harnesses and all exact stream/stack/hash evidence remain diagnostic-only and preserved.

V19 never retries, overwrites, deletes, amends, or certifies v18. All v10-v17 failed/rejected/STOP evidence remains frozen too.

## 2. Exact v19 authority identity

The future v19 subject is exactly `docs(obs): accept nameless Git objects in FIX-09 v19`. Future t0-002 binds direct parent `9f105f11c96dbf04b0f022725e9a465eaddf0dae`; t0-003, `AUTHORITY_SUBJECT`, program self-check, runner precheck, and receipt-bound subject fact use the same literal. `verifyPreviousAuthority` separately proves the frozen v18 parent/tree/subject and three document pins above.

The program, runner, manifests, pair bundles, receipts, branch, and worktree use v19-only paths and schemas. No v18 output path is reused.

The exact Appendix C v19 program is 206,142 bytes, SHA-256 `c61e3a5698d3c04caf8e701527dbb60537fe8c4a118dc898d4f5c637824796e4`, Git blob `8eee27e9cb6aefe5d007272ccd02c4239c5e7bbe`; the exact Appendix B runner is 22,786 bytes, SHA-256 `c7e2b72f8c6bffecba8b89fa5012e8724636123c10fdae5e07d828c9280cc1fc`, Git blob `0ff111ed34d08937249a22cc06ba9154b4c01af7`.

## 3. Reachable-object row grammar

The exact admitted `git rev-list --objects <captured OIDs>` decoded-row grammar is:

```regex
^([0-9a-f]{40})(?: (.*))?$
```

It accepts exactly these Git forms:

1. `OID`;
2. `OID<ASCII space>` with an explicitly empty path;
3. `OID<ASCII space><path>`, where the path is the complete remaining row and may itself begin with a space.

Bare OID and separator-plus-empty-path both normalize to the empty path. The collision matcher discards that empty path before applying the closed migration regex. It never treats a nameless object as a path, claim, collision, or allow decision. A normal path is matched exactly as inherited.

Strict UTF-8, lowercase 40-hex OID, the one required separator position, and LF row framing remain mandatory. NUL, CR, uppercase/short/malformed OID, leading junk, tab delimiter, or a missing separator before path is fatal `FIX09_COLLISION_SCAN`. The raw reachable-object stdout remains independently retained as canonical base64 plus decimal byte length and SHA-256 in each complete transcript; parsing never replaces or normalizes the sealed bytes.

The production-function fixture calls the actual v19 parser and raw sealer. It proves all three admitted forms, a collision path, an ordinary path whose first character is a space, four exact raw round trips, two nameless cases, seven malformed-row kills, and the exact old `(.+)` mutant kill. The v18 parser is the required RED; v19 is GREEN.

## 4. Closed shadow status rendering

The runner's only renderable dynamic capture IDs are the closed 59-member set:

- `t0-001` through `t0-040`;
- `h0-001` through `h0-019`.

`capture` validates membership before status comparison. A valid status mismatch is rendered by uppercasing the admitted ID and replacing its sole hyphen with underscore: for example, `t0-039` becomes exact code `FIX09_SHADOW_STATUS_T0_039`. The outer `^FIX09_[A-Z0-9_]+$` normalizer therefore retains that precise closed cause.

No arbitrary ledger value is interpolated into an emitted code. Null, empty, lowercase-shape deviations, uppercase IDs, underscore IDs, truncated IDs, out-of-range IDs, or suffix/prefix extensions fail as fixed `FIX09_SHADOW_LEDGER`. Ten literal invalid-ID hostiles and both boundary valid IDs run before any shadow mutation. Unknown native/runtime messages remain `FIX09_SHADOW_UNEXPECTED`; v19 does not make them trusted.

## 5. Unchanged coherent security boundary

Every v19 scan remains `fix09-complete-security-scan/v2`: it captures authority/ref/raw-registry/preserved state at start and end, traverses only captured OIDs, retains raw ref enumeration/per-tree/reachable/worktree/body evidence, independently validates OID existence/type/peel, performs two complete descriptor-stable worktree passes, rederives paper plus all five collision views from admitted bytes, and requires the same snapshot digests across consumers. Only a difference between two individually lawful snapshots is `FIX09_PAPER_UNSTABLE`; every malformed/security/claim/collision/preserved/type/link/path/permission/read/parser failure is immediately fatal.

`boundedCompleteCollectV19` retains three attempts/six scans, independently validates and seals two raws, independently derives two `fix09-security-projection/v2` values, compares their canonical bytes, and binds both raws/projections/snapshot receipts plus the final accepted trace row into one `fix09-security-pair-bundle/v1`. Raw transcripts may differ only in excluded ambient evidence. The security projections must be byte-identical. Candidate evidence remains the domain-separated pair-manifest digest, never scan 2.

The 39 base facts, 32 candidate fields, 20 candidate validation outcomes, 17 result fields, three result outcomes, seven t0-032..038 zero-traversal bindings, one t0-039 collector, 16-file/118-name/12,676-byte C3.5 projection, exact 33-path implementation ledger, FIX-10-v9 shape-only dependency, and FIX-10 C0/C4 STOP boundaries remain unchanged.

## 6. Required v19 proof and execution order

Before commit, run the original v18 RED harness against immutable v18, then the v19 production regression fixture and status-law harness. Run `v19-precommit-fixtures` against the exact draft SPEC/PLAN/single decision row and embedded program/runner; run syntax, fence equality, base/candidate/result ledger, snapshot/replay/projection/pair/trace, C3.5, frozen-predecessor, exact-scope, empty-index, and preserved-FIX07 checks.

After committing exactly the three authority paths, repeat all immutable aggregate/static/fixture gates. Under the user's explicit no-review hold and standing sole-option approval, the v19 commit, one canonical cryptorandom no-hardlinks shadow, and exactly two bounded real authority-verification `immutable-paper-scan` invocations do not require a new review. They are authority verification only and create no Task 0 branch/worktree/receipt/manifest. Stop without retry on the first failure.

If both real outputs validate and their independently derived security projections are byte-identical, preserve both raw transcripts and hashes. This still does not authorize real Task 0: the inherited candidate/result flow literally requires fresh independent v19 authority/admission review. Because reviews are held, execution stops at that exact blocker. C3.5, FIX-10 C0, and C4 remain downstream STOP.

This authority round creates only `SPEC-v19.md`, `PLAN-v19.md`, and one appended FIX-09 decision row. It creates no product/test/migration/native implementation, live key, database, service, V, merge, push, board, acceptance, or Done act.
