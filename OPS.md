# Ajans Muhasebesi — token defteri, bütçe ve ajan karnesi

Bu katman `agents-office`'e üç şey ekler: **her ajanın ne harcadığı**, **ne kadar
harcayabileceği**, ve **ne kadar iyi iş çıkardığı**. Panel: <http://localhost:4520/ops>

## Neden gerekti

Depo, ajanları `claude -p ... --no-session-persistence` ile çalıştırıyor. Bu bayrak
oturum günlüğü yazılmasını engeller — yani `~/.claude/projects/**/*.jsonl` içinde
ajanların harcaması **hiç görünmez**. Dışarıdan ölçmenin yolu yok.

Çözüm: CLI zaten `stream-json` ile her asistan mesajını geri yazıyor ve her mesaj
kendi `usage` bloğunu taşıyor. `serve.mjs` bu akışı zaten okuyor. Biz oradan alıp
`data/usage-live.jsonl` dosyasına yazıyoruz. Anlık, kesin, dosya sistemine bağımsız.

## Dosyalar

| Dosya | İş |
|---|---|
| `usage.mjs` | Fiyat tablosu, `Ledger` (Claude Code oturum günlüklerini artımlı tarar), `LiveLedger` (ajanların kendi harcaması), toplama fonksiyonları |
| `ops.mjs` | `Ops` sınıfı: bütçe kapısı (`check`), ajan karnesi (`scorecard`), panel verisi (`report`) |
| `ops.html` | Panel |
| `office.usage.json` | Varsayılan ayarlar (`office.usage.local.json` ezer, git'e girmez) |

## İki kaynak, çakışma yok

- **Tarayıcı** (`Ledger`): `~/.claude/projects/**/*.jsonl` — senin kendi Claude Code
  kullanımın. Artımlı: her dosya yalnızca büyüdüğü kadarıyla yeniden okunur, offset
  **byte** cinsinden uygulanır (UTF-8'de karakter offset'i satır kaybettirir).
- **Canlı defter** (`LiveLedger`): ajanların harcaması, CLI akışından.

Ajanlar oturum günlüğü yazmadığı için ikisi asla üst üste binmez.

## Bütçe

`office.usage.local.json`:

```json
{
  "window": "7d",
  "defaultBudgetUSD": 0,
  "warnAt": 0.8,
  "enforce": true,
  "agents":      { "cmail": { "budgetUSD": 5 } },
  "departments": { "emails": { "budgetUSD": 20 } }
}
```

Öncelik: ajan → departman → varsayılan. `0` = sınırsız. `enforce: true` iken bütçesi
dolan ajanın görevi **başlamaz**: `POST /api/tasks/:id/run` `402` döner, görev
`blocked` durumuna geçer. `window` seçenekleri: `h5` · `1d` · `7d` · `30d` · `all`.

> Not: Bu bir muhasebe kaydıdır, Anthropic tarafında bir kota değil. Abonelikte
> ajan başına kota diye bir şey yok; defteri burada sen tutuyorsun.

## Karne

`data/tasks.json` + defter birleştirilerek ajan başına: görev sayısı, hata sayısı,
revize sayısı, ilk-seferde-doğru oranı, görev başına token ve maliyet, ortalama süre.

```
skor = 100 × (0.6 × ilkSeferdeDoğru + 0.4 × hatasızlık)
```

En az **3 bitmiş görev** olmadan skor hesaplanmaz — üç veriden karne çıkarmak
gürültüyü yetenek sanmaktır.

## Uçlar

| Uç | Döndürür |
|---|---|
| `GET /ops` | Panel |
| `GET /api/ops` | Her şey (`?reload=1` bütçe dosyasını yeniden okur) |
| `GET /api/ops/usage` | Yalnızca tüketim toplamları |
| `GET /api/ops/agents` | Yalnızca karne |
| `GET /api/ops/check?agent=<id>` | O ajanın bütçe durumu |

## Ajan bazlı ayrıştırma

`askX` artık her çağrıyı bir ajan kimliğiyle etiketliyor ve her ajan kendi
`%TEMP%/agents-office-cli/<id>` klasöründe çalışıyor. Etiket canlı deftere yazılıyor;
klasör ayrımı da ileride oturum günlüğü açılırsa ayrıştırmanın hazır olması için.

## Doğrulama

Tarayıcının toplamı, bağımsız bir sayım scriptiyle birebir eşleşiyor
(`$351.04 / 1872 çağrı / 341.9M token`). Fiyatlar
<https://platform.claude.com/docs/en/about-claude/pricing> tablosundan; 5 dakikalık ve
1 saatlik önbellek yazımı ayrı ayrı fiyatlandırılıyor.
