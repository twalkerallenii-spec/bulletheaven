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
  parseKey,
  solve,
  formatProblem,
  recordAnswer,
  masteryScore,
} from "./arithmetic.js";

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
let modalEl, problemEl, inputEl, feedbackEl, tagEl;
let resolveAnswer = null;
let startedAt = 0;
let answerTimer = null;

function buildModalDOM() {
  modalEl = document.createElement("div");
  modalEl.id = "math-overlay";
  modalEl.innerHTML = `
    <div id="math-card">
      <div id="math-tag"></div>
      <div id="math-problem"></div>
      <input id="math-input" inputmode="numeric" autocomplete="off"
             spellcheck="false" placeholder="?" />
      <div id="math-feedback"></div>
      <div id="math-hint">type your answer &middot; press Enter</div>
    </div>`;
  document.getElementById("ui-overlay").appendChild(modalEl);

  problemEl = modalEl.querySelector("#math-problem");
  inputEl = modalEl.querySelector("#math-input");
  feedbackEl = modalEl.querySelector("#math-feedback");
  tagEl = modalEl.querySelector("#math-tag");

  inputEl.addEventListener("keydown", (e) => {
    e.stopPropagation(); // don't let WASD-capture eat digits
    if (e.key === "Enter") finish(inputEl.value);
  });
}

function showMathModal(key, tagText) {
  tagEl.textContent = tagText || "";
  problemEl.textContent = formatProblem(key);
  feedbackEl.textContent = "";
  feedbackEl.className = "";
  inputEl.value = "";
  inputEl.disabled = false;
  modalEl.classList.add("show");
  // Focus after the show transition starts so the caret lands reliably.
  requestAnimationFrame(() => inputEl.focus());
}

function hideMathModal() {
  modalEl.classList.remove("show");
}

// Returns a Promise<{ correct, seconds, answer }>. Optional timeLimit (seconds).
function askProblem(key, { timeLimit = null, tag = "" } = {}) {
  return new Promise((resolve) => {
    const { op, a, b } = parseKey(key);
    const correctAnswer = solve(op, a, b);
    startedAt = performance.now();
    showMathModal(key, tag);

    if (timeLimit) {
      answerTimer = setTimeout(() => finish(null), timeLimit * 1000);
    }

    resolveAnswer = (typed) => {
      clearTimeout(answerTimer);
      answerTimer = null;
      const seconds = (performance.now() - startedAt) / 1000;
      const correct = typed !== null && Number(typed) === correctAnswer;
      recordAnswer(masteryFacts, key, correct, seconds); // precious log
      resolve({ correct, seconds, answer: typed, correctAnswer });
    };
  });
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
// For the slice the player auto-takes a single difficulty-tagged problem.
// The 3-choice picker UI lands with upgrades.js; here we prove the math gate.
export async function runLevelUp(player) {
  onEnterState("levelup");

  // Draw one fact per difficulty band (fall back to full pool if a band empty).
  const diffs = ["easy", "medium", "hard"];
  // Slice: pick a "medium" challenge to demo; full version offers all three.
  const diff = "medium";
  const pool = factsByDifficulty(masteryFacts, ALL_KEYS, diff);
  const key = pickFact(pool.length ? pool : ALL_KEYS, masteryFacts);

  const { correct, seconds, correctAnswer, answer } = await askProblem(key, {
    tag: `LEVEL UP · ${diff.toUpperCase()}`,
  });

  // Show feedback on the card briefly before resuming.
  await flashFeedback(correct, correctAnswer);

  if (correct) {
    player.level += 1; // real upgrade application lands with upgrades.js
  }
  hideMathModal();
  onResume();
  return { correct, seconds, answer };
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
