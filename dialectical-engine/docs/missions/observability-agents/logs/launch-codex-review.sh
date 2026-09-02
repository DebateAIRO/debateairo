#!/bin/zsh
# Launch ONE Codex Sol Max review seat in a visible Terminal, working in the MAIN checkout under
# workspace-write (its outputs are two files; four Claude seats write disjoint paths beside it).
# Usage: zsh launch-codex-review.sh <SEAT> <ticket> <packet-abs-path>
# Laws: big prompt OFF argv (a /goal pointer to an absolute packet) · stdin closed · DISTINCT log per seat ·
# launcher written fresh from a heredoc and READ BACK before launch · log must appear within 2 minutes.
set -u
SEAT="${1:?seat}"; TICKET="${2:?ticket}"; PACKET="${3:?packet abs path}"
ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LOGDIR="${ROOT}/docs/missions/observability-agents/logs"
RUN="${LOGDIR}/run-${SEAT}.sh"; LOG="${LOGDIR}/${SEAT}.log"
[[ "${PACKET}" == /* && -f "${PACKET}" ]] || { print "packet must be an ABSOLUTE existing path: ${PACKET}"; exit 1; }
[[ -e "${LOG}" ]] && { print "REFUSING: log exists (distinct-log law): ${LOG}"; exit 1; }
( cd "${ROOT}" && [[ -f "${PACKET}" ]] ) || { print "packet does not resolve from the seat cwd"; exit 1; }

cat > "${RUN}" <<RUNEOF
#!/bin/zsh
set -u
export PATH="/Applications/ChatGPT.app/Contents/Resources:\${PATH}"
cd "${ROOT}" || exit 1
print "=== ${SEAT} (codex gpt-5.6-sol @ xhigh) ticket ${TICKET} starting \$(date -u +%FT%TZ) in \$(pwd) ===" | tee -a "${LOG}"
codex exec \\
  -c model='"gpt-5.6-sol"' \\
  -c model_reasoning_effort='"xhigh"' \\
  -c sandbox_mode='"workspace-write"' \\
  -c sandbox_workspace_write.writable_roots='["/Users/vladmihaimiron/.hermes"]' \\
  "/goal You are seat ${SEAT} on ticket ${TICKET} of mission observability-agents, board observability-agents (put --board observability-agents BEFORE every hermes kanban verb; never run boards switch). YOUR PACKET IS A FILE — read it in full before anything else: ${PACKET}. It names COMMON.md, the artifacts under review, your exhaustive allowed list of exactly two output paths, the skills you must READ AS MARKDOWN (you cannot invoke a Skill tool) and list in SKILLS LOADED, the ten probes you must run yourself, and the verdict format. You are a REVIEW seat: you write no product code, you never edit the work under review, you run NO git write of any kind, and you probe rather than read — build your own fixture from the claim, never nod at the author's. Your default posture is to REFUTE. Four other seats are writing disjoint paths in this same checkout right now; touch only your two output paths and put any scratch file in /tmp. Post CLAIM on your ticket first and your verdict last. Then stop." \\
  </dev/null 2>&1 | tee -a "${LOG}"
print "=== ${SEAT} exited \$(date -u +%FT%TZ) ===" | tee -a "${LOG}"
RUNEOF
chmod +x "${RUN}"
print "=== read-back of ${RUN} ==="
zsh -n "${RUN}" || { print "SYNTAX ERROR"; exit 1; }
for must in "${PACKET}" "${ROOT}" "gpt-5.6-sol" "xhigh" "${TICKET}" "${LOG}" "</dev/null"; do
  grep -qF -- "${must}" "${RUN}" && print "ok  ${must}" || { print "MISSING ${must}"; exit 1; }
done
grep -nE '\$\{?[A-Za-z_]+' "${RUN}" | grep -vE 'PATH|LOG|date|pwd' && { print "variable residue above — inspect"; exit 1; }
print "=== launching visible Terminal ==="
osascript -e "tell application \"Terminal\" to do script \"zsh '${RUN}'\"" >/dev/null && print "launched; log ${LOG}"
