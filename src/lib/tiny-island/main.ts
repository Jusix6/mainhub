/**
 * Tiny Island entry point: builds world, simulation, camera, renderer,
 * controls and panels for the page and runs the frame loop. The simulation
 * runs in fixed ticks inside `sim.advance`; drawing just reads the state.
 *
 * Start screen: Continue (a saved island), Random island, Empty island, and
 * "Play shared world" when the link carries ?world=<seed>. The island is
 * saved to localStorage every 60 seconds and when the page is left.
 */
import { buildingAt } from './building-panel';
import { Cinema, type CinemaStrings } from './cinema';
import { Music } from './music';
import { heatwave, hurricane, rain, strike, wakeVolcano } from './disasters';
import { Editor, type EditorStrings } from './editor';
import { Camera } from './camera';
import { Panels, type PanelStrings } from './panels';
import { Renderer } from './render';
import { newSeed } from './rng';
import { load, save, savedSummary } from './save';
import { Sim } from './sim';
import { Controls, type Strings } from './ui';
import { TILE, World } from './world';

const AUTOSAVE_MS = 60_000;

interface MainStrings {
  editor: EditorStrings;
  ruins: string;
  tiers: Record<string, string>;
  start: { continueInfo: string; saved: string; shared: string; copied: string; share: string };
  /** Update 3: names of the three Borders states; the Disasters window. */
  borders?: Record<'normal' | 'strong' | 'off', string>;
  disasters?: { onlyMountains: string };
  cinema?: Omit<CinemaStrings, 'peoples'>;
  ages?: Record<string, string>;
}

/** Seeds from a link: letters, digits and dashes, short. */
function cleanSeed(raw: string | null): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24);
}

