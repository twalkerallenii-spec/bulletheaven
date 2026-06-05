// weapons.js — weapon definitions + auto-fire (design §19, A.4, I.2).
//
// True bullet heaven: weapons fire on their own timer with their own targeting.
// The player never aims. Slice scope: the starting pistol, "nearest" targeting.
// Spread/Orbit/etc. are later content (I.2) — add as more WEAPONS entries.

import { spawnBullet } from "./projectiles.js";
import { activeEnemies } from "./enemies.js";

export const WEAPONS = {
  pistol: {
    name: "Pistol",
    targeting: "nearest",
    damage: 14,
    fireInterval: 0.9, // seconds between shots
    bulletSpeed: 18,
    count: 1,
    maxLevel: 8,
    evolvesWith: "scope",
    evolvesInto: "railgun",
  },
  spread: {
    name: "Spread",
    targeting: "spread", // fires a fan toward the nearest enemy
    damage: 8,
    fireInterval: 1.3,
    bulletSpeed: 16,
    count: 3, // three pellets in a fan
    spreadAngle: 0.5, // radians total fan width
    maxLevel: 8,
  },
  burst: {
    name: "Burst",
    targeting: "radial", // fires in all directions (VS "garlic"/nova feel)
    damage: 6,
    fireInterval: 1.8,
    bulletSpeed: 13,
    count: 8, // ring of 8 bullets
    maxLevel: 8,
  },
  lobber: {
    name: "Lobber",
    targeting: "random", // targets a random enemy (area pressure)
    damage: 20,
    fireInterval: 1.5,
    bulletSpeed: 14,
    count: 1,
    maxLevel: 8,
  },
};

// Create a live weapon instance (design A.4) from a definition id.
export function makeWeapon(id) {
  const def = WEAPONS[id];
  return {
    id,
    level: 1,
    cooldown: 0,
    fireInterval: def.fireInterval,
    damage: def.damage,
    bulletSpeed: def.bulletSpeed,
    targeting: def.targeting,
    count: def.count || 1,
    spreadAngle: def.spreadAngle || 0,
    behaviors: [],
  };
}

function nearestEnemy(px, pz) {
  const enemies = activeEnemies();
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - px) ** 2 + (ep.z - pz) ** 2; // squared — no sqrt needed
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function randomEnemy() {
  const enemies = activeEnemies();
  if (!enemies.length) return null;
  return enemies[(Math.random() * enemies.length) | 0];
}

// Fire a single bullet from (px,pz) along an angle (radians on the XZ plane).
function fireAngle(px, pz, angle, speed, dmg) {
  const tx = px + Math.cos(angle);
  const tz = pz + Math.sin(angle);
  spawnBullet(px, pz, tx, tz, speed, dmg);
}

// Tick every weapon the player holds; fire when cooldown elapses. Each weapon's
// targeting decides the shot pattern (true bullet heaven — no aiming).
export function updateWeapons(dt, player) {
  const p = player.position;
  const mods = player.mods;
  for (const w of player.weapons) {
    w.cooldown -= dt;
    if (w.cooldown > 0) continue;

    const dmg = w.damage * mods.damage;
    const speed = w.bulletSpeed * mods.projectileSpeed;
    let fired = false;

    if (w.targeting === "nearest" || w.targeting === "random") {
      const target =
        w.targeting === "random" ? randomEnemy() : nearestEnemy(p.x, p.z);
      if (target) {
        const tp = target.sprite.mesh.position;
        spawnBullet(p.x, p.z, tp.x, tp.z, speed, dmg);
        fired = true;
      }
    } else if (w.targeting === "spread") {
      const target = nearestEnemy(p.x, p.z);
      if (target) {
        const tp = target.sprite.mesh.position;
        const base = Math.atan2(tp.z - p.z, tp.x - p.x);
        const n = w.count;
        const step = n > 1 ? w.spreadAngle / (n - 1) : 0;
        const start = base - w.spreadAngle / 2;
        for (let i = 0; i < n; i++) fireAngle(p.x, p.z, start + step * i, speed, dmg);
        fired = true;
      }
    } else if (w.targeting === "radial") {
      // Ring of bullets in all directions — no target needed (always fires).
      const n = w.count;
      for (let i = 0; i < n; i++) {
        fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg);
      }
      fired = true;
    }

    // Only reset cooldown if we actually fired (target-needing weapons hold
    // fire when nothing's in range, staying ready).
    if (fired) w.cooldown = w.fireInterval / mods.fireRate;
  }
}
