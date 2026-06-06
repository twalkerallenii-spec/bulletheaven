// bosses.js — named bosses (design §18, I.3). A boss is a single large, high-HP
// enemy that fights across 3 phases (a new attack cadence each HP third). The
// pre-boss math ritual (one problem -> single-use weapon) is handled by the
// math-moment flow; this module owns the boss entity, its phases and attacks,
// and the pre-boss weapon's effect (removes 1/4 max HP on hit).
//
// Slice scope: one active boss at a time (the Chrono Dragon), spawned by the
// threat clock in main.js. Roster data from I.3; patterns kept simple but real.

import { makeSprite } from "./sprite.js";
import { CONFIG } from "./config.js";

export const BOSSES = {
  chronodragon: { name: "Chrono Dragon", op: "div", maxHp: 1200, asset: "boss_dragon" },
};

let scene = null;
let boss = null; // the single active boss, or null
let bossBullets = [];

export function initBosses(sceneRef) {
  scene = sceneRef;
}

export function spawnBoss(id, playerPos) {
  const def = BOSSES[id] || BOSSES.chronodragon;
  const sprite = makeSprite(def.asset);
  // appear off to one side of the player
  const a = Math.random() * Math.PI * 2;
  const x = playerPos.x + Math.cos(a) * 16;
  const z = playerPos.z + Math.sin(a) * 16;
  sprite.mesh.position.set(x, 0.05, z);
  scene.add(sprite.mesh);
  boss = {
    sprite,
    def,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    radius: 2.2,
    speed: 1.6,
    phase: 1,
    fireCooldown: 1.5,
    animTimer: 0,
    prebossPending: true, // the single-use pre-boss weapon hasn't landed yet
  };
  return boss;
}

export function activeBoss() {
  return boss;
}
export function activeBossBullets() {
  return bossBullets;
}
export function removeBossBullet(b) {
  scene.remove(b.mesh);
  const i = bossBullets.indexOf(b);
  if (i >= 0) bossBullets.splice(i, 1);
}

// The pre-boss weapon connecting: removes exactly 1/4 of max HP, once (§18).
export function prebossHit() {
  if (!boss || !boss.prebossPending) return;
  boss.hp -= boss.maxHp * 0.25;
  boss.prebossPending = false;
}

function phaseFor(hp, maxHp) {
  const frac = hp / maxHp;
  if (frac > 0.66) return 1;
  if (frac > 0.33) return 2;
  return 3;
}

function fireRadial(x, z, count, speed) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const shot = makeSprite("ranged_shot");
    shot.mesh.position.set(x, 0.06, z);
    if (shot.mesh.scale) shot.mesh.scale.set(0.7, 0.7, 1);
    scene.add(shot.mesh);
    bossBullets.push({
      mesh: shot.mesh,
      vx: Math.cos(ang) * speed,
      vz: Math.sin(ang) * speed,
      life: 5,
      damage: CONFIG.contactDamage.boss ?? 30,
      radius: 0.4,
    });
  }
}

// Returns "defeated" once the boss dies (caller grants rewards + clears).
export function updateBoss(dt, player, onDefeat) {
  if (boss) {
    const bp = boss.sprite.mesh.position;
    const p = player.position;
    const dx = p.x - bp.x;
    const dz = p.z - bp.z;
    const dist = Math.hypot(dx, dz) || 1;

    // slow relentless approach
    bp.x += (dx / dist) * boss.speed * dt;
    bp.z += (dz / dist) * boss.speed * dt;

    // phase transitions by HP third (pattern-only, §18)
    boss.phase = phaseFor(boss.hp, boss.maxHp);

    // attack cadence quickens each phase
    boss.fireCooldown -= dt;
    if (boss.fireCooldown <= 0) {
      const phaseCfg = {
        1: { count: 8, speed: 7, cd: 2.2 },
        2: { count: 12, speed: 8, cd: 1.8 },
        3: { count: 16, speed: 9, cd: 1.4 },
      }[boss.phase];
      fireRadial(bp.x, bp.z, phaseCfg.count, phaseCfg.speed);
      boss.fireCooldown = phaseCfg.cd;
    }

    boss.animTimer += dt;
    boss.sprite.setFrame(Math.floor(boss.animTimer * 3));

    if (boss.hp <= 0) {
      scene.remove(boss.sprite.mesh);
      const defeated = boss;
      boss = null;
      if (onDefeat) onDefeat(defeated);
    }
  }

  // advance boss bullets
  for (let i = bossBullets.length - 1; i >= 0; i--) {
    const b = bossBullets[i];
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.z += b.vz * dt;
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.mesh);
      bossBullets.splice(i, 1);
    }
  }
}

// Clear any boss state (e.g. on run reset).
export function clearBoss() {
  if (boss) scene.remove(boss.sprite.mesh);
  boss = null;
  for (const b of bossBullets) scene.remove(b.mesh);
  bossBullets = [];
}
