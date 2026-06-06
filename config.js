// config.js — all tunable constants in one place for balancing (design H, M.10).

export const CONFIG = {
  // --- player health & lives (M.1, §13) ---
  playerMaxHpBase: 100,
  startingLives: 3,
  iframeDuration: 0.6,

  // --- enemy contact damage (M.1) ---
  contactDamage: {
    chaser: 8, swarmer: 4, ranged: 6, elite: 15, miniboss: 25, boss: 30,
  },
  rangedProjectileDamage: 6,

  // --- enemy scaling per minute of survival (§20, M.5) ---
  hpScalePerMin: 0.15,
  speedScalePerMin: 0.04,
  sizeScalePerMin: 0.03,

  // --- threat clock thresholds (kills) ---
  firstBossAt: 80,
  bossEvery: 150,
  timeBoss: 300,

  // --- XP curve (steady; D.4) ---
  xpBase: 25, // first level-up needs 25 XP (was 50)
  xpGrowth: 1.1,

  // --- upgrade stat jumps by tier (H, §19) ---
  easyBoost: 0.05,
  mediumBoost: 0.2,
  hardBoost: 1.0,

  // --- slots (§19) — generous so duplicate weapon stacking can build the
  // late-game bullet flood (build request overrides the design's 6). ---
  weaponSlots: 24,
  passiveSlots: 6,

  // --- pickups (N.4) ---
  basePickupRange: 2.5,
  pickupFlySpeed: 12,

  // --- Decision Phase (E.1, B.4) ---
  decisionIntervalMin: 30,
  decisionIntervalMax: 60,
  decisionRewards: {
    instant: { time: 60, heal: 20 },
    fast: { time: 25, heal: 0 },
    slow: { time: 8, heal: 0 },
    curse: { time: -15, damage: 15 },
  },
};
