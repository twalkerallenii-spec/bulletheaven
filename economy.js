// economy.js — the Time currency: earn values per source (design §3, §20, H).
//
// Time is the only currency. Each enemy archetype drops different amounts so
// engaging dangerous enemies pays better than farming swarm (§20). XP is
// separate from Time — XP fills the level-up bar (the learning heartbeat),
// Time is banked/spent. Both drop from kills here.

// Per-archetype rewards. Ranged worth most (hardest to reach), swarmer least
// (killed in volume). Elites/minibosses/bosses layered on later.
export const KILL_REWARDS = {
  chaser: { time: 3, xp: 2 },
  swarmer: { time: 1, xp: 1 },
  ranged: { time: 6, xp: 3 },
  elite: { time: 25, xp: 8 },
  miniboss: { time: 80, xp: 20 },
  boss: { time: 300, xp: 60 },
};

export function rewardFor(kind) {
  return KILL_REWARDS[kind] || { time: 1, xp: 1 };
}
