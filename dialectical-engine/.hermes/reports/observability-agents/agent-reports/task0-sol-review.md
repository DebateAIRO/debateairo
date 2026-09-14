# Task 0 — independent Sol architecture and safety review

Reviewed: 2026-09-03 (Europe/Bucharest)

Role: fresh Sol reviewer; no Hermes/external model and no subagents

Worktree: `codex/fixagent-plan` at `2b670d3059c60d7262cf655bd5d402c88100dff3`

## Verdicts

1. `RP0 ACTION: REWORK`
2. `WRITER GRANT: REWORK`
3. `OFF SWITCH: APPROVE A`
4. `TRACER: APPROVE C`
5. `B2: APPROVE B`
6. `N4 REQUEST: REWORK`
7. `RP3 CORPUS: REWORK`
8. `RP3 PIN ACTION: REWORK`
9. `BOARD PACKET: REWORK`

The overall Task 0 review is REWORK. The three architecture selections above are rulings to route for V ratification, not authority to edit frozen contracts or code.

## Independent evidence

- The only tracked worktree diff before this review was the appended `FIX-07/DECISIONS.md` line. The packets, reports, corpus, and `tools/obs-listener/` were untracked. I preserved all of them.
- The migration in the worktree, main checkout, and `HEAD` is byte-identical: SHA-256 `ffea9b5f8daa4428d7f93603de6823570323ff2463ad9cee8a3912207f592be8`.
- Fresh read-only SQL returned no `role_table_grants` rows for `debateai_obs_writer` on `obs.component_health`; `has_table_privilege` returned `f|f|f` for INSERT, UPDATE, SELECT.
- RP-0 independently recomputes to 9 names and SHA-256 `51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078`.
- RP-3's current file independently hashes to `342216e26760975106f833401ea222550c98e3e846f2c1546739049229530eee` and has 24 cases, 8 per target, with 8 distinct classes per target. That structural result does not cure the semantic corpus defect below.
- S04's merge parents are `7b3a30634fc45f7fe60571ccdfdd348e32b4c549` and `5f0bd546fde422d6163a1b39c2f009a69f57af6f`; their merge-base is `29f370e0f1017245aa26443ad366e020e815c301`. The semantic region at the integration parent and merge result is 1,653 bytes and hashes to `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d` on both sides. The proposed semantic mutant changes bytes and fails closed on both the old and current shapes.
- `OBS_DEMO_DATABASE_URL` is unset, so stage 02 and the post-edit stage 16 remain unmeasured.
- Fresh board state: `observability-agents` has 52 active-or-archived rows and zero exact `FIX-01 —` through `FIX-16 —` slice-title matches; `fixagent` is absent; the current-board pointer remains `auth-front-door`. The four predecessor IDs resolve exactly as the packet says. RP-0 and RP-3 have zero V comments. No board write was made.

## Findings and smallest corrections

### F1 — RP-0 can append a duplicate or conflicting ratification, then report success

Evidence: `.superpowers/sdd/PLAN-FixAgent/task0-rp0-human-action.md:16-17` posts immediately after checking only the local hash. It does not first inspect existing V comments. The separate readback at `:43-55` counts only the exact body, not all V comments with the RP-0 pin prefix. Its mismatch branch also only runs `printf`, so a local count/hash mismatch exits successfully.

Impact: if V already posted the exact pin, the action posts it again; if a different V RP-0 pin exists, it can add the expected body and still print `matches=1`. A hash mismatch can print `STOP` with exit 0. The current live ticket has no V comment, so no damage has occurred yet.

Smallest correction: replace the one-liner plus detached readback with one `set -eu` script. Before posting, read the exact board/ticket, count every V comment beginning `V RATIFICATION — RP-0 declared_gap:` and exact-body matches, and permit only `0:0` (post) or `1:1` (idempotent no-op); every other pair exits nonzero. Re-read and require both counts to equal 1. Make the local hash/count mismatch explicitly `exit 1`.

### F2 — the Task 0.2 research line chooses architecture it was only allowed to measure

Evidence: `dialectical-engine/docs/missions/observability-agents/slices/FIX-07/DECISIONS.md:19` says “use the append-only alternative” and prescribes one heartbeat record per cycle plus a latest-per-component read. The frozen contract assigns the alternative to ARCH (`FIX-07/SPEC.md:13`), while the Task 0.2 instruction is a read-only measurement and record (`PLAN-FixAgent.md:207`; Task 0.3 assigns architecture at `:208`).

