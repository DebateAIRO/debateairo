#!/bin/zsh
# Watcher: key on artifact HANDOFF markers, never stdout marker words.
# Liveness = process still listed OR artifact mtime advancing.
# Prints one HANDOFF line per seat, then DONE. 20 min true idle → FAILED.
set -u
MISSION="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
REL="docs/missions/2026-08-21-docker-hatchet"
ROOT="${MISSION}/${REL}"
STAMPDIR="${ROOT}/logs/watch-stamps"
mkdir -p "${STAMPDIR}"
IDLE_LIMIT=1200
last_change=$(date +%s)

handoff_of() {
  local seat="$1"
  local artifact="${ROOT}/research/${seat}-requirements.md"
  [[ -f "${artifact}" ]] || return 1
  grep -q 'READY FOR HERMES STAGE REVIEW:' "${artifact}"
}

alive_of() {
  local seat="$1"
  case "${seat}" in
    opus) pgrep -f 'claude-opus-5' >/dev/null 2>&1 && return 0 ;;
    grok) pgrep -f '/.grok/bin/grok -p /goal Read docs/missions/2026-08-21-docker-hatchet/goal-packets/grok.md' >/dev/null 2>&1 && return 0 ;;
    codex) pgrep -f 'codex exec' >/dev/null 2>&1 && return 0 ;;
  esac
  return 1
}

while true; do
  now=$(date +%s)
  any_alive=0
  all_done=1
  for seat in opus grok codex; do
    stamp="${STAMPDIR}/${seat}.handoff"
    if handoff_of "${seat}"; then
      if [[ ! -f "${stamp}" ]]; then
        touch "${stamp}"
        print "HANDOFF REQ-DOCKER-$(print -r -- ${seat} | tr '[:lower:]' '[:upper:]')"
        last_change=${now}
      fi
    else
      all_done=0
      if alive_of "${seat}"; then
        any_alive=1
      fi
      art="${ROOT}/research/${seat}-requirements.md"
      log="${ROOT}/logs/${seat}.log"
      for f in "${art}" "${log}"; do
        if [[ -f "${f}" ]]; then
          mt=$(stat -f %m "${f}")
          if (( mt > last_change - 5 )); then
            last_change=${now}
          fi
        fi
      done
    fi
  done
  if (( all_done == 1 )); then
    print "DONE"
    exit 0
  fi
  if (( now - last_change >= IDLE_LIMIT )) && (( any_alive == 0 )); then
    print "FAILED idle-20min"
    exit 1
  fi
  sleep 20
done
