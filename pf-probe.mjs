// pf-probe.mjs — ön kapının kendisi ne diyor? Ham çıktıyı gör.
import { loadEngines, callEngine } from './engines.mjs';
const engines = loadEngines(process.cwd());
const HARD = ['para tutarı, fiyat, ücret, indirim oranı','tarih, teslim süresi, son gün','gerçek kişi / müşteri / şirket adı','verilen taahhüt, garanti, sözleşme şartı','hesap, sipariş, fatura numarası'];
const SYS =
  'Sen bir iş kontrolörüsün. İş YAPMIYORSUN. Tek işin şu: verilen görev, hiçbir şey uydurmadan yapılabilir mi?\n' +
  'Uydurulması zarar veren bilgiler: ' + HARD.join(' · ') + '.\n' +
  'Bu bilgilerden biri görevde ve notlarda YOKSA ve iş onsuz yapılamıyorsa, eksik say.\n' +
  'Üslup, uzunluk, biçim gibi şeyler eksik sayılmaz — onlar tahmin edilebilir.\n' +
  'SADECE şu JSON\'u döndür, başka hiçbir şey yazma:\n' +
  '{"ok": true}  ya da  {"ok": false, "missing": ["eksik olan"], "question": "sahibine sorulacak tek net soru"}';
const user =
  'GÖREV BAŞLIĞI: Fiyat artışı bildirim e-postası taslağı hazırla\n' +
  'SAHİBİNİN İSTEĞİ: Fiyat artışını müşteriye bildiren bir e-posta yaz. Yeni fiyatı ben sana söylemedim.\n' +
  'İŞİ YAPACAK KİŞİ: MÜŞTERİ YANITLARI — GGTX ve URAZPRO müşterilerinin e-postalarını yanıtlar.\n\nELDEKİ NOTLAR\n(yok)\n\nKARA TAHTA\n(boş)';

for (const eng of process.argv.slice(2)) {
  try {
    const t0 = Date.now();
    const r = await callEngine(engines, eng, { system: SYS, user, agent: '_probe', maxTokens: 300, timeout: 90000, allowedTools: [] });
    console.log(`\n[${eng}] ${((Date.now()-t0)/1000).toFixed(1)}s`);
    console.log('HAM:', JSON.stringify(r.text).slice(0, 500));
  } catch (e) { console.log(`\n[${eng}] HATA: ${e.message.slice(0, 200)}`); }
}
