const B = 'http://localhost:4520';
const post = async (p,b)=>{const r=await fetch(B+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});return {status:r.status,json:await r.json().catch(()=>({}))}};
await fetch(B+'/api/ops?reload=1');                       // yeni bütçeyi oku
console.log('KAPI:', JSON.stringify(await (await fetch(B+'/api/ops/check?agent=cmail')).json()));
const a = await post('/api/tasks', { dept:'emails', text:'Send a one-line thank-you note to a client.' });
console.log('ROUTE', a.status, a.json.agent || a.json.error);
if (a.json.id) {
  const b = await post(`/api/tasks/${a.json.id}/run`);
  console.log('RUN', b.status, b.status===402 ? 'ENGELLENDI: '+b.json.error : (b.json.error?'HATA':'CALISTI (engellenmedi!)'));
}
const c = await post('/api/tasks', { dept:'fin', text:'List the three numbers I should check before the month closes.' });
console.log('FIN ROUTE', c.status, c.json.agent || c.json.error);
if (c.json.id) { const d = await post(`/api/tasks/${c.json.id}/run`); console.log('FIN RUN', d.status, d.json.error?'HATA':'OK '+(d.json.result||'').length+' karakter'); }
console.log('BITTI');
