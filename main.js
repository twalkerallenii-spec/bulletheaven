// main.js — boot, game state machine, fixed-timestep main loop (Appendix D.3).
//
// Steps 1-2 slice: boots straight into RUN with a movable player on the arena.
// MENU / CLASS_SELECT / DECISION / LEVELUP / RESPAWN / GAMEOVER are declared now
// (the full machine from the design) but only RUN does anything yet.

import { makeScene, updateCamera } from "./scene.js";
import { makePlayer, updatePlayer } from "./player.js";
import { initEnemies, updateEnemies, activeEnemies } from "./enemies.js";
import { initProjectiles, updateProjectiles } from "./projectiles.js";
import { makeWeapon, updateWeapons } from "./weapons.js";
import { initCombat, updateCombat } from "./combat.js";
import { initMathMoments, runLevelUp } from "./mathmoments.js";
import { loadMastery } from "./save.js";
import { initPickups, updatePickups, spawnPickup } from "./pickups.js";
import { rewardFor } from "./economy.js";

const STATES = {
  MENU: "menu",
  CLASS_SELECT: "classSelect",
  RUN: "run",
  DECISION: "decision",
  LEVELUP: "levelup",
  RESPAWN: "respawn",
  PAUSED: "paused",
  GAMEOVER: "gameover",
};

let state = STATES.RUN; // slice: skip menus, go straight to a movable arena

// --- boot ---
const { scene, camera, renderer } = makeScene();
const player = makePlayer(scene);
player.weapons.push(makeWeapon("pistol")); // starting kit (design §14)

initProjectiles(scene);
initEnemies(scene);
initCombat(camera);
initPickups(scene);

// --- run-scoped tallies (banked to progress on run end later) ---
const run = { timeEarned: 0 };

// --- arithmetic engine: load the precious mastery log, wire the math moments ---
const mastery = loadMastery();
initMathMoments({
  facts: mastery.facts,
  enterState: (s) => {
    state = s;
  },
  resume: () => {
    state = STATES.RUN;
  },
});

// --- the XP clock (design D.4): XP fills -> level-up -> the math heartbeat ---
// Guard so a level-up in progress can't re-trigger from queued XP.
let levelUpPending = false;
function onXPGained(amount) {
  player.xp += amount;
  if (player.xp >= player.xpToNext && !levelUpPending && state === STATES.RUN) {
    player.xp -= player.xpToNext;
    player.xpToNext = Math.round(player.xpToNext * 1.1); // gentle, ~steady (D.4)
    levelUpPending = true;
    runLevelUp(player).finally(() => {
      levelUpPending = false;
    });
  }
}

// --- kill -> drops; pickup -> grants ---
function onKill(enemy, x, z) {
  const r = rewardFor(enemy.kind);
  // Drop an XP gem and a Time orb at the death spot (slight offset so they
  // don't perfectly overlap).
  spawnPickup(x - 0.2, z, "xp", r.xp);
  spawnPickup(x + 0.2, z, "time", r.time);
}

const PICKUP_RANGE = 2.5; // CONFIG.basePickupRange (N.4)
const PICKUP_FLY = 12; // CONFIG.pickupFlySpeed
const pickupCallbacks = {
  onXp: (amt) => onXPGained(amt),
  onTime: (amt) => {
    run.timeEarned += amt;
  },
  get pickupRange() {
    return PICKUP_RANGE * (1 + player.stats.pickupRange); // magnet scales it
  },
  flySpeed: PICKUP_FLY,
};

// --- fixed timestep (Appendix D.3) ---
const STEP = 1 / 60; // fixed physics/update step
let acc = 0;
let last = performance.now();

function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25); // clamp huge gaps (tab refocus)
  last = now;
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function update(dt) {
  // Math states FREEZE gameplay: the loop runs but entities don't advance.
  if (state !== STATES.RUN) return;

  updatePlayer(player, dt);
  updateEnemies(dt, player); // spawn + home toward player
  updateWeapons(dt, player); // auto-fire at nearest
  updateProjectiles(dt); // advance bullets, expire old ones
  updateCombat(dt, player, onKill); // hits, deaths -> drops via onKill
  updatePickups(dt, player, pickupCallbacks); // magnet + collect -> XP/Time
}

function render() {
  updateCamera(camera, player.position);
  renderer.render(scene, camera);
  updateDebug();
}

// --- debug readout (slice only) ---
const debugEl = document.getElementById("debug-readout");
let fpsSmooth = 60;
let lastRenderT = performance.now();
function updateDebug() {
  const now = performance.now();
  const dt = (now - lastRenderT) / 1000;
  lastRenderT = now;
  if (dt > 0) fpsSmooth = fpsSmooth * 0.9 + (1 / dt) * 0.1;
  const p = player.position;
  debugEl.textContent =
    `MATH HEAVEN — slice (pickups + XP loop)\n` +
    `state:   ${state}\n` +
    `fps:     ${fpsSmooth.toFixed(0)}\n` +
    `level:   ${player.level}   xp ${player.xp}/${player.xpToNext}\n` +
    `time:    ${run.timeEarned}\n` +
    `enemies: ${activeEnemies().length}\n` +
    `move:    WASD / arrows · kill enemies to fill XP`;
}
