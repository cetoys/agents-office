// live-test.mjs — bir görevi yerel modelde çalıştır, çalışırken /api/live'ı izle.
const B = 'http://localhost:4520';
const j = async (p, o) => { const r = await fetch(B + p, o); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const post = (p, b) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) });
const ts = () => new Date().toISOString().slice(11, 19);

const a = await post('/api/tasks', { dept: 'marketing', text: 'Write three short subject lines for an autumn sale email. Output only the three lines.' });
console.log(ts(), 'ROUTE', a.s, '->', a.j.agent, '|', a.j.title);
if (!a.j.id) process.exit(0);

let seen = [];
const watcher = setInterval(async () => {
  try { const l = await j('/api/live');
    for (const r of l.j.running || []) {
      const k = r.agent + '|' + r.engine;
      if (!seen.includes(k)) { seen.push(k); console.log(ts(), 'CANLI:', r.name, '| motor', r.engine, '(' + r.kind + ')', '| model', r.model || '-', '| iş:', r.what); }
    }
  } catch {}
}, 1500);

const t0 = Date.now();
const b = await post(`/api/tasks/${a.j.id}/run`);
clearInterval(watcher);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(ts(), 'SONUC', b.s, secs + 's', b.j.error ? 'HATA: ' + String(b.j.result).slice(0, 200) : 'OK ' + String(b.j.result).length + ' karakter');
if (!b.j.error) console.log('---\n' + String(b.j.result).slice(0, 300) + '\n---');

// muhasebe: ajan bazlı motor ve maliyet
const o = await j('/api/ops');
for (const ag of (o.j.agents || []).filter(x => x.calls)) console.log('DEFTER:', ag.id, ag.name, '| motor', JSON.stringify(ag.engines || {}), '| token', ag.tokens, '| $' + ag.costUSD.toFixed(4));
console.log('BITTI');
