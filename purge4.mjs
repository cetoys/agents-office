import fs from 'node:fs';

// 1) data.js: sahte İngilizce koltuk adlarını GERÇEK kadro adlarıyla değiştir
const real = JSON.parse(fs.readFileSync('office.agents.local.json', 'utf8'));
const seats = real.seats || real.agents || real;
const byId = new Map((Array.isArray(seats) ? seats : Object.values(seats)).map(a => [a.id, a]));

let d = fs.readFileSync('src/data.js', 'utf8');
let renamed = 0, missing = [];
d = d.replace(/\{ id: '([a-z0-9]+)', name: '([^']*)'/g, (m, id, name) => {
  const a = byId.get(id);
  if (!a) { missing.push(id); return m; }
  renamed++;
  return `{ id: '${id}', name: ${JSON.stringify(a.name)}`;
});
console.log('ad değişti:', renamed, '| kadroda yok:', missing.join(',') || '-');

// 2) data.js: sahte onay ve masa-ekranı metin havuzlarını sil
function cut(s, startMark, endMark, replacement) {
  const i = s.indexOf(startMark); if (i < 0) { console.log('SKIP start', startMark.slice(0, 30)); return s; }
  const j = endMark ? s.indexOf(endMark, i) : s.length;
  if (j < 0) { console.log('SKIP end', endMark.slice(0, 30)); return s; }
  return s.slice(0, i) + replacement + s.slice(j);
}
d = cut(d, 'export const APPROVAL_ASKS = {', 'export const BILLBOARDS',
  '// GERÇEK-VERİ KURALI: APPROVAL_ASKS / APPROVAL_BY_AGENT (uydurma onay istekleri) söküldü.\n// Onay istegi yalnizca ajanin gercekten sordugu SORU ile olusur.\n');
d = cut(d, 'export const WORKLINES = {', null,
  '// GERÇEK-VERİ KURALI: WORKLINES (masa ekranlarindaki uydurma "is akiyor" satirlari) söküldü.\n// Masa ekrani artik gercek gorev basligini gosterir; is yoksa "○ bosta" yazar.\n');
fs.writeFileSync('src/data.js', d);
console.log('data.js yazildi');

// 3) v1data.js: artik hicbir yerden import edilmiyor — icerigini bosalt
fs.writeFileSync('src/v1data.js',
  '// GERÇEK-VERİ KURALI (9 Eylul 2026): bu dosya uydurma bir sirketin verisiydi —\n' +
  '// hayali musteriler, hazir ajan cevaplari, sahte teklifler, sahte KPI\'lar.\n' +
  '// Hicbir yerden import edilmiyor. Icerigi silindi; dosya yalnizca gecmis referans icin duruyor.\n' +
  'export const V1 = [];\n' +
  'export const FILE_GEN = {};\n' +
  'export const STATS = {};\n' +
  'export const KPIS = [];\n' +
  'export const P = { co: [] };\n' +
  'export const rnd = (a) => a[Math.floor(Math.random() * a.length)];\n' +
  'export const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));\n' +
  'export const person = () => "";\n' +
  'export const money = (n) => "$" + n;\n');
console.log('v1data.js bosaltildi');
