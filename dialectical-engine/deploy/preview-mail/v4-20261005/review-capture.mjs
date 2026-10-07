// Review derivatives only. Transport validates and forwards the untouched original.
import {createHash} from 'node:crypto';
import {ACCOUNT_MAIL_BOUNDARY, singleRecipient} from './account-mail-template.mjs';
const fail=()=>{throw new Error('REVIEW_CAPTURE_FORMAT_OR_PRIVACY_REFUSED');};
const sha=value=>createHash('sha256').update(value).digest('hex');
const utf8=bytes=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return fail();}};
const escapeHtml=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function canonicalParts(message){
 if(!Buffer.isBuffer(message)||message.length===0||message.length>262144)fail();
 const text=utf8(message),at=text.indexOf('\r\n\r\n');
 if(at<0||text.startsWith('\ufeff'))fail();
 const headers=text.slice(0,at),seen=new Map();
 // Canonical producer headers are flat ASCII. Refuse encoded words/folding,
 // rather than silently leave another reversible recipient representation.
 for(const line of headers.split('\r\n')){
  const field=/^([A-Za-z][A-Za-z-]*): ([\x20-\x7e]+)$/.exec(line);
  if(!field||seen.has(field[1].toLowerCase())||/=\?[^?]+\?[bq]\?/i.test(field[2]))fail();
  seen.set(field[1].toLowerCase(),field[2]);
 }
 if(seen.get('mime-version')!=='1.0'||seen.get('content-type')!==`multipart/alternative; boundary="${ACCOUNT_MAIL_BOUNDARY}"`)fail();
 const parts=text.slice(at+4).split('--'+ACCOUNT_MAIL_BOUNDARY);
 if(parts.length!==4||parts[0]!==''||parts[3]!=='--\r\n')fail();
 const alternatives=['plain','html'].map((kind,index)=>{
  const prefix=`\r\nContent-Type: text/${kind}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  const part=parts[index+1];if(!part.startsWith(prefix)||!part.endsWith('\r\n'))fail();
  const encoded=part.slice(prefix.length,-2).replaceAll('\r\n','');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)||encoded.length===0)fail();
  const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)fail();
  return {kind,prefix,text:utf8(bytes)};
 });
 return {headers,alternatives};
}
function unescapeProducerHtml(text){
 return text.replace(/&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-f]+|\d+));/gi,entity=>{
  const value=entity.slice(1,-1).toLowerCase(),named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(Object.hasOwn(named,value))return named[value];
  const number=value.startsWith('#x')?parseInt(value.slice(2),16):Number(value.slice(1));
  return Number.isInteger(number)&&number>=0&&number<=0x10ffff?String.fromCodePoint(number):fail();
 });
}
export function assertReviewCapturePrivacy(message,recipientDigests){
 const {headers,alternatives}=canonicalParts(message),forbidden=new Set(recipientDigests);
 if([...forbidden].some(x=>typeof x!=='string'||!/^[0-9a-f]{64}$/.test(x)))fail();
 const surfaces=[headers,...alternatives.map(x=>x.kind==='html'?unescapeProducerHtml(x.text):x.text)];
 for(const text of surfaces)for(const match of text.matchAll(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g))if(forbidden.has(sha(match[0])))fail();
}
export function redactReviewCapture(message,aliases){
 const {headers,alternatives}=canonicalParts(message),pairs=Object.entries(aliases);
 if(pairs.length===0||pairs.some(([alias,recipient])=>!/^[a-z0-9-]+$/.test(alias)||!singleRecipient(recipient)))fail();
 const replace=text=>{
  for(const [alias,recipient] of pairs){const synthetic=alias+'@fixture.invalid';text=text.replaceAll(escapeHtml(recipient),synthetic).replaceAll(recipient,synthetic);}
  return text;
 };
 const encoded=alternatives.map(part=>{
  const base64=Buffer.from(replace(part.text),'utf8').toString('base64').match(/.{1,76}/g).join('\r\n');
  return '--'+ACCOUNT_MAIL_BOUNDARY+part.prefix+base64+'\r\n';
 }).join('');
 const derivative=Buffer.from(replace(headers)+'\r\n\r\n'+encoded+'--'+ACCOUNT_MAIL_BOUNDARY+'--\r\n');
 assertReviewCapturePrivacy(derivative,pairs.map(([,recipient])=>sha(recipient)));
 return derivative;
}
