#!/bin/zsh
# ARCH-FIX-PES-S02-p3 — which stderr lines does node print when NO_COLOR and FORCE_COLOR are both set? (S02-S19 / V6 log gate)
export PATH="/opt/homebrew/bin:$PATH"
echo "== neither set:"; env -u NO_COLOR -u FORCE_COLOR node -e 'console.log("ok")' 2>&1
echo "== both set:"; NO_COLOR=1 FORCE_COLOR=1 node -e 'console.log("ok")' 2>&1
