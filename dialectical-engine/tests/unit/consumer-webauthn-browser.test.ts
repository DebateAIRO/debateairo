import {expect,it,vi} from "vitest";
import {createConsumerWebAuthnBrowser,registerConsumerPasskey} from "../../apps/ui/lib/consumerWebAuthn.js";
import {namePasskeysForAccount,renameConsumerPasskeys} from "../../apps/ui/lib/passkeyNames.js";
it("requires UV, converts binary, supports conditional, and forwards abort signal",async()=>{const get=vi.fn().mockResolvedValue(null),available=vi.fn().mockResolvedValue(true);vi.stubGlobal("navigator",{credentials:{get}});vi.stubGlobal("PublicKeyCredential",{isConditionalMediationAvailable:available});try{const browser=createConsumerWebAuthnBrowser();expect(await browser.supportsConditional()).toBe(true);const abort=new AbortController();await expect(browser.authenticate({challenge:"a".repeat(43),rpId:"test.invalid",userVerification:"required"},{mediation:"conditional",signal:abort.signal})).rejects.toThrow();expect(get.mock.calls[0]![0]).toMatchObject({mediation:"conditional",publicKey:{userVerification:"required",challenge:expect.any(Uint8Array)}});expect(get.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);browser.cancel();expect(get.mock.calls[0]![0].signal.aborted).toBe(true);}finally{vi.unstubAllGlobals();}});

const buffer=(...bytes:number[])=>Uint8Array.from(bytes).buffer;
const authenticationOptions={challenge:'a'.repeat(43),rpId:'test.invalid',userVerification:'required'} as const;
const registrationOptions={challenge:'a'.repeat(43),rp:{id:'test.invalid',name:'Test'},user:{id:'AQI',name:'person@example.test',displayName:'Person'},pubKeyCredParams:[{type:'public-key' as const,alg:-7}],authenticatorSelection:{userVerification:'required' as const}};

it('serializes valid assertion and registration responses while omitting a null userHandle',async()=>{
 const assertion={id:'credential-id',rawId:buffer(1,2),type:'public-key',response:{clientDataJSON:buffer(3),authenticatorData:buffer(4),signature:buffer(5),userHandle:null},getClientExtensionResults:()=>({}),authenticatorAttachment:'platform'};
 const registration={id:'credential-id',rawId:buffer(6),type:'public-key',response:{clientDataJSON:buffer(7),attestationObject:buffer(8),getTransports:()=>['internal']},getClientExtensionResults:()=>({credProps:{rk:true}}),authenticatorAttachment:'platform'};
 const get=vi.fn().mockResolvedValue(assertion),create=vi.fn().mockResolvedValue(registration);vi.stubGlobal('navigator',{credentials:{get,create}});
 try{
  const browser=createConsumerWebAuthnBrowser();
  await expect(browser.authenticate(authenticationOptions)).resolves.toEqual({id:'credential-id',rawId:'AQI',type:'public-key',response:{clientDataJSON:'Aw',authenticatorData:'BA',signature:'BQ'},clientExtensionResults:{},authenticatorAttachment:'platform'});
  await expect(browser.register(registrationOptions)).resolves.toEqual({id:'credential-id',rawId:'Bg',type:'public-key',response:{clientDataJSON:'Bw',attestationObject:'CA',transports:['internal']},clientExtensionResults:{credProps:{rk:true}},authenticatorAttachment:'platform'});
 }finally{vi.unstubAllGlobals();}
});

it('rejects an oversized browser response before it crosses the contract boundary',async()=>{
 const get=vi.fn().mockResolvedValue({id:'credential-id',rawId:new ArrayBuffer(32769),type:'public-key',response:{clientDataJSON:buffer(1),authenticatorData:buffer(2),signature:buffer(3),userHandle:null},getClientExtensionResults:()=>({})});vi.stubGlobal('navigator',{credentials:{get}});
 try{await expect(createConsumerWebAuthnBrowser().authenticate(authenticationOptions)).rejects.toThrow('PASSKEY_RESPONSE_TOO_LARGE');}
 finally{vi.unstubAllGlobals();}
});

