/* MAXRIVEN ENGINE — synteza silnika w AudioWorklet.
   Cały procesor siedzi w jednej funkcji: audio.js zamienia ją na tekst i ładuje przez Blob URL,
   dzięki czemu aplikacja działa także z file:// (dwuklik w index.html), bez serwera.
   W środku wolno używać tylko tego, co daje AudioWorkletGlobalScope. */
function MAXRIVEN_ENGINE_WORKLET() {
  'use strict';

  const TAU = Math.PI * 2;
  const SR = sampleRate;
  const LUT = 1024;

  // ---------- narzędzia DSP ----------

  class Rng {
    constructor(seed) { this.s = (seed >>> 0) || 0x2545f491; }
    next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; }
    bi() { return this.next() * 2 - 1; }
    gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508; }
  }

  const poleHz = (hz) => 1 - Math.exp((-TAU * hz) / SR);
  const poleSec = (sec, rate) => 1 - Math.exp(-1 / (sec * (rate || SR)));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // tanh bez Math.tanh (szybsza, gładka, ograniczona)
  const sat = (x) => { if (x > 3) return 1; if (x < -3) return -1; const x2 = x * x; return (x * (27 + x2)) / (27 + 9 * x2); };

  class Biquad {
    constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
    _w(f) { return (TAU * clamp(f, 10, SR * 0.45)) / SR; }
    bp(f, q) { const w = this._w(f), s = Math.sin(w), c = Math.cos(w), a = s / (2 * q), n = 1 / (1 + a);
      this.b0 = a * n; this.b1 = 0; this.b2 = -a * n; this.a1 = -2 * c * n; this.a2 = (1 - a) * n; return this; }
    lp(f, q) { const w = this._w(f), s = Math.sin(w), c = Math.cos(w), a = s / (2 * q), n = 1 / (1 + a);
      this.b0 = ((1 - c) / 2) * n; this.b1 = (1 - c) * n; this.b2 = this.b0; this.a1 = -2 * c * n; this.a2 = (1 - a) * n; return this; }
    hp(f, q) { const w = this._w(f), s = Math.sin(w), c = Math.cos(w), a = s / (2 * q), n = 1 / (1 + a);
      this.b0 = ((1 + c) / 2) * n; this.b1 = -(1 + c) * n; this.b2 = this.b0; this.a1 = -2 * c * n; this.a2 = (1 - a) * n; return this; }
    run(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
  }

  class Delay {
    constructor(maxSamples) { let n = 1; while (n < maxSamples + 4) n <<= 1; this.buf = new Float32Array(n); this.mask = n - 1; this.w = 0; }
    read(d) { const r = this.w - d, i = Math.floor(r), f = r - i, a = this.buf[i & this.mask]; return a + (this.buf[(i + 1) & this.mask] - a) * f; }
    write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
  }

  // Grzebień ze sprzężeniem i tłumieniem w pętli: prosty falowód rury wydechowej.
  // Ujemne sprzężenie = odbicie od otwartego końca (rezonanse na nieparzystych harmonicznych).
  class PipeComb {
    constructor(maxMs) { this.d = new Delay((maxMs * SR) / 1000); this.len = 2; this.fb = 0; this.lpA = 0.5; this.lp = 0; }
    set(ms, fb, dampHz) { this.len = Math.max(2, (ms * SR) / 1000); this.fb = fb; this.lpA = poleHz(dampHz); }
    run(x) { this.lp += this.lpA * (this.d.read(this.len) - this.lp); const y = x + this.fb * this.lp; this.d.write(y); return y; }
  }

  // ---------- procesor ----------

  class EngineProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 20000, automationRate: 'k-rate' },
        { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'cut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      ];
    }

    constructor() {
      super();
      this.rng = new Rng((Math.random() * 4294967296) >>> 0);
      this.p = null;
      this.pending = null;
      this.fade = 0;
      this.fadeTarget = 0;
      this.wantRun = false;
      this.meterEvery = Math.round(SR / 30);
      this.meterCount = 0;
      this.port.onmessage = (e) => this.onMessage(e.data);
    }

    // Zmiana presetu: jeśli coś gra — najpierw wyciszenie, podmiana w ciszy, potem powrót.
    // „run” mówi tylko, czy ma grać; nie może przerwać wyciszenia przed podmianą (kolejność komunikatów bywa różna).
    onMessage(m) {
      if (m.type === 'preset') {
        if (!this.p || this.fade < 0.002) { this.load(m.sound); this.pending = null; }
        else if (this.pending || this.p.s.id !== m.sound.id) this.pending = m.sound;
      } else if (m.type === 'run') {
        this.wantRun = !!m.on;
      }
    }

    // Kompiluje preset do struktur DSP i zeruje stan.
    load(s) {
      this.raw = s;
      const seedRng = new Rng(hash(s.id || 'x'));
      const p = { s: s };
      p.banks = s.banks;
      p.fire = s.fire.map((e) => ({ a: e.a, bank: e.bank, vary: 1 + s.cylVar * seedRng.gauss(), tone: seedRng.bi() }));
      p.fire.sort((x, y) => x.a - y.a);
      p.nCyl = p.fire.length;

      // Kształt impulsu: krótki „blowdown” (czas stały) + plateau wydechu (w stopniach wału).
      p.spikeLut = new Float32Array(LUT + 1);
      const k = s.spikeK, m = s.spikeM, pk = k / (k + m), norm = Math.pow(pk, k) * Math.pow(1 - pk, m);
      for (let i = 0; i <= LUT; i++) { const x = i / LUT; p.spikeLut[i] = (Math.pow(x, k) * Math.pow(1 - x, m)) / norm; }
      p.platLut = new Float32Array(LUT + 1);
      for (let i = 0; i <= LUT; i++) { const x = Math.sin((Math.PI * i) / LUT); p.platLut[i] = x * x; }
      p.spikeInc = 1 / ((s.spikeMs * SR) / 1000);
      p.crackDec = Math.exp(-1 / ((s.crackMs * SR) / 1000));

      // impulsy aktywne w rzędach
      p.pulses = [];
      for (let b = 0; b < p.banks; b++) {
        const arr = [];
        for (let j = 0; j < 8; j++) arr.push({ on: false, pos: 0, spos: 0, amp: 0, spk: 0, crack: 0 });
        p.pulses.push(arr);
      }
      p.crackBp = [];
      p.header = [];
      for (let b = 0; b < p.banks; b++) {
        p.crackBp.push(new Biquad().bp(s.crackF * (1 + 0.06 * b), 0.9));
        const h = new PipeComb(8);
        h.set(s.header[b] || s.header[0], s.headerFb, s.headerDamp);
        p.header.push(h);
      }
      p.pipe = [new PipeComb(12), new PipeComb(12)];
      p.pipe[0].set(s.pipe[0], s.pipeFb, s.pipeDamp);
      p.pipe[1].set(s.pipe[1] || s.pipe[0] * 1.13, s.pipeFb, s.pipeDamp);
      p.form = [[], []];
      for (let c = 0; c < 2; c++) for (const f of s.formants) p.form[c].push({ bq: new Biquad().bp(f[0] * (1 + 0.025 * c), f[1]), g: f[2] });
      p.bright = [new Biquad(), new Biquad()];
      p.bodyA = poleHz(190);
      p.body = [0, 0];
      p.radPrev = [0, 0];

      // dolot
      p.intBp = new Biquad().bp(s.intake.f, s.intake.q);
      p.roarBp = new Biquad().bp(s.intake.roarF, s.intake.roarQ);
      p.plateBp = new Biquad().bp(2400, 1.4);
      p.envA = poleHz(120);
      p.env = 0;

      // mechanika
      p.tickHp = new Biquad().hp(3800, 0.8);
      p.hissBp = new Biquad().bp(3200, 0.7);
      p.tickPhase = 0;
      p.tickEnv = 0;
      p.tickAmp = 0;
      p.tickDec = Math.exp(-1 / (0.0007 * SR));
      p.whinePh = 0;

      // turbo
      p.boost = 0;
      p.shaft = 0;
      p.whPh = 0;
      p.whBp = new Biquad().bp(3000, 5);
      p.bovBp = new Biquad().bp(2600, 1.1);
      p.bovHp = new Biquad().hp(900, 0.7);
      p.bovAge = 1e9;
      p.bovAmp = 0;
      p.bovArmed = true;

      // strzały z wydechu
      p.pops = [];
      for (let j = 0; j < 10; j++) p.pops.push({ on: false, wait: 0, age: 0, amp: 0, envN: 0, decN: 0, envT: 0, decT: 0, ph: 0, inc: 0, bq: new Biquad() });
      p.crackE = 0;
      p.thrPeak = 0;
      p.liftArmed = true;

      // stan wspólny
      p.rpm = s.idleRpm;
      p.thr = 0;
      p.lc = 0;
      p.thrSlow = 0;
      p.cut = 0;
      p.th = 0;
      p.evIdx = 0;
      p.nextA = p.fire[0].a;
      p.wob = 0;
      p.wobT = 0;
      p.wobTimer = 0;
      p.dc = [0, 0, 0, 0];
      p.aRpm = poleSec(0.012);
      p.aThr = poleSec(0.03);
      p.aCut = poleSec(0.004);
      this.p = p;
    }

    schedulePop(strength, delayMs) {
      const p = this.p, r = this.rng, c = p.s.crackle;
      let slot = null;
      for (const q of p.pops) if (!q.on) { slot = q; break; }
      if (!slot) return;
      slot.on = true;
      slot.wait = Math.floor(((delayMs != null ? delayMs : 2 + r.next() * 28) * SR) / 1000);
      slot.age = 0;
      slot.amp = c.lvl * strength * Math.exp(0.45 * r.gauss());
      slot.envN = 1;
      slot.decN = Math.exp(-1 / ((0.0025 + r.next() * 0.009) * SR));
      slot.envT = 1;
      slot.decT = Math.exp(-1 / ((0.014 + r.next() * 0.02) * SR));
      slot.ph = 0;
      slot.inc = (65 + r.next() * 95) / SR;
      slot.bq.bp(450 + r.next() * 1900, 1.1 + r.next());
      slot.bq.z1 = slot.bq.z2 = 0;
    }

    // Zapłon cylindra (lub jego brak przy odcięciu).
    fire(idx, over, dTh) {
      const p = this.p, s = p.s, r = this.rng, e = p.fire[idx];
      const load = p.lc;
      const rn = p.rpm / s.redline;

      if (p.cut > 0.5 && r.next() < 0.88) {
        if (rn > 0.3 && r.next() < s.crackle.popOnCut) this.schedulePop(0.7 + 0.5 * r.next());
        return;
      }

      // jałowy: nieregularność cykl-do-cyklu („lope” dużego wałka)
      const idleness = clamp((s.idleRpm * 1.4 - p.rpm) / (s.idleRpm * 0.4), 0, 1) * (1 - p.thr);
      let amp = (s.offAmp + (1 - s.offAmp) * Math.pow(load, 0.8)) * e.vary * (1 + s.jitter * r.gauss());
      amp *= 1 + s.idle.lope * idleness * 0.5 * r.gauss();
      if (s.idle.lope > 0 && r.next() < s.idle.lope * 0.12 * idleness) amp *= 0.35;
      amp = Math.max(0, amp);

      const arr = p.pulses[e.bank];
      let slot = arr[0];
      for (const q of arr) if (!q.on) { slot = q; break; }
      slot.on = true;
      slot.pos = (over * dTh) / s.pulseDeg;
      slot.spos = over * p.spikeInc;
      slot.amp = amp;
      slot.spk = (s.offSpike + (1 - s.offSpike) * load) * (1 + 0.1 * e.tone);
      slot.crack = amp * s.crack * (0.15 + 0.85 * load * load);

      // strzały przy hamowaniu silnikiem
      if (p.thr < 0.15 && p.crackE > 0.01 && p.rpm > s.crackle.minRpm) {
        const prob = s.crackle.rate * p.crackE * (0.4 + 0.6 * rn);
        if (r.next() < prob) {
          this.schedulePop(0.5 + 0.7 * r.next());
          if (r.next() < 0.3) this.schedulePop(0.25 + 0.3 * r.next(), 18 + r.next() * 40);
        }
      }
    }

    // Wolne aktualizacje raz na blok (128 próbek).
    block(n, rpmT, thrT) {
      const p = this.p, s = p.s, r = this.rng;
      const dt = n / SR;
      const load = p.lc;
      const rn = p.rpm / s.redline;

      // falowanie biegu jałowego
      const idleness = clamp((s.idleRpm * 1.5 - rpmT) / (s.idleRpm * 0.5), 0, 1) * (1 - thrT);
      p.wobTimer -= dt;
      if (p.wobTimer <= 0) { p.wobTimer = 0.25 + r.next() * 0.4; p.wobT = s.idle.wobble * r.gauss() * idleness; }
      p.wob += (p.wobT - p.wob) * poleSec(0.22, SR / n);

      // detekcja odpuszczenia gazu -> strzały
      p.thrSlow += (p.thr - p.thrSlow) * poleSec(0.12, SR / n);
      p.thrPeak = Math.max(p.thr, p.thrPeak * Math.exp(-dt / 0.6));
      if (p.thr > 0.3) p.liftArmed = true;
      if (p.liftArmed && p.thr < 0.12 && p.thrPeak > 0.45 && p.rpm > s.crackle.minRpm) {
        p.crackE = Math.min(1, p.crackE + 0.6 + 0.4 * rn);
        p.liftArmed = false;
      }
      p.crackE *= Math.exp(-dt / s.crackle.decay);
      if (p.thr < 0.1 && p.rpm > s.crackle.minRpm) p.crackE = Math.max(p.crackE, s.crackle.sustain * (0.5 + rn));

      // filtry zależne od obciążenia
      const bright = s.brightOff + (s.bright - s.brightOff) * load;
      p.bright[0].lp(bright, 0.6);
      p.bright[1].lp(bright * 1.03, 0.6);
      const hollow = 1 + 0.22 * (1 - load);
      p.header.forEach((h, b) => { h.fb = clamp(s.headerFb * hollow, -0.9, 0.9); });
      p.pipe[0].fb = p.pipe[1].fb = clamp(s.pipeFb * hollow, -0.9, 0.9);

      // turbo
      if (s.turbo) {
        const t = s.turbo;
        const target = Math.pow(thrT, 1.2) * smooth(t.spool[0], t.spool[1], p.rpm);
        p.boost += (target - p.boost) * poleSec(target > p.boost ? t.lag : 0.35, SR / n);
        const shaftT = 0.08 + 0.92 * p.boost;
        p.shaft += (shaftT - p.shaft) * poleSec(shaftT > p.shaft ? t.lag * 0.8 : 0.9, SR / n);
        if (thrT > 0.4) p.bovArmed = true;
        // tylko prawdziwe zdjęcie nogi z gazu (wolna średnia), nie krótkie odcięcie przy zmianie biegu
        if (p.bovArmed && thrT < 0.15 && p.thrSlow < 0.35 && p.boost > 0.3) {
          p.bovArmed = false;
          p.bovAge = 0;
          p.bovAmp = t.bov * Math.min(1, p.boost * 1.3);
          p.boost *= 0.35;
        }
        const bovT = p.bovAge / SR;
        p.bovBp.bp(2800 - 1300 * Math.min(1, bovT / 0.5), 1.1);
        p.whBp.bp(t.whistle[0] + (t.whistle[1] - t.whistle[0]) * p.shaft, 6);
      }
    }

    process(inputs, outputs, params) {
      const out = outputs[0];
      const L = out[0];
      const R = out[1] || out[0];
      const n = L.length;

      if (this.pending && this.fade < 0.002) { this.load(this.pending); this.pending = null; }
      this.fadeTarget = this.pending ? 0 : this.wantRun ? 1 : 0;
      const p = this.p;
      if (!p) { L.fill(0); if (R !== L) R.fill(0); return true; }

      const s = p.s, r = this.rng;
      const rpmT = params.rpm[0], thrT = params.throttle[0], cutT = params.cut[0];
      this.block(n, rpmT, thrT);

      const fadeA = poleSec(this.fadeTarget > this.fade ? 0.06 : 0.025);
      const nb = p.banks;
      const dcR = 0.9986;
      const gain = s.gain * 0.5;
      const t = s.turbo;

      for (let i = 0; i < n; i++) {
        p.rpm += p.aRpm * (rpmT + p.wob - p.rpm);
        p.thr += p.aThr * (thrT - p.thr);
        p.cut += p.aCut * (cutT - p.cut);
        this.fade += fadeA * (this.fadeTarget - this.fade);

        const rpm = p.rpm < 0 ? 0 : p.rpm;
        // obciążenie spalania: na jałowym silnik też pali paliwo, więc nie brzmi jak hamowanie silnikiem
        const idleL = s.idleLoad * smooth(s.idleRpm * 1.8, s.idleRpm * 1.02, rpm);
        p.lc = p.thr > idleL ? p.thr : idleL;
        const load = p.lc;
        const rn = rpm / s.redline;
        const dTh = (rpm * 6) / SR;

        // wał korbowy i zapłony
        p.th += dTh;
        let guard = 0;
        while (p.th >= p.nextA && guard++ < 4) {
          this.fire(p.evIdx, (p.th - p.nextA) / dTh, dTh);
          p.evIdx++;
          if (p.evIdx >= p.nCyl) { p.evIdx = 0; p.th -= 720; }
          p.nextA = p.fire[p.evIdx].a + s.timingJitter * r.gauss();
        }

        // impulsy -> kolektory rzędów
        const pInc = dTh / s.pulseDeg;
        let uSum = 0, sideL = 0, sideR = 0;
        for (let b = 0; b < nb; b++) {
          const arr = p.pulses[b];
          let u = 0, c = 0;
          for (let j = 0; j < arr.length; j++) {
            const q = arr[j];
            if (!q.on) continue;
            let v = 0;
            if (q.pos < 1) {
              const x = q.pos * LUT, xi = x | 0, xf = x - xi;
              v += s.plateau * (p.platLut[xi] + (p.platLut[xi + 1] - p.platLut[xi]) * xf);
              q.pos += pInc;
            }
            if (q.spos < 1) {
              const x = q.spos * LUT, xi = x | 0, xf = x - xi;
              v += q.spk * (p.spikeLut[xi] + (p.spikeLut[xi + 1] - p.spikeLut[xi]) * xf);
              q.spos += p.spikeInc;
            }
            u += q.amp * v;
            c += q.crack * r.bi();
            q.crack *= p.crackDec;
            if (q.pos >= 1 && q.spos >= 1) q.on = false;
          }
          const x = u + p.crackBp[b].run(c) * 2.2;
          uSum += u;
          const h = p.header[b].run(x);
          if (nb === 1) { sideL += h; sideR += h; }
          else if (b === 0) { sideL += h * (1 - s.xpipe); sideR += h * s.xpipe; }
          else { sideR += h * (1 - s.xpipe); sideL += h * s.xpipe; }
        }

        // strzały z wydechu
        let pop = 0;
        for (let j = 0; j < p.pops.length; j++) {
          const q = p.pops[j];
          if (!q.on) continue;
          if (q.wait > 0) { q.wait--; continue; }
          const atk = q.age < 24 ? q.age / 24 : 1;
          pop += q.amp * (q.bq.run(r.bi() * q.envN) * 2.4 + 0.9 * Math.sin(TAU * q.ph) * q.envT * atk);
          q.ph += q.inc;
          q.envN *= q.decN;
          q.envT *= q.decT;
          q.age++;
          if (q.envN < 1e-4 && q.envT < 1e-4) q.on = false;
        }

        // rura, tłumik, promieniowanie, saturacja — osobno lewa i prawa strona
        const drive = s.driveOn * load + s.driveOff * (1 - load);
        const driveN = 1 / Math.pow(drive, 0.55);
        let ex0, ex1;
        for (let c = 0; c < 2; c++) {
          let x = p.pipe[c].run((c === 0 ? sideL : sideR) + pop * 0.45);
          let m = s.direct * x;
          const fm = p.form[c];
          for (let k = 0; k < fm.length; k++) m += fm[k].g * fm[k].bq.run(x);
          p.body[c] += p.bodyA * (m - p.body[c]);
          m = p.body[c] * (s.body + (1 - s.body) * load) + (m - p.body[c]);
          m = p.bright[c].run(m);
          const rad = m - 0.9 * p.radPrev[c];
          p.radPrev[c] = m;
          m = m * (1 - s.radiation) + rad * s.radiation;
          m = sat(m * drive * 0.9) * driveN + pop * 0.55;
          if (c === 0) ex0 = m; else ex1 = m;
        }

        // dolot: rezonans puszki powietrza + szum zasysania modulowany impulsami
        p.env += p.envA * (Math.abs(uSum) - p.env);
        const ld = Math.pow(p.thr, 1.3);
        let intake = p.intBp.run(uSum) * s.intake.lvl * (0.15 + 0.85 * ld) * (0.35 + 0.65 * rn);
        intake += p.roarBp.run(r.bi() * p.env) * s.intake.roar * ld * (0.25 + rn) * 2.5;
        intake += p.plateBp.run(r.bi()) * 0.015 * (1 - p.thr) * rn * rn;

        // mechanika: zawory, łańcuch, szum
        const mech = s.mech;
        p.tickPhase += (dTh * nb * 2 * (p.nCyl / nb)) / 720;
        if (p.tickPhase >= 1) { p.tickPhase -= 1; p.tickEnv = 1; p.tickAmp = 0.6 + 0.4 * r.next(); }
        p.tickEnv *= p.tickDec;
        p.whinePh += ((rpm / 60) * mech.teeth) / SR;
        if (p.whinePh > 1) p.whinePh -= 1;
        let mo = p.tickHp.run(r.bi() * p.tickEnv * p.tickAmp) * mech.tick * (0.4 + rn);
        mo += Math.sin(TAU * p.whinePh) * mech.whine * Math.pow(rn, 1.5) * 0.25;
        mo += p.hissBp.run(r.bi()) * mech.hiss * rn * rn * 0.5;
        mo *= mech.lvl;

        // turbo: gwizd wirnika + blow-off
        let tb = 0;
        if (t) {
          const f = t.whistle[0] + (t.whistle[1] - t.whistle[0]) * p.shaft;
          p.whPh += f / SR;
          if (p.whPh > 1) p.whPh -= 1;
          const wa = t.lvl * p.shaft * p.shaft * (0.35 + 0.65 * p.thr);
          tb += wa * (0.55 * Math.sin(TAU * p.whPh) + 0.6 * p.whBp.run(r.bi()));
          if (p.bovAge < SR * 1.5) {
            const bt = p.bovAge / SR;
            const env = (1 - Math.exp(-bt / 0.01)) * Math.exp(-bt / 0.28);
            tb += p.bovAmp * env * p.bovHp.run(p.bovBp.run(r.bi())) * 1.6;
            p.bovAge++;
          }
        }

        const centre = intake + mo + tb;
        let l = ex0 + centre;
        let rr = ex1 + centre;
        const mid = 0.5 * (l + rr), side = 0.5 * (l - rr) * s.width;
        l = mid + side;
        rr = mid - side;

        // DC blocker
        const yl = l - p.dc[0] + dcR * p.dc[1];
        p.dc[0] = l; p.dc[1] = yl;
        const yr = rr - p.dc[2] + dcR * p.dc[3];
        p.dc[2] = rr; p.dc[3] = yr;

        const g = gain * this.fade;
        L[i] = yl * g;
        R[i] = yr * g;
      }

      // bezpiecznik: przy NaN zeruje stan zamiast wysyłać śmieci do głośników
      if (!(Math.abs(L[n - 1]) < 8) || !(Math.abs(R[n - 1]) < 8)) {
        this.load(this.raw);
        L.fill(0);
        if (R !== L) R.fill(0);
      }

      this.meterCount += n;
      if (this.meterCount >= this.meterEvery) {
        this.meterCount = 0;
        this.port.postMessage({ type: 'meter', id: p.s.id, boost: p.boost, crackle: p.crackE });
      }
      return true;
    }
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  registerProcessor('maxriven-engine', EngineProcessor);
}
