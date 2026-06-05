// scene.js — Three.js setup, 2.5D tilted top-down camera, lighting, ground.
// Per design Appendix D.2 (camera) and N.1 (camera follows the player; the
// world is conceptually infinite, so the ground is a large tiling grid).

import * as THREE from "three";

const CAMERA_OFFSET = { y: 22, z: 14 }; // high and slightly back -> the VS tilt

export function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);

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

  // --- lighting (sun color/intensity will later drive the day/night cycle) ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(5, 20, 10);
  scene.add(sun);

  // --- ground: a large grid on the XZ plane so motion reads clearly ---
  // A GridHelper gives instant visual feedback that the player is moving
  // through space. It's big enough that the edges stay off-screen at the
  // session lengths we care about; N.1's recenter trick is a later concern.
  const GROUND = 400;
  const grid = new THREE.GridHelper(GROUND, GROUND / 2, 0x2a2a44, 0x18182c);
  grid.position.y = 0;
  scene.add(grid);

  // A faint solid plane under the grid so it doesn't look like empty void.
  const planeGeo = new THREE.PlaneGeometry(GROUND, GROUND);
  const planeMat = new THREE.MeshBasicMaterial({ color: 0x0d0d18 });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01; // just under the grid lines
  scene.add(plane);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { scene, camera, renderer };
}

// Camera tracks the player each frame, preserving the tilt offset (N.1).
export function updateCamera(camera, playerPos) {
  camera.position.x = playerPos.x;
  camera.position.z = playerPos.z + CAMERA_OFFSET.z;
  camera.lookAt(playerPos.x, 0, playerPos.z);
}
