import fs from 'node:fs';
function rep(file, a, b, must = 1) {
  const p = 'src/' + file;
  let s = fs.readFileSync(p, 'utf8');
  const c = s.split(a).length - 1;
  if (c !== must) { console.log('SKIP(' + c + '/' + must + ')', file, a.slice(0, 55)); return; }
  fs.writeFileSync(p, s.split(a).join(b));
  console.log('OK', file, '|', a.slice(0, 50));
}

rep('main.js',
  "import { TOKENS, DEPTS, DEPT_KEYS, AGENTS, LAYOUT, WORKLINES, APPROVAL_ASKS, APPROVAL_BY_AGENT } from './data.js';",
  "import { TOKENS, DEPTS, DEPT_KEYS, AGENTS, LAYOUT } from './data.js';");

rep('main.js',
  "import { V1, FILE_GEN, STATS, KPIS, P, rnd, ri, person, money } from './v1data.js';",
  "import { V1, rnd, ri } from './v1data.js'; // yalnızca koltuk iskeleti + rastgele yardımcıları; sahte içerik kullanılmıyor");

rep('main.js',
  "const kv = id => KPIS.find(k => k.id === id).val;",
  "// (kv/KPIS söküldü — blok sayıları REAL'den gelir)");

rep('main.js',
  "  if (FILE_GEN[id] && !(tasks && tasks.isLive())) chatHist[id].push({ who: 'file', ...FILE_GEN[id]() }); // demo-only sample file; a live office shows real deliverables",
  "  // (demo örnek dosyası söküldü — sohbette yalnızca gerçek çıktı görünür)");

rep('main.js',
  "      ss.screenSet.draw(sample(WORKLINES[ss.dept], 3).map(l => l.slice(0, 28)));",
  "      ss.screenSet.draw(deskLines(ss.dept));");

rep('main.js',
  "  else if (e.key === 'w' || e.key === 'W') requestApproval('apay'); // demo cue: Accounts Payable asks for approval",
  "  // (demo kısayolu 'W' söküldü)");

rep('main.js',
  "  if (h.get('appr')) requestApproval(h.get('appr') === '1' ? 'apay' : h.get('appr'));",
  "  // (?appr= demo parametresi söküldü)");

// v1data'dan gelen sahte istatistik satırları (mStats) — gerçek yoksa boş
rep('main.js',
  "  document.getElementById('mStats').innerHTML = (v.stats || []).map(([l, val]) => `",
  "  document.getElementById('mStats').innerHTML = ([]).map(([l, val]) => `");

console.log('---');
