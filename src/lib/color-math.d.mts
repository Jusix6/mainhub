/** Types for color-math.mjs (plain JS so the build script can share it). */
export function hexToRgb(hex: string): number[];
export function hexToOklab(hex: string): number[];
export function deltaE(a: readonly number[], b: readonly number[]): number;
