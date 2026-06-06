// scene.js — Three.js setup, 2.5D tilted top-down camera, lighting, and the
// world ground. Per design Appendix D.2 (camera) and N.1 (camera follows the
// player; world is conceptually infinite, so the ground is a large tiling
// texture that reads as lush grass with narrow dirt trails winding through it).

import * as THREE from "three";

const CAMERA_OFFSET = { y: 22, z: 14 }; // high and slightly back -> the VS tilt

// ---- procedural grass + trail ground texture ----------------------------
// Large tile so repetition is far less obvious in view. Tiles seamlessly:
// every shape is drawn at all 9 wrap offsets so anything crossing an edge
// reappears on the far side.
function makeGroundTexture() {
  const T = 1024;
  const cv = document.createElement("canvas");
  cv.width = T;
  cv.height = T;
  const ctx = cv.getContext("2d");

  const WRAP = [];
  for (let ox = -1; ox <= 1; ox++)
    for (let oy = -1; oy <= 1; oy++) WRAP.push([ox, oy]);

  // base grass
  ctx.fillStyle = "#4a8e46";
  ctx.fillRect(0, 0, T, T);

  // --- layered grass tone variation (depth, not a flat field) ---
  const patch = document.createElement("canvas");
  patch.width = T;
  patch.height = T;
  const pctx = patch.getContext("2d");
  const tones = [
    "rgba(86,158,80,",
    "rgba(64,126,62,",
    "rgba(96,168,88,",
    "rgba(58,118,56,",
    "rgba(78,148,74,",
    "rgba(104,176,96,",
  ];
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * T;
    const y = Math.random() * T;
    const r = 40 + Math.random() * 130;
    const tone = tones[(Math.random() * tones.length) | 0];
    const a = (60 + ((Math.random() * 60) | 0)) / 255;
    pctx.fillStyle = tone + a + ")";
    for (const [ox, oy] of WRAP) {
      pctx.beginPath();
      pctx.arc(x + ox * T, y + oy * T, r, 0, Math.PI * 2);
      pctx.fill();
    }
  }
  ctx.save();
  ctx.filter = "blur(22px)";
  ctx.drawImage(patch, 0, 0);
  ctx.restore();
  ctx.filter = "none";

  // --- organic dirt trails ---
  function organicTrail(sx, sy, heading, steps, stepLen, jitter) {
    const pts = [[sx, sy]];
    let x = sx, y = sy, h = heading;
    for (let i = 0; i < steps; i++) {
      h += (Math.random() - 0.5) * jitter;
      x += Math.cos(h) * stepLen;
      y += Math.sin(h) * stepLen;
      pts.push([x, y]);
    }
    return pts;
  }
  function drawTrail(pts, width, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [ox, oy] of WRAP) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = p[0] + ox * T;
        const py = p[1] + oy * T;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }

  const DIRT_EDGE = "#785c38";
  const DIRT = "#b08a5c";
  const DIRT_LIGHT = "#c4a06e";

  const trails = [
    organicTrail(-40, 300, 0.15, 60, 22, 0.5),
    organicTrail(300, -40, 1.4, 60, 22, 0.5),
    organicTrail(700, 1064, -1.3, 55, 22, 0.55),
    organicTrail(1064, 760, 3.0, 58, 22, 0.5),
  ];
  for (const t of trails) drawTrail(t, 26, DIRT_EDGE);
  for (const t of trails) drawTrail(t, 18, DIRT);
  for (const t of trails) drawTrail(t, 8, DIRT_LIGHT);

  // --- speckle + baked ground detail (rich, low-contrast) ---
  const data = ctx.getImageData(0, 0, T, T).data;
  function sample(x, y) {
    const i = ((y | 0) * T + (x | 0)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * T;
    const y = Math.random() * T;
    const [r, g, b] = sample(x, y);
    if (r > 150 && g > 110 && b < 130) {
      ctx.fillStyle = Math.random() < 0.5 ? "#ceac78" : "#967448";
      const s = 1 + ((Math.random() * 2) | 0);
      ctx.fillRect(x, y, s, s);
    } else if (g > r && g > 110) {
      ctx.fillStyle = Math.random() < 0.5 ? "#6cb662" : "#347034";
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function wrapDraw(x, y, fn) {
    for (const [ox, oy] of WRAP) fn(x + ox * T, y + oy * T);
  }
  ctx.strokeStyle = "rgba(46,104,48,0.6)";
  ctx.lineWidth = 1;
  for (let c = 0; c < 90; c++) {
    const cx = Math.random() * T;
    const cy = Math.random() * T;
    const n = 3 + ((Math.random() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (Math.random() - 0.5) * 40;
      const y = cy + (Math.random() - 0.5) * 40;
      wrapDraw(x, y, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px - 2, py - 5);
        ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 5);
        ctx.moveTo(px, py); ctx.lineTo(px, py - 6);
        ctx.stroke();
      });
    }
  }
  for (let c = 0; c < 70; c++) {
    const cx = Math.random() * T;
    const cy = Math.random() * T;
    const n = 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (Math.random() - 0.5) * 24;
      const y = cy + (Math.random() - 0.5) * 24;
      wrapDraw(x, y, (px, py) => {
        const s = 2 + Math.random() * 2;
        ctx.fillStyle = "rgba(120,124,132,0.5)";
        ctx.beginPath();
        ctx.ellipse(px, py, s, s, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  for (let c = 0; c < 40; c++) {
    const x = Math.random() * T;
    const y = Math.random() * T;
    const r = 8 + Math.random() * 18;
    wrapDraw(x, y, (px, py) => {
      ctx.fillStyle = "rgba(150,122,84,0.14)";
      ctx.beginPath();
      ctx.ellipse(px, py, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a7d3a);
  scene.fog = new THREE.Fog(0x3f7f3a, 70, 130);

  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    1000
  );
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
  const TILE_UNITS = 22;
  const REPEAT = GROUND / TILE_UNITS;
  groundTex.repeat.set(REPEAT, REPEAT);

  const planeGeo = new THREE.PlaneGeometry(GROUND, GROUND);
  const planeMat = new THREE.MeshBasicMaterial({ map: groundTex });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0;
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
    const u = scene._tileUnits || 22;
    tex.offset.x = (playerPos.x / u) % 1;
    tex.offset.y = (-playerPos.z / u) % 1;
  }
}
