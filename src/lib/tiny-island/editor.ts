/**
 * The character editor (Update 2, phase B): a dialog over the island where a
 * person is put together freely (name, sex, age, people, who they fall for,
 * looks, abilities, traits, job, powers) with a big live preview. "Place on
 * the map" hands the template to the controls; the next click on land brings
 * the character to life (characters.ts). Opposite traits rule each other out.
 *
 * "My Characters" in the Life tab lists every template placed so far (in
 * this browser): click to place it again, ✎ to change it, × to forget it.
 */
import { OPPOSITE, STATS, type Power, type Trait } from './agents';
import { loadTemplates, randomTemplate, removeTemplate, type Template } from './characters';
import { paintPreview } from './render';

export interface EditorStrings {
  years: string;
  ages: Record<'child' | 'adult' | 'old', string>;
  mineEmpty: string;
  edit: string;
  remove: string;
  placeHint: string;
  unnamed: string;
}

export class Editor {
  private t: Template = randomTemplate();
  private readonly dialog: HTMLElement;
  private readonly preview: HTMLCanvasElement;
  private readonly ac = new AbortController();

  constructor(
    private readonly root: HTMLElement,
    private readonly S: EditorStrings,
    /** Start placing this template with the next click on the map. */
    private readonly place: (t: Template) => void,
  ) {
    this.dialog = root.querySelector<HTMLElement>('[data-editor]')!;
    this.preview = root.querySelector<HTMLCanvasElement>('[data-editor-preview]')!;
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) =>
      el.addEventListener(type, fn as EventListener, { signal: this.ac.signal });

