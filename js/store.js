/* LivedIn - state store (localStorage, shared across tabs) and the care engine (state mutators). */
(function () {
  'use strict';
  const LI = window.LI, U = LI;
  const KEY = 'livedin_state_v' + LI.VERSION;
  let state = null;
  const subs = new Set();

  function valid(s) { return !!(s && s.v === LI.VERSION && s.patients && s.patients.p1 && Array.isArray(s.alerts)); }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (valid(s)) return s; } } catch (e) { /* corrupted -> reseed */ }
    return LI.seed(Date.now());
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ } }
  function emit(reason) { subs.forEach((f) => { try { f(state, reason); } catch (e) { console.error(e); } }); }

  const store = {
    init() {
      state = load(); persist();
      window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { const s = load(); if (valid(s)) { state = s; emit('external'); } } });
    },
    get: () => state,
    patient: (pid) => state.patients[pid],
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    update(fn, reason) { const r = fn(state); persist(); emit(reason || 'local'); return r; },
    /** Run housekeeping; only persist/notify when something actually changed. */
    tick(fn) { const before = JSON.stringify(state); fn(state); if (JSON.stringify(state) !== before) { persist(); emit('tick'); } },
    reset() { state = LI.seed(Date.now()); persist(); emit('reset'); },
  };

  /* ---------------- engine: pure-ish mutators taking the state ---------------- */
  const core = {};

  core.log = function (s, pid, text, kind) {
    const a = s.patients[pid].activity; a.unshift({ id: U.uid('x'), ts: Date.now(), text, kind: kind || 'info' }); if (a.length > 80) a.length = 80;
  };
  core.alert = function (s, pid, type, sev, title, msg, meta) {
    const al = { id: U.uid('al'), pid, type, sev, title, msg, ts: Date.now(), audience: (LI.AUDIENCE[type] || LI.AUDIENCE.info).slice(), readBy: {}, meta: meta || {} };
    s.alerts.unshift(al); if (s.alerts.length > 300) s.alerts.length = 300; return al;
  };
  core.markRead = function (s, id, role) { const a = s.alerts.find((x) => x.id === id); if (a) a.readBy[role] = true; };
  core.markAllRead = function (s, role, pid) { s.alerts.forEach((a) => { if (a.audience.includes(role) && (!pid || a.pid === pid)) a.readBy[role] = true; }); };

  core.setDose = function (s, pid, medId, date, time, status, by) {
    const p = s.patients[pid], med = p.meds.find((m) => m.id === medId); if (!med) return;
    let e = p.doseLog.find((x) => x.medId === medId && x.date === date && x.time === time);
    if (e && e.status === 'taken' && status === 'taken') { e.confirmedBy = by !== 'patient' ? by : e.confirmedBy; return; }
    if (e) { e.status = status; e.by = by; e.at = Date.now(); }
    else p.doseLog.push({ id: U.uid('d'), medId, date, time, status, by, at: Date.now() });
    if (status === 'taken') {
      med.stock = Math.max(0, Math.round((med.stock - med.perDose) * 100) / 100);
      core.log(s, pid, med.name + ' ' + med.dose + ' (' + U.fmtTime12(time) + ') ' + (by === 'caretaker' ? 'confirmed by caretaker' : 'taken'), 'medicine');
      const st = LI.stockStatus(med);
      if (st !== 'ok' && !med.refillAlerted) {
        med.refillAlerted = true;
        core.alert(s, pid, 'medicine_refill', st === 'low' ? 'warn' : 'critical', 'Refill needed', med.name + ' has about ' + LI.daysLeft(med) + ' day(s) of stock left.', { medId });
      }
    }
  };

  core.requestOrder = function (s, pid, medId, by) {
    const med = s.patients[pid].meds.find((m) => m.id === medId); if (!med) return;
    med.status = 'requested';
    core.alert(s, pid, 'stock_request', 'warn', 'Please order ' + med.name, by + ' reports ' + med.name + ' ' + med.dose + ' is going out of stock (' + LI.daysLeft(med) + ' day(s) left). Please order it.', { medId });
    core.log(s, pid, 'Out-of-stock notification sent for ' + med.name, 'stock');
  };
  core.placeOrder = function (s, pid, medId, by) {
    const med = s.patients[pid].meds.find((m) => m.id === medId); if (!med) return;
    med.status = 'ordered'; med.eta = U.ymd(U.addDays(Date.now(), 2));
    core.alert(s, pid, 'order_placed', 'info', med.name + ' ordered', by + ' placed the order. Expected by ' + U.fmtDate(med.eta) + '.', { medId });
    core.log(s, pid, med.name + ' order placed (ETA ' + U.fmtDate(med.eta) + ')', 'stock');
  };
  core.receiveStock = function (s, pid, medId, qty) {
    const med = s.patients[pid].meds.find((m) => m.id === medId); if (!med) return;
    qty = LI.clamp(qty, 1, 500); med.stock += qty; med.status = 'ok'; med.refillAlerted = false; delete med.eta;
    core.log(s, pid, med.name + ' restocked (+' + qty + ')', 'stock');
  };

  /** Location update from demo slider/map click or real GPS. Evaluates the geofence and raises alerts. */
  core.setLocation = function (s, pid, lat, lng, source) {
    if (!LI.validLatLng(lat, lng)) return;
    const p = s.patients[pid], now = Date.now(), prev = p.location;
    p.device.movement = LI.movementState(prev, { lat, lng, ts: now });
    const res = LI.evaluateGeofence(prev.inside, { lat, lng }, p.safezone, p.safezone.outing, now);
    p.location = { lat, lng, ts: now, source, inside: res.inside };
    p.device.lastSeen = now;
    p.locHistory.push({ ts: now, lat, lng, inside: res.inside, source }); if (p.locHistory.length > 120) p.locHistory.shift();
    const first = p.name.split(' ')[0];
    for (const ev of res.events) {
      if (ev === 'exit') { core.alert(s, pid, 'geofence_exit', 'critical', 'Left the safe zone', first + ' left the ' + p.safezone.radius + ' m safe zone around home (' + LI.fmtDist(LI.haversine(p.safezone, { lat, lng })) + ' away).', { lat, lng }); core.log(s, pid, 'Left the safe zone', 'location'); }
      if (ev === 'outing_exit') core.log(s, pid, 'Left home during a planned outing - alert suppressed', 'location');
      if (ev === 'return') { core.alert(s, pid, 'patient_return', 'info', 'Back in the safe zone', first + ' is back at home.', { lat, lng }); core.log(s, pid, 'Returned to the safe zone', 'location'); }
    }
  };
  core.updateZone = function (s, pid, patch) {
    const z = s.patients[pid].safezone;
    if (patch.radius != null) z.radius = LI.clamp(patch.radius, 50, 2000);
    if (patch.lat != null && LI.validLatLng(patch.lat, patch.lng)) { z.lat = patch.lat; z.lng = patch.lng; }
    const p = s.patients[pid]; p.location.inside = LI.isInside(p.location, z);
    core.log(s, pid, 'Safe zone updated (' + z.radius + ' m radius)', 'location');
  };
  core.setOuting = function (s, pid, hours, by) {
    const z = s.patients[pid].safezone;
    if (hours > 0) { z.outing = { active: true, until: Date.now() + hours * 3600000 }; core.log(s, pid, 'Planned outing mode ON for ' + hours + ' h (set by ' + by + ')', 'location'); }
    else { z.outing = { active: false, until: 0 }; core.log(s, pid, 'Planned outing mode OFF', 'location'); }
  };

  core.sos = function (s, pid, source) {
    const p = s.patients[pid], d = p.device;
    d.sosPressed = true; d.lastSeen = Date.now();
    core.alert(s, pid, 'sos', 'critical', 'SOS from ' + p.name.split(' ')[0], 'Emergency button pressed (' + source + '). Last location: ' + LI.fmtCoord(p.location.lat, p.location.lng) + '.', { lat: p.location.lat, lng: p.location.lng });
    core.log(s, pid, 'SOS triggered - location shared with family and caretaker', 'sos');
  };
  core.clearSos = function (s, pid, by) { s.patients[pid].device.sosPressed = false; core.log(s, pid, 'SOS acknowledged by ' + by, 'sos'); };

  core.setBattery = function (s, pid, pct) {
    const d = s.patients[pid].device; d.battery = LI.clamp(pct, 0, 100); d.lastSeen = Date.now();
    if (d.battery <= 20 && !s.patients[pid].flags.lowBattery) { s.patients[pid].flags.lowBattery = true; core.alert(s, pid, 'low_battery', 'warn', 'Low device battery', 'Smart device battery is ' + Math.round(d.battery) + '% (simulated).'); }
    if (d.battery > 30) s.patients[pid].flags.lowBattery = false;
    if (d.battery <= 0 && d.online) core.setOnline(s, pid, false);
  };
  core.setOnline = function (s, pid, online) {
    const d = s.patients[pid].device; if (d.online === online) return;
    d.online = online; if (online) d.lastSeen = Date.now();
    if (!online) core.alert(s, pid, 'device_offline', 'warn', 'Device offline', 'Smart device lost connectivity (simulated). Showing the last known location.');
    else core.log(s, pid, 'Device back online', 'device');
  };
  core.setBox = function (s, pid, open) {
    const p = s.patients[pid]; p.device.boxOpen = open;
    core.log(s, pid, 'Medicine box ' + (open ? 'opened' : 'closed') + ' (simulated sensor)', 'device');
  };
  core.setBuzzer = function (s, pid, on) { s.patients[pid].device.buzzer = on; };

  /** Periodic housekeeping: missed doses, reminders, appointment reminders, battery drain, offline detection. */
  core.sweep = function (s, now) {
    const today = U.ymd(now);
    for (const pid of Object.keys(s.patients)) {
      const p = s.patients[pid], d = p.device;
      if (d.drain && d.online && d.battery > 0) core.setBattery(s, pid, d.battery - 1);
      for (const dose of LI.dosesForDate(p, today, now)) {
        const key = pid + '|' + dose.medId + '|' + dose.date + '|' + dose.time;
        if (dose.status === 'due' && !s.reminded[key]) {
          s.reminded[key] = 1;
          core.alert(s, pid, 'medicine_reminder', 'info', 'Time for ' + dose.name, dose.name + ' ' + dose.dose + ' is due at ' + U.fmtTime12(dose.time) + '.', { medId: dose.medId });
        }
        if (dose.status === 'overdue') {
          core.setDose(s, pid, dose.medId, dose.date, dose.time, 'missed', 'system');
          core.alert(s, pid, 'missed_medicine', 'warn', 'Missed dose', dose.name + ' (' + U.fmtTime12(dose.time) + ') was not taken.', { medId: dose.medId });
        }
      }
      for (const pat of LI.analyzeMissed(p, now)) {
        const k = pid + '|pattern|' + pat.key;
        if (!s.reminded[k]) { s.reminded[k] = 1; core.alert(s, pid, 'missed_medicine', 'critical', 'Repeated missed doses', pat.text + ' Please check in with ' + p.name.split(' ')[0] + '.', { medId: pat.medId, pattern: true }); }
      }
      for (const a of p.appointments) {
        if (a.status !== 'scheduled' || a.reminded) continue;
        const at = new Date(a.date + 'T' + a.time + ':00').getTime();
        if (at > now && at - now < 24 * 3600000) { a.reminded = true; core.alert(s, pid, 'appointment_reminder', 'info', 'Appointment tomorrow', a.title + ' with ' + a.with + ' at ' + U.fmtTime12(a.time) + '.', {}); }
      }
    }
  };

  core.dailyReport = function (s, pid, now) {
    const p = s.patients[pid], a = LI.adherence(p, 1, now);
    const steps = 2400 + Math.round(p.locHistory.length * 37);
    const msg = 'Today: ' + a.taken + ' dose(s) taken, ' + a.missed + ' missed. ' + (p.location.inside ? 'At home' : 'Currently outside the safe zone') + '. ~' + steps.toLocaleString('en-IN') + ' steps (simulated). Last mood: ' + (p.vitals[p.vitals.length - 1] || {}).mood + '.';
    core.alert(s, pid, 'daily_report', 'info', 'Daily family report', msg); s.daily[pid] = U.ymd(now);
  };

  /* ---- doctor / caretaker data entry ---- */
  core.addReport = function (s, pid, r) { s.patients[pid].reports.unshift(Object.assign({ id: U.uid('r') }, r)); core.log(s, pid, 'New ' + r.kind + ' report added: ' + r.title, 'report'); };
  core.addMeds = function (s, pid, items, by) {
    const p = s.patients[pid];
    for (const it of items) {
      const ex = p.meds.find((m) => m.active && m.name.toLowerCase() === it.name.toLowerCase());
      if (ex) { ex.dose = it.dose || ex.dose; ex.times = it.times; ex.instructions = it.instructions || ex.instructions; }
      else p.meds.push({ id: U.uid('m'), name: it.name, dose: it.dose, form: 'Tablet', times: it.times, perDose: it.perDose || 1, stock: it.stock || 10, forCondition: it.forCondition || '', instructions: it.instructions || '', prescribedBy: by, active: true, since: U.ymd(Date.now()), status: 'ok', refillAlerted: false });
    }
    core.log(s, pid, 'Medicine schedule updated by ' + by + ' (' + items.map((i) => i.name).join(', ') + ')', 'medicine');
  };
  core.updateMed = function (s, pid, medId, patch, by) {
    const m = s.patients[pid].meds.find((x) => x.id === medId); if (!m) return;
    Object.assign(m, patch); core.log(s, pid, m.name + ' schedule updated by ' + by, 'medicine');
  };
  core.addVitals = function (s, pid, v, by) { s.patients[pid].vitals.push(Object.assign({ id: U.uid('v'), date: U.ymd(Date.now()), by }, v)); core.log(s, pid, 'Condition recorded by ' + by + ': BP ' + v.sys + '/' + v.dia + ', sugar ' + v.sugar, 'vitals'); };
  core.addAppt = function (s, pid, a) { s.patients[pid].appointments.push(Object.assign({ id: U.uid('a'), status: 'scheduled', reminded: false }, a)); core.log(s, pid, 'Appointment scheduled: ' + a.title, 'appointment'); };
  core.setAppt = function (s, pid, id, patch) { const a = s.patients[pid].appointments.find((x) => x.id === id); if (a) { Object.assign(a, patch); if (patch.date || patch.time) a.reminded = false; core.log(s, pid, 'Appointment "' + a.title + '" ' + (patch.status || 'updated'), 'appointment'); } };
  core.addConsult = function (s, pid, text, shared, by) { s.patients[pid].notes.consult.unshift({ id: U.uid('c'), date: U.ymd(Date.now()), by, text, shared }); core.log(s, pid, 'Consultation note added by ' + by, 'note'); };
  core.addCareNote = function (s, pid, text, by) { s.patients[pid].notes.care.unshift({ id: U.uid('n'), date: U.ymd(Date.now()), by, text }); core.log(s, pid, 'Care note for family added by ' + by, 'note'); };
  core.toggleTask = function (s, pid, id, by) { const t = s.patients[pid].careTasks.find((x) => x.id === id); if (t) { t.done = !t.done; t.by = t.done ? by : ''; core.log(s, pid, 'Care activity "' + t.label + '" ' + (t.done ? 'completed' : 'reopened'), 'care'); } };
  core.addTask = function (s, pid, label) { s.patients[pid].careTasks.push({ id: U.uid('t'), date: U.ymd(Date.now()), label, done: false, by: '' }); };
  core.emergency = function (s, pid, kind, text, by) { core.alert(s, pid, 'emergency', 'critical', 'Emergency reported: ' + kind, by + ': ' + text); core.log(s, pid, 'Emergency reported (' + kind + ') by ' + by, 'sos'); };
  core.setConsent = function (s, pid, key, val) { s.patients[pid].consent[key] = !!val; core.log(s, pid, 'Consent "' + key + '" ' + (val ? 'granted' : 'withdrawn') + ' by patient', 'consent'); };
  core.message = function (s, pid, toRole, from, text) {
    s.messages.unshift({ id: U.uid('msg'), pid, toRole, from, text, ts: Date.now() });
    const al = core.alert(s, pid, 'message', 'info', 'Message from ' + from, text); al.audience = [toRole];
  };

  store.core = core;
  /** Public action helper: store.act('setDose', ...args) */
  store.act = function (name, ...args) { return store.update((s) => core[name](s, ...args), name); };
  LI.store = store;
})();
