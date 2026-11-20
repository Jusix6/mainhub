/**
 * Balance numbers in one place (Update 2). Change them here to tune the
 * island; the modules read them from this file. Time is in game years
 * (1 year = 30 s at 1×) unless a name says otherwise.
 */
export const BALANCE = {
  /**
   * Update 3, phase A: no nights any more. Energy drops 4× slower than
   * before (3.6/s) and a tired person takes a short nap at home, at the
   * village fire or, on campaign, in the camp.
   */
  sleep: {
    /** Energy lost per second awake. */
    drain: 0.9,
    /** Below `tired` people want a nap; below `exhausted` it comes before anything else. */
    tired: 30,
    exhausted: 15,
    /** A nap lasts this long (seconds) and fills the energy back up. */
    napMin: 2,
    napMax: 3,
    /** Home or the village fire must be this close (tiles) for a nap there, else it is taken on the spot. */
    homeRange: 5,
  },
  /** Update 3, phase F: disasters (disasters.ts). */
  disasters: {
    /** How often they come by themselves: Off, Rare, Normal, Chaos. */
    often: [0, 0.35, 1, 3],
    /** Chances per year (Normal): a thunderstorm, a volcano waking, a hurricane, a heatwave. */
    stormChance: 0.25,
    volcanoChance: 0.015,
    hurricaneChance: 0.04,
    heatChance: 0.05,
    /** A thunderstorm: seconds, chance of a strike per second; a strike kills someone in the open this often. */
    stormSeconds: 12,
    strikesPerSecond: 0.6,
    lightningKill: 0.15,
    /** Fire: seconds a tile burns, chance per second to catch from a burning neighbour, hurt per second. */
    fireTime: 8,
    spreadForest: 0.22,
    spreadHouse: 0.18,
    spreadField: 0.12,
    spreadGrass: 0.05,
    fireHurt: 8,
    /** Putting it out: reach (tiles) and burn seconds taken off per second (with a well at home). */
    douseReach: 12,
    douse: 1.5,
    douseWell: 3,
    /** Fires put out to become "the Firebreaker"; tiles for a named fire and a great fire; years a scar lasts. */
    heroSaves: 30,
    namedFire: 6,
    greatFire: 25,
    scarYears: 6,
    /** Volcano: years of smoke first (seconds when the gods wake it), seconds of eruption, stream length, cooling, years to soil. */
    warnYears: 2,
    godWarning: 6,
    eruption: 18,
    lavaMin: 8,
    lavaMax: 18,
    lavaCool: 40,
    soilYears: 12,
    /** Hurricane: tiles per second, radius; chances per second to unroof a house, uproot a tree, sink a ship; hurt per second. */
    hurricaneSpeed: 3,
    hurricaneRadius: 6,
    unroof: 0.25,
    uproot: 0.2,
    sinkShip: 0.5,
    stormHurt: 2,
    /** Heatwave: share of the stores lost per year without a granary. Rain puts out fires this far (tiles). */
    heatSpoil: 0.1,
    rainRadius: 10,
    /** After a disaster: chance to lose one's faith (else it grows). */
    faithLost: 0.1,
    /** Warming per year from each factory and train; cooling from forests, faiths of nature, a movement. */
    factoryHeat: 0.003,
    trainHeat: 0.002,
    forestCool: 0.008,
    natureCool: 0.004,
    movementCool: 0.02,
    /** A movement starts from this warmth and lasts this long; snow melts and the sea rises from these. */
    movementAt: 1,
    movementYears: 50,
    meltAt: 1.5,
    seaAt: 2,
    seaTiles: 6,
  },
  /** Update 3, phase E: culture and mood (society.ts). */
  culture: {
    /** Culture lost per second; gained per second at a festival. */
    fade: 0.25,
    festivalGain: 3,
    /** How much each need counts for the mood. */
    weights: { hunger: 0.35, energy: 0.15, social: 0.25, culture: 0.25 },
    /** Culture points of buildings and culture people; points needed for the levels 1–5. */
    buildingPoints: { library: 3, tavern: 2, museum: 4, theater: 4, university: 5, temple: 1, cathedral: 2, park: 1, totem: 0.5, altar: 0.5 },
    rolePoints: { philosopher: 2, musician: 1.5, fool: 1, actor: 1.5 },
    levels: [0, 5, 11, 18, 26],
    /** Buildings people visit for culture, and what a visit and a performance give per second. */
    visit: ['tavern', 'theater', 'museum', 'library', 'park'],
    visitGain: 9,
    performGain: { philosopher: 3, musician: 5, fool: 6, actor: 6 },
    /** Actors per theatre; chances per year: a book, a fool's mishap, a play. */
    actors: 2,
    bookChance: 0.025,
    foolChance: 0.035,
    playChance: 0.1,
    /** At most one book per place in this many years; a university trains a philosopher now and then (at most this many per place). */
    bookYears: 6,
    maxPhilosophers: 2,
    /** Years a book on tolerance softens the quarrels of faiths. */
    toleranceYears: 30,
    /** Cultured places draw people from places with a mood below this. */
    moveMood: 50,
    /** A place this unhappy (mood) for this many years loses people. */
    unhappyMood: 35,
    unhappyYears: 5,
    /** Effects of the levels: research per educated place and per book, land of cultured places, admiration, loyalty. */
    educatedResearch: 0.5,
    bookResearch: 0.1,
    culturedLand: 2,
    admiration: 0.05,
    enlightenedLoyalty: 15,
    unhappyLoyalty: 10,
    simpleBrawl: 0.8,
  },
  /** Update 3, phase D: prophets and religions (religion.ts). */
  religion: {
    /** Chance per year for each possible prophet; at least this many years between two, at most this many faiths. */
    prophetChance: 0.04,
    prophetGap: 12,
    maxFaiths: 6,
    /** Share of the prophet's place that follows at once. */
    firstFollowers: 0.3,
    /** Devotion of the newly converted; what fades every year. */
    newDevotion: 30,
    fade: 3,
    /** Chance per year to take the faith of one's place (no faith), and that a priest wins over a doubter. */
    adopt: 0.25,
    priestWin: 0.15,
    /** Share of the believers that makes it the faith of a place, and of a people. */
    placeShare: 0.4,
    /** …and the share that keeps it the faith of the place. */
    keepShare: 0.3,
    /** Fertility: births this much likelier; poverty: work this much slower. */
    fertility: 1.2,
    povertyWork: 1.05,
    peopleShare: 0.35,
    /** Converts per second of preaching (times charisma / 5). */
    prophetPower: 0.12,
    missionaryPower: 0.05,
    priestPower: 0.04,
    /** A split: an old (years) and big (believers) faith, the chance per year, and the years until the next. */
    splitAge: 40,
    splitSize: 60,
    splitChance: 0.04,
    splitPause: 40,
    /** Mood per second between peoples of the same faith, of branches of one faith, of other faiths. */
    sameMood: 0.08,
    branchMood: 0.08,
    otherMood: 0.03,
    /** Chance per year of a holy war, and the share of the losers that is converted. */
    holyWarChance: 0.04,
    holyWarConvert: 0.4,
    /** Years between two pilgrimages of one person (about). */
    pilgrimYears: 25,
  },
  /** Update 3, phase C: pens and herds (pens.ts). */
  pens: {
    /** A place keeps animals from this size on, one pen per 30 people, at most this many. */
    minPeople: 8,
    maxPens: 4,
    /** Kinds in the order a place wants them. */
    order: ['sheep', 'chicken', 'cow', 'horse'],
    /** Animals per pen; more are slaughtered (food per animal). */
    limit: 8,
    meat: { sheep: 5, chicken: 2, cow: 9, horse: 0 },
    /** Food per animal and year: wool, eggs, milk. */
    yield: { sheep: 0.6, chicken: 1, cow: 2, horse: 0 },
    /** Horses in the stable at most; stone for a pen wall that keeps wolves out. */
    stableMax: 20,
    wallStone: 6,
  },
  /** Update 3, phase C: fields in fenced plots of 4 × 3, a farm for up to three of them. */
  fields: {
    /** Field tiles a place wants at most, by size. */
    max: { village: 12, town: 24, city: 36 },
    plotsPerFarm: 3,
    /** While there are too few fields, a farmer ploughs a new one first this often (else harvests or sows). */
    ploughFirst: 0.35,
  },
  /** Update 3, phase C: streets, highways, railways (roads.ts). */
  roads: {
    /** Houses and workshops stay within this many tiles of the square; the wall goes just outside. */
    living: { village: 6, town: 8, city: 11 },
    /** Walking on a path, gravel or paving is this much faster (and a bridge as fast as land). */
    speed: [1, 1.1, 1.25, 1.4],
    /** Highways reach the nearest place of the same people up to this far (tiles); chance per second to lay the next tile. */
    highwayReach: 70,
    highwayPerSecond: 0.5,
    /** Railways join cities with stations up to this far apart (tiles). */
    railReach: 110,
    railPerSecond: 0.7,
    /** Trains: tiles per second, seconds at each station. */
    trainSpeed: 3,
    trainWait: 3,
    /** Wall points mended every year after a siege. */
    wallRepair: 15,
  },
  /** Update 3, phase B: land, borders, claims and land grabs (territory.ts). */
  land: {
    /** How far the land of a place reaches (tiles), by size; castles (phase C) add more. */
    radius: { village: 8, town: 12, city: 16 },
    /** Ruins lose their land after this many years. */
    ruinYears: 20,
    /** People per land tile at which a kingdom feels crowded (land hunger 50). */
    crowded: 0.06,
    /** Land hunger (0–100) from which a king lays claim to a neighbour's land. */
    claimAt: 60,
    /** A claimed area: a circle of this radius (tiles) on the neighbour's side. */
    claimRadius: 7,
    /** A castle makes the land of its place reach this much further (tiles). */
    castleBonus: 6,
    /** Years from a claim to war, and at least this long between two claims of one kingdom. */
    claimYears: 5,
    claimPause: 15,
    /** A war for land is won by holding the area (plus this reach, tiles) with warriors for this long (seconds). */
    holdReach: 8,
    holdSeconds: 45,
    /** Mood lost by a claim and by settlers on foreign land. */
    claimMood: 30,
    grabMood: 50,
    /** Settlers without free land: chance they settle on foreign land anyway; years of the ultimatum; area at stake. */
    grabChance: 0.35,
    ultimatumYears: 3,
    grabRadius: 6,
  },
  /** Update 3, phase A: berry bushes only here and there, at forest edges. */
  bushes: {
    /** Share of the grass with a bush on a new island (before: 8 %). */
    start: 0.025,
    /** Bushes cover at most this share of the grass; above it none grow back. */
    maxShare: 0.03,
    /** Chance per second that free grass at a forest edge sprouts a bush. */
    sprout: 0.0004,
    /** A bush lives this long (years), then dies. */
    lifeMin: 10,
    lifeMax: 20,
    /** Peoples with agriculture treat berries as this much further away (they live from their fields). */
    farmerFactor: 2,
  },
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
    /**
     * Woodcutters and builders stop felling once a place has this much wood
     * in store (Update 3: without nights people work far more, and the
     * forests were cut down for woodsheds of 2000).
     */
    woodStock: 250,
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
