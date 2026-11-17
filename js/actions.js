/*
 * LivedIn - click/submit/input/change handlers. Dispatch is by allow-list: only own properties of
 * these tables can be invoked from data-* attributes, and every state change re-checks the role.
 */
(function () {
  'use strict';
  const LI = window.LI, ui = LI.ui, store = LI.store, { html } = LI, U = LI;
  const A = LI.actions, F = LI.forms, I = LI.inputs, C = (LI.changes = {});
  const ctx = () => LI.getCtx();
  const SESSION_KEY = 'livedin_session';

  /** Role-checked state change. */
  function run(name, ...args) {
    const c = ctx();
    if (!LI.can(c.role, name) || !LI.canAccessPatient(c.user, c.pid)) { ui.toast('That action is not available for your role.', 'warn'); return false; }
    store.act(name, ...args); return true;
  }
  const $ = (id) => document.getElementById(id);
  const num = (v) => (v === '' || v == null ? NaN : Number(v));
  function fd(form) { const o = {}; new FormData(form).forEach((v, k) => { if (typeof v === 'string') o[k] = LI.cleanText(v, 1500); }); return o; }
  const warn = (t) => ui.toast(t, 'warn');
  const first = (n) => String(n).split(' ')[0];

  /* ---------- shell ---------- */
  A.closeDialog = () => ui.closeDialog();
  A.toggleSidebar = () => { const b = document.body.classList.toggle('nav-open'); const btn = $('menuBtn'); if (btn) btn.setAttribute('aria-expanded', String(b)); };
  A.logout = () => { try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('livedin_pid'); } catch (e) { /* ignore */ } location.href = 'login.html'; };
  A.resetDemo = async () => { if (await ui.confirm('Reset demo data?', 'This restores all patients, medicines, reports and alerts to the original demo data.', 'Reset')) { store.reset(); ui.toast('Demo data reset.', 'info'); } };
  A.textSize = () => { const order = ['normal', 'large', 'xl'], cur = document.documentElement.dataset.text || 'normal', nx = order[(order.indexOf(cur) + 1) % 3]; document.documentElement.dataset.text = nx; try { localStorage.setItem('livedin_text', nx); } catch (e) { /* ignore */ } ui.toast('Text size: ' + nx, 'info', { ms: 1800 }); };
  A.contrast = () => { const on = document.documentElement.dataset.contrast === 'high'; if (on) delete document.documentElement.dataset.contrast; else document.documentElement.dataset.contrast = 'high'; try { localStorage.setItem('livedin_contrast', on ? 'normal' : 'high'); } catch (e) { /* ignore */ } };
  A.openAlerts = () => { const c = ctx(); ui.openDialog('Notifications', html`<div class="row end"><button class="btn btn-sm" type="button" data-action="readAll">Mark all read</button></div>${LI.shared.alertList(c, 30, c.user.patientIds.length > 1)}`, { cls: 'wide' }); };
  A.readAlert = (el) => { const c = ctx(); store.update((s) => store.core.markRead(s, el.dataset.id, c.role), 'read'); if ($('dlg').open) A.openAlerts(); };
  A.readAll = () => { const c = ctx(); store.update((s) => store.core.markAllRead(s, c.role, null), 'read'); if ($('dlg').open) A.openAlerts(); };
  A.selectPatient = (el) => { const c = ctx(); if (!LI.canAccessPatient(c.user, el.dataset.pid)) return warn('You are not assigned to this patient.'); LI.setPid(el.dataset.pid); location.hash = '#/' + (c.role === 'doctor' ? 'overview' : 'care'); };

  /* ---------- medicines and stock ---------- */
  A.markDose = (el) => {
    const c = ctx(), d = el.dataset;
    if (!LI.isValidDate(d.date) || !LI.isValidTime(d.time) || !c.p.meds.some((m) => m.id === d.med)) return warn('That dose could not be found.');
    if (run('setDose', c.pid, d.med, d.date, d.time, 'taken', c.role === 'patient' ? 'patient' : 'caretaker')) ui.toast(c.role === 'patient' ? 'Well done! Dose recorded.' : 'Dose confirmed.', 'ok');
  };
  A.requestOrder = (el) => { const c = ctx(); if (run('requestOrder', c.pid, el.dataset.id, c.user.name)) ui.toast('The family has been notified to order this medicine.', 'ok'); };
  A.placeOrder = (el) => { const c = ctx(); if (run('placeOrder', c.pid, el.dataset.id, c.user.name)) ui.toast('Order placed (demo).', 'ok'); };
  A.openReceive = (el) => { const m = ctx().p.meds.find((x) => x.id === el.dataset.id); if (!m) return; ui.openDialog('Mark ' + m.name + ' as received', html`<form data-form="receive" class="stack-s"><input type="hidden" name="id" value="${m.id}"><div class="field"><label for="rcQty">Units received</label><input id="rcQty" name="qty" type="number" min="1" max="500" value="30" required></div><div class="row end"><button class="btn" type="button" data-action="closeDialog">Cancel</button><button class="btn btn-primary" type="submit">Add to stock</button></div></form>`); };
  F.receive = (form) => { const c = ctx(), o = fd(form), q = num(o.qty); if (!(q >= 1 && q <= 500)) return warn('Enter a quantity from 1 to 500.'); if (run('receiveStock', c.pid, o.id, q)) { ui.closeDialog(); ui.toast('Stock updated.', 'ok'); } };

  /* ---------- SOS, alerts ---------- */
  A.sos = () => { const c = ctx(); if (run('sos', c.pid, c.role === 'patient' ? 'patient button' : c.role)) { ui.beep([990, 740, 990, 740]); ui.toast('SOS sent. Family and caretaker have your location.', 'critical'); } };
  A.ackSos = () => { const c = ctx(); if (run('clearSos', c.pid, c.user.name)) ui.toast('SOS acknowledged.', 'ok'); };
  A.genDaily = () => { const c = ctx(); if (run('dailyReport', c.pid, Date.now())) ui.toast('Daily summary created.', 'ok'); };

  /* ---------- SafeTrack ---------- */
  A.setMode = (el) => { const c = ctx(); if (!LI.can(c.role, 'setLocation')) return; const mode = el.dataset.mode === 'real' ? 'real' : 'demo'; if (mode === 'demo') A.realStop(); store.update((s) => { s.patients[c.pid].device.mode = mode; }, 'mode'); };
  let watchId = null;
  A.realStart = () => {
    const c = ctx();
    if (!LI.can(c.role, 'setLocation')) return;
    if (!navigator.geolocation) return warn('This browser does not support location.');
    const pid = c.pid;
    watchId = navigator.geolocation.watchPosition((pos) => { store.act('setLocation', pid, pos.coords.latitude, pos.coords.longitude, 'gps'); }, (err) => { ui.toast(err.code === 1 ? 'Location permission was denied.' : 'Could not get a location fix.', 'warn'); A.realStop(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    store.update((s) => { s.patients[pid].device.realWatching = true; }, 'mode'); ui.toast('Real tracking started.', 'ok');
  };
  A.realStop = () => { const c = ctx(); if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; if (c && c.p && c.p.device.realWatching) store.update((s) => { s.patients[c.pid].device.realWatching = false; }, 'mode'); };
  LI.onMapPick = (lat, lng) => { const c = ctx(); if (!c || c.p.device.mode !== 'demo') return; if (!LI.can(c.role, 'setLocation')) return; store.act('setLocation', c.pid, lat, lng, 'demo'); };
  const bearingSel = () => { const el = $('simDir'); const v = el ? Number(el.value) : 90; return [0, 90, 180, 270].includes(v) ? v : 90; };
  A.simOut = () => { const c = ctx(), z = c.p.safezone, d = LI.destination(z, z.radius + 140, bearingSel()); run('setLocation', c.pid, d.lat, d.lng, 'demo'); };
  A.simHome = () => { const c = ctx(), z = c.p.safezone; run('setLocation', c.pid, z.lat, z.lng, 'demo'); };
  I.simDist = (el) => { const c = ctx(), z = c.p.safezone, m = LI.clamp(el.value, 0, 1200), o = $('simDistOut'); if (o) o.textContent = Math.round(m) + ' m'; const d = m === 0 ? { lat: z.lat, lng: z.lng } : LI.destination(z, m, bearingSel()); run('setLocation', c.pid, d.lat, d.lng, 'demo'); };
  I.zoneR = (el) => { const o = $('zoneRout'); if (o) o.textContent = Math.round(LI.clamp(el.value, 50, 1000)) + ' m'; };
  F.zone = (form) => { const c = ctx(), r = num(fd(form).radius); if (!(r >= 50 && r <= 1000)) return warn('Radius must be 50 to 1000 m.'); if (run('updateZone', c.pid, { radius: r })) ui.toast('Safe zone saved: ' + r + ' m.', 'ok'); };
  A.recenter = async () => { const c = ctx(); if (await ui.confirm('Move the safe zone?', 'Use the current position as the new home location.', 'Use this position')) { if (run('updateZone', c.pid, { lat: c.p.location.lat, lng: c.p.location.lng })) ui.toast('Home location updated.', 'ok'); } };
  A.outing = (el) => { const c = ctx(), h = Number(el.dataset.h); if (![0, 1, 2, 4].includes(h)) return; if (run('setOuting', c.pid, h, c.user.name)) ui.toast(h ? 'Planned outing mode on for ' + h + ' h.' : 'Outing mode ended.', 'ok'); };

  /* ---------- simulated device ---------- */
  I.battery = (el) => { const c = ctx(), v = LI.clamp(el.value, 0, 100), o = $('battOut'); if (o) o.textContent = Math.round(v) + '%'; run('setBattery', c.pid, v); };
  A.battery = (el) => { const c = ctx(); run('setBattery', c.pid, LI.clamp(el.dataset.v, 0, 100)); };
  C.drain = (el) => { const c = ctx(); if (!LI.can(c.role, 'setBattery')) return; store.update((s) => { s.patients[c.pid].device.drain = el.checked; }, 'device'); };
  A.online = (el) => { const c = ctx(); run('setOnline', c.pid, el.dataset.v === '1'); };
  A.move = () => { const c = ctx(), d = LI.destination(c.p.location, 20, Math.random() * 360); run('setLocation', c.pid, d.lat, d.lng, 'demo'); ui.toast('Movement detected (simulated).', 'info', { ms: 2000 }); };
  A.openBox = () => { const c = ctx(); if (run('setBox', c.pid, true)) ui.toast('Medicine box opened (simulated).', 'info', { ms: 2200 }); };
  A.closeBox = () => {
    const c = ctx(); if (!run('setBox', c.pid, false)) return;
    const d = LI.dosesForDate(c.p, U.ymd(c.now), c.now).find((x) => x.status === 'due' || x.status === 'overdue');
    if (d && LI.can(c.role, 'setDose')) { store.act('setDose', c.pid, d.medId, d.date, d.time, 'taken', 'device'); ui.toast(d.name + ' recorded as taken by the smart box (simulated).', 'ok'); }
    else ui.toast('Box closed. No dose was due.', 'info', { ms: 2500 });
  };
  A.buzzer = () => { ui.beep([880, 660, 880, 660]); ui.toast('Buzzer sounded (simulated).', 'info', { ms: 2200 }); };
  A.voiceAlert = () => { const c = ctx(), n = LI.dosesForDate(c.p, U.ymd(c.now), c.now).find((d) => d.status !== 'taken' && d.status !== 'none'); const t = n ? 'Time for your medicine: ' + n.name + ' ' + n.dose : 'All of today\'s medicines are done.'; if (!ui.speak(t, 'en')) ui.beep(); ui.toast('Voice alert: ' + t, 'info'); };

  /* ---------- caretaker ---------- */
  C.task = (el) => { const c = ctx(); run('toggleTask', c.pid, el.dataset.id, c.user.name); };
  F.addTask = (form) => { const c = ctx(), t = LI.cleanText(fd(form).label, 80); if (!t) return warn('Enter an activity.'); if (run('addTask', c.pid, t)) form.reset(); };
  F.addVitals = (form) => {
    const c = ctx(), o = fd(form), v = { sys: num(o.sys), dia: num(o.dia), sugar: num(o.sugar), pulse: num(o.pulse), mood: o.mood };
    const ok = (n, lo, hi) => n >= lo && n <= hi;
    if (!ok(v.sys, 60, 260) || !ok(v.dia, 30, 160) || !ok(v.sugar, 30, 600) || !ok(v.pulse, 30, 220)) return warn('Please check the numbers: they look out of range.');
    if (!['Calm', 'Cheerful', 'Tired', 'Anxious', 'Confused', 'In pain'].includes(v.mood)) v.mood = 'Calm';
    if (run('addVitals', c.pid, v, c.user.name)) { form.reset(); ui.toast('Condition recorded.', 'ok'); }
  };
  F.addCareNote = (form) => { const c = ctx(), t = fd(form).text; if (!t) return warn('Write a note first.'); if (run('addCareNote', c.pid, t, c.user.name)) { form.reset(); ui.toast('Note shared with the family.', 'ok'); } };
  A.emergencyDlg = () => ui.openDialog('Report an emergency', html`<form data-form="emergency" class="stack-s"><div class="field"><label for="emKind">What happened?</label><select id="emKind" name="kind"><option>Fall</option><option>Chest pain</option><option>Breathlessness</option><option>Unresponsive</option><option>Other</option></select></div><div class="field"><label for="emText">Details</label><textarea id="emText" name="text" maxlength="300"></textarea></div><p class="small muted">Family and the doctor are alerted immediately. For life-threatening situations also call 112.</p><div class="row end"><button class="btn" type="button" data-action="closeDialog">Cancel</button><button class="btn btn-danger" type="submit">Send emergency alert</button></div></form>`);
  F.emergency = (form) => { const c = ctx(), o = fd(form), kinds = ['Fall', 'Chest pain', 'Breathlessness', 'Unresponsive', 'Other']; if (run('emergency', c.pid, kinds.includes(o.kind) ? o.kind : 'Other', o.text || 'Immediate help needed.', c.user.name)) { ui.closeDialog(); ui.beep([990, 740, 990]); ui.toast('Emergency alert sent.', 'critical'); } };

  /* ---------- messages ---------- */
  F.message = (form) => { const c = ctx(), o = fd(form); if (!['family', 'caretaker', 'doctor'].includes(o.to) || o.to === c.role) return warn('Choose who to message.'); if (!o.text) return warn('Write a message.'); if (run('message', c.pid, o.to, c.user.name + ' (' + c.user.title + ')', o.text)) { form.reset(); ui.toast('Message sent.', 'ok'); } };

  /* ---------- appointments ---------- */
  function apptForm(title, a) {
    const today = U.ymd(Date.now());
    ui.openDialog(title, html`<form data-form="${a ? 'editAppt' : 'newAppt'}" class="stack-s">${a ? html`<input type="hidden" name="id" value="${a.id}">` : ''}${a ? '' : html`<div class="field"><label for="apT">Title</label><input id="apT" name="title" type="text" maxlength="80" required></div><div class="field"><label for="apW">With</label><input id="apW" name="with" type="text" maxlength="60" value="Dr. Anil Kapoor" required></div><div class="field"><label for="apL">Location</label><input id="apL" name="location" type="text" maxlength="80" value="City Care Clinic" required></div>`}<div class="grid g2s"><div class="field"><label for="apD">Date</label><input id="apD" name="date" type="date" min="${today}" value="${a ? a.date : U.ymd(U.addDays(Date.now(), 1))}" required></div><div class="field"><label for="apH">Time</label><input id="apH" name="time" type="time" value="${a ? a.time : '10:00'}" required></div></div><div class="row end"><button class="btn" type="button" data-action="closeDialog">Cancel</button><button class="btn btn-primary" type="submit">${a ? 'Save new time' : 'Schedule'}</button></div></form>`);
  }
  A.newAppt = () => apptForm('New appointment');
  A.editAppt = (el) => { const a = ctx().p.appointments.find((x) => x.id === el.dataset.id); if (a) apptForm('Reschedule: ' + a.title, a); };
  F.newAppt = (form) => { const c = ctx(), o = fd(form); if (!o.title || !LI.isValidDate(o.date) || !LI.isValidTime(o.time)) return warn('Enter a title, a valid date and time.'); if (run('addAppt', c.pid, { title: o.title.slice(0, 80), with: (o.with || '').slice(0, 60), location: (o.location || '').slice(0, 80), date: o.date, time: o.time, mode: 'In-person' })) { ui.closeDialog(); ui.toast('Appointment scheduled. Reminders will be sent.', 'ok'); } };
  F.editAppt = (form) => { const c = ctx(), o = fd(form); if (!LI.isValidDate(o.date) || !LI.isValidTime(o.time)) return warn('Enter a valid date and time.'); if (run('setAppt', c.pid, o.id, { date: o.date, time: o.time })) { ui.closeDialog(); ui.toast('Appointment rescheduled.', 'ok'); } };
  A.apptDone = (el) => { const c = ctx(); if (run('setAppt', c.pid, el.dataset.id, { status: 'completed' })) ui.toast('Marked as completed.', 'ok'); };
  A.apptCancel = async (el) => { const c = ctx(); if (await ui.confirm('Cancel appointment?', 'The patient and family will no longer receive reminders for it.', 'Cancel appointment')) run('setAppt', c.pid, el.dataset.id, { status: 'cancelled' }); };

  /* ---------- doctor: medicines ---------- */
  const parseTimes = (s) => { const t = String(s || '').split(/[\s,;]+/).filter(Boolean); if (!t.length || t.length > 6 || !t.every(LI.isValidTime)) return null; return Array.from(new Set(t)).sort(); };
  A.addMedDlg = () => ui.openDialog('Add medicine', html`<form data-form="addMed" class="stack-s"><div class="field"><label for="mdN">Medicine name</label><input id="mdN" name="name" type="text" maxlength="40" required></div><div class="grid g2s"><div class="field"><label for="mdD">Dose</label><input id="mdD" name="dose" type="text" maxlength="20" placeholder="500 mg" required></div><div class="field"><label for="mdS">Starting stock (units)</label><input id="mdS" name="stock" type="number" min="0" max="500" value="30"></div></div><div class="field"><label for="mdT">Times (24-hour, comma separated)</label><input id="mdT" name="times" type="text" value="08:00, 20:00" required></div><div class="field"><label for="mdI">Instructions</label><input id="mdI" name="instructions" type="text" maxlength="60" placeholder="After food"></div><div class="field"><label for="mdC">For condition</label><input id="mdC" name="cond" type="text" maxlength="60"></div><div class="row end"><button class="btn" type="button" data-action="closeDialog">Cancel</button><button class="btn btn-primary" type="submit">Add to schedule</button></div></form>`);
  F.addMed = (form) => {
    const c = ctx(), o = fd(form), times = parseTimes(o.times);
    if (!/^[A-Za-z][A-Za-z0-9 +\-]{1,39}$/.test(o.name || '')) return warn('Enter a valid medicine name.');
    if (!times) return warn('Times must look like 08:00, 20:00 (up to 6).');
    if (run('addMeds', c.pid, [{ name: o.name, dose: o.dose, times, perDose: 1, stock: LI.clamp(num(o.stock) || 0, 0, 500), instructions: o.instructions, forCondition: o.cond }], c.user.name)) { ui.closeDialog(); ui.toast('Medicine added. The schedule is updated.', 'ok'); }
  };
  A.editMed = (el) => { const m = ctx().p.meds.find((x) => x.id === el.dataset.id); if (!m) return; ui.openDialog('Edit ' + m.name, html`<form data-form="updateMed" class="stack-s"><input type="hidden" name="id" value="${m.id}"><div class="field"><label for="emD">Dose</label><input id="emD" name="dose" type="text" maxlength="20" value="${m.dose}" required></div><div class="field"><label for="emT">Times (24-hour, comma separated)</label><input id="emT" name="times" type="text" value="${m.times.join(', ')}" required></div><div class="field"><label for="emI">Instructions</label><input id="emI" name="instructions" type="text" maxlength="60" value="${m.instructions}"></div><div class="row end"><button class="btn" type="button" data-action="closeDialog">Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div></form>`); };
  F.updateMed = (form) => { const c = ctx(), o = fd(form), times = parseTimes(o.times); if (!times || !o.dose) return warn('Enter a dose and valid times like 08:00, 20:00.'); if (run('updateMed', c.pid, o.id, { dose: o.dose, times, instructions: o.instructions }, c.user.name)) { ui.closeDialog(); ui.toast('Schedule updated.', 'ok'); } };
  A.stopMed = async (el) => { const c = ctx(); if (await ui.confirm('Stop this medicine?', 'It will be removed from the daily schedule. You can resume it later.', 'Stop medicine')) run('updateMed', c.pid, el.dataset.id, { active: false }, c.user.name); };
  A.resumeMed = (el) => { const c = ctx(); run('updateMed', c.pid, el.dataset.id, { active: true }, c.user.name); };

  /* ---------- doctor: reports, prescriptions, notes ---------- */
  const fileInfo = (file) => { if (!file || !file.name) return { ok: true, meta: null }; const v = LI.validateUpload(file); return v.ok ? { ok: true, meta: { name: LI.safeFileName(file.name), size: file.size, type: file.type } } : v; };
  F.addLab = (form) => {
    const c = ctx(), o = fd(form), f = fileInfo(form.elements.file && form.elements.file.files[0]);
    if (!o.title || !o.summary) return warn('Enter the test name and what the report says.');
    if (!f.ok) return warn(f.error);
    if (run('addReport', c.pid, { kind: 'lab', title: o.title.slice(0, 80), date: U.ymd(Date.now()), by: c.user.name, summary: o.summary, flag: o.flag === 'attention' ? 'attention' : 'normal', file: f.meta, meds: [] })) { form.reset(); ui.toast('Lab report uploaded. Family and caretaker can download it.', 'ok'); }
  };
  const SAMPLE_RX = 'Tab Metformin 500 mg 1-0-1 after food x 30 days\nTab Amlodipine 5 mg OD x 30 days\nTab Atorvastatin 10 mg HS x 30 days\nCap Vitamin D3 60000 IU once weekly x 8 weeks';
  A.sampleRx = () => { const t = $('rxText'); if (t) { t.value = SAMPLE_RX; A.parseRx(); ui.toast('Demo OCR sample loaded (simulated).', 'info'); } };
  A.parseRx = () => {
    const t = $('rxText'), out = $('rxOut'); if (!t || !out) return;
    const items = LI.parsePrescription(t.value);
    out.innerHTML = items.length ? html`<div class="ai-box"><strong>Extracted ${items.length} medicine(s)</strong><ul class="plain-list">${items.map((i) => html`<li>${i.name} ${i.dose} - ${i.times.length ? i.times.map(U.fmtTime12).join(', ') : 'as needed'}${i.days ? ' for ' + i.days + ' days' : ''}${i.instructions ? ', ' + i.instructions : ''}${i.confidence === 'low' ? html` ${ui.pill('Please verify timing', 'warn')}` : ''}</li>`)}</ul></div>`.s : html`<p class="err">No medicines found. Use a format like "Tab Metformin 500 mg 1-0-1 after food x 30 days".</p>`.s;
  };
  C.rxFile = (el) => {
    const file = el.files && el.files[0]; if (!file) return;
    const v = LI.validateUpload(file); if (!v.ok) { el.value = ''; return warn(v.error); }
    if (file.type === 'text/plain') { const r = new FileReader(); r.onload = () => { const t = $('rxText'); if (t) { t.value = String(r.result).slice(0, 1500); A.parseRx(); } }; r.readAsText(file); }
    else ui.toast('File attached as a record. Type or paste the text to extract medicines.', 'info');
  };
  F.addRx = (form) => {
    const c = ctx(), o = fd(form), items = LI.parsePrescription(o.text), f = fileInfo(form.elements.file && form.elements.file.files[0]);
    if (!f.ok) return warn(f.error);
    if (!items.length) return warn('No medicines found. Press "Extract medicines" to check the text.');
    const ok1 = run('addMeds', c.pid, items.map((i) => ({ name: i.name, dose: i.dose, times: i.times.length ? i.times : ['08:00'], perDose: 1, stock: i.days ? i.days * Math.max(1, i.times.length) : 30, instructions: i.instructions, forCondition: '' })), c.user.name);
    if (ok1 && run('addReport', c.pid, { kind: 'prescription', title: 'Prescription - ' + U.fmtDate(U.ymd(Date.now())), date: U.ymd(Date.now()), by: c.user.name, summary: items.length + ' medicine(s) prescribed and added to the schedule.', flag: 'normal', file: f.meta, meds: items.map((i) => i.name + ' ' + i.dose + ' - ' + (i.times.length ? i.times.map(U.fmtTime12).join(', ') : 'as needed') + (i.instructions ? ' (' + i.instructions + ')' : '')) })) { form.reset(); const out = $('rxOut'); if (out) out.innerHTML = ''; ui.toast('Prescription saved and medicine schedule updated.', 'ok'); }
  };
  F.addConsult = (form) => { const c = ctx(), o = fd(form); if (!o.text) return warn('Write the note first.'); if (run('addConsult', c.pid, o.text, !!form.elements.shared.checked, c.user.name)) { form.reset(); ui.toast('Consultation note saved.', 'ok'); } };

  /* ---------- PDF downloads ---------- */
  function pdfOut(name, doc) { ui.download(name + '.pdf', LI.buildPdf(doc), 'application/pdf'); ui.toast('PDF downloaded.', 'ok'); }
  const stamp = () => U.ymd(Date.now());
  A.downloadReport = (el) => { const c = ctx(), r = c.p.reports.find((x) => x.id === el.dataset.id); if (!r || !LI.can(c.role, 'download') || !LI.consentAllows(c.role, c.p.consent, 'medical')) return warn('This report is not available.'); pdfOut('LivedIn_' + first(c.p.name) + '_' + r.kind + '_' + r.date, LI.singleReport(c.p, r, Date.now())); };
  A.downloadFull = () => { const c = ctx(); if (!LI.can(c.role, 'download') || !LI.consentAllows(c.role, c.p.consent, 'medical')) return warn('This report is not available.'); pdfOut('LivedIn_' + first(c.p.name) + '_full_report_' + stamp(), LI.patientReport(c.p, { role: c.role }, Date.now())); };
  A.downloadAdherence = () => { const c = ctx(); if (!LI.can(c.role, 'download') || !LI.consentAllows(c.role, c.p.consent, 'medical')) return warn('This report is not available.'); pdfOut('LivedIn_' + first(c.p.name) + '_adherence_' + stamp(), LI.adherenceReport(c.p, Date.now())); };

  /* ---------- patient: privacy ---------- */
  C.consent = (el) => { const c = ctx(), k = el.dataset.key; if (!['family', 'caretaker', 'medicalFamily'].includes(k)) return; run('setConsent', c.pid, k, el.checked); };

  /* ---------- voice assistant ---------- */
  const chat = LI.chat;
  function ask(text) {
    const c = ctx(), t = LI.cleanText(text, 200); if (!t) return;
    const intent = LI.detectIntent(t), reply = LI.voiceReply(intent, c.p, chat.lang, Date.now());
    chat.log.push({ who: 'you', text: t }, { who: 'bot', text: reply }); if (chat.log.length > 40) chat.log.splice(0, chat.log.length - 40);
    chat.sos = intent === 'emergency'; chat.note = '';
    if (chat.speak) ui.speak(reply, chat.lang);
    LI.rerender(true);
  }
  F.ask = (form) => ask(fd(form).q);
  A.ask = (el) => ask(el.dataset.q);
  A.lang = (el) => { chat.lang = el.dataset.l === 'hi' ? 'hi' : 'en'; LI.rerender(true); };
  A.clearChat = () => { chat.log.length = 0; chat.sos = false; LI.rerender(true); };
  C.speak = (el) => { chat.speak = el.checked; if (chat.speak) ui.speak(chat.lang === 'hi' ? 'आवाज़ चालू है' : 'Voice replies are on', chat.lang); };
  A.mic = () => {
    if (chat.listening) { LI.voice.stop(); return; }
    chat.listening = true; chat.note = ''; LI.rerender(true);
    LI.voice.listen(chat.lang, (t) => ask(t), () => { chat.listening = false; LI.rerender(true); }, (e) => { chat.note = e; chat.listening = false; LI.rerender(true); });
  };
})();
