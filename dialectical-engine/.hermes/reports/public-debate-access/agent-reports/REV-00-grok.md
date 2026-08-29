# REV-00 self-report — Grok packet-review lens · t_a12687d5

Murder-case notes on the Router's INTAKE + REQ-01 packet. Cause, not symptom. Prices in wall-clock / retries.

## What this seat did

Blind packet review of Router homework. Default posture REFUTE. Re-ran live probes against `https://localhost:3000` and API `http://127.0.0.1:8790`. Three-trial schema experiment on real `PublicDebateSchema` + live publication payload. Did not edit product code, tests, or mission docs under review.

## Verdict in one line

**PASS** with four non-blocking findings (N1–N4). Load-bearing measured claims held. The Router's "required field → silent 404" inference is true under experiment, but was mis-bannered as MEASURED and slightly mis-caused to `.strict()`.

## What repeatedly cost tokens (this seat + foreseeable)

1. **CAUSE: INTAKE documents `GET /v1/public/debates` as anonymous-200 without the required `limit`/`offset` query or the real API surface.**  
   Symptom: first probe to `https://localhost:3000/v1/public/debates` → Next.js HTML 404; bare API path → 400 `MALFORMED_REQUEST`.  
   Price: ~8 min + 2 wrong hypotheses (UI has no `/v1` route; API requires query).  
   Fix: INTAKE must record the exact successful command, e.g. `curl -s 'http://127.0.0.1:8790/v1/public/debates?limit=20&offset=0'` and/or `https://localhost:3000/api/v1/public/debates?limit=20&offset=0`.

2. **CAUSE: worktree has no `node_modules`; schema experiment cannot import `@debateai/contract` locally.**  
   Symptom: `pnpm exec tsx` / `require('zod')` fail in the blind worktree.  
   Price: ~5 min detour to main-repo `tsx` with byte-identical contract source.  
   Fix: review worktrees that must run TS probes need a `node_modules` link or a documented `MAIN` deps path in the packet.

3. **CAUSE: `hermes kanban show` dumps sibling ticket handoffs.**  
   Symptom: verifying REQ-01 repo-root correctness via `show t_5c7a1e7f` pasted the requirements seat's SUMMARY into this lens's context.  
   Price: blindness partial pollution; predictions must be discounted.  
   Fix: packet should say "path-check with `ls`/`test -f` only; do not `show` the sibling ticket."

## What we must upgrade

| Upgrade | Why | Est. save |
|---|---|---|
| Probe recipes in INTAKE must be copy-pasteable (full URL + params + expected status/body shape) | Every seat re-derives port/proxy/query | 5–15 min/seat |
| Banner MEASURED vs INFERRED vs ASSUMPTION per row, not once per file | Wrong certainty freezes into SPEC | 1 wrong architecture cycle avoided |
| Absolute path required for any "filed on V DECISIONS PACKET" claim | Unverifiable status is a silent process hole | one missed V confirm |
| Causal mechanism sentences must name the actual operator (required+catch vs `.strict()`) | Wrong cause → wrong fix (strip `.strict()`, still 404) | architecture mis-steer |

## How to make coding (and review) a one-prompt machine better

- INTAKE rows that say "verified live" must embed the exact argv and a one-line expected result. No narrative paraphrase of probes.
- Packet §"under review" paths must match the seat's worktree root (REV-00 did; REQ-01 correctly points requirements at Documents — keep that explicit).
- For inference that decides mission shape (back-compat 404), Router should either run the three-trial experiment itself and paste output, or label INFERRED and demand the first consumer re-measure. Mixing "MEASURED banner" + inference body is the defect class.

## What I nearly got wrong

- Nearly filed **B-blocking** on "anonymous list is not 200" after the `:3000/v1/...` 404. Cause of near-miss: trusting the REV packet's "dev server on :3000" as the API surface without reading `apps/ui/.env.local` (`DIALECTICAL_API_BASE=http://127.0.0.1:8790`, `NEXT_PUBLIC_API_BASE=/api`).
- Nearly attributed the 404 trap solely to `.strict()` because INTAKE said so. Experiment showed optional widen passes under the same `.strict()`; required widen fails. Cause is required keys + `catch { return null }`, with `.strict()` as a separate unknown-key footgun.

## Dead ends (do not re-derive)

- `https://localhost:3000/v1/public/debates` → Next 404 HTML. Wrong surface.
- `http://127.0.0.1:8790/v1/public/debates` (no query) → 400 `MALFORMED_REQUEST`.
- `http://127.0.0.1:3001/v1/public/debates` → Next 404 (Next listens on 3001; API is 8790).
- Worktree-local `tsx` / `zod` resolve → missing; use main repo deps or link.

## Where THIS packet (REV-00) fought me

- Correctly forced REFUTE posture and named the 404 claim as the highest-value attack — that worked.
- Said ":3000 is reachable for anonymous probes" without mentioning `/api` proxy or `:8790`. Fought the first 10 minutes.
- Allowed write path is only the self-report; verdict must be a ticket comment — clear and followed.
- Blindness instruction is strong; `hermes show` on the sibling ticket still leaks. Packet should forbid sibling `show`.

## PRICE of findings filed in the verdict

| ID | Price if unfixed |
|---|---|
| N1 (V confirm row claimed, no path) | V never confirms READ-vs-mutation; coding ships on Router assumption |
| N2 (MEASURED banner over inference) | Downstream stops re-measuring; one wrong inference becomes SPEC law |
| N3 (incomplete list probe recipe) | Every later seat pays the 400/404 detour (~5–15 min) |
| N4 (`.strict()` mis-causation) | Architecture may remove `.strict()` and still 404; wastes a coding round |

## Blindness note

Mechanical worktree blindness held for requirements *files* (no `INSTRUCTIONS.md` / `slices/` in this tree at launch). Accidental contact: `hermes show t_5c7a1e7f` and a broad grep under `.hermes/reports/.../agent-reports/` surfaced REQ handoff text. Predictions below are written from probe evidence and discounted for that leak.
