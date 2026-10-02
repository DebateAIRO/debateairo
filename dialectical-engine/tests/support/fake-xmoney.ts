// tests/support/fake-xmoney.ts
// Contract §6 path. The server lives in acceptance/ so the development stack (apps/runner) can start it
// without importing a test module (tools/orphan-audit/src/index.ts:691).
export {
  startFakeXMoney,
  type FakeXMoney,
  type FakeXMoneyOptions,
  type FakeXMoneyTransaction
} from "../../acceptance/billing-fakes/fake-xmoney.js";
