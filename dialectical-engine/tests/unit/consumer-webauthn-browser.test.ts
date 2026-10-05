import {expect,it,vi} from "vitest";
import {createConsumerWebAuthnBrowser} from "../../apps/ui/lib/consumerWebAuthn.js";
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
