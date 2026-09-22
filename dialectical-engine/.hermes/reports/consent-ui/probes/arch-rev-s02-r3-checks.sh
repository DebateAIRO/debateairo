#!/bin/bash
export LC_ALL=C
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine
P=docs/missions/consent-ui/slices/S02/PLAN.md
G=.hermes/reports/consent-ui/mission-graph-S02.md
echo "grep version: $(grep --version | head -1)"
echo "--- ADR ---"
echo "PLAN ADR-0020-shared-modal-semantics : $(grep -c 'ADR-0020-shared-modal-semantics' $P)"
echo "PLAN ADR-0022-shared-modal-semantics.md : $(grep -c 'ADR-0022-shared-modal-semantics\.md' $P)"
echo "PLAN any ADR-0020 : $(grep -c 'ADR-0020' $P)"
echo "PLAN any ADR-0019 : $(grep -c 'ADR-0019' $P)"
echo "PLAN any ADR-0021 : $(grep -c 'ADR-0021' $P)"
echo "GRAPH ADR-0020-shared : $(grep -c 'ADR-0020-shared-modal-semantics' $G)  ADR-0022 : $(grep -c 'ADR-0022-shared-modal-semantics\.md' $G)"
echo "DECISIONS any ADR-0020 : $(grep -c 'ADR-0020' docs/missions/consent-ui/slices/S02/DECISIONS.md)"
echo "files on disk at any of the four ids:"
ls docs/architecture/01-decisions/ 2>/dev/null | grep -E 'ADR-00(19|20|21|22)' || echo "  none"
echo "--- N6: the qualifier rule, as the author stated it ---"
echo "raw count of :324|:448|:466 in PLAN : $(grep -c ':324\|:448\|:466' $P)"
echo "UNQUALIFIED lines                   : $(grep -n ':324\|:448\|:466' $P | grep -c -v 'reading aid\|pre-edit\|base position\|measured at base\|grep \|printf ')"
echo "discrimination (feed the OLD row text):"
printf 'auth-flow-integration.test.tsx (three inserted lines at :324, :448, :466 and nothing else)\n' | grep ':324\|:448\|:466' | grep -c -v 'reading aid\|pre-edit\|base position\|measured at base\|grep \|printf '
echo "text-anchor count in the C3 row : $(grep -c 'one after each occurrence of `field("adult-affirmed").checked = true;`' $P)"
echo "--- N10: mission graph 'declare' ---"
grep -n -i 'declare' $G
echo "--- frozen SPEC ---"
echo "md5 SPEC.md : $(md5 -q docs/missions/consent-ui/slices/S02/SPEC.md)"
echo "--- structural counts ---"
echo "PLAN lines: $(wc -l < $P) | step headers: $(grep -cE '^- \*\*S02-S[0-9]{2} ' $P) | distinct step ids: $(grep -oE 'S02-S[0-9]{2}' $P | sort -u | wc -l)"
echo "SPEC R-ids: $(grep -cE '^\*\*S02-R[0-9]{2} ' docs/missions/consent-ui/slices/S02/SPEC.md) | PLAN trace rows: $(grep -cE '^\| S02-R[0-9]{2} \|' $P)"
echo "DECISIONS lines: $(wc -l < docs/missions/consent-ui/slices/S02/DECISIONS.md) | REWORK-R2 entries: $(grep -c 'ARCH-S02-REWORK-R2' docs/missions/consent-ui/slices/S02/DECISIONS.md)"
echo "GRAPH lines: $(wc -l < $G)"
