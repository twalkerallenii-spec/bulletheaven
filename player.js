// player.js — the hero: movement, health, XP, weapon/passive slots, and a
// DIRECTIONAL animated sprite wired to WASD/arrow input. The sprite faces the
// way you walk (down/up/left/right) and only plays its run animation while
// moving; standing still shows the idle clip for the current facing.
//
// Self-contained input: this module installs its own key listeners and exposes
// the resulting movement through updatePlayer. main.js only calls
// makePlayer(scene) and updatePlayer(player, dt).

import * as THREE from "three";
import { makeDirectionalSprite } from "./sprite.js";
import { CONFIG } from "./config.js";

// ---- input: WASD + arrows -> a movement vector ----
const keys = Object.create(null);
addEventListener("keydown", (e) => {
  keys[e.code] = true;
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
});
// release everything if the tab loses focus (avoids "stuck" movement)
addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
});

function moveVector() {
  let x = 0;
  let z = 0;
  if (keys.KeyW || keys.ArrowUp) z -= 1;
  if (keys.KeyS || keys.ArrowDown) z += 1;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  return { x, z };
}

const BASE_SPEED = 6; // world units / second (before speedMult)

export function makePlayer(scene) {
  // directional clips -> sprite asset keys (sliced into world-sprites.js)
  const sprite = makeDirectionalSprite(
    {
      run_down: "hero_run_down",
      run_up: "hero_run_up",
      run_left: "hero_run_left",
      run_right: "hero_run_right",
      idle_down: "hero_idle_down",
      idle_up: "hero_idle_up",
      idle_left: "hero_idle_left",
      idle_right: "hero_idle_right",
    },
    { type: "hero" }
  );
  sprite.mesh.position.set(0, 0.05, 0);
  scene.add(sprite.mesh);

  const maxHp = CONFIG.playerMaxHpBase ?? 100;

  return {
    sprite,
    position: sprite.mesh.position, // {x,y,z}; combat/camera read .x/.z
    hp: maxHp,
    maxHp,
    lives: CONFIG.startingLives ?? 3,
    iframe: 0,
    xp: 0,
    level: 1,
    xpToNext: CONFIG.xpBase ?? 25,
    speedMult: 1,
    weapons: [],
    // upgrade modifiers — these are MULTIPLIERS (weapons.js multiplies by them),
    // so they start at 1.0 and upgrades add to them (mods.damage += boost).
    // Starting at 0 would make damage/speed zero and the hero wouldn't fire.
    mods: { damage: 1, fireRate: 1, projectileSpeed: 1 },
    stats: { pickupRange: 0 },
    // animation bookkeeping
    facing: "down",
    animTime: 0,
  };
}

export function updatePlayer(player, dt) {
  const mv = moveVector();
  const moving = mv.x !== 0 || mv.z !== 0;

  if (moving) {
    // normalize so diagonals aren't faster
    const len = Math.hypot(mv.x, mv.z) || 1;
    const speed = BASE_SPEED * (player.speedMult || 1);
    player.position.x += (mv.x / len) * speed * dt;
    player.position.z += (mv.z / len) * speed * dt;

    // pick facing from the dominant axis (favor left/right on ties so
    // side-running reads well)
    if (Math.abs(mv.x) >= Math.abs(mv.z)) {
      player.facing = mv.x < 0 ? "left" : "right";
    } else {
      player.facing = mv.z < 0 ? "up" : "down";
    }
  }

  // drive the sprite: run clip while moving, idle clip when still
  const clip = (moving ? "run_" : "idle_") + player.facing;
  player.sprite.setClip(clip);

  // advance animation frames; run faster than idle so the walk reads as brisk
  player.animTime += dt * (moving ? 10 : 4);
  player.sprite.setFrame(Math.floor(player.animTime));
}
