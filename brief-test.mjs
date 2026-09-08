// brief-test.mjs — PATRON testi: tek talimat → iş bölümü → kara tahta → birleştirilmiş cevap
const B = 'http://localhost:4520';
const j = async (p, o) => { const r = await fetch(B + p, o); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const post = (p, b) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
const ts = () => new Date().toISOString().slice(11, 19);

await j('/api/blackboard', { method: 'DELETE' });               // temiz tahtayla başla
console.log(ts(), 'BRIEF gonderiliyor...');
const t0 = Date.now();
const r = await post('/api/brief', { dept: 'marketing', text: 'Sonbahar indirimi için küçük bir kampanya hazırla: kime, hangi mesajla, hangi kanaldan.' });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (r.s !== 200) { console.log('HATA', r.s, JSON.stringify(r.j).slice(0, 300)); process.exit(0); }

console.log(ts(), `PLAN (${secs}s):`, r.j.why);
for (const s of r.j.steps) {
  const tag = s.error ? 'HATA' : s.waiting ? 'SORU' : 'OK';
  console.log(`  [${tag}] ${s.name} — ${s.title}`);
  if (s.waiting) console.log(`         ❓ ${s.question}`);
  else if (s.result) console.log('         ' + String(s.result).replace(/\n/g, ' ').slice(0, 130));
}
console.log('\n--- KARA TAHTA ---');
const bbd = await j('/api/blackboard?n=20');
for (const row of bbd.j.rows || []) console.log(`  [${row.kind}] ${row.agentName}: ${row.text.slice(0, 110)}`);

console.log('\n--- PATRONUN BIRLESIK CEVABI ---');
console.log(String(r.j.summary || '(yok)').slice(0, 700));

const o = await j('/api/ops');
console.log('\n--- DEFTER ---');
for (const a of (o.j.agents || []).filter(x => x.calls)) console.log(`  ${a.name} | ${JSON.stringify(a.engines || {})} | $${a.costUSD.toFixed(4)}`);
console.log('BITTI');
