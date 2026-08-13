#!/bin/zsh
# Agent lifecycle reaper — DR-158 (V, 2026-08-12):
#   "kill the terminals that are DONE with their tickets and spawn the
#    subsequent ones for new tickets. same for Groks. after its job is done
#    you close it"
#
# Run BEFORE every dispatch. Two failures made V ask for this:
#   - a codex session polled a ticket for 3h46m after EXEC-01 was already done
#   - another lived 1h27m past its DEPTH-01 handoff
# Both were zombies the standing protocol's own guard failed to catch, and the
# second blocked a launch because the concurrency guard saw it as "alive".
set -u
MISSION_DIR="/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3"
BOARD="debateai-v3"
DB="${HOME}/.hermes/kanban/boards/${BOARD}/kanban.db"

reap_agent() {
  local pattern="$1" label="$2"
  local pids
  pids=$(pgrep -f "${pattern}" 2>/dev/null)
  if [[ -z "${pids}" ]]; then
    print "  ${label}: none running"
    return 0
  fi
  for p in ${=pids}; do
    print "  ${label}: killing pid ${p} (elapsed $(ps -o etime= -p ${p} 2>/dev/null | tr -d ' '))"
    kill "${p}" 2>/dev/null
  done
}

print "=== reap $(date -u +%FT%TZ) ==="
reap_agent "codex exec.*(/goal|resume)" "codex-seat"
reap_agent "\.grok/bin/grok" "grok"
sleep 2

# Close only OUR finished windows: mission-tagged AND not busy. Windows we
# cannot identify are left alone — they may be V's own.
osascript -e 'tell application "Terminal"
  set closed to ""
  repeat with w in (windows whose custom title contains "PROG-V3-R1")
    try
      if busy of w is false then
        set closed to closed & (custom title of w) & linefeed
        close w
      end if
    end try
  end repeat
  return closed
end tell' 2>/dev/null | while read -r line; do [[ -n "${line}" ]] && print "  closed window: ${line}"; done

print "=== board after reap ==="
sqlite3 "${DB}" "SELECT status, COUNT(*) FROM tasks GROUP BY status;" 2>/dev/null | while read -r l; do print "  ${l}"; done
print "=== next ready [Codex] ticket ==="
sqlite3 "${DB}" "SELECT id, substr(title,1,70) FROM tasks WHERE status='ready' AND title LIKE '[Codex]%' ORDER BY priority DESC, created_at LIMIT 3;" 2>/dev/null | while read -r l; do print "  ${l}"; done
