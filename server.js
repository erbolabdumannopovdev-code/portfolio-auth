require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const IS_PROD = process.env.NODE_ENV === 'production';

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function findUserByEmail(email) {
  return readJson(USERS_FILE).find(u => u.email.toLowerCase() === email.toLowerCase());
}
function findUserById(id) {
  return readJson(USERS_FILE).find(u => u.id === id);
}

// ---------- Mail transport ----------
let transporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });
}

async function sendOtpEmail(to, code, purpose) {
  const subject = purpose === 'register' ? 'Ro\'yxatdan o\'tishni tasdiqlang' : 'Kirishni tasdiqlang';
  const html = `
    <div style="font-family:sans-serif;background:#0E2238;padding:40px;color:#E7EFF6;">
      <h1 style="color:#F2A65A;margin:0 0 8px;letter-spacing:0.03em;">YERBOL.DEV</h1>
      <p style="color:#8FA9C2;margin:0 0 28px;">Tasdiqlash kodingiz:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#5FA8D3;margin-bottom:28px;">${code}</div>
      <p style="color:#8FA9C2;font-size:13px;">Kod 5 daqiqa davomida amal qiladi. Agar siz so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.</p>
    </div>`;
  if (!transporter) {
    console.log(`\n[DEV MODE — email yuborilmadi] ${to} uchun OTP kod: ${code}\n`);
    return;
  }
  await transporter.sendMail({ from: `Yerbol.dev <${process.env.GMAIL_USER}>`, to, subject, html });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- Telegram bildirishnomasi ----------
async function sendTelegramMessage(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML'
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Telegramga xabar yuborilmadi:', errText);
    }
  } catch (e) {
    console.error('Telegramga xabar yuborishda xatolik:', e.message);
  }
}

async function sendOrderNotification(order) {
  const text =
    `<b>🔔 Yangi buyurtma tushdi</b>\n\n` +
    `<b>Ism:</b> ${escapeHtml(order.name)}\n` +
    `<b>Email:</b> ${escapeHtml(order.email)}\n` +
    `<b>Xizmat turi:</b> ${escapeHtml(order.serviceType)}\n` +
    `<b>Byudjet:</b> ${escapeHtml(order.budget || 'ko\'rsatilmagan')}\n\n` +
    `<b>Tafsilot:</b>\n${escapeHtml(order.message)}`;

  // Telegram orqali (asosiy, tezkor bildirishnoma)
  await sendTelegramMessage(text);

  // Email orqali (ixtiyoriy, qo'shimcha)
  if (process.env.NOTIFY_EMAIL) {
    if (!transporter) {
      console.log(`\n[DEV MODE] Yangi buyurtma (${order.name}, ${order.email}) — email yuborilmadi\n`);
      return;
    }
    const html = `
      <div style="font-family:sans-serif;padding:24px;">
        <h2>Yangi buyurtma tushdi</h2>
        <p><b>Ism:</b> ${escapeHtml(order.name)}</p>
        <p><b>Email:</b> ${escapeHtml(order.email)}</p>
        <p><b>Xizmat turi:</b> ${escapeHtml(order.serviceType)}</p>
        <p><b>Byudjet:</b> ${escapeHtml(order.budget || 'ko\'rsatilmagan')}</p>
        <p><b>Tafsilot:</b><br>${escapeHtml(order.message)}</p>
      </div>`;
    try {
      await transporter.sendMail({
        from: `Yerbol.dev <${process.env.GMAIL_USER}>`,
        to: process.env.NOTIFY_EMAIL,
        subject: `Yangi buyurtma — ${order.serviceType}`,
        html
      });
    } catch (e) {
      console.error('Buyurtma haqida email yuborilmadi:', e.message);
    }
  }
}

// ---------- OTP store ----------
const otpStore = new Map();
function generateCode() { return String(crypto.randomInt(100000, 999999)); }
function setOtp(email, mode, payload) {
  const code = generateCode();
  otpStore.set(email.toLowerCase(), { code, mode, payload: payload || null, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 });
  return code;
}
function verifyOtp(email, code) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return { ok: false, error: 'Kod topilmadi. Qaytadan so\'rang.' };
  if (Date.now() > entry.expiresAt) { otpStore.delete(email.toLowerCase()); return { ok: false, error: 'Kod muddati tugagan. Qaytadan so\'rang.' }; }
  entry.attempts += 1;
  if (entry.attempts > 5) { otpStore.delete(email.toLowerCase()); return { ok: false, error: 'Urinishlar soni tugadi. Qaytadan so\'rang.' }; }
  if (entry.code !== String(code)) return { ok: false, error: 'Kod noto\'g\'ri.' };
  otpStore.delete(email.toLowerCase());
  return { ok: true, entry };
}

// ---------- Middleware ----------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function issueSession(res, user, remember) {
  const expiresIn = remember ? '30d' : '1d';
  const token = jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn });
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: IS_PROD };
  if (remember) cookieOpts.maxAge = 30 * 24 * 60 * 60 * 1000;
  res.cookie('site_session', token, cookieOpts);
}

