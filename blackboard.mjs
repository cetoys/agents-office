// blackboard.mjs — kara tahta.
// Ajanlar konuşmadan işbirliği yapsın diye ortak, kısa ömürlü bir not havuzu. Her ajan çalışırken
// tahtanın son girişlerini görür; çıktısında "TAHTA: ..." satırı varsa o satır tahtaya düşer ve
// teslimattan silinir. Kalıcı bilgi brain'deki notlara gider; tahta iş sırasında konuşulan şeydir.
import fs from 'node:fs';
import path from 'node:path';

const KINDS = ['not', 'karar', 'soru', 'cevap', 'uyari'];
const file = root => path.join(root, 'data', 'blackboard.jsonl');

export function write(root, e) {
  const row = {
    ts: Date.now(),
    agent: e.agent || '?',
    agentName: e.agentName || e.agent || '?',
    kind: KINDS.includes(e.kind) ? e.kind : 'not',
    text: String(e.text || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    task: e.task || null,
  };
  if (!row.text) return null;
  try {
    fs.mkdirSync(path.dirname(file(root)), { recursive: true });
    fs.appendFileSync(file(root), JSON.stringify(row) + '\n');
  } catch { /* tahta kaybolursa iş durmaz */ }
  return row;
}

export function read(root, n = 200) {
  try {
    const lines = fs.readFileSync(file(root), 'utf8').split('\n').filter(l => l.trim());
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function clear(root) { try { fs.rmSync(file(root)); } catch {} }

// ajanın istemine giren kısa özet
export function fmt(root, { n = 14, exclude = null } = {}) {
  const rows = read(root, 60).filter(r => r.agent !== exclude).slice(-n);
  if (!rows.length) return '(tahta boş)';
  return rows.map(r => `[${r.kind}] ${r.agentName}: ${r.text}`).join('\n');
}

// Ajanın çıktısından TAHTA: ve SORU: satırlarını ayıkla. Yerel küçük modeller de bu kadarını becerir.
export function harvest(text) {
  const notes = [], questions = [];
  const kept = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    let m;
    if ((m = t.match(/^TAHTA\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/i))) { notes.push({ kind: (m[1] || 'not').toLowerCase(), text: m[2] }); continue; }
    if ((m = t.match(/^SORU\s*:\s*(.+)$/i))) { questions.push(m[1].trim()); continue; }
    kept.push(line);
  }
  return { text: kept.join('\n').trim(), notes, question: questions[0] || null };
}

// her ajanın isteminin sonuna eklenen kural
export const RULES =
  'ORTAK KARA TAHTA — takım arkadaşlarının bıraktığı notlar aşağıda. Onlarla çelişme, tekrarlama.\n' +
  'Başkasının işine yarayacak bir şey öğrendiysen teslimatın SONUNA tek satır ekle: "TAHTA: <kısa bilgi>".\n' +
  'SORMA KURALI — bu kural yukarıdaki "eksik bilgide makul varsayım yap" talimatını EZER. Uydurulması zarar veren ' +
  'bir bilgi eksikse varsayım YAPMA. Bunlar: para tutarı ve fiyat, tarih ve teslim süresi, gerçek kişi/müşteri/şirket adı, ' +
  'verilen taahhüt ve garanti, yasal veya sözleşmesel şart, hesap/sipariş numarası. Böyle bir eksik varsa teslimat YAZMA; ' +
  'çıktın tek satır olsun: "SORU: <tek net soru>". Bunların dışındaki eksiklerde varsayım yap ve (varsayım) diye işaretle.';
