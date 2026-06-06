// menus.js — the session shell: title screen, menu hub, class select,
// game-over summary, and Practice Mode. Pure DOM over the canvas (retro pixel
// styling in menus.css). This module owns screen flow and calls back into the
// game via the hooks passed to initMenus(). It reads the arithmetic engine and
// mastery log directly for class-select problems, the learning summary, and
// Practice Mode.

import {
  ALL_KEYS,
  parseKey,
  solve,
  formatProblem,
  masteryScore,
  recordAnswer,
  pickFact,
} from "./arithmetic.js";
import { loadMastery } from "./save.js";
// recordAnswer() (arithmetic.js) already persists the mastery log internally,
// so we don't strictly need saveMastery here. Import it defensively: if save.js
// doesn't export it, fall back to a no-op rather than failing to load the whole
// menu module.
import * as SaveModule from "./save.js";
const saveMastery = SaveModule.saveMastery || (() => {});
import { WORLD_SPRITES } from "./world-sprites.js";

// ---------- small DOM helpers ----------
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// draw a sprite asset (frame 0) onto a canvas, scaled crisp
function drawSpriteToCanvas(canvas, assetKey) {
  const asset = WORLD_SPRITES[assetKey];
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!asset) return;
  const w = asset.size, h = asset.sizeY || asset.size;
  const frame = asset.frames[0];
  // fit into the canvas preserving aspect
  const scale = Math.floor(Math.min(canvas.width / w, canvas.height / h));
  const ox = Math.floor((canvas.width - w * scale) / 2);
  const oy = Math.floor((canvas.height - h * scale) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = frame[y * w + x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale); }
    }
  }
}

// red -> yellow -> green ramp for a mastery score; gray if unseen
function masteryColor(score, seen) {
  if (!seen) return "#3a4a3a";
  const hue = Math.round(score * 120); // 0=red .. 120=green
  return `hsl(${hue}, 65%, 42%)`;
}

// ---------- the three starting classes (real Pixel Crawler sprites) ----------
const CLASSES = [
  { id: "knight", name: "Knight", sprite: "hero_run_down", desc: "Sturdy all-rounder. Balanced HP and speed." },
  { id: "rogue", name: "Rogue", sprite: "hero_run_left", desc: "Fast and nimble. Lower HP, quicker feet." },
  { id: "wizard", name: "Wizard", sprite: "hero_run_right", desc: "Glass cannon. Frail but hits harder." },
];

let overlay = null;
let hooks = null;
let screens = {};

export function initMenus(gameHooks) {
  hooks = gameHooks; // { startRun(classId, tier), getRunSummary(), masteryBefore() }
  overlay = document.getElementById("ui-overlay");

  screens.title = buildTitle();
  screens.menu = buildMenu();
  screens.classSelect = buildClassSelect();
  screens.gameover = buildGameOver();
  screens.practice = buildPractice();

  for (const k in screens) overlay.appendChild(screens[k]);
  showScreen("title");
}

export function showScreen(name) {
  for (const k in screens) screens[k].classList.add("mh-hidden");
  if (screens[name]) screens[name].classList.remove("mh-hidden");
  if (name === "practice") startPracticeSession();
  if (name === "gameover") fillGameOver();
}
export function hideAllScreens() {
  for (const k in screens) screens[k].classList.add("mh-hidden");
}

// ---------- TITLE ----------
function buildTitle() {
  const s = el("div", "mh-screen");
  s.appendChild(el("div", "mh-title", "MATH<br>HEAVEN"));
  s.appendChild(el("div", "mh-subtitle",
    "A bullet-heaven where your arithmetic drives every weapon, upgrade, and revive."));
  const press = el("div", "mh-subtitle mh-blink", "▶ PRESS ENTER TO START");
  press.style.marginTop = "10px";
  s.appendChild(press);
  const go = () => showScreen("menu");
  s.addEventListener("click", go);
  // Enter key only while title is visible
  addEventListener("keydown", (e) => {
    if (!s.classList.contains("mh-hidden") && (e.code === "Enter" || e.code === "Space")) go();
  });
  return s;
}

