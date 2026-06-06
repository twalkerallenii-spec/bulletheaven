// projectiles.js — bullet pooling (design Appendix G, M.5).
//
// Perf-critical: never allocate bullets mid-run. Pre-allocate a pool and reuse.
// Each bullet is a small disc travelling on the XZ plane with a velocity, a
// lifetime, and a damage value. Weapons call spawnBullet(); combat reads the
// active list for collisions; spent/expired bullets are released back.
//
// Bullets can carry an optional BEHAVIOR (set by weapons.js after spawn):
//   "return" — flies out, then curves back through the player (boomerang)
//   "homing" — steers toward the nearest enemy each frame (missile)
//   "orbit"  — circles the player at a fixed radius for a while (orbiting ring)
// Plain bullets (no behavior) just travel straight. Behavior fields are reset
// on release so a recycled bullet never inherits stale state.

import * as THREE from "three";
import { activeEnemies } from "./enemies.js";

const POOL_SIZE = 800; // bumped for duplicate-stacked firepower (the flood)
const BULLET_RADIUS = 0.18;
const BULLET_LIFETIME = 2.5; // seconds before auto-release (off-screen cleanup)

let scene = null;
const free = [];
const active = [];

const bulletGeo = new THREE.CircleGeometry(BULLET_RADIUS, 10);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffee58 }); // yellow

function makeBullet() {
  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.rotation.x = -Math.PI / 2; // flat on the ground plane
  mesh.visible = false;
  return {
    mesh,
    vx: 0,
    vz: 0,
    life: 0,
    damage: 0,
    active: false,
    radius: BULLET_RADIUS,
    // behavior fields (cleared on release)
    behavior: null,
    age: 0,
    returnAt: 0,
    origin: null,
    baseSpeed: 0,
    turnRate: 0,
    speed: 0,
    angle: 0,
    orbitRadius: 0,
    orbitSpeed: 0,
  };
}

export function initProjectiles(sceneRef) {
  scene = sceneRef;
  for (let i = 0; i < POOL_SIZE; i++) {
    const b = makeBullet();
    scene.add(b.mesh);
    free.push(b);
  }
}

// Spawn a bullet at (x,z) travelling toward (tx,tz) at `speed` units/sec.
export function spawnBullet(x, z, tx, tz, speed, damage) {
  const b = free.pop();
  if (!b) return null; // pool exhausted — silently skip (cap behavior)
  const dx = tx - x;
  const dz = tz - z;
  const len = Math.hypot(dx, dz) || 1;
  b.vx = (dx / len) * speed;
  b.vz = (dz / len) * speed;
  b.life = BULLET_LIFETIME;
  b.damage = damage;
  b.active = true;
  b.mesh.visible = true;
  b.mesh.position.set(x, 0.05, z);
  // reset behavior to plain (weapons.js may attach one right after)
  b.behavior = null;
  b.age = 0;
  b.origin = null;
  active.push(b);
  return b;
}

export function releaseBullet(b) {
  b.active = false;
  b.mesh.visible = false;
  b.behavior = null;
  b.origin = null;
  const i = active.indexOf(b);
  if (i >= 0) active.splice(i, 1);
  free.push(b);
}

function nearestEnemyTo(x, z) {
  const enemies = activeEnemies();
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - x) ** 2 + (ep.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function updateProjectiles(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];

    if (b.behavior === "orbit") {
      // circle the player at a fixed radius; expire after b.life
      b.life -= dt;
      b.angle += b.orbitSpeed * dt;
      const ox = b.origin ? b.origin.x : 0;
      const oz = b.origin ? b.origin.z : 0;
      b.mesh.position.x = ox + Math.cos(b.angle) * b.orbitRadius;
      b.mesh.position.z = oz + Math.sin(b.angle) * b.orbitRadius;
      if (b.life <= 0) releaseBullet(b);
      continue;
    }

    if (b.behavior === "homing") {
      // steer the velocity toward the nearest enemy, capped by turn rate
      const tgt = nearestEnemyTo(b.mesh.position.x, b.mesh.position.z);
      if (tgt) {
        const tp = tgt.sprite.mesh.position;
        const desired = Math.atan2(
          tp.z - b.mesh.position.z,
          tp.x - b.mesh.position.x
        );
        let cur = Math.atan2(b.vz, b.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = b.turnRate * dt;
        cur += Math.max(-maxTurn, Math.min(maxTurn, diff));
        b.vx = Math.cos(cur) * b.speed;
        b.vz = Math.sin(cur) * b.speed;
      }
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0) releaseBullet(b);
      continue;
    }

    if (b.behavior === "return") {
      // fly out, then reverse and home back through the player position
      b.age += dt;
      if (b.age >= b.returnAt && b.origin) {
        const desired = Math.atan2(
          b.origin.z - b.mesh.position.z,
          b.origin.x - b.mesh.position.x
        );
        b.vx = Math.cos(desired) * b.baseSpeed;
        b.vz = Math.sin(desired) * b.baseSpeed;
      }
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0) releaseBullet(b);
      continue;
    }

    // plain straight-line bullet
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    if (b.life <= 0) releaseBullet(b);
  }
}

export function activeBullets() {
  return active;
}
