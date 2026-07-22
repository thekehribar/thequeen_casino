# Lucky Mini Casino Telegram Mini App

Oyun parasıyla çalışan Telegram Mini App slot oyunu. Para yatırma işlemi, kullanıcının gönderdiği benzersiz tutarı Diplomacia transfer geçmişinden eşleştirerek oyun bakiyesine işler.

## Yerelde Çalıştırma

`.env.example` dosyasını `.env` olarak oluşturup değerleri doldur:

```env
BOT_TOKEN=telegram_bot_token_buraya
DIPLOMACIA_TOKEN=diplomacia_bearer_token_buraya
ADMIN_KEY=uzun_rastgele_admin_sifresi
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
DATABASE_SSL=true
PORT=3000
SYNC_INTERVAL_SECONDS=30
AUTO_PAY_WITHDRAWALS=true
MIN_BET=10
MAX_BET=10000
MIN_DEPOSIT=1000
MAX_DEPOSIT=1000000
DAILY_WITHDRAWAL_LIMIT=1000000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

Sonra çalıştır:

```bash
npm start
```

Adres:

```text
http://localhost:3000
```

`DATABASE_URL` boş bırakılırsa veriler yerelde `data/db.json` dosyasında tutulur. Cloud sunucuda kalıcı veri için Neon veya Supabase gibi ücretsiz Postgres veritabanı kullanıp `DATABASE_URL` gir.

## Ücretsiz Yayına Alma

Önerilen ücretsiz kurulum: Render Free Web Service + Neon Free Postgres.

1. Neon'da ücretsiz Postgres veritabanı oluştur.
2. Neon bağlantı adresini `DATABASE_URL` olarak kopyala.
3. Render'da bu GitHub reposundan yeni Web Service oluştur.
4. Build command: `npm install`
5. Start command: `npm start`
6. Environment değişkenleri: `BOT_TOKEN`, `DIPLOMACIA_TOKEN`, `ADMIN_KEY`, `DATABASE_URL`, `DATABASE_SSL`, `SYNC_INTERVAL_SECONDS`, `AUTO_PAY_WITHDRAWALS`, limit ayarları.
7. Render'ın verdiği HTTPS adresini BotFather Mini App URL alanına gir.

İlk çalıştırmada sunucu `app_state` tablosunu otomatik oluşturur. Eğer deploy sırasında mevcut `data/db.json` dosyası varsa ilk kayıt olarak Postgres'e aktarılır.

## Telegram'a Bağlama

1. BotFather üzerinden bot oluştur.
2. `/newapp` komutu ile Mini App oluştur.
3. Yayına aldığın HTTPS adresini Mini App URL olarak gir.
4. Yayına aldığın HTTPS domainini Mini App URL olarak gir.

Not: Telegram Mini Apps HTTPS ister. Yerel test için ngrok veya Cloudflare Tunnel; canlı kullanım için Render/Koyeb gibi HTTPS veren servisleri kullanabilirsin.

## Para Yatırma Akışı

1. Kullanıcı uygulamada yatırmak istediği tutarı girer, örnek `1000000`.
2. Sistem benzersiz bir tutar üretir, örnek `1000003`.
3. Kullanıcı Diplomacia içinde senin hesabına tam olarak `1000003` gönderir.
4. Sunucu varsayılan olarak 30 saniyede bir transfer geçmişini kontrol eder.
5. Sistem transfer geçmişinde bu tutarı bulursa kullanıcıya `1000000` oyun bakiyesi yükler.

Kontrol sıklığını `.env` içindeki `SYNC_INTERVAL_SECONDS` ile değiştirebilirsin. Minimum değer 10 saniyedir.

Admin senkronizasyon endpointi:

```bash
curl -X POST http://localhost:3000/api/admin/sync-deposits -H "x-admin-key: ADMIN_KEY_BURAYA"
```

## Para Çekme Akışı

Kullanıcı çekim talebi oluşturur. Çekim sadece daha önce para yatırarak eşleşmiş Diplomacia hesabına yapılır. Sistem yatırım geçmişinden `meta_ref.id` değerini kaydeder, böylece kullanıcı ID bilmek zorunda kalmaz.

`AUTO_PAY_WITHDRAWALS=true` ise çekim talebi oluşturulduğu anda Diplomacia `transfer/send` ile ödeme yapılır. Transfer başarısız olursa bakiye kullanıcıya iade edilir.

`AUTO_PAY_WITHDRAWALS=false` ise talep `pending` kalır ve admin endpointiyle manuel ödenir.

Bekleyen çekimleri görmek için:

```bash
curl http://localhost:3000/api/admin/withdrawals -H "x-admin-key: ADMIN_KEY_BURAYA"
```

Bekleyen çekimi Diplomacia `transfer/send` ile ödemek için:

```bash
curl -X POST http://localhost:3000/api/admin/withdrawals/CEKIM_ID/pay -H "x-admin-key: ADMIN_KEY_BURAYA"
```

## Admin Paneli

Admin paneli canlı adreste `/admin.html` yolundadır:

```text
https://thequeen-casino.onrender.com/admin.html
```

Panel açılınca `.env` veya Render environment içinde tanımladığın `ADMIN_KEY` değerini gir. Panelde oyuncular, toplam bakiyeler, yatırımlar, çekimler, bekleyen çekimler, son oyunlar ve son chat mesajları görüntülenir.

Admin özet API'si:

```bash
curl http://localhost:3000/api/admin/summary -H "x-admin-key: ADMIN_KEY_BURAYA"
```

## Limitler ve Güvenlik

Bahis, yatırım, çekim ve rate limit değerleri environment üzerinden yönetilir:

```env
MIN_BET=10
MAX_BET=10000
MIN_DEPOSIT=1000
MAX_DEPOSIT=1000000
DAILY_WITHDRAWAL_LIMIT=1000000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
```

Sunucu her oyun sonucunu `gameLogs` içine kaydeder. Admin panelindeki `Son Oyunlar` bölümü son 100 kaydı gösterir, veritabanında en fazla son 1000 oyun kaydı tutulur.

## Önemli

Bu proje gerçek para içermez. Yerelde bakiye `data/db.json` içinde, cloud ortamında `DATABASE_URL` verildiyse Postgres içinde tutulan oyun parasıdır.

Paylaştığın Diplomacia `Bearer` token gizli bilgidir. Tokenı frontend koduna koyma, sadece `.env` içindeki `DIPLOMACIA_TOKEN` alanında tut. Token daha önce paylaşıldıysa yenilemen önerilir.

`ADMIN_KEY` değerini herkese açık yerde paylaşma. Admin paneli bu anahtarla işlem geçmişi ve oyuncu bakiyelerini gösterir.
