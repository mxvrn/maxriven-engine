/* Wycina odcinek pełnego obciążenia z nagrania hamowni i osadza go jako MP3 w js/samples.js
   (zwykły skrypt, więc działa też z file://). Wymaga ffmpeg z libmp3lame.
   Źródło: Freesound #183654 „DynoJet Scion FR-S” (dezoris), licencja CC0 — samples/freesound/183654.mp3.
   Mapa obrotów: dopasowanie do harmonicznych półrzędu (błąd ok. 30 obr/min), czas liczony od początku całego nagrania. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');

const CUT = 3.9, LEN = 19.3; // zapas 0,1 s na krawędziach, żeby ziarna nie wychodziły poza nagranie
const mp3 = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(CUT), '-t', String(LEN), '-i', path.join(root, 'samples/freesound/183654.mp3'),
  '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k', '-f', 'mp3', '-'], { maxBuffer: 1 << 26 });

const sample = {
  id: 'frs',
  credit: 'Scion FR-S (bokser 2.0) na hamowni — Freesound #183654, dezoris, CC0',
  // rpm(t) = c0 + c1·t + c2·t², t = czas w wyciętym pliku + offset
  rpm: { c: [601.78, 295.875, 0.185], offset: CUT, from: 0.1, to: 19.1 },
  mp3: mp3.toString('base64'),
};
fs.writeFileSync(path.join(root, 'js/samples.js'),
  `/* wygenerowane przez tools/embed-sample.js — prawdziwe nagranie silnika (CC0) */\n` +
  `(function (g) { (g.MX = g.MX || {}).SAMPLES = Object.assign(g.MX.SAMPLES || {}, { ${sample.id}: ${JSON.stringify(sample)} }); })(typeof window !== 'undefined' ? window : globalThis);\n`);
console.log('js/samples.js', Math.round(sample.mp3.length / 1024), 'KB base64');
