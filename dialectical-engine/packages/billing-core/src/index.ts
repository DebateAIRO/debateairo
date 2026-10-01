// Paid plans (spec 2026-09-29 §2.4): pure billing rules. No I/O lives in this package.
// R-1: the manifest lists @debateai/kernel only; register and budget are imported as types.
export { allowanceVsPlus, computeWindows, personWindowsFor, type TimeWindow } from "./windows.js";
export { BillingPersonAllowanceSource, type EntitlementPort, type EntitlementWindowBasis } from "./allowance-source.js";
