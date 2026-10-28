/* MAXRIVEN ENGINE — symulator jazdy (testy bez auta) i gotowe scenariusze. Bez DOM. */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const follow = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

  // Proste auto: dąży do prędkości docelowej z intensywnością zależną od „gazu”.
  class SimCar {
    constructor() { this.v = 0; this.a = 0; this.thr = 0; this.target = 0; this.gas = 0.5; this.brake = null; }

    update(dt, power, shifting) {
      const vt = this.target / 3.6;
      const diff = vt - this.v;
      const cruise = MX.cruiseLoad(this.v);
      let thr, acc;
      if (diff > 0.3) {
        const want = Math.max(cruise + 0.05, this.gas);
        thr = cruise + (want - cruise) * clamp(diff / 3, 0, 1);
        acc = ((thr - cruise) / (1 - cruise)) * MX.maxAccel(this.v, power);
      } else if (diff < -0.3) {
        thr = 0;
        const dec = this.brake != null ? this.brake * 8 : clamp(-diff * 0.35, 0.9, 4.5);
        acc = -Math.min(dec, -diff * 2.5 + 0.3) - MX.resistance(this.v) * 0.5;
      } else {
        thr = this.v < 0.3 && vt === 0 ? 0 : cruise;
        acc = diff * 1.5;
      }
      if (shifting && acc > 0) acc *= 0.25;
      this.thr = follow(this.thr, thr, dt, 0.1);
      this.a = follow(this.a, acc, dt, 0.08);
      this.v = Math.max(0, this.v + this.a * dt);
      if (vt === 0 && this.v < 0.2) { this.v = 0; this.a = 0; }
    }
  }
  MX.SimCar = SimCar;

  // Kroki: target [km/h], gas 0..1, brake (opcjonalnie, 0..1), hold [s], reach (czekaj na prędkość).
  MX.SCENARIOS = [
    {
      id: 'launch', name: '0–100 ostro',
      steps: [
        { target: 0, gas: 0, hold: 1.2 },
        { target: 100, gas: 1, reach: true },
        { target: 100, gas: 0.3, hold: 2.5 },
        { target: 60, gas: 0, reach: true },
        { target: 60, gas: 0.25, hold: 2 },
      ],
    },
    {
      id: 'city', name: 'Spokojne miasto',
      steps: [
        { target: 0, gas: 0, hold: 1 },
        { target: 50, gas: 0.35, reach: true },
        { target: 50, gas: 0.25, hold: 6 },
        { target: 30, gas: 0, reach: true },
        { target: 30, gas: 0.2, hold: 3 },
        { target: 0, gas: 0, reach: true },
        { target: 0, gas: 0, hold: 3 },
        { target: 40, gas: 0.45, reach: true },
        { target: 50, gas: 0.3, reach: true },
        { target: 50, gas: 0.25, hold: 4 },
        { target: 0, gas: 0, reach: true },
      ],
    },
    {
      id: 'highway', name: 'Autostrada 120',
      steps: [
        { target: 120, gas: 0.6, reach: true },
        { target: 120, gas: 0.3, hold: 6 },
        { target: 145, gas: 0.95, reach: true },
        { target: 120, gas: 0, reach: true },
        { target: 120, gas: 0.3, hold: 8 },
      ],
    },
    {
      id: 'brake', name: 'Hamowanie do zera',
      steps: [
        { target: 130, gas: 1, reach: true },
        { target: 130, gas: 0.3, hold: 1.5 },
        { target: 0, gas: 0, brake: 0.65, reach: true },
        { target: 0, gas: 0, hold: 2.5 },
      ],
    },
  ];

  class ScenarioRunner {
    constructor(car) { this.car = car; this.scn = null; }
    start(scn) { this.scn = scn; this.i = -1; this.next(); }
    stop() { this.scn = null; }
    get active() { return !!this.scn; }
    next() {
      this.i++;
      this.t = 0;
      if (!this.scn || this.i >= this.scn.steps.length) { this.scn = null; return; }
      const st = this.scn.steps[this.i];
      this.car.target = st.target;
      this.car.gas = st.gas != null ? st.gas : 0.3;
      this.car.brake = st.brake != null ? st.brake : null;
    }
    update(dt) {
      if (!this.scn) return;
      const st = this.scn.steps[this.i];
      this.t += dt;
      const reached = Math.abs(this.car.v * 3.6 - st.target) < 1.5;
      if (this.t >= (st.hold || 0) && (!st.reach || reached || this.t > 40)) this.next();
    }
  }
  MX.ScenarioRunner = ScenarioRunner;
})(typeof window !== 'undefined' ? window : globalThis);
