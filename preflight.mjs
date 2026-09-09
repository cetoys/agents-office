// preflight.mjs — teslimattan önce "eksik bilgi kontrolü".
//
// Neden var: Claude eksik bir fiyat ya da tarih karşısında sormak yerine bir değer uydurup
// teslimatı yazmayı tercih ediyor. Testte müşteriye gidecek bir e-postaya uydurma bir fiyat
// ($149) ve tarih (1 Oct 2026) yazdı — üstelik varsayım diye işaretlemeden. Prompt'a kural
// eklemek bunu çözmedi; iki denemede de uydurdu.
//
// Çözüm yapısal: pahalı ajanı çalıştırmadan ÖNCE ucuz (tercihen yerel, bedava) bir model
// yalnızca şunu cevaplıyor — "bu görev uydurmadan yapılabilir mi, eksik ne?". Eksik varsa
// görev hiç başlamıyor, sahibine soru olarak dönüyor. Hem uydurmayı kesiyor hem parayı.
//
// Tasarım kararı: ŞÜPHEDE KALIRSA GEÇİRİR. Kontrolün kendisi çuvallarsa (model yok, JSON
// bozuk, zaman aşımı) iş durmaz — çünkü yanlış yere takılan bir kapı, ara sıra kaçan bir
// uydurmadan daha çok zarar verir.

const HARD = [
  'para tutarı, fiyat, ücret, indirim oranı',
  'tarih, teslim süresi, son gün',
  'gerçek kişi / müşteri / şirket adı',
  'verilen taahhüt, garanti, sözleşme şartı',
  'hesap, sipariş, fatura numarası',
];

const SYS =
  'Sen bir iş kontrolörüsün. İş YAPMIYORSUN. Tek işin şu: verilen görev, hiçbir şey uydurmadan yapılabilir mi?\n' +
  'Uydurulması zarar veren bilgiler: ' + HARD.join(' · ') + '.\n' +
  'Bu bilgilerden biri görevde ve notlarda YOKSA ve iş onsuz yapılamıyorsa, eksik say.\n' +
  'Üslup, uzunluk, biçim gibi şeyler eksik sayılmaz — onlar tahmin edilebilir.\n' +
  'SADECE şu JSON\'u döndür, başka hiçbir şey yazma:\n' +
  '{"ok": true}  ya da  {"ok": false, "missing": ["eksik olan"], "question": "sahibine sorulacak tek net soru"}';

export function loadPreflight(engines) {
  const p = engines.preflight || {};
  return {
    enabled: p.enabled !== false,
    engine: p.engine || 'yerel-hizli',
    timeout: +p.timeoutMs || 45000,
    // bu motorlarda koşan ajanlar için kontrol atlanır (zaten ucuzsa iki tur anlamsız)
    skipEngines: Array.isArray(p.skipEngines) ? p.skipEngines : [],
  };
}

// callEngine'i dışarıdan alıyoruz ki bu modül hiçbir şeye bağlı olmasın
export async function check({ callEngine, engines, cfg, task, agent, board, notes }) {
  if (!cfg.enabled) return { ok: true, skipped: 'kapalı' };
  if (!engines.engines?.[cfg.engine]) return { ok: true, skipped: `motor yok: ${cfg.engine}` };
  const user =
    `GÖREV BAŞLIĞI: ${task.title}\n` +
    `SAHİBİNİN İSTEĞİ: ${task.text}\n` +
    `İŞİ YAPACAK KİŞİ: ${agent.name} — ${agent.does}\n\n` +
    `ELDEKİ NOTLAR (bunlarda geçen bilgi EKSİK SAYILMAZ)\n${(notes || '').slice(0, 2500) || '(yok)'}\n\n` +
    `KARA TAHTA\n${(board || '').slice(0, 1200) || '(boş)'}`;
  let text;
  try {
    const r = await callEngine(engines, cfg.engine, { system: SYS, user, agent: '_preflight', maxTokens: 300, timeout: cfg.timeout, allowedTools: [] });
    text = r.text || '';
  } catch (e) { return { ok: true, skipped: 'kontrol çalışmadı: ' + e.message.slice(0, 120) }; }

  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: true, skipped: 'JSON çıkmadı' };
  let j; try { j = JSON.parse(text.slice(a, b + 1)); } catch { return { ok: true, skipped: 'JSON bozuk' }; }
  if (j.ok !== false) return { ok: true };
  const question = String(j.question || '').trim();
  if (!question) return { ok: true, skipped: 'soru boş' };
  const missing = Array.isArray(j.missing) ? j.missing.slice(0, 4).map(String) : [];

  // KAPININ EMNİYETİ: küçük model "eksik" demeye meyilli. Testte, fikri görevde açıkça yazılı
  // olan bir işi "fikir nedir?" diye durdurdu. O yüzden iddia edilen eksik, gerçekten sert
  // listeden bir şeye benzemiyorsa kapı açılır. Yanlış yere takılan kapı, ara sıra kaçan bir
  // uydurmadan daha çok zarar verir.
  const HARD_RE = /(fiyat|ücret|tutar|para|bütçe|maliyet|indirim|\$|dolar|tl\b|euro|tarih|gün|hafta|termin|teslim|süre|deadline|isim|ad[ıi]\b|müşteri|kişi|firma|şirket|marka|taahhüt|garanti|sözleşme|şart|numara|no\b|hesap|sipariş|fatura|iban|adres|telefon|e-?posta|limit|kota|lisans)/i;
  const hard = missing.filter(m => HARD_RE.test(m)) ;
  if (missing.length && !hard.length) return { ok: true, skipped: 'eksik sert listede değil: ' + missing.join(' / ').slice(0, 120) };
  if (!missing.length && !HARD_RE.test(question)) return { ok: true, skipped: 'soru sert listeye girmiyor' };
  return { ok: false, question: question.slice(0, 300), missing };
}
