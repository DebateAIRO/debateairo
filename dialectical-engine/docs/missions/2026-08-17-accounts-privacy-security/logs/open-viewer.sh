#!/bin/zsh
# Decoupled viewer window for any mission log. Closing it kills nothing.
#   usage: open-viewer.sh <path-to-log> [title]
set -u
LOG="${1:?log path required}"
TITLE="${2:-mission log}"
osascript <<APPLESCRIPT
tell application "Terminal"
  do script "printf '\\\\033]0;${TITLE}\\\\007'; echo '=== VIEWER: ${TITLE} ==='; echo '(read-only tail; closing this window kills nothing)'; echo; tail -f '${LOG}'"
  activate
end tell
APPLESCRIPT
