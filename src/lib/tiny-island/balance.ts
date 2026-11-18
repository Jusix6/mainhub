/**
 * Balance numbers in one place (Update 2). Change them here to tune the
 * island; the modules read them from this file. Time is in game years
 * (1 year = 30 s at 1×) unless a name says otherwise.
 */
export const BALANCE = {
  trees: {
    /**
     * Random grass tiles looked at per tick, and the chance one of them grows
     * a tree. Before Update 2 it was 0.12 with immortal trees; the plan's 5×
     * slower (0.024) let the forests die out to 2 % once trees age, 0.09
     * keeps them at 20–30 % (the cap below stops the overgrowing).
     */
    spreadSamples: 10,
    spreadChance: 0.09,
    /** Forests stop spreading once they cover this share of the land. */
    maxForestShare: 0.3,
    /** No new trees this close to a village square (ruins: only at their edge). */
    villageClear: 6,
    ruinClear: 4,
    /** A tree lives this long (years), then falls and leaves grass. */
    lifeMin: 60,
    lifeMax: 120,
    /** Woodcutters treat trees in their own village area as this much closer (and always clear them). */
    villageTreeFactor: 0.3,
  },
  food: {
    /** What a grown-up eats in a year (hunger 2.4/s, 34 per portion, 30 s a year). */
    perPersonYear: 2.1,
    /** Less than this many years of food in store: more farmers and fishers. */
    warnYears: 2,
    /** Less than this: no births, and the store hands out one portion at a time. */
    shortYears: 1,
    /** People go for food from this hunger on (100 = full). */
    eatAt: 50,
    /** Work this far from the square (tiles): take a portion along. */
    provisionDistance: 12,
    /** A place with more than this many years in store sends grain to a hungry one. */
    aidSurplusYears: 3,
    /** Smallest delivery worth a chronicle line, and how often a place may ask for help (years). */
    aidMin: 10,
    aidCooldown: 3,
    /** Below this many years of food, with people starving, a group moves away. */
    famineYears: 0.3,
    famineCooldown: 5,
  },
  storyteller: {
    /** After this many quiet years something happens. */
    quietYears: 15,
    /** A rich vein of ore. */
    oreFind: 30,
  },
} as const;
