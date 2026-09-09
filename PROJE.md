# Akyazı Ajan Ofisi — Proje Devir Dosyası

**Son güncelleme:** 9 Eylül 2026
**Depo:** `C:\Users\cagat\agents-office` → `github.com/cetoys/agents-office`, dal `ops-layer`
**Beyin (Obsidian):** `C:\Users\cagat\Akyazi-Beyin`
**Açılış:** `OFISI-AC.bat` → tarayıcı `http://localhost:4520` · ops paneli `/ops` · **patron (telefon) `/patron`**
**Telefondan:** iPhone'da Tailscale'i aç → `http://akyazi-home:4520/patron`
(ya da `http://100.108.55.39:4520/patron`)

Bu dosya, yeni bir sohbette sıfırdan başlayan birinin projeyi tam olarak
devralabilmesi için yazıldı. Yeni sohbette ilk iş: **bu dosyayı okut.**

---

## 1. Bu nedir, ne değildir

3 boyutlu izometrik bir ofis. İçinde 35 masa var, her masada gerçek bir ajan
oturuyor. Ajana görev veriyorsun, masası yanıyor, çalışıyor, sorusu varsa
duruyor ve soruyor, bitirince çıktıyı beyne yazıyor. Harcadığı token ve dolar
ajan bazında sayılıyor.

**Ne değildir:** demo değil. İçindeki hiçbir sayı uydurma değil.

