/**
 * The chronicle: short entries about what matters (couples, births of
 * favourites, adoptions, deaths, fights, villages founded, new leaders,
 * groups moving on, villages abandoned). Stored as data, the UI turns them
 * into sentences with the strings from ui.ts. Newest first, at most 200.
 */
import type { People } from './agents';
import type { Work } from './culture';

/** A person as they were when it happened (names never change). */
export interface Ref {
  id: number;
  name: string;
  people: People;
}

export interface ChronicleEntry {
  id: number;
  year: number;
  kind:
    | 'couple'
    | 'birth'
    | 'adopt'
    | 'died'
    | 'brawl'
    | 'village'
    | 'resettle'
    | 'leader'
    | 'split'
    | 'ruin'
    | 'war'
    | 'peace'
    | 'conquest'
    | 'tier'
    | 'building'
    | 'invention'
    | 'feud'
    | 'army'
    | 'breach'
    | 'subdued'
    | 'alliance'
    | 'allianceEnd'
    | 'joinWar'
    | 'kingdom'
    | 'succession'
    | 'newDynasty'
    | 'capital'
    | 'revolt'
    | 'overthrown'
    | 'returned'
    | 'godCrowned'
    | 'godDeposed'
    | 'fall'
    | 'artwork'
    | 'legend'
    | 'festival'
    | 'gift'
    | 'aid'
    | 'exodus'
    | 'omen'
    | 'created'
    | 'revenge'
    | 'bloodFeud'
    | 'bloodFeudEnd'
    | 'forgiven'
    | 'jealousy'
    | 'separated'
    | 'mentor'
    | 'forbiddenLove'
    | 'eloped'
    | 'loveEndsWar'
    | 'royalWedding'
    | 'weddingPeace'
    | 'royalFlight'
    | 'union'
    | 'successionWar'
    | 'leagueFounded'
    | 'leagueJoin'
    | 'leagueExit'
    | 'leagueEnd'
    | 'leagueVote'
    | 'leagueVeto'
    | 'fusion'
    | 'plotSpy'
    | 'plotSpyCaught'
    | 'plotSabotage'
    | 'plotSabotageCaught'
    | 'coup'
    | 'coupCaught'
    | 'betrayal'
    | 'betrayalCaught'
    | 'bribe'
    | 'bribeCaught'
    | 'godPeace'
    | 'godAlly'
    | 'newAge'
    | 'progress'
    | 'battle'
    | 'battleWon'
    | 'rout'
    | 'discovered'
    | 'setSail'
    | 'settlersSail'
    | 'colony'
    | 'shipSunk'
    | 'fleet'
    | 'armySails'
    | 'goldFound'
    | 'spiceFound'
    | 'independence'
    | 'colonyBack'
    | 'independent'
    | 'islandersJoin';
  a: Ref;
  b?: Ref;
  c?: Ref;
  /** Age at death. */
  n?: number;
  cause?: string;
  /** Village names (founded, led, left, abandoned; `w` = the new one after a split). */
  v?: string;
  w?: string;
  /** Peoples (war, peace, conquest, invention). */
  p?: People;
  q?: People;
  /** A work of art (a copy, so the line keeps its title when old songs are forgotten). */
  work?: Work;
  /** A league ("people:coast", "city:Ashfell") or a new place name (fusion), phase D. */
  u?: string;
  /** Peace: the side that pays tribute (a people, or a village id in a feud). */
  loser?: string;
  /** Where it happened, for jumping there (tiles). */
  x: number;
  y: number;
}

export const CHRONICLE_MAX = 200;

export class Chronicle {
  entries: ChronicleEntry[] = [];
  /** Goes up with every change, so the list is only redrawn when needed. */
  version = 0;
  private nextId = 1;

  add(e: Omit<ChronicleEntry, 'id'>) {
    this.entries.unshift({ ...e, id: this.nextId++ });
    if (this.entries.length > CHRONICLE_MAX) this.entries.length = CHRONICLE_MAX;
    this.version++;
  }

  clear() {
    this.entries = [];
    this.version++;
  }

  get nextIdValue() {
    return this.nextId;
  }

  /** From a saved island. */
  restore(entries: ChronicleEntry[], nextId: number) {
    this.entries = entries;
    this.nextId = nextId;
    this.version++;
  }
}
