// bosses.js — named bosses (design §18, I.3). A boss is a single large, high-HP
// enemy that fights across 3 phases (a new attack cadence each HP third). The
// pre-boss math ritual (one problem -> single-use weapon) is handled by the
// math-moment flow; this module owns the boss entity, its phases and attacks,
// and the pre-boss weapon's effect (removes 1/4 max HP on hit).
//
// The active boss is the Orc Warrior (Pixel Crawler sprite). It fires rings of
// the purple themed bullet sprites (the user's Effect_and_Bullet art) so its
// attacks read as menacing magic bolts, not plain discs.

import { makeSprite } from "./sprite.js";
import { CONFIG } from "./config.js";

export const BOSSES = {
  chronodragon: { name: "Orc Warlord", op: "div", maxHp: 1200, asset: "boss_dragon" },
};

// Which bullet sprite the boss fires (purple plasma comet = menacing + flashy).
// Falls back to a disc in sprite.js if the art isn't loaded.
const BOSS_BULLET = "comet_purple";

let scene = null;
let boss = null;
let bossBullets = [];

export function initBosses(sceneRef) {
  scene = sceneRef;
}

export function spawnBoss(id, playerPos) {
  const def = BOSSES[id] || BOSSES.chronodragon;
  const sprite = makeSprite(def.asset);
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
    prebossPending: true,
  };
  return boss;
}

export function activeBoss() { return boss; }
export function activeBossBullets() { return bossBullets; }
export function removeBossBullet(b) {
  scene.remove(b.mesh);
  const i = bossBullets.indexOf(b);
  if (i >= 0) bossBullets.splice(i, 1);
}

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
    // fire the themed bullet sprite (purple bolt) instead of a plain disc
    const shot = makeSprite(BOSS_BULLET);
    shot.mesh.position.set(x, 0.06, z);
    if (shot.mesh.scale) shot.mesh.scale.set(1.0, 1.0, 1);
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

export function updateBoss(dt, player, onDefeat) {
  if (boss) {
    const bp = boss.sprite.mesh.position;
    const p = player.position;
    const dx = p.x - bp.x;
    const dz = p.z - bp.z;
    const dist = Math.hypot(dx, dz) || 1;

    bp.x += (dx / dist) * boss.speed * dt;
    bp.z += (dz / dist) * boss.speed * dt;

    boss.phase = phaseFor(boss.hp, boss.maxHp);

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

export function clearBoss() {
  if (boss) scene.remove(boss.sprite.mesh);
  boss = null;
  for (const b of bossBullets) scene.remove(b.mesh);
  bossBullets = [];
}
