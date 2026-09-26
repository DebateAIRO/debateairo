// ARCH-FIX-PES-S02-p2 — THROWAWAY: what does the verdict's suggested repair, util.promisify(deps.lookup)(host, { all: true }),
// resolve to for node:dns lookup and for a callback stub? (DECISIONS row "B1 alternative: util.promisify".)
import { lookup } from "node:dns";
import { promisify } from "node:util";
const stub = (h, o, cb) => { if (o.all) cb(null, [{ address: "127.0.0.1", family: 4 }]); else cb(null, "127.0.0.1", 4); };
console.log("node", process.version);
console.log("has util.promisify.custom:", typeof lookup[promisify.custom]);
console.log("promisify(node:dns lookup)(api.localtest.me, {all:true}) =", JSON.stringify(await promisify(lookup)("api.localtest.me", { all: true })));
console.log("promisify(callback stub)(api.localtest.me, {all:true})   =", JSON.stringify(await promisify(stub)("api.localtest.me", { all: true })));