/** Starts the game inside `root`; returns a function that stops it again. */
export function start(root: HTMLElement): () => void {
  const S: Strings & PanelStrings & MainStrings = JSON.parse(root.dataset.strings ?? '{}');
  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const $ = <E extends HTMLElement>(sel: string) => root.querySelector<E>(sel);
  const seedLabel = $('[data-seed]');
  const startScreen = $('[data-start]');
  const savedLabel = $('[data-saved]');
  const ac = new AbortController();

  const world = new World();
  const sim = new Sim(world);
  const cam = new Camera(world.w * TILE, world.h * TILE);
  const renderer = new Renderer(canvas, world);
  renderer.ruinsLabel = S.ruins ?? 'ruins';
  renderer.tierLabels = S.tiers ?? renderer.tierLabels;
  const panels = new Panels(root, S, sim, cam);
  let playing = false;

  // How the land is shown (Update 3, key G), remembered in this browser
  const BORDERS_KEY = 'jxsi_tiny_island_borders';
  try {
    const b = localStorage.getItem(BORDERS_KEY);
    if (b === 'strong' || b === 'off') renderer.borders = b;
  } catch {
    // no storage: the default
  }
  const showBorders = () => {
    const btn = $('[data-borders]');
    if (!btn) return;
    btn.dataset.mode = renderer.borders;
    btn.setAttribute('aria-pressed', String(renderer.borders !== 'off'));
    const label = S.borders?.[renderer.borders] ?? '';
    btn.title = `${label} (G)`;
    const name = btn.querySelector('[data-borders-name]');
    if (name) name.textContent = label;
  };
  showBorders();

  // The faith map (Religions tab, Update 3)
  root.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-faith-map]');
      if (!btn) return;
      renderer.faithView = !renderer.faithView;
      btn.setAttribute('aria-pressed', String(renderer.faithView));
    },
    { signal: ac.signal },
  );

  const showSeed = () => {
    if (seedLabel) seedLabel.textContent = world.seed;
  };
  const syncRules = () => {
    root.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((s) => {
      s.value = String(sim.rules[s.dataset.rule as keyof Sim['rules']]);
      s.dispatchEvent(new Event('input'));
    });
  };

  /** The camera on the island: on a big world the main island, else all of it. */
  const frameIsland = () => {
    cam.setWorld(world.w * TILE, world.h * TILE);
    const main = world.islands.find((is) => is.main);
    cam.frame(main ? { x: main.x * TILE, y: main.y * TILE, w: main.rx * 2.3 * TILE, h: main.ry * 2.4 * TILE } : undefined);
  };

  /** A fresh island: from a seed (two peoples), or the empty beach. */
  const fresh = (seed: string) => {
    if (seed === 'empty') world.generateEmpty();
    else world.generate(seed);
    sim.reset();
    if (seed !== 'empty') sim.populate();
    panels.select(null);
    showSeed();
    frameIsland();
  };

  const controls = new Controls(root, canvas, S, world, sim, cam, {
    onRandom: () => fresh(newSeed()),
    onTap: (x, y) => {
      // A village sign opens the profile of the place
      const sign = renderer.villageAt(x, y);
      if (sign !== null) return panels.selectVillage(sign);
      const p = cam.toWorld(x, y);
      const who = sim.nearest(p.x / TILE, p.y / TILE + 0.3, 0.9, (a) => a.kind === 'human');
      if (who) return panels.select(who.id);
      // A house or building (Update 3): who lives there, what it does
      const building = buildingAt(sim, p.x / TILE, p.y / TILE);
      if (building) return panels.selectBuilding(building);
      // So does its square
      const square = sim.villages.find((v) => Math.hypot(v.x + 0.5 - p.x / TILE, v.y + 0.5 - p.y / TILE) < 1.4);
      if (square) return panels.selectVillage(square.id);
      panels.select(null);
    },
    pointable: (x, y) => {
      if (renderer.villageAt(x, y) !== null) return true;
      const p = cam.toWorld(x, y);
      return buildingAt(sim, p.x / TILE, p.y / TILE) !== null;
    },
    onPan: () => panels.stopFollow(),
    onWindow: () => panels.makeRoom(),
    // Update 3, phase F: the gods send disasters (and rain)
    onDisaster: (tool, x, y) => {
      const hint = $('[data-disaster-hint]');
      let ok = true;
      if (tool === 'lightning') strike(sim, x, y);
      else if (tool === 'volcano') ok = wakeVolcano(sim, x, y, true);
      else if (tool === 'hurricane') hurricane(sim, x, y);
      else rain(sim, x, y);
      if (hint) hint.textContent = ok ? '' : (S.disasters?.onlyMountains ?? '');
    },
    onHeatwave: () => heatwave(sim, 1),
    onCinema: () => toggleCinema(),
    onBorders: () => {
      renderer.borders = renderer.borders === 'normal' ? 'strong' : renderer.borders === 'strong' ? 'off' : 'normal';
      showBorders();
      try {
        localStorage.setItem(BORDERS_KEY, renderer.borders);
      } catch {
        // private mode: it is only a preference
      }
    },
    // An own character came to life: show its profile, keep it in My Characters
    onPlaced: (id) => {
      panels.select(id);
      editor.renderMine();
    },
  });

  // The character editor (Update 2): "Place on the map" waits for the next click on land
  const editor = new Editor(root, S.editor, (t) => {
    const hint = root.querySelector<HTMLElement>('[data-place-hint]');
    if (hint) hint.textContent = S.editor.placeHint.replace('{n}', t.name.trim() || S.editor.unnamed);
    controls.startPlacing(t);
  });

  /* ---- start screen ------------------------------------------------------------ */

  const shared = cleanSeed(new URLSearchParams(location.search).get('world'));
  const summary = savedSummary();
  const play = () => {
    playing = true;
    if (startScreen) startScreen.hidden = true;
    controls.setSpeed(1);
    // A shared link is used once; the address stays clean afterwards
    if (shared) {
      const url = new URL(location.href);
      url.searchParams.delete('world');
      history.replaceState(history.state, '', url);
    }
  };

  // Behind the start screen: the saved island, or a fresh one to look at
  if (summary && !shared) load(sim, world);
  else fresh(shared || newSeed());
  syncRules();
  showSeed();
  controls.setSpeed(summary && !shared ? 0 : 1);

  if (startScreen) {
    const cont = $<HTMLButtonElement>('[data-start-continue]');
    const sharedBtn = $<HTMLButtonElement>('[data-start-shared]');
    if (cont && summary) {
      cont.hidden = false;
      $('[data-start-info]')!.textContent = S.start.continueInfo.replace('{y}', String(summary.year)).replace('{n}', String(summary.people));
    }
    if (sharedBtn && shared) {
      sharedBtn.hidden = false;
      $('[data-start-shared-seed]')!.textContent = S.start.shared.replace('{s}', shared);
    }
    startScreen.addEventListener(
      'click',
      (e) => {
        const t = e.target as Element;
        if (t.closest('[data-start-continue]')) {
          if (!load(sim, world)) fresh(newSeed());
          syncRules();
          showSeed();
          frameIsland();
          play();
        } else if (t.closest('[data-start-shared]')) {
          fresh(shared);
          play();
        } else if (t.closest('[data-start-random]')) {
          fresh(newSeed());
          play();
        } else if (t.closest('[data-start-empty]')) {
          fresh('empty');
          play();
        }
      },
      { signal: ac.signal },
    );
  } else {
    play();
  }

  /* ---- saving and sharing --------------------------------------------------------- */

  const store = () => {
    if (!playing) return;
    if (save(sim, world) && savedLabel) {
      savedLabel.textContent = S.start.saved;
      savedLabel.classList.add('is-shown');
      window.setTimeout(() => savedLabel.classList.remove('is-shown'), 1800);
    }
  };
  const autosave = window.setInterval(store, AUTOSAVE_MS);
  window.addEventListener('pagehide', store, { signal: ac.signal });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && store(), { signal: ac.signal });

  const shareBtn = $<HTMLButtonElement>('[data-share]');
  shareBtn?.addEventListener(
    'click',
    async () => {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set('world', world.seed);
      try {
        await navigator.clipboard.writeText(url.href);
        shareBtn.textContent = S.start.copied;
      } catch {
        window.prompt(S.start.share, url.href);
      }
      window.setTimeout(() => (shareBtn.textContent = `🔗 ${S.start.share}`), 2000);
    },
    { signal: ac.signal },
  );

  /* ---- layout and frame loop -------------------------------------------------------- */

  const top = $('.ti__top');
  const dock = $('.ti__dock');
  const fit = () => {
    // Panels start below the top bar, however many lines it wraps into
    if (top) root.style.setProperty('--top', `${top.offsetTop + top.offsetHeight + 8}px`);
    // …and above the dock, which grows with the open tab
    if (dock) root.style.setProperty('--dock', `${root.clientHeight - dock.offsetTop + 8}px`);
    const r = canvas.getBoundingClientRect();
    renderer.resize(r.width, r.height);
    cam.resize(r.width, r.height);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  if (top) ro.observe(top);
  if (dock) ro.observe(dock);
  fit();
  frameIsland();

  /* ---- cinema mode and music (Update 3, phase G) --------------------------------------- */

  const music = new Music();
  const cinemaView = $('[data-cinema-view]')!;
  const describe = (e: Parameters<Panels['text']>[0]) => {
    const tmp = document.createElement('span');
    tmp.innerHTML = panels.text(e);
    return tmp.textContent ?? '';
  };
  const cinema = new Cinema(sim, cam, cinemaView, { ...(S.cinema as Omit<CinemaStrings, 'peoples' | 'jobs' | 'buildings'>), peoples: S.peoples, jobs: S.jobs, buildings: S.buildings }, describe, music, (k) => S.ages?.[k] ?? k);
  let musicOn = false;
  let musicTouched = false;
  let moodAt = 0;
  const musicBox = $<HTMLInputElement>('[data-music]');
  const toggleCinema = () => {
    if (cinema.active) {
      cinema.stop();
      if (!musicOn) music.setMood(null);
      return;
    }
    // The first time the cinema brings the music along
    if (!musicTouched && musicBox) {
      musicOn = true;
      musicBox.checked = true;
    }
    if (!musicOn) music.setMood(null);
    controls.toggleWindow(null);
    cinema.start();
    if (!musicOn) music.setMood(null);
  };
  // Esc, K or a click on the picture ends it
  cinemaView.addEventListener('click', () => toggleCinema(), { signal: ac.signal });
  window.addEventListener(
    'keydown',
    (e) => {
      if (cinema.active && e.key === 'Escape') toggleCinema();
    },
    { signal: ac.signal },
  );
  root.addEventListener(
    'change',
    (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches('[data-music]')) {
        musicOn = t.checked;
        musicTouched = true;
        if (musicOn) music.start();
        music.setMood(musicOn ? (cinema.active ? (music.mood ?? 'peace') : Cinema.worldMood(sim)) : null);
      } else if (t.matches('[data-cine-clean]')) {
        cinema.clean = t.checked;
        cinemaView.classList.toggle('is-clean', t.checked);
      }
    },
    { signal: ac.signal },
  );
  root.addEventListener(
    'input',
    (e) => {
      const t = e.target as HTMLInputElement;
      if (t.matches('[data-volume]')) music.setVolume(Number(t.value));
    },
    { signal: ac.signal },
  );

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    // Cinema mode (Update 3): the director moves the camera, slow motion at climaxes
    const scale = cinema.update(now, dt);
    sim.advance(dt * scale);
    if (now - moodAt > 1000) {
      moodAt = now;
      if (!cinema.active) music.setMood(musicOn ? Cinema.worldMood(sim) : null);
    }
    panels.update(now);
    renderer.flush();
    renderer.selectedVillage = panels.selectedVillage;
    renderer.selectedBuilding = panels.selectedBuilding;
    renderer.draw(cam, sim, controls.brush(), panels.selected);
    controls.renderClock();
    controls.renderPopulation();
    controls.renderTip();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  root.classList.add('is-ready');
  // Local development only: lets tests fast-forward the island from the console
  if (import.meta.env.DEV) (window as unknown as { tinyIsland: unknown }).tinyIsland = { sim, cam, panels, world, renderer, cinema, music, save: () => save(sim, world), load: () => load(sim, world) };

  return () => {
    store();
    music.stop();
    cancelAnimationFrame(raf);
    window.clearInterval(autosave);
    ac.abort();
    ro.disconnect();
    controls.destroy();
    panels.destroy();
    editor.destroy();
  };
}
