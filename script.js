// === GAME VARIABLES ===
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let running = false;
let lastTS = 0;
let rafId;
let timeLeft = 60;
let score = 0;
let sunlightMeter = 0;
let superReady = false;

let player = { x: canvas.width / 2, y: canvas.height - 150, w: 80, h: 80 };
let drops = [];
let plants = [];
let pests = [];
let suns = [];

// === DOM ELEMENTS ===
const endScreen = document.getElementById("endScreen");
const startBtn = document.getElementById("startBtn");

// === START BUTTON HANDLER ===
startBtn.addEventListener("click", () => {
  document.getElementById("startDialog").style.display = "none";
  startGame();
});

// === START GAME FUNCTION ===
function startGame() {
  running = true;
  timeLeft = 60;
  score = 0;
  sunlightMeter = 0;
  superReady = false;
  lastTS = 0;
  drops = [];
  plants = [];
  pests = [];
  suns = [];
  spawnPlants();
  rafId = requestAnimationFrame(loop);
}

// === GAME LOOP ===
function loop(ts) {
  if (!running) return;

  const dt = (ts - lastTS) / 1000;
  lastTS = ts;

  update(dt);
  render();

  if (timeLeft <= 0) {
    gameOver();
    return;
  }

  rafId = requestAnimationFrame(loop);
}

// === GAME OVER ===
function gameOver() {
  running = false;
  cancelAnimationFrame(rafId);
  endScreen.style.display = "block"; // show Game Over + refresh button
}

// === REFRESH BUTTON HANDLER ===
document.getElementById("refreshBtn").addEventListener("click", function (e) {
  e.preventDefault();
  window.location.href = window.location.href; // reload URL
});

// === GAME LOGIC FUNCTIONS ===
function spawnPlants() {
  for (let i = 0; i < 5; i++) {
    plants.push({
      x: i * (canvas.width / 5) + 50,
      y: canvas.height - 200,
      w: 60,
      h: 60,
      health: 100
    });
  }
}

function update(dt) {
  timeLeft -= dt;

  // Move drops
  drops.forEach(drop => {
    drop.y -= drop.speed * dt;
  });
  drops = drops.filter(drop => drop.y > 0);

  // Check collisions with plants
  drops.forEach(drop => {
    plants.forEach(plant => {
      if (drop.x < plant.x + plant.w &&
          drop.x + drop.w > plant.x &&
          drop.y < plant.y + plant.h &&
          drop.h + drop.y > plant.y) {
        plant.health = Math.min(100, plant.health + 10);
        drop.remove = true;
        score += 10;
      }
    });
  });

  drops = drops.filter(drop => !drop.remove);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw player
  ctx.fillStyle = "blue";
  ctx.fillRect(player.x, player.y, player.w, player.h);

  // Draw plants
  ctx.fillStyle = "green";
  plants.forEach(p => {
    ctx.fillRect(p.x, p.y, p.w, p.h);
  });

  // Draw drops
  ctx.fillStyle = "aqua";
  drops.forEach(d => {
    ctx.fillRect(d.x, d.y, d.w, d.h);
  });

  // Draw score
  ctx.fillStyle = "black";
  ctx.font = "20px Arial";
  ctx.fillText("Score: " + score, 10, 30);
  ctx.fillText("Time: " + Math.ceil(timeLeft), 10, 60);
}

// === INPUT HANDLING ===
canvas.addEventListener("click", () => {
  drops.push({
    x: player.x + player.w / 2 - 5,
    y: player.y,
    w: 10,
    h: 10,
    speed: 300
  });
});
