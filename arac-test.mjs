// arac-test.mjs — ajanın kendi araçlarını ve SOP'sini gerçekten kullanıyor mu?
const B = 'http://localhost:4520';
const j = async (p, o) => { const r = await fetch(B + p, o); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const post = (p, b) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
const ts = () => new Date().toISOString().slice(11, 19);

// ARAŞTIRMA bloğu → fikir eleme SOP'si + hugging face/playwright araçları
const a = await post('/api/tasks', { dept: 'emails', text: 'Etsy satıcıları için bir SEO yardımcı uygulaması fikrini ele. Denenmeye değer mi?' });
console.log(ts(), 'ROUTE', a.s, '->', a.j.agent, '|', a.j.title);
if (!a.j.id) { console.log(JSON.stringify(a.j).slice(0,200)); process.exit(0); }

const t0 = Date.now();
const b = await post(`/api/tasks/${a.j.id}/run`);
console.log(ts(), 'SONUC', b.s, ((Date.now()-t0)/1000).toFixed(1)+'s',
  '| durum:', b.j.state,
  '| kullanilan arac:', (b.j.used || []).join(', ') || '(yok)',
  '| skill:', (b.j.skills || []).join(', ') || '(yok)');
if (b.j.question) console.log('  ❓', b.j.question);
else if (b.j.result) console.log('---\n' + String(b.j.result).slice(0, 700) + '\n---');
console.log('BITTI');
