"use client";

// Verification emails have historically targeted /verify-email. Keep that
// public route as the canonical compatibility entry to the one-shot S4 flow:
// the shared page removes the bearer from the URL before verification, then
// continues directly into mandatory authenticator enrollment.
export { default } from "../enroll-mfa/page";
