#!/bin/zsh
# REV-PES-S02-p1-security-data-safety — temporary mutants of acceptance/pes-s02-hosted.ts, each run through REAL
# `pnpm pes:accept-hosted` (rev-sd-cli-exit.sh), then restored FROM THE BYTES CAPTURED at start (never a literal),
# with cmp + `git status --porcelain` printed after every restore. Written against slice head dfef0de94.
# Usage: zsh rev-sd-mutants.sh <worktree dialectical-engine dir>
set -u
export PATH="/opt/homebrew/bin:$PATH"
WT="${1:?worktree}"; P="$(cd "$(dirname "$0")" && pwd)"
cd "$WT" || exit 2
F=acceptance/pes-s02-hosted.ts; SAVE="$P/scratch/pes-s02-hosted.ts.orig"
cp "$F" "$SAVE"
restore() { cp "$SAVE" "$F"; cmp "$SAVE" "$F" && echo "restored: cmp identical"; echo "porcelain: [$(git status --porcelain)]"; }
trap restore EXIT INT TERM
run() { # id, perl substitution
  echo "=================== MUTANT $1"
  perl -0pi -e "$2" "$F"
  if cmp -s "$SAVE" "$F"; then echo "MUTANT DID NOT APPLY"; restore; return; fi
  git diff --stat -- "$F" | tail -1
  zsh "$P/rev-sd-cli-exit.sh" "$WT" "mut-$1" 2>&1 | grep -v '^--- distinct'
  restore
}
# FAIL: the vendor is handed a wrong credential; the wrong token must never reach stdout/stderr either.
run fail-wrong-credential 's/credentialLiteral: FAKE_VENDOR_AUTHORIZATION,/credentialLiteral: "Bearer pes-s02-rev-sd-wrong-token",/'
# UNVERIFIED: the run-time certificate cannot be built.
run unverified-openssl 's#opensslExecutable: "/usr/bin/openssl",#opensslExecutable: "/nonexistent/openssl",#'
# THROWN: the acceptance throws a message that carries the token; the CLI must print only its own FAIL line.
run thrown-with-token 's/const lines: string\[\] = \[\];/throw new Error("rev-sd pes-s02-fake-vendor-token \/x\/custody.d");\n  const lines: string[] = [];/'
# LEAK-PATH: a refusal line tries to carry the credential path; the stdout law must stop it before it prints.
run leak-credential-path 's/emit\(`PES-S02 REFUSED \$\{caught.message\}`\);/emit(`PES-S02 REFUSED \${caught.message} \${credentialPath}`);/'
# LEAK-TOKEN: the admission line tries to carry the credential header; the stdout law must stop it.
run leak-credential-header 's/emit\("PES-S02 ADMITTED vendor:a"\);/emit(`PES-S02 ADMITTED vendor:a \${deps.credentialLiteral}`);/'
