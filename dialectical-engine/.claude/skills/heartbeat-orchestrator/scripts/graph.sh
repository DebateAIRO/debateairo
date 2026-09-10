#!/bin/zsh
# graph.sh <board-slug> [out.md] — the mission graph, rendered FROM the board (never drawn by hand).
# Nodes = the board's tasks (class = status), edges = task_links (parent --> child). Read-only.
# With out.md, ALSO writes beside it: mission-graph-nodes.mmd (work nodes only — every "(finding)" ticket
# hidden, top-down) and mission-graph-full.mmd (every ticket). SEND both to V with SendUserFile
# (display: render) at every gate — a repo path in a message is not an attachment (V, 2026-09-10).
set -u
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"; setopt multibyte 2>/dev/null
B="${1:?usage: graph.sh <board-slug> [out.md]}"; OUT="${2:-}"
DB="$HOME/.hermes/kanban/boards/$B/kanban.db"
[ -f "$DB" ] || { echo "no kanban db for board '$B' at $DB" >&2; exit 1; }
U="file:$DB?immutable=1"
classes(){
  echo '  classDef done fill:#dfe9df,stroke:#3E7A4E'
  echo '  classDef running fill:#f3ece0,stroke:#A8823E'
  echo '  classDef ready fill:#fdfbf6,stroke:#6E675C'
  echo '  classDef review fill:#e6e8e8,stroke:#3D5A80'
  echo '  classDef blocked fill:#f4e5de,stroke:#B0432F'
  echo '  classDef todo fill:#efe9e0,stroke:#6E675C'
  echo '  classDef scheduled fill:#efe9e0,stroke:#6E675C'
  echo '  classDef triage fill:#efe9e0,stroke:#6E675C'
}
body(){  # the flowchart lines without the header
  sqlite3 -separator '|' "$U" "SELECT t.id, t.status, replace(replace(replace(replace(t.title,'\"',''),'|','/'),'[','('),']',')') FROM tasks t WHERE t.status != 'archived' ORDER BY t.created_at;" \
    | while IFS='|' read -r id st title; do t="${title[1,70]}"; printf '  %s["%s"]:::%s\n' "$id" "$t" "$st"; done
  sqlite3 -separator '|' "$U" "SELECT l.parent_id, l.child_id FROM task_links l JOIN tasks t ON t.id=l.child_id WHERE t.status != 'archived';" \
    | awk -F'|' '{ printf "  %s --> %s\n", $1, $2 }'
  classes
}
nodes_only(){  # work nodes: drop every "(finding)" ticket and the edges that touch one
  awk '
    /^  t_[0-9a-f]+\["/ { id=$1; sub(/\[.*/,"",id); lab=$0; sub(/^[^"]*"/,"",lab); if (lab ~ /^\(finding\)/) next; keep[id]=1; print; next }
    /^  t_[0-9a-f]+ --> t_[0-9a-f]+$/ { if (keep[$1] && keep[$3]) print; next }
    { print }'
}
render(){ echo '```mermaid'; echo 'flowchart LR'; body; echo '```'; echo; echo "_rendered $(date '+%Y-%m-%d %H:%M') from board \`$B\` — $(sqlite3 "$U" "SELECT count(*) FROM tasks WHERE status != 'archived';") nodes, $(sqlite3 "$U" "SELECT count(*) FROM task_links;") edges_"; }
if [ -n "$OUT" ]; then
  render > "$OUT"; D="${OUT:h}"
  { echo 'flowchart LR'; body; } > "$D/mission-graph-full.mmd"
  { echo 'flowchart TB'; body | nodes_only; } > "$D/mission-graph-nodes.mmd"
  echo "wrote $OUT + $D/mission-graph-nodes.mmd ($(grep -c '^  t_[0-9a-f]*\[' "$D/mission-graph-nodes.mmd") work nodes) + $D/mission-graph-full.mmd"
else render; fi