function auth(req, res, next) {
  const token = req.cookies.site_session;
  if (!token) return res.status(401).json({ error: 'Sessiya topilmadi' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sessiya yaroqsiz' });
  }
}

function isValidEmail(email) { return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidAge(age) { const n = Number(age); return Number.isInteger(n) && n >= 13 && n <= 120; }

// ================= AUTH ROUTES =================

app.post('/api/register', async (req, res) => {
  try {
    const { name, age, email } = req.body || {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Ismni to\'g\'ri kiriting' });
    if (!isValidAge(age)) return res.status(400).json({ error: 'Yoshni to\'g\'ri kiriting (13–120)' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email manzil noto\'g\'ri' });
    if (findUserByEmail(email)) return res.status(409).json({ error: 'Bu email allaqachon ro\'yxatdan o\'tgan. Kirish bo\'limidan foydalaning.' });

    const code = setOtp(email, 'register', { name: String(name).trim(), age: Number(age), email: String(email).trim().toLowerCase() });
    await sendOtpEmail(email, code, 'register');
    res.json({ message: 'Tasdiqlash kodi emailingizga yuborildi' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xatosi. Birozdan so\'ng qaytadan urinib ko\'ring.' });
  }
});

app.post('/api/register/verify', (req, res) => {
  const { email, code, remember } = req.body || {};
  if (!isValidEmail(email) || !code) return res.status(400).json({ error: 'Ma\'lumotlar to\'liq emas' });
  const result = verifyOtp(email, code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const payload = result.entry.payload;
  const users = readJson(USERS_FILE);
  const user = { id: crypto.randomUUID(), name: payload.name, age: payload.age, email: payload.email, createdAt: new Date().toISOString() };
  users.push(user);
  writeJson(USERS_FILE, users);

  issueSession(res, user, !!remember);
  res.json({ user: { name: user.name, age: user.age, email: user.email, createdAt: user.createdAt } });
});

app.post('/api/login', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Email manzil noto\'g\'ri' });
    const user = findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'Bu email bilan akkaunt topilmadi. Avval ro\'yxatdan o\'ting.' });

    const code = setOtp(email, 'login', { email: user.email });
    await sendOtpEmail(email, code, 'login');
    res.json({ message: 'Tasdiqlash kodi emailingizga yuborildi' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xatosi. Birozdan so\'ng qaytadan urinib ko\'ring.' });
  }
});

app.post('/api/login/verify', (req, res) => {
  const { email, code, remember } = req.body || {};
  if (!isValidEmail(email) || !code) return res.status(400).json({ error: 'Ma\'lumotlar to\'liq emas' });
  const result = verifyOtp(email, code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'Akkaunt topilmadi' });

  issueSession(res, user, !!remember);
  res.json({ user: { name: user.name, age: user.age, email: user.email, createdAt: user.createdAt } });
});

app.get('/api/me', auth, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
  res.json({ user: { name: user.name, age: user.age, email: user.email, createdAt: user.createdAt } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('site_session');
  res.json({ message: 'Chiqildi' });
});

app.post('/api/resend', async (req, res) => {
  try {
    const { email, mode } = req.body || {};
    if (!isValidEmail(email) || !['register', 'login'].includes(mode)) return res.status(400).json({ error: 'Ma\'lumotlar to\'liq emas' });
    const existing = otpStore.get(email.toLowerCase());
    const payload = existing ? existing.payload : (mode === 'login' ? { email } : null);
    if (mode === 'register' && !payload) return res.status(400).json({ error: 'Avval ro\'yxatdan o\'tish formasini to\'ldiring' });

    const code = setOtp(email, mode, payload);
    await sendOtpEmail(email, code, mode);
    res.json({ message: 'Kod qayta yuborildi' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ================= ORDERS ROUTES =================

app.post('/api/orders', auth, async (req, res) => {
  try {
    const { serviceType, budget, message } = req.body || {};
    if (!serviceType || !message || String(message).trim().length < 10) {
      return res.status(400).json({ error: 'Xizmat turini tanlang va loyiha haqida kamida bir necha jumla yozing' });
    }
    const user = findUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });

    const orders = readJson(ORDERS_FILE);
    const order = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: user.name,
      email: user.email,
      serviceType: String(serviceType),
      budget: budget ? String(budget) : '',
      message: String(message).trim(),
      status: 'yangi',
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    writeJson(ORDERS_FILE, orders);
    await sendOrderNotification(order);

    res.json({ order });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server xatosi. Birozdan so\'ng qaytadan urinib ko\'ring.' });
  }
});

app.get('/api/orders/mine', auth, (req, res) => {
  const orders = readJson(ORDERS_FILE).filter(o => o.userId === req.userId);
  res.json({ orders });
});

app.listen(PORT, () => {
  console.log(`Sayt ishga tushdi: http://localhost:${PORT}`);
  if (!transporter) {
    console.log('Diqqat: GMAIL_USER / GMAIL_PASS sozlanmagan — OTP kodlar shu terminalga chiqariladi (dev rejimi).');
  }
});
