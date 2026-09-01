#!/bin/bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine || exit 1
PACKET="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/packets/CODE-T9C2-N3.md"
LOG="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/CODE-T9C2-N3.log"
echo "[launch] $(date '+%F %T') CODE-T9C2-N3 codex resume 01a05a3c" | tee "$LOG"
/Applications/ChatGPT.app/Contents/Resources/codex exec resume -c model='"gpt-5.6-sol"' -c sandbox_mode='"workspace-write"' -c 'sandbox_workspace_write.writable_roots=["/Users/vladmihaimiron/.hermes"]' 01a05a3c-42d1-7772-a3a6-ddae54b9447f "Your addenda 1-2 were re-verified ADDENDA SOUND. Addendum 3, ticket t_00a05b8e, authority_epoch=17, HERMES AUTHORIZED (marker on the ticket — read it back first): AM11's two complements + one rename. N8: absent-next row (Create one href exactly /sign-up, no query) in YOUR t9-landing block. N9: contract-bound schema-agreement row (PublicDebateSummarySchema.shape.public_ref.safeParse — NOT z.uuid) in t9-return-path. N11: rename the stale overlong row, input unchanged. RED-proofs owed on M17 and the contract-drift probe. Packet: $PACKET — read and execute exactly." < /dev/null 2>&1 | tee -a "$LOG"
echo "[exit] $(date '+%F %T') rc=$?" | tee -a "$LOG"
