const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

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
const tankPlatform = { x: 900, y: 410, w: 270, h: 96 };
const tank = { x: 975, y: 165, w: 180, h: 240 };
const grabZone = { x: 885, y: 218, w: 270, h: 190 };
const securityCamera = { x: 705, y: 86, w: 68, h: 34 };
const cameraRoute = { startX: 1110, endX: 225 };
const cameraZones = [
  { name: "box", x: 150 },
  { name: "mug", x: 430 },
  { name: "keys", x: 650 },
  { name: "spill", x: 890 },
  { name: "tank", x: 1110 }
];
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
    { type: "spill", x: 872 + randomBetween(-18, 18), y: groundY - 10, w: 96, h: 10, cooldown: 0 }
  ];
}

function buildFish() {
  const palettes = [
    { body: "#e84f63", fin: "#ff8a70", dark: "#9d2f4d" },
    { body: "#f2b43f", fin: "#ffdd6e", dark: "#b56c25" },
    { body: "#7256cf", fin: "#a787ff", dark: "#46348e" },
    { body: "#258f91", fin: "#45c9c2", dark: "#176269" },
    { body: "#d94f8f", fin: "#ff8ec0", dark: "#99345f" }
  ];

  return Array.from({ length: 4 }, (_, i) => ({
    x: tank.x + 45 + i * 32,
    y: tank.y + 88 + (i % 2) * 58,
    speed: randomBetween(4, 8),
    phase: randomBetween(0, Math.PI * 2),
    ...palettes[i]
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
  nextOwnerCheck = randomCameraDelay();
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
  nextOwnerCheck = Math.min(nextOwnerCheck, randomBetween(2.2, 4.6) - cameraDifficulty() * 1.1);
  showMessage("Fish acquired. Back to the box!", false, 1.5);
  beep(740, 0.08, "sine", 0.05);
  beep(980, 0.08, "sine", 0.035);
  updateUi();
}

function triggerCamera(reason = "motion") {
  if (warning || state !== "playing") return;
  const difficulty = cameraDifficulty();
  const routeScan = reason === "motion" || reason === "tank" || reason === "daphne" || reason === "return";
  const tankAlert = reason === "tank" || (routeScan && nearTank());
  const duration = (tankAlert ? randomBetween(2.2, 3.25) : randomBetween(1.65, 2.7)) - difficulty * 0.65;
  const zone = chooseCameraZone(reason);
  const activeDuration = routeScan
    ? randomBetween(2.9, 3.7) - difficulty * 1.1
    : randomBetween(1.15, 1.75) + difficulty * 1.15;
  warning = {
    timer: clamp(duration, 0.85, 2.5),
    duration: clamp(duration, 0.85, 2.5),
    active: 0,
    activeDuration: clamp(activeDuration, 1.65, 3.9),
    escapeGrace: tankAlert ? 1.05 : 0.25,
    beamX: routeScan ? cameraRoute.startX : zone.x,
    targetX: routeScan ? cameraRoute.startX : zone.x,
    routeScan,
    routeStart: cameraRoute.startX,
    routeEnd: cameraRoute.endX,
    jitterSeed: randomBetween(0, Math.PI * 2),
    passes: 1 + (difficulty > 0.72 ? 1 : 0),
    riskyStart: !inSafeZone(),
    reason,
    zone: zone.name,
    width: (routeScan ? 38 : 46) + difficulty * (routeScan ? 34 : 38)
  };
  showMessage(routeScan ? "Camera sweep warming up. Move!" : "Noise triggered the camera!", true, warning.timer);
  beep(220, 0.12, "square", 0.04);
}

function cameraDifficulty() {
  const scorePressure = clamp(stats.score / 2400, 0, 1);
  const fishPressure = clamp(stats.fish / 10, 0, 1);
  const suspicionPressure = Math.pow(stats.suspicion / 100, 1.35);
  const progressPressure = Math.max(scorePressure, fishPressure * 0.9);
  const lootPressure = postFishBonusReady ? 0.12 : 0;
  return clamp(progressPressure * 0.55 + suspicionPressure * 0.25 + lootPressure, 0, 1);
}

function randomCameraDelay() {
  const difficulty = cameraDifficulty();
  return randomBetween(8.2 - difficulty * 5.2, 12.4 - difficulty * 6.2);
}

function chooseCameraZone(reason) {
  if (reason === "mug") return cameraZones.find((zone) => zone.name === "mug");
  if (reason === "keys") return cameraZones.find((zone) => zone.name === "keys");
  if (reason === "spill") return cameraZones.find((zone) => zone.name === "spill");
  if (reason === "tank") return { name: "tank", x: clamp(player.x + player.w / 2 + 55, 1035, 1135) };
  if (reason === "daphne") return { name: "daphne", x: clamp(player.x + player.w / 2, 210, 1045) };
  if (postFishBonusReady && stats.suspicion > 55) return { name: "return", x: clamp(player.x + player.w / 2, 230, 1020) };
  if (stats.suspicion > 82 && Math.random() < 0.65) return { name: "attention", x: clamp(player.x + player.w / 2, 230, 1020) };

  const candidates = stats.score < 450
    ? cameraZones.filter((zone) => zone.name === "mug" || zone.name === "keys" || zone.name === "spill")
    : cameraZones.filter((zone) => zone.name !== "box");
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function resolveCameraCheck(success = true) {
  if (inSafeZone()) {
    if (warning?.riskyStart) addScore(50);
    addSuspicion(-10);
    showMessage("Camera sees an empty counter...", false, 1.6);
    beep(520, 0.1, "triangle", 0.04);
    nextOwnerCheck = Math.max(1.1, randomCameraDelay() - (stats.suspicion / 100) * 1.4);
  } else if (!success) {
    gameOver();
    return;
  }
  warning = null;
}

function gameOver() {
  state = "gameover";
  warning = null;
  if (stats.score > bestScore) {
    bestScore = stats.score;
    localStorage.setItem(saveKey, String(bestScore));
  }
  ui.finalFish.textContent = stats.fish;
  ui.finalScore.textContent = stats.score;
  ui.finalBest.textContent = bestScore;
  ui.finalRank.textContent = rankFor(stats.fish);
  ui.gameOverScreen.classList.add("active");
  showMessage("Caught on camera!", true, 1);
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
      if (obstacle.cooldown <= 0) {
        addSuspicion(4);
        if (Math.random() < 0.45 + cameraDifficulty() * 0.45) triggerCamera("spill");
        obstacle.cooldown = 1.2;
      }
      continue;
    }

    if (obstacle.cooldown <= 0 && player.invulnerable <= 0) {
      if (obstacle.type === "mug") {
        addSuspicion(8);
        player.vx = -player.facing * 160;
        player.x += -player.facing * 12;
        showMessage("Tiny mug bump. Suspicious.", true, 1);
        if (Math.random() < 0.6 + cameraDifficulty() * 0.38) triggerCamera("mug");
        beep(260, 0.08, "square", 0.04);
      } else if (obstacle.type === "keys") {
        addSuspicion(10);
        showMessage("Jingly evidence!", true, 1);
        if (Math.random() < 0.7 + cameraDifficulty() * 0.3) triggerCamera("keys");
        beep(480, 0.05, "square", 0.035);
      }
      obstacle.cooldown = 1.1;
      player.invulnerable = 0.35;
    }
  }

  if (nearTank()) {
    player.nearTankTime += dt;
    addSuspicion(dt * (postFishBonusReady ? 1.35 : 0.9));
    if (!warning && stats.suspicion > 75 && player.nearTankTime > 2.6) {
      triggerCamera("tank");
    }
  } else {
    player.nearTankTime = 0;
  }

  if (inSafeZone()) {
    addSuspicion(-(postFishBonusReady ? 20 : 14) * dt);
    if (postFishBonusReady) {
      addScore(25);
      postFishBonusReady = false;
      showMessage("Fish hidden. Daphne is innocent.", false, 1.3);
    }
  } else if (!nearTank()) {
    const safeCenter = safeZone.x + safeZone.w / 2;
    const maxDistance = tank.x - safeCenter;
    const distanceFromSafe = Math.abs((player.x + player.w / 2) - safeCenter);
    const safeCloseness = 1 - clamp(distanceFromSafe / maxDistance, 0, 1);
    const carryingPenalty = postFishBonusReady ? 1.8 : 0;
    addSuspicion(-(1.1 + safeCloseness * 3.4 - carryingPenalty) * dt);
  }

  if (!warning) {
    const carryingHeat = postFishBonusReady ? 1.25 : 0;
    nextOwnerCheck -= dt * (1 + stats.suspicion / 65 + carryingHeat);
    if (postFishBonusReady && stats.suspicion > 65 && nextOwnerCheck < 1.4) {
      triggerCamera("daphne");
    } else if (nextOwnerCheck <= 0) {
      triggerCamera(nearTank() ? "tank" : "motion");
    }
  } else {
    updateCameraCheck(dt);
  }

  updateUi();
}

function updateCameraCheck(dt) {
  warning.timer -= dt;
  warning.sweep = 1 - clamp(warning.timer / warning.duration, 0, 1);

  if (warning.timer <= 0) {
    warning.active += dt;
    if (warning.routeScan) {
      const rawProgress = clamp(warning.active / warning.activeDuration, 0, 1);
      const passProgress = (rawProgress * warning.passes) % 1;
      const sweep = warning.passes > 1 && rawProgress > 0.5 ? 1 - passProgress : passProgress;
      const jitter = Math.sin(warning.active * (7 + cameraDifficulty() * 9) + warning.jitterSeed) * (8 + cameraDifficulty() * 22);
      warning.beamX = warning.routeStart + (warning.routeEnd - warning.routeStart) * sweep + jitter;
    } else {
      warning.beamX = warning.targetX + Math.sin(warning.active * (2.4 + cameraDifficulty() * 1.8)) * (14 + cameraDifficulty() * 16);
    }

    if (cameraSeesDaphne()) {
      resolveCameraCheck(false);
      return;
    }

    if (warning.active > warning.activeDuration) {
      resolveCameraCheck(true);
    }
  }
}

function cameraSeesDaphne() {
  if (inSafeZone()) return false;
  const rect = playerRect();
  const px = rect.x + rect.w / 2;
  const py = rect.y + rect.h / 2;

  if (warning.zone === "tank") {
    if (warning.active < warning.escapeGrace && player.vx < -25) return false;
    if (px < tank.x - 70 && warning.active < warning.escapeGrace + 0.65) return false;
  }

  const cameraX = securityCamera.x + securityCamera.w / 2;
  const cameraY = securityCamera.y + securityCamera.h;
  const progress = clamp((py - cameraY) / (groundY - cameraY), 0, 1);
  const beamCenter = cameraX + (warning.beamX - cameraX) * progress;
  const halfWidth = warning.width * (0.55 + progress * 0.55);
  return Math.abs(px - beamCenter) < halfWidth;
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
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pixelRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
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
  drawCameraLight(t);
  drawPrompts();
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
  ctx.strokeStyle = "#4d403a";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(510, 96);
  ctx.lineTo(510, 72);
  ctx.stroke();
  ctx.fillStyle = "#806455";
  drawRoundedRect(408, 69, 204, 14, 5);
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
  ctx.fillRect(496, 254, 28, 24);
  ctx.fillStyle = "#3a2b25";
  ctx.fillRect(486, 278, 48, groundY - 278);
  ctx.fillStyle = "#765945";
  ctx.fillRect(430, groundY - 34, 160, 34);
  ctx.fillStyle = "#9a7056";
  ctx.fillRect(442, groundY - 25, 136, 10);

  drawSecurityCamera(t);
  drawHangingPlant(t);

  ctx.fillStyle = "rgba(255,255,255,0.28)";
}

function drawSecurityCamera(t) {
  const blink = warning ? Math.sin(t * 0.012) > 0 : false;
  pixelRect(securityCamera.x - 18, securityCamera.y - 18, 14, 42, "#6b4b3e");
  pixelRect(securityCamera.x - 28, securityCamera.y - 20, 28, 10, "#806455");
  pixelRect(securityCamera.x, securityCamera.y, securityCamera.w, securityCamera.h, "#2d3238");
  pixelRect(securityCamera.x + 8, securityCamera.y + 8, 42, 18, "#16191e");
  pixelRect(securityCamera.x + 48, securityCamera.y + 11, 12, 12, blink ? "#f04d45" : "#49c1be");
  pixelRect(securityCamera.x + 8, securityCamera.y + securityCamera.h, 52, 8, "#1e2228");
}

function drawHangingPlant(t) {
  const x = 1090;
  const y = 28;
  pixelRect(x + 28, y - 4, 6, 52, "#6b4b3e");
  pixelRect(x + 8, y + 48, 46, 16, "#9b6a4c");
  pixelRect(x + 14, y + 64, 34, 22, "#7b4f3b");
  const sway = Math.sin(t * 0.0015) > 0 ? 3 : 0;
  pixelRect(x, y + 42 + sway, 18, 22, "#4a9a5f");
  pixelRect(x + 20, y + 34, 16, 30, "#3e8d54");
  pixelRect(x + 40, y + 43 - sway, 18, 20, "#5aaa67");
  pixelRect(x + 12, y + 74, 12, 34, "#4a9a5f");
  pixelRect(x + 34, y + 76, 12, 28, "#3e8d54");
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
    const x = f.x + Math.sin(t * 0.001 * f.speed + f.phase) * 9;
    const y = f.y + Math.cos(t * 0.001 + f.phase) * 4;
    const body = f.body || f.color;
    const fin = f.fin || f.color;
    const dark = f.dark || "#1f2d35";

    pixelRect(x - 36, y - 16, 14, 10, fin);
    pixelRect(x - 45, y - 7, 22, 14, fin);
    pixelRect(x - 36, y + 7, 14, 10, fin);
    pixelRect(x - 28, y - 12, 12, 24, dark);
    pixelRect(x - 25, y - 18, 20, 10, fin);
    pixelRect(x - 9, y - 21, 20, 9, fin);
    pixelRect(x - 6, y + 9, 26, 12, fin);
    pixelRect(x - 15, y - 8, 31, 16, body);
    pixelRect(x + 13, y - 5, 15, 11, body);
    pixelRect(x + 25, y - 2, 6, 6, body);
    pixelRect(x + 15, y - 2, 3, 3, "#1f2d35");
    pixelRect(x - 2, y + 1, 11, 3, "rgba(255,255,255,0.25)");
  }

  ctx.fillStyle = "rgba(255,255,255,0.26)";
  for (let i = 0; i < 5; i++) {
    pixelRect(tank.x + 38 + i * 22, tank.y + 160 - ((t * 0.035 + i * 19) % 110), 6, 6, "rgba(255,255,255,0.26)");
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

function drawKeys(o) {
  pixelRect(o.x + 2, o.y + 8, 20, 12, "#20242b");
  pixelRect(o.x + 6, o.y + 4, 12, 5, "#303743");
  pixelRect(o.x + 8, o.y + 11, 4, 4, "#49c1be");
  pixelRect(o.x + 15, o.y + 11, 4, 4, "#f04d45");
  pixelRect(o.x + 24, o.y + 12, 32, 5, "#f0bd43");
  pixelRect(o.x + 52, o.y + 9, 8, 11, "#f0bd43");
  pixelRect(o.x + 61, o.y + 12, 15, 5, "#d99d2e");
  pixelRect(o.x + 72, o.y + 8, 5, 12, "#d99d2e");
  pixelRect(o.x + 30, o.y + 4, 15, 5, "#f5cf62");
  pixelRect(o.x + 40, o.y + 2, 5, 12, "#f5cf62");
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
  const bob = pr.onGround ? (Math.sin(pr.bob) > 0 ? 2 : 0) : 0;
  const y = pr.y + bob;
  const dir = pr.facing;
  const rect = playerRect();
  const overTankPlatform = rect.x + rect.w > tankPlatform.x + 8 && rect.x < tankPlatform.x + tankPlatform.w - 8;
  const shadowY = overTankPlatform && pr.y + pr.h <= tankPlatform.y + 90 ? tankPlatform.y : groundY;

  pixelRect(cx - 40, shadowY - 7, 82, 8, "rgba(43, 33, 28, 0.16)");

  ctx.save();
  ctx.translate(cx, y + 40);
  ctx.scale(dir, 1);
  ctx.translate(-cx, -y - 40);

  pixelRect(pr.x + 10, y + 34, 54, 32, "#8e9aa0");
  pixelRect(pr.x + 18, y + 25, 38, 17, "#a1abb0");
  pixelRect(pr.x + 30, y + 42, 24, 21, "#f7f2e8");
  pixelRect(pr.x + 14, y + 64, 20, 10, "#f7f2e8");
  pixelRect(pr.x + 52, y + 64, 20, 10, "#f7f2e8");

  pixelRect(pr.x - 4, y + 32, 12, 12, "#7c878e");
  pixelRect(pr.x - 14, y + 20, 12, 18, "#7c878e");
  pixelRect(pr.x - 20, y + 14, 10, 12, "#8e9aa0");

  pixelRect(pr.x + 54, y + 9, 36, 40, "#96a0a7");
  pixelRect(pr.x + 56, y - 8, 10, 18, "#96a0a7");
  pixelRect(pr.x + 78, y - 8, 10, 18, "#96a0a7");
  pixelRect(pr.x + 62, y + 31, 28, 14, "#fff5ed");
  pixelRect(pr.x + 64, y + 20, 8, 10, "#f5ba45");
  pixelRect(pr.x + 82, y + 20, 8, 10, "#f5ba45");
  pixelRect(pr.x + 67, y + 21, 3, 8, "#1f2428");
  pixelRect(pr.x + 85, y + 21, 3, 8, "#1f2428");
  pixelRect(pr.x + 61, y + 18, 5, 2, "#40332f");
  pixelRect(pr.x + 88, y + 18, 5, 2, "#40332f");
  pixelRect(pr.x + 61, y + 28, 5, 2, "#40332f");
  pixelRect(pr.x + 88, y + 28, 5, 2, "#40332f");
  pixelRect(pr.x + 76, y + 32, 7, 5, "#ef8a95");
  pixelRect(pr.x + 63, y + 36, 6, 4, "#f3b3b8");
  pixelRect(pr.x + 88, y + 36, 6, 4, "#f3b3b8");
  pixelRect(pr.x + 83, y + 38, 8, 3, "#40332f");

  ctx.restore();
}

function drawPrompts() {
  if (state !== "playing") return;
  if (nearTank()) {
    ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
    drawRoundedRect(790, 116, 310, 44, 8);
    ctx.fillStyle = "#2b211c";
    ctx.font = "900 22px system-ui";
    ctx.fillText("Press E to grab fish", 820, 145);
  }
  if (inSafeZone()) {
    ctx.fillStyle = "rgba(255, 250, 242, 0.86)";
    drawRoundedRect(35, 345, 176, 34, 8);
    ctx.fillStyle = "#2b211c";
    ctx.font = "800 17px system-ui";
    ctx.fillText("Safe in the box", 62, 368);
  }
}

function drawCameraLight(t) {
  if (!warning) return;
  const amount = warning.timer <= 0 ? 1 : warning.sweep;
  const active = warning.timer <= 0;
  const cameraX = securityCamera.x + securityCamera.w / 2;
  const cameraY = securityCamera.y + securityCamera.h;
  const beamX = active ? warning.beamX : cameraX;

  ctx.fillStyle = `rgba(58, 36, 30, ${0.02 + amount * 0.08})`;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = active ? "rgba(255, 232, 95, 0.32)" : "rgba(255, 232, 95, 0.16)";
  ctx.beginPath();
  ctx.moveTo(cameraX - 12, cameraY);
  const floorWidth = warning.width * 2.2;
  ctx.lineTo(beamX - floorWidth, groundY);
  ctx.lineTo(beamX + floorWidth, groundY);
  ctx.lineTo(cameraX + 12, cameraY);
  ctx.closePath();
  ctx.fill();

  if (active) {
    pixelRect(beamX - floorWidth + 8, groundY - 8, floorWidth * 2 - 16, 8, "rgba(255, 232, 95, 0.35)");
  }

  ctx.fillStyle = "rgba(255, 250, 242, 0.92)";
  drawRoundedRect(780, 86, 326, 48, 8);
  ctx.fillStyle = active ? "#8f211b" : "#6b4b16";
  ctx.font = "900 22px 'Courier New', monospace";
  ctx.fillText(active ? "CAMERA SCANNING!" : "camera warming up...", 812, 117);
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
  if (key === "arrowleft") setKey("left", true);
  if (key === "arrowright") setKey("right", true);
  if (key === "w" || key === "arrowup" || key === " ") jump();
  if (key === "e") grabFish();
  if (key === "r" && state === "gameover") resetGame(true);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft") setKey("left", false);
  if (key === "arrowright") setKey("right", false);
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
