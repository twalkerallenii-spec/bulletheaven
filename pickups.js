// pickups.js — XP gems + Time orbs that drop on kill (design §6, N.4, G).
//
// Pooled like projectiles (never allocate mid-run). A pickup sits where the
// enemy died; once the player's pickup radius reaches it, it flies in and is
// collected. Collection grants XP (-> level-up clock) or Time (-> currency).

import * as THREE from "three";

const POOL_SIZE = 400;
const GEM_RADIUS = 0.22;
const COLLECT_DIST = 0.55; // close enough -> collected

let scene = null;
const free = [];
const active = [];

// Two visual kinds: xp (green) and time (gold). Shared geometry; one material
// per color so draw calls stay low.
const gemGeo = new THREE.CircleGeometry(GEM_RADIUS, 8);
const matXp = new THREE.MeshBasicMaterial({ color: 0x69f0ae }); // green
const matTime = new THREE.MeshBasicMaterial({ color: 0xffd54f }); // gold

function makeGem() {
  const mesh = new THREE.Mesh(gemGeo, matXp); // material set per-spawn
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return { mesh, kind: "xp", amount: 0, active: false };
}

export function initPickups(sceneRef) {
  scene = sceneRef;
  for (let i = 0; i < POOL_SIZE; i++) {
    const g = makeGem();
    scene.add(g.mesh);
    free.push(g);
  }
}

// Drop a pickup at (x,z). kind is "xp" or "time".
export function spawnPickup(x, z, kind, amount) {
  const g = free.pop();
  if (!g) return null; // pool exhausted — skip
  g.kind = kind;
  g.amount = amount;
  g.active = true;
  g.mesh.material = kind === "time" ? matTime : matXp;
  g.mesh.visible = true;
  g.mesh.position.set(x, 0.04, z);
  active.push(g);
  return g;
}

function release(g) {
  g.active = false;
  g.mesh.visible = false;
  const i = active.indexOf(g);
  if (i >= 0) active.splice(i, 1);
  free.push(g);
}

// Each frame: gems within pickup range home toward the player; on contact,
// collect (grant via the callbacks the run wires in).
export function updatePickups(dt, player, { onXp, onTime, pickupRange, flySpeed }) {
  const p = player.position;
  const range = pickupRange;
  for (let i = active.length - 1; i >= 0; i--) {
    const g = active[i];
    const gp = g.mesh.position;
    const dx = p.x - gp.x;
    const dz = p.z - gp.z;
    const dist = Math.hypot(dx, dz) || 1;

    if (dist < range) {
      // fly toward the player
      gp.x += (dx / dist) * flySpeed * dt;
      gp.z += (dz / dist) * flySpeed * dt;
      if (dist < COLLECT_DIST) {
        if (g.kind === "time") onTime(g.amount);
        else onXp(g.amount);
        release(g);
      }
    }
  }
}

export function activePickups() {
  return active;
}
