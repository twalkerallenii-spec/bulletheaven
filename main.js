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
import {
  initMathMoments,
  runLevelUp,
  runRespawnChallenge,
  runDecisionPhase,
} from "./mathmoments.js";
import { loadMastery } from "./save.js";
import { initPickups, updatePickups, spawnPickup } from "./pickups.js";
import { rewardFor } from "./economy.js";
import { CONFIG } from "./config.js";
import { initHUD, updateHUD } from "./hud.js";

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
const run = { timeEarned: 0, elapsed: 0 };

initHUD();

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

const PICKUP_RANGE = CONFIG.basePickupRange; // N.4
const PICKUP_FLY = CONFIG.pickupFlySpeed;
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

// 0 lives -> the Respawn challenge (E.3): solve 3 problems in 30s to revive,
// else the run ends. Reuses the math-moment flow.
let respawnPending = false;
function onLifeLost() {
  if (respawnPending) return;
  respawnPending = true;
  runRespawnChallenge(player, {
    onRevive: () => {
      player.lives = 1; // back in with one life (a real second chance)
      player.hp = player.maxHp;
      player.iframe = CONFIG.iframeDuration * 3; // brief grace on revive
    },
    onFail: () => {
      state = STATES.GAMEOVER;
    },
  }).finally(() => {
    respawnPending = false;
  });
}

// --- Decision Phase (E.1): fires every 30–60s during RUN, speed-tiered ---
let decisionTimer = randDecisionInterval();
let decisionPending = false;
function randDecisionInterval() {
  const { decisionIntervalMin: lo, decisionIntervalMax: hi } = CONFIG;
  return lo + Math.random() * (hi - lo);
}
function tickDecisionClock(dt) {
  if (decisionPending) return;
  decisionTimer -= dt;
  if (decisionTimer <= 0) {
    decisionPending = true;
    runDecisionPhase(player, { applyReward: applyDecisionReward }).finally(() => {
      decisionTimer = randDecisionInterval();
      decisionPending = false;
    });
  }
}
function applyDecisionReward(tier) {
  const r = CONFIG.decisionRewards[tier];
  if (!r) return;
  if (r.time) run.timeEarned = Math.max(0, run.timeEarned + r.time);
  if (r.heal) player.hp = Math.min(player.maxHp, player.hp + r.heal);
  if (r.damage) {
    player.hp -= r.damage; // a curse can hurt, but won't instantly end a run
    if (player.hp <= 0) player.hp = 1; // floor at 1 — curses sting, don't kill
  }
}

// Slice-only restart: reload the page for a guaranteed-clean reset. A proper
// run-reset + summary screen arrives with the menu work.
addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && state === STATES.GAMEOVER) location.reload();
  // TEMP test hook: P fires a Decision Phase now (real cadence is the 30–60s
  // clock above). Remove once you've confirmed the speed tiers feel right.
  if (e.code === "KeyP" && state === STATES.RUN && !decisionPending) {
    decisionTimer = 0;
  }
});

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

  run.elapsed += dt; // run timer (frozen during math moments by the early return)
  updatePlayer(player, dt);
  updateEnemies(dt, player); // spawn + home toward player
  updateWeapons(dt, player); // auto-fire at nearest
  updateProjectiles(dt); // advance bullets, expire old ones
  updateCombat(dt, player, onKill, onLifeLost); // hits, deaths, contact dmg
  updatePickups(dt, player, pickupCallbacks); // magnet + collect -> XP/Time
  tickDecisionClock(dt); // every 30–60s -> speed-tiered math prompt
}

function render() {
  updateCamera(camera, player.position);
  renderer.render(scene, camera);
  updateHUD(player, run);
  updateDebug();
}

// --- dev readout (small; the real HUD now carries hp/xp/time/lives/timer) ---
const debugEl = document.getElementById("debug-readout");
let fpsSmooth = 60;
let lastRenderT = performance.now();
function updateDebug() {
  const now = performance.now();
  const dt = (now - lastRenderT) / 1000;
  lastRenderT = now;
  if (dt > 0) fpsSmooth = fpsSmooth * 0.9 + (1 / dt) * 0.1;
  const dead = state === STATES.GAMEOVER;
  debugEl.textContent =
    `fps ${fpsSmooth.toFixed(0)} · enemies ${activeEnemies().length}\n` +
    `decision in ${Math.max(0, decisionTimer).toFixed(0)}s · [P] test\n` +
    (dead ? `GAME OVER — press [R] to restart` : `WASD/arrows to move`);
}