Impact: the grant evidence is true, but a research seat's prescriptive sentence can be mistaken for authority to introduce a new table/key/grant design. The present primary key and ACL make its proposed mechanism impossible without separately authorized schema work.

Smallest correction: preserve append-only history and append an explicit correction: Task 0.2 established only “writer has no component-health privilege; the current upsert is unavailable”; the persistence mechanism remains OPEN for ARCH/V. Do not treat line 19 as a storage ruling. The later ARCH/V line may select append-only storage and must name its schema/grant owner and stable ordering key.

### F3 — the proposed N4 regex misses real zone imports and flags unrelated `require()` calls

Evidence: `.superpowers/sdd/PLAN-FixAgent/task0-n4-demo-request.md:42-53`, especially `:48`, accepts only a double-quoted `import|export ... from` form, while the `require\(` alternative has no zone-module operand restriction. Reproduction: it matches `import x from "./registration.js"`; misses the single-quoted equivalent, side-effect `import "./registration.js"`, and dynamic `import("./registration.js")`; and matches `require("./safe.js")`.

Impact: the requested exemption can let a forbidden zone-module import pass while false-failing safe CommonJS code. The requested mutant in `:73` is under-specified and could test only the one syntax the regex recognizes.

Smallest correction: use a parser/lexer or a bounded scanner that recognizes static imports/exports with both quote styles, side-effect imports, dynamic `import()`, and `require()`, and constrains the module operand to the zone-module names. Add one positive mutant for every form and a safe-`require()` negative control. Keep the broad rule for every other artifact. The narrow claim at `:63` and the UNSET-URL statement at `:77-86` are correct and must stay.

### F4 — the three RP-3 control/Unicode fixtures contain printable backslash text, not controls

Evidence: `dialectical-engine/tools/obs-listener/corpus/rp3-injection-corpus.v1.json:286`, `:446`, and `:606` use doubled JSON backslashes (`\\u0000`, `\\u000d`, `\\u202e`). After JSON parsing, their code points include literal `5c 75 ...`; none includes NUL, CR, or U+202E.

Impact: all three `CONTROL_OR_UNICODE_CONFUSION` cells satisfy the matrix by label while exercising no control or bidi-confusion input. The current hash and 24/8x3/eight-class counts are exact, but the matrix contains three vacuous cells.

Smallest correction: encode JSON Unicode escapes with one JSON backslash so parsing yields the intended NUL/CR/U+202E characters. Extend the corpus validator to assert that every case in this class contains at least one actual member of the ruled control/bidi set, while non-control classes do not acquire one accidentally. Recompute the corpus hash and repeat the independent structural and semantic checks. Continue using only public inert markers and no real secret.

### F5 — the RP-3 action would pin the semantically defective corpus

Evidence: `.superpowers/sdd/PLAN-FixAgent/task0-rp3-human-action.md:35`, `:116`, `:122`, and `:160` pin the current hash. Its validator at `:74-113` checks labels, counts, marker occurrence, dispositions, and zero-valued oracles, but never checks the attack-class payload semantics. The ticket preflight at `:125-129` checks only the id, despite the packet's claim at `:20` that the expected live ticket is checked.

Impact: V can irrevocably ratify a corpus whose Unicode/control class has not been exercised. A repurposed ticket id/body would also pass the stated identity check.

Smallest correction: first repair and rehash the corpus; then add the semantic class assertions from F4 to this independent V script and update the expected hash/comment. Also require the exact current RP-3 ticket title and its expected blocked state before posting. Preserve the existing prefix/exact preflight at `:131-143` and exact post-readback at `:145-151`; those correctly refuse a different or duplicate V pin.

### F6 — two “exact” FIX titles differ from their frozen SPEC headings

Evidence: board packet `task0-board-ruling-request.md:253` omits the backticks around ``obsctl kill`` present in `FIX-10/SPEC.md:1`; packet `:329` omits the backticks around ``dev`` present in `FIX-14/SPEC.md:1`. The other fourteen titles match their SPEC headings after removing the runtime prefix.

