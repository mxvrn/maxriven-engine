/* MAXRIVEN ENGINE — pętla sterowania 60 Hz: źródło prędkości (GPS lub symulator)
   → szacowanie gazu → skrzynia biegów → parametry syntezy → stan dla UI. */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});

  class Controller {
    constructor(audio) {
      this.audio = audio;
      this.mode = 'sim';
      this.gps = new MX.GpsSpeed();
      this.estimator = new MX.LoadEstimator();
      this.car = new MX.SimCar();
      this.runner = new MX.ScenarioRunner(this.car);
      this.testKf = new MX.SpeedKalman();
      this.gpsTest = false;
      this.testTimer = 0;
      this.rev = false;
      this.engine = null;
      this.drive = null;
      this.raf = 0;
      this.lastT = 0;
      this.onFrame = null;
      this.state = { kmh: 0, rpm: 0, gear: 0, throttle: 0, boost: 0, redline: 7000, limiter: 7200, stopped: true };
    }

    setEngine(engine) {
      this.engine = engine;
      if (this.drive) this.drive.setEngine(engine); else this.drive = new MX.Drivetrain(engine);
      this.audio.setEngine(engine);
    }

    setMode(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      if (mode === 'gps') { this.runner.stop(); this.gps.start(); }
      else { this.gps.stop(); this.car.v = 0; this.car.target = 0; }
    }

    start() {
      this.stop();
      if (this.mode === 'gps') this.gps.start();
      this.lastT = performance.now();
      const loop = (t) => { this.raf = requestAnimationFrame(loop); this.tick(t); };
      this.raf = requestAnimationFrame(loop);
      // w tle przeglądarka wstrzymuje requestAnimationFrame — wtedy ratuje nas zwykły timer
      this.bg = setInterval(() => { if (document.hidden) this.tick(performance.now()); }, 100);
    }

    stop() {
      cancelAnimationFrame(this.raf);
      clearInterval(this.bg);
      this.raf = 0;
      this.bg = 0;
      this.gps.stop();
      this.runner.stop();
    }

    tick(now) {
      const dt = Math.min(0.1, Math.max(0.001, (now - this.lastT) / 1000));
      this.lastT = now;
      const eng = this.engine;
      let v, a, thr;

      if (this.mode === 'sim') {
        this.runner.update(dt);
        this.car.update(dt, eng.drive.power, this.drive.out.shifting);
        if (this.gpsTest) {
          // test filtra: symulowany GPS 1 Hz z szumem zamiast idealnej prędkości
          this.testTimer += dt;
          this.testKf.predict(dt);
          if (this.testTimer >= 1) { this.testTimer -= 1; this.testKf.update(Math.max(0, this.car.v + 0.35 * gauss()), 0.5); }
          v = this.testKf.out < 0.35 ? 0 : this.testKf.out;
          a = v ? this.testKf.aOut : 0;
          thr = this.estimator.update(dt, v, a, eng.drive.power);
        } else {
          v = this.car.v; a = this.car.a; thr = this.car.thr;
        }
      } else {
        this.gps.tick(dt);
        v = this.gps.v; a = this.gps.a;
        thr = this.estimator.update(dt, v, a, eng.drive.power);
      }

      const stopped = v < 0.6;
      if (this.rev && stopped) thr = 1;
      const o = this.drive.update(dt, v, thr, a);
      this.audio.set(o.rpm, o.throttle, o.cut);

      const s = this.state;
      s.kmh = v * 3.6;
      s.rpm = o.rpm;
      s.gear = o.gear;
      s.throttle = o.throttle;
      s.cut = o.cut;
      s.boost = this.audio.meter.boost || 0;
      s.turbo = !!eng.sound.turbo;
      s.redline = eng.drive.redline;
      s.limiter = eng.drive.limiter;
      s.stopped = stopped;
      s.mode = this.mode;
      s.gpsStatus = this.gps.status;
      s.gpsAccuracy = this.gps.accuracy;
      s.scenario = this.runner.active ? this.runner.scn.id : null;
      if (this.onFrame) this.onFrame(s, dt);
    }
  }

  function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732; }

  MX.Controller = Controller;
})(typeof window !== 'undefined' ? window : globalThis);
