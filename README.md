# Ders Programı

Okullar için haftalık ders programı hazırlama uygulaması. Sunucu gerektirmez; tarayıcıda çalışır ve GitHub Pages üzerinden yayınlanır.

## Özellikler

- **Öğretim şekilleri:** tam gün (öğle aralı), ikili öğretim (sabahçı–öğlenci), yalnız sabah, yalnız öğleden sonra. Devre sayısı, ders sayısı, ders ve teneffüs süreleri, öğle arası ve ders günleri serbestçe değiştirilir; her teneffüse ayrı süre verilebilir.
- **Ders türleri:** blok dersler (ör. 2+2+1), birleştirilmiş sınıflar, birden çok öğretmenli dersler, özel derslik isteyen dersler (laboratuvar, spor salonu).
- **Kısıtlar:** öğretmen, sınıf ve derslik için kapalı saatler; öğretmene günlük en çok ders saati.
- **Otomatik yerleştirme:** çakışmasız yerleştirir, sınıf ve öğretmen boş saatlerini azaltır; kilitlenen dersler yerinde kalır.
- **Elle düzenleme:** sürükle-bırak ya da tıkla-yerleştir; uygun saatler yeşil, uygun olmayanlar nedeni ile birlikte kırmızı görünür.
- **Çıktı:** sınıf, öğretmen ve derslik programları, çarşaf program; yazdırma/PDF ve Excel için CSV.
- **Yedek:** veriler tarayıcıda saklanır; tek tuşla gizli bir GitHub deposuna ya da dosyaya yedeklenir.

## Kullanım sırası

Okul → Dersler → Öğretmenler → Sınıflar → (Derslikler) → Ders Dağıtımı → Program → Çıktı.
Denemek için Yedek sekmesindeki "Örnek veri yükle" düğmesini kullanın.

## Gizlilik

Bu depoda yalnızca program kodu bulunur. Okul verileri (öğretmen adları, programlar) tarayıcıda durur ve yalnızca sizin belirlediğiniz gizli depoya yedeklenir. GitHub erişim belirteci yedek dosyasına yazılmaz.

## Geliştirme

Derleme adımı yoktur. `index.html` dosyasını herhangi bir statik sunucuyla açın:

```
python -m http.server 8765
```

Yerleştirici testi: `node tests/solver-test.js`
