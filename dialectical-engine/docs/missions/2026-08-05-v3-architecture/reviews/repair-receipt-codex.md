| Item | Applied as directed | Evidence |
|---|---|---|
| C-10 | YES | Plan.md lines 930–942: `claim_text text NOT NULL` plus `CHECK (length(btrim(claim_text)) > 0)` is canonical, the bare check is forbidden, and the migrated-database fixture rejects null, empty, and whitespace-only values. |
| C-13 | YES | Plan.md lines 1764–1782: Q51 Gate 4 includes provenance, locator, and the reasoning-only downgrade; S0's default `REASONING` basis serves as hypothesis plus research plan, with both required fixtures named. |
| C-17 | YES | Plan.md lines 513–516, 597–605, and 1737: replay imports only `published-arithmetic`, carries no local arithmetic copy, and propagation may import `kernel` plus `published-arithmetic`. |
| C-18 | YES | Plan.md lines 889–915 and 1523–1524: mandatory initial events make current state total, AM-9/AM-10 use the event carriers, and `last_evaluated_at_seq` is derived from the latest activation event; lines 898–902 name the database fixtures. |
| C-19 | YES | Plan.md lines 1166–1199: `served_number_event` is the append-only carrier, current number/answer state is derived without overwriting sealed artifacts, GET version selection is defined, and the eviction fixture covers historical replay and current projection. |
| C-20 | YES | Plan.md lines 1224–1242 and 1583: `condition_mark_node` is the single authoritative store, no `affected_node_ids` array exists, and the API list is a read-time projection. |
| C-21 | YES | Plan.md line 1679: “Three questions this seat raises rather than answers.” |

Applied differently than directed: None.

CODEX RECEIPT COMPLETE
