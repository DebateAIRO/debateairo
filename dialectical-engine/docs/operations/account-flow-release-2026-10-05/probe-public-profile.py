#!/usr/bin/env python3
"""Read-only public source and custody metadata probe. Never reads credential bytes.
An exit-zero result covers only the named checks, not installation, Siteverify,
provider access, hardware approval, inbox delivery, or release authorization.
"""
import argparse,hashlib,json,os,pathlib,stat,sys
p=argparse.ArgumentParser();p.add_argument('--source-root',required=True);p.add_argument('--manifest',required=True);p.add_argument('--socket');p.add_argument('--credential-file');p.add_argument('--relay-uid',type=int);p.add_argument('--client-gid',type=int);p.add_argument('--credential-owner-uid',type=int)
a=p.parse_args();root=pathlib.Path(a.source_root).resolve();manifest=json.loads(pathlib.Path(a.manifest).read_text());checks=[]
def check(name,ok,**details):checks.append(dict(name=name,status='PASS' if ok else 'FAIL',**details))
for relative,expected in manifest['sourceFiles'].items():
 rel=pathlib.PurePosixPath(relative)
 if rel.is_absolute() or '..' in rel.parts or rel.suffix not in ['.ts','.tsx','.mjs','.sql','.json','.service']:
  check('source:'+relative,False,reason='UNSAFE_PUBLIC_MANIFEST_PATH');continue
 f=root/relative
 try:
  m=f.lstat();safe=stat.S_ISREG(m.st_mode) and not f.is_symlink() and f.resolve().is_relative_to(root) and m.st_size<8*1024*1024
  digest=hashlib.sha256(f.read_bytes()).hexdigest() if safe else None
  check('source:'+relative,safe and digest==expected,observedSha256=digest)
 except OSError:check('source:'+relative,False,reason='MISSING_OR_UNREADABLE')
for kind,name,uid,gid,mode in [('relay-socket',a.socket,a.relay_uid,a.client_gid,0o660),('credential-metadata',a.credential_file,a.credential_owner_uid,None,0o400)]:
 if name is None:
  checks.append(dict(name=kind,status='NOT_OBSERVED'));continue
 if uid is None or (kind=='relay-socket' and gid is None):
  check(kind,False,reason='EXPECTED_CUSTODY_IDENTITY_REQUIRED');continue
 try:
  f=pathlib.Path(name);m=f.lstat();ancestors=all(not x.is_symlink() for x in f.parents)
  proper=stat.S_ISSOCK(m.st_mode) if kind=='relay-socket' else stat.S_ISREG(m.st_mode)
  check(kind,ancestors and proper and uid is not None and m.st_uid==uid and (gid is None or m.st_gid==gid) and stat.S_IMODE(m.st_mode)==mode,uid=m.st_uid,gid=m.st_gid,mode=oct(stat.S_IMODE(m.st_mode)))
 except OSError:check(kind,False,reason='MISSING_OR_UNREADABLE_METADATA')
print(json.dumps(dict(schema='account-flow-public-profile-probe-v1',sourceRoot=str(root),checks=checks,scope='PUBLIC_SOURCE_AND_EXPLICIT_CUSTODY_METADATA_ONLY',externalObservations='REQUIRED_SEPARATELY'),indent=2))
sys.exit(1 if any(c['status']=='FAIL' for c in checks) else 0)
