// upgrades.js — the level-up upgrade pool + application (design §19, N.3, H).
//
// Easy/Med/Hard tiers control the SIZE of a stat jump (easy +5%, med +20%,
// hard +100% — Appendix H). They do NOT gate behavior changes or evolutions
// (§19): math difficulty only scales stat magnitude.
//
// Each upgrade has an id, label, and an apply(player, boost) that nudges a
// modifier or stat by `boost` (the tier multiplier). Boosts are additive onto
// the multiplier (e.g. damage mod 1.0 -> 1.2 for a medium damage upgrade),
// which stacks predictably across many level-ups.

import { CONFIG } from "./config.js";
import { WEAPONS, makeWeapon } from "./weapons.js";

// Tier -> boost amount (Appendix H: easyBoost/mediumBoost/hardBoost).
export const TIER_BOOST = {
  easy: CONFIG.easyBoost ?? 0.05,
  medium: CONFIG.mediumBoost ?? 0.2,
  hard: CONFIG.hardBoost ?? 1.0,
};

// The upgrade pool. Stat-ups apply a fraction of `boost` appropriate to the
// stat (HP scales off base, multipliers add the boost directly).
export const UPGRADES = {
  damage: {
    id: "damage",
    label: "Damage",
    icon: "⚔",
    desc: "Bullets hit harder",
    apply: (player, boost) => {
      player.mods.damage += boost;
    },
  },
  firerate: {
    id: "firerate",
    label: "Fire Rate",
    icon: "⟳",
    desc: "Shoot faster",
    apply: (player, boost) => {
      player.mods.fireRate += boost;
    },
  },
  bulletspeed: {
    id: "bulletspeed",
    label: "Bullet Speed",
    icon: "➹",
    desc: "Faster projectiles",
    apply: (player, boost) => {
      player.mods.projectileSpeed += boost;
    },
  },
  maxhp: {
    id: "maxhp",
    label: "Max HP",
    icon: "✚",
    desc: "Tougher",
    apply: (player, boost) => {
      // Scale off base HP so it's meaningful at any tier; also heal the gain.
      const gain = Math.round(player.maxHp * boost);
      player.maxHp += gain;
      player.hp = Math.min(player.maxHp, player.hp + gain);
    },
  },
  movespeed: {
    id: "movespeed",
    label: "Move Speed",
    icon: "✦",
    desc: "Move quicker",
    apply: (player, boost) => {
      // Cap so the player can't outrun the whole game; half-effect on speed.
      player.speedMult = Math.min(2.0, player.speedMult + boost * 0.5);
    },
  },
  magnet: {
    id: "magnet",
    label: "Magnet",
    icon: "◎",
    desc: "Bigger pickup range",
    apply: (player, boost) => {
      player.stats.pickupRange += boost;
    },
  },
};

const STAT_POOL = Object.keys(UPGRADES);
const MAX_WEAPONS = CONFIG.weaponSlots ?? 6;

// Build the choice pool given the player's current state (VS-style):
//   • stat upgrades (always available)
//   • "new weapon" grants for weapons the player doesn't own yet (until the
//     6-slot cap), so level-ups can expand the arsenal
//   • "level up weapon X" for owned weapons below max level
// Returns an array of choice descriptors the level-up screen renders.
export function buildChoicePool(player) {
  const owned = new Set(player.weapons.map((w) => w.id));
  const pool = [];

  // stat upgrades
  for (const id of STAT_POOL) pool.push({ kind: "stat", upgradeId: id });

  // new-weapon grants (if room)
  if (player.weapons.length < MAX_WEAPONS) {
    for (const wid of Object.keys(WEAPONS)) {
      if (!owned.has(wid)) pool.push({ kind: "newWeapon", weaponId: wid });
    }
  }

  // weapon level-ups for owned weapons under max level
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (w.level < (def.maxLevel ?? 8)) {
      pool.push({ kind: "weaponLevel", weaponId: w.id });
    }
  }

  return pool;
}

// Pick `n` distinct choices from the player-aware pool, weighting toward
// offering new weapons early (they're the exciting VS moment).
export function rollChoices(player, n = 3) {
  const pool = buildChoicePool(player);
  // Light weighting: new weapons a bit more likely to surface so the arsenal
  // grows; otherwise uniform.
  const weighted = [];
  for (const c of pool) {
    weighted.push(c);
    if (c.kind === "newWeapon") weighted.push(c); // double weight
  }
  const picked = [];
  const seen = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 200) {
    const c = weighted[(Math.random() * weighted.length) | 0];
    const sig =
      c.kind + ":" + (c.upgradeId || c.weaponId); // de-dupe identical choices
    if (!seen.has(sig)) {
      seen.add(sig);
      picked.push(c);
    }
  }
  return picked;
}

// Describe a choice for the UI: icon, label, desc.
export function describeChoice(c) {
  if (c.kind === "stat") {
    const u = UPGRADES[c.upgradeId];
    return { icon: u.icon, label: u.label, desc: u.desc };
  }
  if (c.kind === "newWeapon") {
    return {
      icon: "✷",
      label: WEAPONS[c.weaponId].name,
      desc: "New weapon!",
    };
  }
  if (c.kind === "weaponLevel") {
    return {
      icon: "▲",
      label: WEAPONS[c.weaponId].name,
      desc: "Level up weapon",
    };
  }
  return { icon: "?", label: "?", desc: "" };
}

// Apply a chosen choice at a tier. Correct -> full effect; missed -> partial.
export function applyChoice(player, c, tier, { missed = false } = {}) {
  let boost = TIER_BOOST[tier] ?? TIER_BOOST.easy;
  if (missed) boost *= 0.25;

  if (c.kind === "stat") {
    UPGRADES[c.upgradeId].apply(player, boost);
  } else if (c.kind === "newWeapon") {
    // Grant the weapon (ignores boost — it's a binary unlock). A miss still
    // grants it; the math gated whether you "earned" it cleanly, but VS never
    // takes a weapon away once offered and chosen.
    if (
      player.weapons.length < MAX_WEAPONS &&
      !player.weapons.some((w) => w.id === c.weaponId)
    ) {
      player.weapons.push(makeWeapon(c.weaponId));
    }
  } else if (c.kind === "weaponLevel") {
    const w = player.weapons.find((x) => x.id === c.weaponId);
    if (w) {
      w.level += 1;
      // Leveling a weapon improves its own stats a bit (scaled by tier boost).
      w.damage *= 1 + boost * 0.5;
      w.fireInterval *= 1 - Math.min(0.4, boost * 0.2); // faster, floored
    }
  }
}
