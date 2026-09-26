from pathlib import Path
import subprocess,json
OUT=Path(__file__).resolve().parent
readme=Path('deploy/vps/README.md').read_bytes();before=(OUT/'before-README.md').read_bytes()
a=before.splitlines(keepends=True);b=readme.splitlines(keepends=True)
assert len(a)==len(b)
changed=[i+1 for i,(old,new) in enumerate(zip(a,b)) if old!=new]
assert changed==[1021,1040],changed
assert a[1039].split(b'|')[0:2]==b[1039].split(b'|')[0:2]
assert a[1039].split(b'|')[3:]==b[1039].split(b'|')[3:]
assert b[1020].startswith(a[1020].rstrip(b'\n')+b' ')
current=Path('tests/unit/v9-provider-credential-files.test.ts').read_text()
for case in json.loads((OUT/'new-cases.json').read_text()):
 assert current.count(case)==1;current=current.replace(case,'',1)
assert current==(OUT/'before-v9-provider-credential-files.test.ts').read_text()
paths=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
assert set(paths)=={'dialectical-engine/deploy/vps/README.md','dialectical-engine/tests/unit/v9-provider-credential-files.test.ts'},paths
print('README changed lines:',changed,'; one Meaning cell + one appended sentence')
print('Test diff: exactly two inserted cases; original 31 cases and helpers byte-identical')
print('Changed paths:',paths)
subprocess.run(['git','diff','--check'],check=True)
