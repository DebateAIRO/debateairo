/** Process-local immutable frame from the trusted provider cost admission seam. Never sent on a wire. */
export type ProviderCallAdmission =
  | Readonly<{kind:"INTERNAL";callId:string}>
  | Readonly<{kind:"ORDINARY";callId:string}>;
