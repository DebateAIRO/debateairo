#!/bin/bash
# CODE-REV-S02-C1C2 r1 — mutation harness. Each mutant is applied to the module under review,
# the AUTHOR's cluster command is run, the module is restored with `git checkout HEAD --`, and
# `git status --porcelain` is printed so the revert is proven every time.
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s02-c1c2/dialectical-engine
cd "$LANE" || exit 99
MOD=apps/ui/components/consent/modalSemantics.ts
restore() { git checkout HEAD -- "$MOD"; }
run_author() {
  out=$(pnpm exec vitest run tests/render/consent-modal-semantics.test.tsx 2>&1); rc=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  names=$(printf '%s' "$out" | grep -E '^ FAIL ' | sed 's/.*> //' | tr '\n' '|')
  echo "    author-suite exit=$rc  summary=[$sum]"
  [ -n "$names" ] && echo "    failing: $names"
}
run_mine() {
  out=$(pnpm exec vitest run --config .review-scratch/probe.vitest.config.ts .review-scratch/esc-stack.probe.tsx 2>&1); rc=$?
  sum=$(printf '%s' "$out" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1)
  echo "    rev-probe   exit=$rc  summary=[$sum]"
}
mut() {
  label="$1"; py="$2"
  echo "=================================================================="
  echo "MUTANT $label"
  python3 -c "$py"
  if ! git diff --quiet -- "$MOD"; then echo "    (patch applied)"; else echo "    !! PATCH DID NOT APPLY — mutant is vacuous"; fi
  run_author
  restore
  echo "    porcelain after restore: [$(git status --porcelain | tr '\n' ';')]"
}
P="import pathlib;p=pathlib.Path('$LANE/apps/ui/components/consent/modalSemantics.ts');s=p.read_text();"

mut "M1 FIFO instead of LIFO (surfaceStack[0])" \
  "${P}s=s.replace('const top = surfaceStack[surfaceStack.length - 1];','const top = surfaceStack[0];');p.write_text(s)"

mut "M2 stack never pops (splice removed)" \
  "${P}s=s.replace('if (index !== -1) surfaceStack.splice(index, 1);','/* mutant: never pops */');p.write_text(s)"

mut "M3 focusable set CACHED at open, not requeried on Tab" \
  "${P}s=s.replace('const focusable = focusableWithin(entry.read().containerRef.current);','const focusable = (entry as unknown as {cache?: HTMLElement[]}).cache ??= focusableWithin(entry.read().containerRef.current);');p.write_text(s)"

mut "M4 focus NOT returned to the opener" \
  "${P}s=s.replace('      focusElement(opener);','      /* mutant: no focus return */ void opener;');p.write_text(s)"

mut "M5 matchMedia UNGUARDED" \
  "${P}s=s.replace('  if (typeof window.matchMedia !== \"function\") return false;','  /* mutant: guard removed */');p.write_text(s)"

mut "M6 Escape delivered to EVERY surface (per-surface behaviour)" \
  "${P}s=s.replace('    top.read().onClose();','    for (const e of surfaceStack) e.read().onClose();');p.write_text(s)"

mut "M7 Tab preventDefault removed" \
  "${P}s=s.replace('  event.preventDefault();\n  focusElement(next);','  focusElement(next);');p.write_text(s)"

mut "M8 initial focus not applied" \
  "${P}s=s.replace('    focusElement(surfaceRef.current.initialFocusRef.current);','    /* mutant: no initial focus */');p.write_text(s)"

mut "M9 a SECOND document keydown listener per surface" \
  "${P}s=s.replace('    attachListener();','    attachListener();\n    document.addEventListener(\"keydown\", handleDocumentKeydown);');p.write_text(s)"

echo "=================================================================="
echo "FINAL porcelain: [$(git status --porcelain | tr '\n' ';')]"
