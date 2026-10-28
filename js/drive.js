/* MAXRIVEN ENGINE — wirtualny układ napędowy.
   Z prędkości auta i szacowanego gazu liczy bieg, obroty, odcięcie zapłonu i obciążenie,
   które idą do syntezy. Bez DOM — działa też w Node (narzędzia renderujące próbki). */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const follow = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

  // Opór toczenia + aerodynamika w m/s² (auto ok. 1700 kg).
  MX.resistance = (v) => 0.12 + 0.00042 * v * v;
  // Obciążenie potrzebne, żeby utrzymać stałą prędkość.
  MX.cruiseLoad = (v) => clamp(0.1 + MX.resistance(v) * 0.42, 0.1, 0.5);
  // Maksymalne przyspieszenie przy pełnym gazie dla danego silnika.
  MX.maxAccel = (v, power) => Math.min(8.5, power / (v + 5));

  // Szacowanie gazu z prędkości i przyspieszenia (tryb GPS).
  class LoadEstimator {
    constructor() { this.load = 0; }
    update(dt, v, a, power) {
      const cruise = MX.cruiseLoad(v);
      let target;
      if (v < 0.5 && Math.abs(a) < 0.3) target = 0;
      else if (a >= 0) target = cruise + (1 - cruise) * clamp(a / MX.maxAccel(v, power), 0, 1);
      else target = cruise * clamp(1 + a / 0.6, 0, 1);
      this.load = follow(this.load, target, dt, target > this.load ? 0.15 : 0.22);
      return this.load;
    }
  }
  MX.LoadEstimator = LoadEstimator;

  class Drivetrain {
    constructor(engine) { this.setEngine(engine); }

    setEngine(engine) {
      this.engine = engine;
      this.d = engine.drive;
      this.reset();
    }

    reset() {
      const d = this.d;
      this.rpm = d.idle;
      this.gear = 0;
      this.shift = null;
      this.timeInGear = 0;
      this.limCut = 0;
      this.limRest = 0;
      this.thrSlow = 0;
      this.out = { rpm: d.idle, throttle: 0, cut: 0, gear: 0, shifting: false };
    }

    wheelRpm(v, gear) {
      const d = this.d;
      return ((v / (2 * Math.PI * d.tire)) * 60) * d.ratios[gear - 1] * d.final;
    }

    startShift(dir) {
      const d = this.d;
      const manual = d.type === 'manual';
      this.shift = {
        dir: dir,
        t: 0,
        from: this.rpm,
        dur: dir > 0 ? d.shiftTime : d.blipTime * (manual ? 1.3 : 1),
      };
      this.gear += dir;
      this.timeInGear = 0;
    }

    /* dt – krok [s], v – prędkość [m/s], thr – gaz 0..1, accel – przyspieszenie [m/s²] */
    update(dt, v, thr, accel) {
      const d = this.d;
      thr = clamp(thr, 0, 1);
      accel = accel || 0;
      this.thrSlow = follow(this.thrSlow, thr, dt, 0.35);
      this.timeInGear += dt;
      const nG = d.ratios.length;

      let thrOut = thr;
      let cut = 0;

      // sprzęgło: postój = luz, ruszanie = 1. bieg
      if (this.gear === 0 && v > 0.6) { this.gear = 1; this.timeInGear = 0; this.shift = null; }
      if (this.gear > 0 && v < 0.35) { this.gear = 0; this.shift = null; }

      let target;
      if (this.gear === 0) {
        // obroty swobodne: postój, przegazówka przyciskiem
        target = null;
      } else {
        const wheel = this.wheelRpm(v, this.gear);
        if (this.gear === 1) {
          const slip = d.idle + thr * (0.42 * d.redline - d.idle);
          target = wheel < slip ? lerp(slip, wheel, Math.pow(wheel / slip, 2)) : wheel;
        } else {
          target = wheel;
        }
        target = Math.max(target, d.idle);

        // logika zmiany biegów
        if (!this.shift && this.timeInGear > 0.45) {
          const up = d.redline * lerp(d.upLo, 0.975, smoothstep(0.15, 0.95, this.thrSlow));
          let down = d.redline * lerp(d.downLo, d.downHi, smoothstep(0.3, 1, this.thrSlow));
          if (accel < -1.4 && thr < 0.1) down = Math.max(down, d.redline * d.brakeDown);
          const lower = this.gear > 1 ? this.wheelRpm(v, this.gear - 1) : Infinity;
          if (wheel > up && this.gear < nG) {
            this.startShift(+1);
          } else if (this.gear > 1 && wheel < down && lower < up * 0.93) {
            this.startShift(-1);
          } else if (this.gear > 1 && thr > 0.85 && this.thrSlow < 0.6 && lower < d.redline * 0.8 && this.timeInGear > 0.8) {
            this.startShift(-1); // kickdown
          }
        }
      }

      // wykonanie zmiany biegu
      if (this.shift) {
        const sh = this.shift;
        sh.t += dt;
        const k = clamp(sh.t / sh.dur, 0, 1);
        const to = Math.max(d.idle, this.wheelRpm(v, this.gear) * (sh.dir < 0 ? 1.03 : 1));
        this.rpm = lerp(sh.from, to, easeInOut(k));
        if (sh.dir > 0) {
          if (sh.t < d.shiftCut) cut = 1;
          if (d.type === 'manual' || sh.t < d.shiftCut) thrOut = 0;
        } else {
          thrOut = k < 0.7 ? Math.max(thr, 0.72) : thr; // przegazówka
        }
        if (k >= 1) this.shift = null;
      } else if (target == null) {
        // wolne obroty: cel zależny od gazu, asymetryczna bezwładność
        const free = d.idle + (d.limiter * 1.04 - d.idle) * Math.pow(thr, 0.85);
        const diff = free - this.rpm;
        const rate = diff > 0 ? d.freeUp * (0.25 + 0.75 * thr) : d.freeDown * (0.35 + 0.65 * this.rpm / d.redline);
        const step = rate * dt * Math.min(1, Math.abs(diff) / 900);
        this.rpm += Math.sign(diff) * Math.min(Math.abs(diff), step);
      } else {
        this.rpm = follow(this.rpm, Math.min(target, d.limiter + 40), dt, d.inertia);
      }

      // ogranicznik obrotów: odcięcie zapłonu, obroty opadają, potem znowu zapłon
      if (this.limCut > 0) {
        this.limCut -= dt;
        cut = 1;
        this.rpm -= d.freeDown * 0.45 * dt;
        if (this.limCut <= 0) this.limRest = d.limiterCut * 0.7;
      } else {
        if (this.limRest > 0) this.limRest -= dt;
        if (this.rpm >= d.limiter && thrOut > 0.25 && this.limRest <= 0) this.limCut = d.limiterCut;
      }

      this.rpm = clamp(this.rpm, d.idle * 0.6, d.limiter + 60);

      const o = this.out;
      o.rpm = this.rpm;
      o.throttle = thrOut;
      o.cut = cut;
      o.gear = this.gear;
      o.shifting = !!this.shift;
      return o;
    }
  }
  MX.Drivetrain = Drivetrain;
})(typeof window !== 'undefined' ? window : globalThis);
