/* MAXRIVEN ENGINE — podgląd: 3 warianty ekranu jazdy sterowane jednym symulatorem. */
(function () {
  'use strict';
  const MX = window.MX;
  const audio = new MX.AudioEngine();
  const ctl = new MX.Controller(audio);
  const qs = new URLSearchParams(location.search);
  let engine = MX.ENGINES.find((x) => x.id === qs.get('engine')) || MX.ENGINES[0];
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
    e: `<div class="e-wrap"><svg data-f="svg"></svg></div>`,
    d: `
      <div class="d-panel d-left">
        <div class="d-title">OPONY <span>bar · °C</span></div>
        <div class="d-car">
          <div class="d-tyre fl"><b data-f="tFL">2.3</b><span data-f="tTFL">32°</span></div>
          <div class="d-tyre fr"><b data-f="tFR">2.3</b><span data-f="tTFR">32°</span></div>
          <div class="d-body"></div>
          <div class="d-tyre rl"><b data-f="tRL">2.4</b><span data-f="tTRL">33°</span></div>
          <div class="d-tyre rr"><b data-f="tRR">2.4</b><span data-f="tTRR">33°</span></div>
        </div>
        <div class="d-gauge"><label>TEMP. WODY</label><div class="d-val"><b data-f="water">90</b> °C</div><div class="d-bar"><i data-f="waterBar"></i></div></div>
      </div>
      <div class="d-centre">
        <div class="d-strip" data-f="stripL"></div>
        <div class="d-tach" data-f="tach">
          <svg viewBox="0 0 1000 1000" data-f="svg"></svg>
          <div class="d-gear" data-f="gear">N</div>
          <div class="d-unit">×1000 /min</div>
          <div class="d-speed"><b class="num" data-f="kmh">0</b> km/h</div>
          <div class="d-boost turbo-only"><span>DOŁADOWANIE</span><div class="d-bar"><i data-f="boost"></i></div></div>
        </div>
        <div class="d-strip" data-f="stripR"></div>
      </div>
      <div class="d-panel d-right">
        <div class="d-gauge"><label>PALIWO</label><div class="d-val"><b data-f="fuel">78</b> %</div><div class="d-bar"><i data-f="fuelBar"></i></div></div>
        <div class="d-gauge"><label>TEMP. OLEJU</label><div class="d-val"><b data-f="oilT">96</b> °C</div><div class="d-bar"><i data-f="oilTBar"></i></div></div>
        <div class="d-gauge"><label>CIŚN. OLEJU</label><div class="d-val"><b data-f="oilP">1.8</b> bar</div><div class="d-bar"><i data-f="oilPBar"></i></div></div>
        <div class="d-gauge"><label>GAZ</label><div class="d-val"><b data-f="thrTxt">0</b> %</div><div class="d-bar"><i data-f="thr"></i></div></div>
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
    // D: zegar w duchu „Track Screen” 911 GT3 — czerwone pole na godzinie 12, paski shift-light po bokach
    d(v, e) {
      const svg = v.f.svg, max = tachMax(e), red = e.drive.redline;
      const theta = (rpm) => ((-150 + (150 * rpm) / red) * Math.PI) / 180; // od godziny 12, zgodnie z zegarem
      const pt = (rpm, r) => { const t = theta(rpm); return [500 + r * Math.sin(t), 500 - r * Math.cos(t)]; };
      const arc = (r0, r1, r) => { const a = pt(r0, r), b = pt(r1, r); return `M${a[0]} ${a[1]} A${r} ${r} 0 ${theta(r1) - theta(r0) > Math.PI ? 1 : 0} 1 ${b[0]} ${b[1]}`; };
      svg.innerHTML = '';
      el('circle', { class: 'face', cx: 500, cy: 500, r: 492 }, svg);
      el('path', { class: 'red', d: arc(red, max, 462) }, svg);
      for (let r = 0; r <= max; r += 250) {
        const major = r % 1000 === 0, half = r % 500 === 0;
        const [x1, y1] = pt(r, major ? 418 : half ? 440 : 452), [x2, y2] = pt(r, 470);
        el('line', { class: 'tick' + (major ? '' : half ? ' half' : ' minor') + (r >= red ? ' hot' : ''), x1, y1, x2, y2 }, svg);
        if (major && r <= red + 1) { const [x, y] = pt(r, 350); el('text', { x, y, class: r >= red - 1 ? 'hot' : '' }, svg).textContent = r / 1000; }
      }
      v.needle = el('g', {}, svg);
      el('line', { class: 'needle', x1: 500, y1: 560, x2: 500, y2: 70 }, v.needle);
      el('circle', { class: 'cap', cx: 500, cy: 500, r: 40 }, svg);
      v.theta = theta;
      // paski shift-light: zielone, żółte, czerwone — od dołu do góry
      const colors = ['g', 'g', 'g', 'y', 'y', 'r', 'r', 'r'];
      v.lights = [];
      for (const s of [v.f.stripL, v.f.stripR]) {
        s.innerHTML = '';
        colors.forEach((c) => { const i = document.createElement('i'); i.className = c; s.prepend(i); v.lights.push(i); });
      }
      v.sim = { oilT: 92, water: 86, tyre: 30, fuel: 78 };
    },
    // E: klasyczne zegary 991 GT3 RS (wspólny moduł z aplikacją)
    e(v, e) {
      v.cluster = new MX.Cluster(v.f.svg);
      v.cluster.build(e);
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

  // Boczne ekrany wariantu D: wartości wyliczane z symulacji silnika (to atrapy, auto ich nie podaje).
  function simStep(m, s, dt) {
    const rn = s.rpm / s.redline, k = (tau) => 1 - Math.exp(-dt / tau);
    m.oilT += (92 + 24 * s.throttle * rn - m.oilT) * k(25);
    m.water += (87 + 7 * rn - m.water) * k(30);
    m.tyre += (28 + s.kmh * 0.12 + 10 * s.throttle - m.tyre) * k(40);
    m.fuel = Math.max(5, m.fuel - s.throttle * rn * dt * 0.004);
    return 1.4 + 3.6 * Math.min(1, s.rpm / 5500);
  }

  function panelD(v, s, dt) {
    const m = v.sim;
    const oilP = simStep(m, s, dt);
    const pf = (2.25 + (m.tyre - 25) * 0.006).toFixed(1), pr = (2.35 + (m.tyre - 25) * 0.006).toFixed(1);
    const tf = Math.round(m.tyre) + '°', tr = Math.round(m.tyre + 2) + '°';
    const vals = {
      tFL: pf, tFR: pf, tRL: pr, tRR: pr, tTFL: tf, tTFR: tf, tTRL: tr, tTRR: tr,
      water: String(Math.round(m.water)), oilT: String(Math.round(m.oilT)), oilP: oilP.toFixed(1), fuel: String(Math.round(m.fuel)),
    };
    for (const key in vals) set(v, key, vals[key], (x) => (v.f[key].textContent = x));
    set(v, 'waterBar', Math.round((m.water - 60) / 0.7), (x) => (v.f.waterBar.style.width = x + '%'));
    set(v, 'oilTBar', Math.round((m.oilT - 60) / 0.9), (x) => (v.f.oilTBar.style.width = x + '%'));
    set(v, 'oilPBar', Math.round(oilP / 0.06), (x) => (v.f.oilPBar.style.width = x + '%'));
    set(v, 'fuelBar', Math.round(m.fuel), (x) => (v.f.fuelBar.style.width = x + '%'));
  }

  function render(s, dt) {
    const max = tachMax(engine);
    const frac = Math.min(1, s.rpm / max);
    const shift = s.rpm > s.redline * 0.95 && Math.floor(performance.now() / 90) % 2 === 0;
    const status = s.mode === 'sim' ? 'SYMULATOR' : s.gpsStatus === 'ok' ? `GPS ±${Math.round(s.gpsAccuracy || 0)} M` : STATUS[s.gpsStatus] || '';
    const kmh = String(Math.round(s.kmh));
    const gear = s.gear ? String(s.gear) : 'N';
    const rpm = fmt(Math.round(s.rpm / 10) * 10);

    for (const v of views) {
      if (v.f.kmh) set(v, 'kmh', kmh, (x) => (v.f.kmh.textContent = x));
      if (v.f.gear) set(v, 'gear', gear, (x) => (v.f.gear.textContent = x));
      if (v.f.rpm) set(v, 'rpm', rpm, (x) => (v.f.rpm.textContent = x));
      set(v, 'status', status, (x) => { v.f.status.textContent = x; v.f.status.classList.toggle('ok', s.mode === 'gps' && s.gpsStatus === 'ok'); });
      set(v, 'mode', s.mode, (x) => {
        v.root.classList.toggle('sim', x === 'sim');
        v.root.querySelectorAll('[data-act=mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === x));
      });
      set(v, 'scn', s.scenario, (x) => v.root.querySelectorAll('[data-act=scn]').forEach((b) => b.classList.toggle('on', b.dataset.id === x)));
      set(v, 'revOk', s.stopped, (x) => v.root.querySelector('.btn-rev').classList.toggle('off', !x));
      const thr = Math.round(s.throttle * 100) + '%', boost = Math.round(s.boost * 100) + '%';
      if (v.kind === 'e') {
        v.cluster.update(s, dt);
      } else if (v.kind === 'd') {
        set(v, 'thr', thr, (x) => { v.f.thr.style.width = x; v.f.thrTxt.textContent = parseInt(x, 10); });
        set(v, 'boost', boost, (x) => (v.f.boost.style.width = x));
        const deg = (v.theta(Math.min(s.rpm, max)) * 180) / Math.PI;
        v.needle.setAttribute('transform', `rotate(${deg.toFixed(2)} 500 500)`);
        // shift-light: zapalają się od 72% do 97% czerwonego pola, potem wszystkie migają
        const lit = Math.max(0, Math.min(8, Math.ceil(((s.rpm - s.redline * 0.72) / (s.redline * 0.25)) * 8)));
        const flash = s.rpm >= s.redline * 0.97 && !s.cut ? (Math.floor(performance.now() / 70) % 2 ? 'F' : 'f') : '';
        set(v, 'lights', lit + flash, () => v.lights.forEach((l, i) => {
          l.classList.toggle('on', i % 8 < lit);
          l.classList.toggle('flash', flash === 'F');
        }));
        set(v, 'shift', !!flash, (x) => v.f.tach.classList.toggle('shift', x));
        panelD(v, s, dt);
      } else if (v.kind === 'b') {
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
    render(s, dt);
  };
  // ?shot=5 — przewiń symulację 0–100 o tyle sekund i zatrzymaj obraz (do zrzutów)
  const shot = parseFloat(new URLSearchParams(location.search).get('shot'));
  if (shot > 0) {
    autoDemo = false;
    ctl.runner.start(MX.SCENARIOS[0]);
    let t = performance.now();
    ctl.lastT = t;
    for (let i = 0; i < shot * 60; i++) ctl.tick((t += 1000 / 60));
    // ?clean=1 — bez panelu symulatora, tak jak w aucie podczas jazdy na GPS
    if (qs.get('clean')) views.forEach((v) => v.root.classList.remove('sim'));
  } else {
    ctl.start();
  }
})();
