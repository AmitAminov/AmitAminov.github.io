/* ============================================================
   leaves.js — scroll-driven falling-leaves layer
   Amit Aminov · nature-science site

   Vanilla JS, zero dependencies, zero network. A single fixed
   full-viewport <canvas> painted with procedurally-drawn leaves
   in the site's autumn + moss palette.

   Motion model
     Each leaf has a gentle constant fall + horizontal sway (sine)
     + spin + flutter. A single smoothed "scroll energy" value
     couples the whole field to the reader's scroll: scrolling DOWN
     injects downward velocity (leaves visibly fall), scrolling UP
     eases them, and when the reader is idle the energy decays back
     to a slow ambient drift. The coupling is exponentially smoothed
     so it reads as organic momentum, never 1:1 jitter.

   Accessibility / performance
     - prefers-reduced-motion: reduce  → layer stays empty, no rAF.
     - pointer-events:none always (never blocks clicks).
     - rAF pauses when the tab is hidden (visibilitychange).
     - devicePixelRatio capped at 2 for crispness without cost.
     - leaf count throttled on small screens; resize is debounced.
   ============================================================ */

(function () {
  "use strict";

  // Bail early + irreversibly if the reader asked for reduced motion.
  // Default for reduced-motion is: no falling animation at all.
  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  if (reduceMotion && reduceMotion.matches) return;

  var layer = document.getElementById("leaf-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "leaf-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }

  var canvas = document.createElement("canvas");
  layer.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  // ---- palette (site autumn + moss) --------------------------------
  var PALETTE = [
    "#a8431a", // rust
    "#c65d22", // pumpkin
    "#de8a22", // amber
    "#6e9f42", // moss
    "#7a4b24" // brown
  ];

  // ---- viewport / dpr state ----------------------------------------
  var W = 0;
  var H = 0;
  var dpr = 1;

  function measure() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Tasteful density: "some leaves", not a blizzard.
  // Desktop ~14-22, mobile ~8-10, scaled gently by width.
  function targetCount() {
    if (W <= 700) return 9;
    // 14 at ~800px climbing to ~22 on wide desktops
    var n = Math.round(14 + (W - 800) / 130);
    return Math.max(14, Math.min(22, n));
  }

  // ---- leaf shapes (unit paths, drawn centered on origin) ----------
  // Silhouettes stay stylized: at 12-26px on screen fine detail is
  // invisible, so a clean readable leaf beats botanical accuracy.
  function pathAlmond(c) {
    // slender birch/willow leaf
    c.moveTo(0, -1);
    c.bezierCurveTo(0.62, -0.5, 0.5, 0.55, 0, 1);
    c.bezierCurveTo(-0.5, 0.55, -0.62, -0.5, 0, -1);
  }

  function pathRound(c) {
    // rounder poplar/aspen leaf
    c.moveTo(0, -1);
    c.bezierCurveTo(0.9, -0.55, 0.78, 0.7, 0, 1);
    c.bezierCurveTo(-0.78, 0.7, -0.9, -0.55, 0, -1);
  }

  function pathMaple(c) {
    // stylized 5-lobe maple (right half + mirrored implicitly by points)
    var pts = [
      [0, -1.0],
      [0.2, -0.46],
      [0.62, -0.6],
      [0.4, -0.12],
      [0.9, 0.05],
      [0.44, 0.26],
      [0.58, 0.66],
      [0.18, 0.44],
      [0.1, 0.98],
      [0, 0.66],
      [-0.1, 0.98],
      [-0.18, 0.44],
      [-0.58, 0.66],
      [-0.44, 0.26],
      [-0.9, 0.05],
      [-0.4, -0.12],
      [-0.62, -0.6],
      [-0.2, -0.46]
    ];
    // Smooth the closed 18-point outline with quadratic curves through the
    // segment midpoints (Catmull-Rom-ish). At 12-26px the sharp lineTo version
    // read as a spiky asterisk/sparkle; rounding the lobes makes it register as
    // a small maple leaf while keeping the 5-lobe silhouette.
    var n = pts.length;
    var mid = function (a, b) {
      return [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2];
    };
    var start = mid(n - 1, 0);
    c.moveTo(start[0], start[1]);
    for (var i = 0; i < n; i++) {
      var next = mid(i, (i + 1) % n);
      c.quadraticCurveTo(pts[i][0], pts[i][1], next[0], next[1]);
    }
  }

  var SHAPES = [pathAlmond, pathRound, pathMaple, pathAlmond, pathRound];

  // ---- leaf field ---------------------------------------------------
  var leaves = [];

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function makeLeaf(seedTop) {
    // depth 0..1 — deeper leaves are smaller, fainter, slower (parallax)
    var depth = Math.random();
    var size = rand(6, 15) * (0.55 + depth * 0.9); // half-extent px
    return {
      x: rand(0, W),
      y: seedTop ? rand(-H * 0.4, -10) : rand(-H * 0.2, H),
      depth: depth,
      size: size,
      color: PALETTE[(Math.random() * PALETTE.length) | 0],
      shape: SHAPES[(Math.random() * SHAPES.length) | 0],
      opacity: 0.32 + depth * 0.4, // 0.32..0.72 — subtle so text stays legible
      baseFall: rand(14, 26) * (0.5 + depth), // px/sec ambient drift
      swayAmp: rand(14, 42) * (0.5 + depth), // px lateral
      swayFreq: rand(0.25, 0.6), // Hz-ish
      swayPhase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      spin: rand(-0.7, 0.7) * (0.4 + depth), // rad/sec
      flutter: rand(0.6, 1.4), // per-leaf flutter multiplier
      wobble: rand(0, Math.PI * 2)
    };
  }

  function build() {
    var n = targetCount();
    leaves.length = 0;
    for (var i = 0; i < n; i++) leaves.push(makeLeaf(false));
  }

  // ---- scroll coupling ---------------------------------------------
  // scrollEnergy is an eased, decaying reservoir of downward momentum.
  // Down-scroll fills it; it bleeds off every frame, so the field
  // surges as you scroll and settles smoothly when you stop.
  var scrollEnergy = 0; // >=0, drives extra fall speed
  var lastScrollY = window.pageYOffset || 0;

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dy = y - lastScrollY;
    lastScrollY = y;
    if (dy > 0) {
      // scrolling down releases energy (capped so a fling stays graceful)
      scrollEnergy += Math.min(dy, 90) * 0.9;
    } else if (dy < 0) {
      // scrolling up eases the field rather than driving it
      scrollEnergy += dy * 0.25; // dy<0 → gently drains
    }
    if (scrollEnergy < 0) scrollEnergy = 0;
    if (scrollEnergy > 260) scrollEnergy = 260;
  }

  // ---- draw one leaf ------------------------------------------------
  function drawLeaf(l) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.scale(l.size, l.size);
    ctx.globalAlpha = l.opacity;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    l.shape(ctx);
    ctx.closePath();
    ctx.fill();
    // midrib vein — thin darker line for a touch of realism
    ctx.globalAlpha = l.opacity * 0.5;
    ctx.strokeStyle = "rgba(20,22,12,0.9)";
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(0, -0.85);
    ctx.lineTo(0, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  // ---- animation loop ----------------------------------------------
  var running = false;
  var lastT = 0;

  function frame(t) {
    if (!running) return;
    if (!lastT) lastT = t;
    var dt = (t - lastT) / 1000; // seconds
    lastT = t;
    if (dt > 0.05) dt = 0.05; // clamp after a tab-switch / long stall

    // bleed the scroll reservoir toward calm ambient drift
    scrollEnergy *= Math.pow(0.12, dt); // ~exp decay, half-life ~0.33s
    if (scrollEnergy < 0.05) scrollEnergy = 0;

    ctx.clearRect(0, 0, W, H);

    var now = t / 1000;
    for (var i = 0; i < leaves.length; i++) {
      var l = leaves[i];
      // vertical: ambient fall + scroll-coupled surge (parallax weighted)
      var vy = l.baseFall + scrollEnergy * (0.35 + l.depth * 0.65);
      l.y += vy * dt;

      // horizontal sway (sine) + a slower flutter wobble
      l.wobble += dt * l.flutter;
      var sway =
        Math.sin(now * l.swayFreq * Math.PI * 2 + l.swayPhase) * l.swayAmp;
      var flutter = Math.cos(l.wobble) * l.swayAmp * 0.18;
      l.x += (sway + flutter) * dt;

      // spin, subtly energized by scroll
      l.rot += (l.spin + scrollEnergy * 0.002) * dt;

      // respawn at the top once fully past the bottom edge
      if (l.y - l.size > H + 8) {
        l.y = -l.size - rand(4, H * 0.25);
        l.x = rand(-20, W + 20);
        l.swayPhase = rand(0, Math.PI * 2);
      }
      // keep horizontal drift on-screen (wrap)
      if (l.x < -30) l.x = W + 20;
      else if (l.x > W + 30) l.x = -20;

      drawLeaf(l);
    }

    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  // ---- lifecycle wiring --------------------------------------------
  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.hidden) stop();
      else start();
    },
    false
  );

  window.addEventListener("scroll", onScroll, { passive: true });

  var resizeTimer = null;
  window.addEventListener(
    "resize",
    function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        measure();
        build();
      }, 180);
    },
    false
  );

  // If the user flips the reduced-motion preference on at runtime, halt.
  if (reduceMotion && reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", function (e) {
      if (e.matches) {
        stop();
        ctx.clearRect(0, 0, W, H);
      } else {
        start();
      }
    });
  }

  // ---- go -----------------------------------------------------------
  measure();
  build();
  start();
})();
