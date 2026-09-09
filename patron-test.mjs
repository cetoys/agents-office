const B = 'http://localhost:4520';
const post = (u, b) => fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

const t0 = Date.now();
const msg = process.argv[2] || 'Selam. Şu an elimde ne var, ne durumdayız? Kısaca söyle.';
console.log('SEN:', msg);
const j = await post('/api/patron', { text: msg });
console.log('--- PATRON (' + ((Date.now() - t0) / 1000).toFixed(1) + ' sn) ---');
console.log(j.error ? 'HATA: ' + j.error : j.reply);
if (j.tasks && j.tasks.length) console.log('\nAÇILAN GÖREVLER:', JSON.stringify(j.tasks, null, 1));
