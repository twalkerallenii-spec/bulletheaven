// props.js — decorative world scenery scattered on the ground (design §6, M.8).
// Purely visual flavor for the infinite arena (cheap, no physics, drawn below
// entities so heroes/enemies/bullets always read on top). Props spawn in a band
// around the player as they explore and recycle when far behind, keeping the
// active set bounded.
//
// Tuned for the lush top-down-RPG reference: props are DENSE and CLUSTERED into
// groves, and the spawn band reaches close to the player so the world is never
// bare around them. Trees/bushes are the structure; stones accent; grass and
// flowers carpet the gaps.

import { makeSprite } from "./sprite.js";

// Weighted prop table — higher weight = more common. Uses the Pixel Crawler
// prop set (trees, bush, rocks, grass, flowers).
const PROP_TABLE = [
  ["prop_grass", 11],
  ["prop_flower", 5],
  ["prop_bush", 6],
  ["prop_pebbles", 4],
  ["prop_stone", 3],
  ["prop_tree", 7],
  ["prop_pine", 5],
];
const WEIGHTED = [];
for (const [kind, w] of PROP_TABLE) for (let i = 0; i < w; i++) WEIGHTED.push(kind);

// Trees/bushes/stones cluster into groves.
const CLUSTERERS = new Set(["prop_tree", "prop_pine", "prop_bush", "prop_stone"]);
const LANDMARKS = new Set(); // none in this pack

const TARGET_COUNT = 200; // dense, populated world (Image-3 density)
const SPAWN_MIN = 8;  // reach close to the player so it's never bare nearby
const SPAWN_MAX = 56;
const CULL_DIST = 66;
// don't drop anything right on top of the player (a small clear bubble)
const CLEAR_RADIUS = 4.5;

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
  sprite.mesh.position.set(x, 0.012, z);
  const jitter = 0.82 + Math.random() * 0.36; // size variety so groves vary
  sprite.mesh.scale.multiplyScalar(jitter);
  sprite.mesh.renderOrder = 1;
  props.push({ sprite, x, z, kind });
}

function placeProp(playerPos) {
  const kind = randKind();
  const a = Math.random() * Math.PI * 2;
  const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  const x = playerPos.x + Math.cos(a) * r;
  const z = playerPos.z + Math.sin(a) * r;

  // keep a clear bubble around the player so structure/landmark props don't
  // spawn on them (grass/flowers are fine close — flat detail). Landmarks need
  // a bigger berth since they're large.
  const needsClearance = CLUSTERERS.has(kind) || LANDMARKS.has(kind);
  const bubble = LANDMARKS.has(kind) ? CLEAR_RADIUS * 2.5 : CLEAR_RADIUS;
  if (
    needsClearance &&
    Math.hypot(x - playerPos.x, z - playerPos.z) < bubble
  ) {
    return;
  }

  addProp(kind, x, z);

  // Cluster into groves for that gathered, forest-y look (landmarks stand
  // alone — no grove around a house/castle).
  if (CLUSTERERS.has(kind) && Math.random() < 0.7) {
    const n = 3 + ((Math.random() * 4) | 0); // 3–6 extra
    for (let i = 0; i < n && props.length < TARGET_COUNT + 20; i++) {
      const nk =
        Math.random() < 0.72
          ? kind
          : Math.random() < 0.5
          ? "prop_grass"
          : "prop_bush";
      const nx = x + (Math.random() - 0.5) * 7;
      const nz = z + (Math.random() - 0.5) * 7;
      addProp(nk, nx, nz);
    }
    // grass + flower skirt around the grove
    for (let i = 0; i < 3; i++) {
      const sk = Math.random() < 0.7 ? "prop_grass" : "prop_flower";
      addProp(
        sk,
        x + (Math.random() - 0.5) * 9,
        z + (Math.random() - 0.5) * 9
      );
    }
  }
}

export function updateProps(player) {
  const p = player.position;

  // Cull props that fell far behind.
  for (let i = props.length - 1; i >= 0; i--) {
    const pr = props[i];
    const d = Math.hypot(pr.x - p.x, pr.z - p.z);
    if (d > CULL_DIST) {
      scene.remove(pr.sprite.mesh);
      props.splice(i, 1);
    }
  }

  // Top up toward target density (a handful per frame — still cheap).
  let added = 0;
  while (props.length < TARGET_COUNT && added < 8) {
    placeProp(p);
    added++;
  }
}
