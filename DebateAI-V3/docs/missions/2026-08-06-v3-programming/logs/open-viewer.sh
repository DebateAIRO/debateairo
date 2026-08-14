#!/bin/zsh
# DR-168-A viewer window — shows a worker's live log in a Terminal window
# V can watch. VIEWER ONLY: the worker runs as a harness-tracked background
# process under the orchestrator; closing this window kills nothing.
#   usage: open-viewer.sh <logfile> [title]
set -u
LOG="${1:?usage: open-viewer.sh <logfile> [title]}"
TITLE="${2:-$(basename "${LOG}")}"
if [[ ! -f "${LOG}" ]]; then
  print "REFUSING VIEWER: log ${LOG} does not exist yet (launch the worker first)."
  exit 1
fi
/usr/bin/osascript - "${LOG}" "VIEWER · ${TITLE}" <<'EOF'
on run argv
  set logPath to item 1 of argv
  set winTitle to item 2 of argv
  tell application "Terminal"
    activate
    do script "echo 'VIEWER ONLY (DR-168-A) — closing this window does not affect the worker.'; exec tail -n +1 -f " & quoted form of logPath
    set custom title of front window to winTitle
  end tell
end run
EOF
