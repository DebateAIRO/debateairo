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
  echo '  classDef slice fill:#d6e4f5,stroke:#2F5D9E,stroke-width:2px'   # blue: the ticket that CLOSES a vertical slice (V's veto)
}
body(){  # the flowchart lines without the header
  sqlite3 -separator '|' "$U" "SELECT t.id, t.status, replace(replace(replace(replace(t.title,'\"',''),'|','/'),'[','('),']',')') FROM tasks t WHERE t.status != 'archived' ORDER BY t.created_at;" \
    | while IFS='|' read -r id st title; do t="${title[1,70]}"; case "$title" in '(finding)'*) printf '  %s(["%s"]):::%s\n' "$id" "$t" "$st";; '(V) S'[0-9]*) printf '  %s[["%s"]]:::slice\n' "$id" "$t";; *) printf '  %s["%s"]:::%s\n' "$id" "$t" "$st";; esac; done
  sqlite3 -separator '|' "$U" "SELECT l.parent_id, l.child_id FROM task_links l JOIN tasks t ON t.id=l.child_id WHERE t.status != 'archived';" \
    | awk -F'|' '{ printf "  %s --> %s\n", $1, $2 }'
  classes
}
nodes_only(){  # work nodes: drop every "(finding)" ticket; each slice's leaf nodes get a dotted "veto" edge to the slice ticket
  python3 -c '
import sys,re
lines=sys.stdin.read().splitlines(); nodes={}; edges=[]; other=[]
for l in lines:
    m=re.match(r"  (t_[0-9a-f]+)(\[\[|\(\[|\[)\"(.*)\"(\]\]|\]\)|\])(:::\w+)$", l)
    if m: nodes[m.group(1)]=(m.group(3),l); continue
    m=re.match(r"  (t_[0-9a-f]+) --> (t_[0-9a-f]+)$", l)
    if m: edges.append((m.group(1),m.group(2))); continue
    other.append(l)
keep={k:v for k,v in nodes.items() if not v[0].startswith("(finding)")}
for k,(t,l) in keep.items(): print(l)
kept=[(a,b) for a,b in edges if a in keep and b in keep]
for a,b in kept: print(f"  {a} --> {b}")
slices={k:re.match(r"\(V\) (S\d+)",t).group(1) for k,(t,l) in keep.items() if re.match(r"\(V\) S\d+ ",t)}
parents={a for a,b in kept}
depth={}
def d(k):
    if k in depth: return depth[k]
    ps=[a for a,b in kept if b==k]; depth[k]=0 if not ps else 1+max(d(a) for a in ps); return depth[k]
for sid,sname in slices.items():
    leaves=[k for k,(t,l) in keep.items() if k not in slices and k not in parents and re.search(r"\b"+sname+r"\b|\b"+sname+r"-", t)]
    if not leaves: continue
    dm=max(d(k) for k in leaves)   # the slice ends at its DEEPEST leaves (the last pass), not at every dead end
    for k in leaves:
        if d(k)==dm: print(f"  {k} -. veto .-> {sid}")
for l in other: print(l)
'
}
render(){ echo '```mermaid'; echo 'flowchart LR'; body; echo '```'; echo; echo "_rendered $(date '+%Y-%m-%d %H:%M') from board \`$B\` — $(sqlite3 "$U" "SELECT count(*) FROM tasks WHERE status != 'archived';") nodes, $(sqlite3 "$U" "SELECT count(*) FROM task_links;") edges_"; }
if [ -n "$OUT" ]; then
  render > "$OUT"; D="${OUT:h}"
  { echo 'flowchart LR'; body; } > "$D/mission-graph-full.mmd"   # LR: findings fan out downwards under their node
  { echo 'flowchart TB'; body | nodes_only; } > "$D/mission-graph-nodes.mmd"
  echo "wrote $OUT + $D/mission-graph-nodes.mmd ($(grep -c '^  t_[0-9a-f]*\[' "$D/mission-graph-nodes.mmd") work nodes) + $D/mission-graph-full.mmd"
else render; fi
