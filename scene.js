// scene.js — Three.js setup, 2.5D tilted top-down camera, lighting, and the
// world ground. Per design Appendix D.2 (camera) and N.1 (camera follows the
// player; the world is conceptually infinite, so the ground is a large tiling
// texture that reads as grass with dirt paths winding through it).
//
// The grass+path look is painted onto a canvas once at boot and used as a
// repeating texture on a big ground plane — cheap (one draw call, no per-frame
// cost) and Chromebook-safe, while giving the lush top-down-RPG feel of the
// reference art instead of a debug grid.

import * as THREE from "three";

const CAMERA_OFFSET = { y: 22, z: 14 }; // high and slightly back -> the VS tilt

// ---- procedural grass+path ground texture ----
// Painted at TILE_PX resolution and repeated REPEAT times across the plane.
// Designed to tile seamlessly (paths/patches wrap at the edges) so the infinite
// scroll never shows a seam.
function makeGroundTexture() {
  const TILE_PX = 512;
  const cv = document.createElement("canvas");
  cv.width = TILE_PX;
  cv.height = TILE_PX;
  const ctx = cv.getContext("2d");

  // base grass fill
  ctx.fillStyle = "#3f8f4a";
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);

  // helper: draw with wrap so shapes that cross an edge appear on the far side,
  // keeping the texture seamless when tiled.
  function wrapBlob(x, y, r, color) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x + ox * TILE_PX, y + oy * TILE_PX, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // organic grass patches: scattered lighter + darker green blotches so the
  // ground isn't a flat color (matches the mottled grass in the reference).
  const greens = ["#46a052", "#379244", "#4fae5c", "#338a40", "#52b35f"];
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * TILE_PX;
    const y = Math.random() * TILE_PX;
    const r = 10 + Math.random() * 36;
    const c = greens[(Math.random() * greens.length) | 0];
    ctx.globalAlpha = 0.5;
    wrapBlob(x, y, r, c);
  }
  ctx.globalAlpha = 1;

  // a couple of winding dirt paths across the tile. Drawn as thick tan strokes
  // with a darker edge, wrapping so they continue across tiles into a network.
  function drawPath(points, width, color) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        points.forEach((p, i) => {
          const px = p[0] + ox * TILE_PX;
          const py = p[1] + oy * TILE_PX;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    }
  }

  // diagonal path that exits and re-enters seamlessly (start/end on opposite
  // edges at the same offset) — a gentle S-curve.
  const pathA = [
    [-20, 120],
    [120, 180],
    [240, 130],
    [360, 220],
    [532, 180],
  ];
  // a second path crossing it
  const pathB = [
    [180, -20],
    [240, 140],
    [200, 280],
    [300, 400],
    [260, 532],
  ];

  // darker edge under each path, then the tan fill on top
  drawPath(pathA, 46, "#8a6038");
  drawPath(pathB, 40, "#8a6038");
  drawPath(pathA, 36, "#b98a52");
  drawPath(pathB, 30, "#b98a52");

  // speckle the dirt with a little texture (pebbly lighter/darker dots)
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * TILE_PX;
    const y = Math.random() * TILE_PX;
    // only speckle near path tones — sample the pixel
    const px = ctx.getImageData(x, y, 1, 1).data;
    const isDirt = px[0] > 150 && px[1] > 110 && px[2] < 120;
    if (isDirt) {
      ctx.fillStyle = Math.random() < 0.5 ? "#caa066" : "#9c7444";
      const s = 2 + Math.random() * 3;
      ctx.fillRect(x, y, s, s);
    }
  }
  // a few grass flecks for texture
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * TILE_PX;
    const y = Math.random() * TILE_PX;
    const px = ctx.getImageData(x, y, 1, 1).data;
    const isGrass = px[1] > px[0] && px[1] > 120;
    if (isGrass) {
      ctx.fillStyle = Math.random() < 0.5 ? "#5cbf69" : "#2f7d3a";
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeScene() {
  const scene = new THREE.Scene();
  // sky/horizon tone behind everything — soft daylight, not black void
  scene.background = new THREE.Color(0x2a7a3a);
  scene.fog = new THREE.Fog(0x2f7d3a, 60, 120); // distant edges melt into grass

  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  camera.lookAt(0, 0, 0); // tilt down onto the arena (the XZ plane)

  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("game"),
    antialias: true,
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap for Chromebook perf

  // --- lighting: bright, sunny daylight so the grass reads vivid ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const sun = new THREE.DirectionalLight(0xfff4d6, 0.5);
  sun.position.set(5, 20, 10);
  scene.add(sun);

  // --- ground: a large grass plane with dirt paths (the world floor) ---
  const GROUND = 400;
  const groundTex = makeGroundTexture();
  // repeat the tile many times across the plane so each tile stays detailed
  const REPEAT = GROUND / 16; // one tile per ~16 world units
  groundTex.repeat.set(REPEAT, REPEAT);

  const planeGeo = new THREE.PlaneGeometry(GROUND, GROUND);
  const planeMat = new THREE.MeshBasicMaterial({ map: groundTex });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2; // lay flat on the XZ plane
  plane.position.y = 0;
  scene.add(plane);
  // keep the plane centered under the player so the textured ground is always
  // beneath them (the texture itself provides the "movement" via the props).
  scene._ground = plane;

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer };
}

// Camera tracks the player each frame, preserving the tilt offset (N.1). The
// ground plane recenters on the player too, so the (finite) plane always covers
// the view — the infinite world is sold by the scrolling props on top of it.
export function updateCamera(camera, playerPos, scene) {
  camera.position.x = playerPos.x;
  camera.position.z = playerPos.z + CAMERA_OFFSET.z;
  camera.lookAt(playerPos.x, 0, playerPos.z);
  if (scene && scene._ground) {
    // Snap the ground to the player on a coarse grid so the repeating texture
    // doesn't visibly slide (it stays put relative to the world, props move).
    scene._ground.position.x = playerPos.x;
    scene._ground.position.z = playerPos.z;
    // Offset the texture by the player's world position so the grass appears
    // fixed in the world even though the plane follows the camera.
    const tex = scene._ground.material.map;
    const repeat = tex.repeat.x;
    tex.offset.x = (playerPos.x / 16) % 1;
    tex.offset.y = (-playerPos.z / 16) % 1;
  }
}
