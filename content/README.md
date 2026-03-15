# İçerik Yönetimi
Bu klasördeki dosyaları düzenleyerek site içeriklerini HTML'e girmeden yönetebilirsin.

## Canlı düzenleme paneli (önerilen akış)
1. Proje kökünde `npm start` çalıştır.
2. Tarayıcıdan `http://localhost:3000/yonetim.html` aç.
3. `Case Studies` veya `Blog` seç.
4. Yeni içerik ekle ya da mevcut içeriği seçip düzenle.
5. Rich text editöründe yaz, biçimlendir ve gerekirse `Medya Yükle` ile görsel/video/dosya ekle.
6. `Kaydet` ile değişiklikler otomatik olarak `content/*/index.json` ve ilgili `.md` dosyasına yazılır.

Notlar:
- Alanlar zorunlu değildir; boş bırakılan alanlar sistem tarafından tolere edilir.
- İçerik formatı HTML olarak saklanır (`<!--format:html-->` işareti ile).

## Blog yazısı ekleme
1. `content/blog` içine yeni bir `.md` dosyası ekle.
2. `content/blog/index.json` dosyasına yeni kayıt ekle.

Zorunlu alanlar:
- `slug`: URL anahtarı (benzersiz)
- `title`
- `category`
- `date`
- `summary`
- `file`

## Case study ekleme
1. `content/cases` içine yeni bir `.md` dosyası ekle.
2. `content/cases/index.json` dosyasına yeni kayıt ekle.

Zorunlu alanlar:
- `slug`
- `number`
- `category`
- `title`
- `summary`
- `meta`
- `cover`
- `date`
- `tools`
- `file`
- `pdf`
- `libraryTitle`

## Yayına alma
1. Değişiklikleri commit et.
2. `main` branch'e push et.
3. GitHub Pages deploy tamamlanınca canlıda görünür.
