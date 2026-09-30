(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ===================== NAV ===================== */
  const navToggle = document.getElementById('navToggle');
  const navList = document.getElementById('navList');
  navToggle.addEventListener('click', () => {
    const open = navList.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  navList.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    navList.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }));

  /* ===================== 3D TILT (generic) ===================== */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (hasFinePointer && !reduceMotion) {
    document.querySelectorAll('.tilt').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `rotateY(${px * 8}deg) rotateX(${-py * 8}deg)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'rotateY(0deg) rotateX(0deg)';
      });
    });
  }

  /* ===================== SCROLL REVEAL ===================== */
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));

  /* ===================== API HELPER ===================== */
  async function api(path, body) {
    const res = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
    return data;
  }
  function setLoading(btn, loading) {
    btn.disabled = loading;
    const label = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.btn-spinner');
    if (label) label.style.opacity = loading ? 0 : 1;
    if (spinner) spinner.hidden = !loading;
  }
  function setError(scope, msg) {
    const el = document.querySelector(`.form-error[data-error="${scope}"]`);
    if (el) el.textContent = msg || '';
  }

  /* ===================== AUTH MODAL ===================== */
  const authOverlay = document.getElementById('authOverlay');
  const authView = document.getElementById('authView');
  const otpView = document.getElementById('otpView');
  const loginOpenBtn = document.getElementById('loginOpenBtn');
  const orderLoginBtn = document.getElementById('orderLoginBtn');
  const authClose = document.getElementById('authClose');
  const otpClose = document.getElementById('otpClose');
  const otpBack = document.getElementById('otpBack');

  function openModal() {
    authOverlay.classList.remove('hidden');
    authView.classList.remove('hidden');
    otpView.classList.add('hidden');
  }
  function closeModal() { authOverlay.classList.add('hidden'); }
  [loginOpenBtn, orderLoginBtn].forEach(btn => btn && btn.addEventListener('click', openModal));
  authClose.addEventListener('click', closeModal);
  otpClose.addEventListener('click', closeModal);
  authOverlay.addEventListener('click', (e) => { if (e.target === authOverlay) closeModal(); });
  otpBack.addEventListener('click', () => { otpView.classList.add('hidden'); authView.classList.remove('hidden'); });

  const tabs = document.querySelectorAll('.tab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'login') {
        loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
      } else {
        registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
      }
    });
  });

  let pending = { mode: null, email: null, remember: true };
  const otpEmailLabel = document.getElementById('otpEmailLabel');
  const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
  const verifyBtn = document.getElementById('verifyBtn');
  const resendBtn = document.getElementById('resendBtn');
  const resendTimerEl = document.getElementById('resendTimer');

  function enterOtpView(email, mode, remember) {
    pending = { mode, email, remember };
    otpEmailLabel.textContent = email;
    otpBoxes.forEach(b => (b.value = ''));
    setError('otp', '');
    authView.classList.add('hidden');
    otpView.classList.remove('hidden');
    otpBoxes[0].focus();
    startResendTimer();
  }

  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
      if (otpBoxes.every(b => b.value)) verifyOtp();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) otpBoxes[i - 1].focus();
    });
    box.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (text.length) {
        e.preventDefault();
        text.split('').slice(0, 6).forEach((ch, idx) => { if (otpBoxes[idx]) otpBoxes[idx].value = ch; });
        const last = Math.min(text.length, 6) - 1;
        if (otpBoxes[last]) otpBoxes[last].focus();
        if (otpBoxes.every(b => b.value)) verifyOtp();
      }
    });
  });

  async function verifyOtp() {
    const code = otpBoxes.map(b => b.value).join('');
    if (code.length !== 6) { setError('otp', 'Barcha 6 ta xonani to\'ldiring'); return; }
    setError('otp', '');
    setLoading(verifyBtn, true);
    try {
      const endpoint = pending.mode === 'register' ? '/register/verify' : '/login/verify';
      const data = await api(endpoint, { email: pending.email, code, remember: pending.remember });
      onLoggedIn(data.user);
      closeModal();
    } catch (e) {
      setError('otp', e.message);
      otpBoxes.forEach(b => (b.value = ''));
      otpBoxes[0].focus();
    } finally {
      setLoading(verifyBtn, false);
    }
  }
  verifyBtn.addEventListener('click', verifyOtp);

  let resendInterval = null;
  function startResendTimer() {
    let secs = 60;
    resendBtn.disabled = true;
    resendTimerEl.textContent = secs;
    clearInterval(resendInterval);
    resendInterval = setInterval(() => {
      secs -= 1;
      resendTimerEl.textContent = secs;
      if (secs <= 0) { clearInterval(resendInterval); resendBtn.disabled = false; }
    }, 1000);
  }
  resendBtn.addEventListener('click', async () => {
    if (resendBtn.disabled) return;
    resendBtn.disabled = true;
    try {
      await api('/resend', { email: pending.email, mode: pending.mode });
      startResendTimer();
    } catch (e) { setError('otp', e.message); resendBtn.disabled = false; }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('register', '');
    const fd = new FormData(registerForm);
    const name = fd.get('name').trim();
    const age = fd.get('age');
    const email = fd.get('email').trim();
    const btn = registerForm.querySelector('.btn-primary');
    setLoading(btn, true);
    try {
      await api('/register', { name, age, email });
      enterOtpView(email, 'register', true);
    } catch (e) { setError('register', e.message); } finally { setLoading(btn, false); }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('login', '');
    const fd = new FormData(loginForm);
    const email = fd.get('email').trim();
    const remember = fd.get('remember') === 'on';
    const btn = loginForm.querySelector('.btn-primary');
    setLoading(btn, true);
    try {
      await api('/login', { email });
      enterOtpView(email, 'login', remember);
    } catch (e) { setError('login', e.message); } finally { setLoading(btn, false); }
  });

  /* ===================== ACCOUNT STATE ===================== */
  const loginOpenBtnEl = document.getElementById('loginOpenBtn');
  const accountChip = document.getElementById('accountChip');
  const accountName = document.getElementById('accountName');
  const orderLocked = document.getElementById('orderLocked');
  const orderFormWrap = document.getElementById('orderFormWrap');
  let currentUser = null;

  function onLoggedIn(user) {
    currentUser = user;
    loginOpenBtnEl.classList.add('hidden');
    accountChip.classList.remove('hidden');
    accountName.textContent = user.name;
    orderLocked.classList.add('hidden');
    orderFormWrap.classList.remove('hidden');
    loadMyOrders();
  }
  function onLoggedOut() {
    currentUser = null;
    loginOpenBtnEl.classList.remove('hidden');
    accountChip.classList.add('hidden');
    orderLocked.classList.remove('hidden');
    orderFormWrap.classList.add('hidden');
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api('/logout', {}); } catch (e) { /* ignore */ }
    onLoggedOut();
  });

  (async function checkSession() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) { const data = await res.json(); onLoggedIn(data.user); }
    } catch (e) { /* sessiya yo'q */ }
  })();

  /* ===================== ORDER FORM ===================== */
  const orderForm = document.getElementById('orderForm');
  const orderSuccess = document.getElementById('orderSuccess');
  const myOrders = document.getElementById('myOrders');

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('order', '');
    const fd = new FormData(orderForm);
    const body = {
      serviceType: fd.get('serviceType'),
      budget: fd.get('budget'),
      message: fd.get('message')
    };
    const btn = orderForm.querySelector('.btn-primary');
    setLoading(btn, true);
    try {
      await api('/orders', body);
      orderForm.reset();
      orderSuccess.classList.remove('hidden');
      setTimeout(() => orderSuccess.classList.add('hidden'), 6000);
      loadMyOrders();
    } catch (e) {
      setError('order', e.message);
    } finally {
      setLoading(btn, false);
    }
  });

  async function loadMyOrders() {
    try {
      const res = await fetch('/api/orders/mine', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.orders || !data.orders.length) { myOrders.innerHTML = ''; return; }
      myOrders.innerHTML = '<div class="sheet-label" style="margin-top:6px;"><span class="no">LOG</span><span class="rule"></span><span>MENING BUYURTMALARIM</span></div>' +
        data.orders.slice().reverse().map(o => `
          <div class="mo-item">
            <span><strong>${escapeHtml(o.serviceType)}</strong> — ${new Date(o.createdAt).toLocaleDateString('uz-UZ')}</span>
            <span class="mo-status">${escapeHtml(o.status)}</span>
          </div>
        `).join('');
    } catch (e) { /* ignore */ }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
})();
