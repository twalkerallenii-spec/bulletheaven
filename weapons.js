// weapons.js — weapon definitions + auto-fire (design §19, A.4, I.2).
//
// True bullet heaven: weapons fire on their own timer with their own targeting.
// The player never aims. DUPLICATE STACKING is allowed: owning the same weapon
// multiple times gives multiple independent instances, so firepower compounds
// toward the late-game bullet flood. 13 weapons.
//
// Each weapon carries a STYLE (color + shape + size + length) so its bullets
// read distinctly on screen — round shots, long tracers, fat slow blobs — for a
// colorful flood rather than a wall of identical yellow dots.

import { spawnBullet } from "./projectiles.js";
import { activeEnemies } from "./enemies.js";

export const WEAPONS = {
  pistol: {
    name: "Pistol", targeting: "nearest",
    damage: 14, fireInterval: 0.9, bulletSpeed: 18, count: 1, maxLevel: 8,
    evolvesWith: "scope", evolvesInto: "railgun",
    style: { sprite: "bullet_fire_ball", color: 0xffee58, shape: "round", size: 1 },
  },
  spread: {
    name: "Spread", targeting: "spread",
    damage: 8, fireInterval: 1.3, bulletSpeed: 16, count: 3, spreadAngle: 0.5, maxLevel: 8,
    style: { sprite: "bullet_water_ball", color: 0x4fc3f7, shape: "round", size: 0.9 },
  },
  burst: {
    name: "Burst", targeting: "radial",
    damage: 6, fireInterval: 1.8, bulletSpeed: 13, count: 8, maxLevel: 8,
    style: { sprite: "bullet_fire_orb_small", color: 0xff7043, shape: "round", size: 1 },
  },
  lobber: {
    name: "Lobber", targeting: "random",
    damage: 20, fireInterval: 1.5, bulletSpeed: 14, count: 1, maxLevel: 8,
    style: { sprite: "bullet_purple_orb_big", color: 0xab47bc, shape: "round", size: 1.5 },
  },
  beam: {
    name: "Beam", targeting: "nearest",
    damage: 6, fireInterval: 0.3, bulletSpeed: 26, count: 1, maxLevel: 8,
    style: { sprite: "bullet_green_bolt", color: 0x69f0ae, shape: "tracer", size: 0.9, length: 2.5 },
  },
  twin: {
    name: "Twin", targeting: "twin",
    damage: 11, fireInterval: 1.0, bulletSpeed: 18, count: 1, maxLevel: 8,
    style: { sprite: "bullet_fire_diamond", color: 0xffd54f, shape: "round", size: 1 },
  },
  scatter: {
    name: "Scatter", targeting: "spread",
    damage: 7, fireInterval: 1.6, bulletSpeed: 15, count: 5, spreadAngle: 0.9, maxLevel: 8,
    style: { sprite: "bullet_purple_ball", color: 0xf06292, shape: "round", size: 0.85 },
  },
  sniper: {
    name: "Sniper", targeting: "nearest",
    damage: 55, fireInterval: 2.2, bulletSpeed: 34, count: 1, maxLevel: 8,
    style: { sprite: "bullet_water_bolt", color: 0xffffff, shape: "tracer", size: 1.1, length: 3 },
  },

  // ---- 5 NEW WEAPONS ----
  boomerang: {
    name: "Boomerang", targeting: "nearest",
    damage: 16, fireInterval: 1.4, bulletSpeed: 20, count: 1, behavior: "return", maxLevel: 8,
    style: { sprite: "bullet_water_crescent", color: 0x26c6da, shape: "round", size: 1.2 },
  },
  orbit: {
    name: "Orbit", targeting: "orbit",
    damage: 10, fireInterval: 2.4, bulletSpeed: 0, count: 4, behavior: "orbit", maxLevel: 8,
    style: { sprite: "bullet_purple_orb_small", color: 0xba68c8, shape: "round", size: 1.2 },
  },
  homing: {
    name: "Homing", targeting: "nearest",
    damage: 18, fireInterval: 1.2, bulletSpeed: 14, count: 1, behavior: "homing", maxLevel: 8,
    style: { sprite: "bullet_fire_diamond", color: 0xff5252, shape: "round", size: 1.1 },
  },
  shockwave: {
    name: "Shockwave", targeting: "radial",
    damage: 9, fireInterval: 2.6, bulletSpeed: 9, count: 16, maxLevel: 8,
    style: { sprite: "bullet_water_orb_small", color: 0x40c4ff, shape: "round", size: 1.1 },
  },
  arc: {
    name: "Arc", targeting: "spread",
    damage: 9, fireInterval: 0.8, bulletSpeed: 22, count: 4, spreadAngle: 1.2, maxLevel: 8,
    style: { sprite: "bullet_green_bolt", color: 0xfff176, shape: "tracer", size: 0.8, length: 2.5 },
  },
};

