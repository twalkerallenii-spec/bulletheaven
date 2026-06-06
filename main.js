// main.js — boot, game state machine, fixed-timestep main loop (Appendix D.3).
//
// Now front-to-back: boots to the TITLE screen (menus.js) instead of straight
// into a run. The menu shell drives class select; main.js exposes startRun() so
// a run begins on demand, tracks a per-run summary (game + learning stats), and
// routes death to the game-over screen. "Play Again" resets the run in-place
// (no page reload).

import { makeScene, updateCamera } from "./scene.js";
import { makePlayer, updatePlayer } from "./player.js";
import { initEnemies, updateEnemies, activeEnemies, getKills } from "./enemies.js";
import { initProjectiles, updateProjectiles } from "./projectiles.js";
import { makeWeapon, updateWeapons } from "./weapons.js";
import { initCombat, updateCombat } from "./combat.js";
import { initEffects, updateEffects } from "./effects.js";
import {
  initMathMoments,
  runLevelUp,
  runRespawnChallenge,
  runDecisionPhase,
  runPreBoss,
} from "./mathmoments.js";
import { loadMastery } from "./save.js";
import { masteryScore } from "./arithmetic.js";
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
  clearBoss,
} from "./bosses.js";
import { initMenus, showScreen, hideAllScreens } from "./menus.js";

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

// Boot into the menu/title — NOT a live run. The run only starts when the
// player chooses a class (startRun) from the shell.
let state = STATES.MENU;
let runActive = false;

// --- boot the engine once (scene, player, systems persist across runs) ---
const { scene, camera, renderer } = makeScene();
const player = makePlayer(scene);

initProjectiles(scene);
initEnemies(scene);
initCombat(camera);
initEffects(scene);
initPickups(scene);
initProps(scene);
initBosses(scene);

const run = { timeEarned: 0, elapsed: 0, kills: 0 };
let masteryBefore = null; // snapshot of mastery scores at run start (for summary)

initHUD();

const mastery = loadMastery();
initMathMoments({
  facts: mastery.facts,
  enterState: (s) => { state = s; },
  resume: () => { state = STATES.RUN; },
});

// ---------- run lifecycle ----------
// Snapshot every fact's mastery + seen/correct so the end-of-run summary can
// diff and report what improved during THIS run.
function snapshotMastery() {
  const m = loadMastery();
  const snap = {};
  for (const k in m.facts) {
    const r = m.facts[k];
    snap[k] = {
      score: masteryScore(r),
      seen: r.seen || 0,
      correct: r.correct || 0,
      avgTime: r && r.correct ? r.totalTime / r.correct : null,
    };
  }
  return snap;
}

// Reset the run state in-place so "Play Again" needs no page reload. Pools
// (bullets/pickups/effects) cycle themselves; we clear the boss, reset the
// player, recenter, and zero the counters.
function resetRunState() {
  clearBoss();
  player.position.x = 0;
  player.position.z = 0;
  player.hp = player.maxHp;
  player.lives = CONFIG.startingLives ?? 3;
  player.iframe = 0;
  player.xp = 0;
  player.level = 1;
  player.xpToNext = CONFIG.xpBase ?? 25;
  player.speedMult = 1;
  player.weapons.length = 0;
  player.mods.damage = 1;
  player.mods.fireRate = 1;
  player.mods.projectileSpeed = 1;
  player.stats.pickupRange = 0;

  run.timeEarned = 0;
  run.elapsed = 0;
  run.kills = 0;

  decisionTimer = randDecisionInterval();
  decisionPending = false;
  levelUpPending = false;
  respawnPending = false;
  bossSequencePending = false;
  nextBossAt = CONFIG.firstBossAt ?? 80;
}

// Called by the menu shell when the player picks a class + answers the problem.
function startRun(classId, tier) {
  resetRunState();
  // starting kit (design §14): everyone starts with the pistol
  player.weapons.push(makeWeapon("pistol"));
  player.classId = classId;
  player.startTier = tier;

  masteryBefore = snapshotMastery();
  hideAllScreens();
  runActive = true;
  state = STATES.RUN;
}

