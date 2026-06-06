// scene.js — Three.js setup, 2.5D tilted top-down camera, lighting, and the
// world ground. The ground is built from the REAL Pixel Crawler grass + dirt
// tiles (embedded below as base64 so there are no extra files to commit),
// stamped into a large seamless texture with winding dirt paths. Camera follows
// the player; the ground recenters under them so the world feels infinite.

import * as THREE from "three";

// Camera height/back-offset. Lower + closer = more zoomed-in (the hero and
// enemies read at a good size rather than tiny and distant). Tilt is preserved
// by keeping z roughly 0.65x of y.
const CAMERA_OFFSET = { y: 13, z: 8.5 };

// --- embedded Pixel Crawler ground tiles (16x16 PNGs, base64) ---
const GRASS_TILES = [
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAyUlEQVR4nI1SURbDIAhL0J5op9vZfZZ9TChY7eaPyiMkAfh6F8XudELPHKJ8bz0BHgpB5xaMouCR61tBCqCNqNgJGHFtF4EXG6QUQG6ska3RQXZry7ZqAk1qZjA6s6XOZwU7W1FJ3bE/HW30aQjw7Wxs1i9VbqMoBEVBGfNdWSi6j+MfCzPY/iN/bWEk+ciiiqLpX9GvhsS5e6PK5deOkRFxjLa2YctWNhzsU5gk3XoR7JjaqCwpiG89kVaWeeU8bxVOgFjE3jH2Ac8sctIhS5i3AAAAAElFTkSuQmCC",
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2klEQVR4nH1TQRIDIQgLoC/q6/r2HaUHBYHaclF3SQgR6fUWRYxBgOhagbXfoQ+lVOqKFn9SV+gECP/B1NWLNa8UknQCxEjfHRTPshXoREpw0r1WcCRhnZf+ZLVSo3qgD6F9VY6eyunVCK01O3OtbGHE+ixS6pp8sf1SUCuHSEQG3LkkANfKvyIqiKqPqEHZ/ZENs3M1nWOOzuJ0JBR1L7yVQeBYLTm8AdWfOGxHgSVvEuKg5Nc4sxFcHo6P8jhTh0EO8usUvdyC7eVcXx2e6FfDJdJ0FqAr3DkfVDiRxcy1KuAAAAAASUVORK5CYII=",
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAwUlEQVR4nJVTWxKEIAxLAE+0p9uzM6X7YUtRQd3OOKOGNOkDfr5ZsQitBJO9tyvOTbHDwiNi3ysyNwU3BYRIWhkHjKhtV18pO4asKJefLdzMyN2ZEMhWAlM8b2J0XEbSSvEuSS8BWcFsYOWEEjE2Nzm5Z34gd/WsNsY/yd4rPxsdEMZ8n9QRk4hFMidvXIxR+hYKD1O4W2FtgZeZ8h35XEqZ2T7UuSB6r5LWa/OY7MDpop4bCNgU3EFP4kR5uBdC/ADyw2u6OxLuRQAAAABJRU5ErkJggg=="
  ];
const DIRT_TILES = [
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVR4nJWTuxHAIAxDnRy1mTJrZIhsihdIKnJGCAzq+Oj5LMPx3NcrgcyKqGa6TpHZm5hCAFZH2LlrFhFRzT9kCBiZEXKy3iKzV6oGpK8q4Xh21WSwU7m22YW4AvEZ0SnMWsGAp2Nc2esA/pJZadasPZqBv4gm/wopYFYNIWZl/hewGjv/AAO5UEYxYBWRAAAAAElFTkSuQmCC",
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVR4nJWTuxHAIAxDnRy1mTJrZIhsihdIKnJGCAzq+Oj5LMPx3NcrgcyKqGa6TpHZm5hCAFZH2LlrFhFRzT9kCBiZEXKy3iKzV6oGpK8q4Xh21WSwU7m22YW4AvEZ0SnMWsGAp2Nc2esA/pJZadasPZqBv4gm/wopYFYNIWZl/hewGjv/AAO5UEYxYBWRAAAAAElFTkSuQmCC",
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVR4nJWTuxHAIAxDnRy1mTJrZIhsihdIKnJGCAzq+Oj5LMPx3NcrgcyKqGa6TpHZm5hCAFZH2LlrFhFRzT9kCBiZEXKy3iKzV6oGpK8q4Xh21WSwU7m22YW4AvEZ0SnMWsGAp2Nc2esA/pJZadasPZqBv4gm/wopYFYNIWZl/hewGjv/AAO5UEYxYBWRAAAAAElFTkSuQmCC"
  ];