// ---------- MENU HUB ----------
function buildMenu() {
  const s = el("div", "mh-screen");
  s.appendChild(el("div", "mh-title", "MATH HEAVEN"));
  s.appendChild(el("div", "mh-subtitle", "Choose your path."));
  const mk = (label, primary, fn) => {
    const b = el("button", "mh-btn" + (primary ? " mh-btn-primary" : ""), label);
    b.addEventListener("click", fn);
    return b;
  };
  s.appendChild(mk("▶ Play", true, () => showScreen("classSelect")));
  s.appendChild(mk("✎ Practice", false, () => showScreen("practice")));
  s.appendChild(mk("⚙ Stats", false, () => showStats()));
  return s;
}

// quick stats popup (reads mastery log) — folded into the menu as a simple alert-panel
function showStats() {
  const m = loadMastery();
  const facts = m.facts || {};
  const keys = Object.keys(facts);
  const seen = keys.length;
  let mastered = 0, totalAcc = 0, answered = 0;
  for (const k of keys) {
    const r = facts[k];
    answered += r.seen || 0;
    if (r.seen) totalAcc += (r.correct / r.seen);
    if (masteryScore(r) >= 0.8) mastered++;
  }
  const acc = seen ? Math.round((totalAcc / seen) * 100) : 0;
  alert(
    `MATH HEAVEN — Your Progress\n\n` +
    `Facts encountered: ${seen} / ${ALL_KEYS.length}\n` +
    `Facts mastered:    ${mastered}\n` +
    `Total problems answered: ${answered}\n` +
    `Average accuracy: ${acc}%\n\n` +
    `Practice Mode drills your weakest facts.`
  );
}

// ---------- CLASS SELECT ----------
let selectedClass = null;
function buildClassSelect() {
  const s = el("div", "mh-screen");
  s.appendChild(el("div", "mh-title", "CHOOSE CLASS"));
  s.appendChild(el("div", "mh-subtitle",
    "Pick a hero, then solve one problem. A harder problem starts you at a higher gear."));
  const cards = el("div", "mh-cards");
  for (const c of CLASSES) {
    const card = el("div", "mh-card");
    card.dataset.classId = c.id;
    const cv = el("canvas");
    cv.width = 96; cv.height = 96;
    card.appendChild(cv);
    card.appendChild(el("div", "mh-card-name", c.name));
    card.appendChild(el("div", "mh-card-desc", c.desc));
    card.addEventListener("click", () => {
      selectedClass = c.id;
      for (const ch of cards.children) ch.classList.remove("mh-selected");
      card.classList.add("mh-selected");
      startBtn.removeAttribute("disabled");
      startBtn.style.opacity = "1";
    });
    cards.appendChild(card);
    // draw the hero sprite after it's in the DOM
    requestAnimationFrame(() => drawSpriteToCanvas(cv, c.sprite));
  }
  s.appendChild(cards);

  const startBtn = el("button", "mh-btn mh-btn-primary", "▶ Begin Run");
  startBtn.setAttribute("disabled", "true");
  startBtn.style.opacity = "0.5";
  startBtn.style.marginTop = "10px";
  startBtn.addEventListener("click", () => {
    if (!selectedClass) return;
    beginRunWithProblem(selectedClass);
  });
  s.appendChild(startBtn);

  const back = el("button", "mh-btn", "← Back");
  back.addEventListener("click", () => showScreen("menu"));
  s.appendChild(back);
  return s;
}

// class-select problem: difficulty (mastery of the drawn fact) -> starting tier
function beginRunWithProblem(classId) {
  const m = loadMastery();
  const key = pickFact(ALL_KEYS, m.facts);
  const { op, a, b } = parseKey(key);
  const answer = solve(op, a, b);
  const started = performance.now();
  const typed = prompt(`Starting problem:\n\n${formatProblem(op, a, b)} = ?`);
  const seconds = (performance.now() - started) / 1000;
  const correct = Number(typed) === answer;
  recordAnswer(m.facts, key, correct, seconds);
  saveMastery(m);
  // harder (lower mastery) answered correctly -> higher tier
  const score = masteryScore(m.facts[key]);
  const tier = !correct ? "common"
    : score < 0.4 ? "legendary"
    : score < 0.6 ? "ultrarare"
    : score < 0.8 ? "rare"
    : score < 0.95 ? "uncommon" : "common";
  hideAllScreens();
  hooks.startRun(classId, tier);
}

