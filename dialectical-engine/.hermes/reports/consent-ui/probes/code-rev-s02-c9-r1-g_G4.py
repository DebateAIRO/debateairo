import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
m='/* === end consent-ui S02 === */'
open(p,'w',encoding='utf-8').write(s.replace(m,'.c9revInsideS02 { color: var(--ink); }\n'+m,1))
