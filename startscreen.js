// startscreen.js — Main menu and start screen for Math Adventure (Appendix D.1)

let startScreenEl = null;
let onStartClick = null;

export function initStartScreen() {
  buildStartScreenDOM();
}

function buildStartScreenDOM() {
  startScreenEl = document.createElement("div");
  startScreenEl.id = "start-screen";
  startScreenEl.innerHTML = `
    <div id="start-screen-content">
      <div id="start-screen-header">
        <h1 id="game-title">MATH ADVENTURE</h1>
        <div id="game-subtitle">Master the equations. Defeat the bosses.</div>
      </div>
      
      <div id="start-screen-middle">
        <div id="game-description">
          <p>Battle through waves of enemies by solving math problems at lightning speed.</p>
          <p>Level up to unlock powerful upgrades. Solve faster for bigger rewards!</p>
        </div>
        
        <button id="start-button" class="start-btn">START GAME</button>
        
        <div id="start-screen-stats">
          <div class="stat-item">
            <span class="stat-icon">⚡</span>
            <span class="stat-label">Speed Matters</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🎯</span>
            <span class="stat-label">Accuracy Counts</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">💪</span>
            <span class="stat-label">Power Up</span>
          </div>
        </div>
      </div>
      
      <div id="start-screen-footer">
        <div id="controls-hint">Use WASD or Arrow Keys to move • Click to shoot</div>
      </div>
    </div>`;
  
  document.getElementById("ui-overlay").appendChild(startScreenEl);
  
  const startBtn = startScreenEl.querySelector("#start-button");
  startBtn.addEventListener("click", () => {
    if (onStartClick) {
      hideStartScreen();
      onStartClick();
    }
  });
  
  // Allow pressing Enter or Space to start
  document.addEventListener("keydown", (e) => {
    if (startScreenEl.classList.contains("show")) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startBtn.click();
      }
    }
  });
}

export function showStartScreen(onStart) {
  onStartClick = onStart;
  startScreenEl.classList.add("show");
}

export function hideStartScreen() {
  startScreenEl.classList.remove("show");
}
