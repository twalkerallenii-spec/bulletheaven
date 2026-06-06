// pickups.js — XP gems + Time orbs that drop on kill (design §6, N.4, G).
//
// Pooled (never allocate mid-run). A pickup sits where the enemy died; once the
// player's pickup radius reaches it, it flies in and is collected. Collection
// grants XP (-> level-up clock) or Time (-> currency).
//
// XP pickups now render the purchased COIN sprite (an animated 5-frame spin)
// via the sprite layer; Time orbs stay a simple gold disc. If the coin sprite
// isn't loaded, XP falls back to the green disc so nothing vanishes.

import * as THREE from "three";
import { makeSprite, hasBulletSprite } from "./sprite.js";

const POOL_SIZE = 400;
const GEM_RADIUS = 0.22;
const COLLECT_DIST = 0.55;
const COIN_FPS = 10; // coin spin speed

let scene = null;
const free = [];
const active = [];

// Time orb: simple gold disc (shared geo/material -> low draw calls).
const gemGeo = new THREE.CircleGeometry(GEM_RADIUS, 8);
const matTime = new THREE.MeshBasicMaterial({ color: 0xffd54f });
const matXpFallback = new THREE.MeshBasicMaterial({ color: 0x69f0ae });

// Does the coin sprite exist? (mapped to "xp_gem" in cog-sprites.js)
let coinAvailable = false;

function makeGem() {
  // A pooled pickup holds BOTH a disc mesh (fallback / Time) and, lazily, a
  // coin sprite for XP. We show whichever matches the pickup's kind.
  const disc = new THREE.Mesh(gemGeo, matXpFallback);
  disc.rotation.x = -Math.PI / 2;
  disc.visible = false;

  // coin sprite (billboard) — created once per pooled slot if coin art exists
  let coin = null;
  if (coinAvailable) {
    coin = makeSprite("xp_gem"); // {mesh, textures, setFrame}
    coin.mesh.visible = false;
    coin.mesh.scale.set(0.7, 0.7, 1); // coin reads a touch smaller than a tree
  }

  return {
    disc,
    coin,
    kind: "xp",
    amount: 0,
    active: false,
    animT: Math.random(),
  };
}

export function initPickups(sceneRef) {
  scene = sceneRef;
  coinAvailable = hasBulletSprite("xp_gem"); // reuse the "is this sprite loaded?" check
  for (let i = 0; i < POOL_SIZE; i++) {
    const g = makeGem();
    scene.add(g.disc);
    if (g.coin) scene.add(g.coin.mesh);
    free.push(g);
  }
}

// Drop a pickup at (x,z). kind is "xp" or "time".
export function spawnPickup(x, z, kind, amount) {
  const g = free.pop();
  if (!g) return null;
  g.kind = kind;
  g.amount = amount;
  g.active = true;
  g.animT = 0;

  if (kind === "time") {
    g.disc.material = matTime;
    g.disc.visible = true;
    g.disc.position.set(x, 0.04, z);
    if (g.coin) g.coin.mesh.visible = false;
  } else {
    // XP -> coin sprite if available, else green disc
    if (g.coin) {
      g.coin.mesh.visible = true;
      g.coin.mesh.position.set(x, 0.12, z); // sits just above the ground
      g.coin.setFrame(0);
      g.disc.visible = false;
    } else {
      g.disc.material = matXpFallback;
      g.disc.visible = true;
      g.disc.position.set(x, 0.04, z);
    }
  }
  active.push(g);
  return g;
}

function pos(g) {
  // the visible mesh's position (coin if XP+coin, else disc)
  return g.kind === "xp" && g.coin ? g.coin.mesh.position : g.disc.position;
}

function release(g) {
  g.active = false;
  g.disc.visible = false;
  if (g.coin) g.coin.mesh.visible = false;
  const i = active.indexOf(g);
  if (i >= 0) active.splice(i, 1);
  free.push(g);
}

// Each frame: gems within pickup range home toward the player; on contact,
// collect (grant via the callbacks the run wires in). Coins animate their spin.
export function updatePickups(dt, player, { onXp, onTime, pickupRange, flySpeed }) {
  const p = player.position;
  const range = pickupRange;
  for (let i = active.length - 1; i >= 0; i--) {
    const g = active[i];
    const gp = pos(g);
    const dx = p.x - gp.x;
    const dz = p.z - gp.z;
    const dist = Math.hypot(dx, dz) || 1;

    // animate the coin spin
    if (g.kind === "xp" && g.coin) {
      g.animT += dt;
      g.coin.setFrame(Math.floor(g.animT * COIN_FPS));
    }

    if (dist < range) {
      gp.x += (dx / dist) * flySpeed * dt;
      gp.z += (dz / dist) * flySpeed * dt;
      if (dist < COLLECT_DIST) {
        if (g.kind === "time") onTime(g.amount);
        else onXp(g.amount);
        release(g);
      }
    }
  }
}

export function activePickups() {
  return active;
}
