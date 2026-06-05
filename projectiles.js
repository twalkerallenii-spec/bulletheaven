// projectiles.js — bullet pooling (design Appendix G, M.5).
//
// Perf-critical: never allocate bullets mid-run. Pre-allocate a pool and reuse.
// Each bullet is a small disc travelling on the XZ plane with a velocity, a
// lifetime, and a damage value. Weapons call spawnBullet(); combat reads the
// active list for collisions; spent/expired bullets are released back.

import * as THREE from "three";

const POOL_SIZE = 500; // CONFIG.projectilePool
const BULLET_RADIUS = 0.18;
const BULLET_LIFETIME = 2.5; // seconds before auto-release (off-screen cleanup)

let scene = null;
const free = [];
const active = [];

// Shared geometry/material across all bullets -> few draw calls (M.5 rule).
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
  active.push(b);
  return b;
}

export function releaseBullet(b) {
  b.active = false;
  b.mesh.visible = false;
  const i = active.indexOf(b);
  if (i >= 0) active.splice(i, 1);
  free.push(b);
}

export function updateProjectiles(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    if (b.life <= 0) releaseBullet(b);
  }
}

export function activeBullets() {
  return active;
}
