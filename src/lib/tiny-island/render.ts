/**
 * Draws the island. The map lives in an offscreen canvas (one pixel buffer of
 * 1280 × 800); only dirty tiles are redrawn into it. Every frame the visible
 * part is copied to the screen with nearest-neighbour scaling (pixel look),
 * then people, animals, graves and puffs, the brush outline and the glow of
 * windows and fires go on top (no nights since Update 3). Figures are tiny pixel sprites drawn from strings.
 */
import { GREY_HAIR, hasPower, PEOPLE_COLORS, stage, type Agent, type Human, type Look, type People, type Power, type Thought } from './agents';
import type { Camera } from './camera';
import { COLORS, paintTile } from './tiles';
import type { Sim } from './sim';
import { atWar, isWarrior, wallMax } from './war';
import { kingIds } from './kingdoms';
import { CONFETTI, festiveAt } from './culture';
import { ageIndex, knows } from './inventions';
import { SHOT_TIME, UNIT, type Unit } from './armies';
import { T, TILE, type Terrain, type World } from './world';
import { tileHash } from './rng';
import { dockOf, type Ship, type ShipKind } from './ships';
import { drawWonder } from './wonder-art';
import { progressOf } from './wonders';
import { claimTiles } from './territory';
import { livingRadius } from './roads';
import { SYMBOL_ICON } from './religion';
import { BALANCE } from './balance';
import type { Village } from './villages';

export { COLORS };
/** Radius of a hurricane in tiles (balance.ts), for its spiral. */
const BALANCE_HURRICANE = BALANCE.disasters.hurricaneRadius;

// People, 5 px wide (children 3 px), facing right. h hair, s skin, e eye,
// c clothes in the colour of their people, p darker clothes, d shoes.
const MAN = ['.hhh.', '.sse.', 'scccs', '.ccc.', '.ccc.', '.p.p.', '.p.p.'];
const MAN_WALK = ['.hhh.', '.sse.', 'scccs', '.ccc.', '.ccc.', '.p.p.', 'p...p'];
const WOMAN = ['.hhh.', 'hsseh', 'scccs', '.ccc.', 'ccccc', '.s.s.', '.d.d.'];
const WOMAN_WALK = ['.hhh.', 'hsseh', 'scccs', '.ccc.', 'ccccc', '.s.s.', 'd...d'];
const CHILD = ['hhh', 'sse', 'ccc', 'ccc', 'p.p'];
const CHILD_WALK = ['hhh', 'sse', 'ccc', 'ccc', '.p.'];
const SLEEP = ['hsccpp.', 'hsccppd'];
const SHEEP = ['.wwww..', 'wwwwwkk', 'wwwwwkk', '.wwwww.', '.k...k.'];
const SHEEP_COLORS = { w: '#f7f4ea', k: '#2b2b2b' };
const CHICKEN = ['..r.', '.wwy', 'www.', '.y..'];
const CHICKEN_COLORS = { r: '#e0362c', w: '#ffffff', y: '#f2b02a' };
const WOLF = ['.....g.g', 'g...gggg', 'gggggggk', '.gggggg.', '.d.d.d.d'];
const WOLF_RUN = ['.....g.g', '.g..gggg', 'gggggggk', '.gggggg.', 'd.d...d.'];
const WOLF_COLORS = { g: '#8b909c', k: '#1f1f1f', d: '#5d616b' };
/** Horses (phase F): wild on the grass, or carrying a rider. */
const HORSE = ['......h.', '.....hhk', 'mhhhhhh.', '.hhhhhh.', '.h.h.h.h', '.d.d.d.d'];
const HORSE_RUN = ['......h.', '.....hhk', 'mhhhhhh.', '.hhhhhh.', 'h..hh..h', 'd..dd..d'];
const HORSE_COLORS = { h: '#9a6a3e', m: '#3a2a20', k: '#3a2a20', d: '#3a2a20' };
/** Cows (Update 3): white with black patches. */
const COW = ['.......hh', 'wwkwwwwwk', 'wkkwwkwww', 'wwwwkkww.', '.w.w..w.w', '.k.k..k.k'];
const COW_COLORS = { w: '#f4f1e8', k: '#2b2b2b', h: '#d8c8a0' };
/** Sheds in the pens: a coop, a shelter, a stable. */
const SHED = ['.rrrrrr.', 'rrrrrrrr', '.wwwwww.', '.wDwwyw.', '.WDWWWW.'];
/** Ships and wrecks (phase G), bow to the right. f flag and c sails in the colour of the people. */
const SHIPS: Record<ShipKind, string[]> = {
  explorer: ['....f.....', '....ms....', '....mss...', '....msss..', '....mssss.', 'hhhhhhhhhh', '.HHHHHHHH.'],
  settler: ['...f....f...', '...ms...ms..', '...mss..mss.', '...msss.msss', '.pp.pp..pp..', 'hhhhhhhhhhhh', '.HHHHHHHHHH.'],
  trader: ['.....f......', '.....ms.....', '.....mss....', '.cc..msss...', '.ccC.mssss..', 'hhhhhhhhhhhh', '.HHHHHHHHHH.'],
  warship: ['....f.....f...', '....mc....mc..', '....mcc...mcc.', '....mccc..mccc', '....mcccc.mccc', 'hhhhhhhhhhhhhh', 'hkhkhkhkhkhkhh', '.HHHHHHHHHHHH.'],
};
const SHIP_COLORS = { h: '#8a5a2b', H: '#5a3a1e', m: '#5a3a1e', s: '#f4f1e8', p: '#e2b48c', C: '#8a5a2b', k: '#241a14' };
const WRECK = ['..m.......', '...m......', 'hh.hhh.hh.', '.HH.HHH...'];
// Buildings, bottom centre on the tile. r/R roof in the colour of the people,
// w/W wooden wall, g/G stone wall, y window, D door.
const TENT = ['....r....', '...rrr...', '..rrRrr..', '.rrrRrrr.', 'rrrrRrrrr', 'rrrRRRrrr', 'rrRRRRRrr'];
const HOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.wwwwwwww.', '.wywwwyww.', '.wwwDDwww.', '.wwwDDwww.', '.WWWDDWWW.'];
const STONE_HOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.gGgggGgg.', '.gyggggyg.', '.gggDDggG.', '.gGgDDggg.', '.GGGDDGGG.'];
const HOUSE_COLORS = { w: '#b07a45', W: '#8a5a2b', g: '#b4b9c2', G: '#8d929c', y: '#3a4a6a', D: '#5a3a1e' };
// Town buildings (Phase 8), bottom centre on their tile. r/R roof (people colours
// where it makes sense), w/W wood, g/G stone, y window, D door, o forge glow,
// k chimney, b bell, c/f goods, p columns, T marble.
const GRANARY = ['...ssss...', '..ssssss..', '.ssssssss.', 'ssssssssss', '.wwwwwwww.', '.wWwwwwWw.', '.wwwDDwww.', '.wWwDDwWw.', '.wwwDDwww.', '.WWWWWWWW.'];
const SMITHY = ['.......kk.', '.......kk.', '..RRRRRRR.', '.RRRRRRRRR', 'RRRRRRRRRR', '.gGgggggg.', '.googggDg.', '.googggDg.', '.GGGGGGDG.'];
const MARKET = ['rwrwrwrwrwr', 'rwrwrwrwrwr', '.b...b...b.', '.bcyfbcfyb.', '.b...b...b.'];
const TEMPLE = ['.....r.....', '....rrr....', '...rrrrr...', '..rrrrrrr..', '.rrrrrrrrr.', 'TTTTTTTTTTT', '.p.p.p.p.p.', '.p.p.p.p.p.', '.p.p.p.p.p.', 'TTTTTTTTTTT'];
const TOWNHALL = ['.....RR.....', '....rrrr....', '....rbbr....', '....rrrr....', '..RRRRRRRR..', '.RRRRRRRRRR.', 'RRRRRRRRRRRR', '.gggggggggg.', '.gyyggggyyg.', '.gggggggggg.', '.gyygDDgyyg.', '.ggggDDggggg', '.GGGGDDGGGG.'];
const TOWNHOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.gggggggg.', '.gyggggyg.', '.gggggggg.', '.gyggggyg.', '.gggDDggg.', '.GGGDDGGG.'];
/** Buildings of later ages (phase E): the windmill's sails are drawn turning on top. */
const WINDMILL = ['...k...', '..www..', '..wyw..', '..www..', '.wwwww.', '.wwDww.', '.WWDWW.'];
const LIBRARY = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'TTTTTTTTTT', '.p.p..p.p.', '.p.pccp.p.', '.p.pffp.p.', '.p.pDDp.p.', 'TTTTDDTTTT'];
/** A barracks (phase F): a long hall with a red flag. */
const BARRACKS = ['........cc', '........kc', '........k.', '.RRRRRRRk.', 'RRRRRRRRRR', '.gwwwwwwg.', '.gyw..wyg.', '.gwwDDwwg.', '.GWWDDWWG.'];
/** A harbor (phase G): a boat shed with a crane; the pier is drawn on the water next to it. */
const HARBOR = ['.......kkk', '.......k.y', '..RRRR.k..', '.RRRRRRk..', 'RRRRRRRRk.', '.wwwwwww..', '.wDwwyww..', 'WWDWWWWWW.'];
const FACTORY = ['........k.', '........k.', 'nnnnnnn.k.', 'nNnnNnnnkn', 'nnnnnnnnnn', 'nyynyynyyn', 'nnnnnnnnnn', 'nyynDDnyyn', 'NNNNDDNNNN'];
/** Update 3, phase C: buildings of every age, market stalls, yurts of the steppe. */
const TOTEM = ['.c...c.', 'cc.k.cc', '.ckkkc.', '..kfk..', '..kkk..', '..ckc..', '..kkk..', '..kfk..', '..kkk..', '..kck..', '..kkk..', '.mmmmm.'];
const SMOKEHOUSE = ['.......k.', '..hhhhhk.', '.hhhhhhhh', 'hhhhhhhhh', '.wwwwwww.', '.wWwwwWw.', '.wwwDwww.', '.wwwDwww.', '.WWWDWWW.'];
const WELL = ['.kkkkk.', '.k...k.', '.k.q.k.', '.k.q.k.', 'ggggggg', 'GuuuuuG', 'ggggggg', 'GGGGGGG'];
const ALTAR = ['...y.y...', '...oyo...', '.ggggggg.', '..g...g..', '..g...g..', '.GGGGGGG.'];
const WAREHOUSE = ['..RRRRRRRR..', '.RRRRRRRRRR.', 'RRRRRRRRRRRR', '.wwwwwwwwww.', '.wywwwwwwyw.', '.wwwWWWWwww.', '.wwwWmmWwww.', '.wwwWmmWwww.', '.WWWWmmWWWW.'];
const TAVERN = ['....rr.....', '...rrrr....', '..rrrrrr...', '.rrrrrrrr..', 'RRRRRRRRRR.', '.wwwwwwww.k', '.wywwwwyw.k', '.wwwwwwww.f', '.wwwDDwww.f', '.wwwDDwww..', '.WWWDDWWW..'];
const CATHEDRAL = ['..G.......G..', '.ggg.....ggg.', '.ggg.....ggg.', '.gyg..r..gyg.', '.ggg.rrr.ggg.', '.ggrrrrrrrgg.', '.grrrrrrrrrg.', 'ggggggggggggg', 'gGgggcfcgggGg', 'gGggcfcfcggGg', 'gGgggcfcgggGg', 'ggggggggggggg', 'gyggggDggggyg', 'gggggDDDggggg', 'GGGGGDDDGGGGG'];
const PALACE = ['.......b.......', '......rrr......', '.r...rrrrr...r.', 'rrr.rrrrrrr.rrr', 'TTTTTTTTTTTTTTT', 'TyTpTyTpTyTpTyT', 'TTTTTTTTTTTTTTT', 'TyTpTyTpTyTpTyT', 'TTTTTTDDDTTTTTT', 'TTTTTTDDDTTTTTT'];
const UNIVERSITY = ['......b......', '.....rrr.....', '.....ryr.....', '..rrrrrrrrr..', '.rrrrrrrrrrr.', 'TTTTTTTTTTTTT', 'TyyTyyTyyTyyT', 'TTTTTTTTTTTTT', 'TyyTyyDDTyyTT', 'TTTTTTDDTTTTT'];
const THEATER = ['.....fff.....', '...rrrrrrr...', '.rrrrrrrrrrr.', 'TTTTTTTTTTTTT', 'TpcccccccccpT', 'TpcfcccccfcpT', 'TpcccccccccpT', 'TpccccDccccpT', 'TTTTTDDDTTTTT'];
const MUSEUM = ['......f......', '.....TTT.....', '...TTTTTTT...', '.TTTTTTTTTTT.', 'TTTTTTTTTTTTT', '.p.p.p.p.p.p.', '.p.p.p.p.p.p.', '.p.p.pDp.p.p.', 'TTTTTDDDTTTTT'];
const OBSERVATORY = ['.......q.', '...ggg.q.', '..ggggqq.', '.gggggqg.', '.ggggggg.', 'ggggggggg', 'gyggggyGg', 'gggDDgggg', 'GGGDDGGGG'];
const STATION = ['......f......', '.....kfk.....', '.nnnnnnnnnnn.', 'nnnnnnnnnnnnn', 'nyynyynyynyyn', 'nnnnnnnnnnnnn', 'nyynnDDDnnyyn', 'NNNNNDDDNNNNN'];
const LIGHTHOUSE = ['..qqq..', '.qfffq.', '..qqq..', '..ccc..', '..zzz..', '..ccc..', '.zzzzz.', '.ccccc.', '.zzzzz.', '.ccccc.', '.zzzzz.', '.ccccc.', 'ggggggg'];
const PARK = ['.LL.....LL.', 'LLLL...LLLL', '.LL..f..LL.', '..k.fef.k..', '..k..e..k..', '.mmm...mmm.'];
const FARM = ['....rrr....', '...rrrrr...', '..rrrrrrr..', '.rrrrrrrrr.', 'nnnnnnnnnnn', 'nNnnnnnnnNn', 'nnnnWWWnnnn', 'nnnnWzWnnnn', 'NNNNWWWNNNN'];
const STALLS = ['cfcfc.rwrwr.ufufu', 'cfcfc.rwrwr.ufufu', '.k.k...k.k...k.k.', '.kyk...kck...kfk.', '.k.k...k.k...k.k.'];
const YURT_SMALL = ['...rrr...', '..rrrrr..', '.rRrRrRr.', 'rrrrrrrrr', 'hhhhhhhhh', 'hhhhDhhhh', 'hhhhDhhhh'];
const YURT_BIG = ['....rrr....', '..rrrrrrr..', '.rrRrRrRrr.', 'rrrrrrrrrrr', 'hhhhhhhhhhh', 'hRhhhhhhhRh', 'hhhhhDhhhhh', 'hhhhhDhhhhh'];
const BUILDING_SPRITES: Record<string, string[]> = {
  totem: TOTEM,
  smokehouse: SMOKEHOUSE,
  well: WELL,
  altar: ALTAR,
  warehouse: WAREHOUSE,
  tavern: TAVERN,
  cathedral: CATHEDRAL,
  palace: PALACE,
  university: UNIVERSITY,
  theater: THEATER,
  museum: MUSEUM,
  observatory: OBSERVATORY,
  station: STATION,
  lighthouse: LIGHTHOUSE,
  park: PARK,
  farm: FARM,
  granary: GRANARY,
  smithy: SMITHY,
  market: MARKET,
  temple: TEMPLE,
  townhall: TOWNHALL,
  windmill: WINDMILL,
  library: LIBRARY,
  factory: FACTORY,
  barracks: BARRACKS,
  harbor: HARBOR,
};
const BUILDING_COLORS = {
  s: '#a0522d',
  w: '#b07a45',
  W: '#8a5a2b',
  g: '#b4b9c2',
  G: '#8d929c',
  y: '#3a4a6a',
  D: '#5a3a1e',
  o: '#ff8a1e',
  k: '#5a3a1e',
  b: '#ffd23f',
  c: '#e8344a',
  f: '#ffe066',
  T: '#d8d4c8',
  p: '#f4f1e8',
  n: '#a0442c',
  N: '#7a3020',
  // Update 3
  h: '#d8b46a',
  m: '#6e4a24',
  q: '#3a3a42',
  u: '#4c9ae6',
  z: '#f4f1e8',
  e: '#e8344a',
  L: '#3a8f42',
};
/** Felt of the yurts (steppe), moss on the roofs (forest), slate (mountain). */
const FELT = { h: '#e9dcc0' };
const MOSS = { r: '#6b8f3a', R: '#4f6e2a' };
/** A little variety: three wood tones and three stone tones for houses. */
const WOOD_TONES = ['#b07a45', '#a06a3a', '#c08a50'];
const STONE_TONES = ['#b4b9c2', '#c3c6cc', '#a6abb6'];

