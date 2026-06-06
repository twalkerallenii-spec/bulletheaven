// sprite.js — the rendering swap layer (design Appendix L + O.3).
//
// One abstraction for ALL entity visuals. Game logic never knows whether it's
// getting a SpudMaker pixel sprite or a colored-shape fallback, so swapping art
// is a contained change here, not a rewrite.
//
// PRIMARY path:  SpudMaker `sprites.js` + generated `world-sprites.js` ->
//                CanvasTexture pixel sprites (O.3).
// FALLBACK path: code-generated colored disc (L Phase 1) for anything not yet
//                drawn. This means a missing sprite never blocks the build.
//
// Both sprite sources are imported defensively: a missing file just means those
// entries fall back to discs. The slice runs today; real art lights up on drop.

import * as THREE from "three";

let SPRITES = {};
try {
  const mod = await import("./sprites.js");
  SPRITES = { ...(mod.SPRITES || {}) };
} catch (e) {
  console.info("[sprite] no sprites.js found; using colored-shape fallback.");
}
// Merge generated world props (trees, bushes, stones, grass, flowers). Kept in
// a separate module so the hand-drawn sprites.js is never touched.
try {
  const wmod = await import("./world-sprites.js");
  SPRITES = { ...SPRITES, ...(wmod.WORLD_SPRITES || {}) };
} catch (e) {
  console.info("[sprite] no world-sprites.js found; props fall back to discs.");
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
  prop: 0x2f6b3a, // muted green for undrawn props
};

const KIND_ALIAS = {
  hero_frog: "player",
  chaser_imp: "chaser",
  swarmer_snow: "swarmer",
  ranged_imp2: "ranged",
  boss_golem: "boss",
  boss_dragon: "boss",
  boss_seal: "boss",
};

function fallbackColor(kind) {
  const generic = KIND_ALIAS[kind] || kind;
  return SHAPE_COLORS[generic] ?? 0xffffff;
}

function makeShapeFallback(kind) {
  const geo = new THREE.CircleGeometry(0.5, 16);
  const mat = new THREE.MeshBasicMaterial({ color: fallbackColor(kind) });
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

// World footprint by asset type. Props are sized against the ~1.4–1.6 character
// footprint so the world reads coherently (trees tower, stones are underfoot).
// Per-NAME overrides below handle within-type variation (tree vs grass tuft).
const SIZE_BY_TYPE = {
  hero: 1.6,
  enemy: 1.4,
  pickup: 0.8,
  prop: 1.6,
  boss: 4.0,
  projectile: 0.9,
};

// Per-asset world scale + ground anchor. Anchor y (0..1) is where on the sprite
// the "feet" are: 0.1 = near the bottom (object stands on the ground), 0.5 =
// centered (flat ground detail). Trees/bushes stand; grass/flowers/stones are
// low to the ground.
const PROP_PROFILE = {
  prop_tree:    { scale: 3.0, anchor: 0.08 }, // towers over the player
  prop_pine:    { scale: 3.0, anchor: 0.08 },
  prop_bush:    { scale: 1.5, anchor: 0.12 }, // ~player height-ish
  prop_stone:   { scale: 1.0, anchor: 0.15 }, // small, underfoot
  prop_pebbles: { scale: 0.9, anchor: 0.2 },
  prop_grass:   { scale: 1.1, anchor: 0.2 },  // ground detail
  prop_flower:  { scale: 1.0, anchor: 0.2 },
  prop_flower2: { scale: 1.0, anchor: 0.2 },
};

export function makeSprite(kind) {
  const asset = SPRITES[kind];
  if (!asset) return makeShapeFallback(kind);

  const textures = asset.frames
    .filter((f) => f.some((px) => px !== null)) // skip an empty frame B
    .map((f) => frameToTexture(f, asset.size));

  if (textures.length === 0) return makeShapeFallback(kind);

  const mat = new THREE.SpriteMaterial({ map: textures[0], transparent: true });
  const mesh = new THREE.Sprite(mat); // billboards toward the camera

  // Size: per-name prop profile wins; else by type.
  const profile = PROP_PROFILE[kind];
  const s = profile ? profile.scale : SIZE_BY_TYPE[asset.type] ?? 1.4;
  mesh.scale.set(s, s, 1);
  // Anchor near the feet so the sprite stands on the plane rather than through
  // it. Props get a profile anchor; entities use the standard near-feet value.
  const anchorY = profile ? profile.anchor : 0.1;
  mesh.center.set(0.5, anchorY);

  return {
    mesh,
    kind,
    textures,
    setFrame(i) {
      if (textures.length > 1) mat.map = textures[i % textures.length];
    },
  };
}
