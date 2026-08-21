# Mission intake H0 — PROG-V3-R1 (PROGRAMMING loop)

2026-08-06 · One-Prompt Machine: V's kickoff prompt (verbatim intent): read and
ingest the whole `docs/` corpus — all plans, decisions and ledgers — and create
the Kanban board on the Hermes Kanban at :9119 with tickets covering the whole
plan, nothing missed; a one-prompt prototype kickoff.

**Standing steer received during intake (V, same sitting): "Do not start the
programming loop just yet."** The board is therefore CUT AND PARKED: all tickets
exist, dependency-linked, held behind the BOARD-00 latch; no worker is
launched, nothing is claimable until V's explicit word.

## Loop ownership (R7 election)

Instantiated from standing ruling **DR-101** rather than re-asked (the election
was held and drilled in the 2026-08-05 sitting; re-asking would violate the
one-prompt instruction):

| Seat | Holder |
|---|---|
| Orchestrator / router / board custody | Claude (Fable) |
| Implementation worker (sole) | Codex GPT-5.6 Sol — sticky sessions per ticket |
| Reviewer lens 1 | Claude (independent) |
| Reviewer lens 2 | Grok (independent; different maker lineage) |
| Board infrastructure only | Hermes (no verification, no Done/Blocked authority) |
| Product / acceptance / important-op authority | V |

Done requires BOTH reviewer APPROVED markers; either CHANGES REQUESTED blocks.
Commits/pushes are V-gated important operations.

## Consumed architecture

- `docs/architecture/` 21-file C4 set, accepted via VS-1 (**DR-098**) with
  amendments A-01..A-13 (**DR-099**); ARCHITECTURE SATISFIED emitted (**DR-100**).
- `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` **DR-068..DR-101**
  — OVERRULES conflicting architecture-doc text until the PRE fold-in tickets land.
- Founding pack + founding ledger DR-001..DR-067.

## Board

- Hermes Kanban board **`debateai-v3`** (SQLite:
  `~/.hermes/kanban/boards/debateai-v3/kanban.db`), visible on the Hermes
  dashboard at `localhost:9119`. Default workdir: this repository.
- Ticket manifest: `ticket-manifest.md` in this folder (the cutting record).
- Latch mechanism: `todo` on this board means "parents still open"; every head
  ticket is a child of **BOARD-00** (the charter card). Completing BOARD-00 —
  which happens only on V's word — releases the heads to `ready`.

## Deviations register

1. R7 election not re-asked — instantiated from DR-101 (see above).
2. Board statuses: tickets are born `ready` on this CLI; V's "created in TODO"
   is implemented via the BOARD-00 dependency latch (todo = parents open),
   verified before cutting.
3. No dispatcher daemon runs; dispatch stays manual under the spine's
   HERMES AUTHORIZED NEXT law (routing authority: Claude, per DR-101).
