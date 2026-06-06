// mathmoments.js — the four gated arithmetic moments (design Appendix E, §16).
//
// All four share one pattern: FREEZE -> show modal -> capture keyboard answer
// -> time it -> apply result -> resume. The modal is center-screen over a dark
// overlay with the game frozen behind it (§16). Keyboard-only input.

import {
  ALL_KEYS,
  pickFact,
  factsByDifficulty,
  pickFactForDifficulty,
  parseKey,
  solve,
  formatProblem,
  recordAnswer,
  masteryScore,
  speedTier,
} from "./arithmetic.js";
import {
  rollChoices,
  describeChoice,
  applyChoice,
} from "./upgrades.js";

let masteryFacts = null;
let onEnterState = null;
let onResume = null;

export function initMathMoments({ facts, enterState, resume }) {
  masteryFacts = facts;
  onEnterState = enterState;
  onResume = resume;
  buildModalDOM();
}

let modalEl, problemEl, inputEl, feedbackEl, tagEl, timerEl;
let answerCard, choiceCard, choiceRow;
let resolveAnswer = null;
let startedAt = 0;
let answerTimer = null;
let countdownRAF = null;
let countdownDeadline = 0;

function buildModalDOM() {
  modalEl = document.createElement("div");
  modalEl.id = "math-overlay";
  modalEl.innerHTML = `
    <div id="math-card">
      <div id="math-tag"></div>
      <div id="math-timer"></div>
      <div id="math-problem"></div>
      <input id="math-input" inputmode="numeric" autocomplete="off"
             spellcheck="false" placeholder="?" />
      <div id="math-feedback"></div>
      <div id="math-hint">type your answer &middot; press Enter</div>
    </div>
    <div id="choice-card">
      <div id="choice-title">LEVEL UP — choose an upgrade</div>
      <div id="choice-row"></div>
      <div id="choice-hint">harder problem &middot; bigger boost</div>
    </div>`;
  document.getElementById("ui-overlay").appendChild(modalEl);

  problemEl = modalEl.querySelector("#math-problem");
  inputEl = modalEl.querySelector("#math-input");
  feedbackEl = modalEl.querySelector("#math-feedback");
  tagEl = modalEl.querySelector("#math-tag");
  timerEl = modalEl.querySelector("#math-timer");
  answerCard = modalEl.querySelector("#math-card");
  choiceCard = modalEl.querySelector("#choice-card");
  choiceRow = modalEl.querySelector("#choice-row");

  inputEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      finish(inputEl.value);
      return;
    }
    const allowed = [
      "Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Tab",
    ];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  });

  inputEl.addEventListener("input", () => {
    const cleaned = inputEl.value.replace(/[^0-9]/g, "");
    if (cleaned !== inputEl.value) inputEl.value = cleaned;
  });
}

function showMathModal(key, tagText) {
  tagEl.textContent = tagText || "";
  problemEl.textContent = formatProblem(key);
  feedbackEl.textContent = "";
  feedbackEl.className = "";
  inputEl.value = "";
  inputEl.disabled = false;
  answerCard.style.display = "";
  choiceCard.style.display = "none";
  modalEl.classList.add("show");
  requestAnimationFrame(() => inputEl.focus());
}

function hideMathModal() {
  modalEl.classList.remove("show");
}

function presentChoices(choices, player) {
  return new Promise((resolve) => {
    answerCard.style.display = "none";
    choiceCard.style.display = "";
    choiceRow.innerHTML = "";

    choices.forEach((c) => {
      const d = describeChoice(c, player);
      const btn = document.createElement("button");
      btn.className = `choice diff-${c.diff}`;
      btn.innerHTML = `
        <div class="choice-diff">${c.diff.toUpperCase()}</div>
        <div class="choice-icon">${d.icon}</div>
        <div class="choice-label">${d.label}</div>
        <div class="choice-desc">${d.desc}</div>`;
      btn.addEventListener("click", () => resolve(c));
      choiceRow.appendChild(btn);
    });

    modalEl.classList.add("show");
  });
}

function askProblem(key, { tag = "", deadline = null } = {}) {
  return new Promise((resolve) => {
    const { op, a, b } = parseKey(key);
    const correctAnswer = solve(op, a, b);
    startedAt = performance.now();
    showMathModal(key, tag);

    if (deadline) {
      countdownDeadline = deadline;
      timerEl.style.display = "block";
      const tick = () => {
        const remain = (countdownDeadline - performance.now()) / 1000;
        if (remain <= 0) {
          timerEl.textContent = "0.0";
          stopCountdown();
          finish(null);
          return;
        }
        timerEl.textContent = remain.toFixed(1);
        timerEl.classList.toggle("urgent", remain <= 5);
        countdownRAF = requestAnimationFrame(tick);
      };
      tick();
    } else {
      timerEl.style.display = "none";
      timerEl.classList.remove("urgent");
    }

    resolveAnswer = (typed) => {
      stopCountdown();
      const seconds = (performance.now() - startedAt) / 1000;
      const correct = typed !== null && Number(typed) === correctAnswer;
      recordAnswer(masteryFacts, key, correct, seconds);
      resolve({ correct, seconds, answer: typed, correctAnswer });
    };
  });
}

