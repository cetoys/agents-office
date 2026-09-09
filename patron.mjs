// PATRON — Çağatay'ın tek muhatabı.
// Ofisteki 35 ajanla sen tek tek konuşma: patronla konuş, işi o dağıtsın, sonucu o toplasın.
//
// GERÇEK-VERİ KURALI: patron da uydurmaz. Bilmediği sayıyı, tarihi, ismi ASLA yazmaz;
// bilmiyorsa sorar. Gördüğü her rakam bu dosyadaki gerçek panodan gelir.
import fs from 'node:fs';
import path from 'node:path';

const MAX_TURNS = 40; // sohbet geçmişi bu kadar tutulur (dosya şişmesin)

export function historyFile(dataDir) { return path.join(dataDir, 'patron.json'); }

export function readHistory(dataDir) {
  try { const j = JSON.parse(fs.readFileSync(historyFile(dataDir), 'utf8')); return Array.isArray(j) ? j : []; }
  catch { return []; }
}
export function writeHistory(dataDir, list) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(historyFile(dataDir), JSON.stringify(list.slice(-MAX_TURNS), null, 2));
}
export function clearHistory(dataDir) { writeHistory(dataDir, []); }

// Panonun GERÇEK durumu — patronun gördüğü tek kaynak.
export function boardText({ tasks, agents, depts, ops }) {
  const byState = s => tasks.filter(t => t.state === s);
  const nameOf = id => agents.find(a => a.id === id)?.name || id;
  const line = t => `  · ${t.title} — ${nameOf(t.agent)}`;
  const doing = byState('doing'), next = byState('next'), waiting = byState('waiting');
  const done = byState('done').slice(-6);
  const out = [];
  out.push(`Koşan iş: ${doing.length}`); doing.slice(0, 8).forEach(t => out.push(line(t)));
  out.push(`Sırada: ${next.length}`); next.slice(0, 8).forEach(t => out.push(line(t)));
  out.push(`Sana soru soran (cevap bekleyen): ${waiting.length}`);
  waiting.slice(0, 8).forEach(t => out.push(`  · ${nameOf(t.agent)} soruyor: ${t.question || t.title}`));
  out.push(`Son biten ${done.length} iş:`); done.forEach(t => out.push(line(t)));
  // Harcama — token defterinden, gerçek. Anahtarı yanlış okuyup $0 yazmak da uydurmaktır.
  const u = ops && ops.usage;
  if (u && u.total) {
    const f = (b, lab) => b ? `${lab}: $${Number(b.cost || 0).toFixed(2)} (${b.calls || 0} çağrı)` : null;
    out.push('Harcama — ' + [f(u.d1, 'son 24 saat'), f(u.d7, 'son 7 gün'), f(u.d30, 'son 30 gün'), f(u.total, 'toplam')]
      .filter(Boolean).join(' · '));
  } else {
    out.push('Harcama: defter okunamadı — bu konuda sayı verme.');
  }
  out.push('Departman anahtarları: ' + Object.entries(depts).map(([k, d]) => `${k}=${d.name}`).join(', '));
  return out.join('\n');
}

export function systemPrompt({ name, board, roster, business }) {
  return [
    `Sen ${name}'nın PATRONU'sun — onun tek muhatabı. Türkçe konuşursun, kısa ve net.`,
    `${name} sana bir şey söyler; sen ya doğrudan cevap verirsin ya da işi ekibe dağıtırsın.`,
    '',
    'DEĞİŞMEZ KURAL — UYDURMA YOK:',
    '- Bilmediğin bir sayıyı, fiyatı, tarihi, ismi, müşteriyi ASLA yazma. Tahmin bile etme.',
    '- Aşağıdaki PANO ve İŞ BİLGİSİ dışında hiçbir "şirket gerçeği" yoktur.',
    '- Bir işi yapmak için eksik bilgi varsa, iş dağıtma; tek bir net soru sor.',
    '- "Yaptım", "gönderdim", "hazır" gibi şeyleri ancak PANO öyle diyorsa söyle.',
    '',
    'İŞ DAĞITMA:',
    'Bir işi ekibe vereceksen, cevabının SONUNA ayrı satırlar halinde şunu yaz:',
    'GÖREV: <departman-anahtarı> | <ajana verilecek net talimat>',
    'En fazla 3 satır. Departman anahtarını PANO\'daki listeden seç. Talimat tek cümle, somut olsun.',
    'İş dağıtmıyorsan GÖREV satırı yazma.',
    '',
    '--- PANO (gerçek, şu anki durum) ---',
    board,
    '',
    '--- EKİP ---',
    roster,
    business ? '\n--- İŞ BİLGİSİ (sahibinin kendi notları) ---\n' + business : '',
  ].join('\n');
}

// Cevaptaki GÖREV: satırlarını ayıkla, metinden çıkar.
export function harvestOrders(text, deptKeys) {
  const orders = [];
  const kept = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:[-*]\s*)?G[ÖO]REV\s*[:：]\s*(.+)$/i);
    if (!m) { kept.push(raw); continue; }
    const parts = m[1].split('|');
    if (parts.length < 2) { kept.push(raw); continue; }
    const dept = parts[0].trim().toLowerCase();
    const text2 = parts.slice(1).join('|').trim();
    if (!deptKeys.includes(dept) || !text2) { kept.push(raw); continue; }
    orders.push({ dept, text: text2 });
    if (orders.length >= 3) break;
  }
  return { reply: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), orders };
}
