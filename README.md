# Yerbol Abdumannopov — Portfolio + Hisob + Buyurtma tizimi

"Chizma (blueprint)" uslubidagi portfolio sayt — endi hisobga kirish/ro'yxatdan o'tish
(email OTP, parolsiz) va mijozlar to'g'ridan-to'g'ri saytdan buyurtma qoldira oladigan
forma bilan birga.

## Nima bor
- **Portfolio**: Men haqimda, ko'nikmalar, loyihalar, tajriba, aloqa (avvalgi dizayn saqlanib qoldi)
- **Hisob**: Ism/Yosh/Email bilan ro'yxatdan o'tish → Gmail orqali 6 xonali kod → tasdiqlash.
  Kirish esa faqat email + kod orqali (parol yo'q). "Meni eslab qol" belgilansa, 30 kun sessiya saqlanadi.
- **Buyurtma berish**: Faqat hisobga kirgan foydalanuvchilar "Buyurtma berish" bo'limidagi
  formani to'ldirib yubora oladi (xizmat turi, byudjet, tafsilot). Har bir buyurtma
  `data/orders.json`ga yoziladi va (agar `NOTIFY_EMAIL` sozlansa) sizga email orqali xabar boradi.
  Foydalanuvchi o'z buyurtmalari tarixini shu bo'limda ko'radi.

## O'rnatish

```bash
npm install
cp .env.example .env
```

`.env`ni oching:
- `JWT_SECRET` — istalgan uzun random satr
- `GMAIL_USER` / `GMAIL_PASS` — Gmail App Password (2 bosqichli tasdiqlash yoqilgan bo'lishi kerak,
  keyin https://myaccount.google.com/apppasswords orqali 16 xonali parol oling)
- `NOTIFY_EMAIL` — ixtiyoriy: yangi buyurtma tushganda shu manzilga xabar boradi

Agar Gmail sozlanmasa, tizim ishlayveradi — OTP kod terminalga chiqadi (dev rejimi).

## Ishga tushirish

```bash
npm start
```

`http://localhost:3000` ni oching.

## Fayllar

```
portfolio-auth/
├── server.js            # Express — auth (OTP/JWT) + buyurtmalar API
├── package.json
├── .env.example
├── data/
│   ├── users.json        # ro'yxatdan o'tgan foydalanuvchilar
│   └── orders.json        # tushgan buyurtmalar
└── public/
    ├── index.html          # portfolio + auth modal + buyurtma formasi
    ├── styles.css
    └── app.js
```

## O'zgartirish kerak bo'lgan joylar
- `index.html` dagi loyihalar, kontakt ma'lumotlari (email/telefon), ijtimoiy tarmoqlar
- `.env` dagi Gmail va NOTIFY_EMAIL manzillari

## Deploy (internetga chiqarish)

Bu sayt backend serverga muhtoj (statik GitHub Pages'da ishlamaydi). Kodni GitHub'ga
yuklab, Render yoki Railway kabi Node.js'ni qo'llab-quvvatlaydigan xizmatga deploy qiling.
Muhit o'zgaruvchilarini (`.env` qiymatlarini) shu xizmatning "Environment Variables"
bo'limiga kiriting. `.env` faylining o'zini hech qachon repoga qo'ymang.
