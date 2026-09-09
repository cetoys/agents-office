import fs from 'node:fs';
const real = JSON.parse(fs.readFileSync('office.agents.local.json', 'utf8'));
const seats = real.seats || real.agents || real;
const byId = new Map((Array.isArray(seats) ? seats : Object.values(seats)).map(a => [a.id, a]));

let d = fs.readFileSync('src/data.js', 'utf8');
let n = 0; const miss = [];
d = d.replace(/\{\s*id:\s*'([a-z0-9]+)',(\s*)name:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
  (m, id, sp, cur) => {
    const a = byId.get(id);
    if (!a) { miss.push(id); return m; }
    if (JSON.parse(cur.replace(/^'|'$/g, '"')) === a.name) return m;
    n++;
    return `{ id: '${id}',${sp}name: ${JSON.stringify(a.name)}`;
  });
console.log('ad duzeltildi:', n, '| kadroda yok:', miss.join(',') || '-');

// APPROVAL_ASKS ... APPROVAL_BY_AGENT sonuna kadar sil
const i = d.indexOf('export const APPROVAL_ASKS = {');
if (i >= 0) {
  const j = d.indexOf('export const', i + 10);
  const k = d.indexOf('export const', j + 10); // APPROVAL_BY_AGENT'ten sonraki
  const end = k >= 0 ? k : d.length;
  d = d.slice(0, i) +
    '// GERCEK-VERI KURALI: APPROVAL_ASKS / APPROVAL_BY_AGENT (uydurma onay istekleri) sokuldu.\n' +
    '// Onay istegi yalnizca ajanin gercekten sordugu SORU ile olusur.\n\n' + d.slice(end);
  console.log('APPROVAL_* silindi');
} else console.log('APPROVAL_* zaten yok');

fs.writeFileSync('src/data.js', d);
console.log('tamam');
