Readme · MDCopyMath Heaven
A top-down bullet-heaven horde-survival game (Vampire Survivors genre) where arithmetic mastery drives every meaningful decision. You auto-fight endless waves; the math gates your class, your upgrades, your revives, and your reward quality. The math is tables only — multiplication/division 2–12 and single-digit addition/subtraction — and the goal is mastery through repetition, not hard math.
Built on Three.js (2.5D tilted top-down camera), pure ES modules, no build step.

Full design spec lives in math-heaven-design.md. This README is the practical guide to running, deploying, and understanding the code. When they disagree, the design doc is the intent and the code is the truth.


Quick start
There's nothing to install or compile.
# Option A — just open the deployed URL (modules need http serving)
https://<your-user>.github.io/<repo>/

# Option B — serve locally (file:// will NOT work for ES modules)
python3 -m http.server 8000
# then open http://localhost:8000
Deploy loop: edit files in the GitHub web UI → commit → GitHub Pages serves it → refresh. No bundler, no npm install.
Three.js is pinned via an import map in index.html (three@0.160.0 from a CDN), so the only external dependency loads itself.

How to play

Move with WASD or arrow keys. That's the only control — every weapon auto-fires on its own timer at its own targets (true bullet heaven; you never aim).
Survive. Enemies trickle in and thicken over time. Walk over the gems they drop: green = XP, gold = Time.
XP fills the bar → Level-up. Pick one of three upgrade cards, then answer its math problem. Harder problem = bigger stat boost. A miss still gives a partial boost.
Every 30–60s → Decision Phase. One problem; how fast you answer correctly sets the reward (instant/fast/slow), a wrong answer is a curse.
A boss appears at a kill threshold. Solve one problem before the fight to land a free hit that chunks 25% of its HP, then it's pure dodge-and-shoot across three phases.
Lose all 3 lives → Respawn challenge. Solve 3 problems in 30 seconds total to revive; fail and the run ends.

Dev keys
KeyDoesPTrigger a Decision Phase immediately (test hook)RRestart (only on the Game Over screen — reloads the page)
A small debug readout (fps / enemy count / gun count) sits bottom-right.

The arithmetic engine (the heart)
Everything keys off a single canonical fact key: "op:a,b" — e.g. mul:7,8, div:56,7, add:6,9, sub:15,7. Every system that touches math speaks this string.

Mastery score per fact = accuracy (weighted most) + speed + recency, as one number 0..1.
Selection is weighted, not random — weak and unseen facts surface far more often than mastered ones. This is the "drill what you miss" behavior.
Difficulty tiers are adaptive — "Hard" pulls from your weak facts, "Easy" from your mastered ones. A small intrinsicDifficulty floor keeps labels honest on a fresh save (so it never shows "HARD 1+4" before it knows you).
Every answer is recorded to the precious mastery log immediately.

All of this lives in arithmetic.js and is pure logic — no rendering, testable in isolation.

Save data
Two separate localStorage keys, split by risk profile (both versioned, both read inside try/catch with a defaults fallback so a corrupt save never crashes):
KeyHoldsWhy splitmathheaven_masteryper-fact learning recordPrecious — the irreplaceable learning data. Written on every answer.mathheaven_progressunlocks, achievements, stats, settingsGame state. Annoying but not tragic to lose.
If progress ever corrupts, mastery survives and Practice Mode keeps working.

Art pipeline — SpudMaker Studio
All game art is made in spudmaker-studio.html, a standalone in-browser pixel-art editor (open it directly in any browser). It exports a single sprites.js — every sprite is just JSON frame data (a flat array of hex-or-null per pixel), so there are no image files, no licensing, and it commits cleanly through the GitHub web UI.
Rendering goes through one swap layer, sprite.js:

sprites.js — hand-drawn sprites from SpudMaker (hero, enemies, boss, pickups, projectile). Not committed by this session — left untouched.
world-sprites.js — the generated world props (trees, pine, bush, stone, pebbles, grass, flowers). Merged in at load.
Anything not drawn yet falls back to a colored disc, so a missing sprite never blocks the build.

sprite.js also owns world scale + ground-anchoring per asset, so a tree towers over the player while a stone sits underfoot, and everything stands on the ground rather than floating.

File map
index.html              canvas mount, import map, loads main.js
styles.css              HUD, math-prompt modal, floating numbers
math-heaven-design.md   the full design spec (deep reference)
spudmaker-studio.html   the pixel-art editor (makes the sprites)

── core engine ──
main.js                 boot, game state machine, fixed-timestep loop
scene.js                Three.js setup, 2.5D camera, grass+path ground
sprite.js               render swap layer: pixel sprites OR disc fallback
input.js                WASD/arrows + math-answer key capture

── gameplay ──
player.js               movement, health, XP, weapon/passive slots
enemies.js              3 archetypes, kill-gated unlocks, stat scaling
bosses.js               named bosses, phases, pre-boss weapon
weapons.js              13 weapons, auto-fire, firing patterns
projectiles.js          pooled bullets (+ return/homing/orbit behaviors)
combat.js               collisions, damage, i-frames, floating numbers
pickups.js              pooled XP gems + Time orbs, magnet collection
props.js                dense clustered world scenery

── arithmetic & data ──
arithmetic.js           THE adaptive engine: facts, mastery, selection
mathmoments.js          the 4 gated moments (level-up/decision/respawn/boss)
save.js                 split, versioned, safe localStorage
economy.js              Time + XP rewards per enemy
config.js               all tunable constants in one place

── generated art ──
sprites.js              hand-drawn sprites (from SpudMaker)
world-sprites.js        generated world props
hud.js                  edge-anchored combat HUD

Tuning
Almost every number lives in config.js — XP curve, Time rewards, enemy scaling, boss thresholds, i-frame duration, decision-phase rewards, slot caps. Balance there first.
A few current values worth knowing:
KnobValueNotexpBase25XP for the first level-upweaponSlots24generous cap so duplicate weapons can stack toward the bullet floodfirstBossAt / bossEvery80 / 150kills before the first/next boss
Weapons themselves are defined in weapons.js (13 of them). Duplicates stack — picking a gun you already own grants another independent instance, and copies compound into the dense late-game wall of projectiles. Two perf knobs if a giant stack ever strains a Chromebook: MAX_ENEMIES in enemies.js and POOL_SIZE in projectiles.js.

Status & roadmap
Working now: the full run loop — movement, all three enemy archetypes, 13 auto-firing weapons with duplicate stacking, pooled bullets/pickups, the adaptive arithmetic engine, all four math moments, one boss (Chrono Dragon), the grass-and-paths world with dense scaled props, and the combat HUD.
Not built yet (see the design appendices for specs):

Main menu, class select, proper game-over/restart (currently boots straight into a run; restart = page reload)
Practice Mode + end-of-run learning summary — closes the educational loop (highest-value gap)
Classes, elites, minibosses, the other four bosses
Passive items, weapon evolutions, reroll
Audio, pause, weather/day-night, objectives/events, achievements
