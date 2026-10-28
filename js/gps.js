/* MAXRIVEN ENGINE — prędkość z GPS.
   GPS daje ok. 1 próbkę/s, więc prędkość i przyspieszenie śledzi filtr Kalmana [v, a]:
   predykcja 60×/s między próbkami, korekta przy każdej nowej pozycji. */
(function (g) {
  'use strict';
  const MX = (g.MX = g.MX || {});

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  class SpeedKalman {
    constructor() { this.reset(); }
    reset() {
      this.v = 0; this.a = 0;
      this.out = 0; this.aOut = 0; // wygładzone wyjście: korekty rozłożone w czasie, bez schodków
      this.P = [4, 0, 0, 4];
      this.q = 3.0; // gęstość widmowa szarpnięcia [m²/s⁵] — ile „wolno” zmieniać przyspieszenie
    }
    predict(dt) {
      const [p00, p01, p10, p11] = this.P;
      this.v += this.a * dt;
      const q = this.q, d2 = dt * dt, d3 = d2 * dt;
      this.P = [
        p00 + dt * (p10 + p01) + d2 * p11 + (q * d3) / 3,
        p01 + dt * p11 + (q * d2) / 2,
        p10 + dt * p11 + (q * d2) / 2,
        p11 + q * dt,
      ];
      if (this.v < 0) { this.v = 0; if (this.a < 0) this.a = 0; }
      this.out = Math.max(0, this.out + this.a * dt + (this.v - this.out) * (1 - Math.exp(-dt / 0.35)));
      this.aOut += (this.a - this.aOut) * (1 - Math.exp(-dt / 0.3));
    }
    set(v) { this.v = this.out = v; this.a = this.aOut = 0; }
    update(z, sigma) {
      const [p00, p01, p10, p11] = this.P;
      const s = p00 + sigma * sigma;
      const k0 = p00 / s, k1 = p10 / s;
      const y = z - this.v;
      this.v += k0 * y;
      this.a = clamp(this.a + k1 * y, -9, 9);
      this.P = [(1 - k0) * p00, (1 - k0) * p01, p10 - k1 * p00, p11 - k1 * p01];
    }
  }
  MX.SpeedKalman = SpeedKalman;

  function haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  class GpsSpeed {
    constructor() {
      this.kf = new SpeedKalman();
      this.watchId = null;
      this.last = null;
      this.lastFixAt = 0;
      this.status = 'off';
      this.accuracy = null;
      this.onStatus = null;
    }

    get v() { return this.kf.out < 0.35 ? 0 : this.kf.out; }
    get a() { return this.kf.out < 0.35 ? 0 : this.kf.aOut; }

    start() {
      if (this.watchId != null) return;
      if (!('geolocation' in navigator)) { this.setStatus('unsupported'); return; }
      this.setStatus('waiting');
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.onFix(pos),
        (err) => this.setStatus(err.code === 1 ? 'denied' : 'nosignal'),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    }

    stop() {
      if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.last = null;
      this.kf.reset();
      this.setStatus('off');
    }

    setStatus(s) { if (s !== this.status) { this.status = s; if (this.onStatus) this.onStatus(s); } }

    onFix(pos) {
      const c = pos.coords;
      const now = performance.now();
      this.accuracy = c.accuracy;
      let z = null, sigma = 0.6;
      if (c.speed != null && !isNaN(c.speed) && c.speed >= 0) {
        z = c.speed;
        sigma = c.speedAccuracy != null && c.speedAccuracy > 0 ? Math.max(0.25, c.speedAccuracy) : 0.6;
      } else if (this.last && c.accuracy < 35) {
        const dt = (pos.timestamp - this.last.timestamp) / 1000;
        if (dt > 0.2 && dt < 5) {
          z = haversine(this.last.coords, c) / dt;
          sigma = Math.max(0.8, (c.accuracy + this.last.coords.accuracy) / (2 * dt) * 0.5);
        }
      }
      this.last = { coords: { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy }, timestamp: pos.timestamp };
      if (z != null) {
        // pierwsza próbka po dłuższej przerwie: ustaw bez „dojeżdżania”
        if (now - this.lastFixAt > 6000) this.kf.set(z);
        this.kf.update(z, sigma);
      }
      this.lastFixAt = now;
      this.setStatus('ok');
    }

    // wywoływane 60×/s
    tick(dt) {
      const age = (performance.now() - this.lastFixAt) / 1000;
      if (this.status === 'ok' && age > 4) this.setStatus('nosignal');
      if (age > 2.5) this.kf.a *= Math.exp(-dt / 0.6); // bez świeżych danych nie ekstrapoluj w nieskończoność
      this.kf.predict(dt);
    }
  }
  MX.GpsSpeed = GpsSpeed;
})(typeof window !== 'undefined' ? window : globalThis);
