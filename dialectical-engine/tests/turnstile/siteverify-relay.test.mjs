import assert from "node:assert/strict";
import test from "node:test";
import { createServer, request } from "node:http";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createSiteverifyRelay, fixedSiteverify, loadRelaySecret, relayConfiguration } from "../../deploy/turnstile/siteverify-relay.mjs";
const secret = "1x0000000000000000000000000000000AA";
const response = { success: true, hostname: "v3-preview.dezbatere.ro", action: "signup", challenge_ts: new Date().toISOString(), "error-codes": [] };
async function fixture(t, siteverify = async () => response) {
  const dir = await mkdtemp(join(tmpdir(), "ts-relay-")); const socketPath = join(dir,"worker.sock");
  const server = createSiteverifyRelay({ secret, publicAppUrl: "https://v3-preview.dezbatere.ro", siteverify });
  await new Promise(resolve => server.listen(socketPath, resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir,{recursive:true,force:true}); });
  async function call(payload, path = "/siteverify") { return new Promise((resolve,reject) => {
    const req = request({ socketPath, method:"POST",path,headers:{"content-type":"application/json"} }, res => { let text=""; res.on("data",chunk=>text+=chunk); res.on("end",()=>resolve({status:res.statusCode,body:JSON.parse(text)})); }); req.on("error",reject); req.end(JSON.stringify(payload));
  }); } return call;
}
test("relay rejects caller URL, secret, hostname, remote IP and metadata before fixed transport", async t => {
  let calls=0; const call=await fixture(t,async()=>{calls++;return response;});
  for(const key of ["url","secret","hostname","remoteip","metadata","proxy","redirect","idempotency_key"]) {
    assert.equal((await call({token:"fixture",action:"signup",[key]:"untrusted"})).status,400);
  } assert.equal(calls,0); assert.equal((await call({token:"fixture",action:"signup"},"https://evil.test")).status,404);
});
test("relay bounds input and refuses duplicate proof including concurrent validation",async t=>{
  let calls=0; const call=await fixture(t,async()=>{calls++;return response;});
  assert.equal((await call({token:"x".repeat(2049),action:"signup"})).status,400);
  assert.equal((await call({token:"x".repeat(9000),action:"signup"})).status,413);
  const results=await Promise.all([call({token:"proof",action:"signup"}),call({token:"proof",action:"signup"})]);
  assert.deepEqual(results.map(r=>r.body.success).sort(),[false,true]);assert.equal(calls,1);
});
test("relay validates host/action/time and never forwards provider metadata",async t=>{
  const call=await fixture(t,async()=>({...response,hostname:"dezbatere.ro",metadata:{token:"must-not-leak"}}));
  const result=await call({token:"fixture",action:"signup"}); assert.equal(result.body.success,false);assert.equal(JSON.stringify(result).includes("must-not-leak"),false);
});
function fakeTransport(body,status=200) {
  const calls=[];
  const implementation=(url,options,callback)=>{
    calls.push({url:String(url),options,body:""}); const out=new EventEmitter(); out.destroy=()=>{}; out.end=body=>{
      calls.at(-1).body=body;
      queueMicrotask(()=>{const incoming=new PassThrough();incoming.statusCode=status;incoming.headers={location:"https://evil.test"};callback(incoming);incoming.end(bodyForResponse);});
    }; const bodyForResponse=body; return out;
  }; return {calls,implementation};
}
test("fixed transport posts only the secret and response and never follows redirects",async()=>{
  const f=fakeTransport(JSON.stringify(response));
  assert.deepEqual(await fixedSiteverify(secret,"fixture-proof",AbortSignal.timeout(5000),f.implementation),response);
  assert.equal(f.calls[0].url,"https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(f.calls[0].options.method,"POST");assert.deepEqual(Object.fromEntries(new URLSearchParams(f.calls[0].body)),{secret,response:"fixture-proof"});
  const redirected=fakeTransport(JSON.stringify(response),302);await assert.rejects(fixedSiteverify(secret,"fixture",AbortSignal.timeout(5000),redirected.implementation));assert.equal(redirected.calls.length,1);
});
test("fixed transport rejects oversized or malformed provider responses",async()=>{
  for(const body of ["x".repeat(8193),"not-json"]) {const f=fakeTransport(body);await assert.rejects(fixedSiteverify(secret,"fixture",AbortSignal.timeout(5000),f.implementation));}
});
test("worker refuses inherited identity/DB/provider/proxy options without printing values",()=>{
  const child=spawnSync(process.execPath,["deploy/turnstile/siteverify-relay.mjs"],{encoding:"utf8",env:{NODE_ENV:"production",DATABASE_URL:"sentinel-private-database",HTTPS_PROXY:"sentinel-private-proxy"}});
  assert.notEqual(child.status,0);assert.match(child.stderr,/TURNSTILE_RELAY_ENVIRONMENT_INVALID/);assert.equal(child.stderr.includes("sentinel-private"),false);
});
test("configuration contains only dedicated custody and socket settings",()=>{
  assert.throws(()=>relayConfiguration({NODE_ENV:"production",PUBLIC_APP_URL:"https://preview.test",TURNSTILE_SOCKET_PATH:"https://evil.test",CREDENTIALS_DIRECTORY:"/run/credentials"}));
  assert.throws(()=>relayConfiguration({NODE_ENV:"production",PUBLIC_APP_URL:"https://preview.test",TURNSTILE_SOCKET_PATH:"/run/worker.sock",CREDENTIALS_DIRECTORY:"/run/credentials",KEK_PATH:"sentinel"}));
});
test("credential loader rejects API-readable group/world modes and symlinks, production test key",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"ts-secret-"));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,"turnstile-secret");
  await writeFile(path,secret,{mode:0o600});assert.equal(await loadRelaySecret(path,"test"),secret);
  await chmod(path,0o640);await assert.rejects(loadRelaySecret(path,"test"));await chmod(path,0o600);
  const link=join(dir,"link");await symlink(path,link);await assert.rejects(loadRelaySecret(link,"test"));await assert.rejects(loadRelaySecret(path,"production"));
});

test("an API-shaped child with filesystem confinement cannot read relay-only credential", async t => {
  const dir = await mkdtemp(join(tmpdir(), "ts-custody-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const secretPath = join(dir, "turnstile-secret"); await writeFile(secretPath, secret, { mode: 0o600 });
  const moduleUrl = pathToFileURL(resolve("deploy/turnstile/siteverify-relay.mjs")).href;
  const source = `import { loadRelaySecret } from ${JSON.stringify(moduleUrl)}; try { await loadRelaySecret(${JSON.stringify(secretPath)}, "test"); process.exitCode=2; } catch(error) { console.error(error.code); process.exitCode=1; }`;
  const child = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${resolve("deploy/turnstile")}`, "--input-type=module", "--eval", source], { encoding: "utf8", env: { NODE_ENV: "production" } });
  assert.equal(child.status, 1); assert.match(child.stderr, /ERR_ACCESS_DENIED/); assert.equal(child.stderr.includes(secret), false);
});
