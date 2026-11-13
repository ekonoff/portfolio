/* RESONANCE — audio-reactive mesh-gradient hero + frequency/waveform visualizer.
   Before the user presses play, a synthetic spectrum keeps the hero alive but silent.
   On click, an AudioContext synthesizes a gentle ambient pad (detuned Cmaj7 voices +
   slow LFOs) routed through an AnalyserNode; getByteFrequencyData drives the mesh + bars.
   Mute returns to the synthetic source. No audio ever autoplays. */
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

  /* ---------- shared spectrum buffers (analyser OR synthetic write here) ---------- */
  const BINS = 512;
  const freq = new Uint8Array(BINS);
  const wave = new Uint8Array(BINS);

  /* ---------- feature detection ---------- */
  const canvasOK = !!document.createElement('canvas').getContext;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioOK = typeof AudioCtx === 'function';

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

  /* ---------- audio engine (created only inside a click gesture) ---------- */
  const audio = (() => {
    let ctx = null, analyser = null, master = null, lp = null, started = false, suspendT = 0;
    const voices = [];
    const NOTES = [65.41, 130.81, 164.81, 196.00, 246.94]; // C2 · Cmaj7 (C E G B)
    const PEAK = 0.15;

    function build() {
      ctx = new AudioCtx();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;                 // -> 512 frequency bins, matches BINS
      analyser.smoothingTimeConstant = 0.82;
      master = ctx.createGain();
      master.gain.value = 0.0001;
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      lp.Q.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4;

      // master breathing LFO -> master.gain (adds to intrinsic envelope value)
      const mLFO = ctx.createOscillator(); mLFO.type = 'sine'; mLFO.frequency.value = 0.08;
      const mLFOg = ctx.createGain(); mLFOg.gain.value = 0.045;
      mLFO.connect(mLFOg).connect(master.gain); mLFO.start();

      // slow filter sweep for evolving timbre
      const fLFO = ctx.createOscillator(); fLFO.type = 'sine'; fLFO.frequency.value = 0.05;
      const fLFOg = ctx.createGain(); fLFOg.gain.value = 420;
      fLFO.connect(fLFOg).connect(lp.frequency); fLFO.start();

      NOTES.forEach((freqHz, n) => {
        const vg = ctx.createGain();
        vg.gain.value = n === 0 ? 0.10 : 0.075;    // bass note a touch louder
        // two detuned oscillators per note for warmth (sine + triangle)
        [['sine', -6], ['triangle', 7]].forEach(([type, detune]) => {
          const o = ctx.createOscillator();
          o.type = type; o.frequency.value = freqHz; o.detune.value = detune;
          o.connect(vg); o.start();
          voices.push(o);
        });
        // gentle per-voice amplitude drift
        const vLFO = ctx.createOscillator(); vLFO.type = 'sine';
        vLFO.frequency.value = 0.05 + n * 0.017;
        const vLFOg = ctx.createGain(); vLFOg.gain.value = 0.02;
        vLFO.connect(vLFOg).connect(vg.gain); vLFO.start();
        vg.connect(master);
      });

      master.connect(lp); lp.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
      started = true;
    }

    function ramp(to, secs) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(to, now + secs);
    }

    return {
      get playing() { return started && ctx && ctx.state === 'running'; },
      // returns true if audio is now producing sound
      start() {
        try {
          if (!started) build();
          clearTimeout(suspendT); suspendT = 0;               // cancel a pending suspend from a recent mute
          const r = ctx.resume ? ctx.resume() : Promise.resolve();
          return Promise.resolve(r).then(() => { ramp(PEAK, 1.1); return true; }).catch(() => false);
        } catch (e) { return Promise.resolve(false); }
      },
      stop() {
        try {
          if (!started) return;
          ramp(0.0001, 0.6);
          if (ctx.suspend) { clearTimeout(suspendT); suspendT = setTimeout(() => { ctx.suspend().catch(() => {}); }, 650); }
        } catch (e) {}
      },
      sample() {
        if (this.playing) { analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(wave); return true; }
        return false;
      },
    };
  })();

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
    if (!audio.sample()) { synthSpectrum(t); synthWave(t); }  // synthetic when silent
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

  /* ================= PLAY / MUTE CONTROL ================= */
  const playBtn = document.getElementById('play');
  const readout = document.getElementById('readout');
  const readoutWrap = readout ? readout.closest('.readout') : null;
  const label = playBtn ? playBtn.querySelector('.play-label') : null;

  function setReadout(text, live) {
    if (readout) readout.textContent = text;
    if (readoutWrap) readoutWrap.classList.toggle('live', !!live);
  }

  if (playBtn) {
    if (!audioOK) {
      playBtn.disabled = true;
      playBtn.setAttribute('aria-disabled', 'true');
      if (label) label.textContent = 'Audio unavailable';
      setReadout('Synthetic sine — audio engine unavailable', false);
    } else {
      let on = false;
      playBtn.addEventListener('click', () => {
        if (!on) {
          audio.start().then((ok) => {
            if (!ok) { setReadout('Playback blocked — synthetic sine', false); return; }
            on = true;
            playBtn.classList.add('is-playing');
            playBtn.setAttribute('aria-pressed', 'true');
            if (label) label.textContent = 'Mute pad';
            setReadout('Now generating — ambient pad in Cmaj7 — 5 voices', true);
          });
        } else {
          audio.stop();
          on = false;
          playBtn.classList.remove('is-playing');
          playBtn.setAttribute('aria-pressed', 'false');
          if (label) label.textContent = 'Play ambient pad';
          setReadout('Paused — synthetic sine — muted', false);
        }
      });
    }
  }

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
