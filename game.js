/* ============================================================
   🚀 Space Dodger — game.js
   Dependency-free HTML5 canvas game (vanilla JS, ES2020).
   Wrapped in an IIFE. requestAnimationFrame loop.
   ============================================================ */
(() => {
  "use strict";

  /* ---------------------- Configuration ---------------------- */
  const CONFIG = {
    bestKey: "spaceDodgerBest",
    ship: {
      width: 46,
      height: 54,
      speed: 560, // px/s keyboard
      radius: 15, // collision radius (fairness)
    },
    startSpawnInterval: 1.15, // seconds between spawns at t=0
    minSpawnInterval: 0.34,
    spawnRamp: 0.020, // interval shrink per second
    baseMeteorSpeed: 165, // px/s
    speedRamp: 8.5, // speed gain per second of play
    meteorSpeedVar: 0.32, // +/- random factor
    startMeteorRadius: 18,
    endMeteorRadius: 34,
    scoreRate: 14, // points per second survived
    nearMissBonus: 30,
    nearMissBuffer: 28,
    shakeDecay: 36, // magnitude units per second
    maxDt: 0.05,
  };

  /* ---------------------- DOM refs --------------------------- */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const timeEl = document.getElementById("time");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const playBtn = document.getElementById("play-btn");
  const statsEl = document.getElementById("stats");
  const finalScoreEl = document.getElementById("final-score");
  const finalBestEl = document.getElementById("final-best");
  const newBestEl = document.getElementById("new-best");

  /* ---------------------- Canvas sizing ---------------------- */
  let W = window.innerWidth;
  let H = window.innerHeight;
  let DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (ship) {
      ship.y = H - 96;
      ship.x = clamp(ship.x, shipHalfW(), W - shipHalfW());
    }
  }

  function shipHalfW() {
    return CONFIG.ship.width / 2;
  }

  /* ---------------------- Utilities -------------------------- */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function rand(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }
  function randi(lo, hi) {
    return Math.floor(rand(lo, hi + 1));
  }

  /* ---------------------- Game state ------------------------- */
  let state = "menu"; // 'menu' | 'playing' | 'over'
  let ship = null;
  let meteors = [];
  let particles = [];
  let stars = [];
  let score = 0;
  let best = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let spawnInterval = CONFIG.startSpawnInterval;
  let meteorSpeed = CONFIG.baseMeteorSpeed;
  let shake = 0;
  let newBest = false;
  let lastTime = 0;

  /* ---------------------- Input ------------------------------ */
  const keys = { left: false, right: false };
  let pointerX = W / 2;
  let pointerActive = false;
  let usingKeyboard = false;

  function onKeyDown(e) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") {
      keys.left = true;
      usingKeyboard = true;
    } else if (k === "ArrowRight" || k === "d" || k === "D") {
      keys.right = true;
      usingKeyboard = true;
    } else if (k === " " || k === "Enter") {
      if (state !== "playing") startGame();
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") keys.left = false;
    else if (k === "ArrowRight" || k === "d" || k === "D") keys.right = false;
  }
  function onPointerMove(clientX) {
    pointerX = clamp(clientX, 0, W);
    pointerActive = true;
    usingKeyboard = false;
  }
  function onMouseMove(e) {
    onPointerMove(e.clientX);
  }
  function onTouchMove(e) {
    if (e.touches && e.touches.length) {
      onPointerMove(e.touches[0].clientX);
      e.preventDefault();
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("resize", resize);

  playBtn.addEventListener("click", () => startGame());

  /* ---------------------- Background stars ------------------- */
  function buildStars() {
    stars = [];
    const count = Math.floor((W * H) / 5200);
    for (let i = 0; i < count; i++) {
      const layer = Math.random();
      stars.push({
        fx: Math.random(),
        fy: Math.random(),
        speed: 0.015 + layer * 0.07,
        size: 0.6 + layer * 1.8,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.5 + Math.random() * 1.5,
        hue: Math.random() < 0.25 ? "cyan" : Math.random() < 0.5 ? "violet" : "white",
      });
    }
  }

  const STAR_COLORS = {
    white: "255,255,255",
    cyan: "120,230,255",
    violet: "190,150,255",
  };

  function updateStars(dt) {
    for (const s of stars) {
      s.fy += s.speed * dt;
      if (s.fy > 1) {
        s.fy -= 1;
        s.fx = Math.random();
      }
      s.phase += s.twinkle * dt;
    }
  }

  function drawStars() {
    for (const s of stars) {
      const x = s.fx * W;
      const y = s.fy * H;
      const a = 0.45 + 0.45 * Math.sin(s.phase);
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + STAR_COLORS[s.hue] + "," + a.toFixed(3) + ")";
      ctx.arc(x, y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------------- Particles -------------------------- */
  function spawnParticle(x, y, vx, vy, life, size, color) {
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  function emitShipTrail() {
    if (!ship) return;
    const bx = ship.x + rand(-4, 4);
    const by = ship.y + CONFIG.ship.height / 2 - 4;
    spawnParticle(bx, by, rand(-20, 20), rand(40, 90), 0.45, rand(2, 4), "34,211,238");
  }

  function emitNearMissSparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(60, 220);
      spawnParticle(
        x,
        y,
        Math.cos(ang) * sp,
        Math.sin(ang) * sp,
        rand(0.3, 0.6),
        rand(1.5, 3.5),
        Math.random() < 0.5 ? "34,211,238" : "255,255,255"
      );
    }
  }

  function emitExplosion(x, y) {
    const colors = ["251,113,133", "251,191,36", "255,255,255", "168,85,247"];
    for (let i = 0; i < 46; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(80, 420);
      spawnParticle(
        x,
        y,
        Math.cos(ang) * sp,
        Math.sin(ang) * sp,
        rand(0.5, 1.1),
        rand(2, 5),
        colors[randi(0, colors.length - 1)]
      );
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 60 * dt; // slight gravity
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + p.color + "," + a.toFixed(3) + ")";
      ctx.shadowColor = "rgba(" + p.color + ",0.9)";
      ctx.shadowBlur = 12;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------- Ship ------------------------------- */
  function createShip() {
    return {
      x: W / 2,
      y: H - 96,
      tilt: 0,
    };
  }

  function updateShip(dt) {
    if (usingKeyboard && (keys.left || keys.right)) {
      let dir = 0;
      if (keys.left) dir -= 1;
      if (keys.right) dir += 1;
      ship.x += dir * CONFIG.ship.speed * dt;
      ship.tilt = dir * 0.28;
    } else if (pointerActive) {
      const target = pointerX;
      const diff = target - ship.x;
      ship.x += diff * Math.min(1, dt * 12);
      ship.tilt = clamp(diff * 0.02, -0.32, 0.32);
    } else {
      ship.tilt *= 0.9;
    }
    ship.x = clamp(ship.x, shipHalfW(), W - shipHalfW());

    // engine trail
    if (Math.random() < 0.9) emitShipTrail();
  }

  function drawShip() {
    const { width: w, height: h } = CONFIG.ship;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.tilt);

    // Engine glow
    const glow = ctx.createRadialGradient(0, h / 2 - 4, 0, 0, h / 2 - 4, 26);
    glow.addColorStop(0, "rgba(34,211,238,0.9)");
    glow.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, h / 2 - 4, 24, 0, Math.PI * 2);
    ctx.fill();

    // Body gradient
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, "#bdf6ff");
    body.addColorStop(0.45, "#22d3ee");
    body.addColorStop(1, "#7c3aed");

    ctx.shadowColor = "rgba(34,211,238,0.9)";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.lineTo(0, h / 2 - 12);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = body;
    ctx.fill();

    // Cockpit
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.ellipse(0, -h / 6, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing accents
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 6);
    ctx.lineTo(0, h / 2 - 14);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------------- Meteors ---------------------------- */
  function spawnMeteor() {
    const r = rand(CONFIG.startMeteorRadius, CONFIG.endMeteorRadius);
    const x = rand(r + 4, W - r - 4);
    const vy = meteorSpeed * rand(1 - CONFIG.meteorSpeedVar, 1 + CONFIG.meteorSpeedVar);
    const vx = rand(-40, 40);
    const verts = randi(7, 11);
    const shape = [];
    for (let i = 0; i < verts; i++) {
      shape.push(rand(0.72, 1.08));
    }
    meteors.push({
      x,
      y: -r - 6,
      vx,
      vy,
      r,
      rotation: rand(0, Math.PI * 2),
      rotationSpeed: rand(-1.4, 1.4),
      shape,
      verts,
      nearMissed: false,
      hue: Math.random() < 0.5 ? "251,113,133" : "251,146,60",
    });
  }

  function updateMeteors(dt) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.rotation += m.rotationSpeed * dt;

      // wrap horizontally if drifting off-edge
      if (m.x < -m.r) m.x = W + m.r;
      else if (m.x > W + m.r) m.x = -m.r;

      // collision & near-miss with ship
      if (ship) {
        const dx = m.x - ship.x;
        const dy = m.y - ship.y;
        const dist = Math.hypot(dx, dy);
        const touch = m.r + CONFIG.ship.radius;
        if (dist < touch) {
          gameOver();
          return;
        }
        if (!m.nearMissed && dist < touch + CONFIG.nearMissBuffer) {
          m.nearMissed = true;
          score += CONFIG.nearMissBonus;
          shake = Math.max(shake, 7);
          emitNearMissSparks(ship.x, ship.y);
        }
      }

      // remove off-screen
      if (m.y - m.r > H + 20) {
        meteors.splice(i, 1);
      }
    }
  }

  function drawMeteors() {
    for (const m of meteors) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rotation);

      const grad = ctx.createRadialGradient(
        -m.r * 0.3,
        -m.r * 0.3,
        m.r * 0.2,
        0,
        0,
        m.r
      );
      grad.addColorStop(0, "rgba(255,235,200,0.95)");
      grad.addColorStop(0.4, "rgba(" + m.hue + ",0.95)");
      grad.addColorStop(1, "rgba(40,12,20,1)");

      ctx.shadowColor = "rgba(" + m.hue + ",0.85)";
      ctx.shadowBlur = 18;

      ctx.beginPath();
      for (let i = 0; i <= m.verts; i++) {
        const idx = i % m.verts;
        const ang = (idx / m.verts) * Math.PI * 2;
        const rr = m.r * m.shape[idx];
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // crater detail
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.arc(m.r * 0.25, m.r * 0.1, m.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-m.r * 0.3, m.r * 0.3, m.r * 0.14, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ---------------------- Difficulty ------------------------- */
  function updateDifficulty() {
    spawnInterval = Math.max(
      CONFIG.minSpawnInterval,
      CONFIG.startSpawnInterval - elapsed * CONFIG.spawnRamp
    );
    meteorSpeed = CONFIG.baseMeteorSpeed + elapsed * CONFIG.speedRamp;
  }

  /* ---------------------- HUD -------------------------------- */
  function updateHud() {
    scoreEl.textContent = Math.floor(score).toLocaleString();
    bestEl.textContent = Math.floor(best).toLocaleString();
    timeEl.textContent = elapsed.toFixed(1) + "s";
  }

  /* ---------------------- Best score ------------------------- */
  function loadBest() {
    try {
      const v = parseInt(localStorage.getItem(CONFIG.bestKey), 10);
      best = Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      best = 0;
    }
  }
  function saveBest() {
    try {
      localStorage.setItem(CONFIG.bestKey, String(Math.floor(best)));
    } catch (e) {
      /* ignore (e.g. private mode) */
    }
  }

  /* ---------------------- Flow ------------------------------- */
  function startGame() {
    ship = createShip();
    meteors = [];
    particles = [];
    score = 0;
    elapsed = 0;
    spawnTimer = 0;
    spawnInterval = CONFIG.startSpawnInterval;
    meteorSpeed = CONFIG.baseMeteorSpeed;
    shake = 0;
    newBest = false;
    state = "playing";
    overlay.classList.add("hidden");
    updateHud();
  }

  function gameOver() {
    if (state !== "playing") return;
    state = "over";
    shake = Math.max(shake, 20);
    emitExplosion(ship.x, ship.y);

    const finalScore = Math.floor(score);
    if (finalScore > best) {
      best = finalScore;
      newBest = true;
      saveBest();
    }

    overlayTitle.textContent = "Game Over";
    overlayText.textContent = newBest
      ? "Incredible run! You set a brand-new record. Can you push it further?"
      : "The meteor storm got you. Jump back in and try to beat your best!";
    finalScoreEl.textContent = finalScore.toLocaleString();
    finalBestEl.textContent = Math.floor(best).toLocaleString();
    statsEl.classList.remove("hidden");
    newBestEl.classList.toggle("hidden", !newBest);
    playBtn.textContent = "Play Again";
    overlay.classList.remove("hidden");
    updateHud();
  }

  function showMenu() {
    state = "menu";
    overlayTitle.textContent = "Space Dodger";
    overlayText.textContent =
      "Pilot your glowing ship through an endless meteor storm. The longer you survive, the higher you score.";
    statsEl.classList.add("hidden");
    newBestEl.classList.add("hidden");
    playBtn.textContent = "Play";
    overlay.classList.remove("hidden");
  }

  /* ---------------------- Update / Render -------------------- */
  function update(dt) {
    updateStars(dt);
    updateParticles(dt);

    if (state === "playing") {
      elapsed += dt;
      score += dt * CONFIG.scoreRate;
      updateDifficulty();
      updateShip(dt);

      spawnTimer += dt;
      while (spawnTimer >= spawnInterval) {
        spawnTimer -= spawnInterval;
        spawnMeteor();
        // occasional extra meteor at higher difficulty
        if (elapsed > 25 && Math.random() < 0.35) spawnMeteor();
      }

      updateMeteors(dt);
      updateHud();
    }

    if (shake > 0) {
      shake = Math.max(0, shake - dt * CONFIG.shakeDecay);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) {
      const sx = rand(-shake, shake);
      const sy = rand(-shake, shake);
      ctx.translate(sx, sy);
    }

    drawStars();

    if (state === "playing" || state === "over") {
      drawMeteors();
      drawParticles();
      if (state === "playing") drawShip();
    } else {
      drawParticles();
    }

    ctx.restore();
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > CONFIG.maxDt) dt = CONFIG.maxDt;
    if (dt < 0) dt = 0;

    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ---------------------- Boot ------------------------------- */
  function init() {
    resize();
    buildStars();
    loadBest();
    showMenu();
    updateHud();
    requestAnimationFrame(frame);
  }

  init();
})();
