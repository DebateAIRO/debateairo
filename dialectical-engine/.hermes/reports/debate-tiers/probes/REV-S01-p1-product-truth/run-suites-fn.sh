run_suites() { ok=1; for p in "$@"; do f=${p%%:*}; r=${p#*:}; xp=${r%%:*}; xf=${r##*:};
  o=$(pnpm exec vitest run "$f" 2>&1); rc=$?;
  s=$(printf '%s\n' "$o" | grep -E '^[[:space:]]*Tests[[:space:]]+' | tail -1);
  if printf '%s\n' "$o" | grep -q 'No test files found' || [ -z "$s" ]; then
    echo "BROKEN $f (no summary line)"; ok=0; continue; fi
  ap=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) passed.*/\1/p'); ap=${ap:-0};
  af=$(printf '%s' "$s" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p'); af=${af:-0};
  echo "$f rc=$rc passed=$ap failed=$af (expect $xp/$xf)";
  [ "$ap" = "$xp" ] && [ "$af" = "$xf" ] || ok=0; done;
  [ $ok -eq 1 ] && echo CLUSTER_GREEN || echo CLUSTER_RED; }
