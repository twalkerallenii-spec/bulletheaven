// hud.js — the combat HUD (design §16). VS-style: info lives on the screen
// edges, the center stays clear for the action. Reads live run/player state
// each frame and writes it into DOM nodes (cheap; only text/width changes).
//
// Layout (§16):
//   top edge      — XP bar (full width) + level number
//   top-center    — run timer
//   top-right     — Time currency + lives
//   above player  — HP bar (rendered bottom-left here for simplicity in the
//                   slice; a true above-player bar needs world->screen project)
//   top-left      — active weapons icon row

let els = null;

export function initHUD() {
  const overlay = document.getElementById("ui-overlay");
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.innerHTML = `
    <div id="hud-xp">
      <div id="hud-xp-fill"></div>
      <div id="hud-xp-label"></div>
    </div>
    <div id="hud-level">LV 1</div>
    <div id="hud-timer">0:00</div>
    <div id="hud-topright">
      <div id="hud-time"><span class="hud-ic">⏣</span> <span id="hud-time-val">0</span></div>
      <div id="hud-lives"><span class="hud-ic">♥</span> <span id="hud-lives-val">3</span></div>
    </div>
    <div id="hud-weapons"></div>
    <div id="hud-boss">
      <div id="hud-boss-name"></div>
      <div id="hud-boss-bar"><div id="hud-boss-fill"></div></div>
    </div>
    <div id="hud-hp">
      <div id="hud-hp-fill"></div>
      <div id="hud-hp-label"></div>
    </div>`;
  overlay.appendChild(hud);

  els = {
    xpFill: hud.querySelector("#hud-xp-fill"),
    xpLabel: hud.querySelector("#hud-xp-label"),
    level: hud.querySelector("#hud-level"),
    timer: hud.querySelector("#hud-timer"),
    timeVal: hud.querySelector("#hud-time-val"),
    livesVal: hud.querySelector("#hud-lives-val"),
    weapons: hud.querySelector("#hud-weapons"),
    hpFill: hud.querySelector("#hud-hp-fill"),
    hpLabel: hud.querySelector("#hud-hp-label"),
    bossWrap: hud.querySelector("#hud-boss"),
    bossName: hud.querySelector("#hud-boss-name"),
    bossFill: hud.querySelector("#hud-boss-fill"),
  };
}

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let lastWeaponSig = "";

export function updateHUD(player, run, boss) {
  if (!els) return;

  // XP bar + level
  const xpPct = Math.max(0, Math.min(1, player.xp / player.xpToNext));
  els.xpFill.style.width = (xpPct * 100).toFixed(1) + "%";
  els.xpLabel.textContent = `${player.xp} / ${player.xpToNext} XP`;
  els.level.textContent = `LV ${player.level}`;

  // run timer
  els.timer.textContent = fmtTime(run.elapsed || 0);

  // Time + lives
  els.timeVal.textContent = run.timeEarned;
  els.livesVal.textContent = player.lives;

  // HP bar — color shifts green -> amber -> red as it drops
  const hp = Math.max(0, player.hp);
  const hpPct = Math.max(0, Math.min(1, hp / player.maxHp));
  els.hpFill.style.width = (hpPct * 100).toFixed(1) + "%";
  els.hpFill.style.background =
    hpPct > 0.5 ? "#69f0ae" : hpPct > 0.25 ? "#ffd54f" : "#ff5252";
  els.hpLabel.textContent = `${hp} / ${player.maxHp}`;

  // boss HP bar (top-center, only when a boss is active)
  if (boss) {
    els.bossWrap.style.display = "block";
    els.bossName.textContent = `${boss.name}  ·  PHASE ${boss.phase}`;
    const bpct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    els.bossFill.style.width = (bpct * 100).toFixed(1) + "%";
  } else {
    els.bossWrap.style.display = "none";
  }

  // weapon icon row — rebuild only when the set/levels change (cheap guard)
  const sig = player.weapons.map((w) => `${w.id}:${w.level}`).join(",");
  if (sig !== lastWeaponSig) {
    lastWeaponSig = sig;
    els.weapons.innerHTML = player.weapons
      .map(
        (w) =>
          `<div class="hud-weapon"><span class="hud-weapon-ic">▣</span><span class="hud-weapon-lv">${w.level}</span></div>`
      )
      .join("");
  }
}
