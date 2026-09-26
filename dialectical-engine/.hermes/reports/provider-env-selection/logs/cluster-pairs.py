#!/usr/bin/env python3
"""cluster-pairs.py <S> — prints one line per cluster of slice <S>: "<Cn> <suite:passed:failed> …", read from PLAN.md §3 in every shape
this mission's plans use: a bold row `| **S03-C1** |` or a plain row `| S01-C1 |` carrying `run-suites.sh`/`$RS` pairs inline, or a
`<S>-<Cn> command (EXACT):` fenced block after the table (S02-C1). The row a cluster's command lives in is the cluster's OWN row."""
import sys,re,pathlib
S=sys.argv[1]
M="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection"
P=pathlib.Path(f"{M}/slices/{S}/PLAN.md").read_text().splitlines()
h3=next(i for i,l in enumerate(P) if l.startswith("## 3."))
h4=next(i for i,l in enumerate(P) if l.startswith("## 4."))
row_re=re.compile(rf"^\| (?:\*\*)?({S}-(C\d+))(?:\*\*)?[ |]")
pair_re=re.compile(r"[\w./-]+:\d+:\d+")
seen=[]
for i in range(h3,h4):
    m=row_re.match(P[i])
    if not m or m.group(2) in [c for c,_ in seen]: continue
    cn=m.group(2); inl=re.search(r"(?:run-suites\.sh|\$RS) ((?:\S+:\d+:\d+\s*)+)",P[i])
    if inl: pairs=pair_re.findall(inl.group(1))
    else:
        k=next((j for j in range(h3,h4) if P[j].strip().startswith(f"{S}-{cn} command")),None)
        if k is None: sys.exit(f"no command for {S}-{cn}")
        txt="\n".join(P[k:k+20]); a=txt.find("```"); b=txt.find("```",a+3)
        pairs=pair_re.findall(txt[a:b])
    if not pairs: sys.exit(f"no pairs for {S}-{cn}")
    seen.append((cn," ".join(pairs)))
for cn,pairs in seen: print(cn,pairs)
