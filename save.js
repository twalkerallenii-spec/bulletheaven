// save.js — safe, versioned, split persistence (design Appendix C, §8).
//
// Two localStorage keys with different risk profiles:
//   mathheaven_mastery  — PRECIOUS: the per-fact learning record. Written often,
//                         never wiped casually. If progress corrupts, this still
//                         survives and Practice Mode keeps working.
//   mathheaven_progress — game state: unlocks, achievements, stats, settings.
//
// Every read is try/catch-wrapped with a fallback to defaults — never crash on
// a bad save. Both carry a version field for future format migrations.

const MASTERY_KEY = "mathheaven_mastery";
const PROGRESS_KEY = "mathheaven_progress";

export const DEFAULT_MASTERY = { v: 1, facts: {} };

export const DEFAULT_PROGRESS = {
  v: 1,
  time: 0,
  unlockedClasses: ["shotgunner", "sniper", "heavygunner"],
  unlockedWeapons: ["pistol"],
  permanentUpgrades: {},
  achievements: [],
  stats: { runs: 0, bestSurvival: 0, totalKills: 0 },
  settings: { levelUpInterval: "normal", screenShake: true, reduceFlashing: false },
  seenOnboarding: false, // M.4
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const data = JSON.parse(raw);
    if (data.v !== fallback.v) return migrate(key, data, fallback); // future-proof
    return data;
  } catch (e) {
    console.warn("Save corrupt, using defaults:", key, e);
    return structuredClone(fallback); // NEVER crash on a bad save
  }
}

function save(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed:", key, e);
  }
}

export const loadMastery = () => load(MASTERY_KEY, DEFAULT_MASTERY);
export const saveMastery = (m) => save(MASTERY_KEY, m);
export const loadProgress = () => load(PROGRESS_KEY, DEFAULT_PROGRESS);
export const saveProgress = (p) => save(PROGRESS_KEY, p);

function migrate(key, oldData, fallback) {
  // v1 has no prior versions; stub for future format changes.
  // When v2 arrives, branch on oldData.v here and transform forward.
  return structuredClone(fallback);
}
