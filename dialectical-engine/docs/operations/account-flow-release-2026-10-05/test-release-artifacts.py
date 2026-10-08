"""Owned local metadata/public-artifact regressions; never prints decoded recipients."""
import email.policy, email.parser, hashlib, html, json, os, pathlib, re, socket, subprocess, tempfile, unittest
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
MAIL=ROOT/'deploy/preview-mail/v4-20261005'
sha=lambda b:hashlib.sha256(b).hexdigest()
class ReleaseArtifacts(unittest.TestCase):
 def test_all_52_capture_headers_and_decoded_alternatives_exclude_recipient_digests(self):
  bindings=json.loads((MAIL/'recipient-bindings.json').read_text())['recipientSha256']
  private=set(bindings.values()); manifest=json.loads((MAIL/'review-captures/capture-manifest.json').read_text()); rows=manifest['receipts']
  self.assertEqual(len(rows),52);self.assertEqual(sum(r['allowed'] for r in rows),23)
  address=re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
  affected=[]
  for row in rows:
   name=row['template']+'--'+row['alias']+'.redacted.eml';raw=(MAIL/'review-captures'/name).read_bytes()
   self.assertEqual(sha(raw),row['redactedSha256'],name)
   message=email.parser.BytesParser(policy=email.policy.default).parsebytes(raw)
   self.assertFalse(message.defects,name);self.assertEqual(message.get_content_type(),'multipart/alternative',name)
   parts=list(message.iter_parts());self.assertEqual([p.get_content_type() for p in parts],['text/plain','text/html'],name)
   surfaces=['\n'.join(str(v) for _,v in message.items())]
   for part in parts:
    self.assertFalse(part.defects,name);self.assertEqual(part['Content-Transfer-Encoding'],'base64',name)
    self.assertEqual(part.get_content_charset(),'utf-8',name);surfaces.append(html.unescape(part.get_payload(decode=True).decode('utf8')))
   matches=sum(sha(a.encode()) in private for text in surfaces for a in address.findall(text))
   if matches:affected.append((row['template'],row['alias'],matches))
  self.assertEqual(len(affected),0,'installed-recipient digest matches in symbolic captures: '+repr(affected))
 def probe(self,root,*args):
  run=subprocess.run(['python3',str(HERE/'probe-public-profile.py'),'--source-root',str(root),'--manifest',str(root/'manifest.json'),*args],capture_output=True,text=True,timeout=10)
  data=json.loads(run.stdout);return run.returncode,{x['name']:x['status'] for x in data['checks']}
 def test_socket_requires_complete_expected_owner_and_group(self):
  with tempfile.TemporaryDirectory(prefix='task13-custody-',dir='/private/tmp') as directory:
   root=pathlib.Path(directory);(root/'manifest.json').write_text('{"sourceFiles":{}}');path=root/'relay.sock'
   with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
    sock.bind(str(path));path.chmod(0o660);actual_gid=path.stat().st_gid
    cases=[('missing-group',['--relay-uid',str(os.getuid())],1,'FAIL'),('wrong-group',['--relay-uid',str(os.getuid()),'--client-gid',str(actual_gid+1)],1,'FAIL'),('correct-owner-group',['--relay-uid',str(os.getuid()),'--client-gid',str(actual_gid)],0,'PASS'),('missing-owner',['--client-gid',str(actual_gid)],1,'FAIL'),('wrong-owner',['--relay-uid',str(os.getuid()+1),'--client-gid',str(actual_gid)],1,'FAIL')]
    for label,arguments,code,status in cases:
     with self.subTest(label=label):
      actual,checks=self.probe(root,'--socket',str(path),*arguments);self.assertEqual((actual,checks['relay-socket']),(code,status))
 def test_socket_mode_type_symlink_and_source_only_remain_distinct(self):
  with tempfile.TemporaryDirectory(prefix='task13-custody-',dir='/private/tmp') as directory:
   root=pathlib.Path(directory);(root/'manifest.json').write_text('{"sourceFiles":{}}');path=root/'relay.sock'
   with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
    sock.bind(str(path));path.chmod(0o600);ids=['--relay-uid',str(os.getuid()),'--client-gid',str(path.stat().st_gid)]
    code,checks=self.probe(root,'--socket',str(path),*ids);self.assertEqual((code,checks['relay-socket']),(1,'FAIL'))
    path.chmod(0o660);link=root/'link';link.symlink_to(path)
    code,checks=self.probe(root,'--socket',str(link),*ids);self.assertEqual((code,checks['relay-socket']),(1,'FAIL'))
    regular=root/'regular';regular.write_bytes(b'owned-synthetic-metadata-only');regular.chmod(0o660)
    code,checks=self.probe(root,'--socket',str(regular),*ids);self.assertEqual((code,checks['relay-socket']),(1,'FAIL'))
   code,checks=self.probe(root);self.assertEqual(code,0);self.assertEqual(checks,{'relay-socket':'NOT_OBSERVED','credential-metadata':'NOT_OBSERVED'})
   regular.chmod(0o400)
   code,checks=self.probe(root,'--credential-file',str(regular),'--credential-owner-uid',str(os.getuid()));self.assertEqual((code,checks['credential-metadata']),(0,'PASS'))
 def test_all_70_candidate_transforms_keep_every_identity_literal_and_no_product_residual(self):
  inventory=json.loads((HERE/'legal-brand-inventory.json').read_text());self.assertEqual(len(inventory['entries']),140);self.assertTrue(all(sha((ROOT/e['path']).read_bytes())==e['sha256'] for e in inventory['entries']));entries=[e for e in inventory['entries'] if e['path'].startswith('apps/ui/legal/')];self.assertEqual(len(entries),70)
  hashes={e['path']:e for e in json.loads((HERE/'legal-brand-candidate-hashes.json').read_text())};self.assertEqual(set(hashes),{e['path'] for e in entries})
  before={e['path']:(ROOT/e['path']).read_bytes() for e in entries};self.assertTrue(all(sha(before[e['path']])==e['sha256']==hashes[e['path']]['currentSha256'] for e in entries))
  with tempfile.TemporaryDirectory(prefix='task13-legal-candidate-',dir='/private/tmp') as directory:
   root=pathlib.Path(directory)
   for name,data in before.items():p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   run=subprocess.run(['patch','--batch','--forward','-p1','-d',str(root),'-i',str(HERE/'legal-brand-candidate.patch')],capture_output=True,text=True,timeout=10);self.assertEqual(run.returncode,0,'candidate patch did not apply to exact public inventory')
   residual={}
   for name,raw in before.items():
    original=raw.decode();candidate=(root/name).read_text();self.assertEqual(sha(candidate.encode()),hashes[name]['brandCandidateSha256'],name)
    self.assertEqual(candidate.count('DebateAIRO'),original.count('DebateAIRO'),name)
    self.assertEqual(candidate.count('DebateAIRO S.R.L.'),original.count('DebateAIRO S.R.L.'),name)
    self.assertEqual(candidate.replace('Dialectical Engine','DebateAI'),original,name)
    count=candidate.count('DebateAI')-candidate.count('DebateAIRO')
    if count:residual[name]=count
   self.assertEqual(residual,{},'draft retains product mentions beside native-script particles')
  self.assertTrue(all((ROOT/name).read_bytes()==raw for name,raw in before.items()),'canonical notices changed')
if __name__=='__main__':unittest.main(verbosity=2)
