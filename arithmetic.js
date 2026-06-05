// arithmetic.js — the adaptive arithmetic engine (design §5, Appendix A.1, B).
//
// THE HEART OF THE GAME. Pure logic, no rendering — testable in isolation.
// Responsibilities:
//   • The fact universe (all valid problems) + key encode/decode/solve.
//   • masteryScore: accuracy + speed + recency -> one number per fact.
//   • pickFact: weighted selection that drills weak facts, surfaces new ones,
//     lightly reviews mastered ones.
//   • factsByDifficulty: Easy/Med/Hard map to the player's own mastery bands.
//   • speedTier: how fast you answered -> reward tier (Decision Phase).
//   • recordAnswer: updates the precious mastery log every time.

import { saveMastery } from "./save.js";

// ---- fact keys (Appendix A.1): "op:operandA,operandB" ----
export function makeKey(op, a, b) {
  return `${op}:${a},${b}`;
}

export function parseKey(key) {
  const [op, nums] = key.split(":");
  const [a, b] = nums.split(",").map(Number);
  return { op, a, b };
}

export function solve(op, a, b) {
  switch (op) {
    case "mul": return a * b;
    case "div": return a / b; // stored as dividend,divisor -> always integer
    case "add": return a + b;
    case "sub": return a - b;
    default: return NaN;
  }
}

// Human-readable form for the UI (e.g. "7 × 8").
const OP_SYMBOL = { mul: "×", div: "÷", add: "+", sub: "−" };
export function formatProblem(key) {
  const { op, a, b } = parseKey(key);
  return `${a} ${OP_SYMBOL[op]} ${b}`;
}

// ---- the fact universe (design §5: tables only) ----
// Multiplication: 2–12 × 2–12. Division: the exact inverses (dividend,divisor)
// so every answer is a whole number. Addition: single-digit facts 0–12.
// Subtraction: inverses of add facts (minuend,subtrahend) -> non-negative.
function buildFactUniverse() {
  const keys = [];

  // Multiplication & its inverse division.
  for (let a = 2; a <= 12; a++) {
    for (let b = 2; b <= 12; b++) {
      keys.push(makeKey("mul", a, b));
      // div: (a*b) ÷ a = b  — store dividend,divisor
      keys.push(makeKey("div", a * b, a));
    }
  }

  // Addition & its inverse subtraction (operands 0–12).
  for (let a = 0; a <= 12; a++) {
    for (let b = 0; b <= 12; b++) {
      keys.push(makeKey("add", a, b));
      // sub: (a+b) − b = a  — minuend,subtrahend, never negative
      keys.push(makeKey("sub", a + b, b));
    }
  }

  // De-dupe (division/subtraction inverses can collide on commutative pairs).
  return [...new Set(keys)];
}

export const ALL_KEYS = buildFactUniverse();

// ---- mastery score (Appendix B.1): 0 = weak, 1 = mastered ----
const TARGET_TIME = 3.0; // seconds; answering at/under this = full speed credit

export function masteryScore(rec) {
  if (!rec || rec.seen === 0) return 0; // never seen = not mastered
  const accuracy = rec.correct / rec.seen; // 0..1
  const avgTime = rec.totalTime / Math.max(rec.correct, 1);
  const speed = Math.min(1, TARGET_TIME / avgTime); // faster -> closer to 1
  return accuracy * 0.7 + speed * 0.3; // accuracy weighted most
}

// ---- weighted selection (Appendix B.2) ----
function selectionWeight(rec) {
  if (!rec || rec.seen === 0) return 8; // unseen: high weight, surface new
  const m = masteryScore(rec);
  // weak (low m) -> high weight; mastered (m~1) -> low but nonzero (review)
  return (1 - m) * 10 + 0.5;
}

export function pickFact(candidateKeys, facts) {
  const weights = candidateKeys.map((k) => selectionWeight(facts[k]));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidateKeys.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidateKeys[i];
  }
  return candidateKeys[candidateKeys.length - 1];
}

// ---- difficulty bands = mastery bands (Appendix B.3) ----
// "hard" pulls from WEAK facts; "easy" from MASTERED. Empty band -> caller
// falls back to the full pool so a problem is always available.
export function factsByDifficulty(facts, allKeys, difficulty) {
  const scored = allKeys.map((k) => ({ k, m: masteryScore(facts[k]) }));
  if (difficulty === "hard") return scored.filter((s) => s.m < 0.5).map((s) => s.k);
  if (difficulty === "easy") return scored.filter((s) => s.m >= 0.8).map((s) => s.k);
  return scored.filter((s) => s.m >= 0.5 && s.m < 0.8).map((s) => s.k); // medium
}

// ---- intrinsic difficulty of a problem (independent of mastery) ----
// The adaptive design maps difficulty to the player's OWN mastery, but on a
// fresh save there's no mastery data yet, so an "adaptive hard" slot would draw
// a random easy fact and mislabel it (e.g. "HARD 1+4"). This gives every fact a
// floor difficulty from its operands/op so labels are never dishonest:
//   easy   — add/sub, or small (≤5) multiplication/division
//   hard   — multiplication/division with a large operand (≥8)
//   medium — everything in between
export function intrinsicDifficulty(key) {
  const { op, a, b } = parseKey(key);
  if (op === "add" || op === "sub") {
    const big = Math.max(a, b);
    return big <= 8 ? "easy" : "medium"; // single-digit add/sub is never "hard"
  }
  // mul / div
  const factor = op === "div" ? b : Math.max(a, b); // div: the divisor is the table
  if (factor <= 5) return "easy";
  if (factor >= 8) return "hard";
  return "medium";
}

// Pick a fact for a difficulty SLOT that is honest about its label. Prefers the
// adaptive (mastery) band, but constrains to facts whose intrinsic difficulty
// matches the slot, so the label always reflects the problem actually shown.
export function pickFactForDifficulty(facts, allKeys, difficulty) {
  // Facts whose intrinsic difficulty matches the requested slot.
  const intrinsic = allKeys.filter(
    (k) => intrinsicDifficulty(k) === difficulty
  );
  // Of those, prefer ones in the adaptive band (weak for hard, mastered for
  // easy); if that's empty (cold start), use all intrinsically-matching facts.
  const band = new Set(factsByDifficulty(facts, allKeys, difficulty));
  const preferred = intrinsic.filter((k) => band.has(k));
  const pool = preferred.length ? preferred : intrinsic;
  return pickFact(pool.length ? pool : allKeys, facts);
}

// ---- speed -> reward tier (Appendix B.4, Decision Phase) ----
export function speedTier(answerSeconds, wasCorrect) {
  if (!wasCorrect) return "curse"; // wrong: lose Time/HP, debuff
  if (answerSeconds <= 2.0) return "instant"; // Legendary / huge Time / token
  if (answerSeconds <= 5.0) return "fast"; // Rare / medium Time
  return "slow"; // Common / small Time
}

// ---- recording an answer (Appendix B.5): writes the precious log ----
export function recordAnswer(facts, key, wasCorrect, answerSeconds) {
  const r = facts[key] || {
    seen: 0,
    correct: 0,
    totalTime: 0,
    lastSeen: 0,
    streak: 0,
  };
  r.seen += 1;
  r.lastSeen = Math.floor(Date.now() / 1000);
  if (wasCorrect) {
    r.correct += 1;
    r.totalTime += answerSeconds;
    r.streak += 1;
  } else {
    r.streak = 0;
  }
  facts[key] = r;
  saveMastery({ v: 1, facts }); // write often — irreplaceable data
  return r;
}
