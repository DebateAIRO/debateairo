import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="    event.preventDefault();\n    /* The helper returns focus"
new="    /* CODE-REV-S02-C9 own mutant: preventDefault dropped */\n    /* The helper returns focus"
assert s.count(old)==1
open(p,'w',encoding='utf-8').write(s.replace(old,new))
