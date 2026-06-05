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

  // --- pickups (N.4) ---
  basePickupRange: 2.5,
  pickupFlySpeed: 12,
};
