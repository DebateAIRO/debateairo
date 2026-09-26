#!/bin/zsh
# write-codex-launcher.zsh <seat> <ticket> <packet-abs> <lane-abs> <branch> "<node phrase>" — writes logs/launch-<seat>.sh FRESH for a
# codex@gpt-6-astra coding seat of mission provider-env-selection in ITS slice lane; the caller reads it back and greps the values.
set -u
SEAT=${1:?}; T=${2:?}; PK=${3:?}; LANE=${4:?}; BR=${5:?}; NODE=${6:?node phrase}
R=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine; L=$R/.hermes/reports/provider-env-selection/logs; B=provider-env-selection
cat > "$L/launch-$SEAT.sh" <<LEOF
#!/bin/zsh
# launcher for seat $SEAT (Codex, gpt-6-astra) — written fresh $(date '+%F %T'); background process, no terminal (heartbeat-protocol §3.9)
cd "$LANE" || exit 9
export PATH="/opt/homebrew/bin:\$PATH" LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
echo \$\$ > "$L/$SEAT.pid"
echo "launch \$(date '+%F %T') lane=\$(pwd) HEAD=\$(git rev-parse --short HEAD) branch=\$(git rev-parse --abbrev-ref HEAD) dirty=\$(git status --porcelain | wc -l | tr -d ' ') node=\$(node --version)"
exec /Applications/ChatGPT.app/Contents/Resources/codex exec -c model='"gpt-6-astra"' -c sandbox_mode='"danger-full-access"' "You are seat $SEAT of mission $B (heartbeat graph v4.0.0), $NODE, ticket $T. Your packet, read it FIRST and in full: $PK — it names COMMON.md (read second, in full: $R/.hermes/planning/$B/packets/COMMON.md) and then ONLY the files they name, at the lines they name. You are a Codex seat: read the skills the packet lists as markdown files before anything else and open your handoff with SKILLS LOADED naming exactly the files you read. First read every comment already on $T (~/.local/bin/hermes kanban --board $B show $T --json), then post your CLAIM comment (seat, node, start time from date, the session id codex prints AND your rollout file path under ~/.codex/sessions/$(date '+%Y/%m/%d')/, lane HEAD + dirty count, the re-measured START frame, comments read through) with ~/.local/bin/hermes kanban --board $B comment $T '<body>' --author $SEAT, then work tests-first exactly as the packet's charges say (RED first, the frame before any edit), commit on green only on $BR, file the self-report, and finish by posting your READY handoff as a comment on $T AND printing it as your final output. Your cwd for every command is this lane; never touch the main tree, any file outside the packet's allowed list, the live dev database, the NO-TOUCH ports COMMON names, a real API key, or anything on V's desktop; never run pnpm install; git add only the paths the packet allows, never -A; never push." </dev/null
LEOF
zsh -n "$L/launch-$SEAT.sh" && echo "launcher written: $L/launch-$SEAT.sh"
for p in "$SEAT" "$T" "$PK" "$LANE" "$BR" gpt-6-astra danger-full-access "/opt/homebrew/bin"; do printf '  %-70s %s\n' "$p" "$(grep -o -F -- "$p" "$L/launch-$SEAT.sh" | wc -l | tr -d ' ')"; done
