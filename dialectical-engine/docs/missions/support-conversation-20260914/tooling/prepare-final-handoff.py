"""Prepare final product or operational review only from a complete passing actual run."""
import runpy,sys
from pathlib import Path
x=runpy.run_path(str(Path(__file__).with_name('resume-admin.py')));globals().update({k:v for k,v in x.items() if not k.startswith('__')})
node=sys.argv[1];assert node in ['GUIDE_PRODUCT','GUIDE_TESTABILITY5'];revision='152eed4da1cd3e66b74d8301159ba76427552409'
parents=['GUIDE_LOCK_HANDOFF_FIX','GUIDE_CORRECTNESS9','GUIDE_SECURITY9','GUIDE_HARNESS_BIND16','GUIDE_HARNESS_REVIEW16','GUIDE_RUNTIME6','GUIDE_COMPACT_UI_PROBE6','GUIDE_LIVE8']
files=[D/'INSTRUCTIONS.md',D/'OWNER-PUBLIC-GUIDE-20260917.md',D/'OWNER-RESUME-20260917.md',D/'slices/CP1/SPEC-v5.md',D/'slices/CP1/MENU-COVERAGE-v2.json',E/'GATE_GUIDE_FINAL9-manifest.json']
if node=='GUIDE_TESTABILITY5':parents+=['GUIDE_PRODUCT']
for parent in parents:
 receipt=E/(parent+'-receipt.json');r=read(receipt);assert read(E/(parent+'-consumption.json'))['receipt']['sha256']==sha(receipt)
 assert receipt_revision(r)==revision
 if parent!='GUIDE_LOCK_HANDOFF_FIX':assert r['verdict'].startswith('PASS'),(parent,r['verdict'])
 files.extend([receipt,E/(parent+'-consumption.json')]);files.extend(Path(a['path']) for a in verify(r['artifacts']))
for parent in ['GUIDE_EDITORIAL','GUIDE_EDITORIAL_RECHECK','GUIDE_ATTEST']:
 receipt=E/(parent+'-receipt.json');files.append(receipt);files.extend(Path(a['path']) for a in verify(read(receipt)['artifacts']))
actual=E/'GUIDE_LIVE_GUIDE16-actual-receipt.json';assert actual.is_file();files.append(actual)
files=list(dict.fromkeys(files));inp=E/(node+'-inputs.json');assert not inp.exists();write(inp,{'revision':revision,'inputs':[rec(p) for p in files]})
packet=P/(node+'.md');s=packet.read_text()
s=s.replace('0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13',revision).replace('support-cp1-p3-product/dialectical-engine','support-conversation-cp1/dialectical-engine').replace('exact clean detached revision','exact clean read-only primary revision').replace('LIVE6','LIVE8').replace('technical7','technical9').replace('reviewed FIX9 capacity reader','reviewed BIND16 capacity reader').replace('current owned LIVE8 supervisor identity','current owned RUNTIME6 supervisor identity')
packet.write_text(s)
run(['zsh',str(S/'.claude/skills/heartbeat-orchestrator/scripts/packet-check.sh'),str(packet)])
commit=freeze(node,[D/'board-ids.json',D/'tooling/resume-admin.py',Path(__file__).resolve(),packet,inp,O/'LEDGER.md']+files,revision)
seat='/root/baseline' if node=='GUIDE_PRODUCT' else '/root/preview'
dispatch(node,seat,commit,node=='GUIDE_TESTABILITY5',revision,heavy_scope='one read-only lifecycle, ordinary TLS and manual-script counts-only capacity frame; zero Support/model traffic')
