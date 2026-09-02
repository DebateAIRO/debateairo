## SupportAgent (Bot A) — slices and pointers (REQ-SUP, 2026-09-01)

| Code | Name | What V will see |
|---|---|---|
| SUP-01 | Grounded help on `/help` (anonymous, eval-gated) | Ask "How do I publish a debate?" at `/help` → answer with a `Source:` line; "reset my password" → refusal + `/settings` link; an injection → refusal + one `support.abuse_event` row; `pnpm support:eval --runs 3` PASS |
| SUP-02 | Escalation to V: case, summary, terminal inbox, replies | "Talk to a human" → case token; `pnpm support:inbox` shows the verbatim transcript + advisory summary ≤ 60 s; `pnpm support:reply` appears at `/help?case=<token>` |
| SUP-03 | Signed-in own-debate context with consent (metadata only) | Toggle consent; "What is the status of this debate?" → state + `Source: your debate …`; another run id → identical refusal |
| SUP-04 | The assistant on product routes, never on zone routes | "Help" button on `/`, `/new`, `/debate/[id]`, `/public/debate/[id]`; none on sign-in/sign-up/verify/MFA/settings |
| SUP-05 | Known-incident awareness from a V-published source | `pnpm support:incident publish …` → the assistant repeats V's exact text; `resolve` → "no record of a current known incident" |
| SUP-06 | Abuse controls, spend caps, queueing, degraded mode | Exceed a limit → 429 text; two windows → QUEUED then answer; unreachable relay → DEGRADED and `pnpm support:status` says so |
| SUP-07 | Crypto-shredding and retention controls | `pnpm support:shred --owner <ref>` → rows kept, content unreadable, audit row; retention `keep` unless V ratifies |

Dependencies: SUP-02…07 depend on SUP-01 and are parallel-safe with each other; SUP-04 overlaps ui-overhaul on `apps/ui/app/page.tsx` (merge-time).
Requirements: `docs/missions/observability-agents/requirements/supportagent.md` (Q1–Q7, Bot B design, V-2 both ways).
Slices: `docs/missions/observability-agents/slices/SUP-0{1..7}/{SPEC,PLAN,PROGRESS,DECISIONS}.md`.
V rows: V-2 (model path), V-4 (Bot B) in `V-DECISIONS-PACKET.md`; new contested rows SUP-D1…D11 in the requirements file Q7.
Cross-product interface for REQ-SYNTH: `support.public_incident` (SUP-05) vs the ObservationAgent's publication surface; migration numbers allocated by the orchestrator.
