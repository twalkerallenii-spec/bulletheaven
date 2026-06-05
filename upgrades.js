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

const POOL = Object.keys(UPGRADES);

// Pick `n` distinct random upgrade ids for the choice screen.
export function rollUpgradeChoices(n = 3) {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// Apply an upgrade at a given tier (or a scaled-down version on a missed
// answer — E.2 gives partial benefit rather than nothing).
export function applyUpgrade(player, upgradeId, tier, { missed = false } = {}) {
  const up = UPGRADES[upgradeId];
  if (!up) return;
  let boost = TIER_BOOST[tier] ?? TIER_BOOST.easy;
  if (missed) boost *= 0.25; // partial benefit on a wrong answer (E.2)
  up.apply(player, boost);
}
