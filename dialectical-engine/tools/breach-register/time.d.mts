export const OWNER_TIME_ZONE: string;
export const HOUR_MS: number;
export const DAY_MS: number;
export function parseMoment(text: string): Date | null;
export function ownerTime(date: Date): string;
export function utcTime(date: Date): string;
export function showMoment(date: Date): string;
export function storedMoment(date: Date): string;
export function distance(from: Date, to: Date): string;
