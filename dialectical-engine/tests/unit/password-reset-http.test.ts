import { expect, it } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
const origin = "https://preview.example.test";
it("keeps a legacy API composition running with reset authority disabled",async()=>{
  const api=buildApi({application:{} as AskApplication,allowedOrigin:origin});
  try{const availability=await api.inject({method:"GET",url:"/v1/geo/availability"});expect(availability.statusCode).toBe(200);expect(availability.json()).toEqual({signup:true,pay:false,service:true});expect((await api.inject({method:"POST",url:"/v1/auth/password-reset/start",headers:{origin},payload:{email:"owned@example.test"}})).statusCode).toBe(404);}finally{await api.close();}
});
it("exposes a separate origin-bound reset start without a normal login session", async () => {
  const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, passwordReset: { async start() {
        return { message: "If this account can be recovered, instructions will arrive through an eligible channel." };
      } } as never });
  try {
    const response = await api.inject({ method: "POST", url: "/v1/auth/password-reset/start", headers: { origin }, payload: { email: "owned@example.test" } });
    expect(response.statusCode).toBe(202);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await api.inject({ method: "POST", url: "/v1/auth/password-reset/start", headers: { origin: "https://evil.example.test" }, payload: { email: "owned@example.test" } })).statusCode).toBe(403);
  }
  finally {
    await api.close();
  }
});
