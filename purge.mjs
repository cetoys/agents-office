import fs from 'node:fs';

function cut(file, startMark, endMark, replacement) {
  const p = 'src/' + file;
  let s = fs.readFileSync(p, 'utf8');
  const i = s.indexOf(startMark);
  if (i < 0) { console.log('SKIP (start yok):', file, JSON.stringify(startMark.slice(0, 40))); return; }
  const j = s.indexOf(endMark, i);
  if (j < 0) { console.log('SKIP (end yok):', file, JSON.stringify(endMark.slice(0, 40))); return; }
  const before = s.length;
  s = s.slice(0, i) + replacement + s.slice(j);
  fs.writeFileSync(p, s);
  console.log('OK', file, '-' + (before - s.length) + ' karakter');
}

// tasks.js — sahte görev havuzu, zincirler, segmentler, v1data bağı
cut('tasks.js',
  "import { P, rnd, ri } from './v1data.js';",
  "// keywords that route a typed task",
  "// (v1data bağı, SEGMENTS ve sahte görev havuzu POOL söküldü — gerçek-veri kuralı)\n\n");

cut('tasks.js',
  "// handoff chains — one piece of work passing desk to desk",
  "function timeStr(ts) {",
  "// (sahte devir zincirleri CHAINS, fill(), vars() söküldü)\n");

console.log('bitti');
