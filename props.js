// props.js — decorative world scenery scattered on the ground (design §6, M.8).
// Purely visual flavor for the infinite arena (cheap, no physics, drawn below
// entities so heroes/enemies/bullets always read on top). Props spawn in a ring
// around the player as they explore and recycle when far behind, keeping the
// active set bounded.
//
// To match the lush top-down-RPG reference, props are DENSE and CLUSTERED:
// trees clump into little groves, bushes and stones gather, and lots of small
// grass tufts + flowers carpet the ground between them. Weighted so big trees
// are occasional and ground detail is plentiful.

import { makeSprite } from "./sprite.js";

// Weighted prop table — higher weight = more common. Ground detail (grass,
// flowers, pebbles) dominates; trees/bushes are the structure; stones accent.
const PROP_TABLE = [
  ["prop_grass", 10],
  ["prop_flower", 4],
  ["prop_flower2", 3],
  ["prop_bush", 5],
  ["prop_pebbles", 4],
  ["prop_stone", 3],
  ["prop_tree", 5],
  ["prop_pine", 4],
];
const WEIGHTED = [];
for (const [kind, w] of PROP_TABLE) for (let i = 0; i < w; i++) WEIGHTED.push(kind);

// Props that like to clump into groves/clusters (trees especially).
const CLUSTERERS = new Set(["prop_tree", "prop_pine", "prop_bush", "prop_stone"]);

const TARGET_COUNT = 140; // dense — a populated world, not scattered debris
const SPAWN_MIN = 16; // ring radius range for placing new props (off-screen-ish)
const SPAWN_MAX = 52;
const CULL_DIST = 64; // recycle props beyond this from the player

let scene = null;
const props = [];

export function initProps(sceneRef) {
  scene = sceneRef;
}

function randKind() {
  return WEIGHTED[(Math.random() * WEIGHTED.length) | 0];
}

function addProp(kind, x, z) {
  const sprite = makeSprite(kind);
  // Props sit just below entities so heroes/enemies draw in front.
  sprite.mesh.position.set(x, 0.012, z);
  // Tiny random scale jitter so a grove doesn't look stamped/identical.
  const jitter = 0.85 + Math.random() * 0.3;
  sprite.mesh.scale.multiplyScalar(jitter);
  // Tiny render-order nudge by z so overlapping props layer believably.
  sprite.mesh.renderOrder = 1;
  props.push({ sprite, x, z, kind });
}

// Place a prop — sometimes as the seed of a small cluster of the same/related
// kind, for that grove-y, gathered look.
function placeProp(playerPos) {
  const kind = randKind();
  const a = Math.random() * Math.PI * 2;
  const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  const x = playerPos.x + Math.cos(a) * r;
  const z = playerPos.z + Math.sin(a) * r;

  addProp(kind, x, z);

  // Cluster: drop a few neighbors of a similar kind nearby.
  if (CLUSTERERS.has(kind) && Math.random() < 0.6) {
    const n = 2 + ((Math.random() * 3) | 0); // 2–4 extra
    for (let i = 0; i < n && props.length < TARGET_COUNT + 12; i++) {
      const nk =
        Math.random() < 0.7
          ? kind
          : Math.random() < 0.5
          ? "prop_grass"
          : "prop_bush";
      const nx = x + (Math.random() - 0.5) * 6;
      const nz = z + (Math.random() - 0.5) * 6;
      addProp(nk, nx, nz);
    }
    // a little grass skirt around a grove
    for (let i = 0; i < 2; i++) {
      addProp(
        "prop_grass",
        x + (Math.random() - 0.5) * 8,
        z + (Math.random() - 0.5) * 8
      );
    }
  }
}

export function updateProps(player) {
  const p = player.position;

  // Cull props that fell far behind the player.
  for (let i = props.length - 1; i >= 0; i--) {
    const pr = props[i];
    const d = Math.hypot(pr.x - p.x, pr.z - p.z);
    if (d > CULL_DIST) {
      scene.remove(pr.sprite.mesh);
      props.splice(i, 1);
    }
  }

  // Top up toward the target density (a handful per frame — still cheap; these
  // are static sprites with no per-frame update beyond existing).
  let added = 0;
  while (props.length < TARGET_COUNT && added < 6) {
    placeProp(p);
    added++;
  }
}
