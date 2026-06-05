// enemies.js — enemy entities + spawner (design §20, N.1).
//
// Slice scope (step 3): the CHASER archetype only — moves straight at the
// player. Swarmer/Ranged are gated behind kill thresholds later (§20); the
// spawn machinery here is built so adding them is just more cases.
//
// Enemies spawn in a ring just off-screen around the player (N.1) and despawn
// if they fall too far behind, keeping the active set bounded (M.5 ~300 cap).

import { makeSprite } from "./sprite.js";

const SPAWN_RADIUS = 30; // ring distance from player (just off-screen)
const DESPAWN_RADIUS = 50; // beyond this behind the player -> recycle
const MAX_ENEMIES = 300; // M.5 cap: stop spawning, don't drop frames
const SPAWN_INTERVAL = 0.6; // seconds between spawns (thickening trickle later)

// Per-archetype base stats (scaling comes later, §20 "stat-only").
const ARCHETYPES = {
  chaser: { hp: 10, speed: 2.2, radius: 0.5, asset: "chaser_blob" },
};

let scene = null;
const enemies = [];
let spawnTimer = 0;

export function initEnemies(sceneRef) {
  scene = sceneRef;
}

// Spawn position: a random point on a ring around the player (N.1).
function ringSpawn(playerPos, radius = SPAWN_RADIUS) {
  const a = Math.random() * Math.PI * 2;
  return {
    x: playerPos.x + Math.cos(a) * radius,
    z: playerPos.z + Math.sin(a) * radius,
  };
}

function spawnEnemy(kind, playerPos) {
  const def = ARCHETYPES[kind];
  const pos = ringSpawn(playerPos);
  const sprite = makeSprite(def.asset); // falls back to a red disc
  sprite.mesh.position.set(pos.x, 0.02, pos.z);
  scene.add(sprite.mesh);
  const e = {
    sprite,
    kind,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    radius: def.radius,
    animTimer: 0,
    alive: true,
  };
  enemies.push(e);
  return e;
}

function removeEnemy(e) {
  e.alive = false;
  scene.remove(e.sprite.mesh);
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
}

export function updateEnemies(dt, player) {
  const p = player.position;

  // --- spawn trickle ---
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL && enemies.length < MAX_ENEMIES) {
    spawnTimer = 0;
    spawnEnemy("chaser", p);
  }

  // --- movement: home toward the player ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const ep = e.sprite.mesh.position;
    const dx = p.x - ep.x;
    const dz = p.z - ep.z;
    const dist = Math.hypot(dx, dz) || 1;

    // Despawn if it somehow ended up way behind the player.
    if (dist > DESPAWN_RADIUS) {
      removeEnemy(e);
      continue;
    }

    ep.x += (dx / dist) * e.speed * dt;
    ep.z += (dz / dist) * e.speed * dt;

    e.animTimer += dt;
    e.sprite.setFrame(Math.floor(e.animTimer * 6));
  }
}

// Combat reads/mutates this list; on death it calls killEnemy().
export function activeEnemies() {
  return enemies;
}

export function killEnemy(e) {
  removeEnemy(e);
}