// The server's options carry a placeholder name; the account's email replaces it in what the browser keeps, and the
// user id stays the server's handle.
const registration=()=>({id:'credential-id',rawId:buffer(6),type:'public-key',response:{clientDataJSON:buffer(7),attestationObject:buffer(8)},getClientExtensionResults:()=>({})});
it('names a new passkey with the account label and leaves the user id untouched',async()=>{
 const create=vi.fn().mockResolvedValue(registration());vi.stubGlobal('navigator',{credentials:{create}});
 try{
  await createConsumerWebAuthnBrowser().register(registrationOptions,undefined,' person@example.com ');
  const user=create.mock.calls[0]![0].publicKey.user;
  expect(user.name).toBe('person@example.com');
  expect(user.displayName).toBe('person@example.com');
  expect([...user.id]).toEqual([1,2]);
  await registerConsumerPasskey(registrationOptions,'other@example.com');
  expect(create.mock.calls[1]![0].publicKey.user).toMatchObject({name:'other@example.com',displayName:'other@example.com'});
 }finally{vi.unstubAllGlobals();}
});
it('keeps the server name when no usable label is given',async()=>{
 const create=vi.fn().mockResolvedValue(registration());vi.stubGlobal('navigator',{credentials:{create}});
 try{
  const browser=createConsumerWebAuthnBrowser();
  await browser.register(registrationOptions);
  await browser.register(registrationOptions,undefined,'   ');
  await browser.register(registrationOptions,undefined,'x'.repeat(255));
  for(const call of create.mock.calls)expect(call[0].publicKey.user).toMatchObject({name:'person@example.test',displayName:'Person'});
  await registerConsumerPasskey(registrationOptions);
  expect(create.mock.calls[3]![0].publicKey.user).toMatchObject({name:'person@example.test',displayName:'Person'});
 }finally{vi.unstubAllGlobals();}
});

// Renaming passkeys the browser already holds (the WebAuthn Signal API): only where the browser has it, never throwing.
it('the rename does nothing, reads nothing and never throws where the browser cannot rename passkeys',async()=>{
 const readAccountEmail=vi.fn().mockResolvedValue({email:'person@example.com'});
 await expect(renameConsumerPasskeys({userHandle:'AQI',name:'person@example.com'})).resolves.toBe(false);
 expect(namePasskeysForAccount({readAccountEmail},'AQI')).toBeNull();
 vi.stubGlobal('PublicKeyCredential',{isConditionalMediationAvailable:vi.fn()});
 try{
  await expect(renameConsumerPasskeys({userHandle:'AQI',name:'person@example.com'})).resolves.toBe(false);
  expect(namePasskeysForAccount({readAccountEmail},'AQI')).toBeNull();
  expect(readAccountEmail).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
it('the rename gives the browser the site, the user handle and the email, and swallows a browser refusal',async()=>{
 const signalCurrentUserDetails=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('PublicKeyCredential',{signalCurrentUserDetails});vi.stubGlobal('window',{location:{hostname:'dezbatere.test'}});
 try{
  await expect(renameConsumerPasskeys({userHandle:'AQI',name:'person@example.com'})).resolves.toBe(true);
  expect(signalCurrentUserDetails).toHaveBeenCalledWith({rpId:'dezbatere.test',userId:'AQI',name:'person@example.com',displayName:'person@example.com'});
  signalCurrentUserDetails.mockRejectedValueOnce(new DOMException('no','SecurityError'));
  await expect(renameConsumerPasskeys({userHandle:'AQI',name:'person@example.com'})).resolves.toBe(false);
  signalCurrentUserDetails.mockImplementationOnce(()=>{throw new TypeError('sync');});
  await expect(renameConsumerPasskeys({userHandle:'AQI',name:'person@example.com'})).resolves.toBe(false);
  await expect(renameConsumerPasskeys({userHandle:'',name:'person@example.com'})).resolves.toBe(false);
  await expect(renameConsumerPasskeys({userHandle:'AQI',name:' '})).resolves.toBe(false);
  expect(signalCurrentUserDetails).toHaveBeenCalledTimes(3);
 }finally{vi.unstubAllGlobals();}
});
it('after a sign-in the account email names the passkeys, and a slow or failed read never holds the sign-in up',async()=>{
 const signalCurrentUserDetails=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('PublicKeyCredential',{signalCurrentUserDetails});vi.stubGlobal('window',{location:{hostname:'dezbatere.test'}});
 try{
  await namePasskeysForAccount({readAccountEmail:vi.fn().mockResolvedValue({email:'person@example.com'})},'AQI');
  expect(signalCurrentUserDetails).toHaveBeenCalledWith({rpId:'dezbatere.test',userId:'AQI',name:'person@example.com',displayName:'person@example.com'});
  await expect(namePasskeysForAccount({readAccountEmail:vi.fn().mockRejectedValue(new Error('PRIVATE'))},'AQI')).resolves.toBeUndefined();
  const started=Date.now();
  await expect(namePasskeysForAccount({readAccountEmail:()=>new Promise(()=>{})},'AQI',20)).resolves.toBeUndefined();
  expect(Date.now()-started).toBeLessThan(1000);
  expect(namePasskeysForAccount({readAccountEmail:vi.fn()},undefined)).toBeNull();
  expect(namePasskeysForAccount({},'AQI')).toBeNull();
  expect(signalCurrentUserDetails).toHaveBeenCalledTimes(1);
 }finally{vi.unstubAllGlobals();}
});
