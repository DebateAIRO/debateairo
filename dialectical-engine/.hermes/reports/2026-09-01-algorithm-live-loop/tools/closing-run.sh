#!/bin/bash
# closing-run.sh — the acceptance ceremony on the REAL relays, run ONCE, everything captured (D60) before anything else touches it.
# Usage:  export ACCEPTANCE_SERVICE_CREDENTIAL=REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL   # in YOUR OWN shell, first
#         bash closing-run.sh [--depth-params '{"depth":2}'] [--serve]
#         PREFLIGHT_ONLY=1 bash closing-run.sh            # only the checks below; needs no credential; exit 0 = may start, 5 = may not
# The credential is READ FROM THE ENVIRONMENT of whoever runs this; this script never prints, stores or logs it (D18).
# F-CREDENTIAL-ON-ARGV (2026-09-18): the credential is NEVER passed as a command-line argument, here or to
# the ceremony. A process's arguments are readable by every user of the machine through the process list for
# the whole of the run; its environment is not. The ceremony refuses `--service-credential` on argv by name,
# so the old shape cannot survive by habit. The variable this script checks below is simply inherited by the
# ceremony process it starts.
# HOST-INDEPENDENT (2026-09-16, Task 18): the mission dir comes from this script's own location, the
# engine from the mission dir, and the repo root from git. Export R=<checkout> to run against another
# checkout; note that inside a linked worktree `--show-toplevel` is that WORKTREE's root, which is the
# tree the ceremony should measure.
# PRE-FLIGHT (2026-09-17, V's rule "deduce, never set in stone"): every maker binary is discovered here
# and must PROVE it is a program before anything is executed or spent. Two real cases from 2026-09-17:
#   * `command -v claude` returned a launcher whose target was a 0-byte file left by an interrupted
#     CLI update — `command -v` cannot see that.
#   * the codex launcher's file had been overwritten with four lines of plain text; a shell that
#     cannot execute a file RUNS IT AS A SCRIPT instead, and line one re-ran the launcher itself —
#     an endless chain of processes that filled the Mac's process table within minutes.
# So a candidate is executed ONLY after its resolved file is a non-empty executable whose first
# bytes are a program header (a `#!` shebang, or a Mach-O / universal-binary magic number). A file
# that is not a program is refused by name and never run. The definition of done needs M>=2 makers.
set -u
M="$(cd "$(dirname "$0")/.." && pwd)"; DE="$(cd "$M/../../.." && pwd)"
R="${R:-$(git -C "$DE" rev-parse --show-toplevel)}"; OUTDIR=$M/logs/closing-run
# Maker binaries: DISCOVERED on PATH, never a hard-coded home directory. An ACCEPTANCE_*_BINARY the
# operator already exported wins. A lookup that finds nothing leaves the key blank, and a
# present-but-blank key is a loud typed refusal in the relays by design (D10) — never a silent default.
CLAUDE_BIN="${ACCEPTANCE_CLAUDE_BINARY:-$(command -v claude || true)}"
CODEX_BIN="${ACCEPTANCE_CODEX_BINARY:-$(command -v codex || true)}"
GROK_BIN="${ACCEPTANCE_GROK_BINARY:-$(command -v grok || true)}"
# is_program <file>: the first bytes must be a shebang or a Mach-O / universal-binary magic number.
is_program() {
  local magic
  magic=$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')
  case "$magic" in
    2321*) return 0 ;;                                   # "#!" shebang
    cffaedfe|cefaedfe|feedfacf|feedface) return 0 ;;     # Mach-O 64/32-bit, either byte order
    cafebabe|bebafeca) return 0 ;;                       # universal (fat) binary
    *) return 1 ;;
  esac
}
# check_bin <MAKER> <path>: the launcher must resolve (symlinks followed) to an existing, non-empty,
# executable PROGRAM; only then is `--version` executed, and exit 126/127 = the exec itself failed.
check_bin() {
  local name=$1 path=$2 real rc version
  if [ -z "$path" ]; then echo "PREFLIGHT $name: NOT FOUND on PATH and no ACCEPTANCE_${name}_BINARY exported"; return 1; fi
  real=$(readlink -f "$path" 2>/dev/null || echo "$path")
  if [ ! -e "$real" ]; then echo "PREFLIGHT $name: $path → $real does not exist (dangling launcher)"; return 1; fi
  if [ ! -s "$real" ]; then echo "PREFLIGHT $name: $path → $real is EMPTY (an interrupted install or update; reinstall, or export ACCEPTANCE_${name}_BINARY=<a complete build>)"; return 1; fi
  if [ ! -x "$real" ]; then echo "PREFLIGHT $name: $path → $real is not executable"; return 1; fi
  if ! is_program "$real"; then echo "PREFLIGHT $name: $path → $real is NOT A PROGRAM (no shebang, no Mach-O header) — NOT executed; its content was overwritten, reinstall it"; return 1; fi
  version=$("$path" --version </dev/null 2>&1 | head -1); rc=${PIPESTATUS[0]}
  if [ "$rc" -ge 126 ]; then echo "PREFLIGHT $name: $path cannot be executed (exit $rc): $version"; return 1; fi
  echo "PREFLIGHT $name: OK $path → $real · ${version:-<no version line>}"; return 0
}
RUNNABLE=0
check_bin CLAUDE "$CLAUDE_BIN" && RUNNABLE=$((RUNNABLE + 1))
check_bin CODEX "$CODEX_BIN" && RUNNABLE=$((RUNNABLE + 1))
check_bin GROK "$GROK_BIN" && RUNNABLE=$((RUNNABLE + 1))
if [ "$RUNNABLE" -lt 2 ]; then
  echo "PREFLIGHT: only $RUNNABLE of 3 maker binaries run; the definition of done needs M>=2 makers. Fix the binary named above (or export its ACCEPTANCE_*_BINARY) and re-run. Nothing was started."
  exit 5