function stopCountdown() {
  if (countdownRAF) {
    cancelAnimationFrame(countdownRAF);
    countdownRAF = null;
  }
}

function finish(typed) {
  if (!resolveAnswer) return;
  inputEl.disabled = true;
  const r = resolveAnswer;
  resolveAnswer = null;
  r(typed);
}

// ---- E.2 Level-up (XP fill; difficulty-tiered, 3 choices) ----
export async function runLevelUp(player) {
  onEnterState("levelup");
  player.level += 1;

  const diffs = ["easy", "medium", "hard"];
  const rolled = rollChoices(player, 3);
  const choices = rolled.map((c, i) => {
    const diff = diffs[i % 3];
    const key = pickFactForDifficulty(masteryFacts, ALL_KEYS, diff);
    return { ...c, diff, key };
  });

  const chosen = await presentChoices(choices, player);

  const label = describeChoice(chosen, player).label.toUpperCase();
  const { correct, correctAnswer } = await askProblem(chosen.key, {
    tag: `${label} · ${chosen.diff.toUpperCase()}`,
  });

  applyChoice(player, chosen, chosen.diff, { missed: !correct });

  await flashFeedback(correct, correctAnswer);
  hideMathModal();
  onResume();
  return { correct, choice: chosen };
}

function flashFeedback(correct, correctAnswer) {
  return new Promise((resolve) => {
    if (correct) {
      feedbackEl.textContent = "Nice!";
      feedbackEl.className = "good";
    } else {
      feedbackEl.textContent = `It was ${correctAnswer} — you'll get it next time`;
      feedbackEl.className = "miss";
    }
    setTimeout(resolve, correct ? 450 : 900);
  });
}

// ---- E.1 Decision Phase (every 30–60s; speed-tiered) ----
export async function runDecisionPhase(player, { applyReward }) {
  onEnterState("decision");
  const key = pickFact(ALL_KEYS, masteryFacts);
  const { correct, seconds, correctAnswer } = await askProblem(key, {
    tag: "DECISION · answer fast!",
  });
  const tier = speedTier(seconds, correct);

  await flashTierFeedback(tier, correctAnswer, seconds);

  if (applyReward) applyReward(tier);
  hideMathModal();
  onResume();
  return { tier, seconds, correct };
}

function flashTierFeedback(tier, correctAnswer, seconds) {
  return new Promise((resolve) => {
    const msg = {
      instant: ["⚡ INSTANT! Huge reward", "good"],
      fast: ["Fast! Nice reward", "good"],
      slow: [`Correct (${seconds.toFixed(1)}s) — speed up for more`, "good"],
      curse: [`It was ${correctAnswer} — careful, that's a curse`, "miss"],
    }[tier];
    feedbackEl.textContent = msg[0];
    feedbackEl.className = msg[1];
    setTimeout(resolve, tier === "curse" ? 1000 : 600);
  });
}

// ---- §18 Pre-boss ritual (one problem -> single-use weapon) ----
export async function runPreBoss(bossName, { onConnect }) {
  onEnterState("decision");
  const key = pickFactForDifficulty(masteryFacts, ALL_KEYS, "hard");
  const { correct, correctAnswer } = await askProblem(key, {
    tag: `${bossName.toUpperCase()} APPROACHES · STRIKE!`,
  });
  if (correct) {
    feedbackEl.textContent = "Direct hit! −25% boss HP";
    feedbackEl.className = "good";
    if (onConnect) onConnect();
  } else {
    feedbackEl.textContent = `It was ${correctAnswer} — you missed the opening`;
    feedbackEl.className = "miss";
  }
  await new Promise((r) => setTimeout(r, correct ? 700 : 1000));
  hideMathModal();
  onResume();
  return { correct };
}

// ---- E.3 Respawn (all lives gone; 3 problems / 30s total) ----
export async function runRespawnChallenge(player, { onRevive, onFail }) {
  onEnterState("respawn");
  const deadline = performance.now() + 30_000;
  let solved = 0;

  for (let i = 0; i < 3; i++) {
    if (performance.now() >= deadline) break;
    const key = pickFact(ALL_KEYS, masteryFacts);
    const { correct, correctAnswer } = await askProblem(key, {
      tag: `REVIVE · ${solved + 1} of 3`,
      deadline,
    });
    if (correct) {
      solved++;
      await flashFeedback(true, correctAnswer);
      if (solved === 3) break;
    } else {
      await flashFeedback(false, correctAnswer);
      break;
    }
  }

  hideMathModal();
  if (solved === 3) {
    if (onRevive) onRevive();
    onResume();
    return true;
  } else {
    if (onFail) onFail();
    return false;
  }
}
