#!/bin/zsh
# Launch ONE Codex gpt-5.6-sol coding seat in a visible Terminal window, inside its slice worktree.
# Usage: zsh launch-codex-seat.sh <SEAT-NAME> <ticket> <packet-abs-path> <lane-abs-path> [model_reasoning_effort=xhigh]
# Builds logs/run-<SEAT>.sh FRESH from a heredoc, reads it back (packet path, lane, model, ticket, no $ residue),
# verifies the packet resolves FROM THE LANE, then opens it via osascript (V-authorized visible fleet terminals).
# Laws honoured: big prompt OFF argv (a /goal pointer to an absolute packet) · stdin closed (</dev/null) ·
# per-seat DISTINCT log path · content read-back before launch · log file must appear within 2 minutes.
set -u
SEAT="${1:?seat}"; TICKET="${2:?ticket}"; PACKET="${3:?packet abs path}"; LANE="${4:?lane abs path}"; EFFORT="${5:-xhigh}"
LOGDIR="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs"
RUN="${LOGDIR}/run-${SEAT}.sh"; LOG="${LOGDIR}/${SEAT}.log"
[[ "${PACKET}" == /* && -f "${PACKET}" ]] || { print "packet must be an ABSOLUTE existing path: ${PACKET}"; exit 1; }
[[ -d "${LANE}/.git" || -f "${LANE}/.git" || -d "${LANE}" ]] || { print "lane missing: ${LANE}"; exit 1; }
( cd "${LANE}" && [[ -f "${PACKET}" ]] ) || { print "packet does not resolve from the lane cwd"; exit 1; }
[[ -e "${LOG}" ]] && { print "REFUSING: log already exists (distinct log path law): ${LOG}"; exit 1; }
for other in "${LOGDIR}"/run-*.sh; do [[ -f "${other}" && "${other}" != "${RUN}" ]] && grep -q "LOG=\"${LOG}\"" "${other}" && { print "REFUSING: ${other} already writes ${LOG}"; exit 1; }; done

cat > "${RUN}" <<RUNEOF
#!/bin/zsh
set -u
LANE="${LANE}"
LOG="${LOG}"
export PATH="/Applications/ChatGPT.app/Contents/Resources:\${PATH}"
cd "\${LANE}" || exit 1
print "=== ${SEAT} (codex gpt-5.6-sol @ ${EFFORT}) ticket ${TICKET} starting \$(date -u +%FT%TZ) in \$(pwd) ===" | tee -a "\${LOG}"
codex exec \\
  -c model='"gpt-5.6-sol"' \\
  -c model_reasoning_effort='"${EFFORT}"' \\
  -c sandbox_mode='"danger-full-access"' \\
  "/goal You are seat ${SEAT} on ticket ${TICKET} of mission observability-agents (board observability-agents; put --board observability-agents BEFORE every hermes kanban verb; never boards switch). Your current directory IS your worktree; never leave it and never touch another worktree or the main checkout. YOUR PACKET IS A FILE — read it in full before anything else: ${PACKET}. It names COMMON.md and the slice SPEC, PLAN and DECISIONS you must read next, your exhaustive allowed list, the skills you must read as markdown before coding (heartbeat-protocol, heartbeat-worker, and the Superpowers floor: test-driven-development, verification-before-completion, systematic-debugging), the refutation duty, the three-run cluster law, the self-report path, and the handoff marker READY FOR PEER REVIEW that OPENS with SKILLS LOADED. RED before GREEN, always. No push, no merge, no Done, no ticket split, no branch or worktree operation. Commit on this worktree's branch only when the packet says so. Then stop." \\
  </dev/null 2>&1 | tee -a "\${LOG}"
print "=== ${SEAT} exited \$(date -u +%FT%TZ) ===" | tee -a "\${LOG}"
RUNEOF
chmod +x "${RUN}"

print "=== read-back of ${RUN} ==="
zsh -n "${RUN}" || { print "SYNTAX ERROR"; exit 1; }
for must in "${PACKET}" "${LANE}" "gpt-5.6-sol" "${TICKET}" "${LOG}" "</dev/null"; do grep -qF -- "${must}" "${RUN}" && print "ok  ${must}" || { print "MISSING ${must}"; exit 1; }; done
grep -nE '\$\{?[A-Za-z_]+' "${RUN}" | grep -vE 'PATH|LOG|LANE|date' && { print "unexpected variable residue above — inspect"; exit 1; }
print "=== launching in a visible Terminal ==="
osascript -e "tell application \"Terminal\" to do script \"zsh '${RUN}'\"" >/dev/null && print "launched; log: ${LOG} (must appear within 2 minutes)"
