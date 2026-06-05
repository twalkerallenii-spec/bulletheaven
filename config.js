// config.js — all tunable constants in one place for balancing (design H, M.10).
//
// Started during the contact-damage slice. Values land here as systems need
// them so balancing is one-file. Numbers are first-pass defaults from the
// design appendices — tune freely.

export const CONFIG = {
  // --- player health & lives (M.1, §13) ---
  playerMaxHpBase: 100, // modified per class later (CLASSES.hp)
  startingLives: 3,
  iframeDuration: 0.6, // seconds of invincibility after a hit

  // --- enemy contact damage (M.1) ---
  contactDamage: {
    chaser: 8,
    swarmer: 4,
    ranged: 6,
    elite: 15,
    miniboss: 25,
    boss: 30,
  },

  // --- XP curve (steady; D.4) ---
  xpBase: 5,
  xpGrowth: 1.1,

  // --- upgrade stat jumps by tier (H, §19) ---
  easyBoost: 0.05, // +5%
  mediumBoost: 0.2, // +20%
  hardBoost: 1.0, // +100%

  // --- pickups (N.4) ---
  basePickupRange: 2.5,
  pickupFlySpeed: 12,

  // --- Decision Phase (E.1, B.4) ---
  decisionIntervalMin: 30, // seconds (randomized each cycle)
  decisionIntervalMax: 60,
  // Reward values drawn from systems that exist now (Time + HP). Full
  // upgrade-tier rewards layer in with upgrades.js.
  decisionRewards: {
    instant: { time: 60, heal: 20 }, // ≤2s: huge Time + a heal
    fast: { time: 25, heal: 0 }, // ≤5s: medium Time
    slow: { time: 8, heal: 0 }, // slower: small Time
    curse: { time: -15, damage: 15 }, // wrong: lose Time + take damage
  },
};
