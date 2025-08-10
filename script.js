// Completely block default touch gestures on the page
document.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });

/* script.js
   Full game logic.
*/

// --- Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- UI elements
const startDialog = document.getElementById('startDialog');
const startBtn = document.getElementById('startBtn');
const loaderText = document.getElementById('loaderText');
const endScreen = document.getElementById('endScreen');

// --- Asset list
const ASSETS = {
  Front: 'Front.png',
  Back: 'Back.PNG',
  Health: 'Health.PNG',
  Dead: 'Dead.PNG',
  Bg: 'Bg.png',
  Sun: 'sun.png'
};

// --- Web sounds
const ORB_SPAWN_URL = 'https://actions.google.com/sounds/v1/cartoon/pop.ogg';
const ORB_COLLECT_URL = 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg';

// Preload Image storage
const imgs = {};
let assetsTotal = Object.keys(ASSETS).length;
let assetsLoaded = 0;

// Preload images with progress
function preloadAssets() {
  return new Promise((resolve) => {
    assetsLoaded = 0;
    Object.entries(ASSETS).forEach(([key, path]) => {
      const img = new Image();
      img.onload = () => { imgs[key] = img; assetsLoaded++; updateLoader(); if (assetsLoaded === assetsTotal) resolve(); };
      img.onerror = () => { imgs[key] = null; assetsLoaded++; updateLoader(); if (assetsLoaded === assetsTotal) resolve(); };
      img.src = path;
    });
  });
}

function updateLoader() {
  const pct = Math.round((assetsLoaded / assetsTotal) * 100);
  loaderText.textContent = `Loading assets... ${pct}%`;
}

// --- Sounds
const audioOrbSpawn = new Audio(ORB_SPAWN_URL);
const audioOrbCollect = new Audio(ORB_COLLECT_URL);

// WebAudio splash
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;
function playSplash(volume = 0.16, freq = 700, dur = 0.26) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  g.gain.setValueAtTime(volume, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

// --- Game state
let running = false;
let lastTS = 0;
let rafId = 0;

let timeLeft = 60.0; // seconds
let score = 0;

const player = {
  x: window.innerWidth / 2,
  y: window.innerHeight - 135,
  w: 120, h: 140,
  dir: 'back',
  targetX: window.innerWidth / 2,
  ease: 0.16
};

const plants = [];
const drops = [];
let orb = null;
let lastOrbTime = 0;
let sunlightMeter = 0;
let superReady = false;
const particles = [];

// Utility
function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// --- Plants
function spawnPlants() {
  plants.length = 0;
  const count = 5;
  const margin = 80;
  const minDistance = 120;
  for (let i = 0; i < count; i++) {
    let px, py, safe;
    let tries = 0;
    do {
      px = margin + Math.random() * (canvas.width - margin * 2);
      py = canvas.height * 0.35 + Math.random() * canvas.height * 0.18;
      safe = plants.every(p => Math.hypot(p.x - px, p.y - py) >= minDistance);
      tries++;
    } while (!safe && tries < 50);
    plants.push({ x: px, y: py, w: 110, h: 78, thirst: 100, alive: true, grow: 0 });
  }
}

// --- Input handling
let touchStart = null;
canvas.addEventListener('touchstart', e => { touchStart = e.touches[0]; }, { passive: true });
canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  handleSwipe(t.clientX, t.clientY, touchStart.clientX, touchStart.clientY);
  touchStart = null;
}, { passive: true });