// Decode a base64 PNG into an Image (returns a Promise).
function loadTile(b64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "data:image/png;base64," + b64;
  });
}

// Build the tiling ground canvas from decoded grass/dirt tile images. 32x32
// tiles (512px). Grass everywhere, with a few wandering dirt-tile paths.
function paintGround(ctx, T, grassImgs, dirtImgs) {
  const TILES = T / 16;
  // RNG seeded so the path layout is stable each load
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // fill grass (mostly variant 0, occasional others for texture)
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      const g = rnd() < 0.7 ? grassImgs[0] : grassImgs[(rnd() * grassImgs.length) | 0];
      if (g) ctx.drawImage(g, tx * 16, ty * 16);
    }
  }
  // carve wandering dirt paths (a few tile-walks; wrap across edges)
  function walk(sx, sy, steps, bias) {
    let x = sx, y = sy, h = bias;
    const cells = [];
    for (let i = 0; i < steps; i++) {
      h += (rnd() - 0.5) * 1.1;
      x += Math.cos(h);
      y += Math.sin(h);
      cells.push([((x | 0) % TILES + TILES) % TILES, ((y | 0) % TILES + TILES) % TILES]);
    }
    return cells;
  }
  const paths = [
    ...walk(0, 8, 42, 0.2),
    ...walk(8, 0, 42, 1.4),
    ...walk(24, 31, 40, -1.3),
  ];
  for (const [tx, ty] of paths) {
    const d = dirtImgs[(rnd() * dirtImgs.length) | 0];
    if (d) ctx.drawImage(d, tx * 16, ty * 16);
    if (rnd() < 0.5) {
      const nx = (tx + (rnd() < 0.5 ? -1 : 1) + TILES) % TILES;
      const d2 = dirtImgs[(rnd() * dirtImgs.length) | 0];
      if (d2) ctx.drawImage(d2, nx * 16, ty * 16);
    }
  }
}

function makeGroundTexture() {
  const T = 512;
  const cv = document.createElement("canvas");
  cv.width = T;
  cv.height = T;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // placeholder grass-green until tiles decode
  ctx.fillStyle = "#4a8e46";
  ctx.fillRect(0, 0, T, T);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;

  // decode tiles, then paint + flag the texture for upload
  Promise.all([
    Promise.all(GRASS_TILES.map(loadTile)),
    Promise.all(DIRT_TILES.map(loadTile)),
  ]).then(([grassImgs, dirtImgs]) => {
    if (grassImgs.some(Boolean)) {
      paintGround(ctx, T, grassImgs.filter(Boolean), dirtImgs.filter(Boolean));
      tex.needsUpdate = true;
    }
  });

  return tex;
}

export function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a7d3a);
  scene.fog = new THREE.Fog(0x3f7f3a, 28, 60);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
  camera.position.set(0, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("game"),
    antialias: true,
  });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const sun = new THREE.DirectionalLight(0xfff4d6, 0.5);
  sun.position.set(5, 20, 10);
  scene.add(sun);

  const GROUND = 400;
  const groundTex = makeGroundTexture();
  const TILE_UNITS = 16; // one 512px texture covers 16 world units per repeat
  const REPEAT = GROUND / TILE_UNITS;
  groundTex.repeat.set(REPEAT, REPEAT);

  const planeGeo = new THREE.PlaneGeometry(GROUND, GROUND);
  const planeMat = new THREE.MeshBasicMaterial({ map: groundTex });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  scene._ground = plane;
  scene._tileUnits = TILE_UNITS;

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer };
}

export function updateCamera(camera, playerPos, scene) {
  camera.position.x = playerPos.x;
  camera.position.z = playerPos.z + CAMERA_OFFSET.z;
  camera.lookAt(playerPos.x, 0, playerPos.z);
  if (scene && scene._ground) {
    scene._ground.position.x = playerPos.x;
    scene._ground.position.z = playerPos.z;
    const tex = scene._ground.material.map;
    const u = scene._tileUnits || 16;
    tex.offset.x = (playerPos.x / u) % 1;
    tex.offset.y = (-playerPos.z / u) % 1;
  }
}
