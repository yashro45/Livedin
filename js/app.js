/* LivedIn - application shell: session guard, routing, rendering, live alerts, housekeeping timer. */
(function () {
  'use strict';
  const LI = window.LI, ui = LI.ui, store = LI.store, { html } = LI, U = LI;
  const SESSION_KEY = 'livedin_session', PID_KEY = 'livedin_pid';
  const $ = (id) => document.getElementById(id);

  const NAV = {
    patient: [['today', 'Today', 'home'], ['assistant', 'Assistant', 'mic'], ['emergency', 'Emergency', 'sos'], ['appointments', 'Appointments', 'calendar'], ['safety', 'My safety', 'pin'], ['privacy', 'Privacy', 'lock']],
    family: [['overview', 'Overview', 'home'], ['safetrack', 'SafeTrack', 'pin'], ['medicines', 'Medicines', 'pill'], ['health', 'Health', 'heart'], ['appointments', 'Appointments', 'calendar'], ['reports', 'Reports', 'file'], ['alerts', 'Alerts', 'bell'], ['contact', 'Contact', 'phone'], ['device', 'Smart device', 'chip']],
    caretaker: [['patients', 'Patients', 'users'], ['care', 'Care today', 'check'], ['medicines', 'Medicines & stock', 'pill'], ['safetrack', 'SafeTrack', 'pin'], ['appointments', 'Schedule', 'calendar'], ['reports', 'Reports', 'file'], ['alerts', 'Alerts', 'bell'], ['device', 'Smart device', 'chip'], ['contact', 'Contact', 'phone']],
    doctor: [['patients', 'Patients', 'users'], ['overview', 'Overview', 'home'], ['reports', 'Reports', 'file'], ['medicines', 'Medicine schedule', 'pill'], ['appointments', 'Appointments', 'calendar'], ['notes', 'Consult notes', 'steth'], ['adherence', 'Adherence', 'chart']],
  };
  const TITLES = { patient: 'Patient', family: 'Family', caretaker: 'Caretaker', doctor: 'Doctor' };

  let user = null, pid = null, pending = false, seen = new Set(), lastRender = 0;

  /* ---------- session ---------- */
  function readSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function touch() {
    const s = readSession(); if (!s) return; const now = Date.now();
    if (now - s.seen > 10000) { s.seen = now; try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  }
  function guard() {
    user = LI.validateSession(readSession(), LI.USERS, Date.now());
    if (!user) { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.replace('login.html?expired=1'); return false; }
    return true;
  }

  /* ---------- context ---------- */
  LI.getCtx = () => { const s = store.get(); return { role: user.role, user, pid, p: s.patients[pid], s, now: Date.now() }; };
  LI.setPid = (id) => { if (!LI.canAccessPatient(user, id)) return; pid = id; try { sessionStorage.setItem(PID_KEY, id); } catch (e) { /* ignore */ } const sel = $('patientSel'); if (sel) sel.value = id; render(true); };

  /* ---------- routing ---------- */
  const viewName = () => { const v = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return LI.canView(user.role, v) ? v : LI.DEFAULT_VIEW[user.role]; };

  function isEditing() {
    const a = document.activeElement; if (!a || !$('view').contains(a)) return false;
    if (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
    if (a.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit'].includes(a.type);
    return false;
  }

  function syncLive() {
    const c = LI.getCtx(); updateMap(c); syncChrome(c);
  }
  function updateMap(c) {
    const slot = $('mapSlot'); if (!slot || !LI.consentAllows(c.role, c.p.consent, 'location')) return;
    LI.SafeMap.update({ zone: c.p.safezone, loc: c.p.location, inside: c.p.location.inside, trail: c.p.locHistory.slice(-25) });
  }

  function render(force) {
    if (!user) return;
    if (!force && isEditing()) { pending = true; syncLive(); return; }
    pending = false; lastRender = Date.now();
    const name = viewName(), c = LI.getCtx(), view = $('view'), act = document.activeElement;
    const fid = act && act.id && view.contains(act) ? act.id : null, top = window.scrollY;
    let out;
    try { out = LI.views[name](c); } catch (e) { console.error(e); out = html`<div class="card"><h2>Something went wrong</h2><p>This page could not be shown. Try another page.</p></div>`; }
    view.innerHTML = out.toString();
    ui.hydrate(view);
    const slot = view.querySelector('#mapSlot');
    if (slot && LI.consentAllows(c.role, c.p.consent, 'location')) { LI.SafeMap.mount(slot); updateMap(c); }
    const chatLog = $('chatLog'); if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
    if (fid) { const el = $(fid); if (el && view.contains(el)) el.focus({ preventScroll: true }); }
    window.scrollTo(0, top);
    syncChrome(c);
  }
  LI.rerender = render;

  /* ---------- chrome ---------- */
  function buildChrome() {
    const nav = $('nav');
    nav.innerHTML = NAV[user.role].map((n) => html`<a class="nav-a" href="#/${n[0]}" data-view="${n[0]}"><svg class="ic" width="22" height="22" aria-hidden="true"><use href="#i-${n[2]}"/></svg><span>${n[1]}</span><span class="nav-badge" data-badge="${n[0]}" hidden></span></a>`).join('');
    $('who').innerHTML = html`<span class="avatar">${user.name.replace('Dr. ', '')[0]}</span><span class="who-t"><strong>${user.name}</strong><span class="small muted">${TITLES[user.role]} - ${user.uid}</span></span>`.s;
    const sel = $('patientSel');
    if (user.patientIds.length > 1) { sel.innerHTML = user.patientIds.map((id) => html`<option value="${id}">${store.get().patients[id].name}</option>`).join(''); sel.value = pid; sel.hidden = false; $('patientName').hidden = true; }
    else { sel.hidden = true; $('patientName').hidden = false; }
  }
  function syncChrome(c) {
    c = c || LI.getCtx();
    document.querySelectorAll('.nav-a').forEach((a) => { if (a.dataset.view === viewName()) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('patientName').textContent = 'Caring for ' + c.p.name;
    const unread = c.s.alerts.filter((a) => a.audience.includes(c.role) && user.patientIds.includes(a.pid) && !a.readBy[c.role]).length;
    const b = $('bellBadge'); b.textContent = unread > 99 ? '99+' : String(unread); b.hidden = !unread;
    $('bellBtn').setAttribute('aria-label', 'Notifications, ' + unread + ' unread');
    const ab = document.querySelector('[data-badge="alerts"]'); if (ab) { ab.textContent = String(unread); ab.hidden = !unread; }
    const d = c.p.device, sos = d.sosPressed;
    $('sosBanner').hidden = !sos; if (sos) $('sosBanner').querySelector('span').textContent = 'SOS active for ' + c.p.name + '. Last location ' + LI.fmtCoord(c.p.location.lat, c.p.location.lng) + '.';
    const t = new Date(); $('clock').textContent = U.fmtTime12(U.pad(t.getHours()) + ':' + U.pad(t.getMinutes()));
  }

  /* ---------- live alert toasts across tabs ---------- */
  function onState(s, reason) {
    const fresh = s.alerts.filter((a) => !seen.has(a.id)).reverse();
    fresh.forEach((a) => seen.add(a.id));
    for (const a of fresh) {
      if (!a.audience.includes(user.role) || !user.patientIds.includes(a.pid)) continue;
      const kind = a.sev === 'critical' ? 'critical' : a.sev === 'warn' ? 'warn' : 'info';
      ui.toast(a.title + ': ' + a.msg, kind);
      if (a.sev === 'critical') ui.beep([990, 740, 990]);
      if (user.role === 'patient' && a.type === 'medicine_reminder') ui.speak(a.msg, LI.chat.lang);
    }
    render(false);
  }

  /* ---------- events ---------- */
  const own = (t, k) => Object.prototype.hasOwnProperty.call(t, k) && typeof t[k] === 'function';
  document.addEventListener('click', (e) => {
    touch();
    const el = e.target.closest('[data-action]'); if (!el) return;
    const n = el.dataset.action; if (!own(LI.actions, n)) return;
    if (el.tagName === 'A') e.preventDefault();
    try { LI.actions[n](el, e); } catch (err) { console.error(err); ui.toast('Something went wrong. Please try again.', 'warn'); }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault(); const n = form.dataset.form; if (!own(LI.forms, n)) return;
    try { LI.forms[n](form, e); } catch (err) { console.error(err); ui.toast('Something went wrong. Please try again.', 'warn'); }
  });
  document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && own(LI.inputs, el.dataset.input)) LI.inputs[el.dataset.input](el, e); });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=range]')) t.blur(); // releases focus so deferred re-render can run
    const el = t.closest('[data-change]'); if (el && own(LI.changes, el.dataset.change)) LI.changes[el.dataset.change](el, e);
  });
  document.addEventListener('focusout', () => { setTimeout(() => { if (pending && !isEditing()) render(true); }, 60); });
  document.addEventListener('keydown', touch);
  window.addEventListener('hashchange', () => { document.body.classList.remove('nav-open'); render(true); $('view').focus({ preventScroll: true }); window.scrollTo(0, 0); });

  /* ---------- boot ---------- */
  function boot() {
    if (!guard()) return;
    try { const t = localStorage.getItem('livedin_text'); if (['large', 'xl'].includes(t)) document.documentElement.dataset.text = t; if (localStorage.getItem('livedin_contrast') === 'high') document.documentElement.dataset.contrast = 'high'; } catch (e) { /* ignore */ }
    store.init();
    store.update((s) => { Object.values(s.patients).forEach((p) => { p.device.realWatching = false; }); }, 'boot');
    let saved = null; try { saved = sessionStorage.getItem(PID_KEY); } catch (e) { /* ignore */ }
    pid = LI.canAccessPatient(user, saved) ? saved : user.patientIds[0];
    store.tick((s) => store.core.sweep(s, Date.now()));
    store.get().alerts.forEach((a) => seen.add(a.id));
    buildChrome();
    $('patientSel').addEventListener('change', (e) => LI.setPid(e.target.value));
    LI.SafeMap.setPickHandler((lat, lng) => LI.onMapPick(lat, lng), 'patient');
    store.subscribe(onState);
    render(true);
    // housekeeping: reminders, missed doses, battery drain, appointment reminders, daily report, session expiry
    setInterval(() => {
      if (!guard()) return;
      const now = new Date();
      store.tick((s) => {
        store.core.sweep(s, now.getTime());
        if (now.getHours() >= 20) for (const id of Object.keys(s.patients)) if (s.daily[id] !== U.ymd(now)) store.core.dailyReport(s, id, now.getTime());
      });
      if (Date.now() - lastRender > 20000) render(false);
    }, 4000);
    ui.toast('Welcome, ' + user.name.split(' ')[0] + '. Demo data is fictional.', 'info', { ms: 3500 });
  }
  const dlg = $('dlg'); dlg.addEventListener('click', (e) => { if (e.target === dlg) ui.closeDialog(); });
  boot();
})();
