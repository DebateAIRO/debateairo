#!/bin/bash
set -u
cd "$1" || exit 97
CLASSES=$(grep -oE 'className="[^"]+"' apps/ui/components/consent/PrivacyPolicyModal.tsx | sed 's/className="//; s/"//' | tr ' ' '\n' | sort -u)
echo "class names in PrivacyPolicyModal.tsx: $(printf '%s\n' "$CLASSES" | wc -l | tr -d ' ')"
styled=0; unstyled=0
for c in $CLASSES; do
  if grep -qE "\.${c}[^A-Za-z0-9_-]" apps/ui/app/globals.css; then
    echo "  STYLED   $c"; styled=$((styled+1))
  else
    unstyled=$((unstyled+1))
  fi
done
echo "styled at HEAD: $styled   NOT styled (C8's list): $unstyled"
printf '%s\n' "$CLASSES" | tr '\n' ' '; echo
