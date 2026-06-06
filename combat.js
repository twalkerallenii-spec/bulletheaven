// combat.js — collisions, damage, deaths, floating damage numbers (step 5).
//
// Slice scope: bullet -> enemy hits + enemy contact damage to the player (M.1,
// i-frames). Now also spawns a themed impact burst (effects.js) on hits/kills,
// using the bullet's effect color. Floating numbers are DOM nodes projected
// from world position onto the #ui-overlay each frame they live.

import * as THREE from "three";
import { activeBullets, releaseBullet } from "./projectiles.js";
import {
  activeEnemies,
  killEnemy,
  activeEnemyBullets,
  removeEnemyBullet,
} from "./enemies.js";
import { CONFIG } from "./config.js";
import {
  activeBoss,
  activeBossBullets,
  removeBossBullet,
} from "./bosses.js";
import { spawnEffect } from "./effects.js";

let camera = null;
let overlay = null;
const floaters = [];

const FLOATER_LIFE = 0.8;
const FLOATER_RISE = 1.4;

export function initCombat(cameraRef) {
  camera = cameraRef;
  overlay = document.getElementById("ui-overlay");
}

function hits(ax, az, ar, bx, bz, br) {
  const r = ar + br;
  return (ax - bx) ** 2 + (az - bz) ** 2 <= r * r;
}

export function updateCombat(dt, player, onKill, onLifeLost) {
  const bullets = activeBullets();
  const enemies = activeEnemies();

  // --- bullet -> enemy ---
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    const bp = b.mesh.position;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const ep = e.sprite.mesh.position;
      if (hits(bp.x, bp.z, b.radius, ep.x, ep.z, e.radius)) {
        e.hp -= b.damage;
        spawnFloater(ep.x, ep.z, Math.round(b.damage));
        const fx = b.fx || "fx_fire_spark";
        if (e.hp <= 0) {
          const dx = ep.x;
          const dz = ep.z;
          // bigger burst on a kill
          spawnEffect(b.fxKill || "fx_fire_shock", dx, dz, { size: 1.3, duration: 0.4 });
          killEnemy(e);
          if (onKill) onKill(e, dx, dz);
        } else {
          // small spark on a non-lethal hit
          spawnEffect(fx, ep.x, ep.z, { size: 0.7, duration: 0.25 });
        }
        releaseBullet(b);
        break;
      }
    }
  }

  // --- bullet -> boss ---
  const boss = activeBoss();
  if (boss) {
    const bpos = boss.sprite.mesh.position;
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      const bp = b.mesh.position;
      if (hits(bp.x, bp.z, b.radius, bpos.x, bpos.z, boss.radius)) {
        boss.hp -= b.damage;
        spawnFloater(bpos.x, bpos.z, Math.round(b.damage));
        spawnEffect(b.fx || "fx_fire_spark", bp.x, bp.z, { size: 0.8, duration: 0.25 });
        releaseBullet(b);
      }
    }
  }

  // --- enemy -> player: touch damage with i-frames (M.1) ---
  if (player.iframe > 0) player.iframe = Math.max(0, player.iframe - dt);

  const pp = player.position;

  function hurtPlayer(dmg) {
    if (player.iframe > 0) return;
    player.hp -= dmg;
    player.iframe = CONFIG.iframeDuration;
    if (player.hp <= 0) {
      player.lives -= 1;
      if (player.lives > 0) player.hp = player.maxHp;
      else if (onLifeLost) onLifeLost();
    }
  }

  if (player.iframe === 0) {
    for (const e of enemies) {
      const ep = e.sprite.mesh.position;
      if (hits(pp.x, pp.z, 0.5, ep.x, ep.z, e.radius)) {
        hurtPlayer(CONFIG.contactDamage[e.kind] ?? 5);
        break;
      }
    }
  }

  const ebs = activeEnemyBullets();
  for (let i = ebs.length - 1; i >= 0; i--) {
    const b = ebs[i];
    if (hits(pp.x, pp.z, 0.5, b.mesh.position.x, b.mesh.position.z, b.radius)) {
      hurtPlayer(b.damage);
      removeEnemyBullet(b);
    }
  }

  const bbs = activeBossBullets();
  for (let i = bbs.length - 1; i >= 0; i--) {
    const b = bbs[i];
    if (hits(pp.x, pp.z, 0.5, b.mesh.position.x, b.mesh.position.z, b.radius)) {
      hurtPlayer(b.damage);
      removeBossBullet(b);
    }
  }
  if (boss && player.iframe === 0) {
    const bpos = boss.sprite.mesh.position;
    if (hits(pp.x, pp.z, 0.5, bpos.x, bpos.z, boss.radius)) {
      hurtPlayer(CONFIG.contactDamage.boss ?? 30);
    }
  }

  if (player.sprite && player.sprite.mesh) {
    player.sprite.mesh.visible =
      player.iframe > 0 ? Math.floor(player.iframe * 10) % 2 === 0 : true;
  }

  updateFloaters(dt);
}

function spawnFloater(x, z, amount) {
  const el = document.createElement("div");
  el.className = "floater";
  el.textContent = amount;
  overlay.appendChild(el);
  floaters.push({ el, x, y: 0.5, z, life: FLOATER_LIFE });
}

function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    if (f.life <= 0) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    const t = 1 - f.life / FLOATER_LIFE;
    f.y = 0.5 + FLOATER_RISE * t;

    const v = new THREE.Vector3(f.x, f.y, f.z).project(camera);
    const sx = (v.x * 0.5 + 0.5) * innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * innerHeight;
    f.el.style.left = sx + "px";
    f.el.style.top = sy + "px";
    f.el.style.opacity = String(Math.min(1, f.life / 0.3));
  }
}