// Build the end-of-run summary the game-over screen renders.
function getRunSummary() {
  const after = snapshotMastery();
  let answered = 0, correct = 0, improved = [];
  let fastest = null;
  for (const k in after) {
    const b = masteryBefore?.[k] || { seen: 0, correct: 0, score: 0, avgTime: null };
    const dSeen = after[k].seen - b.seen;
    const dCorrect = after[k].correct - b.correct;
    if (dSeen > 0) {
      answered += dSeen;
      correct += dCorrect;
      if (after[k].avgTime != null && (fastest == null || after[k].avgTime < fastest)) {
        fastest = after[k].avgTime;
      }
    }
    if (after[k].score >= 0.8 && b.score < 0.8 && dSeen > 0) improved.push(k);
  }
  return {
    elapsed: run.elapsed,
    level: player.level,
    kills: getKills ? getKills() : run.kills,
    timeEarned: run.timeEarned,
    learning: { answered, accuracy: answered ? correct / answered : 0, fastest, improved },
  };
}

initMenus({ startRun, getRunSummary });

// ---------- XP / level-up ----------
let levelUpPending = false;
function onXPGained(amount) {
  player.xp += amount;
  if (player.xp >= player.xpToNext && !levelUpPending && state === STATES.RUN) {
    player.xp -= player.xpToNext;
    player.xpToNext = Math.round(player.xpToNext * CONFIG.xpGrowth);
    levelUpPending = true;
    runLevelUp(player).finally(() => { levelUpPending = false; });
  }
}

function onKill(enemy, x, z) {
  run.kills += 1;
  const r = rewardFor(enemy.kind);
  spawnPickup(x - 0.2, z, "xp", r.xp);
  spawnPickup(x + 0.2, z, "time", r.time);
}

const PICKUP_RANGE = CONFIG.basePickupRange;
const PICKUP_FLY = CONFIG.pickupFlySpeed;
const pickupCallbacks = {
  onXp: (amt) => onXPGained(amt),
  onTime: (amt) => { run.timeEarned += amt; },
  get pickupRange() { return PICKUP_RANGE * (1 + player.stats.pickupRange); },
  flySpeed: PICKUP_FLY,
};

// ---------- death / respawn ----------
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
    onFail: () => { endRun(); },
  }).finally(() => { respawnPending = false; });
}

// Run is over -> stop the sim and show the game-over summary.
function endRun() {
  runActive = false;
  state = STATES.GAMEOVER;
  showScreen("gameover"); // menus.js calls getRunSummary() via fillGameOver
}

// ---------- decision phase clock ----------
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

// ---------- threat clock (boss) ----------
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

// ---------- dev keys ----------
addEventListener("keydown", (e) => {
  if (e.code === "KeyP" && state === STATES.RUN && !decisionPending) {
    decisionTimer = 0;
  }
});

// ---------- main loop ----------
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
  // gameplay only advances during an active RUN; menus/screens freeze it
  if (state !== STATES.RUN || !runActive) return;

  run.elapsed += dt;
  updatePlayer(player, dt);
  updateEnemies(dt, player);
  updateBoss(dt, player, onBossDefeated);
  updateWeapons(dt, player);
  updateProjectiles(dt);
  updateCombat(dt, player, onKill, onLifeLost);
  updateEffects(dt);
  updatePickups(dt, player, pickupCallbacks);
  updateProps(player);
  tickDecisionClock(dt);
  tickThreatClock();
}

function render() {
  // keep the camera following even on menus so the world sits behind the title
  updateCamera(camera, player.position, scene);
  renderer.render(scene, camera);
  if (runActive) updateHUD(player, run, activeBoss());
  updateDebug();
}

// ---------- debug readout ----------
const debugEl = document.getElementById("debug-readout");
let fpsSmooth = 60;
let lastRenderT = performance.now();
function updateDebug() {
  if (!debugEl) return;
  const now = performance.now();
  const dt = (now - lastRenderT) / 1000;
  lastRenderT = now;
  if (dt > 0) fpsSmooth = fpsSmooth * 0.9 + (1 / dt) * 0.1;
  if (!runActive) {
    debugEl.textContent = `fps ${fpsSmooth.toFixed(0)} · ${state}`;
    return;
  }
  debugEl.textContent =
    `fps ${fpsSmooth.toFixed(0)} · enemies ${activeEnemies().length} · guns ${player.weapons.length}\n` +
    `decision in ${Math.max(0, decisionTimer).toFixed(0)}s · [P] test\n` +
    `WASD/arrows to move`;
}
