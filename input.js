// input.js — keyboard input (design: WASD/arrows to move; math-answer capture
// is wired here later for the math moments). Steps 1-2 slice: movement only.

const keys = new Set();

// Track raw key state. Using e.code so layout-independent (KeyW, ArrowUp, etc).
addEventListener("keydown", (e) => {
  keys.add(e.code);
  // Stop arrow keys / space from scrolling the page.
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
    ].includes(e.code)
  ) {
    e.preventDefault();
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
// If the window loses focus mid-press, clear keys so the player doesn't
// "stick" moving in one direction.
addEventListener("blur", () => keys.clear());

// Returns a normalized {x, z} movement direction on the ground plane.
// Up/W -> negative Z (away from camera), matching the lookAt setup in scene.js.
export function getMoveVector() {
  let x = 0;
  let z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;

  // Normalize so diagonal movement isn't faster than cardinal.
  if (x !== 0 || z !== 0) {
    const len = Math.hypot(x, z);
    x /= len;
    z /= len;
  }
  return { x, z };
}

export function isKeyDown(code) {
  return keys.has(code);
}
