/* LivedIn - sign-in logic: validation, hashed credential check, lockout, session creation, auto-fill. */
(function () {
  'use strict';
  const LI = window.LI;
  const SESSION_KEY = 'livedin_session', LOCK_KEY = 'livedin_lock';
  const ROLES = [
    { role: 'patient', label: 'Patient', icon: 'M12 4a3.600 3.600 0 100 7.200A3.600 3.600 0 0012 4zM4.500 20c.8-4 3.800-6 7.500-6s6.700 2 7.500 6' },
    { role: 'family', label: 'Family', icon: 'M9 5.500a3 3 0 100 6 3 3 0 000-6zM17 7a2.400 2.400 0 100 4.800A2.400 2.400 0 0017 7zM3 19c.6-3.400 3-5 6-5s5.400 1.600 6 5M16 14.200c2.600-.3 4.600 1 5.200 4' },
    { role: 'caretaker', label: 'Caretaker', icon: 'M12 21c-4.500-3.200-8-6-8-10a4 4 0 017.200-2.400L12 9.700l.8-1.100A4 4 0 0120 11c0 4-3.500 6.800-8 10z' },
    { role: 'doctor', label: 'Doctor', icon: 'M6 3v6a4 4 0 008 0V3M10 13v2a4 4 0 004 4 4 4 0 004-4v-2M18 9a2 2 0 100 4 2 2 0 000-4z' },
  ];
  const $ = (id) => document.getElementById(id);
  const form = $('form'), uid = $('uid'), pw = $('pw'), msg = $('msg'), opts = $('roleOpts');
  let role = 'patient', lockTimer = null;

  // already signed in?
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (LI.sessionValid(s, Date.now())) { location.replace('app.html'); return; }
  } catch (e) { sessionStorage.removeItem(SESSION_KEY); }

  /* role selector (native radios = keyboard + screen-reader friendly) */
  opts.innerHTML = ROLES.map((r) => LI.html`<label class="role-opt"><input type="radio" name="role" value="${r.role}"><span><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="${r.icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${r.label}</span></label>`).join('');
  function setRole(r, fill) {
    role = r;
    opts.querySelectorAll('input').forEach((i) => { i.checked = i.value === r; });
    if (fill) fillCreds();
    say('');
  }
  opts.addEventListener('change', (e) => { if (e.target.name === 'role') setRole(e.target.value, false); });

  function user(r) { return LI.USERS.find((u) => u.role === r); }
  function fillCreds() { const u = user(role); uid.value = u.uid; pw.value = '1845'; pw.type = 'password'; $('togglePw').textContent = 'Show'; $('togglePw').setAttribute('aria-pressed', 'false'); }
  function say(text, ok) { msg.textContent = text; msg.classList.toggle('ok', !!ok); }

  /* demo credential list */
  $('demoList').innerHTML = LI.USERS.map((u) => LI.html`<li><button type="button" data-role="${u.role}"><b>${u.title}</b><code>${u.uid}</code><small>${u.name}</small></button></li>`).join('');
  $('demoList').addEventListener('click', (e) => { const b = e.target.closest('button[data-role]'); if (b) { setRole(b.dataset.role, true); say('Credentials filled in. Press Sign in.', true); $('submit').focus(); } });
  $('autofill').addEventListener('click', () => { fillCreds(); say('Credentials filled in. Press Sign in.', true); $('submit').focus(); });
  $('togglePw').addEventListener('click', (e) => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Hide' : 'Show'; e.currentTarget.setAttribute('aria-pressed', String(show)); e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
  uid.addEventListener('input', () => { uid.value = uid.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  /* lockout */
  const getLock = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); } catch (e) { return {}; } };
  const setLock = (r) => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } };
  function refreshLock() {
    const left = LI.lockRemaining(getLock(), Date.now());
    $('submit').disabled = left > 0;
    if (left > 0) { say('Too many attempts. Try again in ' + left + ' s.'); clearTimeout(lockTimer); lockTimer = setTimeout(refreshLock, 1000); }
    else if (msg.textContent.startsWith('Too many')) say('');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (LI.lockRemaining(getLock(), Date.now()) > 0) { refreshLock(); return; }
    const id = LI.cleanText(uid.value, 7).toUpperCase(), pass = LI.cleanText(pw.value, 32);
    if (!LI.isValidUserId(id)) { say('Enter a valid User ID (3 letters + 4 digits).'); uid.focus(); return; }
    if (!pass) { say('Enter your password.'); pw.focus(); return; }
    const u = LI.USERS.find((x) => x.uid === id && x.role === role);
    // always compute a hash so response time does not reveal whether the ID exists
    const salt = u ? u.salt : 'lv-none-000000';
    const digest = LI.hashPassword(pass, salt);
    if (u && LI.safeEqual(digest, u.hash)) {
      setLock({});
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(LI.makeSession(u.uid, u.role, Date.now())));
      say('Signed in. Opening your dashboard...', true);
      location.assign('app.html');
      return;
    }
    const rec = LI.registerFailure(getLock(), Date.now()); setLock(rec);
    pw.value = '';
    if (LI.lockRemaining(rec, Date.now()) > 0) refreshLock();
    else say('Invalid ID, password or role. ' + (LI.MAX_FAILS - rec.fails) + ' attempt(s) left.');
  });

  const wanted = new URLSearchParams(location.search).get('role');
  setRole(ROLES.some((r) => r.role === wanted) ? wanted : 'patient', false);
  if (wanted) { fillCreds(); say('Demo credentials filled in for you.', true); }
  refreshLock();
})();
