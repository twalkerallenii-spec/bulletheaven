// props.js — decorative scenery (trees, rocks) scattered on the ground.
// Purely visual flavor for the infinite arena (design §6, M.8 — cheap, no
// physics). Props spawn in a ring around the player as they explore and are
// recycled when they fall far behind, keeping the active set bounded.

import { makeSprite } from "./sprite.js";

const PROP_KINDS = ["prop_tree", "prop_rock"];
const TARGET_COUNT = 18; // how many props to keep visible around the player
const SPAWN_MIN = 14; // ring radius range for placing new props
const SPAWN_MAX = 34;
const CULL_DIST = 46; // recycle props beyond this from the player

let scene = null;
const props = [];

export function initProps(sceneRef) {
  scene = sceneRef;
}

function placeProp(playerPos) {
  const kind = PROP_KINDS[(Math.random() * PROP_KINDS.length) | 0];
  const a = Math.random() * Math.PI * 2;
  const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
  const x = playerPos.x + Math.cos(a) * r;
  const z = playerPos.z + Math.sin(a) * r;
  const sprite = makeSprite(kind);
  // Props sit slightly below entities so heroes/enemies draw in front.
  sprite.mesh.position.set(x, 0.015, z);
  // Trees a bit bigger than rocks for variety.
  const s = kind === "prop_tree" ? 2.2 : 1.5;
  sprite.mesh.scale.set(s, s, 1);
  props.push({ sprite, x, z });
}

export function updateProps(player) {
  const p = player.position;

  // Cull props that fell behind.
  for (let i = props.length - 1; i >= 0; i--) {
    const pr = props[i];
    const d = Math.hypot(pr.x - p.x, pr.z - p.z);
    if (d > CULL_DIST) {
      scene.remove(pr.sprite.mesh);
      props.splice(i, 1);
    }
  }

  // Top up to the target count (a few per frame max — cheap).
  let added = 0;
  while (props.length < TARGET_COUNT && added < 2) {
    placeProp(p);
    added++;
  }
}
