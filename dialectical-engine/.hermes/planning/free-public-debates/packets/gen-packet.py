#!/usr/bin/env python3
"""gen-packet.py <TEMPLATE> <OUT> KEY=VALUE…  — fill a heartbeat packet template for mission free-public-debates.
Mission-wide markers are computed here (never typed per packet); per-node markers come from argv. An optional
file named by CHARGES=<path> is appended verbatim under '### Charges'."""
import sys, pathlib
A="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine"
M="free-public-debates"
base={"__MISSION_ROOT__":f"{A}/docs/missions/{M}","__PACKET_DIR__":f"{A}/.hermes/planning/{M}/packets",
      "__REPORTS__":f"{A}/.hermes/reports/{M}","__SLICE_TICKET__":"t_2e15bf90","__MISSION__":M}
tpl,out,*kv=sys.argv[1:]
rep=dict(x.split("=",1) for x in kv); charges=rep.pop("CHARGES",None)
s=pathlib.Path(f"{A}/.claude/skills/heartbeat-orchestrator/templates/{tpl}.md").read_text()
for k,v in rep.items(): s=s.replace(f"__{k}__",v)
for k,v in base.items(): s=s.replace(k,v)
if charges: s+="\n### Charges\n"+pathlib.Path(charges).read_text()
pathlib.Path(out).write_text(s); print("wrote",out)
