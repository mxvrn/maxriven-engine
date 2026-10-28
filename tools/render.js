/* Renderuje próbki WAV każdego silnika offline (Node), tym samym kodem co w przeglądarce.
   Użycie: node tools/render.js [katalog_wyjściowy] [id_silnika...]
   Wypisuje też pomiary: szczyt, RMS w fazach, NaN — do kalibracji głośności presetów. */
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
  for (const f of ['js/presets.js', 'js/samples.js', 'js/drive.js', 'js/sim.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.MX;
}

function makeProcessor() {
  let Proc = null;
  const scope = {
    sampleRate: SR,
    Math, Float32Array, Infinity, NaN, isFinite, console,
    registerProcessor: (name, cls) => { Proc = cls; },
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {}, onmessage: null }; } },
  };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/worklet.js'), 'utf8') + '\nMAXRIVEN_ENGINE_WORKLET();', scope);
  return new Proc();
}

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

// Pokaz: jałowy, dwie przegazówki, ostre 0–100, odpuszczenie (strzały), hamowanie do zera.
const SHOW = [
  { target: 0, gas: 0, hold: 2.0 },
  { rev: 0.55 }, { target: 0, gas: 0, hold: 1.2 },
  { rev: 0.22 }, { target: 0, gas: 0, hold: 1.6 },
  { target: 100, gas: 1, reach: true },
  { target: 100, gas: 0.3, hold: 1.5 },
  { target: 60, gas: 0, reach: true },
  { target: 60, gas: 0.25, hold: 1.5 },
  { target: 0, gas: 0, brake: 0.6, reach: true },
  { target: 0, gas: 0, hold: 2.0 },
];

function render(MX, eng, seconds) {
  const proc = makeProcessor();
  proc.port.onmessage({ data: { type: 'preset', sound: MX.soundFor(eng) } });
  if (eng.sound.type === 'sample') {
    // jak decodeAudioData w przeglądarce: MP3 z js/samples.js -> float stereo w częstotliwości kontekstu
    const src = MX.SAMPLES[eng.sound.sample];
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mp3', '-i', '-', '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { input: Buffer.from(src.mp3, 'base64'), maxBuffer: 1 << 28 });
    const inter = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), n = inter.length / 2;
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = inter[2 * i]; R[i] = inter[2 * i + 1]; }
    proc.port.onmessage({ data: { type: 'sample', id: src.id, L, R, rpm: src.rpm } });
  }
  proc.port.onmessage({ data: { type: 'run', on: true } });
  const car = new MX.SimCar();
  const dt = new MX.Drivetrain(eng);
  const total = Math.round(seconds * SR);
  const L = new Float32Array(total), R = new Float32Array(total);
  const ctrlEvery = SR / 60;
  const params = { rpm: new Float32Array(1), throttle: new Float32Array(1), cut: new Float32Array(1) };
  const outs = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]];

  let step = -1, stepT = 0, rev = 0, ctrlAcc = 0, done = false;
  const log = [];
  function nextStep() {
    step++; stepT = 0;
    const st = SHOW[step];
    if (!st) { done = true; return; }
    if (st.rev) { rev = st.rev; return; }
    car.target = st.target; car.gas = st.gas; car.brake = st.brake != null ? st.brake : null;
  }
  nextStep();

  for (let pos = 0; pos < total; pos += BLOCK) {
    ctrlAcc += BLOCK;
    while (ctrlAcc >= ctrlEvery) {
      ctrlAcc -= ctrlEvery;
      const h = 1 / 60;
      const st = SHOW[step];
      stepT += h;
      if (!done) {
        if (st.rev) { rev -= h; if (rev <= 0) nextStep(); }
        else if (stepT >= (st.hold || 0) && (!st.reach || Math.abs(car.v * 3.6 - st.target) < 1.5 || stepT > 30)) nextStep();
      }
      car.update(h, eng.drive.power, dt.out.shifting);
      const thr = rev > 0 && car.v < 0.3 ? 1 : car.thr;
      const o = dt.update(h, car.v, thr, car.a);
      params.rpm[0] = o.rpm; params.throttle[0] = o.throttle; params.cut[0] = o.cut;
      log.push([pos / SR, car.v * 3.6, o.rpm, o.gear, o.throttle, o.cut]);
    }
    proc.process([], outs, params);
    const n = Math.min(BLOCK, total - pos);
    L.set(outs[0][0].subarray(0, n), pos);
    R.set(outs[0][1].subarray(0, n), pos);
  }
  return { L, R, log };
}

// Przybliżenie toru wyjściowego z przeglądarki: HP 28 Hz + miękki limiter.
function master(L, R) {
  const a = Math.exp(-2 * Math.PI * 28 / SR);
  let xl = 0, yl = 0, xr = 0, yr = 0, env = 0;
  const att = 1 - Math.exp(-1 / (0.002 * SR)), rel = 1 - Math.exp(-1 / (0.15 * SR));
  for (let i = 0; i < L.length; i++) {
    yl = a * (yl + L[i] - xl); xl = L[i];
    yr = a * (yr + R[i] - xr); xr = R[i];
    const pk = Math.max(Math.abs(yl), Math.abs(yr));
    env += (pk > env ? att : rel) * (pk - env);
    const gr = env > 0.7 ? 0.7 / env : 1;
    L[i] = Math.tanh(yl * gr * 1.15) / 1.15;
    R[i] = Math.tanh(yr * gr * 1.15) / 1.15;
  }
}

function stats(L, R, log, from, to) {
  const a = Math.floor(from * SR), b = Math.min(L.length, Math.floor(to * SR));
  let sum = 0, pk = 0, nan = 0;
  for (let i = a; i < b; i++) {
    const l = L[i], r = R[i];
    if (!isFinite(l) || !isFinite(r)) { nan++; continue; }
    sum += l * l + r * r;
    pk = Math.max(pk, Math.abs(l), Math.abs(r));
  }
  return { rms: Math.sqrt(sum / (2 * Math.max(1, b - a))), pk, nan };
}
const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);

const MX = loadScripts();
const outDir = process.argv[2] || path.join(ROOT, 'samples');
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });
for (const eng of MX.ENGINES) {
  if (only.length && !only.includes(eng.id)) continue;
  const { L, R, log } = render(MX, eng, 24);
  // fazy do pomiaru: jałowy, pełny gaz (z logu), cały plik
  const full = log.filter((r) => r[4] > 0.9 && r[1] > 5).map((r) => r[0]);
  const idle = stats(L, R, log, 0.3, 1.9);
  const wot = full.length ? stats(L, R, log, full[0], full[full.length - 1]) : { rms: 0, pk: 0 };
  const all = stats(L, R, log, 0, 24);
  const maxGear = Math.max(...log.map((r) => r[3]));
  const maxKmh = Math.max(...log.map((r) => r[1]));
  console.log(`${eng.id.padEnd(5)} idle ${db(idle.rms)} dB | pełny gaz ${db(wot.rms)} dB (szczyt ${db(wot.pk)}) | całość szczyt ${db(all.pk)} NaN ${all.nan} | max bieg ${maxGear}, ${maxKmh.toFixed(0)} km/h`);
  master(L, R);
  writeWav(path.join(outDir, `${eng.id}.wav`), L, R);
  if (process.env.LOG) fs.writeFileSync(path.join(outDir, `${eng.id}.csv`), log.map((r) => r.map((x) => +x.toFixed(3)).join(',')).join('\n'));
}
