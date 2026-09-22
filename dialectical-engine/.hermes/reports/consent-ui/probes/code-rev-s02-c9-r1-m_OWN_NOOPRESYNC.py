import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="      if (box !== null) box.checked = false;"
new="      if (box !== null) { /* CODE-REV-S02-C9 own mutant: block kept, resync removed */ }"
assert s.count(old)==1
open(p,'w',encoding='utf-8').write(s.replace(old,new))
