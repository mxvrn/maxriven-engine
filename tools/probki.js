/* Próbki odsłuchowe i pomiary dźwięku każdego silnika — przez cały tor wyjściowy jak w przeglądarce
   (HP 28 Hz, bas, EQ kabiny, głośność 75%, limiter z makeup gain, miękkie ograniczenie, 0,92).
   Użycie: node tools/probki.js <katalog_wyjściowy> [id_silnika...]
   Sceny: jałowy, przegazówka, jazda 50 i 120 km/h, pełny gaz 0–100. Losowość ma stałe ziarno,
   więc dwa przebiegi tego samego kodu dają identyczne próbki (porównanie „przed/po” bit w bit).
   Pomiary: RMS i szczyt [dBFS], syk powyżej 6 kHz [dBFS], tło szumowe między harmonicznymi zapłonu
   (percentyl 20% widma w oknie szerokości jednej harmonicznej zapłonu) — wynik jako „ile dB pod dźwiękiem”. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SR = 48000;
const BLOCK = 128;

function loadScripts() {
  const ctx = { console, Math, globalThis: null };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/presets.js', 'js/samples.js', 'js/drive.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.MX;
}

function makeProcessor() {
  let Proc = null;
  const scope = {
    sampleRate: SR, Math, Float32Array, Infinity, NaN, isFinite, console,
    registerProcessor: (name, cls) => { Proc = cls; },
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {}, onmessage: null }; } },
  };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(process.env.WORKLET || path.join(ROOT, 'js/worklet.js'), 'utf8') + '\nMAXRIVEN_ENGINE_WORKLET();', scope);
  return new Proc();
}

const decoded = {};
function sampleData(MX, id) {
  if (decoded[id]) return decoded[id];
  const src = MX.SAMPLES[id];
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mp3', '-i', '-', '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { input: Buffer.from(src.mp3, 'base64'), maxBuffer: 1 << 28 });
  const inter = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = inter.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = inter[2 * i]; R[i] = inter[2 * i + 1]; }
  return (decoded[id] = { L, R, rpm: src.rpm, id });
}

// Sceny: kroki jak w js/sim.js; „rev” = trzymanie przycisku przegazówki przez tyle sekund. meas = co mierzyć.
const SCENES = {
  jalowy: { steps: [{ target: 0, gas: 0, hold: 7 }], meas: 'steady', from: 1.5 },
  przegazowka: { steps: [{ target: 0, gas: 0, hold: 1.5 }, { rev: 0.6 }, { target: 0, gas: 0, hold: 1.8 }, { rev: 0.25 }, { target: 0, gas: 0, hold: 1.8 }, { rev: 0.9 }, { target: 0, gas: 0, hold: 2.5 }], meas: 'all' },
  jazda50: { steps: [{ target: 50, gas: 0.35, reach: true }, { target: 50, gas: 0.25, hold: 9 }], meas: 'lastStep', skip: 3 },
  jazda120: { steps: [{ target: 120, gas: 0.6, reach: true }, { target: 120, gas: 0.3, hold: 9 }], meas: 'lastStep', skip: 3 },
  gaz0_100: { steps: [{ target: 0, gas: 0, hold: 1 }, { target: 100, gas: 1, reach: true }, { target: 100, gas: 0.3, hold: 1 }], meas: 'step1' },
};

function render(MX, eng, scene) {
  const proc = makeProcessor();
  proc.rng.s = 0x1234567;
  proc.port.onmessage({ data: { type: 'preset', sound: MX.soundFor(eng) } });
  if (eng.sound.type === 'sample') { const d = sampleData(MX, eng.sound.sample); proc.port.onmessage({ data: { type: 'sample', id: d.id, L: d.L.slice(), R: d.R.slice(), rpm: d.rpm } }); }
  proc.port.onmessage({ data: { type: 'run', on: true } });
  const car = new MX.SimCar(), dt = new MX.Drivetrain(eng);
  const params = { rpm: new Float32Array(1), throttle: new Float32Array(1), cut: new Float32Array(1) };
  const outs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]];
  const L = [], R = [], log = [];
  let step = -1, stepT = 0, rev = 0, ctrlAcc = 0, done = false, pos = 0, tail = 0;
  const marks = [];
  function nextStep() {
    step++; stepT = 0; marks.push(pos / SR);
    const st = scene.steps[step];
    if (!st) { done = true; return; }
    if (st.rev) { rev = st.rev; return; }
    car.target = st.target; car.gas = st.gas; car.brake = st.brake != null ? st.brake : null;
  }
  nextStep();
  const ctrlEvery = SR / 60;
  while (!done || tail < SR * 0.05) {
    if (done) tail += BLOCK;
    ctrlAcc += BLOCK;
    while (ctrlAcc >= ctrlEvery) {
      ctrlAcc -= ctrlEvery;
      const h = 1 / 60, st = scene.steps[step];
      stepT += h;
      if (!done) {
        if (st.rev) { rev -= h; if (rev <= 0) nextStep(); }
        else if (stepT >= (st.hold || 0) && (!st.reach || Math.abs(car.v * 3.6 - st.target) < 1.5 || stepT > 40)) nextStep();
      }
      car.update(h, eng.drive.power, dt.out.shifting);
      const thr = rev > 0 && car.v < 0.3 ? 1 : car.thr;
      const o = dt.update(h, car.v, thr, car.a);
      params.rpm[0] = o.rpm; params.throttle[0] = o.throttle; params.cut[0] = o.cut;
      log.push([pos / SR, car.v * 3.6, o.rpm, o.gear, o.throttle, o.cut]);
    }
    proc.process([], outs, params);
    L.push(outs[0][0].slice()); R.push(outs[0][1].slice());
    pos += BLOCK;
  }
  const join = (a) => { const o = new Float32Array(a.length * BLOCK); a.forEach((b, i) => o.set(b, i * BLOCK)); return o; };
  return { L: join(L), R: join(R), log, marks };
}

// ---------- tor wyjściowy jak w js/audio.js (wzory filtrów ze specyfikacji Web Audio) ----------
function biquad(type, f, Q, gainDb) {
  const w = (2 * Math.PI * f) / SR, cw = Math.cos(w), sw = Math.sin(w), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highpass') { const al = sw / (2 * Math.pow(10, Q / 20)); b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peaking') { const al = sw / (2 * Q); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else { // półki: S = 1
    const al = (sw / 2) * Math.SQRT2, sa = 2 * Math.sqrt(A) * al;
    if (type === 'lowshelf') { b0 = A * (A + 1 - (A - 1) * cw + sa); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - sa); a0 = A + 1 + (A - 1) * cw + sa; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - sa; }
    else { b0 = A * (A + 1 + (A - 1) * cw + sa); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - sa); a0 = A + 1 - (A - 1) * cw + sa; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - sa; }
  }
  return (x) => { for (let i = 0, z1 = 0, z2 = 0; i < x.length; i++) { const v = x[i], y = (b0 / a0) * v + z1; z1 = (b1 / a0) * v - (a1 / a0) * y + z2; z2 = (b2 / a0) * v - (a2 / a0) * y; x[i] = y; } };
}

function master(L, R) {
  const fil = () => [biquad('highpass', 28, 0.54), biquad('highpass', 28, 1.31), biquad('lowshelf', 95, 0, 2), biquad('peaking', 260, 1.1, -3), biquad('peaking', 2800, 0.9, 1.5), biquad('highshelf', 9500, 0, -2.5)];
  for (const ch of [L, R]) for (const f of fil()) f(ch);
  const vol = 0.75 * 0.75 * 1.8;
  // DynamicsCompressor: próg −9, kolano 6, ratio 20, atak 2 ms, zwolnienie 140 ms, automatyczny makeup gain
  const T = -9, K = 6, Rt = 20;
  const curve = (x) => (x < T ? x : x < T + K ? x + ((1 / Rt - 1) * (x - T) * (x - T)) / (2 * K) : T + K / 2 + K / (2 * Rt) + (x - T - K) / Rt);
  const makeup = Math.pow(10, (-0.6 * curve(0)) / 20);
  const att = 1 - Math.exp(-1 / (0.002 * SR)), rel = 1 - Math.exp(-1 / (0.14 * SR));
  const knee = 0.7, soft = (x) => { const ax = Math.min(1, Math.abs(x)); return Math.sign(x) * (ax <= knee ? ax : knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee))); };
  let env = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i] * vol, r = R[i] * vol, pk = Math.max(Math.abs(l), Math.abs(r));
    env += (pk > env ? att : rel) * (pk - env);
    const xd = 20 * Math.log10(env + 1e-9), gr = Math.pow(10, (curve(xd) - xd) / 20) * makeup;
    L[i] = soft(l * gr) * 0.92;
    R[i] = soft(r * gr) * 0.92;
  }
}

// ---------- pomiary ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}

const NFFT = 8192, HOP = 4096;
const WIN = new Float64Array(NFFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));
const WPOW = WIN.reduce((s, w) => s + w * w, 0);

// Zwraca: rms, szczyt, syk >6 kHz (dBFS) i tło między harmonicznymi (dB pod całością pasma 150 Hz–16 kHz).
function measure(L, R, log, a, b, nCyl) {
  a = Math.floor(a * SR); b = Math.min(L.length, Math.floor(b * SR));
  let sum = 0, pk = 0, nan = 0;
  for (let i = a; i < b; i++) { const l = L[i], r = R[i]; if (!isFinite(l) || !isFinite(r)) { nan++; continue; } sum += l * l + r * r; pk = Math.max(pk, Math.abs(l), Math.abs(r)); }
  const rms = Math.sqrt(sum / (2 * Math.max(1, b - a)));
  const bin = SR / NFFT, k150 = Math.round(150 / bin), k6k = Math.round(6000 / bin), k16k = Math.round(16000 / bin);
  let hf = 0, tot = 0, floor = 0, frames = 0;
  for (let s = a; s + NFFT <= b; s += HOP) {
    const t = (s + NFFT / 2) / SR;
    let rr = 0, c = 0;
    for (const row of log) if (Math.abs(row[0] - t) < NFFT / SR / 2) { rr += row[2]; c++; }
    const rpm = c ? rr / c : 1000;
    const fFire = (rpm / 60) * (nCyl / 2), half = Math.max(2, Math.round(fFire / bin / 2));
    const P = new Float64Array(NFFT / 2);
    for (const ch of [L, R]) {
      const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
      for (let i = 0; i < NFFT; i++) re[i] = ch[s + i] * WIN[i];
      fft(re, im);
      for (let k = 0; k < NFFT / 2; k++) P[k] += (re[k] * re[k] + im[k] * im[k]) / 2;
    }
    for (let k = k6k; k < NFFT / 2; k++) hf += P[k];
    for (let k = k150; k < k16k; k++) {
      tot += P[k];
      // 20. percentyl w oknie jednej harmonicznej zapłonu = poziom „dolin” między prążkami
      const lo = Math.max(0, k - half), hi = Math.min(NFFT / 2 - 1, k + half), arr = [];
      for (let j = lo; j <= hi; j++) arr.push(P[j]);
      arr.sort((x, y) => x - y);
      floor += arr[Math.floor(arr.length * 0.2)];
    }
    frames++;
  }
  const scale = 2 / (WPOW * NFFT * Math.max(1, frames)); // Parseval: suma |X|² (jednostronnie ×2) → średnia moc sygnału
  const db = (x) => 10 * Math.log10(Math.max(x, 1e-20));
  return {
    rms: 20 * Math.log10(rms + 1e-9), pk: 20 * Math.log10(pk + 1e-9), nan,
    hf: db(hf * scale),
    floor: db(floor) - db(tot), // ile dB „dolin” jest pod całym dźwiękiem (bardziej ujemne = czyściej)
  };
}

function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}

if (require.main !== module) { module.exports = { loadScripts, render, master, measure, fft, SCENES, SR, writeWav }; return; }
const MX = loadScripts();
const outDir = process.argv[2] || path.join(ROOT, 'probki-dzwiek');
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });
const results = {};
for (const eng of MX.ENGINES) {
  if (only.length && !only.includes(eng.id)) continue;
  const res = (results[eng.id] = {});
  for (const [name, sc] of Object.entries(SCENES)) {
    const { L, R, log, marks } = render(MX, eng, sc);
    master(L, R);
    const end = L.length / SR;
    let a = 0, b = end;
    if (sc.meas === 'steady') a = sc.from;
    else if (sc.meas === 'lastStep') { a = marks[marks.length - 2] + sc.skip; }
    else if (sc.meas === 'step1') { a = marks[1]; b = marks[2]; }
    const m = measure(L, R, log, a, b, eng.cylinders);
    res[name] = m;
    writeWav(path.join(outDir, `${eng.id}-${name}.wav`), L, R);
  }
  const f = (x) => x.toFixed(1).padStart(6);
  console.log(eng.id.padEnd(5) + Object.entries(res).map(([k, m]) => ` | ${k} rms${f(m.rms)} pk${f(m.pk)} syk${f(m.hf)} tło${f(m.floor)}${m.nan ? ' NaN!' : ''}`).join(''));
}
const jf = path.join(outDir, 'pomiary.json');
const prev = fs.existsSync(jf) ? JSON.parse(fs.readFileSync(jf, 'utf8')) : {};
fs.writeFileSync(jf, JSON.stringify(Object.assign(prev, results), null, 1));