Impact: exact-title duplicate guards and later source-to-board audits have two spellings for the same slice. Backticks also become a shell-execution hazard if future create commands are not single-quoted.

Smallest correction: copy both frozen headings byte-for-byte after the `[codex@gpt-5.6-sol] ` prefix, and pass each complete title as one safely quoted argv value in the exact create command.

### F7 — the board packet does not encode or read back structured workspace custody

Evidence: `task0-board-ruling-request.md:65-75` lists common assignee, branch, and key values, while ticket bodies carry worktree text. The creation sequence at `:410-417` gives no exact `create` commands, and readback at `:413` checks only title, body, assignee, and status. Hermes `create` defaults to a scratch workspace unless `--workspace` is passed and has separate `--branch`, `--idempotency-key`, and `--created-by` fields; `show` exposes `workspace_kind`, `workspace_path`, `branch_name`, and `created_by`.

Impact: an operator can create a textually correct ticket whose worker launches in scratch or on the wrong branch, with ambiguous creation custody. Body prose is not workspace metadata. The packet also cannot substantiate its “no duplicate idempotency result” claim from the stated readback.

Smallest correction: supply one exact safely quoted `create --json` command per ticket, including board, exact title/body, assignee only when released, `--workspace worktree:<absolute-path>`, `--branch slice/oa-fix-<nn>`, `--idempotency-key observability-agents:FIX-<nn>:v1`, `--created-by Hermes`, parents, and the ruled initial status. Retain each create receipt and immediately verify title/body/status/assignee plus `workspace_kind`, `workspace_path`, `branch_name`, `created_by`, parents, and returned id. Keep the active+archived exact-title precheck; if the CLI does not expose the stored key on `show`, do not claim that field was read back.

### F8 — assigned `ready` tickets are executable before Task 0 and ticket-local gates close

Evidence: board packet `task0-board-ruling-request.md:68-75` assigns every ticket and declares nine tickets target-`ready`; `:416` explicitly promotes them with the assertion that dispatch prerequisites are met. The Codex adapter says a `ready` assigned ticket is read, claimed, and then edited (`docs/agent-protocols/codex-heartbeat-adapter.md:64-80`). Hermes describes `claim` as atomically claiming a ready task and `dispatch` as spawning ready work. The authoritative Task 0 status says only FIX-01 dispatch is independent of Task 0 (`PLAN-FixAgent.md:168`). FIX-11 additionally waits for FIX-09 C1, and FIX-16's baseline waits for FIX-02..05.

Impact: a normal dispatcher or manual claim can start code from FIX-02/03/04/05/08/09/10/11/16 before Task 0's authority outputs and ticket-local interface gates exist. Creating FIX-01 as synthetic `running` at packet `:75,97` is also false unless the actual existing worker/session is attached; stale-run recovery can later make it executable while C5 still awaits its ruling.

Smallest correction: create all target-`ready` tickets parked as `todo` and unassigned; use `blocked` for hard human/architecture/external gates. Do not perform step 7's promotions during board construction. After Task 0 is ratified and each ticket's own dispatch holds are fresh-read as satisfied, assign, dry-run one explicit promote, promote one ticket, and read it back. Park FIX-01 blocked on its C5 ruling unless an actual continuing session is explicitly attached and proven; never manufacture `running` as historical shorthand.

## Approved architecture selections

### OFF SWITCH — APPROVE A

Approve `${OBS_CONTROL_DIR}/CAPTURE_OFF` with the full-process envelope in `task0-off-switch-ruling-request.md:23-29,83-140`:

- `OBS_CONTROL_DIR` resolves to one absolute, canonical, pre-existing operator-owned directory; no fallback. Any exact child entry, including a symlink, means OFF and is never followed or opened. Verified ENOENT alone means ON. Invalid/unset/unreadable/indeterminate means capture OFF while product behavior remains unchanged.
- The installer checks before the Tier-0 writer; the cached gate covers pre-arm emit, Tier-0/Tier-1, database writes, spool appends, and spool drain. Live publication defines the transition boundary. The hot emit path performs no I/O.
- Suppression counts are exact only while process-local state survives. A dead process with an unpersisted count makes authority stale/missing; no database count is fabricated. `capture_gap.source` must keep source semantics rather than being rewritten to a runtime label.
- FIX-10 owns marker mutation and its append-only witness. A separate schema/grant owner owns append-only heartbeat persistence. ObservationAgent consumes the evidence and does not own the switch/count.

