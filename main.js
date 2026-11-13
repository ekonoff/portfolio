/* RESONANCE — animated mesh-gradient hero + silent waveform visualization.
   The spectrum is synthesized as visual data only; this script never produces audio. */
(() => {
  document.documentElement.classList.add('js');           // gate reveal-hiding on JS presence
  const docEl = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;

  /* ---------- palette (kept in sync with styles.css) ---------- */
  const BG = '#06171f';
  const BLOBS = [
    { col: [255, 179,  71], cx: 0.30, cy: 0.34, ax: 0.16, ay: 0.12, sx: 0.13, sy: 0.19, ph: 0.0, base: 0.44, react: 0.30, band: [0.00, 0.10], core: 0.42 },
    { col: [ 63, 224, 208], cx: 0.72, cy: 0.40, ax: 0.18, ay: 0.14, sx: 0.17, sy: 0.11, ph: 1.7, base: 0.40, react: 0.32, band: [0.10, 0.24], core: 0.40 },
    { col: [ 20, 118, 132], cx: 0.52, cy: 0.70, ax: 0.20, ay: 0.16, sx: 0.09, sy: 0.15, ph: 3.1, base: 0.52, react: 0.24, band: [0.24, 0.42], core: 0.50 },
    { col: [255, 208, 138], cx: 0.84, cy: 0.78, ax: 0.14, ay: 0.13, sx: 0.21, sy: 0.13, ph: 4.4, base: 0.30, react: 0.30, band: [0.42, 0.62], core: 0.34 },
    { col: [ 47, 184, 173], cx: 0.16, cy: 0.74, ax: 0.15, ay: 0.14, sx: 0.15, sy: 0.23, ph: 5.6, base: 0.28, react: 0.26, band: [0.62, 0.90], core: 0.30 },
  ];

  /* ---------- visual-only spectrum buffers ---------- */
  const BINS = 512;
  const freq = new Uint8Array(BINS);
  const wave = new Uint8Array(BINS);

  /* ---------- feature detection ---------- */
  const canvasOK = !!document.createElement('canvas').getContext;

  /* ---------- synthetic sources (alive but silent) ---------- */
  function synthSpectrum(t) {
    for (let i = 0; i < BINS; i++) {
      const f = i / BINS;
      let e = Math.pow(1 - f, 1.7) * 0.5;                                   // pink-ish falloff
      e += 0.34 * bump(f, 0.09 + 0.05 * Math.sin(t * 0.31),        0.045) * (0.6 + 0.4 * Math.sin(t * 0.90));
      e += 0.26 * bump(f, 0.22 + 0.06 * Math.sin(t * 0.23 + 1.3),  0.060) * (0.6 + 0.4 * Math.sin(t * 0.62 + 2.0));
      e += 0.20 * bump(f, 0.40 + 0.05 * Math.sin(t * 0.17 + 2.1),  0.075) * (0.5 + 0.5 * Math.sin(t * 0.45 + 0.7));
      e += 0.12 * bump(f, 0.60 + 0.04 * Math.sin(t * 0.27 + 3.0),  0.100) * (0.5 + 0.5 * Math.sin(t * 0.70 + 3.0));
      e += 0.05 * Math.max(0, Math.sin(f * 42 + t * 2.1)) * (1 - f);        // high shimmer
      freq[i] = clamp255(e * 255);
    }
  }
  function synthWave(t) {
    for (let i = 0; i < BINS; i++) {
      const x = i / BINS;
      const v = Math.sin(x * TAU * 3 + t * 1.5) * 0.40
              + Math.sin(x * TAU * 5 + t * 0.9) * 0.18
              + Math.sin(x * TAU * 1 + t * 0.6) * 0.24;
      wave[i] = clamp255(128 + v * 92);
    }
  }
  const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

  /* ================= MESH CANVAS ================= */
  const mesh = (() => {
    const canvas = document.getElementById('mesh');
    if (!canvas || !canvasOK) { docEl.classList.add('no-canvas'); return null; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { docEl.classList.add('no-canvas'); return null; }
    let w = 0, h = 0, dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function bandEnergy(lo, hi) {
      const a = Math.floor(lo * BINS), b = Math.max(a + 1, Math.floor(hi * BINS));
      let s = 0; for (let i = a; i < b; i++) s += freq[i];
      return (s / (b - a)) / 255;
    }
    function draw(t) {
      let sum = 0; for (let i = 0; i < BINS; i++) sum += freq[i];
      const energy = (sum / BINS) / 255;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
      const min = Math.min(w, h);

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        const band = bandEnergy(b.band[0], b.band[1]);
        const px = w * (b.cx + b.ax * Math.sin(t * b.sx + b.ph));
        const py = h * (b.cy + b.ay * Math.cos(t * b.sy + b.ph * 1.3));
        const r = min * (b.base + band * b.react + energy * 0.08);
        const a = b.core + band * 0.34;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        const c = b.col;
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.28).toFixed(3)})`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    return { resize, draw };
  })();

  /* ================= BARS / WAVEFORM CANVAS ================= */
  const bars = (() => {
    const canvas = document.getElementById('bars');
    if (!canvas || !canvasOK) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let w = 0, h = 0, dpr = 1, grad = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth || 600;
      h = canvas.clientHeight || 104;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(63,224,208,0.85)');
      grad.addColorStop(0.6, 'rgba(120,224,190,0.9)');
      grad.addColorStop(1, 'rgba(255,179,71,0.95)');
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      const n = w < 560 ? 40 : 60;
      const usable = Math.floor(BINS * 0.62);       // upper bins mostly silent for a pad
      const gap = 2.5;
      const bw = (w - gap * (n - 1)) / n;
      ctx.fillStyle = grad;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.pow(i / n, 1.55) * usable);
        const nx = Math.min(usable - 1, idx + 2);
        let v = 0; for (let k = idx; k <= nx; k++) v += freq[k];
        v = (v / (nx - idx + 1)) / 255;
        const bh = Math.max(2, v * v * h * 0.96);
        const x = i * (bw + gap);
        const y = h - bh;
        roundRect(ctx, x, y, bw, bh, Math.min(bw / 2, 2.5));
        ctx.fill();
      }
      // waveform overlay
      ctx.beginPath();
      for (let i = 0; i < BINS; i++) {
        const x = (i / (BINS - 1)) * w;
        const y = h * 0.5 + ((wave[i] - 128) / 128) * (h * 0.34);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(243,248,247,0.55)';
      ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    function roundRect(c, x, y, wd, ht, r) {
      r = Math.min(r, wd / 2, ht / 2);
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + wd, y, x + wd, y + ht, r);
      c.arcTo(x + wd, y + ht, x, y + ht, r);
      c.arcTo(x, y + ht, x, y, r);
      c.arcTo(x, y, x + wd, y, r);
      c.closePath();
    }
    return { resize, draw };
  })();

  /* ================= RENDER LOOP ================= */
  let raf = 0;
  function frame(now) {
    const t = now * 0.001;
    synthSpectrum(t);
    synthWave(t); // animated visual data; no audio generated
    if (mesh) mesh.draw(t);
    if (bars) bars.draw();
    raf = requestAnimationFrame(frame);
  }
  function staticFrame() {                                    // one still frame (reduced motion)
    synthSpectrum(0); synthWave(0);
    if (mesh) mesh.draw(0);
    if (bars) bars.draw();
  }
  function resizeAll() { if (mesh) mesh.resize(); if (bars) bars.resize(); }

  /* ================= BOOT ================= */
  resizeAll();
  if (reduce) {
    staticFrame();                       // static mesh, no synthetic animation
  } else {
    raf = requestAnimationFrame(frame);
  }

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { resizeAll(); if (reduce) staticFrame(); }, 180);
  }, { passive: true });

  // pause the loop when tab is hidden; resume cleanly (avoids wasted work + timestamp jumps)
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { raf = requestAnimationFrame(frame); }
  });

  /* ---------- hero intro (compositor-driven) ---------- */
  const hero = document.querySelector('.hero');
  if (hero) {
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('loaded')));
    setTimeout(() => hero.classList.add('loaded'), 400);      // hard failsafe
  }

  /* ---------- scroll reveals ---------- */
  const revealAll = () => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in'));
  if (reduce || !('IntersectionObserver' in window)) {
    revealAll();
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll('.reveal').forEach((el) => { if (!el.closest('.hero')) io.observe(el); });
  }

  /* ---------- nav backdrop ---------- */
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.6);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- custom cursor (fine pointer, motion allowed) ---------- */
  if (!reduce && matchMedia('(pointer:fine)').matches) {
    const cur = document.querySelector('.cursor');
    if (cur) {
      const p = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
      addEventListener('pointermove', (e) => { p.tx = e.clientX; p.ty = e.clientY; cur.classList.add('on'); }, { passive: true });
      addEventListener('pointerleave', () => cur.classList.remove('on'));
      (function loop() {
        p.x += (p.tx - p.x) * 0.2; p.y += (p.ty - p.y) * 0.2;
        cur.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
        requestAnimationFrame(loop);
      })();
      document.querySelectorAll('a,button,.reel-row').forEach((el) => {
        el.addEventListener('pointerenter', () => cur.classList.add('hot'));
        el.addEventListener('pointerleave', () => cur.classList.remove('hot'));
      });
    }
  }
})();
