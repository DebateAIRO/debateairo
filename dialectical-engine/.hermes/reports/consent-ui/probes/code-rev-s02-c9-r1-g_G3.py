import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
m='/* === end consent-ui S01 === */'
extra='\n/* === consent-ui S02 === */\n.c9revSecond { color: var(--ink); }\n/* === end consent-ui S02 === */'
open(p,'w',encoding='utf-8').write(s.replace(m, m+extra,1))
