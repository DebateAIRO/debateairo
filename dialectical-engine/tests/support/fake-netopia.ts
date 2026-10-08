// tests/support/fake-netopia.ts
// The server lives in acceptance/ so the development stack (apps/runner) can start it without importing a test module
// (tools/orphan-audit/src/index.ts:726).
export {
  startFakeNetopia,
  type FakeNetopia,
  type FakeNetopiaChargeOutcome,
  type FakeNetopiaDelivery,
  type FakeNetopiaFailure,
  type FakeNetopiaOptions,
  type FakeNetopiaOrder,
  type FakeNetopiaOutcome,
  type FakeNetopiaRequest,
  type FakeNetopiaRoute
} from "../../acceptance/billing-fakes/fake-netopia.js";
