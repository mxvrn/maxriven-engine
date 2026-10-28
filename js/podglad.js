/* MAXRIVEN ENGINE — podgląd: 3 warianty ekranu jazdy sterowane jednym symulatorem. */
(function () {
  'use strict';
  const MX = window.MX;
  const audio = new MX.AudioEngine();
  const ctl = new MX.Controller(audio);
  let engine = MX.ENGINES[0];
  ctl.setEngine(engine);
  window.__mx = { ctl, audio };

  const tachMax = (e) => Math.ceil((e.drive.limiter + 300) / 1000) * 1000;
  const fmt = (n) => n.toLocaleString('pl-PL');

  // ---------- szablony ----------
  function frame(main) {
    return `
      <div class="scr-top">
        <div class="scr-logo">MAXRIVEN <span>ENGINE</span></div>
        <div class="scr-engine" data-f="engine"></div>
        <div class="seg"><button data-act="mode" data-mode="gps">GPS</button><button data-act="mode" data-mode="sim">SYMULATOR</button></div>
        <div class="scr-status" data-f="status"></div>
      </div>
      <div class="scr-main">${main}</div>
      <div class="scr-sim">
        <div class="slider"><label>PRĘDKOŚĆ DOCELOWA <b data-f="tgtLbl"></b></label><input type="range" min="0" max="250" step="1" data-bind="target"></div>
        <div class="slider"><label>GAZ <b data-f="gasLbl"></b></label><input type="range" min="0" max="100" step="1" data-bind="gas"></div>
        <div class="scns">${MX.SCENARIOS.map((s) => `<button data-act="scn" data-id="${s.id}">${s.name}</button>`).join('')}</div>
      </div>
      <div class="scr-bottom"><button class="btn-stop" data-act="stop">STOP</button><button class="btn-rev" data-act="rev">TRZYMAJ, ABY PRZEGAZOWAĆ</button></div>`;
  }

  const MAIN = {
    a: `
      <div class="a-tach" data-f="tach"><svg viewBox="0 0 1000 1000" data-f="svg"></svg>
        <div class="a-center"><div class="a-gear num" data-f="gear">N</div><div class="a-rpm"><span class="num" data-f="rpm">0</span> OBR/MIN</div></div>
      </div>
      <div class="a-right">
        <div class="a-speed num"><span data-f="kmh">0</span><small>KM/H</small></div>
        <div class="meter"><label>GAZ</label><div class="bar"><i data-f="thr"></i></div></div>
        <div class="meter turbo-only"><label>DOŁADOWANIE</label><div class="bar"><i data-f="boost"></i></div></div>
      </div>`,
    b: `
      <div class="b-tach"><div class="b-segs" data-f="segs"></div><div class="b-scale" data-f="scale"></div></div>
      <div class="b-row">
        <div class="b-gear"><small>BIEG</small><span class="num" data-f="gear">N</span></div>
        <div class="b-speed num"><span data-f="kmh">0</span><small>KM/H</small></div>
        <div class="b-side">
          <div class="b-rpm"><span class="num" data-f="rpm">0</span><small>OBR/MIN</small></div>
          <div class="vbar"><div><i data-f="thr"></i></div><label>GAZ</label></div>
          <div class="vbar turbo-only"><div><i data-f="boost"></i></div><label>TURBO</label></div>
        </div>
      </div>`,
    c: `
      <div class="c-dial" data-f="tach"><svg viewBox="-620 -640 1240 680" data-f="svg"></svg>
        <div class="c-speed num"><span data-f="kmh">0</span><small>KM/H</small></div>
      </div>
      <div class="c-side">
        <div class="c-gear"><small>BIEG</small><span data-f="gear">N</span></div>
        <div class="c-rpm"><span class="num" data-f="rpm">0</span><small>OBR/MIN</small></div>
        <div class="meter"><label>GAZ</label><div class="bar"><i data-f="thr"></i></div></div>
        <div class="meter turbo-only"><label>DOŁADOWANIE</label><div class="bar"><i data-f="boost"></i></div></div>
      </div>`,
  };

  // ---------- obrotomierze ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  function arcPath(cx, cy, r, a0, a1) {
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  }

  const BUILD = {
    // A: łuk 270°
    a(v, e) {
      const svg = v.f.svg, max = tachMax(e), R = 440, A0 = (135 * Math.PI) / 180, SW = (270 * Math.PI) / 180;
      const ang = (f) => A0 + SW * f;
      svg.innerHTML = '';
      el('path', { class: 'trk', d: arcPath(500, 500, R, ang(0), ang(1)) }, svg);
      el('path', { class: 'red', d: arcPath(500, 500, R, ang(e.drive.redline / max), ang(1)) }, svg);
      v.val = el('path', { class: 'val', d: arcPath(500, 500, R, ang(0), ang(1)), pathLength: 1000, 'stroke-dasharray': '0 1000' }, svg);
      for (let r = 0; r <= max; r += 500) {
        const a = ang(r / max), major = r % 1000 === 0, r0 = major ? 384 : 396;
        el('line', { class: 'tick' + (major ? '' : ' minor'), x1: 500 + r0 * Math.cos(a), y1: 500 + r0 * Math.sin(a), x2: 500 + 408 * Math.cos(a), y2: 500 + 408 * Math.sin(a) }, svg);
        if (major) el('text', { x: 500 + 340 * Math.cos(a), y: 500 + 340 * Math.sin(a) }, svg).textContent = r / 1000;
      }
    },
    // B: segmentowy pasek na całą szerokość
    b(v, e) {
      const max = tachMax(e), n = max / 250;
      v.f.segs.innerHTML = '';
      v.segs = [];
      for (let i = 0; i < n; i++) {
        const rpm = (i + 1) * 250, s = document.createElement('i');
        if (rpm > e.drive.redline) s.className = 'red';
        else if (rpm > e.drive.redline * 0.82) s.dataset.hot = '1';
        v.f.segs.appendChild(s);
        v.segs.push(s);
      }
      v.f.scale.innerHTML = '';
      for (let r = 0; r <= max; r += 1000) {
        const s = document.createElement('span');
        s.style.left = (r / max) * 100 + '%';
        s.textContent = r / 1000;
        v.f.scale.appendChild(s);
      }
      v.lit = -1;
    },
    // C: półkole z „pływającą” wskazówką
    c(v, e) {
      const svg = v.f.svg, max = tachMax(e), R = 560;
      const ang = (f) => Math.PI + Math.PI * f;
      svg.innerHTML = '';
      el('path', { class: 'trk', d: arcPath(0, 0, R, ang(0), ang(1)) }, svg);
      el('path', { class: 'red', d: arcPath(0, 0, R + 16, ang(e.drive.redline / max), ang(1)) }, svg);
      v.val = el('path', { class: 'val', d: arcPath(0, 0, R + 16, ang(0), ang(1)), pathLength: 1000, 'stroke-dasharray': '0 1000' }, svg);
      for (let r = 0; r <= max; r += 500) {
        const a = ang(r / max), major = r % 1000 === 0, r0 = major ? 520 : 535;
        el('line', { class: 'tick' + (major ? '' : ' minor'), x1: r0 * Math.cos(a), y1: r0 * Math.sin(a), x2: 556 * Math.cos(a), y2: 556 * Math.sin(a) }, svg);
        if (major) el('text', { x: 478 * Math.cos(a), y: 478 * Math.sin(a) }, svg).textContent = r / 1000;
      }
      v.needle = el('line', { class: 'needle', x1: 395, y1: 0, x2: 505, y2: 0 }, svg);
    },
  };

  // ---------- widoki ----------
  const views = [...document.querySelectorAll('.screen')].map((root) => {
    const kind = root.dataset.variant;
    root.classList.add('var-' + kind);
    root.innerHTML = frame(MAIN[kind]);
    const f = {};
    root.querySelectorAll('[data-f]').forEach((n) => (f[n.dataset.f] = n));
    return { root, kind, f, last: {} };
  });

  function rebuild() {
    for (const v of views) {
      BUILD[v.kind](v, engine);
      v.f.engine.innerHTML = `<b>${engine.name}</b>${engine.tag}`;
      v.root.classList.toggle('turbo', !!engine.sound.turbo);
    }
  }
  rebuild();

  const set = (v, key, val, fn) => { if (v.last[key] !== val) { v.last[key] = val; fn(val); } };
  const STATUS = { waiting: 'CZEKAM NA GPS', denied: 'BRAK ZGODY NA GPS', nosignal: 'BRAK SYGNAŁU GPS', unsupported: 'BRAK GPS', off: 'GPS WYŁĄCZONY' };

  function render(s) {
    const max = tachMax(engine);
    const frac = Math.min(1, s.rpm / max);
    const shift = s.rpm > s.redline * 0.95 && Math.floor(performance.now() / 90) % 2 === 0;
    const status = s.mode === 'sim' ? 'SYMULATOR' : s.gpsStatus === 'ok' ? `GPS ±${Math.round(s.gpsAccuracy || 0)} M` : STATUS[s.gpsStatus] || '';
    const kmh = String(Math.round(s.kmh));
    const gear = s.gear ? String(s.gear) : 'N';
    const rpm = fmt(Math.round(s.rpm / 10) * 10);

    for (const v of views) {
      set(v, 'kmh', kmh, (x) => (v.f.kmh.textContent = x));
      set(v, 'gear', gear, (x) => (v.f.gear.textContent = x));
      set(v, 'rpm', rpm, (x) => (v.f.rpm.textContent = x));
      set(v, 'status', status, (x) => { v.f.status.textContent = x; v.f.status.classList.toggle('ok', s.mode === 'gps' && s.gpsStatus === 'ok'); });
      set(v, 'mode', s.mode, (x) => {
        v.root.classList.toggle('sim', x === 'sim');
        v.root.querySelectorAll('[data-act=mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === x));
      });
      set(v, 'scn', s.scenario, (x) => v.root.querySelectorAll('[data-act=scn]').forEach((b) => b.classList.toggle('on', b.dataset.id === x)));
      set(v, 'revOk', s.stopped, (x) => v.root.querySelector('.btn-rev').classList.toggle('off', !x));
      const thr = Math.round(s.throttle * 100) + '%', boost = Math.round(s.boost * 100) + '%';
      if (v.kind === 'b') {
        set(v, 'thr', thr, (x) => (v.f.thr.style.height = x));
        set(v, 'boost', boost, (x) => (v.f.boost.style.height = x));
        const lit = Math.round(frac * v.segs.length);
        set(v, 'lit', lit, (x) => v.segs.forEach((seg, i) => { seg.classList.toggle('lit', i < x); seg.classList.toggle('hot', i < x && !!seg.dataset.hot); }));
        set(v, 'shift', shift, (x) => v.f.segs.classList.toggle('shift', x));
      } else {
        set(v, 'thr', thr, (x) => (v.f.thr.style.width = x));
        set(v, 'boost', boost, (x) => (v.f.boost.style.width = x));
        v.val.setAttribute('stroke-dasharray', `${(frac * 1000).toFixed(1)} 1000`);
        set(v, 'shift', shift, (x) => v.f.tach.classList.toggle('shift', x));
        if (v.kind === 'c') v.needle.setAttribute('transform', `rotate(${180 + 180 * frac})`);
      }
    }
    syncSliders();
  }

  // ---------- suwaki symulatora ----------
  const sliders = () => document.querySelectorAll('[data-bind]');
  function syncSliders() {
    const t = Math.round(ctl.car.target), gpct = Math.round(ctl.car.gas * 100);
    for (const v of views) {
      set(v, 'tgt', t, (x) => { v.f.tgtLbl.textContent = x + ' km/h'; v.root.querySelector('[data-bind=target]').value = x; });
      set(v, 'gas', gpct, (x) => { v.f.gasLbl.textContent = x + '%'; v.root.querySelector('[data-bind=gas]').value = x; });
    }
  }

  // ---------- zdarzenia ----------
  let autoDemo = true;
  const userTook = () => { autoDemo = false; };

  document.addEventListener('input', (e) => {
    const b = e.target.dataset && e.target.dataset.bind;
    if (!b) return;
    userTook();
    ctl.runner.stop();
    if (b === 'target') ctl.car.target = +e.target.value;
    else ctl.car.gas = +e.target.value / 100;
  });

  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-act=rev]');
    if (!b) return;
    b.setPointerCapture(e.pointerId);
    ctl.rev = true;
    document.querySelectorAll('.btn-rev').forEach((x) => x.classList.add('on'));
  });
  const revOff = () => { ctl.rev = false; document.querySelectorAll('.btn-rev').forEach((x) => x.classList.remove('on')); };
  document.addEventListener('pointerup', revOff);
  document.addEventListener('pointercancel', revOff);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-engine], [data-view]');
    if (!b) return;
    if (b.dataset.act === 'mode') { userTook(); ctl.setMode(b.dataset.mode); }
    else if (b.dataset.act === 'scn') { userTook(); ctl.setMode('sim'); ctl.runner.start(MX.SCENARIOS.find((s) => s.id === b.dataset.id)); }
    else if (b.dataset.act === 'stop') { if (audio.running) toggleSound(); }
    else if (b.dataset.engine) {
      engine = MX.ENGINES.find((x) => x.id === b.dataset.engine);
      ctl.setEngine(engine);
      rebuild();
      for (const v of views) v.last = {};
      markEngine();
    } else if (b.dataset.view) {
      document.getElementById('pvFrames').className = 'pv-frames ' + b.dataset.view;
      document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    }
  });

  const engBox = document.getElementById('pvEngines');
  engBox.innerHTML = MX.ENGINES.map((x) => `<button data-engine="${x.id}">${x.name}</button>`).join('');
  const markEngine = () => engBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.engine === engine.id));
  markEngine();

  const soundBtn = document.getElementById('pvSound');
  async function toggleSound() {
    if (audio.running) {
      audio.stop();
      MX.WakeLock.release();
    } else {
      try { await audio.start(engine); MX.WakeLock.request(); }
      catch (err) { console.error(err); alert('Nie udało się uruchomić dźwięku: ' + err.message); }
    }
    soundBtn.textContent = audio.running ? '■ Wycisz' : '▶ Włącz dźwięk';
    soundBtn.classList.toggle('on', audio.running);
  }
  soundBtn.addEventListener('click', toggleSound);

  // ---------- skalowanie ramek 1920×1200 ----------
  const ro = new ResizeObserver((entries) => {
    for (const en of entries) en.target.firstElementChild.style.transform = `scale(${en.contentRect.width / 1920})`;
  });
  document.querySelectorAll('.pv-scale').forEach((n) => ro.observe(n));

  // ?only=a — sam jeden wariant na cały ekran (do zrzutów)
  const only = new URLSearchParams(location.search).get('only');
  if (only) {
    document.body.classList.add('only');
    document.querySelectorAll('.pv-item').forEach((n) => { if (n.querySelector('.screen').dataset.variant !== only) n.remove(); });
  }

  // ---------- start: auto-demo scenariuszy, dopóki użytkownik nic nie dotknie ----------
  let demoIdx = 0, demoWait = 0;
  ctl.onFrame = (s, dt) => {
    if (autoDemo && !ctl.runner.active) {
      demoWait += dt;
      if (demoWait > 1.5) { demoWait = 0; ctl.runner.start(MX.SCENARIOS[demoIdx++ % MX.SCENARIOS.length]); }
    }
    render(s);
  };
  // ?shot=5 — przewiń symulację 0–100 o tyle sekund i zatrzymaj obraz (do zrzutów)
  const shot = parseFloat(new URLSearchParams(location.search).get('shot'));
  if (shot > 0) {
    autoDemo = false;
    ctl.runner.start(MX.SCENARIOS[0]);
    let t = performance.now();
    ctl.lastT = t;
    for (let i = 0; i < shot * 60; i++) ctl.tick((t += 1000 / 60));
  } else {
    ctl.start();
  }
})();