const RUIN = ['..........', '..........', '..........', '.w......w.', '.ww....ww.', '.www..www.', '.wwWW.www.'];
const RUIN_COLORS = { w: '#8d8a84', W: '#6d6a64' };
const SITE = ['.b......b.', '.bbbbbbbb.', '.b..b...b.', '.b..b...b.', '.bbbbbbbb.', '.b..b...b.', '.b......b.'];
const SITE_COLORS = { b: '#a0703c' };
const FIRE_A = ['..y..', '.yoy.', '.ooo.', 'lllll'];
const FIRE_B = ['.y...', '.oy..', '.ooo.', 'lllll'];
const FIRE_COLORS = { y: '#ffe066', o: '#ff8a1e', l: '#6b4325' };
const LOGS = ['.ll.', 'llll', 'llll'];
const STONES = ['.s.', 'sss'];
const BASKET = ['r.y', 'bbb', 'bbb'];
const STORE_COLORS = { l: '#8a5a2b', s: '#9aa0aa', r: '#e8344a', y: '#ffe066', b: '#c8a26a' };

const THOUGHTS: Record<Thought, string[]> = {
  heart: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
  sword: ['....g', '...g.', 'b.g..', '.b...', 'b.b..'],
  tear: ['..u..', '.uu..', '.uuu.', 'uuuuu', '.uuu.'],
  food: ['..l..', '.rrr.', 'rrrrr', 'rrrrr', '.rrr.'],
  note: ['..kk.', '..k.k', '..k..', 'kkk..', 'kkk..'],
  light: ['..y..', 'y.y.y', '.yyy.', 'yyyyy', '.yyy.'],
  happy: ['.....', '.k.k.', '.....', 'k...k', '.kkk.'],
  sad: ['.....', '.k.k.', '.....', '.kkk.', 'k...k'],
};
/** A holy place (Update 3): a small shrine of stone with a light. */
const SHRINE = ['..y..', '.yfy.', '..g..', '.ggg.', 'gGgGg', 'GGGGG'];
const SHRINE_COLORS = { y: '#ffe066', f: '#ffffff', g: '#c3c6cc', G: '#8d929c' };
/** A tiny tool in the hand for each job: [x, y, colour] pixels, relative to the hand. */
const TOOLS: Record<string, [number, number, string][]> = {
  farmer: [[0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#b4b9c2']],
  fisher: [[0, -4, '#8a5a2b'], [0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [1, -4, '#ffffff'], [1, -3, '#ffffff']],
  woodcutter: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [1, -2, '#b4b9c2'], [1, -3, '#b4b9c2']],
  stonemason: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#9aa0aa'], [0, -3, '#9aa0aa'], [1, -3, '#9aa0aa']],
  miner: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#6c727d'], [0, -3, '#6c727d'], [1, -3, '#6c727d'], [-1, -4, '#ffd36b']],
  smith: [[0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -2, '#4a4e57'], [0, -2, '#4a4e57'], [1, -2, '#4a4e57']],
  builder: [[0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -2, '#c08a4a'], [0, -2, '#c08a4a']],
  artist: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, -3, '#ff5da2']],
  soldier: [[0, -4, '#b4b9c2'], [0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b']],
  shepherd: [[1, -5, '#8a5a2b'], [0, -5, '#8a5a2b'], [0, -4, '#8a5a2b'], [0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b']],
  priest: [[0, -4, '#ffe066'], [-1, -3, '#ffe066'], [0, -3, '#ffe066'], [1, -3, '#ffe066'], [0, -2, '#ffe066'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b']],
  missionary: [[0, -3, '#f4f1e8'], [1, -3, '#e8344a'], [0, -2, '#f4f1e8'], [1, -2, '#e8344a'], [0, -1, '#8a5a2b']],
};
const THOUGHT_COLORS: Record<string, string> = { r: '#e8344a', g: '#8b93a3', b: '#8a5a2b', u: '#4d8dff', l: '#3aa64b', k: '#111111', y: '#f2b02a' };
/** Blades: a flint knife without a weapon from the smith, then bronze and iron swords. */
const BLADE = { flint: '#a89a84', bronze: '#d08a3a', iron: '#d7dbe3' };
/** Units that carry something else than a sword or club (phase F). */
const GEAR = new Set<Unit>(['spear', 'archer', 'crossbow', 'musketeer', 'catapult', 'cannon']);
const BOAT = ['w......w', 'wwwwwwww', '.WWWWWW.'];
/** A statue of marble on a stone base (Phase 12). */
const STATUE = ['..m..', '.mmm.', 'm.m.m', '..m..', '.mmm.', '.m.m.', 'ppppp', '.PPP.'];
const STATUE_COLORS = { m: '#e8e4d8', p: '#9aa0aa', P: '#7a808a' };
const BOAT_COLORS = { w: '#b07a45', W: '#8a5a2b' };
const GRAVE = ['.GGG.', 'GGgGG', 'GgggG', 'GGgGG', 'GGGGG', 'ddddd'];
const GRAVE_COLORS = { G: '#a3a9b4', g: '#6c727d', d: '#7a5c3c' };

/* ---- people: sprite, looks and the editor preview (shared) ---------------------------- */

/** A darker shade of a colour (trousers under a shirt of that colour). */
function shade(hex: string, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

interface PersonLook {
  female: boolean;
  hair: string;
  skin: string;
  people: People;
  look?: Look;
  powers?: Power[];
}

/**
 * Rows and colours of a person's sprite. Own characters may wear their own
 * clothing colour; eternal youth keeps an old body young and the hair dark.
 */
export function personSprite(p: PersonLook, age: 'child' | 'adult' | 'old', walking: boolean) {
  const shown = age === 'old' && hasPower(p, 'eternalYouth') ? 'adult' : age;
  const people = PEOPLE_COLORS[p.people];
  const cloth = p.look?.cloth ?? people.cloth;
  const colors: Record<string, string> = {
    h: shown === 'old' ? GREY_HAIR : p.hair,
    s: p.skin,
    e: '#241a14',
    c: cloth,
    p: p.look?.cloth ? shade(cloth) : people.dark,
    d: '#3a2a20',
  };
  const rows = shown === 'child' ? (walking ? CHILD_WALK : CHILD) : p.female ? (walking ? WOMAN_WALK : WOMAN) : walking ? MAN_WALK : MAN;
  return { rows, colors, shown };
}

/**
 * Hair style, beard and hat over a grown-up sprite (5 wide). `dot(x, y, c)`
 * paints one pixel, x 0…4 from the left of the sprite, y from its top row
 * (negative = above the head).
 */
export function drawLook(look: Look, colors: Record<string, string>, dot: (x: number, y: number, c: string) => void) {
  const hair = colors.h;
  if (look.hairStyle === 'bald') for (let x = 1; x <= 3; x++) dot(x, 0, colors.s);
  if (look.hairStyle === 'long') {
    dot(0, 1, hair);
    dot(4, 1, hair);
    dot(0, 2, hair);
    dot(4, 2, hair);
  }
  if (look.hairStyle === 'bun') dot(2, -1, hair);
  if (look.hairStyle === 'spiky') {
    dot(1, -1, hair);
    dot(3, -1, hair);
  }
  if (look.beard) for (let x = 1; x <= 3; x++) dot(x, 2, hair);
  if (look.hat === 'hat') {
    for (let x = 0; x <= 4; x++) dot(x, 0, '#5a3a1e');
    for (let x = 1; x <= 3; x++) dot(x, -1, '#7a4a24');
  } else if (look.hat === 'crown') {
    for (let x = 1; x <= 3; x++) dot(x, -1, '#ffc83d');
    dot(1, -2, '#ffc83d');
    dot(3, -2, '#ffc83d');
    dot(2, -1, '#e8344a');
  } else if (look.hat === 'hood') {
    for (let x = 0; x <= 4; x++) dot(x, 0, colors.c);
    for (let x = 1; x <= 3; x++) dot(x, -1, colors.c);
    dot(0, 1, colors.c);
    dot(4, 1, colors.c);
  } else if (look.hat === 'flower') {
    dot(4, 0, '#ff5da2');
    dot(4, -1, '#ffe066');
  }
}

/** The editor preview: the person drawn big on its own canvas (pixel look). */
export function paintPreview(canvas: HTMLCanvasElement, p: PersonLook & { age: number }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.floor(Math.min(canvas.width / 9, canvas.height / 11));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const age = p.age < 15 ? 'child' : p.age >= 60 ? 'old' : 'adult';
  const { rows, colors, shown } = personSprite(p, age, false);
  const w = rows[0].length;
  const x0 = Math.round((canvas.width - w * scale) / 2);
  const y0 = Math.round(canvas.height - (rows.length + 1) * scale);
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
  };
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++) if (colors[rows[r][c]]) dot(c, r, colors[rows[r][c]]);
  if (shown !== 'child' && p.look) drawLook(p.look, colors, dot);
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private px: Uint32Array;
  private dpr = 1;
  private selected: number | null = null;
  /** Update 3: the house or building whose profile is open (a golden frame). */
  selectedBuilding: { kind: string; village: number; x: number; y: number; id?: number } | null = null;
  /** Update 3, phase D: the places tinted in the colour of their faith (Religions tab). */
  faithView = false;
  /** Update 3, phase B: how the land is shown (key G): tinted with borders, stronger, or not at all. */
  borders: 'normal' | 'strong' | 'off' = 'normal';
  /** The tint of the land, one pixel per tile, and the borders, stones and hatching, rebuilt when land changes hands. */
  private readonly landCanvas: HTMLCanvasElement;
  private landKey = '';
  private landLines: { thin: Map<People, Path2D>; thick: Path2D; hatch: { people: People; path: Path2D }[]; stones: [number, number][] } | null = null;
  /** Window and fire spots (world px) that glow softly. */
  private readonly lights: [number, number][] = [];
  /** Text after a village name when it lies in ruins. */
  ruinsLabel = 'ruins';
  /** Generals of the armies on the move (they carry a banner), refreshed every frame. */
  private generals = new Set<number>();
  /** The place whose profile is open: its sign is golden. */
  selectedVillage: number | null = null;
  /** Where the signs were drawn last frame (CSS px), for clicks. */
  private signs: { id: number; x: number; y: number; w: number; h: number }[] = [];
  /** Ruling kings and queens (a big crown), refreshed every frame. */
  private kings = new Set<number>();
  /** Names of the tiers for the signs ("town", "city"). */
  tierLabels: Record<string, string> = { town: 'town', city: 'city' };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: World,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.map = document.createElement('canvas');
    this.mapCtx = this.map.getContext('2d')!;
    this.image = this.mapCtx.createImageData(1, 1);
    this.px = new Uint32Array(this.image.data.buffer);
    this.landCanvas = document.createElement('canvas');
    this.sizeMap();
  }

  /** The offscreen map as big as the world (old islands 1280 × 800, new worlds 2560 × 1600). */
  private sizeMap() {
    const w = this.world.w * TILE;
    const h = this.world.h * TILE;
    if (this.map.width === w && this.map.height === h && this.image.width === w) return;
    this.map.width = w;
    this.map.height = h;
    this.mapCtx = this.map.getContext('2d')!;
    this.image = this.mapCtx.createImageData(w, h);
    this.px = new Uint32Array(this.image.data.buffer);
    this.world.all = true;
  }

  /**
   * Land and borders (Update 3, phase B): the land of each people tinted in
   * its colour, a thin line where it meets free land, a thicker dark one
   * between two peoples, little border stones along them, and claimed land
   * hatched in the colour of whoever claims it. Rebuilt only when land
   * changes hands, a place changes people or the claims change.
   */
  private drawLand(cam: Camera, sim: Sim) {
    const world = this.world;
    const strong = this.borders === 'strong';
    const key = `${world.uid}|${world.ownerVersion}|${sim.claimsVersion}|${this.borders}|${sim.villages.map((v) => v.people[0]).join('')}`;
    if (key !== this.landKey || !this.landLines) {
      this.landKey = key;
      this.buildLand(sim, strong);
    }
    const { ctx } = this;
    const lines = this.landLines!;
    ctx.drawImage(this.landCanvas, 0, 0, world.w, world.h, 0, 0, world.w * TILE, world.h * TILE);
    ctx.lineCap = 'square';
    ctx.globalAlpha = strong ? 0.75 : 0.5;
    ctx.lineWidth = 1;
    for (const h of lines.hatch) {
      ctx.strokeStyle = PEOPLE_COLORS[h.people].dark;
      ctx.stroke(h.path);
    }
    // The border in the people's colour on a dark edge, so it shows on grass and forest alike
    ctx.globalAlpha = strong ? 1 : 0.85;
    for (const [p, path] of lines.thin) {
      ctx.lineWidth = strong ? 2.2 : 1.6;
      ctx.strokeStyle = PEOPLE_COLORS[p].dark;
      ctx.stroke(path);
      ctx.lineWidth = strong ? 1.1 : 0.7;
      ctx.strokeStyle = PEOPLE_COLORS[p].cloth;
      ctx.stroke(path);
    }
    ctx.lineWidth = strong ? 3 : 2;
    ctx.strokeStyle = '#3a2412';
    ctx.stroke(lines.thick);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    // Border stones, once there is room to see them
    if (cam.zoom >= 1.6) {
      for (const [x, y] of lines.stones) {
        ctx.fillStyle = '#5a5248';
        ctx.fillRect(x - 1, y - 0.5, 2, 2);
        ctx.fillStyle = '#b9b2a6';
        ctx.fillRect(x - 1, y - 1, 2, 1.5);
      }
    }
  }

  private buildLand(sim: Sim, strong: boolean) {
    const world = this.world;
    const { w, h } = world;
    if (this.landCanvas.width !== w || this.landCanvas.height !== h) {
      this.landCanvas.width = w;
      this.landCanvas.height = h;
    }
    const peopleOf = new Map(sim.villages.map((v) => [v.id, v.people]));
    const at = (i: number) => (world.owner[i] >= 0 ? (peopleOf.get(world.owner[i]) ?? null) : null);
    const lctx = this.landCanvas.getContext('2d')!;
    const img = lctx.createImageData(w, h);
    const d = img.data;
    const rgb = new Map<People, [number, number, number]>();
    const alpha = strong ? 110 : 56;
    const thin = new Map<People, Path2D>();
    const thick = new Path2D();
    const stones: [number, number][] = [];
    const edge = (x0: number, y0: number, x1: number, y1: number, a: People | null, b: People | null, tx: number, ty: number) => {
      if (a && b) {
        thick.moveTo(x0, y0);
        thick.lineTo(x1, y1);
        if (tileHash(tx, ty, 91) < 0.16) stones.push([(x0 + x1) / 2, (y0 + y1) / 2]);
        return;
      }
      const p = (a ?? b)!;
      let path = thin.get(p);
      if (!path) thin.set(p, (path = new Path2D()));
      path.moveTo(x0, y0);
      path.lineTo(x1, y1);
      if (tileHash(tx, ty, 92) < 0.07) stones.push([(x0 + x1) / 2, (y0 + y1) / 2]);
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = at(i);
        if (p) {
          let c = rgb.get(p);
          if (!c) {
            const hex = PEOPLE_COLORS[p].cloth;
            c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
            rgb.set(p, c);
          }
          d[i * 4] = c[0];
          d[i * 4 + 1] = c[1];
          d[i * 4 + 2] = c[2];
          d[i * 4 + 3] = alpha;
        }
        // Edges to the right and below; none along the coast
        if (x + 1 < w) {
          const q = at(i + 1);
          if (p !== q && (p ? q || world.landTile(i + 1) : world.landTile(i))) edge((x + 1) * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE, p, q, x, y);
        }
        if (y + 1 < h) {
          const q = at(i + w);
          if (p !== q && (p ? q || world.landTile(i + w) : world.landTile(i))) edge(x * TILE, (y + 1) * TILE, (x + 1) * TILE, (y + 1) * TILE, p, q, x + 1000, y);
        }
      }
    }
    lctx.putImageData(img, 0, 0);
    // Claimed land: stripes in the colour of the claimant
    const hatch = sim.claims.map((c) => {
      const path = new Path2D();
      for (const i of claimTiles(sim, c)) {
        const x = (i % w) * TILE;
        const y = ((i / w) | 0) * TILE;
        path.moveTo(x, y + TILE);
        path.lineTo(x + TILE, y);
        path.moveTo(x, y + TILE / 2);
        path.lineTo(x + TILE / 2, y);
        path.moveTo(x + TILE / 2, y + TILE);
        path.lineTo(x + TILE, y + TILE / 2);
      }
      return { people: c.by, path };
    });
    this.landLines = { thin, thick, hatch, stones };
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
  }

  /* ---- map buffer ---------------------------------------------------------- */

  /** Writes changed tiles into the offscreen map. */
  flush() {
    const world = this.world;
    this.sizeMap();
    const W = world.w;
    const H = world.h;
    if (world.all) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(this.world, this.px, x, y);
      this.mapCtx.putImageData(this.image, 0, 0);
      world.all = false;
      world.dirty.clear();
      return;
    }
    if (!world.dirty.size) return;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const i of world.dirty) {
      const x = i % W;
      const y = (i / W) | 0;
      paintTile(this.world, this.px, x, y);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    world.dirty.clear();
    this.mapCtx.putImageData(this.image, 0, 0, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  }

  /* ---- screen ---------------------------------------------------------------- */

  /** One frame: map, life, brush outline, glow. */
  draw(cam: Camera, sim: Sim, brush: { x: number; y: number; r: number } | null, selected: number | null = null) {
    this.selected = selected;
    const { ctx, dpr } = this;
    const s = cam.zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.deep;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const ox = (cam.vw / 2 - cam.x * cam.zoom) * dpr;
    const oy = (cam.vh / 2 - cam.y * cam.zoom) * dpr;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    // Only the part of the map on screen (a big world is 2560 × 1600 pixels)
    const vx0 = Math.max(0, Math.floor(cam.x - cam.vw / 2 / cam.zoom) - 1);
    const vy0 = Math.max(0, Math.floor(cam.y - cam.vh / 2 / cam.zoom) - 1);
    const vx1 = Math.min(this.map.width, Math.ceil(cam.x + cam.vw / 2 / cam.zoom) + 1);
    const vy1 = Math.min(this.map.height, Math.ceil(cam.y + cam.vh / 2 / cam.zoom) + 1);
    if (vx1 > vx0 && vy1 > vy0) ctx.drawImage(this.map, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
    if (this.borders !== 'off') this.drawLand(cam, sim);
    this.drawScars(sim);
    this.drawLife(cam, sim);
    this.drawDisasters(sim);
    this.drawSelectedBuilding(sim, cam);
    // No fog on the screen any more (Update 3): the player always sees the whole world;
    // what the peoples know (world.fog) only steers explorers and discoveries

    if (brush) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1 / cam.zoom;
      const r2 = brush.r * brush.r + brush.r;
      for (let dy = -brush.r; dy <= brush.r; dy++)
        for (let dx = -brush.r; dx <= brush.r; dx++)
          if (dx * dx + dy * dy <= r2) ctx.strokeRect((brush.x + dx) * TILE + 0.5 / cam.zoom, (brush.y + dy) * TILE + 0.5 / cam.zoom, TILE - 1 / cam.zoom, TILE - 1 / cam.zoom);
    }

    // Lit windows and fires: a small warm flicker, each at its own pace (always day since Update 3)
    ctx.fillStyle = '#ffd36b';
    for (const [lx, ly] of this.lights) {
      ctx.globalAlpha = 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(sim.time * 3 + lx * 0.7 + ly * 1.3));
      ctx.fillRect(lx, ly, 1, 1);
    }
    ctx.globalAlpha = 1;
    this.drawLabels(cam, sim, this.ruinsLabel);
  }

  /* ---- villages ---------------------------------------------------------------- */

  /** Squares, storage, houses and building sites; window spots are kept for the night lights. */
  private drawVillages(sim: Sim, visible: (a: { x: number; y: number }) => boolean) {
    const ctx = this.ctx;
    this.lights.length = 0;
    this.trains(sim);
    this.holyPlaces(sim, visible);
    for (const v of sim.villages) {
      if (v.merged) continue;
      if (!visible({ x: v.x + 0.5, y: v.y + 0.5 }) && !v.houses.some((h) => visible({ x: h.x + 0.5, y: h.y + 0.5 }))) continue;
      const cloth = PEOPLE_COLORS[v.people];
      const roof = { r: cloth.cloth, R: cloth.dark };
      const cx = v.x * TILE + 4;
      const cy = v.y * TILE + 4;

      // The square: a patch of trodden earth, bigger in towns and cities
      const tier = v.tier ?? 'village';
      const grow = tier === 'city' ? 4 : tier === 'town' ? 2 : 0;
      ctx.fillStyle = v.ruin ? 'rgba(150, 135, 110, 0.45)' : 'rgba(214, 186, 132, 0.75)';
      ctx.fillRect(cx - 9 - grow, cy - 5 - grow, 18 + grow * 2, 11 + grow * 2);
      ctx.fillRect(cx - 7 - grow, cy - 7 - grow, 14 + grow * 2, 15 + grow * 2);

      // The wall around the houses: a palisade, stone with towers, a castle wall (Update 3)
      if (!v.ruin && v.buildings.some((b) => b.kind === 'wall')) {
        const full = wallMax(sim, v);
        this.wall(sim, v, cx, cy, 1 - (v.wallHp ?? full) / full);
      }

      for (const b of v.buildings) {
        const px = b.x * TILE + 4;
        const py = b.y * TILE + 8;
        // Castles and pens are drawn in their own way (Update 3)
        if (b.kind === 'castle') {
          this.castle(px, b.y * TILE + 4, cloth, v.ruin, sim.time);
          continue;
        }
        if (b.kind === 'pen') {
          this.pen(b, roof, v.ruin);
          continue;
        }
        // Middle Ages: the market gets stalls in all colours
        const rows = b.kind === 'market' && ageIndex(sim, v.people) >= 3 ? STALLS : BUILDING_SPRITES[b.kind];
        if (!rows) continue;
        this.figure(rows, { ...BUILDING_COLORS, r: v.ruin ? '#8d8a84' : b.kind === 'market' ? cloth.cloth : roof.r, R: v.ruin ? '#6d6a64' : roof.R }, px, py, false);
        if (v.ruin) continue;
        if (b.kind === 'tavern' || b.kind === 'palace' || b.kind === 'university' || b.kind === 'station') this.lights.push([px - 2, py - 4]);
        if (b.kind === 'altar') this.lights.push([px, py - 5]);
        if (b.kind === 'lighthouse') this.lights.push([px, py - 12]);
        if (b.kind === 'smokehouse') this.smoke(px + 3, py - 9, sim.time, b.x * 5 + b.y, '#cfcfcf');
        if (b.kind === 'townhall' || b.kind === 'temple') this.lights.push([px - 3, py - 4]);
        if (b.kind === 'smithy') this.lights.push([px - 3, py - 3]);
        if (b.kind === 'windmill' && !v.ruin) this.sails(px, py - 6, sim.time);
        if (b.kind === 'factory' && !v.ruin) this.smoke(px + 3, py - 9, sim.time, b.x * 7 + b.y, '#8a8a8a');
        if (b.kind === 'library') this.lights.push([px - 2, py - 4]);
        if (b.kind === 'harbor') this.pier(b, px, py);
        // Banks: gold coins at the market
        if (b.kind === 'market' && !v.ruin && knows(sim, v.people, 'banking')) {
          ctx.fillStyle = '#ffc83d';
          ctx.fillRect(px - 3, py - 2, 2, 1);
          ctx.fillRect(px + 2, py - 2, 2, 1);
          ctx.fillRect(px - 2, py - 3, 1, 1);
        }
      }

      for (const h of v.houses) {
        const px = h.x * TILE + 4;
        const py = h.y * TILE + 8;
        if (v.ruin) {
          this.figure(RUIN, RUIN_COLORS, px, py, false);
          continue;
        }
        // Every people builds its own way (Update 3): yurts in the steppe, moss roofs and wood in
        // the forest, stone in the mountains, houses on stilts by the water on the coast
        const p = v.people;
        const yurt = p === 'steppe' && h.level <= 1;
        const rows = yurt ? (h.level === 0 ? YURT_SMALL : YURT_BIG) : h.level === 0 ? TENT : h.level === 1 ? HOUSE : h.level === 2 ? STONE_HOUSE : TOWNHOUSE;
        const tone = (h.x * 3 + h.y * 7) % 3;
        const wood = p === 'mountain' ? STONE_TONES[tone] : WOOD_TONES[tone];
        const stone = p === 'forest' ? WOOD_TONES[tone] : STONE_TONES[tone];
        const stilts = p === 'coast' && h.level >= 1 && this.byWater(sim, h.x, h.y);
        const lift = stilts ? 2 : 0;
        if (stilts) {
          ctx.fillStyle = '#6e4a24';
          ctx.fillRect(px - 3, py - 2, 1, 3);
          ctx.fillRect(px + 2, py - 2, 1, 3);
        }
        this.figure(rows, { ...HOUSE_COLORS, ...FELT, w: wood, W: p === 'mountain' ? '#8d929c' : HOUSE_COLORS.W, g: stone, ...roof, ...(p === 'forest' ? MOSS : {}) }, px, py - lift, false);
        if (h.level === 3) this.lights.push([px - 3, py - 7]);
        if (h.level > 0) {
          this.lights.push([px - 3, py - 4]);
          this.lights.push([px + 1, py - 4]);
          // Chimney with a thin wisp of smoke
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(Math.round(px) + 2, py - 11, 2, 3);
          const seed = ((h.x * 7 + h.y * 13) % 10) / 10;
          for (let k = 0; k < 3; k++) {
            const t = (sim.time * 0.35 + k / 3 + seed) % 1;
            ctx.globalAlpha = 0.7 * (1 - t);
            ctx.fillStyle = '#e4e4e4';
            ctx.fillRect(Math.round(px + 3 + Math.sin((t + seed) * 6) * 1.5), Math.round(py - 12 - t * 10), 2, 2);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (v.ruin) continue;

      // Statues next to the square, murals (a few bright pixels) on house walls
      for (const p of v.art ?? []) {
        const px = p.x * TILE + 4;
        const py = p.y * TILE + 8;
        if (p.kind === 'statue') {
          this.figure(STATUE, STATUE_COLORS, px, py, false);
          continue;
        }
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = CONFETTI[(p.work + i) % 5];
          ctx.fillRect(px + 1 + (i % 3), py - 3 + Math.floor(i / 3), 1, 1);
        }
      }
      // Festival: bunting in all colours around the square
      if (festiveAt(v, sim)) {
        const n = 30;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.fillStyle = CONFETTI[i % 5];
          ctx.fillRect(Math.round(cx + Math.cos(a) * 18) - 1, Math.round(cy + Math.sin(a) * 12) - 1, 2, 2);
        }
      }

      const s = v.site;
      if (s) this.figure(SITE, SITE_COLORS, s.x * TILE + 4, s.y * TILE + 8, false);

      // Fire in the middle
      const flicker = Math.floor(sim.time * 8) % 2;
      this.figure(flicker ? FIRE_A : FIRE_B, FIRE_COLORS, cx, cy + 3, false);
      this.lights.push([cx, cy]);

      // Storage next to the fire
      if (v.wood > 0) this.figure(LOGS, STORE_COLORS, cx + 7, cy + 4, false);
      if (v.stone > 0) this.figure(STONES, STORE_COLORS, cx + 7, cy - 1, false);
      if (v.food > 0) this.figure(BASKET, STORE_COLORS, cx - 7, cy + 4, false);

      // Banner in the colours of the people
      ctx.fillStyle = '#6b4325';
      ctx.fillRect(cx - 7, cy - 12, 1, 9);
      ctx.fillStyle = cloth.cloth;
      ctx.fillRect(cx - 6, cy - 12, 4, 3);
      // A league member: a pennant in the league's colour under it
      const league = sim.leagues.find((l) => l.members.includes(v.id));
      if (league) {
        ctx.fillStyle = league.color;
        ctx.fillRect(cx - 6, cy - 9, 3, 2);
        ctx.fillRect(cx - 6, cy - 7, 2, 1);
      }
      // At war: a red war flag with crossed swords flies next to it
      if (atWar(sim, { people: v.people, village: v.id })) {
        const wave = Math.floor(sim.time * 4) % 2;
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(cx + 6, cy - 14, 1, 11);
        ctx.fillStyle = '#c62828';
        ctx.fillRect(cx + 7, cy - 14, 5, 4);
        ctx.fillRect(cx + 7 + 5, cy - 14 + wave, 1, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 8, cy - 13, 1, 1);
        ctx.fillRect(cx + 10, cy - 13, 1, 1);
        ctx.fillRect(cx + 9, cy - 12, 1, 1);
        ctx.fillRect(cx + 8, cy - 11, 1, 1);
        ctx.fillRect(cx + 10, cy - 11, 1, 1);
      }
    }
  }

  /** Windmill sails, slowly turning around their hub. */
  private sails(x: number, y: number, time: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const a = time * 1.5 + (i * Math.PI) / 2;
      for (let j = 1; j <= 4; j++) {
        ctx.fillStyle = j === 4 ? '#8a5a2b' : '#f4f1e8';
        ctx.fillRect(Math.round(x + Math.cos(a) * j), Math.round(y + Math.sin(a) * j * 0.9), 1, 1);
      }
    }
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** A rising wisp of smoke. */
  private smoke(x: number, y: number, time: number, seed: number, colour: string) {
    const ctx = this.ctx;
    for (let k = 0; k < 4; k++) {
      const t = (time * 0.4 + k / 4 + (seed % 10) / 10) % 1;
      ctx.globalAlpha = 0.75 * (1 - t);
      ctx.fillStyle = colour;
      ctx.fillRect(Math.round(x + Math.sin(t * 6) * 2), Math.round(y - t * 12), 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  /** Holy places of the living faiths (Update 3): shrines with a light; the faith map tints whole places. */
  private holyPlaces(sim: Sim, visible: (a: { x: number; y: number }) => boolean) {
    const ctx = this.ctx;
    for (const r of sim.religions) {
      if (r.gone) continue;
      for (const p of r.holy) {
        if (!visible({ x: p.x + 0.5, y: p.y + 0.5 })) continue;
        const px = p.x * TILE + 4;
        const py = p.y * TILE + 7;
        ctx.fillStyle = r.color;
        ctx.fillRect(px - 3, py, 7, 1);
        this.figure(SHRINE, SHRINE_COLORS, px, py, false);
        this.lights.push([px, py - 5]);
      }
    }
    if (!this.faithView) return;
    for (const v of sim.villages) {
      if (v.ruin || v.merged || v.faith === undefined) continue;
      const r = sim.religions.find((x) => x.id === v.faith);
      if (!r) continue;
      const rad = (livingRadius(v) + 2) * TILE;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(v.x * TILE + 4, v.y * TILE + 4, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** A golden frame around the house or building whose profile is open. */
  private drawSelectedBuilding(sim: Sim, cam: Camera) {
    const b = this.selectedBuilding;
    if (!b) return;
    const v = sim.villages.find((x) => x.id === b.village);
    const kind = b.kind === 'building' ? v?.buildings.find((o) => o.x === b.x && o.y === b.y)?.kind : undefined;
    const half = b.kind === 'wonder' ? 0 : kind === 'castle' || kind === 'pen' ? 2 : 0;
    const size = b.kind === 'wonder' ? 4 : 1 + half * 2;
    const x0 = (b.x - half) * TILE - 1;
    const y0 = (b.y - half - (b.kind === 'wonder' ? 0 : half ? 0 : 1)) * TILE - 1;
    const ctx = this.ctx;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(1, 2 / cam.zoom);
    ctx.strokeRect(x0, y0, size * TILE + 2, (size + (half || b.kind === 'wonder' ? 0 : 1)) * TILE + 2);
  }

  /** Burn scars (Update 3): dark patches where a fire was, for a few years. */
  private drawScars(sim: Sim) {
    if (!sim.scorched.size) return;
    const ctx = this.ctx;
    const w = sim.world;
    for (const i of sim.scorched.keys()) {
      const x = (i % w.w) * TILE;
      const y = Math.floor(i / w.w) * TILE;
      ctx.fillStyle = 'rgba(45, 35, 25, 0.35)';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.5)';
      ctx.fillRect(x + ((i * 3) % 5), y + ((i * 7) % 5), 2, 2);
    }
  }

  /**
   * Disasters on top of everything (Update 3): flames and smoke, lava, the
   * smoking mountain, the hurricane's spiral, lightning, rain, the glare of a
   * heatwave.
   */
  private drawDisasters(sim: Sim) {
    const ctx = this.ctx;
    const w = sim.world;
    const t = sim.time;
    // Lava: glowing orange, darker as it cools
    for (const [i, until] of sim.lava) {
      const x = (i % w.w) * TILE;
      const y = Math.floor(i / w.w) * TILE;
      const cool = until - t < 8;
      ctx.fillStyle = cool ? '#8a2a12' : '#ff5a1e';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = cool ? '#5a2010' : (i + Math.floor(t * 4)) % 3 ? '#ffb000' : '#ffe066';
      ctx.fillRect(x + ((i * 5) % 6), y + ((i * 3) % 6), 2, 2);
      if (!cool) this.lights.push([x + 4, y + 4]);
    }
    // Fires: three flickering flames per tile and a wisp of smoke
    for (const i of sim.fires.keys()) {
      const x = (i % w.w) * TILE;
      const y = Math.floor(i / w.w) * TILE;
      for (let k = 0; k < 3; k++) {
        const fl = (Math.floor(t * 8) + k + i) % 3;
        const fx = x + 1 + k * 2.5;
        ctx.fillStyle = '#ff5a1e';
        ctx.fillRect(fx, y + 3 + fl, 2, 5 - fl);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(fx, y + 5 + fl, 1, 2);
      }
      const s = (t * 0.7 + (i % 7) / 7) % 1;
      ctx.globalAlpha = 0.6 * (1 - s);
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(x + 3 + Math.sin(s * 6) * 2, y - s * 14, 3, 3);
      ctx.globalAlpha = 1;
      this.lights.push([x + 4, y + 4]);
    }
    // Volcanoes: smoke rising from the crater (red glow and sparks when it erupts)
    for (const v of sim.volcanoes) {
      const cx = v.x * TILE + 4;
      const cy = v.y * TILE + 2;
      const erupting = t >= v.erupts;
      for (let k = 0; k < 6; k++) {
        const s = (t * 0.25 + k / 6) % 1;
        ctx.globalAlpha = 0.65 * (1 - s);
        ctx.fillStyle = erupting && k % 2 ? '#3a3030' : '#8a8a8a';
        const r = 2 + s * 6;
        ctx.fillRect(cx - r / 2 + Math.sin(s * 5 + k) * 3, cy - s * 40 - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
      if (erupting) {
        ctx.fillStyle = '#ff5a1e';
        ctx.fillRect(cx - 3, cy - 1, 6, 3);
        for (let k = 0; k < 5; k++) {
          const s = (t * 1.3 + k / 5) % 1;
          ctx.fillStyle = k % 2 ? '#ffe066' : '#ff8a1e';
          ctx.fillRect(cx + Math.cos(k * 1.7) * s * 10, cy - Math.sin(s * Math.PI) * 14, 1, 1);
        }
      }
    }
    // The hurricane: a dark disc and three turning arms of cloud and rain
    const hu = sim.hurricane;
    if (hu) {
      const cx = hu.x * TILE;
      const cy = hu.y * TILE;
      const R = BALANCE_HURRICANE * TILE;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#2a3440';
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2);
      ctx.fill();
      // Rain under the clouds
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#9cc4ff';
      for (let k = 0; k < 50; k++) {
        const a = (k * 2.39996) % (Math.PI * 2);
        const d = ((k * 37) % 100) / 100;
        ctx.fillRect(cx + Math.cos(a) * d * R, cy + Math.sin(a) * d * R + ((t * 90 + k * 7) % 10) - 5, 1, 4);
      }
      ctx.globalAlpha = 0.85;
      for (let arm = 0; arm < 4; arm++) {
        for (let k = 0; k < 40; k++) {
          const f = k / 40;
          const a = t * 2.2 + arm * (Math.PI / 2) + f * 4.5;
          ctx.fillStyle = k % 3 ? '#f2f5f8' : '#aeb8c2';
          const s = 4 - f * 2.5;
          ctx.fillRect(cx + Math.cos(a) * f * R * 1.15, cy + Math.sin(a) * f * R, s, s * 0.7);
        }
      }
      // The calm eye
      ctx.fillStyle = '#2a3440';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
      ctx.globalAlpha = 1;
    }
    // Rain from the gods
    for (const r of sim.rains) {
      ctx.fillStyle = 'rgba(120, 170, 255, 0.7)';
      for (let k = 0; k < 60; k++) {
        const px = r.x * TILE + (((k * 37) % 160) - 80);
        const py = r.y * TILE + ((((k * 53) % 120) + t * 160) % 120) - 60;
        ctx.fillRect(px, py, 1, 4);
      }
    }
    // Lightning: a white zigzag for a moment
    for (const b of sim.bolts) {
      const age = t - b.t;
      if (age > 0.4) continue;
      ctx.globalAlpha = 1 - age / 0.4;
      ctx.fillStyle = '#ffffff';
      let x = b.x * TILE + 4;
      for (let y = b.y * TILE - 60; y < b.y * TILE + 4; y += 4) {
        x += ((y * 13) % 5) - 2;
        ctx.fillRect(x, y, 2, 5);
      }
      ctx.globalAlpha = 1;
    }
    // A heatwave: the land glares
    if (sim.heat) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255, 170, 40, 0.08)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  /** Is there water right next to this tile (houses on stilts)? */
  private byWater(sim: Sim, x: number, y: number) {
    const w = sim.world;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const t = w.get(x + dx, y + dy);
      if (t === T.SHALLOW || t === T.DEEP) return true;
    }
    return false;
  }

  /** Trains (Update 3): an engine in the colour of its people and two wagons, with a puff of smoke. */
  private trains(sim: Sim) {
    const ctx = this.ctx;
    const w = sim.world;
    for (const t of sim.trains) {
      const at = (pos: number) => {
        const p = Math.max(0, Math.min(t.route.length - 1, pos));
        const k = Math.floor(p);
        const f = p - k;
        const a = t.route[k];
        const b = t.route[Math.min(t.route.length - 1, k + 1)];
        const ax = (a % w.w) * TILE + 4;
        const ay = Math.floor(a / w.w) * TILE + 4;
        const bx = (b % w.w) * TILE + 4;
        const by = Math.floor(b / w.w) * TILE + 4;
        return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f };
      };
      const c = PEOPLE_COLORS[t.people];
      for (let k = 2; k >= 0; k--) {
        const p = at(t.pos - t.dir * k * 1.1);
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (k === 0) {
          ctx.fillStyle = '#2b2b33';
          ctx.fillRect(x - 3, y - 3, 6, 4);
          ctx.fillStyle = c.cloth;
          ctx.fillRect(x - 3, y - 2, 6, 1);
          ctx.fillStyle = '#2b2b33';
          ctx.fillRect(x + (t.dir > 0 ? 1 : -2), y - 5, 1, 2);
          if (t.wait <= 0) {
            const puff = (sim.time * 3) % 1;
            ctx.globalAlpha = 0.7 * (1 - puff);
            ctx.fillStyle = '#e4e4e4';
            ctx.fillRect(x + (t.dir > 0 ? 1 : -2) - Math.round(puff * 3 * t.dir), y - 7 - Math.round(puff * 3), 2, 2);
            ctx.globalAlpha = 1;
          }
        } else {
          ctx.fillStyle = '#8a5a2b';
          ctx.fillRect(x - 3, y - 3, 5, 4);
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(x - 3, y, 5, 1);
        }
      }
    }
  }

  /**
   * The wall around the houses of a place, just outside the living ring, with
   * gates where the four main streets leave: a wooden palisade (the steppe
   * keeps those), from the iron age stone with four towers, once castles are
   * known a castle wall with battlements and gatehouses. Damage (0…1) knocks
   * out pieces; only on land.
   */
  private wall(sim: Sim, v: Village, cx: number, cy: number, damage = 0) {
    const ctx = this.ctx;
    const r = (livingRadius(v) + 1) * TILE;
    const castle = knows(sim, v.people, 'castle');
    const style = castle ? 'castle' : v.people === 'steppe' || ageIndex(sim, v.people) < 2 ? 'palisade' : 'stone';
    // Only on the place's own (or free) land, never on mountains or in the water: no walls
    // through a neighbour's town or up a mountain (Update 3)
    const w = sim.world;
    const free = (x: number, y: number) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const t = w.get(tx, ty);
      if (!w.isLand(t) || t === T.MOUNTAIN) return false;
      const o = w.owner[ty * w.w + tx];
      return o < 0 || o === v.id;
    };
    // Other places close by: where their ring begins, this wall stops (two walls never cross)
    const others = sim.villages
      .filter((u) => u !== v && !u.merged && !u.ruin && Math.hypot(u.x - v.x, u.y - v.y) * TILE < r + (livingRadius(u) + 2) * TILE)
      .map((u) => ({ x: u.x * TILE + 4, y: u.y * TILE + 4, r: (livingRadius(u) + 1.5) * TILE }));
    const land = (x: number, y: number) => {
      // The whole block (and a mountain drawn up from the tile below) must be clear
      if (!free(x - 3, y - 4) || !free(x + 3, y - 4) || !free(x - 3, y + 3) || !free(x + 3, y + 3)) return false;
      if (w.get(Math.floor(x / TILE), Math.floor(y / TILE) + 1) === T.MOUNTAIN) return false;
      return !others.some((o) => Math.hypot(x - o.x, y - o.y) < o.r);
    };
    const n = Math.round((2 * Math.PI * r) / (style === 'palisade' ? 3 : 4));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const gate = Math.abs(((a + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4) < 0.1;
      if (gate || ((i * 37) % 100) / 100 < damage) continue;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!land(x, y)) continue;
      if (style === 'palisade') {
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(x - 1, y - 4, 2, 5);
        ctx.fillStyle = '#b07a45';
        ctx.fillRect(x - 1, y - 5, 1, 1);
        continue;
      }
      // A thick wall: a dark foot, grey stone, a light crown (so it does not look like a street)
      ctx.fillStyle = '#5f6573';
      ctx.fillRect(x - 3, y + 1, 6, 2);
      ctx.fillStyle = '#8d929c';
      ctx.fillRect(x - 3, y - 3, 6, 4);
      ctx.fillStyle = '#d0d3d9';
      ctx.fillRect(x - 3, y - 4, 6, 1);
      if (style === 'castle' && i % 2 === 0) {
        ctx.fillStyle = '#d0d3d9';
        ctx.fillRect(x - 2, y - 6, 2, 2);
      }
    }
    if (style === 'palisade') return;
    // Four towers between the gates
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!land(x, y)) continue;
      ctx.fillStyle = '#8d929c';
      ctx.fillRect(x - 3, y - 7, 6, 9);
      ctx.fillStyle = '#b4b9c2';
      ctx.fillRect(x - 3, y - 8, 2, 1);
      ctx.fillRect(x + 1, y - 8, 2, 1);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(x, y - 4, 1, 2);
    }
    if (style !== 'castle') return;
    // Gatehouses: a tower on each side of every gate
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      for (const side of [-0.13, 0.13]) {
        const x = Math.round(cx + Math.cos(a + side) * r);
        const y = Math.round(cy + Math.sin(a + side) * r);
        if (!land(x, y)) continue;
        ctx.fillStyle = '#9aa0aa';
        ctx.fillRect(x - 2, y - 8, 4, 10);
        ctx.fillStyle = '#c3c6cc';
        ctx.fillRect(x - 2, y - 9, 1, 1);
        ctx.fillRect(x + 1, y - 9, 1, 1);
      }
    }
  }

  /** A castle of 5 × 5 tiles (Update 3): curtain walls, four corner towers, a keep with the people's flag. */
  private castle(cx: number, cy: number, cloth: { cloth: string; dark: string }, ruin: boolean, time: number) {
    const ctx = this.ctx;
    const stone = ruin ? '#8d8a84' : '#b4b9c2';
    const dark = ruin ? '#6d6a64' : '#8d929c';
    const roofC = ruin ? '#6d6a64' : cloth.cloth;
    // Courtyard and curtain walls
    ctx.fillStyle = '#c9b48a';
    ctx.fillRect(cx - 15, cy - 12, 30, 24);
    ctx.fillStyle = stone;
    ctx.fillRect(cx - 16, cy - 15, 32, 4);
    ctx.fillRect(cx - 16, cy - 15, 3, 30);
    ctx.fillRect(cx + 13, cy - 15, 3, 30);
    ctx.fillStyle = dark;
    ctx.fillRect(cx - 16, cy + 10, 32, 6);
    for (let x = cx - 16; x < cx + 16; x += 3) ctx.fillRect(x, cy - 16, 2, 1);
    // Gate
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(cx - 3, cy + 11, 6, 5);
    // Corner towers with roofs
    for (const [tx, ty] of [
      [cx - 18, cy - 18],
      [cx + 12, cy - 18],
      [cx - 18, cy + 6],
      [cx + 12, cy + 6],
    ]) {
      ctx.fillStyle = stone;
      ctx.fillRect(tx, ty + 3, 7, 11);
      ctx.fillStyle = dark;
      ctx.fillRect(tx, ty + 12, 7, 2);
      ctx.fillStyle = roofC;
      ctx.fillRect(tx + 1, ty + 1, 5, 2);
      ctx.fillRect(tx + 2, ty, 3, 1);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(tx + 3, ty + 6, 1, 2);
    }
    // The keep
    ctx.fillStyle = '#c3c6cc';
    ctx.fillRect(cx - 5, cy - 14, 10, 18);
    ctx.fillStyle = dark;
    ctx.fillRect(cx - 5, cy + 2, 10, 2);
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(cx - 3, cy - 10, 2, 3);
    ctx.fillRect(cx + 1, cy - 10, 2, 3);
    ctx.fillStyle = roofC;
    ctx.fillRect(cx - 6, cy - 17, 12, 3);
    ctx.fillRect(cx - 4, cy - 19, 8, 2);
    if (ruin) return;
    this.lights.push([cx - 2, cy - 9]);
    // The flag on top
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(cx, cy - 26, 1, 7);
    ctx.fillStyle = cloth.cloth;
    const wave = Math.floor(time * 3) % 2;
    ctx.fillRect(cx + 1, cy - 26, 5, 3);
    ctx.fillRect(cx + 6, cy - 26 + wave, 1, 2);
  }

  /** A pen of 5 × 5 tiles (Update 3): a fence (or a stone wall) with a gate and a shed in one corner. */
  private pen(b: { x: number; y: number; stone?: boolean; animal?: string }, roof: { r: string; R: string }, ruin: boolean) {
    const ctx = this.ctx;
    const x0 = (b.x - 2) * TILE + 1;
    const y0 = (b.y - 2) * TILE + 2;
    const size = 5 * TILE - 2;
    const gate = (x: number) => Math.abs(x - (x0 + size / 2)) < 4;
    if (b.stone) {
      for (let k = 0; k <= size; k += 3) {
        for (const [x, y] of [
          [x0 + k, y0],
          [x0 + k, y0 + size],
          [x0, y0 + k],
          [x0 + size, y0 + k],
        ]) {
          if (y === y0 + size && gate(x)) continue;
          ctx.fillStyle = '#8d929c';
          ctx.fillRect(x - 1, y - 1, 3, 2);
          ctx.fillStyle = '#b4b9c2';
          ctx.fillRect(x - 1, y - 2, 3, 1);
        }
      }
    } else {
      ctx.fillStyle = ruin ? '#8d8a84' : '#a0703c';
      ctx.fillRect(x0, y0 - 1, size, 1);
      ctx.fillRect(x0, y0 + size - 1, size / 2 - 4, 1);
      ctx.fillRect(x0 + size / 2 + 4, y0 + size - 1, size / 2 - 4, 1);
      ctx.fillRect(x0, y0, 1, size);
      ctx.fillRect(x0 + size - 1, y0, 1, size);
      ctx.fillStyle = ruin ? '#6d6a64' : '#6e4a24';
      for (let k = 0; k <= size; k += 4) {
        ctx.fillRect(x0 + k, y0 - 2, 1, 3);
        if (!gate(x0 + k)) ctx.fillRect(x0 + k, y0 + size - 2, 1, 3);
        ctx.fillRect(x0 - 1, y0 + k, 3, 1);
        ctx.fillRect(x0 + size - 2, y0 + k, 3, 1);
      }
    }
    if (!ruin) this.figure(SHED, { ...HOUSE_COLORS, ...roof }, x0 + 6, y0 + 9, false);
  }

  /** Village names over the squares, in screen pixels so they stay readable. */
  private drawLabels(cam: Camera, sim: Sim, ruinsLabel: string) {
    this.signs = [];
    if (cam.zoom < 0.5) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of sim.villages) {
      // Ruins pile up over the centuries: their signs only show up close; merged places are gone
      if (v.merged || (v.ruin && cam.zoom < 3)) continue;
      const sx = ((v.x + 0.5) * TILE - cam.x) * cam.zoom * dpr + (cam.vw / 2) * dpr;
      const sy = ((v.y + 0.5) * TILE - 14 - cam.y) * cam.zoom * dpr + (cam.vh / 2) * dpr - 10 * dpr;
      if (sx < -100 || sy < -30 || sx > this.canvas.width + 100 || sy > this.canvas.height + 30) continue;
      const tier = v.tier ?? 'village';
      // Capitals get a crown sign in front of the name
      const name = !v.ruin && [...sim.kingdoms.values()].some((k) => k.capital === v.id) ? `♛ ${v.name}` : v.name;
      // The symbol of its faith after the name (Update 3)
      const faith = !v.ruin && v.faith !== undefined ? sim.religions.find((r) => r.id === v.faith) : undefined;
      // …and stars for its culture (Update 3, from the second level on)
      const stars = !v.ruin && (v.culture ?? 0) >= 1 ? ` ${'★'.repeat((v.culture ?? 0) + 1)}` : '';
      const mark = `${faith ? ` ${SYMBOL_ICON[faith.symbol]}` : ''}${stars}`;
      const text = v.ruin ? `${v.name} · ${ruinsLabel}` : tier === 'village' ? `${name}${mark}` : `${name} · ${this.tierLabels[tier] ?? tier}${mark}`;
      // A little wooden sign with a parchment plate and a dot in the colour of the people
      ctx.font = `600 ${Math.round((tier === 'city' ? 14 : tier === 'town' ? 13 : 12) * dpr)}px "Pixelify Sans Variable", system-ui, sans-serif`;
      const dot = 9 * dpr;
      const w = ctx.measureText(text).width + 14 * dpr + dot;
      const h = 19 * dpr;
      const x0 = sx - w / 2;
      const y0 = sy - h / 2;
      const selected = v.id === this.selectedVillage;
      ctx.globalAlpha = v.ruin ? 0.65 : 1;
      ctx.fillStyle = 'rgba(40, 22, 8, 0.45)';
      ctx.fillRect(x0 + 2 * dpr, y0 + 2 * dpr, w, h);
      ctx.fillStyle = '#4e2d14';
      ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = selected ? '#f2cf6b' : v.ruin ? '#d8cfbb' : '#f3e6c4';
      ctx.fillRect(x0 + 2 * dpr, y0 + 2 * dpr, w - 4 * dpr, h - 4 * dpr);
      ctx.fillStyle = 'rgba(122, 74, 36, 0.25)';
      ctx.fillRect(x0 + 2 * dpr, y0 + h - 4 * dpr, w - 4 * dpr, 2 * dpr);
      ctx.fillStyle = '#4e2d14';
      ctx.fillRect(x0 + 6 * dpr - dpr, sy - dot / 2 + 1.5 * dpr - dpr, dot - 3 * dpr + 2 * dpr, dot - 3 * dpr + 2 * dpr);
      ctx.fillStyle = v.ruin ? '#8b8f99' : PEOPLE_COLORS[v.people].cloth;
      ctx.fillRect(x0 + 6 * dpr, sy - dot / 2 + 1.5 * dpr, dot - 3 * dpr, dot - 3 * dpr);
      ctx.fillStyle = '#3b2a1a';
      ctx.fillText(text, sx + dot / 2 + 1 * dpr, sy + dpr);
      this.signs.push({ id: v.id, x: x0 / dpr, y: y0 / dpr, w: w / dpr, h: h / dpr });
    }
    ctx.globalAlpha = 1;
  }

  /** The place whose sign is under (x, y) in CSS px, or null. */
  villageAt(x: number, y: number): number | null {
    for (let i = this.signs.length - 1; i >= 0; i--) {
      const s = this.signs[i];
      if (x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 4 && y <= s.y + s.h + 4) return s.id;
    }
    return null;
  }

  /* ---- people and animals ------------------------------------------------------ */

  /** Draws a sprite (rows of colour keys) with its bottom centre at (px, py) in world pixels. */
  private figure(rows: readonly string[], colors: Record<string, string>, px: number, py: number, flip: boolean) {
    const ctx = this.ctx;
    const w = rows[0].length;
    const x0 = Math.round(px - w / 2);
    const y0 = Math.round(py - rows.length);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < w; c++) {
        const col = colors[row[flip ? w - 1 - c : c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + c, y0 + r, 1, 1);
      }
    }
  }

  private drawLife(cam: Camera, sim: Sim) {
    const ctx = this.ctx;
    // Only what is on screen (in tiles, with a margin)
    const x0 = cam.x / TILE - cam.vw / 2 / cam.zoom / TILE - 2;
    const x1 = cam.x / TILE + cam.vw / 2 / cam.zoom / TILE + 2;
    const y0 = cam.y / TILE - cam.vh / 2 / cam.zoom / TILE - 2;
    const y1 = cam.y / TILE + cam.vh / 2 / cam.zoom / TILE + 2;
    const visible = (a: { x: number; y: number }) => a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1;

    // Footprints in the sand, fading
    ctx.fillStyle = '#c4a258';
    for (const f of sim.footprints) {
      if (!visible(f)) continue;
      ctx.globalAlpha = Math.max(0, 1 - (sim.time - f.t) / 8) * 0.8;
      ctx.fillRect(Math.round(f.x * TILE) - 1, Math.round(f.y * TILE), 1, 1);
      ctx.fillRect(Math.round(f.x * TILE) + 1, Math.round(f.y * TILE) - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
    this.drawVillages(sim, visible);
    for (const g of sim.graves) if (visible(g)) this.figure(GRAVE, GRAVE_COLORS, g.x * TILE, g.y * TILE + 3, false);
    // Wrecks fade over their three years; ships bob on the waves (phase G)
    for (const wr of sim.wrecks) {
      if (!visible(wr)) continue;
      ctx.globalAlpha = Math.max(0.25, Math.min(1, (wr.until - sim.time) / 30));
      this.figure(WRECK, SHIP_COLORS, wr.x * TILE, wr.y * TILE + 3, false);
    }
    ctx.globalAlpha = 1;
    for (const ship of sim.ships) if (visible(ship)) this.ship(ship, sim);
    // World wonders (phase H), finished, rising or left in ruins
    for (const w of sim.wonders) {
      if (!visible({ x: w.x + 2, y: w.y + 2 })) continue;
      const c = PEOPLE_COLORS[w.people];
      drawWonder(ctx, w.kind, w.x * TILE, w.y * TILE, { t: sim.time, cloth: c.cloth, dark: c.dark, progress: progressOf(w), ruin: !!w.ruin, beam: Math.sin(sim.time * 0.8 + w.x) > 0.6, hero: w.hero });
      if (w.finished !== undefined && !w.ruin && (w.kind === 'lighthouse' || w.kind === 'cathedral' || w.kind === 'library')) {
        this.lights.push([w.x * TILE + 16, w.y * TILE + (w.kind === 'lighthouse' ? -7 : 18)]);
      }
    }

    this.generals = new Set(sim.armies.map((a) => a.general));
    this.kings = kingIds(sim);
    const all: Agent[] = [];
    for (const h of sim.humans) if (h.aboard === undefined && visible(h)) all.push(h);
    for (const a of sim.animals) if (visible(a)) all.push(a);
    all.sort((a, b) => a.y - b.y);
    const step = Math.floor(sim.time * 6) % 2 === 0;
    for (const a of all) {
      const px = a.x * TILE;
      const py = a.y * TILE + 3;
      const flip = a.facing < 0;
      if (a.kind === 'human') this.human(a, sim, px, py, flip, step);
      else if (a.kind === 'sheep') this.figure(SHEEP, SHEEP_COLORS, px, py, flip);
      else if (a.kind === 'chicken') this.figure(CHICKEN, CHICKEN_COLORS, px, py, flip);
      else if (a.kind === 'horse') this.figure(a.moving && step ? HORSE_RUN : HORSE, HORSE_COLORS, px, py, flip);
      else if (a.kind === 'cow') this.figure(COW, COW_COLORS, px, py, flip);
      else this.figure(a.moving && step ? WOLF_RUN : WOLF, WOLF_COLORS, px, py, flip);
    }

    // Sword swings: a short white stroke that fades
    for (const sl of sim.slashes) {
      const t = (sim.time - sl.born) / 0.25;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = '#ffffff';
      const sx = Math.round(sl.x * TILE);
      const sy = Math.round(sl.y * TILE);
      for (let k = -2; k <= 2; k++) ctx.fillRect(sx + k * sl.dir, sy + k, 1, 1);
    }
    ctx.globalAlpha = 1;

    // Shots in the air (phase F): arrows and bolts, stones in a high arc, cannon balls, musket fire
    for (const sh of sim.shots) {
      const t = (sim.time - sh.born) / SHOT_TIME;
      if (t > 1) continue;
      const arc = sh.kind === 'stone' ? 3 : sh.kind === 'arrow' ? 1 : sh.kind === 'ball' ? 0.6 : 0;
      const x = Math.round((sh.x0 + (sh.x1 - sh.x0) * t) * TILE);
      const y = Math.round((sh.y0 + (sh.y1 - sh.y0) * t - Math.sin(Math.PI * t) * arc) * TILE);
      const dir = sh.x1 >= sh.x0 ? 1 : -1;
      if (sh.kind === 'arrow' || sh.kind === 'bolt') {
        ctx.fillStyle = sh.kind === 'arrow' ? '#f4f1e8' : '#c3c6cc';
        ctx.fillRect(x - dir, y, 1, 1);
        ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(x - 2 * dir, y, 1, 1);
      } else if (sh.kind === 'bullet') {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.fillStyle = sh.kind === 'stone' ? '#8d929c' : '#2b2b2b';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    for (const p of sim.puffs) {
      const t = sim.time - p.born;
      ctx.globalAlpha = Math.max(0, 1 - t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round((p.x + p.vx * t) * TILE), Math.round((p.y + p.vy * t + 0.6 * t * t) * TILE), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** What a unit carries: spear, bow, crossbow or musket in the hand, or the engine it works. */
  private gear(unit: Unit, px: number, py: number, top: number, flip: boolean) {
    const ctx = this.ctx;
    const d = flip ? -1 : 1;
    const sx = Math.round(px) + 3 * d;
    const px1 = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    switch (unit) {
      case 'spear':
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top - 3, 1, 9);
        px1(sx, top - 4, '#c3c6cc');
        break;
      case 'archer':
        for (const [x, y] of [[0, 0], [1, 1], [1, 2], [1, 3], [0, 4]]) px1(sx + x * d, top + y, '#8a5a2b');
        ctx.fillStyle = '#f4f1e8';
        ctx.fillRect(sx, top + 1, 1, 3);
        break;
      case 'crossbow':
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(flip ? sx - 3 : sx, top + 3, 4, 1);
        ctx.fillStyle = '#9aa0aa';
        ctx.fillRect(sx + 3 * d, top + 2, 1, 3);
        break;
      case 'musketeer':
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(sx, top - 2, 1, 6);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 4, 1, 2);
        break;
      case 'catapult': {
        // A wooden frame on wheels, the arm leaning back with a stone in its cup
        const ex = Math.round(px) + (flip ? -10 : 4);
        const ey = Math.round(py);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(ex, ey - 2, 6, 1);
        ctx.fillRect(ex + 3, ey - 4, 1, 2);
        for (let k = 0; k < 4; k++) px1(ex + (flip ? 4 - k : 1 + k), ey - 3 - k, '#6b4325');
        px1(ex + (flip ? 0 : 5), ey - 7, '#8d929c');
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(ex, ey - 1, 2, 1);
        ctx.fillRect(ex + 4, ey - 1, 2, 1);
        break;
      }
      case 'cannon': {
        // A dark barrel on a wooden carriage
        const ex = Math.round(px) + (flip ? -9 : 4);
        const ey = Math.round(py);
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(ex, ey - 4, 5, 2);
        px1(flip ? ex - 1 : ex + 5, ey - 4, '#2b2b2b');
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(ex + 1, ey - 2, 3, 1);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(ex + 1, ey - 1, 2, 1);
        break;
      }
    }
  }

  /** A wooden pier from the harbor out onto its dock tile. */
  private pier(b: { x: number; y: number }, px: number, py: number) {
    const dock = dockOf(this.world, b);
    if (!dock) return;
    const ctx = this.ctx;
    const tx = dock.x * TILE + 4;
    const ty = dock.y * TILE + 5;
    const steps = Math.max(1, Math.round(Math.hypot(tx - px, ty - (py - 2)) / 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(px + ((tx - px) * i) / steps);
      const y = Math.round(py - 2 + ((ty - py + 2) * i) / steps);
      ctx.fillStyle = i % 2 ? '#8a5a2b' : '#a8743f';
      ctx.fillRect(x - 2, y, 4, 2);
    }
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(tx - 3, ty + 2, 1, 2);
    ctx.fillRect(tx + 2, ty + 2, 1, 2);
  }

  /** A ship: hull, sails in the colours of its people, a wake when it moves, damage as a little bar. */
  private ship(ship: Ship, sim: Sim) {
    const ctx = this.ctx;
    const cloth = PEOPLE_COLORS[ship.people];
    const bob = Math.round(Math.sin(sim.time * 2.2 + ship.id) * 0.6);
    const px = ship.x * TILE;
    const py = ship.y * TILE + 3 + bob;
    const rows = SHIPS[ship.kind];
    if (ship.moving) {
      ctx.fillStyle = '#d5ecff';
      const back = Math.round(px - ship.facing * (rows[0].length / 2 + 2));
      ctx.fillRect(back, Math.round(py) - 1, 2, 1);
      ctx.fillRect(back - ship.facing * 3, Math.round(py), 2, 1);
    }
    this.figure(rows, { ...SHIP_COLORS, f: cloth.cloth, c: ship.kind === 'trader' ? '#c0843c' : cloth.cloth }, px, py, ship.facing < 0);
    if (ship.hp < ship.maxHp) {
      const w = 10;
      const x = Math.round(px - w / 2);
      const y = Math.round(py - rows.length - 3);
      ctx.fillStyle = '#241a14';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = ship.hp / ship.maxHp > 0.4 ? '#3ddc84' : '#e8344a';
      ctx.fillRect(x, y, Math.max(1, Math.round((w * ship.hp) / ship.maxHp)), 2);
    }
  }

  /** A fisher who knows boats sits in one on the water next to the fishing spot. */
  private boatTile(h: Human, sim: Sim): { x: number; y: number } | null {
    const t = h.task;
    if (h.job !== 'fisher' || t?.kind !== 'work' || t.source !== 'fish' || t.phase !== 'gather' || !knows(sim, h.people, 'boats')) return null;
    const w = sim.world;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const k = w.get(t.tx + dx, t.ty + dy);
      if (k === T.SHALLOW || k === T.DEEP) return { x: t.tx + dx, y: t.ty + dy };
    }
    return null;
  }

  private human(h: Human, sim: Sim, px: number, py: number, flip: boolean, step: boolean) {
    const boat = this.boatTile(h, sim);
    if (boat) {
      px = boat.x * TILE + 4;
      py = boat.y * TILE + 6;
    }
    // Dancing at a festival: a little hop
    if (h.task?.kind === 'festival' && h.task.arrived && Math.floor(sim.time * 4 + h.id) % 2 === 0) py -= 1;
    const age = stage(h, sim.time);
    const cloth = PEOPLE_COLORS[h.people];
    const walking = h.moving && step;
    const { rows, colors, shown } = personSprite(h, age, walking);
    const ctx = this.ctx;
    if (h.asleep) {
      this.figure(SLEEP, colors, px, py, flip);
      // A little "z" floating up
      const t = (sim.time * 0.8) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      const zx = Math.round(px + 2);
      const zy = Math.round(py - 5 - t * 4);
      ctx.fillRect(zx, zy, 3, 1);
      ctx.fillRect(zx + 1, zy + 1, 1, 1);
      ctx.fillRect(zx, zy + 2, 3, 1);
      ctx.globalAlpha = 1;
      return;
    }
    // Riders and knights (phase F) sit on a horse
    if (h.unit && UNIT[h.unit].mounted) {
      this.figure(h.moving && step ? HORSE_RUN : HORSE, HORSE_COLORS, px, py, flip);
      py -= 3;
    }
    this.figure(rows, colors, px, py, flip);
    const top = Math.round(py - rows.length);
    // Own characters: hair style, beard and hat
    if (h.look && shown !== 'child') {
      const x0 = Math.round(px - 2.5);
      drawLook(h.look, colors, (x, y, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(x0 + (flip ? 4 - x : x), top + y, 1, 1);
      });
    }
    // In the boat: the hull hides the legs, a line goes into the water
    if (boat) {
      this.figure(BOAT, BOAT_COLORS, px, py + 1, flip);
      ctx.fillStyle = '#ffffff';
      const lx = Math.round(px) + (flip ? -5 : 5);
      ctx.fillRect(lx, top + 1, 1, 6);
      // Navigation: a mast with a sail
      if (knows(sim, h.people, 'navigation')) {
        const mx = Math.round(px) + (flip ? 3 : -3);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(mx, top - 3, 1, 10);
        ctx.fillStyle = '#f4f1e8';
        for (let r = 0; r < 5; r++) ctx.fillRect(flip ? mx + 1 : mx - 1 - Math.floor(r / 2), top - 2 + r, 1 + Math.floor(r / 2), 1);
      }
    }
    // Carrying a load for the village: on the back, or on a cart once they know the wheel
    if (h.carry) {
      const load = h.carry.res === 'wood' ? '#8a5a2b' : h.carry.res === 'stone' ? '#9aa0aa' : h.carry.res === 'ore' ? '#6c727d' : '#e8344a';
      if (h.carry.res !== 'food' && knows(sim, h.people, 'wheel')) {
        const cx = Math.round(px) + (flip ? 3 : -7);
        const fy = Math.round(py);
        ctx.fillStyle = load;
        ctx.fillRect(cx, fy - 4, 4, 2);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(cx, fy - 2, 4, 1);
        ctx.fillRect(flip ? cx - 1 : cx + 4, fy - 3, 1, 1);
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(cx, fy - 1, 1, 1);
        ctx.fillRect(cx + 3, fy - 1, 1, 1);
      } else {
        ctx.fillStyle = load;
        ctx.fillRect(Math.round(px) - (flip ? -2 : 3), top + 2, 2, 2);
      }
    }
    // On the way to a world wonder: a block of stone or a log on the shoulder
    if (h.task?.kind === 'build' && h.task.wonder !== undefined && !h.task.arrived) {
      ctx.fillStyle = h.id % 2 ? '#b4b9c2' : '#8a5a2b';
      ctx.fillRect(Math.round(px) - (flip ? -1 : 4), top + 1, 3, 2);
    }
    // A tool in the free hand shows the job (warriors in a war hold a sword instead)
    const warrior = isWarrior(h, sim);
    const tool = h.job && !(warrior && h.job === 'soldier') ? TOOLS[h.job] : undefined;
    if (tool && !h.carry && !boat && !this.generals.has(h.id)) {
      const hx = Math.round(px) + (flip ? 3 : -3);
      for (const [dx, dy, col] of tool) {
        ctx.fillStyle = col;
        ctx.fillRect(hx + (flip ? -dx : dx), top + 3 + dy, 1, 1);
      }
    }
    // Units with gear of their own (phase F): spears, bows, crossbows, muskets, siege engines
    if (warrior && h.unit && GEAR.has(h.unit)) this.gear(h.unit, px, py, top, flip);
    // Warriors (and armed soldiers) carry their weapon: a club, a bronze or an iron sword
    else if (warrior || (h.job === 'soldier' && h.weapon)) {
      const sx = Math.round(px) + (flip ? -3 : 3);
      if (h.weapon === 'club') {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 2, 1, 3);
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(flip ? sx - 1 : sx, top, 2, 2);
      } else if (h.weapon === 'musket') {
        // A long dark barrel on a wooden stock
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(sx, top - 2, 1, 6);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 4, 1, 2);
      } else {
        ctx.fillStyle = h.weapon ? BLADE[h.weapon] : BLADE.flint;
        ctx.fillRect(sx, top + 1, 1, 4);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx - 1, top + 4, 3, 1);
      }
    }
    // Chainmail (phase E): grey rings over the chest of the armoured
    if (h.armor && age !== 'child' && knows(sim, h.people, 'chainmail')) {
      const x0 = Math.round(px - 2.5);
      ctx.fillStyle = '#c3c6cc';
      ctx.fillRect(x0 + 1, top + 2, 1, 1);
      ctx.fillRect(x0 + 3, top + 2, 1, 1);
      ctx.fillRect(x0 + 2, top + 3, 1, 1);
    }
    // Armour: a helmet with a little crest
    if (h.armor && age !== 'child') {
      const x0 = Math.round(px - 2.5);
      ctx.fillStyle = '#9aa0aa';
      ctx.fillRect(x0 + 1, top, 3, 1);
      ctx.fillStyle = '#c3c6cc';
      ctx.fillRect(x0 + 2, top - 1, 1, 1);
    }
    // An army's general carries its banner
    if (this.generals.has(h.id)) {
      const hx = Math.round(px) + (flip ? 3 : -3);
      const wave = Math.floor(sim.time * 4) % 2;
      const fx = flip ? hx + 1 : hx - 5;
      ctx.fillStyle = '#6b4325';
      ctx.fillRect(hx, top - 7, 1, 12);
      // Dark edge so it stands out on any ground, people colour inside, a white sign in the middle
      ctx.fillStyle = '#241a14';
      ctx.fillRect(fx, top - 7, 5, 5);
      ctx.fillRect(flip ? fx + 5 : fx - 1, top - 6 + wave, 1, 3);
      ctx.fillStyle = cloth.cloth;
      ctx.fillRect(fx + 1, top - 6, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx + 2, top - 5, 1, 1);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(hx, top - 8, 1, 1);
    }
    // Kings and queens wear a big crown with a ruby, village leaders a little one
    if (this.kings.has(h.id)) {
      const x = Math.round(px);
      ctx.fillStyle = '#ffc83d';
      ctx.fillRect(x - 2, top - 2, 5, 1);
      ctx.fillRect(x - 2, top - 3, 1, 1);
      ctx.fillRect(x, top - 4, 1, 2);
      ctx.fillRect(x + 2, top - 3, 1, 1);
      ctx.fillStyle = '#e8344a';
      ctx.fillRect(x, top - 2, 1, 1);
    } else if (sim.villages.some((v) => v.leader === h.id && !v.ruin)) {
      ctx.fillStyle = '#ffc83d';
      ctx.fillRect(Math.round(px) - 1, top - 2, 3, 1);
      ctx.fillRect(Math.round(px) - 1, top - 3, 1, 1);
      ctx.fillRect(Math.round(px) + 1, top - 3, 1, 1);
    }
    // Selected: a little arrow above; favourite: a star
    if (h.id === this.selected) {
      ctx.fillStyle = '#ffd23f';
      const bob = Math.floor(sim.time * 3) % 2;
      ctx.fillRect(Math.round(px) - 2, top - 5 - bob, 5, 1);
      ctx.fillRect(Math.round(px) - 1, top - 4 - bob, 3, 1);
      ctx.fillRect(Math.round(px), top - 3 - bob, 1, 1);
    } else if (h.custom) {
      // Own characters: a light blue ✦ with a white heart
      const x = Math.round(px);
      const y = top - (h.look?.hat && h.look.hat !== 'none' ? 6 : 4);
      ctx.fillStyle = '#7fd6ff';
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    } else if (h.prophet !== undefined) {
      // A prophet: a golden halo (Update 3)
      const x = Math.round(px);
      const y = top - (h.look?.hat && h.look.hat !== 'none' ? 5 : 3);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x - 2, y - 2, 1, 2);
      ctx.fillRect(x + 2, y - 2, 1, 2);
      ctx.fillRect(x - 1, y - 2, 3, 1);
    } else if (h.role === 'fool') {
      // The fool's cap: two points, red and yellow (Update 3)
      const x = Math.round(px);
      const y = top - (h.look?.hat && h.look.hat !== 'none' ? 4 : 2);
      ctx.fillStyle = '#e8344a';
      ctx.fillRect(x - 2, y - 1, 2, 1);
      ctx.fillRect(x - 2, y - 2, 1, 1);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x, y - 1, 2, 1);
      ctx.fillRect(x + 1, y - 2, 1, 1);
    } else if (sim.favorites.has(h.id)) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(Math.round(px), top - 4, 1, 3);
      ctx.fillRect(Math.round(px) - 1, top - 3, 3, 1);
    }
    if (h.chatUntil <= sim.time) {
      // A face over the head when the mood is very good or very bad (Update 3)
      const mood = h.mood ?? 60;
      const face = mood >= 90 && (sim.time + h.id * 7) % 20 < 1.2 ? 'happy' : mood <= 25 && (sim.time + h.id * 7) % 8 < 1.4 ? 'sad' : null;
      const icon = h.bubbleUntil > sim.time ? h.bubble : h.grief > sim.time && sim.time % 3 < 1.6 ? 'tear' : h.hunger < 25 && sim.time % 2 < 1.2 ? 'food' : face;
      if (icon) this.thought(icon, px, top);
    }
    if (h.chatUntil > sim.time) {
      // Speech bubble with dots
      const bx = Math.round(px - 2);
      const by = Math.round(py - rows.length - 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, 5, 3);
      ctx.fillStyle = '#111111';
      const n = 1 + (Math.floor(sim.time * 4) % 3);
      for (let k = 0; k < n; k++) ctx.fillRect(bx + 1 + k, by + 1, 1, 1);
    }
  }

  /** A thought bubble: white bubble with a tiny icon, above the head. */
  private thought(icon: Thought, px: number, top: number) {
    const ctx = this.ctx;
    const x0 = Math.round(px) - 3;
    const y0 = top - 9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + 1, y0, 5, 7);
    ctx.fillRect(x0, y0 + 1, 7, 5);
    ctx.fillRect(x0 + 2, y0 + 7, 2, 1);
    const rows = THOUGHTS[icon];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        const col = THOUGHT_COLORS[rows[r][c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + 1 + c, y0 + 1 + r, 1, 1);
      }
  }

  /** Colour of a terrain for the toolbar swatches. */
  static swatch(t: Terrain): string {
    return [COLORS.deep, COLORS.shallow, COLORS.sand, COLORS.grass, COLORS.leaf, COLORS.rock][t];
  }
}
