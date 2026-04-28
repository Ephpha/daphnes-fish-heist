const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  fish: document.getElementById("fishCount"),
  score: document.getElementById("scoreCount"),
  best: document.getElementById("bestCount"),
  suspicionText: document.getElementById("suspicionText"),
  suspicionFill: document.getElementById("suspicionFill"),
  meter: document.querySelector(".meter"),
  startScreen: document.getElementById("startScreen"),
  gameOverScreen: document.getElementById("gameOverScreen"),
  message: document.getElementById("message"),
  finalFish: document.getElementById("finalFish"),
  finalScore: document.getElementById("finalScore"),
  finalBest: document.getElementById("finalBest"),
  finalRank: document.getElementById("finalRank")
};

const W = canvas.width;
const H = canvas.height;
const groundY = 505;
const safeZone = { x: 34, y: 390, w: 170, h: 120 };
const tankPlatform = { x: 920, y: 420, w: 250, h: 86 };
const tank = { x: 995, y: 205, w: 150, h: 210 };
const grabZone = { x: 900, y: 240, w: 245, h: 180 };
const keys = { left: false, right: false, jump: false, grab: false };

let state = "start";
let lastTime = 0;
let messageTimer = 0;
let warning = null;
let nextOwnerCheck = 0;
let postFishBonusReady = false;
let audioCtx = null;

const saveKey = "daphnesFishHeistBest";
let bestScore = Number(localStorage.getItem(saveKey) || 0);

let player;
let obstacles;
let fish;
let stats;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function beep(freq, duration, type = "sine", volume = 0.05) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    audioCtx = null;
  }
}

function makePlayer() {
  return {
    x: 92,
    y: groundY - 78,
    w: 82,
    h: 78,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: 1,
    bob: 0,
    slowed: 0,
    invulnerable: 0,
    nearTankTime: 0
  };
}

function buildObstacles() {
  const jitter = () => randomBetween(-28, 28);
  return [
    { type: "mug", x: 405 + jitter(), y: groundY - 56, w: 50, h: 56, cooldown: 0 },
    { type: "keys", x: 630 + jitter(), y: groundY - 20, w: 78, h: 20, cooldown: 0 },
    { type: "spill", x: 780 + jitter(), y: groundY - 10, w: 104, h: 10, cooldown: 0 }
  ];
}

function buildFish() {
  return Array.from({ length: 5 }, (_, i) => ({
    x: tank.x + 30 + i * 23,
    y: tank.y + 70 + (i % 2) * 42,
    speed: randomBetween(12, 24),
    phase: randomBetween(0, Math.PI * 2),
    color: ["#f05f5f", "#f5ba45", "#7f63d9", "#2f9f9b", "#ef7da8"][i]
  }));
}

function resetGame(startPlaying = true) {
  player = makePlayer();
  obstacles = buildObstacles();
  fish = buildFish();
  stats = { fish: 0, score: 0, suspicion: 0 };
  warning = null;
  messageTimer = 0;
  postFishBonusReady = false;
  nextOwnerCheck = randomBetween(7.5, 11);
  ui.gameOverScreen.classList.remove("active");
  updateUi();
  if (startPlaying) {
    state = "playing";
    ui.startScreen.classList.remove("active");
    showMessage("Daphne emerges from the box...");
  }
}

function updateUi() {
  const suspicion = Math.round(stats.suspicion);
  ui.fish.textContent = stats.fish;
  ui.score.textContent = stats.score;
  ui.best.textContent = bestScore;
  ui.suspicionText.textContent = `${suspicion}%`;
  ui.suspicionFill.style.width = `${suspicion}%`;
  ui.meter.setAttribute("aria-valuenow", String(suspicion));
}

function showMessage(text, warningStyle = false, seconds = 1.7) {
  ui.message.textContent = text;
  ui.message.classList.toggle("warning", warningStyle);
  ui.message.classList.add("show");
  messageTimer = seconds;
}

function playerRect() {
  return { x: player.x + 10, y: player.y + 12, w: player.w - 20, h: player.h - 13 };
}

