// ARCH-REV-PES-S02-p2 — measure resolveAll (PLAN.md:796-804) against a callback lookup,
// a lookup that never calls back, and dns.promises.lookup. The race is the PROBE's clock,
// not a timer inside resolveAll.
import { lookup as callbackLookup } from "node:dns";
import { promises as dnsPromises } from "node:dns";
import { writeFileSync } from "node:fs";

function resolveAll(lookup, hostname) {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, answer) => {
      if (error) reject(error);
      else resolve(answer);
    });
  });
}

function neverCallsBack(_hostname, _options, _callback) {}

const pidPath = new URL("./scratch/hang.pid", import.meta.url);
writeFileSync(pidPath, String(process.pid));

async function race(label, lookup, ms) {
  let state = "pending";
  const p = resolveAll(lookup, "api.localtest.me").then(
    (v) => {
      state = "settled";
      return v;
    },
    (e) => {
      state = "rejected " + (e && e.code ? e.code : e);
      return state;
    },
  );
  const winner = await Promise.race([
    p.then((v) => ({ kind: "lookup", v })),
    new Promise((r) => setTimeout(() => r({ kind: "probe-clock", state }), ms)),
  ]);
  if (winner.kind === "lookup") {
    const addrs = Array.isArray(winner.v)
      ? winner.v.map((a) => `${a.address}/${a.family}`).join(",")
      : String(winner.v);
    console.log(`${label} SETTLED ${addrs}`);
  } else {
    console.log(`${label} STILL ${winner.state} after ${ms}ms`);
  }
}

console.log("node", process.version);
try {
  callbackLookup("api.localtest.me", { all: true });
  console.log("no-callback THREW nothing");
} catch (e) {
  console.log("no-callback", e.code, String(e.message).split("\n")[0]);
}
await race("callback-lookup", callbackLookup, 2000);
await race("never-calls-back", neverCallsBack, 400);
await race("promises.lookup", dnsPromises.lookup, 400);
console.log("resolveAll source has no timer: the 400ms bound is only this probe");
