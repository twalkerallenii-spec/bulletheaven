// player.js — the player entity: movement, health, XP, weapon/passive slots.
// Slice scope: movement is live; the rest of the struct is defined per design
// (Appendix A.4 weapons, M.1 health/iframes) so later systems have a home.

import { makeSprite } from "./sprite.js";
import { getMoveVector } from "./input.js";

const PLAYER_SPEED = 8; // world units / second (tune in config.js later)

export function makePlayer(scene, classStats = { hp: 100, speed: 1.0 }) {
  // "hero_pistoleer" is the default SpudMaker asset name; falls back to a
  // light-blue disc until sprites.js exists.
  const sprite = makeSprite("hero_pistoleer");
  sprite.mesh.position.set(0, 0.02, 0); // just above the ground plane
  scene.add(sprite.mesh);

  return {
    sprite,
    // --- transform ---
    get position() {
      return sprite.mesh.position;
    },
    // --- health (M.1) ---
    hp: classStats.hp,
    maxHp: classStats.hp,
    iframe: 0, // seconds of invincibility remaining
    lives: 3, // design §13
    // --- progression (A.2 / loop) ---
    xp: 0,
    level: 1,
    xpToNext: 5, // CONFIG.xpBase
    // --- build (A.4) ---
    speedMult: classStats.speed,
    weapons: [], // live weapon instances
    passives: [], // accumulated passive items
    stats: { pickupRange: 0 }, // recomputed from passives (N.3/N.4)
    // Combat modifiers (multipliers) adjusted by upgrades, read at fire time.
    // 1.0 = unmodified. Stat-up upgrades raise these; weapons compute
    // effective values as base * mod (predictable stacking).
    mods: {
      damage: 1.0, // bullet damage multiplier
      fireRate: 1.0, // higher = faster (shorter interval)
      projectileSpeed: 1.0,
    },
    animTimer: 0,
  };
}

export function updatePlayer(player, dt) {
  const dir = getMoveVector();
  const speed = PLAYER_SPEED * player.speedMult;
  player.position.x += dir.x * speed * dt;
  player.position.z += dir.z * speed * dt;

  // i-frame countdown (no damage yet in the slice, but keep the tick honest).
  if (player.iframe > 0) {
    player.iframe = Math.max(0, player.iframe - dt);
  }

  // Animation tick — no-op for the disc fallback, real once sprites load.
  player.animTimer += dt;
  player.sprite.setFrame(Math.floor(player.animTimer * 6));
}
