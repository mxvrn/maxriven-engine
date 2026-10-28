/* Osadza font logo w CSS jako data URI — przeglądarki potrafią blokować fonty z file://. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const otf = fs.readFileSync(path.join(root, 'fonts/Ethnocentric-Regular.otf')).toString('base64');
fs.writeFileSync(path.join(root, 'css/font.css'),
  `/* wygenerowane przez tools/embed-font.js */\n@font-face {\n  font-family: 'MX Logo';\n  src: url(data:font/otf;base64,${otf}) format('opentype');\n  font-display: block;\n}\n`);
console.log('css/font.css', Math.round(otf.length / 1024), 'KB');