// Derive the impact-effect theme from a bullet sprite name (e.g.
// "bullet_water_ball" -> "water"), so hits/kills burst in the matching color.
function fxThemeFromStyle(style) {
  const name = style?.sprite || "";
  for (const theme of ["water", "purple", "green", "fire"]) {
    if (name.includes(theme)) return theme;
  }
  return "fire"; // default
}

export function makeWeapon(id) {
  const def = WEAPONS[id];
  const baseStyle = def.style || { color: 0xffee58, shape: "round", size: 1 };
  // theme drives both the comet bullet and the matching impact burst
  const theme = fxThemeFromStyle(baseStyle);
  // FLASHY BULLETS: every weapon fires its themed plasma comet (a glowing
  // tracer that streaks along travel). We preserve each weapon's size feel via
  // a per-shape multiplier so heavy shots still look bigger than rapid ones.
  const wasTracer = baseStyle.shape === "tracer";
  const baseSize = baseStyle.size ?? 1;
  const style = {
    ...baseStyle,
    sprite: `comet_${theme}`,
    color: baseStyle.color, // fallback only if the comet fails to load
    shape: "tracer",
    // comets read big; scale down a touch, and give long-range/sniper shots a
    // longer streak. Round-weapon comets get a modest streak, existing tracers
    // a longer one.
    size: baseSize * 0.9,
    length: wasTracer ? (baseStyle.length ?? 2) : 1.4,
    fx: `fx_${theme}_spark`,
    fxKill: `fx_${theme}_shock`,
  };
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
    style,
    behaviors: [],
  };
}

function nearestEnemy(px, pz) {
  const enemies = activeEnemies();
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - px) ** 2 + (ep.z - pz) ** 2;
    if (d < bestD) { bestD = d; best = e; }
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

// Fire one bullet along an angle, with style + optional behavior.
function fireAngle(px, pz, angle, speed, dmg, behavior, origin, style) {
  const tx = px + Math.cos(angle);
  const tz = pz + Math.sin(angle);
  const b = spawnBullet(px, pz, tx, tz, speed, dmg, style);
  if (b && behavior) attachBehavior(b, behavior, px, pz, angle, origin);
}

function attachBehavior(b, behavior, px, pz, angle, origin) {
  b.behavior = behavior;
  if (behavior === "return") {
    b.age = 0;
    b.returnAt = 0.55;
    b.origin = origin;
    b.baseSpeed = Math.hypot(b.vx, b.vz);
  } else if (behavior === "homing") {
    b.turnRate = 6.0;
    b.speed = Math.hypot(b.vx, b.vz);
  } else if (behavior === "orbit") {
    b.origin = origin;
    b.angle = angle;
    b.orbitRadius = 2.6;
    b.orbitSpeed = 3.2;
    b.life = 2.0;
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
    const style = w.style;
    let fired = false;

    if (w.targeting === "nearest" || w.targeting === "random") {
      const target = w.targeting === "random" ? randomEnemy() : nearestEnemy(p.x, p.z);
      if (target) {
        const tp = target.sprite.mesh.position;
        const ang = Math.atan2(tp.z - p.z, tp.x - p.x);
        fireAngle(p.x, p.z, ang, speed, dmg, w.behavior, p, style);
        fired = true;
      } else if (w.behavior === "orbit") {
        const n = w.count;
        for (let i = 0; i < n; i++)
          fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, "orbit", p, style);
        fired = true;
      }
    } else if (w.targeting === "spread") {
      const target = nearestEnemy(p.x, p.z);
      const base = target
        ? Math.atan2(target.sprite.mesh.position.z - p.z, target.sprite.mesh.position.x - p.x)
        : Math.random() * Math.PI * 2;
      const n = w.count;
      const step = n > 1 ? w.spreadAngle / (n - 1) : 0;
      const start = base - w.spreadAngle / 2;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, start + step * i, speed, dmg, w.behavior, p, style);
      fired = true;
    } else if (w.targeting === "twin") {
      const targets = twoNearest(p.x, p.z);
      for (const t of targets) {
        const tp = t.sprite.mesh.position;
        const ang = Math.atan2(tp.z - p.z, tp.x - p.x);
        fireAngle(p.x, p.z, ang, speed, dmg, w.behavior, p, style);
      }
      if (targets.length) fired = true;
    } else if (w.targeting === "radial") {
      const n = w.count;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, w.behavior, p, style);
      fired = true;
    } else if (w.targeting === "orbit") {
      const n = w.count;
      for (let i = 0; i < n; i++)
        fireAngle(p.x, p.z, (i / n) * Math.PI * 2, speed, dmg, "orbit", p, style);
      fired = true;
    }

    if (fired) w.cooldown = w.fireInterval / mods.fireRate;
  }
}