function inSafeZone() {
  return rectsOverlap(playerRect(), safeZone);
}

function nearTank() {
  return rectsOverlap(playerRect(), grabZone);
}

function addSuspicion(amount) {
  stats.suspicion = clamp(stats.suspicion + amount, 0, 100);
}

function addScore(base) {
  const multiplier = 1 + Math.floor(stats.suspicion / 35) * 0.15;
  stats.score += Math.round(base * multiplier);
  if (stats.score > bestScore) {
    bestScore = stats.score;
    localStorage.setItem(saveKey, String(bestScore));
  }
}

function jump() {
  if (state !== "playing" || !player.onGround) return;
  player.vy = -680;
  player.onGround = false;
  beep(420, 0.06, "triangle", 0.03);
}

function grabFish() {
  if (state !== "playing" || !nearTank()) return;
  stats.fish += 1;
  addScore(100);
  addSuspicion(stats.fish > 1 && postFishBonusReady ? 20 : 15);
  postFishBonusReady = true;
  warning = null;
  nextOwnerCheck = Math.min(nextOwnerCheck, randomBetween(4.3, 6.4));
  showMessage("Fish acquired. Back to the box!", false, 1.5);
  beep(740, 0.08, "sine", 0.05);
  beep(980, 0.08, "sine", 0.035);
  updateUi();
}

function startOwnerWarning() {
  const duration = randomBetween(2.4, 3.8) - (stats.suspicion / 100) * 0.55;
  warning = { timer: clamp(duration, 1.8, 3.8), sweep: 0 };
  showMessage("Girlfriend footsteps! Hide in the box!", true, warning.timer);
  beep(180, 0.18, "sawtooth", 0.04);
}

function resolveOwnerCheck() {
  if (inSafeZone()) {
    addScore(50);
    addSuspicion(-10);
    showMessage("She sees only a perfect little angel...", false, 1.6);
    beep(520, 0.1, "triangle", 0.04);
    nextOwnerCheck = randomBetween(7.2, 10.5) - (stats.suspicion / 100) * 2.4;
  } else {
    gameOver();
  }
  warning = null;
}

function gameOver() {
  state = "gameover";
  warning = { timer: 0, sweep: 1 };
  if (stats.score > bestScore) {
    bestScore = stats.score;
    localStorage.setItem(saveKey, String(bestScore));
  }
  ui.finalFish.textContent = stats.fish;
  ui.finalScore.textContent = stats.score;
  ui.finalBest.textContent = bestScore;
  ui.finalRank.textContent = rankFor(stats.fish);
  ui.gameOverScreen.classList.add("active");
  showMessage("Your girlfriend caught Daphne mid-heist!", true, 1);
  beep(120, 0.35, "square", 0.05);
  updateUi();
}

function rankFor(count) {
  if (count === 0) return "Suspicious Loafer";
  if (count <= 2) return "Tiny Thief";
  if (count <= 5) return "Betta Bandit";
  if (count <= 9) return "Aquarium Menace";
  return "Legendary Fish Criminal";
}

