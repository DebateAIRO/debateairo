#!/bin/bash
# gate-run.sh v4 — emits a COMPLETE gate record in the v4 RECORD FORMAT (F-TOOL-MUTATE-3, codex r2 B1–B4):
#   a per-run NONCE frames the command output and tags every completion line, so a command's ordinary output is
#   not mistaken for the emitter's own metadata by ACCIDENT; the output is newline-terminated before its closing
#   fence. TRUST MODEL: the nonce is written before the command runs, under the same user — it is not a secret from
#   the command and not authentication; the comparator parses the framing structurally (a span stack) so that it
#   stays correct even when the delimiter values are known. A same-user writable transcript is never tamper-proof.
# (was: v3 —) emits a COMPLETE gate record. Use this for every acceptance gate (D45, D49, D52).
# Usage: gate-run.sh <worktree-being-measured> <out.log> <label> <cmd...>
#
# Emits, in order: the MEASURED checkout's commit and tree · a PROVISIONING block · porcelain
# BEFORE · the exact command (unpiped) · raw output between markers · the command's own exit ·
# porcelain AFTER · a clean verdict.
#
# WHAT PORCELAIN DOES AND DOES NOT COVER (v1 overclaimed this and a reviewer was right to say
# so): `git status --porcelain` excludes IGNORED paths. Dependency installs and the generated
# contract directory are ignored here, and the actual compiler launcher lives under them. So
# identical commit, tree and both porcelain fields do NOT by themselves rule out a swapped
# tsc launcher or a changed generated artifact. The PROVISIONING block below exists to cover
# exactly that gap: it records interpreter and package-manager versions, the locked-input
# hash, a manifest hash of the generated contract directory, and — for each tool named in the
# command — the resolved launcher's path, its sha256, and its self-reported version.
set -u
WT=${1:?worktree}; OUT=${2:?out}; LABEL=${3:?label}; shift 3
COMMIT=$(git -C "$WT" rev-parse HEAD); TREE=$(git -C "$WT" rev-parse HEAD^{tree})
NONCE=$(head -c 9 /dev/urandom | od -An -tx1 | tr -d " \n")   # 18 hex, per run
TMPOUT=$(mktemp "${TMPDIR:-/tmp}/gate-run.XXXXXX"); trap 'rm -f "$TMPOUT"' EXIT
PRE=$(git -C "$WT" status --porcelain | tr '\n' ';')

# the package root the gate actually runs in (this repo nests the engine one level down)
PKG="$WT"; [ -d "$WT/dialectical-engine/node_modules" ] && PKG="$WT/dialectical-engine"

sha() { [ -f "$1" ] && shasum -a 256 "$1" | cut -d' ' -f1 || echo "(absent)"; }

