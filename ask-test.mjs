// ask-test.mjs — ajan bilgi eksikse teslimat yerine SORU sormalı, görev "waiting"e düşmeli,
// sahibi cevaplayınca kaldığı yerden bitirmeli.
const B = 'http://localhost:4520';
const j = async (p, o) => { const r = await fetch(B + p, o); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const post = (p, b) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
const ts = () => new Date().toISOString().slice(11, 19);

const a = await post('/api/tasks', { dept: 'emails', text: 'Fiyat artışını müşteriye bildiren bir e-posta yaz. Yeni fiyatı ben sana söylemedim.' });
console.log(ts(), 'ROUTE', a.s, '->', a.j.agent, '|', a.j.title);
if (!a.j.id) process.exit(0);

const b = await post(`/api/tasks/${a.j.id}/run`);
console.log(ts(), 'RUN', b.s, '| durum:', b.j.state, b.j.question ? '\n  ❓ SORU: ' + b.j.question : '\n  (soru sormadı, teslimat yazdı)');

if (b.j.state !== 'waiting') { console.log('SONUC: soru yolu tetiklenmedi'); process.exit(0); }

const live = await j('/api/live');
console.log(ts(), 'CANLI bekleyenler:', JSON.stringify(live.j.waiting));

await post(`/api/tasks/${a.j.id}/answer`, { answer: 'Yeni fiyat aylık 149 dolar, 1 Ekim 2026 itibarıyla geçerli.' });
console.log(ts(), 'CEVAP verildi, devam ediliyor...');
const c = await post(`/api/tasks/${a.j.id}/run`);
console.log(ts(), 'BITIS', c.s, '| durum:', c.j.state, '|', c.j.error ? 'HATA' : String(c.j.result).length + ' karakter');
if (!c.j.error) console.log('---\n' + String(c.j.result).slice(0, 320) + '\n---');
const bbd = await j('/api/blackboard?n=6');
console.log('TAHTA son satırlar:');
for (const r of (bbd.j.rows || []).slice(-4)) console.log(`  [${r.kind}] ${r.agentName}: ${r.text.slice(0, 100)}`);
console.log('BITTI');
