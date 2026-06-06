// main.js — boot, game state machine, fixed-timestep main loop (Appendix D.3).

import { makeScene, updateCamera } from "./scene.js";
import { makePlayer, updatePlayer } from "./player.js";
import { makeWeapon, updateWeapons } from "./weapons.js";
import { initProjectiles, updateProjectiles } from "./projectiles.js";
import { initEnemies, updateEnemies, activeEnemies } from "./enemies.js";
import { initCombat, updateCombat } from "./combat.js";
import { initEffects, updateEffects } from "./effects.js";
import {
  initMathMoments,
  tickDecisionClock,
  getKills,
  runPreBoss,
} from "./mathmoments.js";
import { loadMastery } from "./save.js";
import { initPickups, updatePickups, spawnPickup } from "./pickups.js";
import { rewardFor } from "./economy.js";
import { CONFIG } from "./config.js";
import { initHUD, updateHUD, updateDebug } from "./hud.js";
import {
  initBosses,
  spawnBoss,
  activeBoss,
  prebossHit,
} from "./bosses.js";
import { initProps, updateProps } from "./props.js";

const STATES = {
  MENU: "menu",
  RUN: "run",
  LEVELUP: "levelup",
  DECISION: "decision",
  RESPAWN: "respawn",
  BOSS: "boss",
  GAMEOVER: "gameover",
};

let state = STATES.RUN;

// --- boot ---
const { scene, camera, renderer } = makeScene();
const player = makePlayer(scene);
player.weapons.push(makeWeapon("pistol"));

initProjectiles(scene);
initEnemies(scene);
initProps(scene);
initPickups(scene);
initBosses(scene);

const run = { timeEarned: 0, elapsed: 0 };

initHUD();

initMathMoments({
  onXP: onXPGained,
  onKill,
  onLevelUp: () => { state = STATES.LEVELUP; },
  resume: () => { state = STATES.RUN; },
});

let levelUpPending = false;
function onXPGained(amount) {
  player.xp += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.round(player.xpToNext * 1.08);
    levelUpPending = true;
  }
}

function onKill(enemy, x, z) {
  const r = rewardFor(enemy.kind);
  spawnPickup(x - 0.2, z, "xp", r.xp);
  spawnPickup(x + 0.2, z, "time", r.time);
}

const pickupCallbacks = {
  onXp: onXPGained,
  onTime: (sec) => { run.timeEarned += sec; },
  flySpeed: CONFIG.pickupFlySpeed,
  pickupRange: CONFIG.basePickupRange,
};

let respawnPending = false;
function onLifeLost() {
  if (respawnPending) return;
  respawnPending = true;
  state = STATES.RESPAWN;
  runPreBoss(
    1,
    () => {
      player.hp = player.maxHp;
      player.iframe = CONFIG.iframeDuration * 3;
    },
    () => { state = STATES.GAMEOVER; }
  ).finally(() => { respawnPending = false; });
}

let decisionTimer = randDecisionInterval();
let decisionPending = false;
function randDecisionInterval() {
  return 20 + Math.random() * 30;
}
function tickDecisionClockLocal(dt) {
  if (state !== STATES.RUN) return;
  if (decisionPending || levelUpPending) return;
  decisionTimer -= dt;
  if (decisionTimer <= 0) {
    decisionTimer = randDecisionInterval();
    decisionPending = true;
    tickDecisionClock((tier) => {
      applyDecisionReward(tier);
      decisionPending = false;
    });
  }
}
function applyDecisionReward(tier) {
  if (tier === "legendary") {
    player.mods.damage *= 1.15;
    player.mods.fireRate *= 1.2;
  } else if (tier === "rare") {
    player.mods.damage *= 1.1;
    player.mods.fireRate *= 1.1;
  } else if (tier === "uncommon") {
    player.mods.projectileSpeed *= 1.08;
    player.stats.pickupRange += 0.5;
  }
}

let nextBossAt = CONFIG.firstBossAt ?? 80;
let bossSequencePending = false;
function tickThreatClock() {
  if (state !== STATES.RUN) return;
  if (bossSequencePending) return;
  if (run.elapsed >= nextBossAt) {
    bossSequencePending = true;
    state = STATES.BOSS;
    runPreBoss(2, () => { spawnBoss(); }, () => { state = STATES.RUN; bossSequencePending = false; }).finally(() => { bossSequencePending = false; });
    nextBossAt += 60;
  }
}
function onBossDefeated(defeated) {
  player.hp = Math.min(player.maxHp, player.hp + 40);
}

addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && state === STATES.GAMEOVER) location.reload();
  if (e.code === "KeyP" && state === STATES.RUN && !decisionPending) {
    decisionTimer = 0;
  }
});

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  acc += dt;

  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }

  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function update(dt) {
  if (state !== STATES.RUN) return;

  run.elapsed += dt;
  updatePlayer(player, dt);
  updateEnemies(dt);
  updateWeapons(dt, player);
  updateProjectiles(dt);
  updateCombat(dt, player, onKill, onLifeLost);
  updateEffects(dt); // animate impact bursts
  updatePickups(dt, player, pickupCallbacks);
  updateProps(player);
  tickDecisionClockLocal(dt);
  tickThreatClock();
}

function render() {
  updateCamera(camera, player.position, scene);
  renderer.render(scene, camera);
  updateHUD(player, run, activeBoss());
  updateDebug();
}

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
    `fps ${fpsSmooth.toFixed(0)} · enemies ${activeEnemies().length} · guns ${player.weapons.length}\n` +
    `decision in ${Math.max(0, decisionTimer).toFixed(0)}s · [P] test\n` +
    (dead ? `GAME OVER — press [R] to restart` : `WASD/arrows to move`);
}
