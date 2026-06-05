// sprite.js — the rendering swap layer (design Appendix L + O.3).
//
// One abstraction for ALL entity visuals. Game logic never knows whether it's
// getting a SpudMaker pixel sprite or a colored-shape fallback, so swapping art
// is a contained change here, not a rewrite.
//
// PRIMARY path:  SpudMaker `sprites.js` -> CanvasTexture pixel sprites (O.3).
// FALLBACK path: code-generated colored disc (L Phase 1) for anything not yet
//                drawn. This means a missing sprite never blocks the build.
//
// `sprites.js` is generated from PNGs (Option B) / SpudMaker. It may not exist
// yet, so we import it defensively: no file -> SPRITES stays empty -> everything
// falls back to discs. The slice runs today; real art lights up on drop-in.

import * as THREE from "three";

let SPRITES = {};
try {
  const mod = await import("./sprites.js");
  SPRITES = mod.SPRITES || {};
} catch (e) {
  // No sprites.js yet — expected during early build. Discs it is.
  console.info("[sprite] no sprites.js found; using colored-shape fallback.");
}

// ---- FALLBACK: colored shapes (design Appendix L Phase 1) ----
const SHAPE_COLORS = {
  player: 0x4fc3f7, // light blue
  chaser: 0xef5350, // red
  swarmer: 0xffb74d, // orange
  ranged: 0xab47bc, // purple
  elite: 0xffd54f, // gold
  boss: 0xff1744, // intense red
  pickup: 0x69f0ae, // green gem
  projectile: 0xffee58, // yellow bullet
};

// Asset names (what the game requests, matching future SpudMaker sprites) map
// to a generic kind for fallback coloring. Add an entry per named asset.
const KIND_ALIAS = {
  hero_pistoleer: "player",
  chaser_blob: "chaser",
  swarmer_bug: "swarmer",
  ranged_caster: "ranged",
};

function fallbackColor(kind) {
  const generic = KIND_ALIAS[kind] || kind;
  return SHAPE_COLORS[generic] ?? 0xffffff;
}

function makeShapeFallback(kind) {
  // A flat disc on the XZ plane reads cleanly under the 2.5D tilt camera.
  const geo = new THREE.CircleGeometry(0.5, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: fallbackColor(kind),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // lay flat on the ground plane
  return { mesh, kind, textures: null, setFrame() {} /* no-op */ };
}

// ---- PRIMARY: SpudMaker frame array -> crisp CanvasTexture (design O.3) ----
function frameToTexture(frame, size) {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = frame[y * size + x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; // crisp pixels, no blur
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// The one factory the whole game calls. `kind` is a SpudMaker asset name
// (e.g. "hero_pistoleer", "chaser_blob") OR a generic kind ("chaser", "player")
// that falls back to a colored disc.
export function makeSprite(kind) {
  const asset = SPRITES[kind];
  if (!asset) return makeShapeFallback(kind);

  const textures = asset.frames
    .filter((f) => f.some((px) => px !== null)) // skip an empty frame B
    .map((f) => frameToTexture(f, asset.size));

  if (textures.length === 0) return makeShapeFallback(kind);

  const mat = new THREE.SpriteMaterial({ map: textures[0], transparent: true });
  const mesh = new THREE.Sprite(mat); // billboards toward the camera
  return {
    mesh,
    kind,
    textures,
    setFrame(i) {
      if (textures.length > 1) mat.map = textures[i % textures.length];
    },
  };
}