function update(dt) {
  if (state !== "playing") return;

  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const speed = player.slowed > 0 ? 150 : 255;
  player.vx += (move * speed - player.vx) * Math.min(1, dt * 14);
  if (move !== 0) player.facing = move;

  player.vy += 1700 * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.bob += Math.abs(player.vx) * dt * 0.035 + dt * 2.2;
  player.slowed = Math.max(0, player.slowed - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);

  landOnSurfaces(dt);

  player.x = clamp(player.x, 18, W - player.w - 18);

  for (const obstacle of obstacles) {
    obstacle.cooldown = Math.max(0, obstacle.cooldown - dt);
    if (!rectsOverlap(playerRect(), obstacle)) continue;

    if (obstacle.type === "spill") {
      player.slowed = 1.1;
      continue;
    }

    if (obstacle.cooldown <= 0 && player.invulnerable <= 0) {
      if (obstacle.type === "mug") {
        addSuspicion(8);
        player.vx = -player.facing * 160;
        player.x += -player.facing * 12;
        showMessage("Tiny mug bump. Suspicious.", true, 1);
        beep(260, 0.08, "square", 0.04);
      } else if (obstacle.type === "keys") {
        addSuspicion(10);
        showMessage("Jingly evidence!", true, 1);
        beep(480, 0.05, "square", 0.035);
      }
      obstacle.cooldown = 1.1;
      player.invulnerable = 0.35;
    }
  }

  if (nearTank()) {
    player.nearTankTime += dt;
    addSuspicion(dt * 1);
  } else {
    player.nearTankTime = 0;
  }

  if (inSafeZone()) {
    addSuspicion(-5 * dt);
    if (postFishBonusReady) {
      addScore(25);
      postFishBonusReady = false;
      showMessage("Fish hidden. Daphne is innocent.", false, 1.3);
    }
  } else if (!nearTank()) {
    addSuspicion(-1.2 * dt);
  }

  if (!warning) {
    nextOwnerCheck -= dt * (1 + stats.suspicion / 85);
    if (nextOwnerCheck <= 0) startOwnerWarning();
  } else {
    warning.timer -= dt;
    warning.sweep = 1 - clamp(warning.timer / 3.8, 0, 1);
    if (warning.timer <= 0) resolveOwnerCheck();
  }

  updateUi();
}

function landOnSurfaces(dt) {
  player.onGround = false;
  const previousBottom = player.y + player.h - player.vy * dt;
  const platformTop = tankPlatform.y;
  const rect = playerRect();
  const overPlatform = rect.x + rect.w > tankPlatform.x + 8 && rect.x < tankPlatform.x + tankPlatform.w - 8;

  if (player.vy >= 0 && overPlatform && previousBottom <= platformTop && player.y + player.h >= platformTop) {
    player.y = platformTop - player.h;
    player.vy = 0;
    player.onGround = true;
    return;
  }

  if (player.y + player.h >= groundY) {
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  }
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawScene(t) {
  ctx.clearRect(0, 0, W, H);
  drawRoom(t);
  drawSafeZone();
  drawCounter();
  drawTankPlatform();
  drawTank(t);
  drawObstacles(t);
  drawDaphne(t);
  drawPrompts();
  drawGirlfriendCue(t);
}

function drawRoom(t) {
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, "#ffd9ad");
  wall.addColorStop(0.62, "#f8bea5");
  wall.addColorStop(1, "#cfa071");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(74, 72, 180, 150);
  ctx.fillStyle = "rgba(77,118,135,0.2)";
  ctx.fillRect(86, 84, 72, 126);
  ctx.fillRect(170, 84, 72, 126);

  ctx.fillStyle = "#2c2e36";
  drawRoundedRect(360, 104, 300, 150, 7);
  ctx.fillStyle = "#11131a";
  drawRoundedRect(373, 116, 274, 126, 5);
  ctx.fillStyle = "rgba(67, 184, 190, 0.28)";
  ctx.beginPath();
  ctx.moveTo(393, 132);
  ctx.lineTo(628, 132);
  ctx.lineTo(590, 224);
  ctx.lineTo(421, 224);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(410, 132, 58, 92);
  ctx.fillStyle = "#2c2e36";
  ctx.fillRect(496, 254, 28, 28);
  ctx.fillRect(450, 278, 120, 10);

  ctx.fillStyle = "rgba(108,74,55,0.32)";
  ctx.fillRect(730, 95, 150, 18);
  ctx.fillStyle = "#e7a96b";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(748 + i * 42, 60 + Math.sin(t * 0.001 + i) * 2, 24, 48);
  }

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(950, 90, 55 + Math.sin(t * 0.001) * 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawTankPlatform() {
  ctx.fillStyle = "rgba(66, 43, 31, 0.16)";
  drawRoundedRect(tankPlatform.x + 8, tankPlatform.y + 12, tankPlatform.w, tankPlatform.h, 8);
  ctx.fillStyle = "#b57951";
  drawRoundedRect(tankPlatform.x, tankPlatform.y, tankPlatform.w, tankPlatform.h, 8);
  ctx.fillStyle = "#e3ad77";
  ctx.fillRect(tankPlatform.x + 10, tankPlatform.y + 8, tankPlatform.w - 20, 16);
  ctx.fillStyle = "#8d583c";
  ctx.fillRect(tankPlatform.x + 34, tankPlatform.y + 30, 26, tankPlatform.h - 30);
  ctx.fillRect(tankPlatform.x + tankPlatform.w - 60, tankPlatform.y + 30, 26, tankPlatform.h - 30);
  ctx.fillStyle = "#fff3d9";
  ctx.font = "800 16px system-ui";
  ctx.fillText("jump up!", tankPlatform.x + 88, tankPlatform.y + 54);
}

function drawCounter() {
  ctx.fillStyle = "#a96745";
  ctx.fillRect(0, groundY, W, 115);
  ctx.fillStyle = "#d39b6f";
  ctx.fillRect(0, groundY - 28, W, 38);
  ctx.fillStyle = "#efbf8b";
  ctx.fillRect(0, groundY - 32, W, 12);

  ctx.strokeStyle = "rgba(99,57,34,0.22)";
  ctx.lineWidth = 3;
  for (let x = 30; x < W; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 16);
    ctx.lineTo(x + 50, H);
    ctx.stroke();
  }
}

