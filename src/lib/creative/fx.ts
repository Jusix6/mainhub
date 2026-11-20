/**
 * Creative mode effects: a tile pops in when placed, a removed tile shrinks
 * away and breaks into little pieces (like the cards in Card Breaker). All
 * with the Web Animations API on elements in the overlay; nothing at all with
 * reduced motion.
 */

const INK = '#111111';

export interface Fx {
  /** A placed (or moved, resized) tile pops into place. */
  pop(el: HTMLElement): void;
  /** Little square pieces fly out of `r` and fall. `strength` 1 = a removal, 0.5 = a soft puff. */
  burst(r: DOMRect, colors: string[], n: number, strength?: number): void;
  /** A copy of a tile that is about to go shrinks and fades where it stood. */
  vanish(el: HTMLElement): void;
}

export function createFx(layer: HTMLElement): Fx {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pop(el: HTMLElement) {
    if (reduced.matches) return;
    el.animate(
      [
        { transform: 'scale(0.86)', opacity: 0.3 },
        { transform: 'scale(1.04)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 280, easing: 'ease-out' },
    );
  }

  function burst(r: DOMRect, colors: string[], n: number, strength = 1) {
    if (reduced.matches || !r.width) return;
    const palette = colors.length ? colors : ['#ffa300', '#ff5da2'];
    for (let i = 0; i < n; i++) {
      const b = document.createElement('span');
      b.className = 'cr-bit';
      const size = 4 + Math.random() * 7 * strength;
      b.style.left = `${r.left + Math.random() * r.width}px`;
      b.style.top = `${r.top + Math.random() * r.height}px`;
      b.style.width = `${size}px`;
      b.style.height = `${size}px`;
      b.style.background = i % 4 === 3 ? INK : palette[i % palette.length];
      layer.append(b);
      const dx = (Math.random() - 0.5) * 180 * strength;
      const up = -(20 + Math.random() * 110) * strength;
      const spin = (Math.random() - 0.5) * 600;
      b.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${up + 160 * strength}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.25,.6,.45,1)' },
      ).onfinish = () => b.remove();
    }
  }

  function vanish(el: HTMLElement) {
    if (reduced.matches) return;
    const r = el.getBoundingClientRect();
    const copy = el.cloneNode(true) as HTMLElement;
    copy.classList.add('cr-vanish');
    copy.style.left = `${r.left}px`;
    copy.style.top = `${r.top}px`;
    copy.style.width = `${r.width}px`;
    copy.style.height = `${r.height}px`;
    copy.style.gridColumn = '';
    copy.style.gridRow = '';
    layer.append(copy);
    copy.animate(
      [
        { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'scale(0.6) rotate(-4deg)', opacity: 0 },
      ],
      { duration: 260, easing: 'ease-in' },
    ).onfinish = () => copy.remove();
  }

  return { pop, burst, vanish };
}

/** Colours of a tile for its pieces: the first filled backgrounds inside it. */
export function colorsOf(el: HTMLElement): string[] {
  const out: string[] = [];
  for (const node of [el, ...el.querySelectorAll<HTMLElement>('*')].slice(0, 40)) {
    const c = getComputedStyle(node).backgroundColor;
    if (!c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || out.includes(c)) continue;
    // White and near-white pieces would hardly show on the light page
    const [r, g, b] = (c.match(/\d+/g) ?? []).map(Number);
    if (r > 225 && g > 225 && b > 215) continue;
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}
