/* Autotest w prawdziwym Chrome: otwiera index.html przez file:// (dokładnie jak dwuklik),
   klika jak człowiek (zdarzenia myszy przez DevTools Protocol) i sprawdza:
   start dźwięku, każdy silnik, przegazówkę, scenariusze, panel dźwięku, tryb GPS, błędy konsoli.
   Użycie: node tools/selftest.js [--show]   (--show = widoczne okno zamiast headless) */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const SHOTS = path.join(ROOT, 'samples', 'zrzuty');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let done = false;
const errors = [];
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info || '' });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`);
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mxe-test-'));
  const args = [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1920,1200', '--hide-scrollbars', 'about:blank',
  ];
  if (!process.argv.includes('--show')) args.unshift('--headless=new');
  chrome = spawn(CHROME, args, { stdio: 'ignore' });
  chrome.on('exit', (code) => { if (code && !done) { console.error('Chrome się zamknął (port zajęty?)'); process.exit(4); } });

  let list;
  for (let i = 0; i < 50 && !list; i++) {
    await sleep(200);
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (e) { /* jeszcze startuje */ }
  }
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception.description);
    return r.result.result.value;
  };
  listeners.push((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1200, deviceScaleFactor: 1, mobile: false });

  async function click(sel) {
    const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    if (!r) throw new Error('brak elementu ' + sel);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
  }
  async function hold(sel, ms) {
    const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await sleep(ms);
    const during = await state();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    return during;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
  }
  const state = () => evaluate(`(() => { const s = __mx.ctl.state; return { kmh: s.kmh, rpm: s.rpm, gear: s.gear, thr: s.throttle, mode: s.mode, scn: s.scenario, gps: s.gpsStatus,
    ctx: __mx.audio.ctx && __mx.audio.ctx.state, running: __mx.audio.running, preset: __mx.audio.meter.id, boost: __mx.audio.meter.boost,
    drive: !document.getElementById('drive').hidden, status: document.getElementById('status').textContent, level: window.__level ? window.__level() : -1 }; })()`);

  // --- 1. otwarcie przez file:// ---
  const url = 'file://' + path.join(ROOT, 'index.html');
  await send('Page.navigate', { url });
  await sleep(1200);
  const proto = await evaluate('location.protocol');
  check('Strona otwarta przez file://', proto === 'file:', url);
  check('Ekran wyboru: 7 kart silników', (await evaluate('document.querySelectorAll(".card").length')) === 7);
  check('Font logo osadzony', await evaluate('document.fonts.check("40px \\"MX Logo\\"")'));
  await shot('app-wybor.png');
  await evaluate("localStorage.setItem('mxe.mode', JSON.stringify('sim')); true");

  // --- 2. każdy silnik: start, przegazówka, 0–100, stop ---
  const engines = await evaluate('MX.ENGINES.map((e) => ({ id: e.id, name: e.name, idle: e.drive.idle, red: e.drive.redline, turbo: !!e.sound.turbo }))');
  for (const e of engines) {
    await click(`.card[data-engine="${e.id}"]`);
    await click('#start');
    await sleep(900);
    if (e === engines[0] && !(await evaluate('!!(__mx.audio.out)'))) {
      console.log('Tor audio niezbudowany. Błędy:', errors, await evaluate('document.getElementById("toast").textContent'));
      chrome.kill();
      process.exit(3);
    }
    if (e === engines[0]) {
      // miernik poziomu na wyjściu toru audio (tylko do testu)
      await evaluate(`(() => { const a = __mx.audio, an = a.ctx.createAnalyser(); an.fftSize = 2048; a.out.connect(an); const buf = new Float32Array(2048);
        window.__level = () => { an.getFloatTimeDomainData(buf); let s = 0, p = 0; for (const x of buf) { s += x * x; p = Math.max(p, Math.abs(x)); } return Math.round(20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9)); }; return true; })()`);
    }
    let s, t0 = Date.now();
    for (;;) { s = await state(); if (s.preset === e.id || Date.now() - t0 > 4000) break; await sleep(100); }
    check(`${e.name}: dźwięk wystartował, gra właściwy silnik`, s.ctx === 'running' && s.running && s.preset === e.id && s.drive, `AudioContext ${s.ctx}, preset w syntezie: ${s.preset}, po ${((Date.now() - t0) / 1000 + 0.9).toFixed(1)} s`);
    let idleP = 0;
    for (let k = 0; k < 6; k++) { await sleep(120); idleP += Math.pow(10, (await evaluate('window.__level()')) / 10); }
    const idleLvl = Math.round(10 * Math.log10(idleP / 6));
    if (e.id !== 'b4r') check(`${e.name}: jałowy wyraźnie słyszalny`, idleLvl > -36, `${idleLvl} dBFS`);
    const revving = await hold('#rev', 900);
    check(`${e.name}: przegazówka na postoju`, revving.rpm > e.idle * 3 && revving.gear === 0, `${Math.round(revving.rpm)} obr/min`);
    await sleep(700);
    await click('[data-scn="launch"]');
    let maxRpm = 0, maxGear = 0, maxKmh = 0, maxBoost = 0, maxLvl = -200, nan = false;
    for (let i = 0; i < 22; i++) {
      await sleep(400);
      s = await state();
      if (!isFinite(s.rpm) || !isFinite(s.kmh)) nan = true;
      maxRpm = Math.max(maxRpm, s.rpm); maxGear = Math.max(maxGear, s.gear); maxKmh = Math.max(maxKmh, s.kmh); maxBoost = Math.max(maxBoost, s.boost || 0);
      if (s.level > -200) maxLvl = Math.max(maxLvl, s.level);
      if (e.id === 'b6' && i === 5) await shot('app-jazda-symulator.png');
    }
    check(`${e.name}: scenariusz 0–100`, !nan && maxKmh > 95 && maxGear >= 2 && maxRpm > e.red * 0.85, `${Math.round(maxKmh)} km/h, bieg ${maxGear}, max ${Math.round(maxRpm)} obr/min`);
    if (e.turbo) check(`${e.name}: turbo się rozkręca`, maxBoost > 0.5, `doładowanie ${maxBoost.toFixed(2)}`);
    if (e === engines[0]) check('Sygnał na wyjściu audio', maxLvl > -40 && maxLvl < 0, `jałowy ${idleLvl} dBFS, jazda do ${maxLvl} dBFS`);
    if (e.id === 'b4r') check('Prawdziwe nagranie zdekodowane i gra', (await evaluate('!!__mx.audio._samples.frs')) && maxLvl > -40, `nagranie frs, jazda do ${maxLvl} dBFS`);
    await click('#stop');
    await sleep(400);
    s = await state();
    check(`${e.name}: STOP wraca do wyboru`, !s.drive && !s.running);
  }

  // --- 3. wszystkie scenariusze, panel dźwięku, test GPS 1 Hz, tryb GPS ---
  await click('.card[data-engine="v8cp"]');
  await click('#start');
  await sleep(800);
  for (const id of ['city', 'highway', 'brake', 'launch']) {
    await click(`[data-scn="${id}"]`);
    const kmh = [];
    for (let i = 0; i < 8; i++) { await sleep(500); kmh.push(Math.round((await state()).kmh)); }
    const s = await state();
    check(`Scenariusz „${id}”`, s.scn === id || kmh.some((k, i) => i && k !== kmh[0]), `km/h: ${kmh.join(' → ')}`);
  }
  await click('#openSound');
  await evaluate("(() => { const v = document.getElementById('vol'); v.value = 40; v.dispatchEvent(new Event('input')); const b = document.getElementById('bass'); b.value = 6; b.dispatchEvent(new Event('input')); return true; })()");
  await click('#cabin');
  const snd = await evaluate("({ vol: __mx.audio.volume, bass: __mx.audio.bassDb, cabin: __mx.audio.cabin, saved: localStorage.getItem('mxe.volume') })");
  check('Panel dźwięku: głośność, bas, EQ kabiny', snd.vol === 0.4 && snd.bass === 6 && snd.cabin === false && snd.saved === '0.4', JSON.stringify(snd));
  await shot('app-panel-dzwieku.png');
  await click('#closeSound');
  await click('[data-act="gpstest"]');
  await click('[data-scn="highway"]');
  const kf = [];
  for (let i = 0; i < 10; i++) { await sleep(300); kf.push((await state()).kmh); }
  const steps = kf.slice(1).map((k, i) => Math.abs(k - kf[i]));
  check('Test GPS 1 Hz: prędkość płynna (filtr Kalmana)', Math.max(...steps) < 6 && kf[kf.length - 1] > kf[0], `skoki co 0,3 s maks. ${Math.max(...steps).toFixed(1)} km/h`);
  await click('[data-act="gpstest"]');

  // tryb GPS z podstawioną pozycją (jazda ok. 72 km/h na wschód)
  await send('Browser.grantPermissions', { permissions: ['geolocation'] }).catch(() => {});
  await click('[data-mode="gps"]');
  let lon = 21.0;
  for (let i = 0; i < 9; i++) {
    lon += 0.000294; // ok. 20 m na sekundę
    await send('Emulation.setGeolocationOverride', { latitude: 52.23, longitude: lon, accuracy: 5 });
    await sleep(1000);
  }
  const g = await state();
  check('Tryb GPS: prędkość z pozycji (bez coords.speed)', g.mode === 'gps' && g.kmh > 40 && g.kmh < 110, `${Math.round(g.kmh)} km/h, status „${g.status}”`);
  await shot('app-jazda-gps.png');
  await click('[data-mode="sim"]');

  // wznowienie po uśpieniu / zmianie karty: system wstrzymuje AudioContext, aplikacja ma go obudzić
  await evaluate("window.__states = []; __mx.audio.ctx.addEventListener('statechange', () => __states.push(__mx.audio.ctx.state)); __mx.audio.ctx.suspend().then(() => true)");
  await evaluate("document.dispatchEvent(new Event('visibilitychange')); true");
  await sleep(700);
  const states = await evaluate('__states');
  check('Wznowienie dźwięku po uśpieniu karty', states.includes('suspended') && (await evaluate('__mx.audio.ctx.state')) === 'running', `stany: ${states.join(' → ')} → teraz ${await evaluate('__mx.audio.ctx.state')}`);
  await click('#stop');

  // --- 4. błędy w konsoli ---
  await sleep(300);
  check('Brak błędów w konsoli', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : '0 błędów');

  done = true;
  ws.close();
  chrome.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} testów OK`);
  fs.writeFileSync(path.join(ROOT, 'samples', 'selftest.json'), JSON.stringify({ when: new Date().toISOString(), results, errors }, null, 2));
  process.exit(failed ? 1 : 0);
}

let chrome;
main().catch((e) => { console.error(e); if (chrome) chrome.kill(); process.exit(2); });