let mouseDown = null;
canvas.addEventListener('mousedown', e => { mouseDown = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('mouseup', e => {
  if (!mouseDown) return;
  handleSwipe(e.clientX, e.clientY, mouseDown.x, mouseDown.y);
  mouseDown = null;
});

function handleSwipe(endX, endY, startX, startY) {
  const dx = endX - startX, dy = endY - startY;
  if (Math.abs(dy) < 50 && Math.abs(dx) > 20 && startY > (canvas.height - 180)) {
    player.targetX = clamp(player.x + dx, 80, canvas.width - 80);
    return;
  }
  if (dy < -28) {
    if (superReady) {
      plants.forEach(p => { if (p.alive) { p.thirst = 100; p.grow = 1; } });
      sunlightMeter = 0; superReady = false;
      for (let p of plants) {
        for (let i = 0; i < 28; i++) particles.push({
          x: p.x + (Math.random() - 0.5) * 80,
          y: p.y + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6,
          life: 800
        });
      }
      playSplash(0.44, 380, 0.6);
      score += 24;
    } else {
      player.dir = 'front';
      setTimeout(() => player.dir = 'back', 220);
      drops.push({
        x: player.x,
        y: player.y,
        vx: (dx / 18) * 1.6,
        vy: (dy / 36) * 1.6,
        life: 4500
      });
    }
  }
}

function dropHitsPlant(d, p) {
  const px = p.x - p.w / 2, py = p.y - p.h / 2;
  return d.x > px && d.x < px + p.w && d.y > py && d.y < py + p.h;
}

function spawnOrb() {
  if (orb) return;
  const ox = 80 + Math.random() * (canvas.width - 160);
  orb = { x: ox, y: -12, r: 14, vy: 2.6 };
  lastOrbTime = performance.now();
  try { audioOrbSpawn.play(); } catch (e) {}
}

// --- Game control
function startGame() {
  spawnPlants();
  timeLeft = 60;
  score = 0;
  sunlightMeter = 0;
  superReady = false;
  drops.length = 0;
  particles.length = 0;
  orb = null;
  player.x = canvas.width / 2;
  player.targetX = player.x;
  running = true;
  lastTS = 0;
  lastOrbTime = performance.now() - 3000;
  rafId = requestAnimationFrame(loop);
}

function gameOver() {
  running = false;
  cancelAnimationFrame(rafId);
  endScreen.style.display = 'block';
}

// --- Update particles
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// --- Main loop
function loop(ts) {
  if (!lastTS) lastTS = ts;
  const dt = ts - lastTS;
  lastTS = ts;

  if (running) {
    player.x += (player.targetX - player.x) * player.ease;

    // Update drops
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.x += d.vx; d.y += d.vy; d.vy += 0.28; d.life -= dt;
      let hit = false;
      for (let p of plants) {
        if (p.alive && dropHitsPlant(d, p)) {
          p.thirst = 100; p.grow = 1; score += 6;
          for (let k = 0; k < 10; k++) particles.push({
            x: d.x + (Math.random() - 0.5) * 18,
            y: d.y + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3,
            life: 380
          });
          playSplash(0.16, 700 - Math.random() * 200, 0.26);
          hit = true;
          break;
        }
      }
      if (hit || d.y > canvas.height + 80 || d.life <= 0) drops.splice(i, 1);
    }

    // Update orb
    if (orb) {
      orb.y += orb.vy;
      if (orb.y > canvas.height - 220 && Math.abs(orb.x - player.x) < 60) {
        sunlightMeter = clamp(sunlightMeter + 28, 0, 100);
        if (sunlightMeter >= 100) { sunlightMeter = 100; superReady = true; }
        for (let i = 0; i < 12; i++) particles.push({
          x: orb.x + (Math.random() - 0.5) * 16,
          y: orb.y + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 320
        });
        try { audioOrbCollect.play(); } catch (e) {}
        orb = null;
      } else if (orb.y > canvas.height - 60) {
        for (let p of plants) if (p.alive) p.thirst = Math.max(0, p.thirst - 10);
        orb = null;
      }
    } else if (performance.now() - lastOrbTime > 5000) {
      spawnOrb();
    }

    updateParticles(dt);

    // Update plants
    for (let p of plants) {
      if (!p.alive) continue;
      p.thirst = Math.max(0, p.thirst - (3.2 * dt / 1000));
      if (p.thirst <= 0) { p.alive = false; p.thirst = 0; }
      if (p.grow > 0) p.grow = Math.max(0, p.grow - (dt / 600));
    }

    timeLeft -= dt / 1000;
    if (timeLeft <= 0) gameOver();
  }

  drawScene();
  if (running) rafId = requestAnimationFrame(loop);
}

// --- Drawing ---
function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (imgs.Bg) ctx.drawImage(imgs.Bg, 0, 0, canvas.width, canvas.height);

  // Plants
  for (let p of plants) {
    if (!p.alive) {
      if (imgs.Dead) ctx.drawImage(imgs.Dead, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    } else {
      if (imgs.Health) ctx.drawImage(imgs.Health, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
    }
  }

  // Drops
  ctx.fillStyle = 'rgba(0,0,255,0.5)';
  for (let d of drops) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Orb
  if (orb) {
    if (imgs.Sun) {
      ctx.drawImage(imgs.Sun, orb.x - 20, orb.y - 20, 40, 40);
    } else {
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player
  const img = player.dir === 'back' ? imgs.Back : imgs.Front;
  if (img) ctx.drawImage(img, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h);

  // Particles
  ctx.fillStyle = 'rgba(255,255,0,0.8)';
  for (let p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // UI
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.fillText(`Score: ${score}`, 20, 30);
  ctx.fillText(`Time: ${Math.ceil(timeLeft)}`, 20, 60);
  ctx.fillText(`Sunlight: ${Math.floor(sunlightMeter)}%`, 20, 90);
}

// --- Boot ---
preloadAssets().then(() => {
  loaderText.textContent = 'Assets ready';
  startBtn.disabled = false;
  startBtn.textContent = 'Start Game';
});

startBtn.addEventListener('click', () => {
  startDialog.style.display = 'none';
  endScreen.style.display = 'none';
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  startGame();
});

endScreen.addEventListener('click', () => {
  endScreen.style.display = 'none';
  startGame();
});

// Prevent touch scrolling on canvas
document.body.addEventListener("touchstart", e => {
    if (e.target.tagName.toLowerCase() === 'canvas') e.preventDefault();
}, { passive: false });
document.body.addEventListener("touchmove", e => {
    if (e.target.tagName.toLowerCase() === 'canvas') e.preventDefault();
}, { passive: false });