    on(root, 'click', (e) => {
      const el = e.target as Element;
      if (el.closest('[data-editor-open]')) return this.open(randomTemplate());
      const mine = el.closest<HTMLElement>('[data-mine], [data-mine-edit], [data-mine-del]');
      if (mine) {
        const id = mine.dataset.mine ?? mine.dataset.mineEdit ?? mine.dataset.mineDel;
        const t = loadTemplates().find((x) => x.id === id);
        if (mine.dataset.mineDel) {
          removeTemplate(id!);
          this.renderMine();
        } else if (t && mine.dataset.mineEdit) this.open(t);
        else if (t) this.place(t);
        return;
      }
      if (!this.dialog.contains(el)) return;
      const btn = el.closest<HTMLElement>('[data-e]');
      if (!btn) return;
      const [key, value] = (btn.dataset.e ?? '').split(':');
      this.pick(key, value);
    });
    on(this.dialog, 'input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.eName !== undefined) this.t.name = el.value.slice(0, 20);
      if (el.dataset.eAge !== undefined) this.t.age = Number(el.value);
      if (el.dataset.eStat) this.t.stats[el.dataset.eStat as (typeof STATS)[number]] = Number(el.value);
      if (el.dataset.eJob !== undefined) this.t.job = el.value as Template['job'];
      if (el.dataset.eBeard !== undefined) this.t.look.beard = el.checked;
      this.render(false);
    });
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && !this.dialog.hidden) this.close();
    });
    this.renderMine();
  }

  destroy() {
    this.ac.abort();
  }

  open(t: Template) {
    this.t = structuredClone(t);
    this.dialog.hidden = false;
    this.render(true);
    this.dialog.querySelector<HTMLInputElement>('[data-e-name]')?.focus();
  }

  close() {
    this.dialog.hidden = true;
  }

  /** A click on one of the choice buttons. */
  private pick(key: string, value: string) {
    const t = this.t;
    switch (key) {
      case 'close':
        return this.close();
      case 'random': {
        const keep = t.id;
        this.t = { ...randomTemplate(), id: keep, name: t.name };
        return this.render(true);
      }
      case 'place':
        this.close();
        return this.place(structuredClone(this.t));
      case 'female': {
        const female = value === '1';
        // Who they fall for follows along while it is still the usual choice
        if (t.likes === (t.female ? 'men' : 'women')) t.likes = female ? 'men' : 'women';
        t.female = female;
        if (female) t.look.beard = false;
        break;
      }
      case 'age':
        t.age = value === 'child' ? 8 : value === 'old' ? 66 : 25;
        break;
      case 'people':
        t.people = value as Template['people'];
        break;
      case 'likes':
        t.likes = value as Template['likes'];
        break;
      case 'skin':
        t.skin = value;
        break;
      case 'hair':
        t.hair = value;
        break;
      case 'style':
        t.look.hairStyle = value as Template['look']['hairStyle'];
        break;
      case 'hat':
        t.look.hat = value as Template['look']['hat'];
        break;
      case 'cloth':
        t.look.cloth = value || undefined;
        break;
      case 'trait': {
        const tr = value as Trait;
        if (t.traits.includes(tr)) t.traits = t.traits.filter((x) => x !== tr);
        else t.traits = [...t.traits.filter((x) => x !== OPPOSITE[tr]), tr];
        break;
      }
      case 'power': {
        const p = value as Power;
        t.powers = t.powers.includes(p) ? t.powers.filter((x) => x !== p) : [...t.powers, p];
        break;
      }
    }
    this.render(true);
  }

  /** Shows the template in the form (`all`: also the text fields and sliders) and draws the preview. */
  private render(all: boolean) {
    const t = this.t;
    const d = this.dialog;
    const pressed = (sel: string, on: (el: HTMLElement) => boolean) => d.querySelectorAll<HTMLElement>(sel).forEach((el) => el.setAttribute('aria-pressed', String(on(el))));
    const val = (el: HTMLElement) => (el.dataset.e ?? '').split(':')[1];
    pressed('[data-e^="female:"]', (el) => (val(el) === '1') === t.female);
    pressed('[data-e^="people:"]', (el) => val(el) === t.people);
    pressed('[data-e^="likes:"]', (el) => val(el) === t.likes);
    pressed('[data-e^="skin:"]', (el) => val(el) === t.skin);
    pressed('[data-e^="hair:"]', (el) => val(el) === t.hair);
    pressed('[data-e^="style:"]', (el) => val(el) === t.look.hairStyle);
    pressed('[data-e^="hat:"]', (el) => val(el) === t.look.hat);
    pressed('[data-e^="cloth:"]', (el) => val(el) === (t.look.cloth ?? ''));
    pressed('[data-e^="trait:"]', (el) => t.traits.includes(val(el) as Trait));
    pressed('[data-e^="power:"]', (el) => t.powers.includes(val(el) as Power));
    const kind = t.age < 15 ? 'child' : t.age >= 60 ? 'old' : 'adult';
    pressed('[data-e^="age:"]', (el) => val(el) === kind);
    const ageText = d.querySelector('[data-e-age-text]');
    if (ageText) ageText.textContent = `${this.S.years.replace('{n}', String(t.age))} · ${this.S.ages[kind]}`;
    const beard = d.querySelector<HTMLInputElement>('[data-e-beard]');
    if (beard) beard.disabled = t.female;
    for (const s of STATS) {
      const out = d.querySelector(`[data-e-stat-out="${s}"]`);
      if (out) out.textContent = t.powers.includes('giantStrength') && s === 'strength' ? '20' : String(t.stats[s]);
    }
    if (all) {
      const name = d.querySelector<HTMLInputElement>('[data-e-name]');
      if (name) name.value = t.name;
      const age = d.querySelector<HTMLInputElement>('[data-e-age]');
      if (age) age.value = String(t.age);
      for (const s of STATS) {
        const r = d.querySelector<HTMLInputElement>(`[data-e-stat="${s}"]`);
        if (r) r.value = String(t.stats[s]);
      }
      const job = d.querySelector<HTMLSelectElement>('[data-e-job]');
      if (job) job.value = t.job;
      if (beard) beard.checked = t.look.beard;
    }
    paintPreview(this.preview, t);
  }

  /** The list of saved characters in the Life tab. */
  renderMine() {
    const box = this.root.querySelector<HTMLElement>('[data-mine-list]');
    if (!box) return;
    const list = loadTemplates();
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    box.innerHTML = list.length
      ? list
          .map(
            (t) =>
              `<span class="ti-mine"><button type="button" class="ti-mine__place" data-mine="${esc(t.id)}">✦ ${esc(t.name.trim() || this.S.unnamed)}</button>` +
              `<button type="button" class="ti-mine__x" data-mine-edit="${esc(t.id)}" aria-label="${esc(this.S.edit)}" title="${esc(this.S.edit)}">✎</button>` +
              `<button type="button" class="ti-mine__x" data-mine-del="${esc(t.id)}" aria-label="${esc(this.S.remove)}" title="${esc(this.S.remove)}">×</button></span>`,
          )
          .join('')
      : `<span class="ti-mine__empty">${esc(this.S.mineEmpty)}</span>`;
  }
}
