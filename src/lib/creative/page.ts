/**
 * A creative build shown as a real page (the start page / or a shared link):
 * the same tiles as in the editor, but live (links work, nothing is inert).
 *
 * Wide screens: the 12-column grid exactly as built. Narrow screens (CSS in
 * MyStartPage.astro): 6 columns, tiles in reading order, packed densely; each
 * tile gets a phone size (--pw × --ph): 4+ columns wide → full width, 2–3 →
 * half, 1 → a third, height in proportion. Spaces disappear on phones.
 *
 * Bits that normally get their script from their own component are handled
 * here, because these tiles arrive after the page has loaded: the video
 * facade (click to play), turning the business card, the game tiles.
 */
import { usedRows, type Placed, type Plan } from './plan';
import { fitTile, renderTile, type Library } from './tiles';

/** Phone size of a tile on the 6-column grid. */
function phoneSize(p: Placed): [number, number] {
  const w = p[3] >= 4 ? 6 : p[3] >= 2 ? 3 : 2;
  return [w, Math.max(1, Math.round((p[4] * w) / p[3]))];
}

/** Draws the build into `grid`; returns a function that removes its listeners. */
export function showBuild(grid: HTMLElement, plan: Plan, lib: Library): () => void {
  grid.replaceChildren();
  grid.style.setProperty('--rows', String(usedRows(plan)));
  // Reading order: phones stack them in this order, screen readers read it
  const tiles = [...plan.tiles].sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  for (const p of tiles) {
    const tile = lib.tiles.get(p[0]);
    if (!tile) continue;
    const el = renderTile(tile, p, false);
    el.style.gridColumn = '';
    el.style.gridRow = '';
    const [pw, ph] = phoneSize(p);
    el.style.setProperty('--gc', `${p[1] + 1} / span ${p[3]}`);
    el.style.setProperty('--gr', `${p[2] + 1} / span ${p[4]}`);
    el.style.setProperty('--pw', String(pw));
    el.style.setProperty('--ph', String(ph));
    grid.append(el);
  }
  const fitAll = () => grid.querySelectorAll<HTMLElement>('.cr-tile').forEach(fitTile);
  requestAnimationFrame(fitAll);

  const ac = new AbortController();
  const { signal } = ac;
  window.addEventListener('resize', fitAll, { signal });
  grid.addEventListener(
    'load',
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>('.cr-tile');
      if (el) fitTile(el);
    },
    { capture: true, signal },
  );
  grid.addEventListener(
    'click',
    (e) => {
      const t = e.target as Element;
      // Video: the privacy-friendly player only after a click (as LatestVideo.astro does)
      const play = t.closest<HTMLButtonElement>('[data-video-play]');
      const box = play?.closest<HTMLElement>('[data-video]');
      if (play && box?.dataset.videoId) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.videoId)}?autoplay=1&rel=0`;
        iframe.title = play.getAttribute('aria-label') ?? 'YouTube video';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.className = 'video__frame';
        iframe.style.borderRadius = 'inherit';
        play.replaceWith(iframe);
        return;
      }
      // Business card: turn it over
      const flip = t.closest('[data-flip]');
      const card = flip?.closest('[data-business-card]')?.querySelector('[data-card]');
      if (flip && card) {
        card.classList.toggle('is-flipped');
        return;
      }
      // Card Breaker and Snake (CardGames.astro is on the page)
      const game = t.closest<HTMLElement>('[data-play-game]');
      if (game) document.dispatchEvent(new CustomEvent('card:game', { detail: { game: Number(game.dataset.playGame), opener: game } }));
    },
    { signal },
  );
  return () => ac.abort();
}
