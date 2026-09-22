# GUIDE_PLANFIX evidence — bounded correction of public-guide blueprint

## Identity and limits

- Node/ticket/session: `GUIDE_PLANFIX` / `t_c52cfe4c` / `/root/requirements`
- Review consumed: `GUIDE_PLANREV.md`, verdict `REWORK`, SHA-256 `3227fdeddf65696d1e78ceacdcefc7663532a0368a3d9b8fa6121d929d48496b`
- Planning-review product baseline: `479763da1f586a217f36204cc81138aaa81c6f81`
- Measured current product revision: clean `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`, containing only the independently consumed PG-3 Account correction relative to the planning baseline
- Result: `READY_FOR_SCOPED_PLAN_REVIEW_PASS_2`
- Product/source/Git/index edits by this node: none
- Heavy tests/build/install/services/browser/HTTP/model/private-data traffic: none
- Native comments read through: 2 (`DISPATCHED`)

The sealed predecessor specification, plan, and inventory remain byte-identical. This node creates only versioned replacements and evidence.

## Finding-to-correction table

| Finding | Corrected artifact anchors | Exact correction | Observable implementation contract |
|---|---|---|---|
| B1 | `SPEC-v5.md` CP1-R30/A17 v2; `PLAN-PUBLIC-GUIDE-v2.md` graph, PG-8A, PG-8B | Split independent composition/working preview from owner-destination connector readiness | PG-8A may finish with actionless Forgot and only `WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED`; PG-8B alone may reach readiness after the real connector and focused checks |
| B2 | `SPEC-v5.md` CP1-R24 v2; plan PG-2/4/5 and B2 scope; inventory `editorialScope` | Add corrections for `support-status-limits.en/ro` bodies plus their projection/fallback records to the six new records | exact eight records are reviewed and admitted; status facts describe public `/help` only and contain no consent/ownership/private debate authority; `support-cases` is unchanged |
| B3 | `SPEC-v5.md` CP1-R29; plan integration schedule and B3 ordered frames | Serialize current-lane real-corpus tests PG-1 → PG-2 unadmitted → PG-5 admitted → PG-6/final | every route/service/eval frame binds exact HEAD and `kbVersion`; only affected PG-1 members rerun after later corpus composition |
| B4 | `SPEC-v5.md` CP1-R28/A13 v2; plan PG-1 message/language contract and B4 arrays; inventory `languageContract` | Preserve strict `{text}` messages while moving response language authority to the stored Support session; selector change invalidates active session | `language`, `run_id`, `latest`, unknown keys rejected; ambiguous `Pricing` EN and `Account` RO follow session language; stale retry creates one same-language replacement session |
| Inventory | `MENU-COVERAGE-v2.json` item `help-free-text` | Change mode from `existing-ui-workflow` to `safe-static-action` | the verified closed `/help` action now satisfies the inventory action rule |
| Command defect | every Vitest command in plan v2; PG-8A command contract | Remove unsupported `--minWorkers`; retain suite membership and `--maxWorkers=1` | commands are valid for measured Vitest 4.1.10; invalid-flag evidence remains historical and is not relabeled |

## Exact scope and scheduling

`PLAN-PUBLIC-GUIDE-v2.md` retains the complete original lane file lists and adds a machine-readable corrected-delta JSON block. It enumerates the exact 33-file PG-8A union, exact four-file PG-8B connector set, exact B2 product/test paths, eight editorial records, exact B4 product/test paths, and ordered B3 frames.

PG-3 is recorded as independently complete at `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`, with valid `--maxWorkers=1` evidence and consumed receipt `e828faa1e14dac49ca0378ce2a7e507041681e9a5800bc8c01c30e3d1b20305e`. No other product lane is treated as complete.

## Inventory measurements

`MENU-COVERAGE-v2.json` parses as schema version 2 and contains:

- 11 route dispositions;
- 9 surfaces;
- 52 unique meaningful items;
- 51 included items and 1 operator exclusion;
- 8 exact editorial records;
- 33 independent-union test paths and 4 connector-focused test paths in the plan; and
- explicit session-language and two-gate objects.

The `help-free-text` row is now `{mode:"safe-static-action", actionId:"help", href:"/help"}`. `landing-start` remains the accepted contextual null-href row because the closed resolver supplies `/new` or `/login?next=%2Fnew` from trusted sign-in context.

## Light verification and negative controls

`GUIDE_PLANFIX-contract-check.log` records:

- actual corrected artifacts: PASS;
- B1 mutant adding PG-7 to PG-8A: expected failure `B1_GATE_DEPENDENCY`;
- B2 mutant dropping one editorial record: expected failure `B2_EIGHT_RECORD_SCOPE`;
- B3 mutant reversing the first composition step: expected failure `B3_SERIAL_ORDER`;
- B4 mutant re-adding message language: expected failure `B4_STRICT_MESSAGE_KEYS`;
- inventory mutant restoring the inconsistent workflow mode: expected failure `INVENTORY_HELP_ACTION`; and
- argv mutant adding `--minWorkers`: expected failure `VITEST_ARGV_UNSUPPORTED`.

The corrected-delta JSON block parses with exactly 33 independent test paths and 4 connector paths. Both versioned JSON artifacts parse with the standard JSON parser. The predecessor hashes and review hash are recorded in `GUIDE_PLANFIX-input-hashes.log`.

These are light document checks only. They do not establish product behavior, review PASS, preview quality, CP1 readiness, or owner acceptance.

## Unresolved dependency

The canonical existing Forgot password destination/opener remains unanswered. No new owner question was sent. PG-8A remains independently executable with fixed guidance/refusal and no action. PG-8B and CP1 readiness remain blocked on the verified destination and PG-7.

Usage: `UNAVAILABLE`.

Native transport note: ticket read/claim succeeded; automatic approval review rejected the minimal heartbeat comment due to unestablished destination trust/authorization. No retry or workaround was attempted. Comments remain read through cursor 2.
