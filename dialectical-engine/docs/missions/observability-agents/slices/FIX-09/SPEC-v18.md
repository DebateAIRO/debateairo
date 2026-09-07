# FIX-09 C3.5/C4 — coherent complete-snapshot admission

This successor-only authority incorporates `SPEC-v4.md` through `SPEC-v17.md` without changing their bytes. It replaces only the rejected v17 complete-scan collection and bounded-pair acceptance law. Every v17 claim, collision, preserved-failure, authority, dependency, program, path, permission, parser, signer/session, delivery adapter, materializer, SQL-probe, build/parser, C3.5, 39→32→20, and STOP law remains fail-closed.

## 1. Frozen v17 authority and STOP evidence

The direct predecessor is commit `09e6da124872f7913644f2cab6ec1a786bdc254b`, parent `dd2ae8c7124ef50aef83ee7a0f5ad25a4ae2900d`, tree `cef108e7b4ae1afb6c7168969cd006593426655b`, subject `docs(obs): correct FIX-09 v17 admission identity`. Its exact authority documents are:

| path | Git blob | SHA-256 |
|---|---|---|
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | `aaa1398e3292f93ac7a7b4373c0151453eb29a24` | `123e442d3efc22d5116b7e2e8371cc50d408e1b135cce459fac056212962422c` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/PLAN-v17.md` | `ef23400918760f13521170c6c4e4ecd1045dc9ed` | `36fb15e7e8a28bc7da2c5fb41467ce2973ef47e7cba8bd760c52063524f617b8` |
| `dialectical-engine/docs/missions/observability-agents/slices/FIX-09/SPEC-v17.md` | `0195cbc81572238134b8711c93b2369429c5a17c` | `b4247c7300c1d6d4538181e85b5e44b2c42e306549da6de13ea1768b9dee82df` |

V17 program/runner pins remain 140,589 bytes / SHA-256 `f7b3ccd2ae93458b8dcda93db5621ff8424bc092ec27a55ea1054a9b83c45997` / blob `819577d6439fa313539a81bdbbcbe86dd68a6752`, and 20,891 bytes / SHA-256 `28f5bdae70723fafbad4bde4aa3c73abf5a3606767c3f7e2fe0bdd24af289424` / blob `45be757199c5760b2ab2b3ea55684fab3132518f`.

The canonical v17 no-hardlinks shadow passed exact 39→32→20 with token `19523629`, three pairs/six scans, stdout 942 bytes SHA-256 `f209bbe68319b441f2c8280e01089b0cff91f3ab2a95c45a36e7f595b9e91a31`, and empty stderr. The first real authority-verification invocation then exhausted all three whole-raw-equality pairs: stdout 0 bytes SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; exact 45-byte stderr `FIX09_FATAL code=FIX09_PAPER_RETRY_EXHAUSTED\n`, SHA-256 `39eaaed0531eccecd3f241b56c4bc73a0fc2ddb903cd525b213467b027382a16`. Scan 2 was not started. The verifier was atomically preserved at `/private/tmp/fix09-v17-authority-verification.300e3f2f.mjs`; all future-v17 identities were absent afterward. The ignored report is 9,507 bytes, 79 lines, SHA-256 `fbc594d978ac20d158805136a7908f7fa1b70cd65ee52fe40c29c991f8cd0869`.

These are immutable STOP evidence. V18 never retries, overwrites, deletes, amends, or certifies v17.

Exact erratum: the frozen v17 report's nested v16 stderr SHA literal `524aa7f6e6554f915a1b82f6496376093ef72e2c70b5d0ce85275cc56ee11fe5` is wrong. The preserved 44-byte file is exactly `FIX09_SHADOW_FATAL code=FIX09_SHADOW_PARSER\n` and its correct SHA-256 is `524aa773d77582dd222551e68a77e1bdb36753eeac93994998264507ed759ec7`. The frozen report remains unchanged; this successor binds both the wrong literal and the corrected bytes/length/hash so no consumer may repeat the false nested claim.

## 2. Exact v18 authority identity

The future v18 subject is exactly `docs(obs): make FIX-09 v18 snapshots coherent`. Future t0-002 binds direct parent `09e6da124872f7913644f2cab6ec1a786bdc254b`; t0-003, `AUTHORITY_SUBJECT`, program self-check, runner precheck, and receipt-bound subject fact use the same literal. `verifyPreviousAuthority` separately proves the frozen v17 parent/tree/subject and three document pins above.

The program, runner, manifests, scan pairs, receipts, branch, and worktree use v18-only paths and schemas. No v17 output path is reused.

## 3. Coherent ref snapshot

Each complete scan captures one closed `fix09-ref-snapshot/v1` before traversal:

1. capture `refs/heads/codex/fixagent-plan` and `HEAD` as exact OIDs;
2. capture every ref as a sorted unique closed row `{name,target_oid,object_type,tree_oid}`, ordered by unsigned UTF-8 bytes, where `tree_oid` is the exact peeled tree or JSON null only for a lawful blob peel;
3. validate `git check-ref-format`-equivalent names, cardinality and byte order; independently prove every target exists, its declared type equals `cat-file -t`, and its commit/tree/tag-to-commit-or-tree peel is the exact tree while a blob or tag-to-blob peels to JSON null; then bind one `fix09-ref-snapshot/v1\0` digest before using a row;
4. feed only the captured target OID roots to reachable-object and reachable-history traversal; `--all`, a live ref name, live ref enumeration, or a post-capture root is forbidden;
5. feed only captured tree OIDs to ref-tip collision and ref-paper traversal;
6. retain the raw ref enumeration, ordered target/tree roots, every recursive per-ref/per-tree `ls-tree -z` stream, every path/blob row, every Markdown body/length/hash, and complete reachable-object/history streams; bind the same ref-snapshot digest into this traversal receipt, reachable-object, reachable-history, ref-tip collision, and ref-paper evidence.

At scan end, recapture authority ref, `HEAD`, and the full ref rows. If both captures are individually lawful but differ, the scan is `FIX09_PAPER_UNSTABLE`; malformed rows, unreadable objects, path/type/parser errors, or a security hit are immediately fatal. Add/remove/tip drift, live traversal, missing end check, and cross-view digest mutants must fail.

## 4. Unified coherent worktree snapshot

Each complete scan captures the raw NUL worktree registry and canonical sorted physical roots before worktree traversal. A closed `fix09-worktree-security-request/v1` requests all tracked and all nonignored-untracked paths, Markdown content, and the inherited private-component exclusion. The exclusion validator runs before Git/list/stat/open/read.

For every captured root, one unified snapshot performs exactly two full passes. Each pass obtains complete NUL tracked and nonignored-untracked enumeration, validates unsigned-UTF-8-byte-sorted unique relative paths and tracked/untracked disjointness, and reads every Markdown path through the inherited no-follow descriptor stable-read law. Before open, `lstat` must prove regular, nonsymlink, single-link type; open uses `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`, then retained-fd/path pre/post identity and size checks remain mandatory. The two passes must have byte-identical enumeration seals and identical ordered `{root,path,kind,content_sha256,metadata}` projections. FIFO, socket, device, late symlink, hardlink, wrong type, path escape, permission, unreadable source, or malformed enumeration is immediately fatal; an individually lawful enumeration/content change is retryable only as `FIX09_PAPER_UNSTABLE`.

Every admitted raw NUL stream uses canonical padded base64 plus canonical decimal byte length and SHA-256. Every Markdown body uses the closed JSON-safe `{body_base64,bytes,content_sha256}` representation, requires exact base64 decode/re-encode equality, safe decimal length, hash, and strict UTF-8 equality, and is decoded from those admitted bytes for classification. JavaScript `Buffer`, number, accessor, alternate base64 spelling, or digest-only body evidence is forbidden on the wire. Replay rechecks one and only one validated body for every enumerated Markdown path in exact root/kind/path order.

Worktree tracked/untracked collision hits are derived from those captured all-path enumerations. Worktree paper claims are derived from the same captured Markdown bodies. Their evidence binds one `fix09-worktree-snapshot/v1\0` digest. No collision or paper view may enumerate a path independently or consult a live worktree after capture.

At scan end, recapture the raw registry/canonical roots and exact two preserved-failure live states. Start/end registry and preserved states must be byte-identical. Wrong registry/root/path/end check, omitted second enumeration, live traversal, cross-view digest, or preserved drift fails. Malformed or noncanonical preserved state is always fatal; only two individually lawful unequal boundary captures are unstable.

## 5. Complete transcript and security projection

The v18 raw schema is `fix09-complete-security-scan/v2`. It retains:

- scan context, attempt ordinal, scan ordinal, and distinct capture id;
- complete start and end `fix09-scan-boundary/v1` seals for authority, refs, raw registry/canonical roots, and preserved live states;
- complete `fix09-ref-snapshot/v1` and `fix09-worktree-snapshot/v1` receipts;
- the ref/worktree snapshot digest on every consuming paper/collision view;
- raw canonical base64, decimal byte lengths, hashes, and all ambient document/enumeration/content/metadata/count evidence, including every ref-tree, reachable-object/history, and worktree stream;
- the full inherited security identity and decisions.

`validateCompleteSecurityTranscript` first replays admitted raw bytes; independently proves OID existence/type/peel; reconstructs every ref-tree path/blob/body and every worktree enumeration/body; rederives the authority allow projection, paper counts/digests and claim decisions, and all five exact collision arrays/counts; then proves coherent start/end closure, captured-root traversal, cross-view digest equality, two-pass worktree equality, exact preserved registry owner/head/branch membership, zero independent claims, and all five collision counts zero. A caller-supplied decision, count, digest, or match array is never trusted. Only then may `fix09-security-projection/v2` be independently derived.

The projection retains every v17 security field: authority commit/parent/tree/documents/allow; actual program bytes/SHA/blob; full scope and request; historical pin; FIX-10-v9 ref/parent/tree/docs/allow/review; exact preserved policy/live rows and two hits; five exact zero collisions; zero independent claims and empty matches; and the v18 transcript/paper/projection schema/domain. It excludes only ambient ref/worktree enumeration, document, content, metadata, count, raw-command, and snapshot-digest values. Excluded ambient values remain sealed in each raw transcript and pair manifest.

## 6. Bounded projection-equal pair

`boundedCompleteCollect` retains the ceiling of three attempts/six complete scans. In each attempt it:

1. performs, validates, canonicalizes, and seals scan 1;
2. performs, validates, canonicalizes, and seals scan 2 independently;
3. derives each canonical projection independently from its validated raw;
4. compares the projection bytes, never raw transcript bytes;
5. accepts only equal projections and otherwise resets all attempt state before the next pair.

Raw transcripts may differ because unrelated ambient state changed between two individually coherent scans. A claim, collision, preserved-policy violation, malformed boundary, dependency/authority/program mismatch, path/type/link/permission/read/parser error, or fabricated fatal code is never retryable.

The accepted output is a closed `fix09-security-pair-bundle/v1`, not scan 2. It embeds both full raw transcripts and a `fix09-security-pair-manifest/v1` recording context, ceiling, accepted attempt, two ordered scan receipts, and a closed comparison. Each scan receipt binds attempt/scan/capture identity; raw bytes/SHA; projection bytes/SHA/security digest; start/end authority and preserved hashes; ref snapshot digest; registry start/end digests; and worktree snapshot digest. Capture ids are distinct and scan positions cannot be omitted, reused, swapped, or carried from another attempt.

The manifest embeds a closed ordered `fix09-security-attempt-trace/v1`. Every attempt states scan-1/scan-2 status, projection comparison, terminal disposition, and informational raw equality. Every wire counter is a canonical unsigned decimal string; arithmetic occurs only after exact safe-integer parse and round-trip. Totals obey the inherited nonnegative safe-integer accepted/exhausted/fatal equations and exact maximum. The accepted attempt must equal the final trace row, canonical `pair_starts`, both raw positions, and both ordered manifest receipts. Omitted/reused/swapped/carried/whole-pair-carried/raw-only acceptance and number/float/negative/overflow/malformed/fabricated traces fail.

Base, derive, positive candidate validation, positive result validation, and each independent reviewer/result reviewer own a new pair and retain both raw transcripts plus the manifest. Hostile candidate/result mutations perform no full scan. The candidate's `migration_collision_evidence_sha256` is the domain-separated accepted pair-manifest digest, never scan 2 or a caller-supplied digest.

## 7. Required deterministic proof

Before commit, one required nonwriting `v18-precommit-fixtures` mode binds the current draft SPEC/PLAN/single decision row and exact embedded program/runner fences. Through explicit abstract Git/FS adapters it calls the actual `boundedCompleteCollectV18`, complete-transcript validator, ref/worktree replay, paper/collision rederivation, scan sealer, pair-manifest validator, and canonical whole-pair serializer/parser. It proves at least one Markdown body, two different ambient raw hashes, identical independently derived projections, canonical wire round trip, and zero live security traversal. A simplified parallel oracle is not sufficient. It must kill:

- omitted, reused, swapped, carried, whole-pair-carried, and raw-only pair acceptance;
- raw/body noncanonical base64, substituted/omitted bodies, and number/float/negative/overflow trace values;
- invalid/duplicate/misordered refs; missing OID, wrong type/tree/null peel; ref add/remove/tip, live-root traversal, omitted end check, and cross-view digest;
- registry/root/path/end, duplicate/reordered/overlapping paths, omitted second enumeration, live worktree traversal, and cross-view digest;
- preserved-state drift and authority-end drift;
- all inherited twenty-one projection hostiles and all fatal claim/five-collision cases.

Static closure must prove no v18 security collection uses `--all`, no paper/collision path consumes a live ref/worktree enumeration after capture, every consuming view binds its captured snapshot digest, all t0-032..038 binding modes execute `scannerRoot()`/`selfCheck()` once before output while performing zero security traversal, and the C3.5 immutable/editable sets are exact and disjoint. The v18 no-hardlinks shadow and real scans remain forbidden until a fresh narrow review returns zero unresolved P0-P3.

## 8. Frozen architecture and STOP boundary

V18 explicitly supersedes one inherited C3.5 ownership contradiction. The first four adjacent files (`tests/unit/fix09-bundle.test.ts`, `tests/unit/fix09-fold.test.ts`, `tests/unit/fix09-tier-gate.test.ts`, `tests/architecture/fix09-no-model.test.ts`) and `tests/unit/fix09-capture-gate.test.ts` are the exact five immutable tests. `tests/integration/fix09-daemon.test.ts` is the eleventh editable test, after the other ten projected C3.5 tests. The full gate remains the same ordered 16 paths and exact 118 unique reporter names / 12,676 canonical bytes / SHA-256 `8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce`; immutable and editable sets must be disjoint.

FIX-10 v9 is consumed solely as immutable signer/build/interface **shape authority** at commit `a539ba114bd80e9234c08ba77c75772d0d111d94` and review path/blob/SHA historical evidence. Its literal approved-FIX09-v13 prerequisite remains unsatisfied and is not reinterpreted or satisfied by v18. Neither v18 approval, Task 0, nor reviewed C3.5 authorizes or unlocks FIX-10 C0. FIX-10 C0 remains STOP until a future append-only FIX-10 successor, authored only after exact v18 authority and an independently reviewed C3.5 receipt exist, substitutes those exact identities for rejected v13 and itself receives a zero-finding independent review; that successor must also supply byte-exact verdict lines instead of relying on the current review's whitespace. C4 remains downstream.

Subject to those corrections, the 33-path future implementation ledger, native descriptor custodian and pinned signer session, generation-scoped delivery adapter, exact DIRECT/SPOOL materializer, one private SQL helper/probes, deterministic native build/parser, and all V-later identities remain unchanged.

This authority round creates only `SPEC-v18.md`, `PLAN-v18.md`, and one appended FIX-09 decision row. It creates no shadow, real scan, Task 0 program/branch/worktree/receipt/manifest, product/test/migration/native implementation, live key, database, service, V, merge, push, board, acceptance, or Done act.

Task 0 and C3.5 remain STOP pending a committed v18 authority, fresh independent zero-finding review, and separately authorized successful evidence stages.