No implementation authority follows yet. V must ratify a FIX-07 SPEC version that grants the narrow installer/emit/config-loader surface, reconciles the older spool-sibling default, and names the append-only heartbeat schema/grant owner and query tie-break. The ADR-0011 loader exception/address source must be explicit.

### TRACER — APPROVE C

Parent-only traversal is incomplete. `FIX-02/SPEC.md:18,23-24,29-33` permits one wrapper occurrence whose human-only detail array contains `[wrapper, inner]` while `parent_occurrence_ref` is a sentinel. A parent walk sees the wrapper then stops, losing the valid inner PostgreSQL code needed by `FIX-11/SPEC.md:30-35`.

Approve a closed-code `cause_chain_codes` projection on `obs.occurrence` as specified in `task0-tracer-ruling-request.md:12-26,107-126`. The listener's existing table SELECT suffices; direct `occurrence_detail` denial and every GRANT/REVOKE statement stay unchanged. The shared depth budget counts projected codes plus row hops, and zone rows expose only their outer safe boundary code before `CAUSE_NOT_CAPTURED:ZONE`.

Ownership after, and only after, V ratifies SPEC-v2/plan changes:

- a new explicitly V-authorized schema-migration seat owns one non-`0035` migration and the matching `packages/db/src/obs-schema.ts` field;
- FIX-02 v2 owns the producer projection and spool-envelope validation in newly named, exclusive regions because it owns cause-chain semantics; it must be sequenced against FIX-03's existing redactor region;
- FIX-11 owns the read/walk and tracer tests; FIX-09 remains interface-only/read-only and receives no detail access.

If V does not grant those named surfaces, implementation remains BLOCKED; approval C is not permission to borrow them.

### B2 — APPROVE B

Approve the per-slice integration comparison rule in `task0-b2-ruling-request.md:16-27,98-106`. While active, the orchestrator records the full immutable integration SHA inherited at worktree admission and passes it explicitly; the target is that worktree. After merge, preserve the immutable integration-parent to merge-result pair. Current workspace shape remains a baseline-free ZI-1 check. No test discovers `HEAD` or a merge-base at runtime.

For S04 the historical pair is exactly `7b3a30634fc45f7fe60571ccdfdd348e32b4c549 -> 3e91cf4222767d1eafc2c1dde8d336f87b8fc448`; both semantic regions are 1,653 bytes with SHA-256 `bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d`. The proposed g4 replacement is a real byte mutation and fails closed on both region shapes. FIX-04 and FIX-06 each need their own later admission SHA and post-merge pair.

V must ratify this clarification before the S04 test or any frozen slice decision is changed. The S04 test owner then repairs only its test/helper surface; no zone/product edit is authorized.

## Board elements that did pass review

Subject to F6-F8, the sixteen body blocks accurately cite the frozen slice contracts; the dependency edges are the dispatch edges those contracts require. Old-id reuse for S27 `t_d55caea1`, S18b `t_49e079f4`, S23 `t_5aca48c6`, and S24 `t_27975928` matches live state and H6. The no-force S02 -> S03b -> S05 reconciliation is correct. The `fixagent` board remains V-only, and the packet's create/link/archive recovery rules preserve history.

## Ratification and action order

1. QA repairs RP-3 per F4; independent review recomputes the new hash; then V may run the corrected F5 action.
2. The RP-0 packet is repaired per F1; then V alone posts or idempotently confirms the pin.
3. ARCH routes OFF A, tracer C, and B2 B to V. V ratifies the required new SPEC/plan/surface and ownership text before code or test edits.
4. The Task 0.2 seat appends the F2 correction; no storage work starts from the current line.
5. The demo custodian repairs N4, then runs the full demo only with V's database URL present and records stages 02 and 16 from the same run.
6. Rework the board manifest/commands/states. Only after review may Hermes create parked tickets one at a time. V alone creates `fixagent` unless exact delegation is newly recorded.

No board/ticket/comment/status, product/spec/decision/plan/corpus, service, credential, commit, or staging-area mutation was made by this review.

TASK 0 SOL REVIEW REWORK
