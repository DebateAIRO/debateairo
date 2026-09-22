import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="\n    input.focus();\n"; new="\n    /* CODE-REV-S02-C9 own mutant: focus never set */\n"
assert s.count(old)==1
open(p,'w',encoding='utf-8').write(s.replace(old,new))
