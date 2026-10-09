import { expect, it } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "../../apps/api/src/recovery.js";
import { ENUMERATION_FLOOR_MS, passwordResetOnVirtualClock } from "../support/recoveryStartStorage.js";
const origin = "https://preview.example.test";
const KNOWN = "owned@example.test", UNKNOWN = "nobody-here@example.test";

const realReset = () => passwordResetOnVirtualClock([KNOWN]);

it("keeps a legacy API composition running with reset authority disabled",async()=>{
  const api=buildApi({application:{} as AskApplication,allowedOrigin:origin});
  try{const availability=await api.inject({method:"GET",url:"/v1/geo/availability"});expect(availability.statusCode).toBe(200);expect(availability.json()).toEqual({signup:true,pay:false,service:true});expect((await api.inject({method:"POST",url:"/v1/auth/password-reset/start",headers:{origin},payload:{email:"owned@example.test"}})).statusCode).toBe(404);}finally{await api.close();}
});

it("exposes a separate origin-bound reset start without a normal login session, identical for known and unknown addresses", async () => {
  const { service, storage } = realReset();
  const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, passwordReset: service });
  try {
    const start = (email: string, from = origin) => api.inject({ method: "POST", url: "/v1/auth/password-reset/start", headers: { origin: from }, payload: { email } });
    const known = await start(KNOWN), unknown = await start(UNKNOWN);
    for (const response of [known, unknown]) {
      expect(response.statusCode).toBe(202);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.json()).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    }
    expect(unknown.body).toBe(known.body);
    const { date: _knownDate, ...knownHeaders } = known.headers, { date: _unknownDate, ...unknownHeaders } = unknown.headers;
    expect(unknownHeaders).toEqual(knownHeaders);
    // Both starts wrote a request row: the stored footprint does not reveal which address is real.
    expect(storage.starts.map((row) => row.candidateId === null)).toEqual([false, true]);
    expect((await start(KNOWN, "https://evil.example.test")).statusCode).toBe(403);
    expect(storage.starts).toHaveLength(2);
  }
  finally {
    await api.close();
  }
});

it("holds every start to the enumeration floor however much work the account lookup did", async () => {
  const { timed, sleeps, storage } = realReset();
  const known = await timed(KNOWN), unknown = await timed(UNKNOWN);
  expect(unknown.response).toEqual(known.response);
  expect(known.response).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
  expect(known.elapsed).toBe(ENUMERATION_FLOOR_MS);
  expect(unknown.elapsed).toBe(ENUMERATION_FLOOR_MS);
  // The floor compensated for the difference instead of the paths happening to cost the same.
  expect(sleeps).toEqual([ENUMERATION_FLOOR_MS - 180, ENUMERATION_FLOOR_MS - 4]);
  // A source the limiter refuses gets the same answer on the same clock, and writes nothing.
  storage.refuseAdmission();
  const refused = await timed(KNOWN);
  expect(refused).toEqual({ response: RECOVERY_START_PUBLIC_RESPONSE, elapsed: ENUMERATION_FLOOR_MS });
  expect(storage.starts).toHaveLength(2);
});
