// sprite.js — the rendering swap layer (design Appendix L + O.3).
//
// One abstraction for ALL entity visuals. Game logic never knows whether it's
// getting a pixel sprite or a colored-shape fallback, so swapping art is a
// contained change here, not a rewrite.
//
// ROBUST LOADING: the two sprite sources (hand-drawn sprites.js + generated
// world-sprites.js) are imported INDEPENDENTLY, so one failing can never blank
// the other. Each load logs loudly so it's obvious in the console whether real
// art or disc fallbacks are in play. A missing/failed source just means those
// specific assets fall back to discs — the game always runs.

import * as THREE from "three";

let SPRITES = {};

// Load each source on its own. Promise.allSettled so a rejection in one doesn't
// abort the other (the previous version's single try/catch around both was the
// bug: one bad import blanked EVERY sprite).
const sources = [
  { name: "sprites.js", path: "./sprites.js", key: "SPRITES" },
  { name: "world-sprites.js", path: "./world-sprites.js", key: "WORLD_SPRITES" },
  { name: "bullet-sprites.js", path: "./bullet-sprites.js", key: "BULLET_SPRITES" },
  { name: "cog-sprites.js", path: "./cog-sprites.js", key: "COG_SPRITES" },
];

await Promise.allSettled(
  sources.map(async (s) => {
    try {
      const mod = await import(s.path);
      const data = mod[s.key];
      if (data && typeof data === "object") {
        const n = Object.keys(data).length;
        SPRITES = { ...SPRITES, ...data };
        console.info(`[sprite] loaded ${n} sprites from ${s.name}`);
      } else {
        console.warn(`[sprite] ${s.name} loaded but has no ${s.key} export`);
      }
    } catch (e) {
      console.warn(`[sprite] could not load ${s.name} (${e.message}); those assets fall back to discs.`);
    }
  })
);

console.info(`[sprite] total sprites available: ${Object.keys(SPRITES).length}`, Object.keys(SPRITES));

// ---- FALLBACK: colored shapes (design Appendix L Phase 1) ----
const SHAPE_COLORS = {
  player: 0x4fc3f7,
  chaser: 0xef5350,
  swarmer: 0xffb74d,
  ranged: 0xab47bc,
  elite: 0xffd54f,
  boss: 0xff1744,
  pickup: 0x69f0ae,
  projectile: 0xffee58,
  prop: 0x2f6b3a,
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
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, kind, textures: null, setFrame() {} };
}

// ---- PRIMARY: frame array -> crisp CanvasTexture (design O.3) ----
// Supports non-square sprites: `w` columns x `h` rows. Square callers pass the
// same value for both.
function frameToTexture(frame, w, h = w) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = frame[y * w + x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

const SIZE_BY_TYPE = {
  hero: 1.6,
  enemy: 1.4,
  pickup: 0.8,
  prop: 1.6,
  boss: 4.0,
  projectile: 0.9,
};

// Per-asset world scale + ground anchor. Anchor y (0..1): 0.1 = feet near the
// bottom (object stands on the ground), 0.5 = centered (flat ground detail).
const PROP_PROFILE = {
  prop_tree:    { scale: 3.2, anchor: 0.06 },
  prop_pine:    { scale: 3.2, anchor: 0.06 },
  prop_bush:    { scale: 1.5, anchor: 0.12 },
  prop_stone:   { scale: 1.0, anchor: 0.15 },
  prop_pebbles: { scale: 0.9, anchor: 0.2 },
  prop_grass:   { scale: 1.1, anchor: 0.2 },
  prop_flower:  { scale: 1.0, anchor: 0.2 },
  prop_flower2: { scale: 1.0, anchor: 0.2 },
  prop_house:   { scale: 3.6, anchor: 0.06 },
  prop_castle:  { scale: 4.4, anchor: 0.05 },
};

export function makeSprite(kind) {
  const asset = SPRITES[kind];
  if (!asset) return makeShapeFallback(kind);

  const w = asset.size;
  const h = asset.sizeY || asset.size; // non-square sprites (e.g. 16x32 enemies)

  const textures = asset.frames
    .filter((f) => f.some((px) => px !== null))
    .map((f) => frameToTexture(f, w, h));

  if (textures.length === 0) return makeShapeFallback(kind);

  const mat = new THREE.SpriteMaterial({ map: textures[0], transparent: true });
  const mesh = new THREE.Sprite(mat);

  const profile = PROP_PROFILE[kind];
  // base world size for the SHORT side; the long side scales by aspect so the
  // sprite isn't squashed. A 16x32 enemy at base 1.4 is 1.4 wide, 2.8 tall.
  const baseShort = profile ? profile.scale : SIZE_BY_TYPE[asset.type] ?? 1.4;
  const aspect = h / w;
  mesh.scale.set(baseShort, baseShort * aspect, 1);

  // Anchor: props/enemies stand on the ground (feet near the bottom). For tall
  // sprites this matters even more so they don't sink/float.
  const anchorY = profile ? profile.anchor : 0.08;
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

// Bullet textures: the projectile pool maps these onto flat planes. Returns a
// crisp CanvasTexture for a named bullet sprite, or null if the sprite isn't
// loaded (caller then uses a plain colored disc). Cached so repeated bullets of
// the same kind share one texture (keeps GPU memory + draw setup low).
const bulletTexCache = new Map();
export function bulletTexture(name) {
  if (bulletTexCache.has(name)) return bulletTexture._get(name);
  const asset = SPRITES[name];
  if (!asset) {
    bulletTexCache.set(name, null);
    return null;
  }
  const tex = frameToTexture(asset.frames[0], asset.size);
  bulletTexCache.set(name, tex);
  return tex;
}
bulletTexture._get = (name) => bulletTexCache.get(name);

// Is a given bullet sprite available? (lets weapons fall back gracefully)
export function hasBulletSprite(name) {
  return !!SPRITES[name];
}

// Effect frames: returns an array of cached CanvasTextures (one per animation
// frame) for a multi-frame effect sprite, or null if it isn't loaded. Used by
// effects.js to play impact bursts. Cached so repeated bursts share textures.
const effectTexCache = new Map();
export function effectFrames(name) {
  if (effectTexCache.has(name)) return effectTexCache.get(name);
  const asset = SPRITES[name];
  if (!asset || !asset.frames) {
    effectTexCache.set(name, null);
    return null;
  }
  const texes = asset.frames
    .filter((f) => f.some((px) => px !== null))
    .map((f) => frameToTexture(f, asset.size));
  const result = texes.length ? texes : null;
  effectTexCache.set(name, result);
  return result;
}
