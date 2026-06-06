// effects.js — short-lived animated impact bursts (hit/kill VFX).
//
// Plays a multi-frame effect sprite (sliced from the purchased Effect sheets)
// at a world position, advancing through its frames over a short duration, then
// removing itself. Pooled like projectiles so spawning a burst per kill never
// allocates mid-run. Flat planes on the XZ plane, drawn above the ground.
//
// Effects are purely cosmetic — they never touch gameplay/collision.

import * as THREE from "three";
import { effectFrames } from "./sprite.js";

const POOL_SIZE = 120;        // plenty of simultaneous bursts
const BASE_HALF = 0.5;        // world half-size of a 1x burst
const DEFAULT_DURATION = 0.35; // seconds for a full burst

let scene = null;
const free = [];
const active = [];

// shared unit plane; scaled per burst
const planeGeo = new THREE.PlaneGeometry(BASE_HALF * 2, BASE_HALF * 2);

// material per (effect name) — reused; we swap the map's frame by cloning the
// texture set. To keep it cheap, each pooled mesh owns one material whose map we
// reassign to the current frame's cached texture.
function makeFx() {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.rotation.x = -Math.PI / 2; // flat on the ground
  mesh.visible = false;
  return {
    mesh,
    mat,
    active: false,
    textures: null, // array of THREE.Texture for the current effect
    frameCount: 0,
    age: 0,
    duration: DEFAULT_DURATION,
  };
}

export function initEffects(sceneRef) {
  scene = sceneRef;
  for (let i = 0; i < POOL_SIZE; i++) {
    const f = makeFx();
    scene.add(f.mesh);
    free.push(f);
  }
}

// Play an effect by name at (x,z). size scales the burst; duration overrides
// the default. Silently no-ops if the effect sprite isn't loaded.
export function spawnEffect(name, x, z, { size = 1, duration = DEFAULT_DURATION } = {}) {
  const textures = effectFrames(name);
  if (!textures || textures.length === 0) return null;
  const f = free.pop();
  if (!f) return null; // pool exhausted — skip (cosmetic, safe to drop)
  f.textures = textures;
  f.frameCount = textures.length;
  f.age = 0;
  f.duration = duration;
  f.active = true;
  f.mat.map = textures[0];
  f.mat.needsUpdate = true;
  f.mat.opacity = 1;
  f._baseSize = size;
  f.mesh.scale.set(size, size, 1);
  f.mesh.position.set(x, 0.07, z); // just above bullets so the pop reads on top
  f.mesh.visible = true;
  active.push(f);
  return f;
}

function release(f) {
  f.active = false;
  f.mesh.visible = false;
  f.textures = null;
  const i = active.indexOf(f);
  if (i >= 0) active.splice(i, 1);
  free.push(f);
}

export function updateEffects(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const f = active[i];
    f.age += dt;
    const t = f.age / f.duration;
    if (t >= 1) {
      release(f);
      continue;
    }
    // advance to the right frame for this point in the burst
    const idx = Math.min(f.frameCount - 1, Math.floor(t * f.frameCount));
    const tex = f.textures[idx];
    if (f.mat.map !== tex) {
      f.mat.map = tex;
      f.mat.needsUpdate = true;
    }
    // gentle grow + fade as it plays so it feels like an impact
    const base = f._baseSize || 1;
    const grow = base * (1 + t * 0.4);
    f.mesh.scale.set(grow, grow, 1);
    f.mat.opacity = 1 - t * 0.5;
  }
}

export function activeEffects() {
  return active;
}
