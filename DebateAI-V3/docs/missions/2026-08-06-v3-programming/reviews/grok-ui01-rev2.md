# Grok UI-01 review (rev 2) — CODE/LAW gate (DR-140)

**Verdict: APPROVED**

Ticket `t_5f35d086` · mission PROG-V3-R1 · DR-145 · DR-140. Delta-only review of the single rev-1 BLOCKING finding (export dual-gate honesty regression). Rev-1 PASS dimensions stay accepted unless a new honesty regression appears; none found on this surface. Advisories 2–5 remain carry-forwards and were left untouched.

Sources: `reviews/grok-ui01-rev1.md` BLOCKING #1; `handoffs/UI-01-claude-handoff.md` ADDENDUM (rework round 1). Board ticket comments for `t_5f35d086` were not accessible in this environment (`bd` absent; no `.beads` issues store); the handoff addendum is treated as the worker/orchestrator rework record. Worker gate claims re-verified below.

---

## Delta checks (OBJECTIVE 1–7)

### (1) Dual gate restored — **PASS**

`apps/v2-ui/lib/v3/answerExport.ts` is the single decision. `buildAnswerExport`:

| Input | Result |
|---|---|
| `answer === null` | `{ available: false, reason: "NO_SERVED_ANSWER" }` |
| `ledgerDigest === null` && `ledgerError === null` | `{ available: false, reason: "LEDGER_DIGEST_PENDING" }` |
| `ledgerDigest === null` && `ledgerError !== null` | `{ available: false, reason: "LEDGER_DIGEST_UNREADABLE" }` |
| both answer + digest present | `{ available: true, href, filename, label, toast }` with payload `execution_ledger_digest: ledgerDigest` (non-null) |

S14 reference (`web/app/debate/[id]/DebatePageClient.tsx:109`: gate on answer **and** digest) is restored in stronger form: withheld branches also carry distinct honest reasons.

Consumers:

- Top bar (`DebatePageClient.tsx:718-721, 1156-1166`): renders `↓ Export` **only** when `answerExport.available`; toast is `answerExport.toast`.
- Drawer (`AnswerHonestyDrawer.tsx:468-474`): link only when available; otherwise `answerExport.message`.

No export affordance and no “+ ledger” claim when `execution_ledger_digest` would be null. Suite: `tests/unit/v2ui-export.test.ts` (PENDING / UNREADABLE / NO_SERVED_ANSWER / available) + structural suite in `tests/unit/v2ui-pages.test.ts`.

### (2) Single decision; no residual hand-maintained claim — **PASS**

Grep (this review) for claim / overclaim copy in the two surfaces:

```
$ grep -n "answer + honesty + ledger\|ledger digest loads\|Exported answer\|Export answer" \
    apps/v2-ui/app/debate/[id]/DebatePageClient.tsx \
    apps/v2-ui/components/AnswerHonestyDrawer.tsx
NONE
```

Claim strings live only in `answerExport.ts`:

```
43:const EXPORT_LABEL = "Export answer + honesty + ledger";
44:const EXPORT_TOAST = "Exported answer + honesty + ledger";
```

(Tests assert the same literals against the decision result; they do not re-author UI copy.)

`v2ui-pages` asserts:

- both surfaces hang off `buildAnswerExport` / `answerExport`
- no hardcoded `showToast("Exported answer + honesty + ledger")`
- no hardcoded `Export answer + honesty + ledger` in either surface source
- drawer no longer contains `Export becomes available once the ledger digest loads.`
- drawer uses `answerExport.message`

### (3) REFUSED-read reason honest — **PASS**

`DebatePageClient.tsx:653-662` sets `ledgerError` from `ContractHttpError.code` (or `"NETWORK_FAILURE"`) on digest read failure and leaves digest null.

`buildAnswerExport` distinguishes:

- **PENDING** (null digest, null error): “still loading” — truthful for in-flight reads.
- **UNREADABLE** (null digest, non-null error): message includes the typed code and states the export is withheld because an export without the digest would not carry the executed ledger the download names. Explicitly **not** “becomes available once the digest loads.”

Suite asserts UNREADABLE does not match `/once the .*digest loads/i` and includes the error code (`NOT_FOUND` fixture). This is not an invented fourth state: it is the same refused-read signal the page already recorded (`ledgerError`), now surfaced honestly.

### (4) Digest test fixture contract-shaped — **PASS**

`tests/unit/v2ui-export.test.ts:19-37` fixture:

