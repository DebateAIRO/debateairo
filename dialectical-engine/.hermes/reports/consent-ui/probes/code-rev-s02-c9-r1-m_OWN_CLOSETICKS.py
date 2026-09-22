import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="    setPrivacyAccepted(privacyInputRef.current?.checked ?? false);"
new="    setPrivacyAccepted(true); /* CODE-REV-S02-C9 own mutant: check the box on close */"
assert s.count(old)==1
open(p,'w',encoding='utf-8').write(s.replace(old,new))
