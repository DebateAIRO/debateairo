#!/bin/zsh
# write-grok-launcher.zsh <seat> <ticket> <packet-abs> <cwd-abs> "<node phrase>" — writes logs/launch-<seat>.sh FRESH from this heredoc
# for a grok-4.7 review lens of mission provider-env-selection (planning review or slice lens); the caller reads it back and greps.
set -u
SEAT=${1:?}; T=${2:?}; PK=${3:?}; WT=${4:?}; NODE=${5:?node phrase}
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; L=$R/.hermes/reports/provider-env-selection/logs; B=provider-env-selection
cat > "$L/launch-$SEAT.sh" <<LEOF
#!/bin/zsh
# launcher for seat $SEAT (Grok CLI, model grok-4.7, headless) — written fresh $(date '+%F %T'); background process, no terminal (heartbeat-protocol §3.9)
cd "$WT" || exit 9
export PATH="/opt/homebrew/bin:\$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
echo \$\$ > "$L/$SEAT.pid"
echo "launch \$(date '+%F %T') cwd=\$(pwd) HEAD=\$(git rev-parse --short HEAD) dirty=\$(git status --porcelain | wc -l | tr -d ' ') node=\$(node --version)"
exec ~/.grok/bin/grok -p "You are seat $SEAT of mission $B (heartbeat graph v4.0.0), $NODE, ticket $T. You review; you write no product code and make no git writes. Your packet, read it FIRST and in full: $PK — it names COMMON.md (read second, in full: $R/.hermes/planning/$B/packets/COMMON.md), then ONLY the files they name, at the lines they name. You are a non-Claude seat: read the skills the packet lists as markdown files before anything else and open your handoff with SKILLS LOADED naming exactly the files you read. First read every comment already on $T (~/.local/bin/hermes kanban --board $B show $T --json), then post your CLAIM comment (seat, node, start time from date, your grok session id and its chat_history.jsonl path under ~/.grok/sessions/, cwd HEAD + dirty count, comments read through) with ~/.local/bin/hermes kanban --board $B comment $T '<body>' --author $SEAT, then follow the packet's charges: refute, never read — probe what the packet allows you to probe, in the cwd the packet names (READ-ONLY for git; the tree ends with git status --porcelain empty). Write your artifact at the path the packet names, file the self-report, post ONE verdict comment on $T opening with SKILLS LOADED and carrying PASS or REWORK or BLOCKED for this pass, and print the same handoff as your final output. Never touch the main tree's uncommitted files, any slice lane, the live dev database on 127.0.0.1:55432, the NO-TOUCH ports COMMON names, a real API key, or anything on V's desktop; kill only processes you started, by the PID you wrote; never run pnpm install; never push." -m grok-4.7 --permission-mode bypassPermissions --cwd "$WT"
LEOF
zsh -n "$L/launch-$SEAT.sh" && echo "launcher written: $L/launch-$SEAT.sh"
for p in "$SEAT" "$T" "$PK" "$WT" grok-4.7 bypassPermissions "/opt/homebrew/bin"; do printf '  %-70s %s\n' "$p" "$(grep -o -F -- "$p" "$L/launch-$SEAT.sh" | wc -l | tr -d ' ')"; done
