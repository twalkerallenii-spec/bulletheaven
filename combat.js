// combat.js — collisions, damage, deaths, floating damage numbers (step 5).
//
// Slice scope: bullet -> enemy hits. Enemy contact damage to the player (M.1,
// i-frames) is stubbed in and ready but not wired to a death flow yet — that
// arrives with lives/respawn. Floating numbers are DOM nodes projected from the
// enemy's world position onto the #ui-overlay each frame they live.

import * as THREE from "three";
import { activeBullets, releaseBullet } from "./projectiles.js";
import { activeEnemies, killEnemy } from "./enemies.js";

let camera = null;
let overlay = null;
const floaters = []; // { el, x, y, z, life, vy }

const FLOATER_LIFE = 0.8; // seconds
const FLOATER_RISE = 1.4; // world units it drifts up over its life

export function initCombat(cameraRef) {
  camera = cameraRef;
  overlay = document.getElementById("ui-overlay");
}

// Circle-vs-circle overlap on the XZ plane.
function hits(ax, az, ar, bx, bz, br) {
  const r = ar + br;
  return (ax - bx) ** 2 + (az - bz) ** 2 <= r * r;
}

export function updateCombat(dt, player, onKill) {
  const bullets = activeBullets();
  const enemies = activeEnemies();

  // --- bullet -> enemy ---
  // Iterate bullets; first enemy hit consumes the bullet (no pierce yet).
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    const bp = b.mesh.position;
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const ep = e.sprite.mesh.position;
      if (hits(bp.x, bp.z, b.radius, ep.x, ep.z, e.radius)) {
        e.hp -= b.damage;
        spawnFloater(ep.x, ep.z, Math.round(b.damage));
        releaseBullet(b);
        if (e.hp <= 0) {
          // Capture death position BEFORE removing the enemy from the scene,
          // so drops spawn where it died.
          const dx = ep.x;
          const dz = ep.z;
          killEnemy(e);
          if (onKill) onKill(e, dx, dz); // run wires XP/Time drops here
        }
        break; // bullet spent
      }
    }
  }

  // --- enemy -> player (M.1 touch damage; stubbed, no life loss yet) ---
  // Kept so the contact model is real the moment lives/respawn arrive.
  // const pp = player.position;
  // for (const e of enemies) { ...damagePlayer on overlap respecting iframe... }
  if (player.iframe > 0) player.iframe = Math.max(0, player.iframe - dt);

  updateFloaters(dt);
}

// --- floating damage numbers ---
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
    // Drift upward in world space as it ages.
    const t = 1 - f.life / FLOATER_LIFE;
    f.y = 0.5 + FLOATER_RISE * t;

    // Project world position -> normalized device coords -> screen pixels.
    const v = new THREE.Vector3(f.x, f.y, f.z).project(camera);
    const sx = (v.x * 0.5 + 0.5) * innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * innerHeight;
    f.el.style.left = sx + "px";
    f.el.style.top = sy + "px";
    f.el.style.opacity = String(Math.min(1, f.life / 0.3)); // fade last 0.3s
  }
}