fi
# LOGIN (2026-09-17 22:2x, after the first real run died in ten seconds on `MAKER ABSENT Anthropic
# CLAUDE_CLI_FAILED` — the CLI's OAuth session had expired): a binary that runs but is not signed in
# still costs the whole run, because the synthesis roles are pinned to a provider. Claude and Codex
# report their login state without a model call; Grok has no status command, so its own handshake at
# run start is the check. Neither command below spends anything or prints a secret.
LOGGED_IN=1
if [ -n "$CLAUDE_BIN" ] && "$CLAUDE_BIN" auth status </dev/null 2>/dev/null | grep -q '"loggedIn": *true'; then
  echo "PREFLIGHT CLAUDE LOGIN: OK"
else
  echo "PREFLIGHT CLAUDE LOGIN: NOT LOGGED IN (the relay's handshake will fail with CLAUDE_CLI_FAILED) — run, in your own terminal:  claude auth login"
  LOGGED_IN=0
fi
if [ -n "$CODEX_BIN" ] && "$CODEX_BIN" login status </dev/null 2>&1 | grep -qi 'logged in'; then
  echo "PREFLIGHT CODEX LOGIN: OK"
else
  echo "PREFLIGHT CODEX LOGIN: NOT LOGGED IN (the shim's handshake will fail) — run, in your own terminal:  codex login"
  LOGGED_IN=0
fi
echo "PREFLIGHT GROK LOGIN: not checkable without a call (grok has login/logout, no status); the run's own handshake decides — a failure prints MAKER ABSENT xAI"
if [ "$LOGGED_IN" != "1" ]; then
  echo "PREFLIGHT: a maker is not signed in; the run would die at the first role pinned to it. Sign in as printed above and re-run. Nothing was started."
  exit 6
fi
if [ "${PREFLIGHT_ONLY:-0}" = "1" ]; then
  echo "PREFLIGHT: $RUNNABLE of 3 maker binaries run; the ceremony may start (PREFLIGHT_ONLY=1 — nothing started, no credential read)."
  exit 0
