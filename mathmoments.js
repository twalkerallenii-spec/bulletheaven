// mathmoments.js — the four gated arithmetic moments (design Appendix E, §16).
//
// All four share one pattern: FREEZE -> show modal -> capture keyboard answer
// -> time it -> apply result -> resume. The modal is center-screen over a dark
// overlay with the game frozen behind it (§16). Keyboard-only input.
//
// Slice scope (step 7a): Level-up is fully wired (it exercises selection,
// difficulty bands, the modal, and keyboard capture — the most machinery).
// Decision Phase / Respawn / Class Select reuse askProblem() and land next.

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

// The live mastery log (facts object). main.js loads it and passes it in.
let masteryFacts = null;
// Callbacks main.js wires so this module can freeze/resume the game.
let onEnterState = null;
let onResume = null;

export function initMathMoments({ facts, enterState, resume }) {
  masteryFacts = facts;
  onEnterState = enterState;
  onResume = resume;
  buildModalDOM();
}

// ---- the shared modal (built once, shown/hidden per problem) ----
let modalEl, problemEl, inputEl, feedbackEl, tagEl, timerEl;
let answerCard, choiceCard, choiceRow;
let resolveAnswer = null;
let startedAt = 0;
let answerTimer = null;
let countdownRAF = null; // live countdown animation handle
let countdownDeadline = 0; // performance.now() ms when time runs out

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
    e.stopPropagation(); // don't let WASD-capture eat digits
    if (e.key === "Enter") {
      finish(inputEl.value);
      return;
    }
    // Allow editing/navigation keys and shortcuts; block everything else
    // that isn't a digit. Answers are always non-negative whole numbers.
    const allowed = [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "Tab",
    ];
    if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault(); // not a digit -> reject
  });

  // Safety net: scrub anything non-digit that still lands (paste, IME, etc).
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
  // Focus after the show transition starts so the caret lands reliably.
  requestAnimationFrame(() => inputEl.focus());
}

function hideMathModal() {
  modalEl.classList.remove("show");
}

// Present the 3 upgrade choices; resolves with the chosen choice object on
// click. Each choice carries { upgradeId, diff, key } so the answer phase can
// draw the right problem and apply the right upgrade.
function presentChoices(choices) {
  return new Promise((resolve) => {
    answerCard.style.display = "none";
    choiceCard.style.display = "";
    choiceRow.innerHTML = "";

    choices.forEach((c) => {
      const d = describeChoice(c);
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

// Returns a Promise<{ correct, seconds, answer, correctAnswer }>.
// Options:
//   tag      — label shown above the problem
//   deadline — absolute performance.now() ms; if passed, shows a live countdown
//              and auto-fails (resolves with null) when reached. Shared across
//              a multi-problem sequence (Respawn) so the 30s is total, not each.
function askProblem(key, { tag = "", deadline = null } = {}) {
  return new Promise((resolve) => {
    const { op, a, b } = parseKey(key);
    const correctAnswer = solve(op, a, b);
    startedAt = performance.now();
    showMathModal(key, tag);

    // Live countdown (Respawn). Drives the timer text each frame; fires finish
    // (null = fail) when the shared deadline passes.
    if (deadline) {
      countdownDeadline = deadline;
      timerEl.style.display = "block";
      const tick = () => {
        const remain = (countdownDeadline - performance.now()) / 1000;
        if (remain <= 0) {
          timerEl.textContent = "0.0";
          stopCountdown();
          finish(null); // out of time
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
      recordAnswer(masteryFacts, key, correct, seconds); // precious log
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

// Called on Enter (or timeout with null). Records + resolves the pending answer.
function finish(typed) {
  if (!resolveAnswer) return;
  inputEl.disabled = true;
  const r = resolveAnswer;
  resolveAnswer = null;
  r(typed); // resolves the askProblem() promise; caller handles feedback + resume
}

// ---- E.2 Level-up (XP fill; difficulty-tiered, 3 choices) ----
// Offer 3 upgrades, one per difficulty (easy/medium/hard). The player picks
// one, then answers a problem from that difficulty band. Correct -> full
// boost; wrong -> a scaled-down boost (partial benefit, not nothing). Tier
// only sets the SIZE of the stat jump (§19).
export async function runLevelUp(player) {
  onEnterState("levelup");
  player.level += 1;

  // Three distinct choices from the player's current pool (stat-ups, new
  // weapons, weapon level-ups), each assigned a difficulty whose label matches
  // the actual problem (no more "HARD 1+4").
  const diffs = ["easy", "medium", "hard"];
  const rolled = rollChoices(player, 3);
  const choices = rolled.map((c, i) => {
    const diff = diffs[i % 3];
    const key = pickFactForDifficulty(masteryFacts, ALL_KEYS, diff);
    return { ...c, diff, key };
  });

  // Player picks one card.
  const chosen = await presentChoices(choices);

  // Answer the chosen card's problem.
  const label = describeChoice(chosen).label.toUpperCase();
  const { correct, correctAnswer } = await askProblem(chosen.key, {
    tag: `${label} · ${chosen.diff.toUpperCase()}`,
  });

  // Apply: full effect on correct, scaled-down on a miss (E.2).
  applyChoice(player, chosen, chosen.diff, { missed: !correct });

  await flashFeedback(correct, correctAnswer);
  hideMathModal();
  onResume();
  return { correct, choice: chosen };
}

// Brief on-card feedback, then a short pause. Encouraging on both paths (§16).
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
// One adaptive problem. How FAST you answer correctly sets the reward tier
// (instant/fast/slow); a wrong answer is a curse. Returns the tier so the run
// applies the matching reward. No countdown shown — speed is what's measured,
// but we don't want to rush the player with a visible clock here.
export async function runDecisionPhase(player, { applyReward }) {
  onEnterState("decision");
  const key = pickFact(ALL_KEYS, masteryFacts); // adaptive: weighted to weak
  const { correct, seconds, correctAnswer } = await askProblem(key, {
    tag: "DECISION · answer fast!",
  });
  const tier = speedTier(seconds, correct);

  // Feedback reflects the tier, not just right/wrong (the speed is the point).
  await flashTierFeedback(tier, correctAnswer, seconds);

  if (applyReward) applyReward(tier);
  hideMathModal();
  onResume();
  return { tier, seconds, correct };
}

// Tiered feedback: celebrate speed, soften a curse (encouraging tone, §16).
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

// ---- E.3 Respawn (all lives gone; 3 problems / 30s total) ----
// Returns true if the player revived, false if the run ends. The 30s is shared
// across all three problems (the countdown keeps running between them). Any
// wrong answer or running out of time = fail. All three correct = revive.
export async function runRespawnChallenge(player, { onRevive, onFail }) {
  onEnterState("respawn");
  const deadline = performance.now() + 30_000; // 30s for all three (§13)
  let solved = 0;

  for (let i = 0; i < 3; i++) {
    if (performance.now() >= deadline) break; // already out of time
    const key = pickFact(ALL_KEYS, masteryFacts);
    const { correct, correctAnswer } = await askProblem(key, {
      tag: `REVIVE · ${solved + 1} of 3`,
      deadline,
    });
    if (correct) {
      solved++;
      // Quick positive beat between problems (don't eat the shared clock long).
      await flashFeedback(true, correctAnswer);
      if (solved === 3) break;
    } else {
      // A miss or timeout ends the attempt immediately (E.3).
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
