(() => {
  'use strict';

  /* =====================================================
     Helpers
  ===================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
  const sum = (arr, k) => arr.reduce((a, x) => a + num(x[k]), 0);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Storage is full or blocked'); } },
    del(k) { localStorage.removeItem(k); }
  };

  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = () => fmtDate(new Date());
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftDate = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  /* =====================================================
     Reference data
  ===================================================== */
  // [calories, protein g, carbs g, fat g]
  const PRESETS = {
    'Banana (1 medium)': [105, 1.3, 27, 0.4],
    'Apple (1 medium)': [95, 0.5, 25, 0.3],
    'Egg, boiled (1 large)': [78, 6.3, 0.6, 5.3],
    'Chapati / roti (1)': [104, 3, 18, 3],
    'Cooked rice (1 cup)': [205, 4.3, 45, 0.4],
    'Dal, cooked (1 cup)': [230, 18, 40, 0.8],
    'Paneer (100 g)': [265, 18, 1.2, 20],
    'Chicken breast, cooked (100 g)': [165, 31, 0, 3.6],
    'Curd / yogurt (1 cup)': [150, 8, 11, 8],
    'Oats, cooked (1 cup)': [166, 5.9, 28, 3.6],
    'Almonds (28 g)': [164, 6, 6, 14],
    'Milk, whole (1 cup)': [150, 8, 12, 8],
    'Idli (1)': [58, 2, 12, 0.4],
    'Peanut butter (1 tbsp)': [94, 3.6, 3.2, 8]
  };

  // MET values for estimating calories burned
  const WORKOUTS = {
    'Walking': 3.5, 'Running': 9.8, 'Cycling': 7.5, 'Gym / Strength': 5,
    'HIIT': 8, 'Swimming': 7, 'Yoga': 3, 'Sports': 6, 'Other': 4
  };

  const defaultData = () => ({
    goals: { cal: 2000, protein: 120, carbs: 250, fat: 65, water: 8 },
    food: {}, workouts: {}, water: {}, weight: []
  });

  /* =====================================================
     Auth (local only, demo-grade — see note in README)
  ===================================================== */
  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; // weak fallback for insecure contexts
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return 'x' + h;
  }
  const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  const normEmail = e => e.trim().toLowerCase();
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  let session = null;       // email of logged-in user
  let user = null;          // {name, salt, hash}
  let data = null;          // that user's tracking data
  let date = todayStr();    // currently viewed date
  let authMode = 'login';

  async function signup(name, email, pass) {
    const users = store.get('ft_users', {});
    if (!name.trim()) throw new Error('Please enter your name.');
    if (!validEmail(email)) throw new Error('Enter a valid email address.');
    if (pass.length < 6) throw new Error('Password must be at least 6 characters.');
    if (users[email]) throw new Error('An account with this email already exists.');
    const salt = newSalt();
    users[email] = { name: name.trim(), salt, hash: await sha256(salt + pass) };
    store.set('ft_users', users);
    return email;
  }

  async function login(email, pass) {
    const users = store.get('ft_users', {});
    const u = users[email];
    if (!u || (await sha256(u.salt + pass)) !== u.hash) throw new Error('Incorrect email or password.');
    return email;
  }

  function startSession(email) {
    session = email;
    user = store.get('ft_users', {})[email];
    data = Object.assign(defaultData(), store.get('ft_data_' + email, {}));
    data.goals = Object.assign(defaultData().goals, data.goals);
    store.set('ft_session', email);
    date = todayStr();
    showApp();
  }

  function logout() {
    store.del('ft_session');
    session = user = data = null;
    $('#auth-form').reset();
    $('#auth-error').textContent = '';
    showAuth();
  }

  const save = () => store.set('ft_data_' + session, data);

  function showAuth() {
    $('#app').classList.add('hidden');
    $('#auth').classList.remove('hidden');
  }
  function showApp() {
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#hello').textContent = user.name;
    $('#account-email').textContent = 'Signed in as ' + session;
    fillGoals();
    switchView('dashboard');
    renderAll();
  }

  function setAuthMode(mode) {
    authMode = mode;
    $$('[data-auth-tab]').forEach(b => b.classList.toggle('active', b.dataset.authTab === mode));
    $('#name-field').classList.toggle('hidden', mode !== 'signup');
    $('#auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Log in';
    $('#auth-pass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('#auth-error').textContent = '';
  }

  $$('[data-auth-tab]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.authTab)));

  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#auth-error');
    err.textContent = '';
    const email = normEmail($('#auth-email').value);
    const pass = $('#auth-pass').value;
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      if (authMode === 'signup') {
        await signup($('#auth-name').value, email, pass);
      }
      await login(email, pass);
      startSession(email);
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* =====================================================
     Navigation
  ===================================================== */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    if (name === 'progress') renderProgress();
    window.scrollTo(0, 0);
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  $('#date').addEventListener('change', e => { if (e.target.value) { date = e.target.value; renderAll(); } });
  $('#prev-day').addEventListener('click', () => { date = shiftDate(date, -1); renderAll(); });
  $('#next-day').addEventListener('click', () => { date = shiftDate(date, 1); renderAll(); });

  /* =====================================================
     Rendering
  ===================================================== */
  function dayTotals(d = date) {
    const f = data.food[d] || [];
    const w = data.workouts[d] || [];
    return {
      cal: sum(f, 'cal'), protein: sum(f, 'protein'), carbs: sum(f, 'carbs'), fat: sum(f, 'fat'),
      burned: sum(w, 'cal'), minutes: sum(w, 'min'), water: data.water[d] || 0
    };
  }

  function bar(label, val, goal, color, unit = 'g') {
    const pct = goal > 0 ? Math.min(100, (val / goal) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-head"><span>${label}</span><span><b>${round(val)}</b> / ${goal}${unit}</span></div>
      <div class="bar"><i style="width:${pct}%;background:${color}"></i></div></div>`;
  }

  function renderDashboard() {
    const t = dayTotals(), g = data.goals;
    const pct = g.cal > 0 ? Math.min(100, Math.round((t.cal / g.cal) * 100)) : 0;
    const over = t.cal > g.cal;
    const remaining = g.cal - t.cal + t.burned;
    const glasses = Array.from({ length: Math.max(g.water, t.water) }, (_, i) =>
      `<span class="${i < t.water ? '' : 'off'}">💧</span>`).join('');

    $('#dash').innerHTML = `
      <div class="card">
        <div class="ring-wrap">
          <div class="ring" style="--p:${pct};--ring-color:${over ? 'var(--danger)' : 'var(--brand)'}">
            <div class="ring-label"><b>${round(t.cal)}</b><small>of ${g.cal} kcal</small></div>
          </div>
          <div class="stats">
            <div class="stat"><span class="muted">Eaten</span><b>${round(t.cal)}</b></div>
            <div class="stat"><span class="muted">Burned</span><b>${round(t.burned)}</b></div>
            <div class="stat"><span class="muted">${remaining >= 0 ? 'Remaining' : 'Over by'}</span><b>${Math.abs(round(remaining))}</b></div>
            <div class="stat"><span class="muted">Active min</span><b>${round(t.minutes)}</b></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Macros</h2>
        ${bar('Protein', t.protein, g.protein, 'var(--protein)')}
        ${bar('Carbs', t.carbs, g.carbs, 'var(--carbs)')}
        ${bar('Fat', t.fat, g.fat, 'var(--fat)')}
      </div>
      <div class="card">
        <div class="water-ctrl">
          <div><h2 style="margin:0">Water</h2><span class="muted tiny">Goal: ${g.water} glasses</span></div>
          <div class="row" style="align-items:center">
            <button class="icon-btn" data-action="water-sub" aria-label="Remove glass">−</button>
            <span class="count">${t.water}</span>
            <button class="icon-btn" data-action="water-add" aria-label="Add glass">+</button>
          </div>
        </div>
        <div class="glasses">${glasses}</div>
      </div>`;
  }

  function renderFood() {
    const items = data.food[date] || [];
    const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    let html = '';
    meals.forEach(m => {
      const list = items.filter(i => i.meal === m);
      if (!list.length) return;
      html += `<div class="list-head"><span>${m}</span><span>${round(sum(list, 'cal'))} kcal</span></div>`;
      html += list.map(i => `
        <div class="item">
          <div><div>${esc(i.name)}</div>
          <div class="meta">P ${round(i.protein, 1)}g · C ${round(i.carbs, 1)}g · F ${round(i.fat, 1)}g</div></div>
          <div class="row" style="align-items:center"><span class="kcal">${round(i.cal)} kcal</span>
          <button class="del" data-action="del-food" data-id="${i.id}" aria-label="Delete">✕</button></div>
        </div>`).join('');
    });
    $('#food-list').innerHTML = html || '<div class="empty">No food logged for this day yet.</div>';
  }

  function renderWorkouts() {
    const items = data.workouts[date] || [];
    $('#workout-list').innerHTML = items.length
      ? items.map(i => `
        <div class="item">
          <div><div>${esc(i.type)} · ${round(i.min)} min</div>
          <div class="meta">${i.note ? esc(i.note) : '&nbsp;'}</div></div>
          <div class="row" style="align-items:center"><span class="kcal">${round(i.cal)} kcal</span>
          <button class="del" data-action="del-workout" data-id="${i.id}" aria-label="Delete">✕</button></div>
        </div>`).join('')
      : '<div class="empty">No workouts logged for this day yet.</div>';
  }

  function renderProgress() {
    // Last 7 days of calories
    const labels = [], vals = [];
    for (let i = 6; i >= 0; i--) {
      const d = shiftDate(date, -i);
      labels.push(parseDate(d).toLocaleDateString(undefined, { weekday: 'short' }));
      vals.push(dayTotals(d).cal);
    }
    drawBars($('#chart-cal'), labels, vals, data.goals.cal);

    // Weight
    const w = [...data.weight].sort((a, b) => a.date.localeCompare(b.date));
    drawLine($('#chart-weight'), w.slice(-14).map(x => x.date.slice(5)), w.slice(-14).map(x => x.kg));
    $('#weight-list').innerHTML = [...w].reverse().slice(0, 5).map(x => `
      <div class="item"><div>${x.date}</div>
      <div class="row" style="align-items:center"><span class="kcal">${x.kg} kg</span>
      <button class="del" type="button" data-action="del-weight" data-id="${x.id}" aria-label="Delete">✕</button></div></div>`).join('');
  }

  function renderAll() {
    $('#date').value = date;
    $('#date').max = '';
    renderDashboard();
    renderFood();
    renderWorkouts();
    if ($('#view-progress').classList.contains('active')) renderProgress();
  }

  /* =====================================================
     Charts (plain canvas, no libraries)
  ===================================================== */
  function setupCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, r.width, r.height);
    const css = getComputedStyle(document.documentElement);
    return { c, w: r.width, h: r.height, brand: css.getPropertyValue('--brand').trim(), muted: css.getPropertyValue('--muted').trim(), line: css.getPropertyValue('--line').trim() };
  }

  function drawBars(canvas, labels, vals, goal) {
    const { c, w, h, brand, muted, line } = setupCanvas(canvas);
    const pad = { l: 6, r: 6, t: 12, b: 22 };
    const max = Math.max(goal * 1.2, ...vals, 1);
    const bw = (w - pad.l - pad.r) / vals.length;
    const ph = h - pad.t - pad.b;
    c.font = '11px system-ui'; c.textAlign = 'center';
    vals.forEach((v, i) => {
      const bh = ph * v / max;
      c.fillStyle = brand;
      c.globalAlpha = v > goal ? 0.5 : 1;
      c.fillRect(pad.l + i * bw + bw * 0.18, h - pad.b - bh, bw * 0.64, bh);
      c.globalAlpha = 1;
      c.fillStyle = muted;
      c.fillText(labels[i], pad.l + i * bw + bw / 2, h - 6);
    });
    const gy = h - pad.b - ph * goal / max;
    c.strokeStyle = line; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(pad.l, gy); c.lineTo(w - pad.r, gy); c.stroke(); c.setLineDash([]);
    c.fillStyle = muted; c.textAlign = 'left'; c.fillText('goal', pad.l, gy - 4);
  }

  function drawLine(canvas, labels, vals) {
    const { c, w, h, brand, muted, line } = setupCanvas(canvas);
    c.font = '11px system-ui'; c.fillStyle = muted; c.textAlign = 'center';
    if (vals.length < 2) {
      c.fillText(vals.length ? 'Log one more weight to see a trend' : 'No weight logged yet', w / 2, h / 2);
      return;
    }
    const pad = { l: 28, r: 10, t: 12, b: 22 };
    const min = Math.min(...vals) - 1, max = Math.max(...vals) + 1;
    const x = i => pad.l + (w - pad.l - pad.r) * i / (vals.length - 1);
    const y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
    c.strokeStyle = line;
    [min, (min + max) / 2, max].forEach(v => {
      c.beginPath(); c.moveTo(pad.l, y(v)); c.lineTo(w - pad.r, y(v)); c.stroke();
      c.textAlign = 'right'; c.fillText(round(v, 1), pad.l - 4, y(v) + 4);
    });
    c.strokeStyle = brand; c.lineWidth = 2.5; c.lineJoin = 'round'; c.beginPath();
    vals.forEach((v, i) => i ? c.lineTo(x(i), y(v)) : c.moveTo(x(i), y(v)));
    c.stroke();
    c.fillStyle = brand;
    vals.forEach((v, i) => { c.beginPath(); c.arc(x(i), y(v), 3.5, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = muted; c.textAlign = 'center';
    const step = Math.ceil(labels.length / 5);
    labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) c.fillText(l, x(i), h - 6); });
  }

  window.addEventListener('resize', () => { if (session && $('#view-progress').classList.contains('active')) renderProgress(); });

  /* =====================================================
     Forms & actions
  ===================================================== */
  // Food presets
  $('#food-presets').innerHTML = Object.keys(PRESETS).map(n => `<option value="${esc(n)}">`).join('');
  $('#food-name').addEventListener('input', e => {
    const p = PRESETS[e.target.value];
    if (p) {
      $('#food-cal').value = p[0]; $('#food-protein').value = p[1];
      $('#food-carbs').value = p[2]; $('#food-fat').value = p[3];
    }
  });

  $('#food-form').addEventListener('submit', e => {
    e.preventDefault();
    const protein = num($('#food-protein').value), carbs = num($('#food-carbs').value), fat = num($('#food-fat').value);
    let cal = $('#food-cal').value === '' ? protein * 4 + carbs * 4 + fat * 9 : num($('#food-cal').value);
    const name = $('#food-name').value.trim();
    if (!name) return;
    (data.food[date] ||= []).push({ id: Date.now(), name, meal: $('#food-meal').value, cal, protein, carbs, fat });
    save(); e.target.reset(); renderAll(); toast('Food added');
  });

  // Workouts
  $('#w-type').innerHTML = Object.keys(WORKOUTS).map(k => `<option>${k}</option>`).join('');
  $('#workout-form').addEventListener('submit', e => {
    e.preventDefault();
    const type = $('#w-type').value, min = num($('#w-min').value);
    if (min <= 0) return;
    let cal = $('#w-cal').value;
    if (cal === '') {
      const latest = [...data.weight].sort((a, b) => a.date.localeCompare(b.date)).pop();
      const kg = latest ? latest.kg : 70;
      cal = round(WORKOUTS[type] * kg * (min / 60));   // MET × kg × hours
    }
    (data.workouts[date] ||= []).push({ id: Date.now(), type, min, cal: num(cal), note: $('#w-note').value.trim() });
    save(); e.target.reset(); renderAll(); toast('Workout added');
  });

  // Weight
  $('#weight-form').addEventListener('submit', e => {
    e.preventDefault();
    const kg = num($('#weight-kg').value);
    if (kg <= 0) return;
    data.weight = data.weight.filter(x => x.date !== date);    // one entry per day
    data.weight.push({ id: Date.now(), date, kg: round(kg, 1) });
    save(); $('#weight-kg').value = ''; renderProgress(); toast('Weight saved');
  });

  // Goals
  function fillGoals() {
    const g = data.goals;
    $('#g-cal').value = g.cal; $('#g-water').value = g.water;
    $('#g-protein').value = g.protein; $('#g-carbs').value = g.carbs; $('#g-fat').value = g.fat;
  }
  $('#goals-form').addEventListener('submit', e => {
    e.preventDefault();
    data.goals = {
      cal: num($('#g-cal').value), water: Math.round(num($('#g-water').value)),
      protein: num($('#g-protein').value), carbs: num($('#g-carbs').value), fat: num($('#g-fat').value)
    };
    save(); renderAll(); toast('Goals saved');
  });

  // Delegated clicks (delete buttons, water)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !session) return;
    const id = Number(b.dataset.id);
    switch (b.dataset.action) {
      case 'water-add': data.water[date] = (data.water[date] || 0) + 1; break;
      case 'water-sub': data.water[date] = Math.max(0, (data.water[date] || 0) - 1); break;
      case 'del-food': data.food[date] = (data.food[date] || []).filter(x => x.id !== id); break;
      case 'del-workout': data.workouts[date] = (data.workouts[date] || []).filter(x => x.id !== id); break;
      case 'del-weight': data.weight = data.weight.filter(x => x.id !== id); break;
      default: return;
    }
    save(); renderAll(); if (b.dataset.action === 'del-weight') renderProgress();
  });

  // Account actions
  $('#logout-btn').addEventListener('click', logout);

  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ user: { name: user.name, email: session }, ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fittrack-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Erase all food, workout, water and weight logs? Your account and goals stay.')) return;
    const goals = data.goals;
    data = defaultData(); data.goals = goals;
    save(); renderAll(); toast('Logs erased');
  });

  /* =====================================================
     PWA: service worker + install button
  ===================================================== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    $('#install-btn').classList.remove('hidden');
  });
  $('#install-btn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#install-btn').classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => $('#install-btn').classList.add('hidden'));

  /* =====================================================
     Boot
  ===================================================== */
  const saved = store.get('ft_session', null);
  if (saved && store.get('ft_users', {})[saved]) startSession(saved);
  else showAuth();
})();