{
  echo "commit=$COMMIT tree=$TREE  gate=$LABEL  record=v4 nonce=$NONCE  $(date '+%F %T %Z')"
  echo "emitter           : gate-run.sh v4.1 (D45, D49, D52; F-TOOL-MUTATE-3 record=v4) — v3 records lack the nonce framing; v2 the package/entry lines"
  echo "measured worktree : $WT"
  echo "package root      : $PKG"
  echo "PROVISIONING (porcelain cannot see ignored paths; this block covers them):"
  printf '  %-20s: %s\n' "node" "$(node --version 2>/dev/null || echo '(absent)')"
  printf '  %-20s: %s\n' "pnpm" "$(pnpm --version 2>/dev/null || echo '(absent)')"
  printf '  %-20s: %s\n' "pnpm-lock.yaml" "sha256 $(sha "$PKG/pnpm-lock.yaml")"
  GEN="$PKG/packages/contract/generated"
  if [ -d "$GEN" ]; then
    n=$(find "$GEN" -type f | wc -l | tr -d ' ')
    h=$(find "$GEN" -type f -exec shasum -a 256 {} \; | sort | shasum -a 256 | cut -d' ' -f1)
    printf '  %-20s: %s files, manifest sha256 %s\n' "generated contract" "$n" "$h"
  else
    printf '  %-20s: %s\n' "generated contract" "(absent)"
  fi
  # every tool named in the command gets its REAL entry point identified and hashed.
  # v2 hashed node_modules/.bin/<tool>, which is a pnpm SHELL SHIM generated at install time:
  # it differs between worktrees for no reason but generation order, so comparing two halves
  # showed DIFFERENT and invited exactly the false compiler-swap suspicion this block exists to
  # prevent. The T3C seat chased that, and so did I. v3 follows the shim to the module it
  # actually executes and hashes THAT (byte-identical across worktrees for a given surface).
  for tok in "$@"; do
    case "$tok" in
      tsc|vitest|eslint|tsx|prettier)
        BIN="$PKG/node_modules/.bin/$tok"
        if [ ! -e "$BIN" ]; then printf '  %-20s: (no launcher found)\n' "$tok"; continue; fi
        REL=$(grep -oE '\$basedir/[^ "'"'"']*' "$BIN" 2>/dev/null | sed 's|\$basedir/||' | while read -r r; do
                [ -f "$(dirname "$BIN")/$r" ] && echo "$r" && break; done)
        ENTRY=""; [ -n "$REL" ] && ENTRY=$(python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]))" "$(dirname "$BIN")/$REL" 2>/dev/null)
        PKGJSON=""; VER=""
        if [ -n "$ENTRY" ]; then
          d=$(dirname "$ENTRY")
          while [ "$d" != "/" ]; do [ -f "$d/package.json" ] && PKGJSON="$d/package.json" && break; d=$(dirname "$d"); done
          [ -n "$PKGJSON" ] && VER=$(python3 -c "import json,sys;j=json.load(open(sys.argv[1]));print(j.get('name','?')+'@'+j.get('version','?'))" "$PKGJSON" 2>/dev/null)
        fi
        printf '  %-20s: shim    %s  (generated at install; its bytes are NOT evidence)\n' "$tok" "$BIN"
        printf '  %-20s  package %s\n' "" "${VER:-(unresolved)}"
        printf '  %-20s  entry   %s\n' "" "${ENTRY:-(unresolved)}"
        printf '  %-20s  sha256  %s\n' "" "$([ -n "$ENTRY" ] && sha "$ENTRY" || echo '(unresolved)')"
        printf '  %-20s  version %s\n' "" "$( (cd "$PKG" && pnpm exec "$tok" --version) 2>/dev/null | head -1 || echo '(unavailable)')"
        ;;
    esac
  done
  echo "porcelain BEFORE  : [${PRE}]"
  echo "\$ $*"
  echo "<<<OUTPUT:$NONCE"
} > "$OUT"
( cd "$WT" && "$@" ) > "$TMPOUT" 2>&1
rc=$?
cat "$TMPOUT" >> "$OUT"
# B3: the closing fence must start on its own line whatever the command's last byte was
if [ -s "$TMPOUT" ] && [ "$(tail -c 1 "$TMPOUT" | od -An -c | tr -d ' ')" != '\n' ]; then echo >> "$OUT"; fi
rm -f "$TMPOUT"
POST=$(git -C "$WT" status --porcelain | tr '\n' ';')
{
  echo "OUTPUT>>>:$NONCE"
  echo "EXIT:$NONCE = $rc"
  echo "porcelain AFTER   : [${POST}]"
  if [ "$PRE" = "$POST" ]; then echo "CLEAN-STATE:$NONCE unchanged across the run (TRACKED paths only — see PROVISIONING)"; else echo "CLEAN-STATE:$NONCE CHANGED — this measurement is suspect"; fi
} >> "$OUT"
echo "$OUT: exit=$rc clean=$([ "$PRE" = "$POST" ] && echo yes || echo NO)"
exit $rc