function drawSafeZone() {
  ctx.fillStyle = "rgba(66, 43, 31, 0.12)";
  drawRoundedRect(safeZone.x - 6, safeZone.y + 10, safeZone.w + 12, safeZone.h, 8);

  ctx.fillStyle = "#b77a48";
  drawRoundedRect(safeZone.x, safeZone.y + 20, safeZone.w, safeZone.h - 20, 6);
  ctx.fillStyle = "#d69a62";
  ctx.fillRect(safeZone.x + 10, safeZone.y + 38, safeZone.w - 20, 58);
  ctx.fillStyle = "#9c633b";
  ctx.fillRect(safeZone.x + 74, safeZone.y + 22, 18, 94);
  ctx.fillStyle = "#e0ab74";
  ctx.beginPath();
  ctx.moveTo(safeZone.x + 12, safeZone.y + 30);
  ctx.lineTo(safeZone.x + 78, safeZone.y);
  ctx.lineTo(safeZone.x + 88, safeZone.y + 30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(safeZone.x + 90, safeZone.y + 30);
  ctx.lineTo(safeZone.x + safeZone.w - 8, safeZone.y + 8);
  ctx.lineTo(safeZone.x + safeZone.w - 18, safeZone.y + 38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6b442a";
  ctx.font = "800 19px system-ui";
  ctx.fillText("SAFE", safeZone.x + 58, safeZone.y + 82);
}

function drawTank(t) {
  ctx.fillStyle = "rgba(55, 159, 190, 0.22)";
  drawRoundedRect(tank.x - 12, tank.y - 8, tank.w + 24, tank.h + 18, 8);
  ctx.fillStyle = "rgba(80, 184, 211, 0.52)";
  drawRoundedRect(tank.x, tank.y, tank.w, tank.h, 8);
  ctx.fillStyle = "rgba(255, 255, 255, 0.36)";
  ctx.fillRect(tank.x + 10, tank.y + 15, 18, tank.h - 34);
  ctx.fillStyle = "#5f4d3e";
  ctx.fillRect(tank.x - 12, tank.y - 12, tank.w + 24, 13);
  ctx.fillRect(tank.x - 12, tank.y + tank.h, tank.w + 24, 15);
  ctx.fillStyle = "#d2a15b";
  ctx.fillRect(tank.x + 14, tank.y + tank.h - 28, tank.w - 28, 20);

  for (const f of fish) {
    const x = f.x + Math.sin(t * 0.001 * f.speed + f.phase) * 24;
    const y = f.y + Math.cos(t * 0.002 + f.phase) * 6;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.ellipse(x, y, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x - 28, y - 9);
    ctx.lineTo(x - 26, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1f2d35";
    ctx.beginPath();
    ctx.arc(x + 7, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.26)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(tank.x + 38 + i * 22, tank.y + 160 - ((t * 0.035 + i * 19) % 110), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawObstacles(t) {
  for (const obstacle of obstacles) {
    if (obstacle.type === "mug") drawMug(obstacle);
    if (obstacle.type === "keys") drawKeys(obstacle, t);
    if (obstacle.type === "spill") drawSpill(obstacle, t);
  }
}

function drawMug(o) {
  ctx.fillStyle = "#f7f0de";
  drawRoundedRect(o.x, o.y + 8, o.w - 10, o.h - 8, 7);
  ctx.strokeStyle = "#f7f0de";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(o.x + o.w - 10, o.y + 34, 16, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = "#4b2f24";
  ctx.fillRect(o.x + 8, o.y + 9, o.w - 28, 9);
  ctx.fillStyle = "#2f9f9b";
  ctx.font = "800 11px system-ui";
  ctx.fillText("MUG", o.x + 8, o.y + 43);
}

function drawKeys(o, t) {
  ctx.strokeStyle = "#f0bd43";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(o.x + 25, o.y + 12 + Math.sin(t * 0.01) * 1.5);
  ctx.lineTo(o.x + 70, o.y + 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(o.x + 17, o.y + 12, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(o.x + 54, o.y + 13);
  ctx.lineTo(o.x + 54, o.y + 24);
  ctx.moveTo(o.x + 65, o.y + 13);
  ctx.lineTo(o.x + 65, o.y + 22);
  ctx.stroke();
}

function drawSpill(o, t) {
  ctx.fillStyle = "rgba(80, 184, 211, 0.65)";
  ctx.beginPath();
  ctx.ellipse(o.x + o.w / 2, o.y + 8, o.w / 2, 16, Math.sin(t * 0.001) * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(o.x + 32, o.y + 5, 18, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawDaphne(t) {
  const pr = player;
  const cx = pr.x + pr.w / 2;
  const bob = pr.onGround ? Math.sin(pr.bob) * 3 : 0;
  const y = pr.y + bob;
  const dir = pr.facing;

  ctx.save();
  ctx.translate(cx, y + 40);
  ctx.scale(dir, 1);
  ctx.translate(-cx, -y - 40);

  ctx.fillStyle = "rgba(43, 33, 28, 0.16)";
  ctx.beginPath();
  ctx.ellipse(cx, pr.y + pr.h - 5, 42, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7b848b";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pr.x + 18, y + 44);
  ctx.bezierCurveTo(pr.x - 22, y + 8, pr.x + 16, y - 14, pr.x + 30, y + 18);
  ctx.stroke();

  ctx.fillStyle = "#8c969d";
  ctx.beginPath();
  ctx.ellipse(pr.x + 43, y + 43, 42, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7f2e8";
  ctx.beginPath();
  ctx.ellipse(pr.x + 50, y + 48, 22, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7f2e8";
  for (const foot of [22, 62]) {
    ctx.beginPath();
    ctx.ellipse(pr.x + foot, y + 74, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#96a0a7";
  ctx.beginPath();
  ctx.arc(pr.x + 72, y + 24, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#96a0a7";
  ctx.beginPath();
  ctx.moveTo(pr.x + 53, y + 5);
  ctx.lineTo(pr.x + 60, y - 20);
  ctx.lineTo(pr.x + 74, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pr.x + 78, y + 2);
  ctx.lineTo(pr.x + 95, y - 17);
  ctx.lineTo(pr.x + 98, y + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f7f2e8";
  ctx.beginPath();
  ctx.ellipse(pr.x + 82, y + 36, 18, 14, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f5ba45";
  ctx.beginPath();
  ctx.ellipse(pr.x + 73, y + 22, 5, 7, -0.1, 0, Math.PI * 2);
  ctx.ellipse(pr.x + 92, y + 23, 5, 7, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f2428";
  ctx.fillRect(pr.x + 72, y + 17, 2, 10);
  ctx.fillRect(pr.x + 91, y + 18, 2, 10);

  ctx.fillStyle = "#ef8a95";
  ctx.beginPath();
  ctx.moveTo(pr.x + 83, y + 32);
  ctx.lineTo(pr.x + 88, y + 32);
  ctx.lineTo(pr.x + 85.5, y + 36);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#40332f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pr.x + 88, y + 37, 9, 0.15, 1.2);
  ctx.stroke();

  ctx.restore();
}

function drawPrompts() {
  if (state !== "playing") return;
  if (nearTank()) {
    ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
    drawRoundedRect(810, 150, 290, 44, 8);
    ctx.fillStyle = "#2b211c";
    ctx.font = "900 22px system-ui";
    ctx.fillText("Press E to grab fish", 838, 179);
  }
  if (inSafeZone()) {
    ctx.fillStyle = "rgba(255, 250, 242, 0.86)";
    drawRoundedRect(35, 345, 176, 34, 8);
    ctx.fillStyle = "#2b211c";
    ctx.font = "800 17px system-ui";
    ctx.fillText("Safe in the box", 62, 368);
  }
}

function drawGirlfriendCue(t) {
  if (!warning) return;
  const amount = warning.timer <= 0 ? 1 : warning.sweep;
  ctx.fillStyle = `rgba(58, 36, 30, ${0.05 + amount * 0.12})`;
  ctx.fillRect(0, 0, W, H);

  const doorX = W - 78;
  ctx.fillStyle = "#5f3d31";
  ctx.fillRect(doorX, 120, 78, 300);
  ctx.fillStyle = `rgba(255, 232, 166, ${0.24 + amount * 0.28})`;
  ctx.fillRect(doorX + 6, 132, 18 + amount * 34, 276);
  ctx.fillStyle = "#3b2722";
  ctx.fillRect(doorX + 54 - amount * 24, 132, 24, 276);
  ctx.fillStyle = "#f4c160";
  ctx.beginPath();
  ctx.arc(doorX + 58 - amount * 24, 270, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
  drawRoundedRect(820, 86, 274, 48, 8);
  ctx.fillStyle = "#8f211b";
  ctx.font = "900 22px system-ui";
  ctx.fillText("footsteps in the hall", 848, 117);

  ctx.fillStyle = `rgba(43, 33, 28, ${0.38 + Math.sin(t * 0.012) * 0.12})`;
  for (let i = 0; i < 4; i++) {
    const x = 1030 - i * 42;
    const y = 458 - i * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 18, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 18, y + 8, 9, 18, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function frame(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) ui.message.classList.remove("show");
  }
  update(dt);
  drawScene(time);
  requestAnimationFrame(frame);
}

function setKey(action, down) {
  keys[action] = down;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", " ", "spacebar"].includes(key)) {
    event.preventDefault();
  }
  if (key === "a" || key === "arrowleft") setKey("left", true);
  if (key === "d" || key === "arrowright") setKey("right", true);
  if (key === "w" || key === "arrowup" || key === " ") jump();
  if (key === "e") grabFish();
  if (key === "r" && state === "gameover") resetGame(true);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "a" || key === "arrowleft") setKey("left", false);
  if (key === "d" || key === "arrowright") setKey("right", false);
});

document.getElementById("startButton").addEventListener("click", () => resetGame(true));
document.getElementById("restartButton").addEventListener("click", () => resetGame(true));

document.querySelectorAll("[data-hold]").forEach((button) => {
  const action = button.dataset.hold;
  const stop = () => setKey(action, false);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setKey(action, true);
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
});

document.querySelectorAll("[data-tap]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (button.dataset.tap === "jump") jump();
    if (button.dataset.tap === "grab") grabFish();
  });
});

resetGame(false);
state = "start";
ui.startScreen.classList.add("active");
updateUi();
requestAnimationFrame(frame);
