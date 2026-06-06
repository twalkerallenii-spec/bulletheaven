// weapons.js — weapon definitions + auto-fire (design §19, A.4, I.2).
//
// True bullet heaven: weapons fire on their own timer with their own targeting.
// The player never aims. DUPLICATE STACKING is allowed (per the build request):
// owning the same weapon multiple times gives multiple independent instances,
// so firepower compounds toward the late-game bullet flood. 13 weapons total.

import { spawnBullet } from "./projectiles.js";
import { activeEnemies } from "./enemies.js";

export const WEAPONS = {
  pistol: {
    name: "Pistol",
    targeting: "nearest",
    damage: 14,
    fireInterval: 0.9,
    bulletSpeed: 18,
    count: 1,
    maxLevel: 8,
    evolvesWith: "scope",
    evolvesInto: "railgun",
  },
  spread: {
    name: "Spread",
    targeting: "spread",
    damage: 8,
    fireInterval: 1.3,
    bulletSpeed: 16,
    count: 3,
    spreadAngle: 0.5,
    maxLevel: 8,
  },
  burst: {
    name: "Burst",
    targeting: "radial",
    damage: 6,
    fireInterval: 1.8,
    bulletSpeed: 13,
    count: 8,
    maxLevel: 8,
  },
  lobber: {
    name: "Lobber",
    targeting: "random",
    damage: 20,
    fireInterval: 1.5,
    bulletSpeed: 14,
    count: 1,
    maxLevel: 8,
  },
  beam: {
    name: "Beam",
    targeting: "nearest",
    damage: 6,
    fireInterval: 0.3,
    bulletSpeed: 26,
    count: 1,
    maxLevel: 8,
  },
  twin: {
    name: "Twin",
    targeting: "twin",
    damage: 11,
    fireInterval: 1.0,
    bulletSpeed: 18,
    count: 1,
    maxLevel: 8,
  },
  scatter: {
    name: "Scatter",
    targeting: "spread",
    damage: 7,
    fireInterval: 1.6,
    bulletSpeed: 15,
    count: 5,
    spreadAngle: 0.9,
    maxLevel: 8,
  },
  sniper: {
    name: "Sniper",
    targeting: "nearest",
    damage: 55,
    fireInterval: 2.2,
    bulletSpeed: 34,
    count: 1,
    maxLevel: 8,
  },

  // ---- 5 NEW WEAPONS ----
  // Boomerang: fires forward, then curves back through the player (returns).
  // Great for hitting things both ways. Uses the "return" bullet behavior.
  boomerang: {
    name: "Boomerang",
    targeting: "nearest",
    damage: 16,
    fireInterval: 1.4,
    bulletSpeed: 20,
    count: 1,
    behavior: "return",
    maxLevel: 8,
  },
  // Orbit: a ring of bullets that circles the player (VS "King Bible" feel).
  // Constant nearby damage; doesn't need a target. Uses the "orbit" behavior.
  orbit: {
    name: "Orbit",
    targeting: "orbit",
    damage: 10,
    fireInterval: 2.4, // re-summons the ring on this cadence
    bulletSpeed: 0, // orbit speed handled by behavior
    count: 4, // bullets in the ring (scales with stacks visually)
    behavior: "orbit",
    maxLevel: 8,
  },
  // Homing: slow missiles that track the nearest enemy. Reliable cleanup.
  homing: {
    name: "Homing",
    targeting: "nearest",
    damage: 18,
    fireInterval: 1.2,
    bulletSpeed: 14,
    count: 1,
    behavior: "homing",
    maxLevel: 8,
  },
  // Shockwave: a big slow ring of many bullets pushing outward (crowd clear).
  shockwave: {
    name: "Shockwave",
    targeting: "radial",
    damage: 9,
    fireInterval: 2.6,
    bulletSpeed: 9,
    count: 16, // dense ring
    maxLevel: 8,
  },
  // Arc: a fast wide fan in the facing/nearest direction (sweeping spray).
  arc: {
    name: "Arc",
    targeting: "spread",
    damage: 9,
    fireInterval: 0.8,
    bulletSpeed: 22,
    count: 4,
    spreadAngle: 1.2, // wide sweep
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
    behavior: def.behavior || null,
    behaviors: [],
  };
}

