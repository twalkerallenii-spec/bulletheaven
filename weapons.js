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
    maxLevel: 8,
    evolvesWith: "scope",
    evolvesInto: "railgun",
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

// Tick every weapon the player holds; fire when cooldown elapses.
export function updateWeapons(dt, player) {
  const p = player.position;
  for (const w of player.weapons) {
    w.cooldown -= dt;
    if (w.cooldown > 0) continue;

    if (w.targeting === "nearest") {
      const target = nearestEnemy(p.x, p.z);
      if (!target) continue; // nothing to shoot; hold fire, keep cooldown ready
      const tp = target.sprite.mesh.position;
      spawnBullet(p.x, p.z, tp.x, tp.z, w.bulletSpeed, w.damage);
      w.cooldown = w.fireInterval;
    }
  }
}
