#!/bin/bash
# CODE-REV-S02-C5C6 r1 — does the COMPONENT-LEVEL prop pin discriminate?
set -u
LANE="$1"; cd "$LANE" || exit 97
F=apps/ui/components/consent/PrivacyPolicyModal.tsx
BASE=$(md5 -q "$F")
tc() { ( cd apps/ui && npx tsc --noEmit -p tsconfig.json > /tmp/pt.txt 2>&1; echo "exit=$? diagnostics=$(grep -c 'error TS' /tmp/pt.txt)" ); }
try() {
  label="$1"; old="$2"; new="$3"
  python3 .review-scratch/mutate.py "$F" "$old" "$new" >/dev/null || { echo "$label | ANCHOR MISS"; return; }
  r=$(tc); git checkout HEAD -- "$F"
  [ "$BASE" = "$(md5 -q "$F")" ] || { echo "$label | RESTORE FAILED"; exit 5; }
  case "$r" in *"exit=0"*) v=SURVIVED;; *) v=CAUGHT;; esac
  echo "$label | $v | $r"
}
echo "unmutated baseline: $(tc)"
try "MT1' fifth REQUIRED member"  '  onAcknowledge?: () => void;
};' '  onAcknowledge?: () => void;
  downloadPdf: () => void;
};'
try "MT2' fifth OPTIONAL member"  '  onAcknowledge?: () => void;
};' '  onAcknowledge?: () => void;
  downloadPdf?: () => void;
};'
try "MT3' onAcknowledge REQUIRED" '  onAcknowledge?: () => void;
};' '  onAcknowledge: () => void;
};'
try "MT4' member RENAMED"         '  onClose: () => void;
  onAcknowledge?: () => void;
};' '  onDismiss: () => void;
  onAcknowledge?: () => void;
};'
echo "--- CONTROL: delete BOTH component-level pins, then re-run MT2' ---"
python3 .review-scratch/mutate.py "$F" 'type _PropShapeIsExact = Expect<' 'type _Unused_PropShapeIsExact = unknown; type _Ignore1 = Expect<' >/dev/null
python3 .review-scratch/mutate.py "$F" 'type _PropKeysAreExact = Expect<' 'type _Unused_PropKeysAreExact = unknown; type _Ignore2 = Expect<' >/dev/null
echo "  (pins still present under other names — that is not a removal; removing them properly:)"
git checkout HEAD -- "$F"
python3 - <<'PY'
import pathlib,re
p=pathlib.Path("apps/ui/components/consent/PrivacyPolicyModal.tsx")
s=p.read_text(encoding="utf8")
s=re.sub(r"type Exact<.*?\n>;\n", "", s, flags=re.S)
p.write_text(s,encoding="utf8")
PY
echo "  pins removed? Exact<= $(grep -c 'type Exact<' apps/ui/components/consent/PrivacyPolicyModal.tsx)  _PropShapeIsExact= $(grep -c '_PropShapeIsExact' apps/ui/components/consent/PrivacyPolicyModal.tsx)"
python3 .review-scratch/mutate.py "$F" '  onAcknowledge?: () => void;
};' '  onAcknowledge?: () => void;
  downloadPdf?: () => void;
};' >/dev/null
echo "  MT2' with the pins removed: $(tc)"
git checkout HEAD -- "$F"
[ "$BASE" = "$(md5 -q "$F")" ] && echo "RESTORED to HEAD"