function nearestEnemy(px, pz) {
  const enemies = activeEnemies();
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - px) ** 2 + (ep.z - pz) ** 2;
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

function twoNearest(px, pz) {
  const enemies = activeEnemies();
  let a = null, b = null, da = Infinity, db = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - px) ** 2 + (ep.z - pz) ** 2;
    if (d < da) { db = da; b = a; da = d; a = e; }
    else if (d < db) { db = d; b = e; }
  }
  return [a, b].filter(Boolean);
}

// Fire a single bullet along an angle (radians on the XZ plane), optionally with
// a behavior (return/homing/orbit) and an origin for behaviors that reference
// the player.
function fireAngle(px, pz, angle, speed, dmg, behavior, origin) {
  const tx = px + Math.cos(angle);
  const tz = pz + Math.sin(angle);
  const b = spawnBullet(px, pz, tx, tz, speed, dmg);
  if (b && behavior) attachBehavior(b, behavior, px, pz, angle, origin);
}

// Attach extra movement behavior to a freshly spawned bullet. The projectile
// updater reads these fields (added in projectiles.js).
function attachBehavior(b, behavior, px, pz, angle, origin) {
  b.behavior = behavior;
  if (behavior === "return") {
    b.age = 0;
    b.returnAt = 0.55; // seconds before it curves back
    b.origin = origin; // {x,z} live player position object
    b.baseSpeed = Math.hypot(b.vx, b.vz);
  } else if (behavior === "homing") {
    b.turnRate = 6.0; // radians/sec it can steer
    b.speed = Math.hypot(b.vx, b.vz);
  } else if (behavior === "orbit") {
    b.origin = origin;
    b.angle = angle;
    b.orbitRadius = 2.6;
    b.orbitSpeed = 3.2; // rad/sec
    b.life = 2.0; // ring persists this long
    b.vx = 0;
    b.vz = 0;
  }
}

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
        const ang = Math.atan2(tp.z - p.z, tp.x - p.x);
        fireAngle(p.x, p.z, ang, speed, dmg, w.behavior, p);
        fired = true;
      } else if (w.behavior === "orbit") {
        // orbit doesn't need a target
        const n = w.count;
        for (let i = 0; i < n; i++)
          fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, "orbit", p);
        fired = true;
      }
    } else if (w.targeting === "spread") {
      const target = nearestEnemy(p.x, p.z);
      const base = target
        ? Math.atan2(
            target.sprite.mesh.position.z - p.z,
            target.sprite.mesh.position.x - p.x
          )
        : Math.random() * Math.PI * 2; // no target -> sweep a random direction
      const n = w.count;
      const step = n > 1 ? w.spreadAngle / (n - 1) : 0;
      const start = base - w.spreadAngle / 2;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, start + step * i, speed, dmg, w.behavior, p);
      fired = true;
    } else if (w.targeting === "twin") {
      const targets = twoNearest(p.x, p.z);
      for (const t of targets) {
        const tp = t.sprite.mesh.position;
        const ang = Math.atan2(tp.z - p.z, tp.x - p.x);
        fireAngle(p.x, p.z, ang, speed, dmg, w.behavior, p);
      }
      if (targets.length) fired = true;
    } else if (w.targeting === "radial") {
      const n = w.count;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, w.behavior, p);
      fired = true;
    } else if (w.targeting === "orbit") {
      // summon a ring around the player
      const n = w.count;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, "orbit", p);
      fired = true;
    }

    if (fired) w.cooldown = w.fireInterval / mods.fireRate;
  }
}