// ---------- GAME OVER + LEARNING SUMMARY ----------
function buildGameOver() {
  const s = el("div", "mh-screen");
  s.appendChild(el("div", "mh-title", "RUN OVER"));
  const summary = el("div", "mh-summary");
  summary.id = "mh-summary-body";
  s.appendChild(summary);
  const row = el("div", "mh-btn-row");
  const again = el("button", "mh-btn mh-btn-primary", "▶ Play Again");
  again.addEventListener("click", () => showScreen("classSelect"));
  const menu = el("button", "mh-btn", "☰ Menu");
  menu.addEventListener("click", () => showScreen("menu"));
  const practice = el("button", "mh-btn", "✎ Practice weak facts");
  practice.addEventListener("click", () => showScreen("practice"));
  row.appendChild(again); row.appendChild(practice); row.appendChild(menu);
  s.appendChild(row);
  return s;
}

function fillGameOver() {
  const body = document.getElementById("mh-summary-body");
  clear(body);
  const sum = hooks.getRunSummary ? hooks.getRunSummary() : {};
  // game column
  const g = el("div", "mh-summary-col");
  g.appendChild(el("h3", null, "THIS RUN"));
  const gstat = (label, val) => g.appendChild(el("div", "mh-stat", `<span>${label}</span><b>${val}</b>`));
  gstat("Survived", fmtTime(sum.elapsed || 0));
  gstat("Level reached", sum.level ?? 1);
  gstat("Enemies slain", sum.kills ?? 0);
  gstat("Time earned", sum.timeEarned ?? 0);
  body.appendChild(g);
  // learning column (the important half)
  const l = el("div", "mh-summary-col");
  l.appendChild(el("h3", "mh-learn-h", "YOUR MATH"));
  const lstat = (label, val) => l.appendChild(el("div", "mh-stat", `<span>${label}</span><b>${val}</b>`));
  const ls = sum.learning || {};
  lstat("Problems answered", ls.answered ?? 0);
  lstat("Accuracy", (ls.accuracy != null ? Math.round(ls.accuracy * 100) : 0) + "%");
  lstat("Fastest answer", ls.fastest != null ? ls.fastest.toFixed(1) + "s" : "—");
  lstat("Facts improved", (ls.improved || []).length);
  body.appendChild(l);
  if ((ls.improved || []).length) {
    const note = el("div", "mh-subtitle");
    note.style.marginTop = "6px";
    note.textContent = `You got faster at ${ls.improved.length} fact${ls.improved.length > 1 ? "s" : ""}! Keep going.`;
    body.appendChild(note);
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ---------- PRACTICE MODE ----------
let practiceState = null;
function buildPractice() {
  const s = el("div", "mh-screen");
  const top = el("div", "mh-practice-top");
  const back = el("button", "mh-btn", "← Menu");
  back.style.minWidth = "auto";
  back.style.padding = "10px 16px";
  back.addEventListener("click", () => showScreen("menu"));
  top.appendChild(back);
  const stats = el("div", "mh-practice-stats");
  stats.id = "mh-practice-stats";
  top.appendChild(stats);
  s.appendChild(top);

  s.appendChild(el("div", "mh-subtitle", "Drilling your weakest facts. Type the answer, press Enter."));
  const prompt = el("div", "mh-practice-prompt");
  prompt.id = "mh-practice-prompt";
  prompt.textContent = "—";
  s.appendChild(prompt);

  const input = el("input", "mh-practice-input");
  input.id = "mh-practice-input";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.addEventListener("keydown", (e) => {
    if (e.code === "Enter") submitPractice();
  });
  s.appendChild(input);

  const fb = el("div", "mh-feedback");
  fb.id = "mh-practice-feedback";
  s.appendChild(fb);

  // mastery grid
  const gridWrap = el("div", "mh-grid-wrap");
  gridWrap.id = "mh-grid-wrap";
  s.appendChild(gridWrap);
  return s;
}

function startPracticeSession() {
  const m = loadMastery();
  practiceState = { facts: m.facts, answered: 0, correct: 0, current: null, started: 0 };
  document.getElementById("mh-practice-feedback").textContent = "";
  nextPracticeProblem();
  renderMasteryGrid();
  updatePracticeStats();
  const input = document.getElementById("mh-practice-input");
  setTimeout(() => input && input.focus(), 50);
}

function nextPracticeProblem() {
  const key = pickFact(ALL_KEYS, practiceState.facts); // adaptive: weighted to weak
  const { op, a, b } = parseKey(key);
  practiceState.current = { key, op, a, b, answer: solve(op, a, b) };
  practiceState.started = performance.now();
  document.getElementById("mh-practice-prompt").textContent = formatProblem(op, a, b) + " = ?";
  const input = document.getElementById("mh-practice-input");
  input.value = "";
  input.focus();
}

function submitPractice() {
  const st = practiceState;
  if (!st || !st.current) return;
  const input = document.getElementById("mh-practice-input");
  const raw = input.value.trim();
  if (raw === "") return;
  const seconds = (performance.now() - st.started) / 1000;
  const correct = Number(raw) === st.current.answer;
  recordAnswer(st.facts, st.current.key, correct, seconds);
  saveMastery({ v: 1, facts: st.facts });
  st.answered++;
  if (correct) st.correct++;
  const fb = document.getElementById("mh-practice-feedback");
  if (correct) {
    fb.textContent = "✓ Correct!";
    fb.className = "mh-feedback ok";
  } else {
    fb.textContent = `✗ ${st.current.a} ${opSign(st.current.op)} ${st.current.b} = ${st.current.answer}`;
    fb.className = "mh-feedback bad";
  }
  updatePracticeStats();
  updateGridCell(st.current);
  setTimeout(nextPracticeProblem, correct ? 350 : 1100);
}

function opSign(op) { return { mul: "×", div: "÷", add: "+", sub: "−" }[op] || "?"; }

function updatePracticeStats() {
  const st = practiceState;
  const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
  document.getElementById("mh-practice-stats").innerHTML =
    `answered ${st.answered} · accuracy ${acc}%`;
}

// build the 12x12 multiplication grid + an addition grid, colored by mastery
let gridCells = {}; // key -> cell element
function renderMasteryGrid() {
  const wrap = document.getElementById("mh-grid-wrap");
  clear(wrap);
  gridCells = {};
  wrap.appendChild(buildOpGrid("mul", "× MULTIPLICATION", 2, 12));
  wrap.appendChild(buildOpGrid("add", "+ ADDITION", 0, 9));
}

function buildOpGrid(op, label, lo, hi) {
  const block = el("div", "mh-grid-block");
  block.appendChild(el("div", "mh-grid-label", label));
  const n = hi - lo + 1;
  const grid = el("div", "mh-grid");
  grid.style.gridTemplateColumns = `repeat(${n}, 18px)`;
  const facts = practiceState.facts;
  for (let a = lo; a <= hi; a++) {
    for (let b = lo; b <= hi; b++) {
      const key = `${op}:${a},${b}`;
      const rec = facts[key];
      const cell = el("div", "mh-cell");
      const score = rec ? masteryScore(rec) : 0;
      cell.style.background = masteryColor(score, rec && rec.seen);
      cell.title = `${a} ${opSign(op)} ${b}`;
      grid.appendChild(cell);
      gridCells[key] = cell;
    }
  }
  block.appendChild(grid);
  return block;
}

function updateGridCell(cur) {
  const cell = gridCells[cur.key];
  if (!cell) return;
  const rec = practiceState.facts[cur.key];
  cell.style.background = masteryColor(masteryScore(rec), rec && rec.seen);
}
