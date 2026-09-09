import fs from 'node:fs';

function cut(file, startMark, endMark, replacement) {
  const p = 'src/' + file;
  let s = fs.readFileSync(p, 'utf8');
  const i = s.indexOf(startMark);
  if (i < 0) { console.log('SKIP(start)', file, startMark.slice(0, 45)); return; }
  const j = s.indexOf(endMark, i);
  if (j < 0) { console.log('SKIP(end)', file, endMark.slice(0, 45)); return; }
  const n = s.length;
  fs.writeFileSync(p, s.slice(0, i) + replacement + s.slice(j));
  console.log('OK', file, '-' + (n - (s.slice(0, i) + replacement + s.slice(j)).length));
}
function rep(file, a, b, must = 1) {
  const p = 'src/' + file;
  let s = fs.readFileSync(p, 'utf8');
  const c = s.split(a).length - 1;
  if (c !== must) { console.log('SKIP(rep ' + c + '/' + must + ')', file, a.slice(0, 45)); return; }
  fs.writeFileSync(p, s.split(a).join(b));
  console.log('OK rep', file, a.slice(0, 40));
}

// 1) sahte onay belgeleri (mockupFor) tamamen
cut('main.js',
  "/* ---------- approval mockups — show AJ exactly what he's approving ---------- */",
  "/* ---------- approvals: agent STUCK",
  "/* (sahte onay belgeleri mockupFor() söküldü — gösterilecek belge yalnızca gerçek çıktıdır) */\n\n");

// 2) sahte olay üreteci
cut('main.js',
  "function weightedEv(evs) {",
  "function planMeeting(now) {",
  "// (sahte olay üreteci weightedEv/fireAgentEvent söküldü)\n");

console.log('---');
