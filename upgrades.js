// upgrades.js — the level-up upgrade pool + application (design §19, N.3, H).
//
// Easy/Med/Hard tiers control the SIZE of a stat jump (easy +5%, med +20%,
// hard +100% — Appendix H). They do NOT gate behavior changes or evolutions.
//
// DUPLICATE STACKING (build request): the player can pick the same weapon
// multiple times. Each pick adds another independent instance, so firepower
// compounds toward the late-game bullet flood. The slot cap is generous so
// stacking isn't choked early.

import { CONFIG } from "./config.js";
import { WEAPONS, makeWeapon } from "./weapons.js";

export const TIER_BOOST = {
  easy: CONFIG.easyBoost ?? 0.05,
  medium: CONFIG.mediumBoost ?? 0.2,
  hard: CONFIG.hardBoost ?? 1.0,
};

export const UPGRADES = {
  damage: {
    id: "damage", label: "Damage", icon: "⚔", desc: "Bullets hit harder",
    apply: (player, boost) => { player.mods.damage += boost; },
  },
  firerate: {
    id: "firerate", label: "Fire Rate", icon: "⟳", desc: "Shoot faster",
    apply: (player, boost) => { player.mods.fireRate += boost; },
  },
  bulletspeed: {
    id: "bulletspeed", label: "Bullet Speed", icon: "➹", desc: "Faster projectiles",
    apply: (player, boost) => { player.mods.projectileSpeed += boost; },
  },
  maxhp: {
    id: "maxhp", label: "Max HP", icon: "✚", desc: "Tougher",
    apply: (player, boost) => {
      const gain = Math.round(player.maxHp * boost);
      player.maxHp += gain;
      player.hp = Math.min(player.maxHp, player.hp + gain);
    },
  },
  movespeed: {
    id: "movespeed", label: "Move Speed", icon: "✦", desc: "Move quicker",
    apply: (player, boost) => {
      player.speedMult = Math.min(2.0, player.speedMult + boost * 0.5);
    },
  },
  magnet: {
    id: "magnet", label: "Magnet", icon: "◎", desc: "Bigger pickup range",
    apply: (player, boost) => { player.stats.pickupRange += boost; },
  },
};

const STAT_POOL = Object.keys(UPGRADES);
// Generous cap so duplicate stacking can build the flood (design said 6; the
// build request is explicitly to stack toward dozens of guns firing).
const MAX_WEAPONS = CONFIG.weaponSlots ?? 24;
const ALL_WEAPON_IDS = Object.keys(WEAPONS);

// How many copies of a weapon the player holds.
function countOf(player, weaponId) {
  return player.weapons.reduce((n, w) => n + (w.id === weaponId ? 1 : 0), 0);
}

// Build the choice pool. With duplicates allowed, the headline option is
// "add another <gun>" for ANY gun (owned or not), until the (generous) slot cap.
// Owned guns under max level can also be LEVELED. Stat upgrades always present.
export function buildChoicePool(player) {
  const pool = [];

  // stat upgrades (always available)
  for (const id of STAT_POOL) pool.push({ kind: "stat", upgradeId: id });

  const hasRoom = player.weapons.length < MAX_WEAPONS;
  if (hasRoom) {
    for (const wid of ALL_WEAPON_IDS) {
      const owned = countOf(player, wid);
      // offer adding (another) copy — label distinguishes new vs duplicate
      pool.push({ kind: owned > 0 ? "dupWeapon" : "newWeapon", weaponId: wid });
    }
  }

  // weapon level-ups for owned weapons under max level (level the *stack* of
  // that id; we level the lowest-level instance so copies progress together).
  const seen = new Set();
  for (const w of player.weapons) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const def = WEAPONS[w.id];
    if (w.level < (def.maxLevel ?? 8)) {
      pool.push({ kind: "weaponLevel", weaponId: w.id });
    }
  }

  return pool;
}

// Pick `n` distinct choices, weighting toward offering weapons (new AND
// duplicates) so the arsenal/flood grows — that's the exciting moment.
export function rollChoices(player, n = 3) {
  const pool = buildChoicePool(player);
  const weighted = [];
  for (const c of pool) {
    weighted.push(c);
    if (c.kind === "newWeapon") weighted.push(c, c); // new guns surface most
    if (c.kind === "dupWeapon") weighted.push(c); // duplicates a bit boosted too
  }
  const picked = [];
  const seen = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 300) {
    const c = weighted[(Math.random() * weighted.length) | 0];
    // de-dupe identical OFFERS within one level-up screen (but dup vs level of
    // same gun are different offers and may both appear)
    const sig = c.kind + ":" + (c.upgradeId || c.weaponId);
    if (!seen.has(sig)) {
      seen.add(sig);
      picked.push(c);
    }
  }
  // Fallback: if the pool was tiny, allow repeats so we always show n cards.
  while (picked.length < n && pool.length) {
    picked.push(pool[(Math.random() * pool.length) | 0]);
  }
  return picked;
}

// Describe a choice for the UI: icon, label, desc. Duplicates show the current
// stack count so the player sees the firepower compounding.
export function describeChoice(c, player) {
  if (c.kind === "stat") {
    const u = UPGRADES[c.upgradeId];
    return { icon: u.icon, label: u.label, desc: u.desc };
  }
  if (c.kind === "newWeapon") {
    return { icon: "✷", label: WEAPONS[c.weaponId].name, desc: "New weapon!" };
  }
  if (c.kind === "dupWeapon") {
    const have = player ? countOf(player, c.weaponId) : 0;
    return {
      icon: "✚",
      label: WEAPONS[c.weaponId].name,
      desc: have ? `+1 more (have ${have})` : "Another copy",
    };
  }
  if (c.kind === "weaponLevel") {
    return { icon: "▲", label: WEAPONS[c.weaponId].name, desc: "Level up" };
  }
  return { icon: "?", label: "?", desc: "" };
}

// Apply a chosen choice at a tier. Correct -> full effect; missed -> partial.
export function applyChoice(player, c, tier, { missed = false } = {}) {
  let boost = TIER_BOOST[tier] ?? TIER_BOOST.easy;
  if (missed) boost *= 0.25;

  if (c.kind === "stat") {
    UPGRADES[c.upgradeId].apply(player, boost);
  } else if (c.kind === "newWeapon" || c.kind === "dupWeapon") {
    // Grant (another) instance of the weapon — duplicates stack. A miss still
    // grants it (VS never revokes a chosen weapon); the math gated the *clean*
    // earn, not whether you get the gun.
    if (player.weapons.length < MAX_WEAPONS) {
      player.weapons.push(makeWeapon(c.weaponId));
    }
  } else if (c.kind === "weaponLevel") {
    // Level the lowest-level instance of this id so a stack progresses evenly.
    let target = null;
    for (const w of player.weapons) {
      if (w.id === c.weaponId && (!target || w.level < target.level)) target = w;
    }
    if (target) {
      target.level += 1;
      target.damage *= 1 + boost * 0.5;
      target.fireInterval *= 1 - Math.min(0.4, boost * 0.2);
    }
  }
}
