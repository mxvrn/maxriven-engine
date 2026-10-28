/* MAXRIVEN ENGINE — zegary w stylu klasycznego 991 GT3 RS (żółte tarcze).
   Prędkościomierz z lewej, obrotomierz z PDK pośrodku, okrągły ekran danych z prawej.
   Całość to jedno SVG (viewBox 1840×820), więc skaluje się do każdego ekranu. */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});
  const NS = 'http://www.w3.org/2000/svg';

  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const P = (cx, cy, r, deg) => { const t = (deg * Math.PI) / 180; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; };
  const arcD = (cx, cy, r, d0, d1) => { const a = P(cx, cy, r, d0), b = P(cx, cy, r, d1); return `M${a[0]} ${a[1]} A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${b[0]} ${b[1]}`; };

  MX.tachMax = (e) => Math.ceil((e.drive.limiter + 300) / 1000) * 1000;

  class Cluster {
    constructor(svg) {
      this.svg = svg;
      svg.setAttribute('viewBox', '0 0 1840 820');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    txt(x, y, str, cls, parent, extra) {
      const t = el('text', Object.assign({ x, y, class: cls }, extra || {}), parent || this.svg);
      t.textContent = str;
      return t;
    }

    build(e) {
      const svg = this.svg, txt = this.txt.bind(this);
      const max = (this.max = MX.tachMax(e)), red = e.drive.redline;
      this.last = {};
      svg.innerHTML = `<defs>
        <radialGradient id="eFace" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#f8cf62"/><stop offset=".6" stop-color="#e6a83a"/><stop offset="1" stop-color="#9c6512"/></radialGradient>
        <linearGradient id="eGlass" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <radialGradient id="eTft" cx="45%" cy="35%" r="80%"><stop offset="0" stop-color="#1b2c62"/><stop offset=".7" stop-color="#0a1230"/><stop offset="1" stop-color="#03060f"/></radialGradient>
        <linearGradient id="eHead" x1="0" x2="1"><stop offset="0" stop-color="#3550b0"/><stop offset=".85" stop-color="#1d2b6e"/><stop offset="1" stop-color="#8fa3ff"/></linearGradient>
        <clipPath id="eTftClip"><circle cx="1530" cy="450" r="282"/></clipPath>
        <clipPath id="eTachClip"><circle cx="920" cy="410" r="380"/></clipPath>
      </defs>`;

      // --- prędkościomierz (lewa) ---
      const SC = (this.SC = [310, 450]), SR = 290;
      this.sTheta = (kmh) => -145 + (220 * Math.min(Math.max(kmh, 0), 350)) / 350;
      el('circle', { cx: SC[0], cy: SC[1], r: SR + 16, class: 'e-bezel' }, svg);
      el('circle', { cx: SC[0], cy: SC[1], r: SR, fill: 'url(#eFace)' }, svg);
      for (let k = 0; k <= 350; k += 10) {
        const major = k % 50 === 0, d = this.sTheta(k), a = P(...SC, SR - 10, d), b = P(...SC, SR - (major ? 44 : 24), d);
        el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: major ? 'e-tick big' : 'e-tick' }, svg);
        if (major && k) { const c = P(...SC, SR - 86, d); txt(c[0], c[1], k, 'e-lab s'); }
      }
      txt(SC[0] + 10, SC[1] - 120, 'km/h', 'e-small');
      el('rect', { x: SC[0] - 150, y: SC[1] + 150, width: 300, height: 108, rx: 34, class: 'e-lcd' }, svg);
      this.tripTxt = txt(SC[0] + 40, SC[1] + 200, '0.0', 'e-lcdtxt', svg, { 'text-anchor': 'end' });
      txt(SC[0] + 52, SC[1] + 200, 'km', 'e-lcdunit');
      this.avgTxt = txt(SC[0] + 40, SC[1] + 244, '0', 'e-lcdtxt', svg, { 'text-anchor': 'end' });
      txt(SC[0] + 52, SC[1] + 244, 'Ø km/h', 'e-lcdunit');
      this.sNeedle = el('g', {}, svg);
      el('polygon', { points: `${SC[0] - 8},${SC[1] + 52} ${SC[0] + 8},${SC[1] + 52} ${SC[0] + 3},${SC[1] - SR + 40} ${SC[0] - 3},${SC[1] - SR + 40}`, class: 'e-needle' }, this.sNeedle);
      el('circle', { cx: SC[0], cy: SC[1], r: 46, class: 'e-hub' }, svg);
      el('circle', { cx: SC[0], cy: SC[1], r: SR, fill: 'url(#eGlass)' }, svg);

      // --- ekran danych (prawa) ---
      const RC = [1530, 450];
      el('circle', { cx: RC[0], cy: RC[1], r: 298, class: 'e-bezel' }, svg);
      const tft = el('g', { 'clip-path': 'url(#eTftClip)' }, svg);
      el('rect', { x: RC[0] - 300, y: RC[1] - 300, width: 600, height: 600, fill: 'url(#eTft)' }, tft);
      txt(RC[0], RC[1] - 196, e.name, 'e-tft big', tft, { 'text-anchor': 'middle' });
      el('rect', { x: RC[0] - 215, y: RC[1] - 154, width: 450, height: 60, fill: 'url(#eHead)' }, tft);
      el('line', { x1: RC[0] - 215, y1: RC[1] - 92, x2: RC[0] + 240, y2: RC[1] - 92, stroke: '#e3261b', 'stroke-width': 3 }, tft);
      txt(RC[0] - 200, RC[1] - 110, 'Silnik', 'e-tft head', tft);
      const turbo = !!e.sound.turbo;
      this.rowDefs = [
        { label: 'GAZ', get: (s) => s.throttle, lo: 0, hi: 1, fmt: (x) => Math.round(x * 100) + ' %' },
        turbo
          ? { label: 'TURBO', get: (s) => s.boost, lo: 0, hi: 1, fmt: (x) => (x * 1.2).toFixed(1) + ' bar' }
          : { label: 'WODA', get: () => this.sim.water, lo: 60, hi: 130, fmt: (x) => Math.round(x) + ' °C' },
        { label: 'OLEJ', get: () => this.sim.oilT, lo: 60, hi: 150, fmt: (x) => Math.round(x) + ' °C' },
        { label: 'CIŚN.', get: () => this.sim.oilP, lo: 0, hi: 7, fmt: (x) => x.toFixed(1) + ' bar' },
      ];
      this.rows = this.rowDefs.map((def, i) => {
        const y = RC[1] - 30 + i * 64;
        txt(RC[0] - 196, y, def.label, 'e-tft lbl', tft);
        const segs = [];
        for (let j = 0; j < 8; j++) segs.push(el('rect', { x: RC[0] - 102 + j * 17, y: y - 21, width: 13, height: 21, class: 'e-seg' + (j === 7 && i > 0 ? ' warn' : '') }, tft));
        if (i > 0) el('rect', { x: RC[0] - 102 + 7 * 17, y: y - 29, width: 13, height: 4, fill: '#e3261b' }, tft);
        return { segs, txt: txt(RC[0] + 210, y, '', 'e-tft val', tft, { 'text-anchor': 'end' }) };
      });
      el('line', { x1: RC[0] - 190, y1: RC[1] + 196, x2: RC[0] + 190, y2: RC[1] + 196, stroke: '#3a4a86', 'stroke-width': 2 }, tft);
      this.clock = txt(RC[0], RC[1] + 250, '', 'e-tft clock', tft, { 'text-anchor': 'middle' });

      // --- obrotomierz (środek, na wierzchu) ---
      const TC = (this.TC = [920, 410]), TR = 380;
      this.tTheta = (rpm) => -135 + (270 * Math.max(rpm, 0)) / max;
      el('circle', { cx: TC[0], cy: TC[1], r: TR + 34, fill: '#000', opacity: 0.7 }, svg);
      el('circle', { cx: TC[0], cy: TC[1], r: TR + 18, class: 'e-bezel' }, svg);
      el('circle', { cx: TC[0], cy: TC[1], r: TR, fill: 'url(#eFace)' }, svg);
      el('path', { d: arcD(...TC, TR - 24, this.tTheta(red), this.tTheta(max)), class: 'e-red' }, svg);
      for (let r = 0; r <= max; r += 250) {
        const major = r % 1000 === 0, half = r % 500 === 0, d = this.tTheta(r);
        const a = P(...TC, TR - 10, d), b = P(...TC, TR - (major ? 52 : half ? 34 : 22), d);
        el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'e-tick' + (major ? ' big' : half ? ' mid' : '') }, svg);
        if (major) { const c = P(...TC, TR - 108, d); txt(c[0], c[1], r / 1000, 'e-lab'); }
      }
      txt(TC[0], TC[1] - 118, 'MAXRIVEN', 'e-script', svg, { transform: `skewX(-14) translate(${Math.tan((14 * Math.PI) / 180) * (TC[1] - 118)} 0)` });
      this.upLed = el('polygon', { points: `${TC[0] - 22},${TC[1] - 196} ${TC[0] + 22},${TC[1] - 196} ${TC[0]},${TC[1] - 228}`, class: 'e-up' }, svg);
      el('rect', { x: TC[0] - 92, y: TC[1] + 112, width: 82, height: 108, rx: 18, class: 'e-lcd' }, svg);
      this.gearTxt = txt(TC[0] - 51, TC[1] + 192, 'N', 'e-gear', svg, { 'text-anchor': 'middle' });
      el('line', { x1: TC[0] + 22, y1: TC[1] + 104, x2: TC[0] + 22, y2: TC[1] + 222, class: 'e-pdkline' }, svg);
      this.prnd = ['P', 'R', 'N', 'D'].map((p, i) => {
        const y = TC[1] + 120 + i * 32;
        txt(TC[0] + 48, y + 11, p, 'e-pdk', svg, { 'text-anchor': 'middle' });
        const d = el('circle', { cx: TC[0] + 82, cy: y, r: 7, class: 'e-dot' }, svg);
        d.dataset.p = p;
        return d;
      });
      const band = el('g', { 'clip-path': 'url(#eTachClip)' }, svg);
      el('rect', { x: TC[0] - 260, y: TC[1] + 262, width: 520, height: 140, rx: 50, class: 'e-lcd' }, band);
      this.kmhTxt = txt(TC[0] + 24, TC[1] + 335, '0', 'e-speed', svg, { 'text-anchor': 'end' });
      txt(TC[0] + 38, TC[1] + 333, 'km/h', 'e-lcdunit');
      this.tNeedle = el('g', {}, svg);
      el('polygon', { points: `${TC[0] - 11},${TC[1] + 78} ${TC[0] + 11},${TC[1] + 78} ${TC[0] + 4},${TC[1] - TR + 46} ${TC[0] - 4},${TC[1] - TR + 46}`, class: 'e-needle' }, this.tNeedle);
      el('circle', { cx: TC[0], cy: TC[1], r: 66, class: 'e-hub' }, svg);
      el('circle', { cx: TC[0], cy: TC[1], r: TR, fill: 'url(#eGlass)' }, svg);

      // odczyty-atrapy (Tesla ich nie podaje) i licznik przejazdu
      this.sim = { oilT: 84, water: 85, oilP: 1.8 };
      this.trip = 0;
      this.moving = 0;
    }

    set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

    update(s, dt) {
      const m = this.sim, rn = s.rpm / s.redline, k = (tau) => 1 - Math.exp(-dt / tau);
      m.oilT += (92 + 24 * s.throttle * rn - m.oilT) * k(25);
      m.water += (87 + 7 * rn - m.water) * k(30);
      m.oilP = 1.4 + 3.6 * Math.min(1, s.rpm / 5500);

      this.tNeedle.setAttribute('transform', `rotate(${this.tTheta(Math.min(s.rpm, this.max)).toFixed(2)} ${this.TC[0]} ${this.TC[1]})`);
      this.sNeedle.setAttribute('transform', `rotate(${this.sTheta(s.kmh).toFixed(2)} ${this.SC[0]} ${this.SC[1]})`);
      this.set('kmh', String(Math.round(s.kmh)), (x) => (this.kmhTxt.textContent = x));
      this.set('gear', s.gear ? String(s.gear) : 'N', (x) => (this.gearTxt.textContent = x));
      this.set('up', s.rpm >= s.redline * 0.95 && !s.cut, (x) => this.upLed.classList.toggle('on', x));
      this.set('prnd', s.stopped ? 'N' : 'D', (x) => this.prnd.forEach((d) => d.classList.toggle('on', d.dataset.p === x)));

      this.trip += (s.kmh * dt) / 3600;
      if (s.kmh > 1) this.moving += dt;
      this.set('trip', this.trip.toFixed(1), (x) => (this.tripTxt.textContent = x));
      this.set('avg', String(this.moving > 1 ? Math.round(this.trip / (this.moving / 3600)) : 0), (x) => (this.avgTxt.textContent = x));
      const now = new Date();
      this.set('clock', `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, (x) => (this.clock.textContent = x));

      this.rowDefs.forEach((def, i) => {
        const val = def.get(s);
        const n = Math.max(0, Math.min(8, Math.round(((val - def.lo) / (def.hi - def.lo)) * 8)));
        this.set('row' + i, def.fmt(val), (x) => (this.rows[i].txt.textContent = x));
        this.set('seg' + i, n, (x) => this.rows[i].segs.forEach((r, j) => r.classList.toggle('on', j < x)));
      });
    }
  }

  MX.Cluster = Cluster;
})(typeof window !== 'undefined' ? window : globalThis);
