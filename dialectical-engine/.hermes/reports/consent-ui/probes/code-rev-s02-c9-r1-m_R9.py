import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="\n    input.focus();\n"; new="\n    if (event.target === input) input.focus();\n"
assert s.count(old)==1, s.count(old)
open(p,'w',encoding='utf-8').write(s.replace(old,new))
