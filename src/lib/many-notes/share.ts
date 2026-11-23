/**
 * 2 Many Notes: the share card at the end (1200 × 630, the size link previews
 * use). The desk before and after side by side, taped on like photos, the
 * time, the rank and the address. Drawn on a canvas; the page shows it as a
 * data: URL (the site's CSP allows data: images, not blob:).
 */

export interface CardInfo {
  before: string | null;
  after: string;
  cleared: string;
  rank: string;
  labels: { before: string; after: string };
  title: string;
  /** The player's own note for tomorrow (phase 5), stuck in the corner. */
  tomorrow?: { label: string; text: string };
}

const W = 1200;
const H = 630;
const HAND = "Caveat, 'Comic Sans MS', cursive";

function load(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** A photo, slightly turned, with a strip of tape on top and a label below. */
function photo(g: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, turn: number, label: string) {
  const w = 480;
  const h = 270;
  g.save();
  g.translate(cx, cy);
  g.rotate(turn);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-w / 2 - 10, -h / 2 - 6, w + 28, h + 70);
  g.fillStyle = '#fbfaf5';
  g.fillRect(-w / 2 - 14, -h / 2 - 14, w + 28, h + 74);
  if (img) {
    // Cover: fill the frame, crop what is left over
    const k = Math.max(w / img.width, h / img.height);
    const sw = w / k;
    const sh = h / k;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
  } else {
    g.fillStyle = '#c9c3b5';
    g.fillRect(-w / 2, -h / 2, w, h);
  }
  g.fillStyle = 'rgba(255, 244, 190, 0.75)';
  g.save();
  g.rotate(-0.05);
  g.fillRect(-60, -h / 2 - 30, 120, 34);
  g.restore();
  g.fillStyle = '#20232b';
  g.font = `600 40px ${HAND}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 0, h / 2 + 32);
  g.restore();
}

export async function makeCard(info: CardInfo): Promise<string> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // A big yellow sticky note as the background
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffe76a');
  bg.addColorStop(1, '#f5d84e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.05)';
  g.fillRect(0, 0, W, 60);

  const [before, after] = await Promise.all([info.before ? load(info.before) : Promise.resolve(null), load(info.after)]);
  photo(g, before, 320, 290, -0.04, info.labels.before);
  photo(g, after, 880, 290, 0.035, info.labels.after);

  g.fillStyle = '#20232b';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `600 56px ${HAND}`;
  g.fillText(info.title, 48, 78);
  g.textAlign = 'center';
  g.font = `600 46px ${HAND}`;
  g.fillText(info.cleared, W / 2, 548);
  g.font = `600 34px ${HAND}`;
  g.fillStyle = '#7d2a55';
  g.fillText(info.rank, W / 2, 590);
  g.fillStyle = '#20232b';
  g.textAlign = 'right';
  g.font = `600 30px ${HAND}`;
  g.fillText('fun.jxsi.ch/2-many-notes', W - 40, 76);
  if (info.tomorrow) tomorrowNote(g, info.tomorrow.label, info.tomorrow.text);
  return c.toDataURL('image/png');
}

/** A pink sticky note in the bottom right corner with the player's own words. */
function tomorrowNote(g: CanvasRenderingContext2D, label: string, text: string) {
  g.save();
  g.translate(1075, 520);
  g.rotate(0.07);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-92, -82, 190, 176);
  g.fillStyle = '#ff9fc6';
  g.fillRect(-98, -90, 190, 176);
  g.fillStyle = '#20232b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 26px ${HAND}`;
  g.fillText(label, -3, -62);
  // The text, wrapped, as big as fits
  let size = 34;
  let lines: string[] = [];
  for (; size > 18; size -= 2) {
    g.font = `600 ${size}px ${HAND}`;
    lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > 160 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length * size * 1.05 < 120) break;
  }
  lines.forEach((l, i) => g.fillText(l, -3, -20 + i * size * 1.05 + (3 - lines.length) * size * 0.4));
  g.restore();
}
