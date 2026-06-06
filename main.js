// main.js — boot, game state machine, fixed-timestep main loop (Appendix D.3).

import { makeScene, updateCamera } from "./scene.js";
import { makePlayer, updatePlayer } from "./player.js";
import { initEnemies, updateEnemies, activeEnemies, getKills } from "./enemies.js";
import { initProjectiles, updateProjectiles } from "./projectiles.js";
import { makeWeapon, updateWeapons } from "./weapons.js";
import { initCombat, updateCombat } from "./combat.js";
import {
  initMathMoments,
  runLevelUp,
  runRespawnChallenge,
  runDecisionPhase,
  runPreBoss,
} from "./mathmoments.js";
import { loadMastery } from "./save.js";
import { initPickups, updatePickups, spawnPickup } from "./pickups.js";
import { rewardFor } from "./economy.js";
import { CONFIG } from "./config.js";
import { initHUD, updateHUD } from "./hud.js";
import { initProps, updateProps } from "./props.js";
import {
  initBosses,
  updateBoss,
  spawnBoss,
  activeBoss,
  prebossHit,
} from "./bosses.js";

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

let state = STATES.RUN;

// --- boot ---
const { scene, camera, renderer } = makeScene();
const player = makePlayer(scene);
player.weapons.push(makeWeapon("pistol")); // starting kit (design §14)

initProjectiles(scene);
initEnemies(scene);
initCombat(camera);
initPickups(scene);
initProps(scene);
initBosses(scene);

const run = { timeEarned: 0, elapsed: 0 };

initHUD();

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

let levelUpPending = false;
function onXPGained(amount) {
  player.xp += amount;
  if (player.xp >= player.xpToNext && !levelUpPending && state === STATES.RUN) {
    player.xp -= player.xpToNext;
    player.xpToNext = Math.round(player.xpToNext * CONFIG.xpGrowth);
    levelUpPending = true;
    runLevelUp(player).finally(() => {
      levelUpPending = false;
    });
  }
}

function onKill(enemy, x, z) {
  const r = rewardFor(enemy.kind);
  spawnPickup(x - 0.2, z, "xp", r.xp);
  spawnPickup(x + 0.2, z, "time", r.time);
}

const PICKUP_RANGE = CONFIG.basePickupRange;
const PICKUP_FLY = CONFIG.pickupFlySpeed;
const pickupCallbacks = {
  onXp: (amt) => onXPGained(amt),
  onTime: (amt) => {
    run.timeEarned += amt;
  },
  get pickupRange() {
    return PICKUP_RANGE * (1 + player.stats.pickupRange);
  },
  flySpeed: PICKUP_FLY,
};

let respawnPending = false;
function onLifeLost() {
  if (respawnPending) return;
  respawnPending = true;
  runRespawnChallenge(player, {
    onRevive: () => {
      player.lives = 1;
      player.hp = player.maxHp;
      player.iframe = CONFIG.iframeDuration * 3;
    },
    onFail: () => {
      state = STATES.GAMEOVER;
    },
  }).finally(() => {
    respawnPending = false;
  });
}

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
    player.hp -= r.damage;
    if (player.hp <= 0) player.hp = 1;
  }
}

let nextBossAt = CONFIG.firstBossAt ?? 80;
let bossSequencePending = false;
function tickThreatClock() {
  if (bossSequencePending || activeBoss()) return;
  if (getKills() >= nextBossAt) {
    nextBossAt += CONFIG.bossEvery ?? 150;
    bossSequencePending = true;
    const b = spawnBoss("chronodragon", player.position);
    runPreBoss(b.name, { onConnect: () => prebossHit() }).finally(() => {
      bossSequencePending = false;
    });
  }
}
function onBossDefeated(defeated) {
  run.timeEarned += CONFIG.timeBoss ?? 300;
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
  acc += Math.min((now - last) / 1000, 0.25);
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
  if (state !== STATES.RUN) return;

  run.elapsed += dt;
  updatePlayer(player, dt);
  updateEnemies(dt, player);
  updateBoss(dt, player, onBossDefeated);
  updateWeapons(dt, player);
  updateProjectiles(dt);
  updateCombat(dt, player, onKill, onLifeLost);
  updatePickups(dt, player, pickupCallbacks);
  updateProps(player);
  tickDecisionClock(dt);
  tickThreatClock();
}

function render() {
  updateCamera(camera, player.position, scene); // scene -> ground follows player
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
