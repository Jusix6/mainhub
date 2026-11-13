/** Minimal types for spectral.js 3 (https://github.com/rvanwijnen/spectral.js), only what Color Hunter uses. */
declare module 'spectral.js' {
  export class Color {
    constructor(color: string);
    tintingStrength: number;
    OKLab: number[];
    toString(options?: { format?: 'hex' | 'rgb'; method?: 'map' | 'clip' }): string;
  }
  export function mix(...colors: [Color, number][]): Color;
  const spectral: { Color: typeof Color; mix: typeof mix };
  export default spectral;
}