> **9 Eylül 2026 — ikinci ve asıl temizlik (`4d74de1`).**
> İlk temizlikte sahte katmanın yalnızca bir kısmı gitmişti. Kalanlar bulundu ve söküldü:
> - **Kendiliğinden üreyen görevler.** `tasks.js` içindeki `tick()`, boştaki her ajana
>   6–22 saniyede bir hazır havuzdan uydurma görev atıyordu ("Enrich 12 overnight signups"),
>   1.5–4 dakikalık sahte ilerleme çubuğuyla bitiriyor ve %25 ihtimalle **beyne not yazıyordu**.
>   Görülen "yapılıyormuş gibi" tam olarak buydu. `POOL`, `CHAINS`, `brainSend` — hepsi silindi.
> - **Masa ekranları.** "▸ drafting reply — client scope question" gibi hazır satırlar
>   (`WORKLINES`) dönüyordu; ekran başlığı da hep "● working" yazıyordu. Artık ekran
>   departmandaki **gerçek** görev başlığını gösterir, iş yoksa **"○ boşta"** yazar.
> - **Sahte onay istekleri.** `APPROVAL_ASKS` / `APPROVAL_BY_AGENT` (120 müşteriye zam
>   bildirimi, $350 fatura farkı…) ve `mockupFor()`'un ürettiği sahte fatura/teklif/reklam
>   belgeleri silindi. ⚠ artık **yalnızca** ajanın gerçekten sorduğu soruyla yanar.
> - **MCP "veri akıyor" trafiği.** Rastgele bağlayıcı ↔ masa paket gösterisi ve açılıştaki
>   volley söküldü. Kablolar yalnızca ajan **gerçekten** bir MCP aracı çağırınca yanar.
> - **Sahte beyin grafiği.** `braingraph.js` içinde 46 uydurma not gömülüydü; artık kasadan
>   üretiliyor (bugün 6 gerçek not).
> - **Hazır sohbet cevapları.** Sunucu kapalıyken ajanlar `v1data.js`'ten hazır replikler
>   veriyordu. Artık susar ve "ofis bağlı değil" der. `v1data.js` (uydurma şirket, hayali
>   müşteriler, sahte KPI'lar) tamamen boşaltıldı — paket 1053 KB'den 944 KB'ye indi.
> - **Sahte kadro adları.** 35 koltuğun 18'i hâlâ "SALES LEAD", "LEAD ENRICHER" gibi demo
>   adları taşıyordu; gerçek kadro adlarıyla değiştirildi.
> - **Yazma animasyonu.** İşi olmayan ajan artık **klavyeye dokunmuyor** — oturuyor,
>   etrafa bakıyor. Yazmak "çalışıyorum" iddiasıdır; iddia yoksa animasyon da yok.
> - **Sahte toplantı gösterisi** (X tuşu) söküldü.
> - Simülasyon yolu tamamen kapandı: sunucu kapalıyken **görev bile eklenemez**.

**Şu anki iş gerçeğin:** işleyen bir işletme yok. Gelir Uber'den geliyor.
Uygulama üretimi yeni başladı. Oyun ve e-ticaret gelir getirmeye başlarsa
iş o zaman kurulacak. Ofis buna göre kuruldu — satış departmanı yok,
**yapımcı atölyesi** var.

---

## 2. Departmanlar

Kod anahtarı → ekrandaki ad (`src/data.js` içindeki `DEPTS`):

| kod | ad | ne yapar |
|---|---|---|
| `emails` | **ARAŞTIRMA** | doğrular, eler, rakip bakar |
| `delivery` | **ÜRÜN** | uygulama sürümü çıkarır |
| `sales` | **OYUN** | oyun tarafı |
| `marketing` | **BÜYÜME** | ilk kullanıcı, listeleme, içerik |
| `fin` | **PARA** | maliyet, bütçe, fiyat |
| `ops` | **E-TİCARET** | mağaza, ürün, listeleme |
| `brain` | **BEYİN** | Obsidian kasası, ajanların ortak hafızası |

---

## 3. Mimari — hangi dosya ne yapıyor

**PATRON — tek muhatabın (9 Eylül 2026, `af9702d`)**

35 ajanla tek tek konuşmuyorsun. **Patronla** konuşuyorsun; işi o dağıtıyor,
sonucu o topluyor. Sohbet **sunucuda** duruyor — telefonda başlayıp masaüstünde
devam edebilirsin, aynı konuşma.

- `patron.mjs` — patronun beyni: gerçek pano metni (`boardText`), sistem talimatı
  (uydurma yasağı dahil), `GÖREV: <departman> | <iş>` satırlarının ayıklanması.
- `patron.html` — telefon sayfası. 3B ofis mobilde ağır; burası sade sohbet:
  üstte gerçek sayaçlar (koşan / sırada / soru bekleyen / biten), ajan sana soru
  sorduğunda **telefondan cevaplayabildiğin** kutu, ve sıradaki işi otomatik koşturma.
- Uçlar: `GET/POST/DELETE /api/patron`, sayfa `/patron` (veya `/telefon`).

Patron bir iş dağıttığında bu **gerçek** görev olur: aynı yönlendirici, aynı
bütçe kapısı, aynı token defteri. Uydurma bir "verdim" yok.

**Sunucu / çekirdek**

- `serve.mjs` — ana sunucu. Görev kuyruğu, `askX()` yönlendirici, canlı durum,
  bütçe kapısı, `ownerIndex()` (ön kapı için **sadece senin notların**, ajan
  çıktısı hariç). Rotalar: `/api/live`, `/api/engines`, `/api/ops*`,
  `/api/blackboard`, `/api/tasks/:id/answer`, `/api/brief`, `/ops`.
- `engines.mjs` — dört motor türü: `claude-cli`, `ollama`, `openclaw`,
  `openai-compat`. Hepsi `{ text, tools, usage }` döner.
- `usage.mjs` — token defteri. Resmi fiyat listesi (17 model), `Ledger`
  (JSONL artımlı tarama, **bayt-hassas** devam), `LiveLedger` (CLI'nin kendi
  stream'inden okur), `costOf()`.
- `ops.mjs` — bütçe kapısı, karne, rapor. `budgetFor()` / `check()` /
  `scorecard()`.
- `blackboard.mjs` — kara tahta. Ajan çıktısındaki `TAHTA:` ve `SORU:`
  satırlarını ayıklar, ortak panoya yazar.
- `preflight.mjs` — **ön kapı.** Görevi ucuz yerel modele sorar: "bu iş
  uydurmadan yapılabilir mi?" Yapılamıyorsa ajan hiç çalışmaz, sana soru sorar.
  Hata olursa açık kalır (fail-open), işi durdurmaz.
- `mcp.mjs` — ajan başına MCP araç izni.
- `roster.mjs` — kadro düzenleme (`EDITABLE` içinde `engine` ve `model` de var).

**Arayüz (`src/`)**

- `main.js` — 3B sahne. `REAL = { tok, usd, ask, notes }` — hepsi API'den gelir.
- `live.js` — 1.2 sn'de bir `/api/live` yoklar. Motor renkli rozetler, üst
  canlı şerit, bekleyen soru baloncukları ve cevap kutusu.
- `data.js` — departman tanımları. `BILLBOARDS` **kasten boş**.
- `tasks.js` — görev listesi. Sahte "sabah" tohumlaması söküldü.

**Yapılandırma**

- `office.config.local.json` — `{ name, brain, port: 4520 }`
- `office.agents.local.json` — 35 koltuk
- `office.engines.json` — motorlar + ön kapı ayarı

---

## 4. Motorlar

`office.engines.json` içindeki tanımlar:

| ad | tür | not |
|---|---|---|
| `claude` | claude-cli | ana motor, 24 ajan |
| `yerel` | ollama | gemma-4-E2B (4.4 GB) — 7 ajan, **$0** |
| `yerel-hizli` | ollama | ön kapı da bunu kullanır — 4 ajan, **$0** |
| `yerel-buyuk` | ollama | ağır işler için, RTX 3060 12 GB'a dikkat |
| `openclaw` | openclaw | **şu an ölü** — sağlayıcı kredisi yok |
| `cerebras` | openai-compat | **anahtar tanımlı değil** |

Ön kapı ayarı: `{ enabled: true, engine: 'yerel-hizli', timeoutMs: 45000,
skipEngines: ['yerel','yerel-hizli'] }` — yani yerel modeller kendi kendini
kapıda tutmuyor, zaten bedava.

**API anahtarı kuralı (değişmez):** anahtarlar hiçbir dosyaya yazılmaz.
`openai-compat` motorları anahtarı **yalnızca ortam değişkeni adıyla**
(`apiKeyEnv`) tanır. Anahtarı sen tanımlarsın, ben görmem.

---

## 5. Kadro

- **35 koltuk**, hepsinin `does` ve `brief` alanı dolu — ne yapacağı yazılı.
- Motor dağılımı: **24 claude · 7 yerel · 4 yerel-hızlı**
- **24 ajana gerçek MCP araç bağı** verildi (17 bağlı sunucudan):
  Vercel, Figma, Playwright, HuggingFace, Higgsfield, ElevenLabs, Stripe,
  Canva, Gamma, Notion, n8n, Asana, Slack, Google Drive, Gmail,
  Google Calendar, Context7.
- `Skill` izni açık — ajanlar kurulu Claude Code eklenti skill'lerini çağırabilir.

Örnek koltuk (`dlead` — ÜRÜN ŞEFİ):
araçlar `notion, asana, vercel`; brief'i "kapsamı KÜÇÜLT, bu sürümden
çıkarılabilir mi diye sor".

---

## 6. SOP'ler (beyinde)

`C:\Users\cagat\Akyazi-Beyin\Agents Office\skills\`

| SOP | ne yapar |
|---|---|
| `ev-usulu` | çıktı biçimi — kısa, sayı varsa kaynaklı, uydurma yok |
| `fikir-eleme` | bir fikri öldürür ya da geçirir |
| `surum-cikar` | uygulama sürümü çıkarma adımları |
| `ilk-kullanici` | ilk 10 kullanıcıyı nereden bulacağın |
| `listeleme` | mağaza/pazar yeri listeleme |
| `maliyet-cikar` | gerçek maliyet çıkarma |

Hayali stüdyo örnek skill'leri `skills/_ornek-arsiv/` altına kaldırıldı.

---

## 7. Doğrulanmış olanlar (bunlara güven)

- **Token defteri bayt-hassas.** Bağımsız yeniden sayımla eşleşti:
  $351.04 / 1872 çağrı / 341.9M token.
- **Ajan başına atıf çalışıyor.** Kök neden bulundu: `--no-session-persistence`
  JSONL yazmıyor, bu yüzden kaynak CLI'nin kendi `stream-json` çıktısına
  taşındı.
- **Bütçe kapısı çalışıyor.** Aşan ajan 402 ile durur, diğerleri etkilenmez.
- **3B masa ışıkları canlı** — görsel olarak doğrulandı.
- **Kooperasyon çalışıyor.** Patron ajan dağıttı, ARAŞTIRMA → BÜYÜME ŞEFİ →
  BÜLTEN zinciri kara tahta üzerinden `SONBAHAR25` kodunu paylaştı.
- **Ön kapı uydurmayı kesiyor.** Maliyeti $0 (yerel model).
- **Araç + SOP testi geçti:** `elead`'e "Etsy SEO yardımcı uygulaması fikrini
  ele" verildi; ön kapı geçirdi, `ev-usulu` + `fikir-eleme` uygulandı, ajan
  web araması yaptı ve **gerçek** rakip fiyatları döndü — eRank $5.99–29.99,
  Sale Samurai $9.99, Marmalead ~$15.83, Alura $19.99 — 73.9 saniyede.

---

## 7b. Telefondan / internetten erişim

**Kurulu ve hazır — hiçbir şey değiştirmedim, değiştirmeye de gerek yok.**

Bilgisayarında **Tailscale** zaten kurulu ve açık (`cetoys@` hesabı).
Ağdaki cihazlar: `akyazi-home` (bu bilgisayar, `100.108.55.39`), `iphone181`
(telefonun — 25 gündür çevrimdışı), bir de bir Linux makine.

Yapman gereken tek şey:

1. iPhone'da **Tailscale** uygulamasını aç, bağlan.
2. Safari'de: **`http://akyazi-home:4520/patron`**
   (MagicDNS açık; olmazsa `http://100.108.55.39:4520/patron`)
3. Paylaş → **Ana Ekrana Ekle** — uygulama gibi açılır.

Neden bu yol:

- **Özel.** İnternete hiçbir şey açılmıyor. Trafik WireGuard ile şifreli,
  sadece senin cihazların erişebiliyor. Ofis Claude CLI'yi araçlarla
  çalıştırabildiği için, bunu şifresiz olarak halka açık internete koymak
  ciddi bir güvenlik hatası olurdu.
- Windows güvenlik duvarı zaten node.exe'ye "Private" profilde izin veriyor,
  Tailscale arayüzü de Private — yani port zaten açık.
- Fişe takılıyken bilgisayar uykuya geçmiyor (AC uyku = kapalı).

**Dürüst kısıt:** ajanlar senin bilgisayarında koşuyor (Claude CLI + Ollama).
**Bilgisayar kapalıysa ofis de kapalıdır.** Uber'e çıkarken bilgisayarı açık bırak.

Not: `https://akyazi-home.tailfc3845.ts.net` adresinde bir Tailscale **Funnel**
zaten açık ama başka bir servise (port 18792) bağlı. Ona dokunmadım.

---

## 8. Açık kalanlar (yeni sohbette buradan devam)

1. **Cerebras anahtarı tanımlı değil.** Kontrol edildi: `CEREBRAS_API_KEY`
   yok. Sen şunu çalıştıracaksın, sonra Claude masaüstü uygulamasını yeniden
   başlatacaksın:
   `setx CEREBRAS_API_KEY "anahtarin"`
2. **OpenClaw sağlayıcıları ölü.** zai kredisi bitti, OpenRouter 401 döndü.
   Yenilemesi sende.
3. **VPS vitrini (Hostinger) hiç kurulmadı.** Elde sadece statik bir görüntü var.
4. **Langfuse** ile derin ajan puanlaması önerildi, başlanmadı.
5. **Repolardan SOP çıkarma** — sen "şimdilik gerek yok" dedin; istediğinde
   ajana yaptırılabilir.
6. **Teklif edilip onaylanmayan iş:** `fikir-eleme` SOP'unu başlattığın tüm
   projelerde koşturup **hangisinde gerçekten ödeyen biri var** sorusunu
   cevaplamak. Bence sıradaki en değerli hamle bu.

---

## 9. Değişmez kurallar

1. **Ajanlar para, tarih ve isim uydurmaz.** Bilmiyorsa `SORU:` yazar ve
   bekler. Ön kapı bunu yapısal olarak zorlar — sadece prompt'a güvenme,
   iki kez denendi, iki kez patladı.
2. **API anahtarı asla dosyaya yazılmaz.** Sadece ortam değişkeni adıyla
   referans verilir. Anahtarı sen girersin.
3. **Beyin zehirlenmesine dikkat.** Ajan çıktısı beyne yazılırsa sonraki
   koşuda "şirket gerçeği" sanılır. Bir kere oldu: uydurma bir $149 fiyatı
   3 nota yazıldı ve ön kapı onu gerçek sandı. Bu yüzden `ownerIndex()`
   **sadece senin notlarını** okur. Zehirli notlar
   `brain/Agents Office/_zehirli/` altına taşındı.
4. **Sahte veri yok.** Ekrandaki her sayı bir API'den gelir. Boş bir yer
   görüyorsan orası gerçekten boş.
5. **git uzakları:** `origin` = senin fork'un (`cetoys`), `upstream` =
   kaynak repo (`ajsahni`). Bu düzen bozulursa commit sonrası uyarılar geri gelir.

---

## 9b. Şu an en çok tıkayan şey

**Kasa neredeyse boş.** Patron ilk konuşmada bunu kendi söyledi: üç iş adı
   (GGTX, URAZPRO, n8n) dışında kasada fiyat, müşteri, süreç, maliyet **yok**.
   Bu yüzden ekip her somut işte sana soru sormak zorunda kalıyor — sistem
   bozuk olduğu için değil, **bilgi olmadığı için**. En çok tıkayan boşluk
   kendi maliyetin ve fiyat listen. Bunu bir kez yazarsan üç iş de akmaya başlar.

---

## 10. Yeni sohbete başlarken

Şunu yaz:

> `C:\Users\cagat\OneDrive\Masaüstü\Agents Office\PROJE.md` dosyasını oku,
> Ajan Ofisi projesine oradan devam edeceğiz.

Sonra 8. bölümdeki maddelerden hangisiyle başlayacağını söyle.
