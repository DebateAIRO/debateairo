export type CaptureEffective = "ON" | "OFF";
export interface CaptureSwitchSample { readonly effective: CaptureEffective; readonly reason: string }