fi
: "${ACCEPTANCE_SERVICE_CREDENTIAL:?export ACCEPTANCE_SERVICE_CREDENTIAL in this shell first (43 chars, [A-Za-z0-9_-]); this script never writes it}"
printf '%s' "$ACCEPTANCE_SERVICE_CREDENTIAL" | grep -qE '^[A-Za-z0-9_-]{43}$' || { echo "the credential is not 43 chars of [A-Za-z0-9_-]"; exit 2; }
# The ceremony reads the credential from its own environment (F-CREDENTIAL-ON-ARGV). Exporting it here is
# what makes the child inherit it whether the operator exported it or set it only for this script's own run.
export ACCEPTANCE_SERVICE_CREDENTIAL
mkdir -p "$OUTDIR"; STAMP=$(date '+%Y%m%d-%H%M%S'); LOG="$OUTDIR/ceremony-$STAMP.log"
COMMIT=$(git -C "$R" rev-parse HEAD); TREE=$(git -C "$R" rev-parse HEAD^{tree}); DIRTY=$(git -C "$R" status --porcelain | grep -v '^??' | wc -l | tr -d ' ')
[ "$DIRTY" = "0" ] || { echo "dev has tracked changes — refusing to run the ceremony on a dirty tree"; exit 3; }
{
  echo "commit=$COMMIT tree=$TREE  gate=closing-run  $(date '+%F %T %Z')"
  echo "node $(node --version) · pnpm $(pnpm --version) · claude $("$CLAUDE_BIN" --version </dev/null 2>/dev/null | head -1) · codex $("$CODEX_BIN" --version </dev/null 2>/dev/null | head -1) · grok $("$GROK_BIN" --version </dev/null 2>/dev/null | head -1)"
  echo "binaries: ACCEPTANCE_CLAUDE_BINARY=$CLAUDE_BIN ACCEPTANCE_CODEX_BINARY=$CODEX_BIN ACCEPTANCE_GROK_BINARY=$GROK_BIN (runnable: $RUNNABLE of 3)"
  echo "ports: DB 55432 · API 58080 · SHIM 58090 · GROK RELAY 58091 · stranger sample rate 0"
  echo "credential: present in the environment (length $(printf '%s' "$ACCEPTANCE_SERVICE_CREDENTIAL" | wc -c | tr -d ' ')); never logged"
  echo "\$ ./node_modules/.bin/tsx acceptance/run-acceptance.ts $*"
  echo "the credential is not on that command line; the ceremony inherits ACCEPTANCE_SERVICE_CREDENTIAL from this script's environment (F-CREDENTIAL-ON-ARGV)"
  echo "<<<OUTPUT"
} > "$LOG"
cd "$DE" || exit 4
ACCEPTANCE_DB_PORT=55432 ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT=58080 ACCEPTANCE_SHIM_PORT=58090 ACCEPTANCE_GROK_RELAY_PORT=58091 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=0 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
ACCEPTANCE_CLAUDE_BINARY="$CLAUDE_BIN" ACCEPTANCE_CODEX_BINARY="$CODEX_BIN" ACCEPTANCE_GROK_BINARY="$GROK_BIN" \
./node_modules/.bin/tsx acceptance/run-acceptance.ts "$@" >> "$LOG" 2>&1
rc=$?
{ echo "OUTPUT>>>"; echo "EXIT = $rc"; echo "finished $(date '+%F %T %Z')"; echo "porcelain AFTER: [$(git -C "$R" status --porcelain | grep -v '^??' | tr '\n' ';')]"; } >> "$LOG"
# capture any artifacts the ceremony wrote under the engine tree (untracked files) — copy, never move
git -C "$R" status --porcelain | grep '^??' | awk '{print $2}' | grep -v '\.hermes/' | while read -r p; do mkdir -p "$OUTDIR/artifacts-$STAMP/$(dirname "$p")"; cp -R "$R/$p" "$OUTDIR/artifacts-$STAMP/$p" 2>/dev/null; done
echo "closing run finished: exit=$rc · log $LOG"
exit $rc
