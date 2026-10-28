/* MAXRIVEN ENGINE — aplikacja: ekran wyboru silnika, ekran jazdy, panel dźwięku. */
(function () {
  'use strict';
  const MX = window.MX;
  const $ = (id) => document.getElementById(id);

  // ustawienia zapamiętane w przeglądarce (bez nich aplikacja też działa)
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mxe.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mxe.' + k, JSON.stringify(v)); } catch (e) { /* tryb prywatny itp. */ } },
  };

  const audio = new MX.AudioEngine();
  audio.volume = store.get('volume', 0.75);
  audio.bassDb = store.get('bass', 2);
  audio.cabin = store.get('cabin', true);
  const ctl = new MX.Controller(audio);
  const cluster = new MX.Cluster($('cluster'));
  let engine = MX.ENGINES.find((e) => e.id === store.get('engine', 'b4r')) || MX.ENGINES[0];
  // pierwszy start: ekran dotykowy (auto) → GPS, komputer → symulator
  let mode = store.get('mode', matchMedia('(pointer: coarse)').matches ? 'gps' : 'sim');
  window.__mx = { ctl, audio, get engine() { return engine; } };

  // ---------- skalowanie projektu 1920×1200 do okna ----------
  const stage = $('stage');
  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1200);
    stage.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1200 * k) / 2}px) scale(${k})`;
  }
  addEventListener('resize', fit);
  fit();

  // ---------- ekran 1: karty silników ----------
  const BOX = { dct: 'DCT', manual: 'manualna', auto: 'automat' };
  const fmt = (n) => n.toLocaleString('pl-PL');
  $('cards').innerHTML = MX.ENGINES.map((e) => `
    <button class="card" data-engine="${e.id}">
      <span class="check"></span>
      <b>${e.name}</b>
      <div class="c-tag">${e.tag}</div>
      <p class="c-desc">${e.desc}</p>
      <div class="c-meta">${e.recorded ? '<span class="badge rec">NAGRANIE</span>' : e.sound.turbo ? '<span class="badge">TURBO</span>' : ''}<span>${e.cylinders} cyl.</span><span>${fmt(e.drive.limiter)} obr/min</span><span>${e.drive.ratios.length} biegów · ${BOX[e.drive.type]}</span></div>
    </button>`).join('');
  function markEngine() { document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.engine === engine.id)); }
  markEngine();
  $('cards').addEventListener('click', (ev) => {
    const c = ev.target.closest('.card');
    if (!c) return;
    engine = MX.ENGINES.find((e) => e.id === c.dataset.engine);
    store.set('engine', engine.id);
    markEngine();
  });

  // ---------- start / stop ----------
  let toastTimer = 0;
  function toast(msg, ms) {
    $('toast').textContent = msg;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), ms || 6000);
  }

  $('start').addEventListener('click', async () => {
    if (!window.AudioWorkletNode) { toast('Ta przeglądarka nie obsługuje AudioWorklet — potrzebny jest aktualny Chrome, Safari albo przeglądarka Tesli.', 9000); return; }
    $('start').disabled = true;
    try {
      ctl.setEngine(engine); // przed audio.start, żeby preset poszedł do syntezy tylko raz
      await audio.start(engine);
    } catch (err) {
      console.error(err);
      toast('Nie udało się uruchomić dźwięku: ' + err.message, 9000);
      $('start').disabled = false;
      return;
    }
    ctl.drive.reset();
    ctl.car.v = 0; ctl.car.target = 0; ctl.car.gas = 0.5;
    ctl.runner.stop();
    cluster.build(engine);
    $('engName').innerHTML = `<b>${engine.name}</b>${engine.tag}`;
    last = {};
    $('pick').hidden = true;
    $('drive').hidden = false;
    ctl.setMode(mode);
    ctl.start();
    MX.WakeLock.request();
    $('start').disabled = false;
  });

  $('stop').addEventListener('click', () => {
    ctl.stop();
    ctl.rev = false;
    audio.stop();
    MX.WakeLock.release();
    $('sheet').hidden = true;
    $('drive').hidden = true;
    $('pick').hidden = false;
  });

  // ---------- tryb GPS / symulator ----------
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    store.set('mode', mode);
    ctl.setMode(mode);
  }));

  // ---------- symulator ----------
  const scns = $('scns');
  scns.innerHTML = MX.SCENARIOS.map((s) => `<button data-scn="${s.id}">${s.name}</button>`).join('') +
    '<button data-act="gpstest">Test GPS 1 Hz</button><button data-act="park">Postój</button>';
  scns.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.scn) ctl.runner.start(MX.SCENARIOS.find((s) => s.id === b.dataset.scn));
    else if (b.dataset.act === 'park') { ctl.runner.stop(); ctl.car.target = 0; ctl.car.gas = 0.3; ctl.car.brake = null; }
    else if (b.dataset.act === 'gpstest') {
      ctl.gpsTest = !ctl.gpsTest;
      ctl.testKf.reset();
      ctl.testKf.set(ctl.car.v);
      b.classList.toggle('on', ctl.gpsTest);
    }
  });
  $('tgt').addEventListener('input', (e) => { ctl.runner.stop(); ctl.car.target = +e.target.value; ctl.car.brake = null; });
  $('gas').addEventListener('input', (e) => { ctl.runner.stop(); ctl.car.gas = +e.target.value / 100; });

  // ---------- przegazówka: trzymanie przycisku ----------
  const rev = $('rev');
  rev.addEventListener('pointerdown', (e) => { rev.setPointerCapture(e.pointerId); ctl.rev = true; rev.classList.add('on'); });
  const revOff = () => { ctl.rev = false; rev.classList.remove('on'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => rev.addEventListener(t, revOff));
  rev.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- panel dźwięku ----------
  const vol = $('vol'), bass = $('bass'), cabin = $('cabin');
  function showSound() {
    vol.value = Math.round(audio.volume * 100);
    bass.value = audio.bassDb;
    $('volLbl').textContent = vol.value + '%';
    $('bassLbl').textContent = (audio.bassDb > 0 ? '+' : '') + audio.bassDb + ' dB';
    cabin.classList.toggle('on', audio.cabin);
  }
  $('openSound').addEventListener('click', () => { showSound(); $('sheet').hidden = false; });
  $('closeSound').addEventListener('click', () => ($('sheet').hidden = true));
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').hidden = true; });
  vol.addEventListener('input', () => { audio.setVolume(vol.value / 100); store.set('volume', audio.volume); showSound(); });
  bass.addEventListener('input', () => { audio.setBass(+bass.value); store.set('bass', audio.bassDb); showSound(); });
  cabin.addEventListener('click', () => { audio.setCabin(!audio.cabin); store.set('cabin', audio.cabin); showSound(); });

  // ---------- odświeżanie ekranu jazdy ----------
  const STATUS = { waiting: 'CZEKAM NA GPS…', denied: 'BRAK ZGODY NA GPS', nosignal: 'BRAK SYGNAŁU GPS', unsupported: 'BRAK GPS', off: 'GPS WYŁĄCZONY' };
  let last = {};
  const set = (key, val, fn) => { if (last[key] !== val) { last[key] = val; fn(val); } };

  ctl.onFrame = (s, dt) => {
    cluster.update(s, dt);
    const status = s.mode === 'sim' ? (ctl.gpsTest ? 'SYMULATOR · TEST GPS' : 'SYMULATOR')
      : s.gpsStatus === 'ok' ? `GPS ±${Math.round(s.gpsAccuracy || 0)} M` : STATUS[s.gpsStatus] || '';
    set('status', status, (x) => {
      const st = $('status');
      st.textContent = x;
      st.classList.toggle('ok', s.mode === 'gps' && s.gpsStatus === 'ok');
      st.classList.toggle('warn', s.mode === 'gps' && s.gpsStatus !== 'ok');
    });
    set('mode', s.mode, (x) => {
      $('drive').classList.toggle('sim', x === 'sim');
      document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === x));
    });
    set('scn', s.scenario, (x) => scns.querySelectorAll('[data-scn]').forEach((b) => b.classList.toggle('on', b.dataset.scn === x)));
    set('revOk', s.stopped, (x) => rev.classList.toggle('off', !x));
    if (s.mode === 'sim') {
      const t = Math.round(ctl.car.target), g = Math.round(ctl.car.gas * 100);
      set('tgt', t, (x) => { $('tgtLbl').textContent = x + ' km/h'; $('tgt').value = x; });
      set('gas', g, (x) => { $('gasLbl').textContent = x + '%'; $('gas').value = x; });
    }
  };
})();