- Typed as `ExecutionLedgerDigest` (contract import).
- Fields: `answer_id`, `run_ref`, `work_items[]`, `entries[]` — matches `ExecutionLedgerDigestSchema` (`packages/contract/src/index.ts:75-92`).
- Work-item `status: "ERROR"` is in the closed union `"READY" | "PENDING" | "ERROR"` — **not** the invented `"COMPLETED"` the worker reported typecheck rejecting.
- **No** invented `answer_ref` field.
- Entry uses real closed enums (`JUDGEMENT_SCHEDULED`, `OK`) and ISO datetimes.
- IDs shaped from the real acceptance/FAIR-01 digest (`answer_id` `ccef6817-…`, `run_ref` `8d2b4e5a-…`, work item / entry refs matching the live honesty inventory in the handoff). Comment documents the source.

Root + v2-ui typecheck both green on the landed fixture (see gates).

### (5) No new honesty regression on this surface — **PASS**

Delta is scoped to the export decision + two consumers + tests. Rev-1 PASS inventory (condition marks, abstention, freshness, cost, numbers/replay, inspection, ledger digest render, design authority, AC-59, S05 ownership, proxy) was not reopened and no new overclaim was introduced on the export path: available branch only claims “+ ledger” when the payload’s `execution_ledger_digest` is the real digest object.

### (6) Suites / typechecks / audits / build — **PASS** (re-run this review)

Captured under implementer scratch `ui01-rev2-export.log` / `ui01-rev2-gates.log`:

```
ROOT TYPECHECK: PASS
v2-ui TYPECHECK: PASS
FULL VITEST: Test Files 58 passed (58) · Tests 385 passed (385)
AUDIT architecture: { "edgeRowsChecked": 27, "violations": [] }
AUDIT source: { "blocking": [] }
v2-ui next build: Generating static pages (7/7) · routes / /admin/workers /api/[...path] /debate/[id] /new /settings (+ _not-found/icon)
```

Matches worker claim (58 files / 385 tests; +1 file / +9 tests vs rev-1’s 57/376 from the new export suite). Targeted export pair: 23/23 green before full suite.

### (7) Advisories 2–5 untouched; scope/git clean (V-gated) — **PASS**

| Advisory | Still present? | Evidence |
|---|---|---|
| 2 Fleet field fabrication when AVAILABLE | **yes, untouched** | `adapter.ts:342-345` still `capabilities: []`, `last_seen: ""`, `current_job_id: null`; workers page still tallies Capabilities / Idle from those |
| 3 V2-only mutations visible-but-refused | **yes** | refusal/unavailable paths remain in debate surfaces (not redesigned this round) |
| 4 Root build ships `web`, not v2-ui | **yes** | root `package.json` `"build"` still `pnpm --filter dialectical-engine-web build` |
| 5 Dormant `apps/v2-ui` `node --test` | **yes** | package `"test": "node scripts/run-node-tests.mjs"`; `apps/v2-ui/scripts` still missing |

Delta files for this rework: `apps/v2-ui/lib/v3/answerExport.ts` (new), consumer wiring in `DebatePageClient` / `AnswerHonestyDrawer`, `tests/unit/v2ui-export.test.ts`, export suite in `v2ui-pages.test.ts`, handoff addendum. Broader dirty tree (`packages/*`, `apps/runner/*`, `acceptance/`, etc.) remains prior mission residue as in rev-1 — not UI-01 rework writes. Board not mutated by this review. Git remains V-gated.

---

## Findings

### BLOCKING

None. Rev-1 BLOCKING #1 is fixed.

### ADVISORY (carry-forward, unchanged)

Same as rev-1 #2–#5 (fleet fabrication on AVAILABLE, V2 mutations refuse-vs-hide, root build cutover, dormant node --test). Not in scope for this rework.

---

## Risks / limits

- Withheld-state paths (PENDING / UNREADABLE / NO_SERVED_ANSWER) are proven by the behavioural suite, not a live proxy-blocked screenshot. Handoff notes acceptance stack always resolves the digest; this review did not manufacture a failure for a browser capture. Live available-path evidence in the handoff (FAIR-01 run, 12 ledger entries in payload) is consistent with the dual gate.
- Ticket board comments for `t_5f35d086` were not loadable here; rework substance was verified from shipped code + handoff addendum + gate re-runs.

---

## Summary

The export honesty regression is closed: one typed decision restores S14’s dual gate, refuses a false “loads later” story on refused digest reads, and drives affordance, filename, toast, label, and drawer reason from the same result so the “+ ledger” claim cannot outrun the bytes. Fixture is contract-clean. Gates re-run green at 58/385. Advisories 2–5 deliberately left open.

GROK REVIEW: APPROVED — UI-01 (rev 2)
