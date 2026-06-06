// enemies.js — enemy entities, spawner, waves (design §12, §20, N.1, M.5).
//
// Three archetypes (§20):
//   chaser  — moves straight at the player (available from the start)
//   swarmer — weak, fast, arrives in packs (unlocks at a kill threshold)
//   ranged  — keeps its distance and fires projectiles (unlocks later)
//
// Wave model (§12): a continuous trickle that THICKENS over time. Archetypes
// unlock at cumulative-kill thresholds so the run teaches itself. Scaling is
// stat-only (§20): same enemies, bigger/tankier/faster as the run elapses.

import { makeSprite } from "./sprite.js";
import { CONFIG } from "./config.js";

const SPAWN_RADIUS = 30;
const DESPAWN_RADIUS = 50;
const MAX_ENEMIES = 300; // M.5 cap

const ARCHETYPES = {
  chaser: {
    hp: 10, speed: 2.2, radius: 0.5, asset: "chaser_imp",
    unlockKills: 0, weight: 5,
  },
  swarmer: {
    hp: 5, speed: 3.2, radius: 0.4, asset: "swarmer_snow",
    unlockKills: 15, weight: 6, pack: 4,
  },
  ranged: {
    hp: 14, speed: 1.4, radius: 0.5, asset: "ranged_imp2",
    unlockKills: 40, weight: 3,
    keepDist: 9, fireInterval: 2.2,
    shotSpeed: 8, shotDamage: CONFIG.rangedProjectileDamage ?? 6,
  },
};

let scene = null;
const enemies = [];
const enemyBullets = [];
let spawnTimer = 0;
let runElapsed = 0;
let totalKills = 0;

export function initEnemies(sceneRef) {
  scene = sceneRef;
}

function scaleNow() {
  const min = runElapsed / 60;
  return {
    hp: 1 + (CONFIG.hpScalePerMin ?? 0.15) * min,
    speed: 1 + (CONFIG.speedScalePerMin ?? 0.04) * min,
    size: 1 + (CONFIG.sizeScalePerMin ?? 0.03) * min,
  };
}

function spawnInterval() {
  return Math.max(0.18, 0.7 - runElapsed * 0.0009);
}

function ringSpawn(playerPos, radius = SPAWN_RADIUS) {
  const a = Math.random() * Math.PI * 2;
  return {
    x: playerPos.x + Math.cos(a) * radius,
    z: playerPos.z + Math.sin(a) * radius,
  };
}

function unlockedPool() {
  const pool = [];
  for (const [kind, def] of Object.entries(ARCHETYPES)) {
    if (totalKills >= def.unlockKills) {
      for (let i = 0; i < def.weight; i++) pool.push(kind);
    }
  }
  return pool;
}

function spawnEnemy(kind, playerPos, sc) {
  const def = ARCHETYPES[kind];
  const pos = ringSpawn(playerPos);
  const sprite = makeSprite(def.asset);
  sprite.mesh.position.set(pos.x, 0.02, pos.z);
  if (sprite.mesh.scale) {
    const base = sprite.mesh.scale.x || 1.4;
    sprite.mesh.scale.set(base * sc.size, base * sc.size, 1);
  }
  scene.add(sprite.mesh);
  const e = {
    sprite, kind,
    hp: def.hp * sc.hp,
    maxHp: def.hp * sc.hp,
    speed: def.speed * sc.speed,
    radius: def.radius * sc.size,
    animTimer: Math.random(),
    alive: true,
    fireCooldown: def.fireInterval ? Math.random() * def.fireInterval : 0,
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

function spawnEnemyBullet(x, z, tx, tz, def) {
  const shot = makeSprite("ranged_shot"); // falls back to a colored disc
  shot.mesh.position.set(x, 0.06, z);
  if (shot.mesh.scale) shot.mesh.scale.set(0.5, 0.5, 1);
  scene.add(shot.mesh);
  const dx = tx - x, dz = tz - z, len = Math.hypot(dx, dz) || 1;
  enemyBullets.push({
    mesh: shot.mesh,
    vx: (dx / len) * def.shotSpeed,
    vz: (dz / len) * def.shotSpeed,
    life: 4, damage: def.shotDamage, radius: 0.3,
  });
}

export function updateEnemies(dt, player) {
  const p = player.position;
  runElapsed += dt;
  const sc = scaleNow();

  spawnTimer += dt;
  if (spawnTimer >= spawnInterval() && enemies.length < MAX_ENEMIES) {
    spawnTimer = 0;
    const pool = unlockedPool();
    const kind = pool[(Math.random() * pool.length) | 0] || "chaser";
    const def = ARCHETYPES[kind];
    if (def.pack) {
      const base = ringSpawn(p);
      for (let i = 0; i < def.pack && enemies.length < MAX_ENEMIES; i++) {
        const e = spawnEnemy(kind, p, sc);
        e.sprite.mesh.position.x = base.x + (Math.random() - 0.5) * 4;
        e.sprite.mesh.position.z = base.z + (Math.random() - 0.5) * 4;
      }
    } else {
      spawnEnemy(kind, p, sc);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const def = ARCHETYPES[e.kind];
    const ep = e.sprite.mesh.position;
    const dx = p.x - ep.x, dz = p.z - ep.z;
    const dist = Math.hypot(dx, dz) || 1;

    if (dist > DESPAWN_RADIUS) { removeEnemy(e); continue; }

    if (e.kind === "ranged") {
      const keep = def.keepDist;
      let move = 0;
      if (dist > keep + 1.5) move = 1;
      else if (dist < keep - 1.5) move = -1;
      ep.x += (dx / dist) * e.speed * move * dt;
      ep.z += (dz / dist) * e.speed * move * dt;
      e.fireCooldown -= dt;
      if (e.fireCooldown <= 0 && dist < keep + 6) {
        e.fireCooldown = def.fireInterval;
        spawnEnemyBullet(ep.x, ep.z, p.x, p.z, def);
      }
    } else {
      ep.x += (dx / dist) * e.speed * dt;
      ep.z += (dz / dist) * e.speed * dt;
    }

    e.animTimer += dt;
    e.sprite.setFrame(Math.floor(e.animTimer * 3));
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      enemyBullets.splice(i, 1);
    }
  }
}

export function activeEnemies() { return enemies; }
export function activeEnemyBullets() { return enemyBullets; }
export function removeEnemyBullet(b) {
  scene.remove(b.mesh);
  const i = enemyBullets.indexOf(b);
  if (i >= 0) enemyBullets.splice(i, 1);
}
export function killEnemy(e) { totalKills += 1; removeEnemy(e); }
export function getKills() { return totalKills; }
export function getRunElapsed() { return runElapsed; }
