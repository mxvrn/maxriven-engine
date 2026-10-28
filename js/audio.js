/* MAXRIVEN ENGINE — kontekst audio i tor wyjściowy.
   Worklet ładowany z data: URL (działa z file://), prawdziwe nagrania dekodowane z js/samples.js. Tor: HP 28 Hz → bas → EQ kabiny → głośność
   → limiter → miękkie ograniczenie szczytów. Wznawianie po uśpieniu karty, Wake Lock ekranu. */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});

  const VOL_MAX = 1.8; // ok. +5 dB nad poziomem presetu; limiter pilnuje szczytów

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.node = null;
      this.running = false;
      this.meter = { boost: 0, crackle: 0 };
      this.volume = 0.75;
      this.bassDb = 2;
      this.cabin = true;
      this._resumeOnTouch = () => this.resume();
      this._samples = {}; // id nagrania -> Promise dekodowania (raz na sesję)
    }

    async init() {
      const Ctx = g.AudioContext || g.webkitAudioContext;
      const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));
      await loadWorklet(ctx);

      this.node = new AudioWorkletNode(ctx, 'maxriven-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.onmessage = (e) => { if (e.data.type === 'meter') this.meter = e.data; };
      this.P = { rpm: this.node.parameters.get('rpm'), thr: this.node.parameters.get('throttle'), cut: this.node.parameters.get('cut') };

      const bq = (type, f, q, gain) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (gain != null) n.gain.value = gain; return n; };
      this.hp1 = bq('highpass', 28, 0.54);
      this.hp2 = bq('highpass', 28, 1.31); // razem Butterworth 4. rzędu
      this.bass = bq('lowshelf', 95, 0.7, this.bassDb);
      this.box = bq('peaking', 260, 1.1, 0);
      this.presence = bq('peaking', 2800, 0.9, 0);
      this.air = bq('highshelf', 9500, 0.7, 0);
      this.gain = ctx.createGain();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -9;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.14;
      this.soft = ctx.createWaveShaper();
      this.soft.curve = softCurve();
      this.soft.oversample = '2x';
      this.out = ctx.createGain();
      this.out.gain.value = 0.92;

      this.node.connect(this.hp1);
      chain(this.hp1, this.hp2, this.bass, this.box, this.presence, this.air, this.gain, this.limiter, this.soft, this.out, ctx.destination);
      this.applyCabin();
      this.setVolume(this.volume);

      // uśpienie / zmiana karty / przerwanie przez system
      ctx.onstatechange = () => { if (this.running && ctx.state !== 'running') this.armTouchResume(); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.running) this.resume(); });
    }

    async start(engine) {
      if (!this.ctx) await this.init();
      await this.ctx.resume();
      this.setEngine(engine);
      if (engine.sound.type === 'sample') await this.loadSample(engine.sound.sample);
      this.node.port.postMessage({ type: 'run', on: true });
      this.running = true;
    }

    stop() {
      if (!this.ctx) return;
      this.running = false;
      this.node.port.postMessage({ type: 'run', on: false });
      const ctx = this.ctx;
      setTimeout(() => { if (!this.running) ctx.suspend(); }, 250);
    }

    resume() {
      if (this.ctx && this.running && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    }

    armTouchResume() {
      g.addEventListener('pointerdown', this._resumeOnTouch, { once: true, capture: true });
      this.resume();
    }

    setEngine(engine) {
      if (!this.node) return;
      // preset może dojść przed nagraniem — worklet gra ciszę, dopóki nagranie nie przyjdzie
      this.node.port.postMessage({ type: 'preset', sound: MX.soundFor(engine) });
      if (engine.sound.type === 'sample') this.loadSample(engine.sound.sample);
    }

    // Prawdziwe nagranie: MP3 osadzone w js/samples.js -> decodeAudioData -> bufory do workletu.
    loadSample(id) {
      if (this._samples[id]) return this._samples[id];
      const src = MX.SAMPLES && MX.SAMPLES[id];
      if (!src) return Promise.reject(new Error('Brak nagrania ' + id));
      const bin = atob(src.mp3), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const p = this.ctx.decodeAudioData(bytes.buffer).then((buf) => {
        const L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
        this.node.port.postMessage({ type: 'sample', id: id, L: L, R: R, rpm: src.rpm }, [L.buffer, R.buffer]);
      });
      p.catch((err) => { console.error('Nie udało się zdekodować nagrania', id, err); delete this._samples[id]; });
      this._samples[id] = p;
      return p;
    }

    set(rpm, throttle, cut) {
      if (!this.ctx || !this.running) return;
      const t = this.ctx.currentTime;
      this.P.rpm.setTargetAtTime(rpm, t, 0.012);
      this.P.thr.setTargetAtTime(throttle, t, 0.02);
      this.P.cut.setTargetAtTime(cut, t, 0.002);
    }

    setVolume(v) {
      this.volume = v;
      if (this.ctx) this.gain.gain.setTargetAtTime(v * v * VOL_MAX, this.ctx.currentTime, 0.03);
    }

    setBass(db) {
      this.bassDb = db;
      if (this.ctx) this.bass.gain.setTargetAtTime(db, this.ctx.currentTime, 0.05);
    }

    // EQ pod głośniki kabiny: mniej dudnienia ~260 Hz, trochę więcej czytelności, łagodniejsza góra
    setCabin(on) { this.cabin = on; this.applyCabin(); }
    applyCabin() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime, on = this.cabin;
      this.box.gain.setTargetAtTime(on ? -3 : 0, t, 0.05);
      this.presence.gain.setTargetAtTime(on ? 1.5 : 0, t, 0.05);
      this.air.gain.setTargetAtTime(on ? -2.5 : 0, t, 0.05);
    }
  }

  // Kod workletu jest w js/worklet.js jako zwykła funkcja — tu zamieniamy go na moduł.
  // Z file:// Chrome blokuje moduły z Blob URL (origin „null”), ale przyjmuje data: URL;
  // na http(s) działają oba. Próbujemy po kolei.
  async function loadWorklet(ctx) {
    const src = '(' + g.MAXRIVEN_ENGINE_WORKLET.toString() + ')();';
    const dataUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
    try {
      await ctx.audioWorklet.addModule(dataUrl);
      return;
    } catch (err) {
      console.warn('Worklet z data: URL nie wszedł, próbuję Blob URL', err);
    }
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  }

  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); }

  // liniowo do −3 dBFS, powyżej łagodne nasycenie do 0 dBFS
  function softCurve() {
    const n = 2048, c = new Float32Array(n), knee = 0.7;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
      const y = ax <= knee ? ax : knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee));
      c[i] = Math.sign(x) * y;
    }
    return c;
  }

  MX.AudioEngine = AudioEngine;

  // Ekran nie gaśnie podczas jazdy (jeśli przeglądarka to wspiera).
  MX.WakeLock = {
    lock: null,
    wanted: false,
    async request() {
      this.wanted = true;
      try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch (e) { /* brak wsparcia lub odmowa */ }
    },
    release() { this.wanted = false; if (this.lock) this.lock.release().catch(() => {}); this.lock = null; },
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden && MX.WakeLock.wanted) MX.WakeLock.request(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
