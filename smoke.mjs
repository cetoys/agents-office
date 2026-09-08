// smoke.mjs — uçtan uca test: görev oluştur, çalıştır, sonucu logla.
const B = 'http://localhost:4520';
const TASKS = [
  ['marketing', 'Write three subject lines for a September newsletter about our new autumn collection.'],
  ['emails',    'Draft a short reply to a client asking why their order is late.'],
  ['finance',   'List the three numbers I should check before the month closes.'],
];
const log = (...a) => console.log(new Date().toISOString().slice(11,19), ...a);
const post = async (p, b) => { const r = await fetch(B+p, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(b||{}) }); return { status:r.status, json: await r.json().catch(()=>({})) }; };

for (const [dept, text] of TASKS) {
  try {
    log('ROUTE', dept);
    const a = await post('/api/tasks', { dept, text });
    if (a.status !== 200) { log('  ROUTE FAIL', a.status, JSON.stringify(a.json).slice(0,200)); continue; }
    const t = a.json;
    log('  ->', t.agent, '|', t.title);
    log('RUN', t.id);
    const b = await post(`/api/tasks/${t.id}/run`);
    if (b.status === 402) { log('  BUDGET BLOCKED:', b.json.error); continue; }
    if (b.status !== 200) { log('  RUN FAIL', b.status, JSON.stringify(b.json).slice(0,200)); continue; }
    log('  ', b.json.error ? 'HATA: ' + b.json.result.slice(0,160) : 'OK ' + b.json.result.length + ' karakter, tools=' + (b.json.tools||[]).join(',') + ', note=' + b.json.note);
  } catch (e) { log('  EXC', e.message); }
}
// bir de revize turu: ilk görevi geri gönder, revizyon sayacı ve öğrenme çalışsın
const list = await (await fetch(B+'/api/tasks')).json();
const first = list.find(t => t.state === 'done' && !t.error);
if (first) {
  log('REVISE', first.id);
  const r = await post(`/api/tasks/${first.id}/revise`, { feedback: 'Make it shorter — one line each, no explanation.' });
  log('  ', r.status, r.json.error ? 'HATA' : 'OK revisions=' + r.json.revisions);
}
log('BITTI');
