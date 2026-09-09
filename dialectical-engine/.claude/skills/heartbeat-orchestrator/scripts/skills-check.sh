#!/bin/zsh
# skills-check.sh <transcript> <skill-name>… — the SKILLS LOADED gate, from the transcript BODY.
# One distinctive BODY phrase per skill, verified against the skill file at run time (a phrase that has
# drifted out of its skill fails loudly). A skill NAME echoes back from packets and proves nothing — only
# a body phrase does. Exit 1 if any named skill's phrase is absent from the transcript or its file.
set -u
T="${1:?usage: skills-check.sh <transcript> <skill>…}"; shift
[ -f "$T" ] || { echo "no transcript at $T" >&2; exit 2; }
REPO="$(cd "$(dirname "$0")/../../../.." && pwd -P)"
SP="$(ls -d "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills 2>/dev/null | sort -V | tail -1)"
phrase(){ case "$1" in
  using-superpowers) echo "This is not negotiable. You cannot rationalize your way out of this.";;
  test-driven-development) echo "If you didn't watch the test fail, you don't know if it tests the right thing.";;
  verification-before-completion) echo "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE";;
  systematic-debugging) echo "Violating the letter of this process is violating the spirit of debugging.";;
  brainstorming) echo "the ceremony scales with the task";;
  writing-plans) echo "split only where a reviewer could meaningfully";;
  receiving-code-review) echo "RESPOND: Technical acknowledgment or reasoned pushback";;
  heartbeat-protocol) echo "One role per node: a seat that reviews does not code, and no seat reviews its own work";;
  heartbeat-worker) echo "Check the packet against reality and stop if it is wrong";;
  heartbeat-reviewer) echo "is a finding against the orchestrator's packet, not against the worker who obeyed it";;
  heartbeat-architecture) echo "Requirements scaffolded the slice files";;
  heartbeat-requirements) echo "hard-capped at 100 lines, because long instruction files get skimmed";;
  heartbeat-mock) echo "the live app through the harness's own browser pane";;
  *) echo "";; esac; }
file(){ case "$1" in heartbeat-*) echo "$REPO/.claude/skills/$1/SKILL.md";; *) echo "$SP/$1/SKILL.md";; esac; }
rc=0
for s in "$@"; do
  p="$(phrase "$s")"; f="$(file "$s")"
  [ -n "$p" ] || { echo "UNKNOWN skill $s — add its body phrase to skills-check.sh"; rc=1; continue; }
  [ -f "$f" ] && /usr/bin/grep -qF -- "$p" "$f" || { echo "DRIFT $s — the phrase is not in $f"; rc=1; continue; }
  n=$(/usr/bin/grep -cF -- "$p" "$T"); [ "$n" -gt 0 ] && echo "ok   $s ($n)" || { echo "MISSING $s — body phrase absent from the transcript"; rc=1; }
done
[ $rc -eq 0 ] && echo "SKILLS LOADED verified: $# / $#" || echo "SKILLS LOADED NOT verified"
exit $rc
