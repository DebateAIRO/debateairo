import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="      if (event.target !== input) input.click();\n"; new="      input.click();\n"
assert s.count(old)==1
open(p,'w',encoding='utf-8').write(s.replace(old,new))
