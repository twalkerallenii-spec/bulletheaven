// startscreen.js — Old school Atari/SNES-style start screen

let startScreenEl = null;
let onStartClick = null;

export function initStartScreen() {
  buildStartScreenDOM();
}

function buildStartScreenDOM() {
  startScreenEl = document.createElement("div");
  startScreenEl.id = "start-screen";
  startScreenEl.className = "retro-start-screen";
  startScreenEl.innerHTML = `
    <div class="screen-border outer-border">
      <div class="screen-border inner-border">
        <div class="start-screen-content">
          
          <!-- TOP DECORATIVE BORDER -->
          <div class="decorative-line top"></div>
          
          <!-- TITLE SECTION -->
          <div class="title-section">
            <h1 class="game-title-main">BULLET<br>HEAVEN</h1>
            <div class="game-subtitle">Math-Powered Bullet Hell</div>
          </div>
          
          <!-- MAIN CONTENT -->
          <div class="content-section">
            <div class="arcade-box">
              <div class="box-header">OBJECTIVE</div>
              <div class="box-content">
                Master equations to survive waves of enemies and defeat powerful bosses.
              </div>
            </div>
            
            <div class="game-features">
              <div class="feature-row">
                <span class="feature-icon">⚡</span>
                <span class="feature-text">Speed Matters</span>
              </div>
              <div class="feature-row">
                <span class="feature-icon">🎯</span>
                <span class="feature-text">Accuracy Counts</span>
              </div>
              <div class="feature-row">
                <span class="feature-icon">💪</span>
                <span class="feature-text">Power Ups</span>
              </div>
            </div>
            
            <button id="start-button" class="arcade-button">
              <span class="button-text">► START GAME ◄</span>
            </button>
            
            <div class="arcade-box">
              <div class="box-header">CONTROLS</div>
              <div class="box-content small">
                <div>WASD or Arrow Keys to Move</div>
                <div>Click or Space to Shoot</div>
              </div>
            </div>
          </div>
          
          <!-- BOTTOM DECORATIVE BORDER -->
          <div class="decorative-line bottom"></div>
          
          <!-- PRESS START PROMPT -->
          <div class="press-start-prompt">
            ▼ PRESS START ▼
          </div>
          
        </div>
      </div>
    </div>
  `;
  
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
