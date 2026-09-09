console.log('CEREBRAS_API_KEY set:', !!process.env.CEREBRAS_API_KEY);
console.log('OPENROUTER_API_KEY set:', !!process.env.OPENROUTER_API_KEY);
try {
  const { Ledger } = await import('./usage.mjs');
  const l = new Ledger();
  const rows = l.scan ? l.scan() : [];
  console.log('ledger rows:', rows.length);
} catch (e) { console.log('ledger:', e.message); }
try {
  const r = await fetch('http://localhost:4520/api/health');
  console.log('server up:', r.status, (await r.text()).slice(0, 300));
} catch (e) { console.log('server down:', e.message); }
