// projectiles.js — bullet pooling (design Appendix G, M.5).
//
// Perf-critical: never allocate bullets mid-run. Pre-allocate a pool and reuse.
// Each bullet travels on the XZ plane with a velocity, lifetime, and damage.
// Weapons call spawnBullet() with a STYLE; the style names a real bullet SPRITE
// (sliced from the purchased Effect_and_Bullet sheets) plus a size — so guns
// fire glowing textured projectiles (water/purple/green/fire orbs, stars, etc.)
// rather than flat colored dots. If a sprite isn't found, we fall back to a
// plain colored disc so nothing ever vanishes.
//
// Behavior (return/homing/orbit) is set by weapons.js after spawn. Behavior +
// style fields reset on release so a recycled bullet never carries stale state.

import * as THREE from "three";
import { activeEnemies } from "./enemies.js";
import { bulletTexture, hasBulletSprite, bulletAspect } from "./sprite.js";

const POOL_SIZE = 900;
const BASE_HALF = 0.28; // half-size of a 1x bullet plane in world units
const BULLET_LIFETIME = 2.5;

let scene = null;
const free = [];
const active = [];

// One shared unit plane; we scale per bullet. (Sprites are square 16x16 art.)
const planeGeo = new THREE.PlaneGeometry(BASE_HALF * 2, BASE_HALF * 2);

// Material cache. Textured bullets cache by sprite name; the disc fallback
// caches by color. Keeps material count bounded even with the flood.
const texMatCache = new Map();
function texMaterialFor(name) {
  if (texMatCache.has(name)) return texMatCache.get(name);
  const tex = bulletTexture(name);
  let mat = null;
  if (tex) {
    // comets are glowing plasma — render them additively so the white-hot core
    // and colored trail bloom against the world. Other textured bullets stay
    // normal alpha. (Additive needs depthWrite off to layer correctly.)
    const glow = name.startsWith("comet_");
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  texMatCache.set(name, mat);
  return mat;
}
const colorMatCache = new Map();
function colorMaterialFor(color) {
  if (colorMatCache.has(color)) return colorMatCache.get(color);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
  });
  colorMatCache.set(color, mat);
  return mat;
}

function makeBullet() {
  const mesh = new THREE.Mesh(planeGeo, colorMaterialFor(0xffee58));
  mesh.rotation.x = -Math.PI / 2; // flat on the ground plane
  mesh.visible = false;
  return {
    mesh,
    vx: 0, vz: 0, life: 0, damage: 0, active: false, radius: BASE_HALF,
    shape: "round",
    behavior: null, age: 0, returnAt: 0, origin: null,
    baseSpeed: 0, turnRate: 0, speed: 0, angle: 0,
    orbitRadius: 0, orbitSpeed: 0,
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

// style = { sprite, color, shape, size, length }
//   sprite — bullet sprite name (e.g. "bullet_fire_orb_small"); if present and
//            loaded, the bullet is textured. Otherwise falls back to `color`.
//   color  — hex fallback when no sprite
//   shape  — "round" | "tracer" (tracer stretches + orients along travel)
//   size   — overall size multiplier
//   length — long-axis multiplier for tracers
function applyStyle(b, style) {
  const shape = style?.shape ?? "round";
  const size = style?.size ?? 1;
  const length = style?.length ?? 1;
  b.shape = shape;

  // pick textured material if the sprite exists, else colored disc
  let mat = null;
  if (style?.sprite && hasBulletSprite(style.sprite)) {
    mat = texMaterialFor(style.sprite);
  }
  if (!mat) mat = colorMaterialFor(style?.color ?? 0xffee58);
  b.mesh.material = mat;

  if (shape === "tracer") {
    // for textured streaks (comets), match the sprite's real aspect so it keeps
    // its long shape; `length` still lets weapons exaggerate the streak.
    const aspect = style?.sprite && hasBulletSprite(style.sprite)
      ? bulletAspect(style.sprite) : 0.4;
    b.mesh.scale.set(size * length, size * length * aspect, 1);
    b.radius = BASE_HALF * size;
    b.mesh.rotation.x = -Math.PI / 2;
  } else {
    b.mesh.scale.set(size, size, 1);
    b.radius = BASE_HALF * size;
    b.mesh.rotation.set(-Math.PI / 2, 0, 0);
  }
}

function orientTracer(b) {
  if (b.shape !== "tracer") return;
  const ang = Math.atan2(b.vz, b.vx);
  b.mesh.rotation.set(-Math.PI / 2, 0, -ang);
}

export function spawnBullet(x, z, tx, tz, speed, damage, style) {
  const b = free.pop();
  if (!b) return null;
  const dx = tx - x;
  const dz = tz - z;
  const len = Math.hypot(dx, dz) || 1;
  b.vx = (dx / len) * speed;
  b.vz = (dz / len) * speed;
  b.life = BULLET_LIFETIME;
  b.damage = damage;
  b.active = true;
  b.mesh.visible = true;
  b.mesh.position.set(x, 0.06, z);
  b.behavior = null;
  b.age = 0;
  b.origin = null;
  // remember the effect theme for combat to spawn a matching impact burst
  b.fx = style?.fx || null;
  b.fxKill = style?.fxKill || null;
  applyStyle(b, style);
  orientTracer(b);
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
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const ep = e.sprite.mesh.position;
    const d = (ep.x - x) ** 2 + (ep.z - z) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function updateProjectiles(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];

    if (b.behavior === "orbit") {
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
      const tgt = nearestEnemyTo(b.mesh.position.x, b.mesh.position.z);
      if (tgt) {
        const tp = tgt.sprite.mesh.position;
        const desired = Math.atan2(tp.z - b.mesh.position.z, tp.x - b.mesh.position.x);
        let cur = Math.atan2(b.vz, b.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = b.turnRate * dt;
        cur += Math.max(-maxTurn, Math.min(maxTurn, diff));
        b.vx = Math.cos(cur) * b.speed;
        b.vz = Math.sin(cur) * b.speed;
        orientTracer(b);
      }
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0) releaseBullet(b);
      continue;
    }

    if (b.behavior === "return") {
      b.age += dt;
      if (b.age >= b.returnAt && b.origin) {
        const desired = Math.atan2(b.origin.z - b.mesh.position.z, b.origin.x - b.mesh.position.x);
        b.vx = Math.cos(desired) * b.baseSpeed;
        b.vz = Math.sin(desired) * b.baseSpeed;
        orientTracer(b);
      }
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0) releaseBullet(b);
      continue;
    }

    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    if (b.life <= 0) releaseBullet(b);
  }
}

export function activeBullets() {
  return active;
}
