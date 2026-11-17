/* LivedIn - shared, patient and family views. Every view is a function (ctx) -> html``. */
(function () {
  'use strict';
  const LI = window.LI, ui = LI.ui, { html } = LI, U = LI, V = LI.views;
  const fn = (n) => String(n).split(' ')[0];
  const head = (title, sub, actions) => html`<div class="page-h"><div><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>${actions ? html`<div class="row">${actions}</div>` : ''}</div>`;
  const statusPill = (st) => ({ taken: ui.pill('Taken', 'ok'), missed: ui.pill('Missed', 'danger'), due: ui.pill('Due now', 'warn'), overdue: ui.pill('Overdue', 'danger'), upcoming: ui.pill('Upcoming', 'info'), none: ui.pill('No record', 'plain') }[st] || ui.pill(st));
  const nextAppt = (p, now) => p.appointments.filter((a) => a.status === 'scheduled' && a.date >= U.ymd(now)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const locAllowed = (c) => LI.consentAllows(c.role, c.p.consent, 'location');
  const medAllowed = (c) => LI.consentAllows(c.role, c.p.consent, 'medical');
  const myAlerts = (c, limit) => c.s.alerts.filter((a) => a.audience.includes(c.role) && a.pid === c.pid).slice(0, limit || 200);
  const stRank = { out: 0, critical: 1, low: 2, ok: 3 };
  const stPill = (m) => { const s = LI.stockStatus(m); return s === 'ok' ? ui.pill('In stock', 'ok') : s === 'low' ? ui.pill('Running low', 'warn') : s === 'critical' ? ui.pill('Almost out', 'danger') : ui.pill('Out of stock', 'danger'); };
  LI.shared = { head, statusPill, nextAppt, locAllowed, medAllowed, myAlerts, stPill };

  /* ---------- reusable fragments ---------- */
  function doseList(c, o) {
    o = o || {};
    const ds = LI.dosesForDate(c.p, U.ymd(c.now), c.now);
    if (!ds.length) return ui.empty('No medicines scheduled today.');
    const canAct = ['patient', 'caretaker'].includes(c.role);
    return html`<ul class="doses ${o.big ? 'big' : ''}">${ds.map((d) => html`<li class="dose ${d.status}"><div class="dose-t mono">${U.fmtTime12(d.time)}</div><div class="dose-n"><strong>${d.name}</strong> <span class="muted">${d.dose}</span><div class="small muted">${d.med.instructions || ''}</div></div><div class="dose-a">${statusPill(d.status)}${canAct && d.status !== 'taken' && d.status !== 'none' ? html`<button class="btn btn-sm btn-primary" type="button" data-action="markDose" data-med="${d.medId}" data-date="${d.date}" data-time="${d.time}">${c.role === 'patient' ? 'I took it' : 'Confirm given'}</button>` : ''}</div></li>`)}</ul>`;
  }
  function alertItem(a, c, multi) {
    const read = !!a.readBy[c.role], p = c.s.patients[a.pid];
    return html`<li class="alert ${a.sev} ${read ? 'read' : 'unread'}"><span class="al-ic">${ui.icon(a.type.includes('sos') || a.type === 'emergency' ? 'sos' : a.type.includes('medic') || a.type.includes('refill') || a.type.includes('stock') || a.type === 'order_placed' ? 'pill' : a.type.includes('geofence') || a.type.includes('return') ? 'pin' : a.type.includes('battery') || a.type.includes('offline') ? 'battery' : 'bell', 22)}</span><div class="al-b"><strong>${a.title}</strong>${multi && p ? html` <span class="pill plain info">${fn(p.name)}</span>` : ''}<p>${a.msg}</p><span class="muted small">${U.fmtStamp(a.ts)} - ${U.relTime(a.ts, c.now)}</span></div>${read ? '' : html`<button class="btn btn-sm" type="button" data-action="readAlert" data-id="${a.id}">Mark read</button>`}</li>`;
  }
  LI.shared.alertItem = alertItem; LI.shared.doseList = doseList;
  function alertList(c, limit, multi) {
    const list = multi ? c.s.alerts.filter((a) => a.audience.includes(c.role) && c.user.patientIds.includes(a.pid)).slice(0, limit) : myAlerts(c, limit);
    return list.length ? html`<ul class="alerts">${list.map((a) => alertItem(a, c, multi))}</ul>` : ui.empty('No alerts yet.');
  }
  LI.shared.alertList = alertList;
  function apptList(c, all) {
    const list = c.p.appointments.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).filter((a) => all || a.status === 'scheduled');
    if (!list.length) return ui.empty('No appointments.');
    const staff = ['doctor', 'caretaker'].includes(c.role);
    return html`<ul class="list">${list.map((a) => html`<li class="item"><div class="date-chip"><b>${U.fmtDate(a.date).split(' ')[0]}</b><span>${U.fmtDate(a.date).split(' ')[1]}</span></div><div class="grow"><strong>${a.title}</strong><div class="muted small">${U.fmtTime12(a.time)} - ${a.with} - ${a.location}</div></div>${ui.pill(a.status === 'scheduled' ? 'Scheduled' : a.status === 'completed' ? 'Completed' : 'Cancelled', a.status === 'scheduled' ? 'info' : a.status === 'completed' ? 'ok' : 'danger')}${staff && a.status === 'scheduled' ? html`<button class="btn btn-sm" type="button" data-action="editAppt" data-id="${a.id}">Reschedule</button><button class="btn btn-sm" type="button" data-action="apptDone" data-id="${a.id}">Complete</button><button class="btn btn-sm btn-danger" type="button" data-action="apptCancel" data-id="${a.id}">Cancel</button>` : ''}</li>`)}</ul>`;
  }
  LI.shared.apptList = apptList;
  function contactsList(p) { return html`<ul class="list">${p.contacts.map((x) => html`<li class="item"><div class="avatar">${x.name[0]}</div><div class="grow"><strong>${x.name}</strong> ${x.primary ? ui.pill('Primary', 'ok') : ''}<div class="muted small">${x.relation}</div></div><a class="btn btn-sm" href="tel:${x.phone.replace(/[^+0-9]/g, '')}">${ui.icon('phone', 16)} ${x.phone}</a></li>`)}</ul>`; }
  LI.shared.contactsList = contactsList;

  function stockList(c) {
    const meds = c.p.meds.filter((m) => m.active).sort((a, b) => stRank[LI.stockStatus(a)] - stRank[LI.stockStatus(b)]);
    const care = c.role === 'caretaker', fam = c.role === 'family';
    return html`<ul class="list stock">${meds.map((m) => { const st = LI.stockStatus(m), d = LI.daysLeft(m); return html`<li class="item col"><div class="row between"><div><strong>${m.name}</strong> <span class="muted">${m.dose}</span><div class="small muted">${m.stock} units left - about ${d} day(s)</div></div><div class="row">${stPill(m)}${m.status === 'requested' ? ui.pill('Order requested', 'warn') : ''}${m.status === 'ordered' ? ui.pill('Ordered - ETA ' + U.fmtDate(m.eta), 'info') : ''}</div></div>${ui.progress(Math.min(100, (d / 14) * 100), st === 'ok' ? '' : st === 'low' ? 'warn' : 'danger')}<div class="row end">
      ${care && st !== 'ok' && m.status === 'ok' ? html`<button class="btn btn-sm btn-primary" type="button" data-action="requestOrder" data-id="${m.id}">${ui.icon('bell', 16)} Notify: going out of stock</button>` : ''}
      ${(fam || care) && (m.status === 'requested' || (fam && st !== 'ok' && m.status === 'ok')) ? html`<button class="btn btn-sm btn-sage" type="button" data-action="placeOrder" data-id="${m.id}">Order now</button>` : ''}
      ${(fam || care) && m.status === 'ordered' ? html`<button class="btn btn-sm" type="button" data-action="openReceive" data-id="${m.id}">Mark received</button>` : ''}
    </div></li>`; })}</ul>`;
  }
  LI.shared.stockList = stockList;

  function historyTable(c) {
    const days = []; for (let i = 6; i >= 0; i--) days.push(U.ymd(U.addDays(c.now, -i)));
    const meds = c.p.meds.filter((m) => m.active);
    return html`<div class="table-wrap"><table><caption class="sr-only">Medicine taken history for the last 7 days</caption><thead><tr><th scope="col">Medicine</th>${days.map((d) => html`<th scope="col">${U.fmtDate(d)}</th>`)}</tr></thead><tbody>${meds.map((m) => html`<tr><th scope="row">${m.name} <span class="muted small">${m.dose}</span></th>${days.map((d) => { const es = c.p.doseLog.filter((e) => e.medId === m.id && e.date === d); const t = es.filter((e) => e.status === 'taken').length, mi = es.filter((e) => e.status === 'missed').length; const cls = mi ? 'bad' : t ? 'good' : 'none'; return html`<td class="cell ${cls}">${es.length ? t + '/' + m.times.length : '-'}${mi ? html` <span class="sr-only">missed</span>` : ''}</td>`; })}</tr>`)}</tbody></table></div>`;
  }
  function doseTimeline(c, n) {
    const es = c.p.doseLog.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, n || 12);
    return html`<ul class="list compact">${es.map((e) => { const m = c.p.meds.find((x) => x.id === e.medId); return html`<li class="item"><span class="mono muted">${U.fmtDate(e.date)} ${U.fmtTime12(e.time)}</span><span class="grow"><strong>${m ? m.name : 'Medicine'}</strong> <span class="muted small">${e.status === 'taken' ? 'confirmed by ' + (e.by === 'device' ? 'smart box (simulated)' : e.by) : e.by === 'system' ? 'not recorded' : ''}</span></span>${statusPill(e.status)}</li>`; })}</ul>`;
  }
  LI.shared.historyTable = historyTable; LI.shared.doseTimeline = doseTimeline;

  function vitalsBlock(p) {
    const v = p.vitals.slice(-7);
    return html`<div class="grid g2"><div><h3 class="h3">Blood pressure (systolic)</h3>${ui.lineChart(v.map((x) => x.sys), v.map((x) => U.fmtDate(x.date).split(' ')[0]), { label: 'Systolic blood pressure', color: '#2F4A38' })}</div><div><h3 class="h3">Blood sugar (mg/dL)</h3>${ui.lineChart(v.map((x) => x.sugar), v.map((x) => U.fmtDate(x.date).split(' ')[0]), { label: 'Blood sugar', color: '#C4693F' })}</div></div>
    <div class="table-wrap"><table><caption class="sr-only">Recorded vitals</caption><thead><tr><th scope="col">Date</th><th scope="col">BP</th><th scope="col">Sugar</th><th scope="col">Pulse</th><th scope="col">Mood</th><th scope="col">By</th></tr></thead><tbody>${p.vitals.slice(-6).reverse().map((x) => html`<tr><td>${U.fmtDate(x.date)}</td><td>${x.sys}/${x.dia}</td><td>${x.sugar}</td><td>${x.pulse}</td><td>${x.mood}</td><td>${x.by}</td></tr>`)}</tbody></table></div>`;
  }
  LI.shared.vitalsBlock = vitalsBlock;
  const conditionsBlock = (p) => html`<ul class="list">${p.conditions.map((x) => html`<li class="item col"><div class="row between"><strong>${x.name}</strong>${ui.pill(x.severity, x.severity === 'Moderate' ? 'warn' : 'info')}</div><p class="muted small">Since ${x.since}. ${x.notes}</p></li>`)}</ul><p class="small"><strong>Allergies:</strong> ${p.allergies.join(', ')} - <strong>Blood group:</strong> ${p.blood}</p>`;
  LI.shared.conditionsBlock = conditionsBlock;
  const summaryBlock = (c) => html`<div class="ai-box"><div class="row between"><span class="pill info plain">${ui.icon('spark', 14)} AI health summary (on-device rules)</span></div><ul class="plain-list">${LI.healthSummary(c.p, c.now).map((l) => html`<li>${l}</li>`)}</ul></div>`;
  LI.shared.summaryBlock = summaryBlock;
  const missedBlock = (c) => { const m = LI.analyzeMissed(c.p, c.now); return m.length ? html`<ul class="alerts">${m.map((x) => html`<li class="alert warn unread"><span class="al-ic">${ui.icon('alert', 22)}</span><div class="al-b"><strong>Repeated missed doses</strong><p>${x.text}</p><span class="muted small">Dates: ${x.dates.map(U.fmtDate).join(', ')}</span></div></li>`)}</ul>` : html`<p class="empty">No repeated missed doses in the last 7 days.</p>`; };
  LI.shared.missedBlock = missedBlock;

  function reportList(c) {
    const reps = c.p.reports;
    return reps.length ? html`<ul class="list">${reps.map((r) => html`<li class="item col"><div class="row between"><div><strong>${r.title}</strong><div class="muted small">${U.fmtDate(r.date)} - ${r.by} - ${r.kind === 'lab' ? 'Lab report' : 'Prescription'}</div></div><div class="row">${ui.pill(r.flag === 'attention' ? 'Needs attention' : 'Normal', r.flag === 'attention' ? 'warn' : 'ok')}<button class="btn btn-sm btn-primary" type="button" data-action="downloadReport" data-id="${r.id}">${ui.icon('download', 16)} PDF</button></div></div><p class="small">${r.summary}</p>${r.meds && r.meds.length ? html`<ul class="chips">${r.meds.map((m) => html`<li>${m}</li>`)}</ul>` : ''}${r.file ? html`<p class="small muted">Attached: ${r.file.name} (${Math.round(r.file.size / 1024) || 1} KB)</p>` : ''}</li>`)}</ul>` : ui.empty('No reports yet.');
  }
  LI.shared.reportList = reportList;

  /* ---------- SafeTrack + device (shared) ---------- */
  V.safetrack = function (c) {
    const p = c.p, z = p.safezone, l = p.location, d = p.device, outing = LI.outingActive(z.outing, c.now);
    if (!locAllowed(c)) return html`${head('SafeTrack', 'Location safety for ' + fn(p.name))}${ui.card('Location is private', ui.empty(fn(p.name) + ' has not shared location with the ' + c.role + '. Ask them to turn on sharing in Privacy.'), { icon: 'lock' })}`;
    const staff = ['family', 'caretaker'].includes(c.role);
    const real = d.mode === 'real';
    return html`${head('SafeTrack', 'Live location, safe zone and alerts for ' + p.name, html`<button class="btn btn-danger" type="button" data-action="sos">${ui.icon('sos', 18)} Send SOS</button>`)}
    <div class="grid g-map">
      <div class="stack">
        <section class="card flush"><div class="map-bar">${ui.pill(l.inside ? 'Inside safe zone' : 'Outside safe zone', l.inside ? 'ok' : 'danger')}${outing ? ui.pill('Planned outing until ' + U.fmtStamp(z.outing.until).split(', ')[1], 'info') : ''}${!d.online ? ui.pill('Device offline', 'warn') : ''}${d.sosPressed ? ui.pill('SOS active', 'danger') : ''}</div><div id="mapSlot" class="map-slot"></div>
        <p class="small muted pad">${real ? 'Real tracking: this browser\'s GPS is used as the patient\'s device.' : 'Demo simulation: click or tap the map, or use the slider, to move the simulated patient.'}</p></section>
        ${ui.card('Last known location', html`<p><strong class="mono">${LI.fmtCoord(l.lat, l.lng)}</strong></p><p>${U.fmtStamp(l.ts)} - ${U.relTime(l.ts, c.now)}</p><p class="muted small">${LI.fmtDist(LI.haversine(z, l))} from home. Source: ${l.source === 'gps' ? 'real GPS' : 'simulated'}.${!d.online ? ' Device is offline, so this may be out of date.' : ''}</p><a class="btn btn-sm" href="${LI.osmLink(l.lat, l.lng).toString()}" target="_blank" rel="noopener noreferrer">Open in OpenStreetMap</a>`, { icon: 'pin' })}
      </div>
      <div class="stack">
        ${ui.card('Tracking mode', html`<div class="seg" role="group" aria-label="Tracking mode"><button type="button" class="seg-b ${!real ? 'on' : ''}" aria-pressed="${String(!real)}" data-action="setMode" data-mode="demo">Demo simulation</button><button type="button" class="seg-b ${real ? 'on' : ''}" aria-pressed="${String(real)}" data-action="setMode" data-mode="real">Real tracking</button></div>
          ${real ? html`<p class="small muted">Uses this browser's location permission. Works on HTTPS or localhost.</p><div class="row">${d.realWatching ? html`<button class="btn btn-danger" type="button" data-action="realStop">Stop real tracking</button>` : html`<button class="btn btn-primary" type="button" data-action="realStart">Start real tracking</button>`}</div>`
            : html`${ui.simBanner('Simulated patient movement. No real GPS is used in this mode.')}<div class="field"><label for="simDist">Distance from home: <output id="simDistOut" class="mono">${Math.round(LI.haversine(z, l))} m</output></label><input id="simDist" type="range" min="0" max="1200" step="10" value="${Math.min(1200, Math.round(LI.haversine(z, l)))}" data-input="simDist" aria-describedby="simHint"><span class="hint" id="simHint">Safe zone radius is ${z.radius} m. Move past it to trigger an alert.</span></div>
            <div class="field"><label for="simDir">Direction</label><select id="simDir"><option value="90">East</option><option value="0">North</option><option value="180">South</option><option value="270">West</option></select></div>
            <div class="row"><button class="btn btn-sm" type="button" data-action="simOut">Walk outside zone</button><button class="btn btn-sm btn-sage" type="button" data-action="simHome">Return home</button></div>`}`, { icon: 'pin' })}
        ${ui.card('Home safe zone (geofence)', html`<p class="small muted">${z.label}. Alerts are sent when the patient leaves this radius.</p>${staff ? html`<form data-form="zone" class="stack-s"><div class="field"><label for="zoneR">Radius: <output id="zoneRout" class="mono">${z.radius} m</output></label><input id="zoneR" name="radius" type="range" min="50" max="1000" step="25" value="${z.radius}" data-input="zoneR"></div><div class="row"><button class="btn btn-primary btn-sm" type="submit">Save radius</button><button class="btn btn-sm" type="button" data-action="recenter">Use current position as home</button></div></form>` : html`<p><strong>Radius:</strong> ${z.radius} m</p>`}`, { icon: 'home' })}
        ${ui.card('Planned outing mode', html`<p class="small muted">Pauses leave-zone alerts so planned trips (a temple visit, a family lunch) do not worry anyone.</p>${outing ? html`<p>${ui.pill('Active until ' + U.fmtStamp(z.outing.until).split(', ')[1], 'info')}</p><button class="btn" type="button" data-action="outing" data-h="0">End outing mode</button>` : html`<div class="row"><button class="btn btn-sm" type="button" data-action="outing" data-h="1">1 hour</button><button class="btn btn-sm" type="button" data-action="outing" data-h="2">2 hours</button><button class="btn btn-sm" type="button" data-action="outing" data-h="4">4 hours</button></div>`}`, { icon: 'clock' })}
      </div>
    </div>
    ${c.role !== 'patient' ? ui.card('Location history', p.locHistory.length ? html`<div class="table-wrap"><table><caption class="sr-only">Recent location history</caption><thead><tr><th scope="col">Time</th><th scope="col">Position</th><th scope="col">Status</th><th scope="col">Source</th></tr></thead><tbody>${p.locHistory.slice(-12).reverse().map((h) => html`<tr><td>${U.fmtStamp(h.ts)}</td><td class="mono">${LI.fmtCoord(h.lat, h.lng)}</td><td>${h.inside ? 'Inside' : 'Outside'}</td><td>${h.source === 'gps' ? 'Real GPS' : 'Simulated'}</td></tr>`)}</tbody></table></div>` : ui.empty('No history yet.'), { icon: 'list', sub: 'Visible to authorised members only, with the patient\'s consent.' }) : ''}
    ${ui.card('Activity history', html`<ul class="list compact">${p.activity.slice(0, 10).map((a) => html`<li class="item"><span class="mono muted">${U.fmtStamp(a.ts)}</span><span class="grow">${a.text}</span></li>`)}</ul>`, { icon: 'list' })}`;
  };

  V.device = function (c) {
    const p = c.p, d = p.device, l = p.location;
    const battKind = d.battery <= 20 ? 'danger' : d.battery <= 40 ? 'warn' : '';
    return html`${head('Smart device', 'Virtual IoT chip for ' + fn(p.name), '')}${ui.simBanner('Everything on this page is a software simulation. No physical chip, GPS module, button or sensor is connected.')}
    ${ui.card('Device status dashboard', html`<div class="grid g4"><div class="mini"><span class="muted small">Network</span><strong>${d.online ? 'Online' : 'Offline'}</strong>${ui.pill(d.online ? 'Connected (simulated)' : 'Offline (simulated)', d.online ? 'ok' : 'danger')}</div>
      <div class="mini"><span class="muted small">Battery</span><strong class="mono">${Math.round(d.battery)}%</strong>${ui.progress(d.battery, battKind)}</div>
      <div class="mini"><span class="muted small">Movement</span><strong>${d.movement}</strong>${ui.pill('Virtual sensor', 'plain info')}</div>
      <div class="mini"><span class="muted small">Medicine box</span><strong>${d.boxOpen ? 'Open' : 'Closed'}</strong>${ui.pill('Virtual sensor', 'plain info')}</div></div><p class="small muted">Last seen ${U.relTime(d.lastSeen, c.now)}. Virtual GPS: <span class="mono">${LI.fmtCoord(l.lat, l.lng)}</span>.</p>`, { icon: 'chip' })}
    <div class="grid g2">
      ${ui.card('Virtual SOS button', html`<p class="muted">Press to simulate the chip's emergency button. Family and caretaker are alerted with the location.</p><div class="row"><button class="btn btn-danger btn-lg" type="button" data-action="sos">${ui.icon('sos', 20)} Press SOS</button>${d.sosPressed ? html`<button class="btn" type="button" data-action="ackSos">Acknowledge SOS</button>` : ''}</div>${d.sosPressed ? html`<p class="err">SOS is active.</p>` : ''}`, { icon: 'sos' })}
      ${ui.card('Simulated battery', html`<div class="field"><label for="batt">Battery: <output id="battOut" class="mono">${Math.round(d.battery)}%</output></label><input id="batt" type="range" min="0" max="100" value="${Math.round(d.battery)}" data-input="battery"></div><div class="row"><button class="btn btn-sm" type="button" data-action="battery" data-v="15">Set to 15%</button><button class="btn btn-sm" type="button" data-action="battery" data-v="100">Charge to 100%</button></div><label class="check"><input id="drain" type="checkbox" data-change="drain" ${d.drain ? 'checked' : ''}> Drain 1% every few seconds</label>`, { icon: 'battery' })}
      ${ui.card('Simulated connectivity', html`<p class="muted">Turn the network off to see the device-offline alert and last-known location.</p><button class="btn ${d.online ? 'btn-danger' : 'btn-primary'}" type="button" data-action="online" data-v="${d.online ? '0' : '1'}">${ui.icon('wifi', 18)} ${d.online ? 'Go offline' : 'Go online'}</button>`, { icon: 'wifi' })}
      ${ui.card('Virtual movement detection', html`<p class="muted">Moves the simulated patient about 20 m and updates the movement state.</p><div class="row"><button class="btn" type="button" data-action="move">Simulate movement</button><span class="pill info">${d.movement}</span></div>`, { icon: 'user' })}
      ${ui.card('Medicine-box open/close', html`<p class="muted">Open, then close the box to simulate taking the next pending dose.</p><div class="row"><button class="btn" type="button" data-action="openBox" ${d.boxOpen ? 'disabled' : ''}>${ui.icon('box', 18)} Open box</button><button class="btn btn-primary" type="button" data-action="closeBox" ${d.boxOpen ? '' : 'disabled'}>Close box</button></div>`, { icon: 'box' })}
      ${ui.card('Buzzer and voice alert', html`<p class="muted">Plays a simulated buzzer through your speakers and reads a reminder aloud.</p><div class="row"><button class="btn" type="button" data-action="buzzer">${ui.icon('sound', 18)} Sound buzzer</button><button class="btn" type="button" data-action="voiceAlert">Voice alert</button></div>`, { icon: 'sound' })}
    </div>`;
  };

  /* ---------- PATIENT ---------- */
  V.today = function (c) {
    const p = c.p, ds = LI.dosesForDate(p, U.ymd(c.now), c.now), done = ds.filter((d) => d.status === 'taken').length, nx = nextAppt(p, c.now);
    return html`${head('Hello, ' + fn(p.name), U.fmtDateLong(U.ymd(c.now)) + ' - here is your day.')}
    <div class="grid g-today">
      <section class="card sos-card"><h2>Need help?</h2><p>Press the button. Your family and caretaker will receive your location.</p><button class="sos-btn" type="button" data-action="sos" aria-label="Send SOS emergency alert"><span>SOS</span></button>${p.device.sosPressed ? html`<p class="err">SOS sent. Your family has been informed.</p><button class="btn" type="button" data-action="ackSos">I am safe - cancel SOS</button>` : ''}</section>
      ${ui.card("Today's medicines", html`<p class="muted">${done} of ${ds.length} taken</p>${ui.progress(ds.length ? (100 * done) / ds.length : 0)}${doseList(c, { big: true })}`, { icon: 'pill', cls: 'span2' })}
      ${ui.card('Next appointment', nx ? html`<p class="big-t">${nx.title}</p><p>${U.fmtDateLong(nx.date)} at ${U.fmtTime12(nx.time)}</p><p class="muted">${nx.with} - ${nx.location}</p>` : ui.empty('No upcoming appointments.'), { icon: 'calendar' })}
      ${ui.card('Ask LivedIn', html`<p>Ask about your medicines, appointments or health, in Hindi or English.</p><a class="btn btn-primary" href="#/assistant">${ui.icon('mic', 18)} Open voice assistant</a>`, { icon: 'spark' })}
      ${ui.card('My safety', html`<p>${ui.pill(p.location.inside ? 'You are in your safe zone' : 'You are outside your safe zone', p.location.inside ? 'ok' : 'danger')}</p><p class="muted small">Smart device battery ${Math.round(p.device.battery)}% (simulated)</p><a class="btn btn-sm" href="#/safety">Open My safety</a>`, { icon: 'pin' })}
    </div>`;
  };

  V.assistant = function (c) {
    const st = LI.chat;
    return html`${head('Voice assistant', 'Speak or type in Hindi or English')}
    <div class="grid g-chat">
      ${ui.card('Conversation', html`<div class="chat" id="chatLog" role="log" aria-live="polite">${st.log.length ? st.log.map((m) => html`<div class="bubble ${m.who}"><span class="sr-only">${m.who === 'you' ? 'You said' : 'LivedIn replied'}:</span>${m.text}</div>`) : html`<p class="empty">Try a suggestion below or press the microphone.</p>`}</div>
        ${st.sos ? html`<button class="btn btn-danger btn-lg" type="button" data-action="sos">${ui.icon('sos', 20)} Send SOS now</button>` : ''}
        <form data-form="ask" class="chat-form"><label class="sr-only" for="askText">Your question</label><input id="askText" name="q" type="text" maxlength="200" autocomplete="off" placeholder="${st.lang === 'hi' ? 'अपना सवाल लिखें...' : 'Type your question...'}"><button class="btn btn-primary" type="submit">${ui.icon('send', 18)} Send</button><button class="btn ${st.listening ? 'btn-danger' : ''}" type="button" data-action="mic" aria-pressed="${String(st.listening)}">${ui.icon('mic', 18)} ${st.listening ? 'Listening...' : 'Speak'}</button></form>
        ${st.note ? html`<p class="err" role="alert">${st.note}</p>` : ''}`, { icon: 'mic', actions: html`<button class="btn btn-sm" type="button" data-action="clearChat">Clear</button>` })}
      <div class="stack">
        ${ui.card('Language', html`<div class="seg" role="group" aria-label="Assistant language"><button type="button" class="seg-b ${st.lang === 'en' ? 'on' : ''}" aria-pressed="${String(st.lang === 'en')}" data-action="lang" data-l="en">English</button><button type="button" class="seg-b ${st.lang === 'hi' ? 'on' : ''}" aria-pressed="${String(st.lang === 'hi')}" data-action="lang" data-l="hi">हिन्दी</button></div><label class="check"><input id="speakOn" type="checkbox" data-change="speak" ${st.speak ? 'checked' : ''}> Read replies aloud</label>`, { icon: 'spark' })}
        ${ui.card('Try asking', html`<ul class="chips big">${(st.lang === 'hi' ? ['मेरी अगली दवा कब है?', 'मेरी दवाइयाँ कौन सी हैं?', 'अगला अपॉइंटमेंट कब है?', 'क्या कोई दवा खत्म हो रही है?', 'मेरी सेहत कैसी है?', 'मदद चाहिए'] : ['When is my next medicine?', 'What are my medicines?', 'When is my next appointment?', 'Is any medicine running out?', 'How is my health?', 'I need help']).map((q) => html`<li><button type="button" class="chip-b" data-action="ask" data-q="${q}">${q}</button></li>`)}</ul>`, { icon: 'list' })}
        <p class="small muted">Answers come from your own records using on-device rules. No data is sent anywhere. Voice recognition needs a supported browser such as Chrome.</p>
      </div>
    </div>`;
  };
  LI.chat = LI.chat || { log: [], lang: 'en', speak: false, listening: false, sos: false, note: '' };

  V.emergency = function (c) {
    return html`${head('Emergency', 'Stay calm. Help is one tap away.')}
    <div class="grid g2">
      <div class="stack">${ui.card('Call for help', html`<div class="row"><a class="btn btn-danger btn-lg" href="tel:112">${ui.icon('phone', 20)} Call 112</a><a class="btn btn-lg" href="tel:108">Ambulance 108</a></div><div class="row"><button class="btn btn-danger" type="button" data-action="sos">${ui.icon('sos', 18)} Send SOS to family</button></div>`, { icon: 'sos' })}
      ${ui.card('Emergency contacts', contactsList(c.p), { icon: 'phone' })}
      ${ui.card('Medical details for responders', html`<p><strong>${c.p.name}</strong>, ${c.p.age} years, blood group ${c.p.blood}</p><p><strong>Conditions:</strong> ${c.p.conditions.map((x) => x.name).join(', ')}</p><p><strong>Allergies:</strong> ${c.p.allergies.join(', ')}</p><p><strong>Address:</strong> ${c.p.address}</p>`, { icon: 'heart' })}</div>
      ${ui.card('What to do', html`<div class="acc">${LI.EMERGENCY_GUIDE.map((g) => html`<details><summary>${g.title}</summary><ol>${g.steps.map((s) => html`<li>${s}</li>`)}</ol></details>`)}</div><p class="small muted">General first-aid guidance only. In a real emergency call 112.</p>`, { icon: 'spark' })}
    </div>`;
  };

  V.appointments = function (c) { return html`${head('Appointments', c.role === 'patient' ? 'Your upcoming visits' : 'Appointments for ' + fn(c.p.name), ['doctor', 'caretaker'].includes(c.role) ? html`<button class="btn btn-primary" type="button" data-action="newAppt">${ui.icon('plus', 18)} New appointment</button>` : '')}${ui.card('Upcoming', apptList(c, false), { icon: 'calendar' })}${['doctor', 'caretaker'].includes(c.role) ? ui.card('Past and cancelled', apptList({ ...c, p: { ...c.p, appointments: c.p.appointments.filter((a) => a.status !== 'scheduled') } }, true), { icon: 'list' }) : ''}`; };

  V.safety = function (c) {
    const p = c.p, z = p.safezone;
    return html`${head('My safety', 'Your safe zone and device')}
    <div class="grid g2">
      ${ui.card('Where I am', html`<p>${ui.pill(p.location.inside ? 'In my safe zone' : 'Outside my safe zone', p.location.inside ? 'ok' : 'danger')}</p><p class="muted">Last updated ${U.relTime(p.location.ts, c.now)}.</p><a class="btn" href="#selfMap">Jump to map</a>`, { icon: 'pin' })}
      ${ui.card('Going out?', html`<p class="muted">Tell LivedIn about a planned outing so your family is not alerted.</p>${LI.outingActive(z.outing, c.now) ? html`<p>${ui.pill('Outing mode on', 'info')}</p><button class="btn" type="button" data-action="outing" data-h="0">I am back - end outing</button>` : html`<div class="row"><button class="btn" type="button" data-action="outing" data-h="1">1 hour</button><button class="btn" type="button" data-action="outing" data-h="2">2 hours</button><button class="btn" type="button" data-action="outing" data-h="4">4 hours</button></div>`}`, { icon: 'clock' })}
      ${ui.card('My smart device (simulated)', html`${ui.simBanner()}<p>Battery ${Math.round(p.device.battery)}% - ${p.device.online ? 'online' : 'offline'}</p><div class="row"><button class="btn" type="button" data-action="buzzer">Test buzzer</button><button class="btn btn-danger" type="button" data-action="sos">SOS</button></div>`, { icon: 'chip' })}
    </div>
    <div id="selfMap">${ui.card('My map', html`<div id="mapSlot" class="map-slot"></div><p class="small muted pad">Tap the map to move the simulated patient (demo mode).</p>`, { icon: 'pin', cls: 'flush' })}</div>`;
  };

  V.privacy = function (c) {
    const k = c.p.consent;
    const row = (key, t, d) => html`<li class="item"><div class="grow"><strong>${t}</strong><div class="muted small">${d}</div></div><label class="switch"><input id="cs-${key}" type="checkbox" data-change="consent" data-key="${key}" ${k[key] ? 'checked' : ''} aria-label="${t}"><span class="sw-ui" aria-hidden="true"></span><span class="sw-t">${k[key] ? 'On' : 'Off'}</span></label></li>`;
    return html`${head('Privacy and sharing', 'You decide who can see your information.')}${ui.card('Who can see what', html`<ul class="list">${row('family', 'Share my location with family', 'Family can see my live location, history and safe-zone alerts.')}${row('caretaker', 'Share my location with my caretaker', 'The caretaker can see my location during care visits.')}${row('medicalFamily', 'Share my health details with family', 'Vitals, reports and doctor notes marked as shared.')}</ul><p class="small muted">SOS alerts always include your last location so help can reach you.</p>`, { icon: 'lock' })}
    ${ui.card('Access summary', html`<div class="table-wrap"><table><caption class="sr-only">Who can see which information</caption><thead><tr><th scope="col">Information</th><th scope="col">Family</th><th scope="col">Caretaker</th><th scope="col">Doctor</th></tr></thead><tbody><tr><th scope="row">Live location</th><td>${k.family ? 'Yes' : 'No'}</td><td>${k.caretaker ? 'Yes' : 'No'}</td><td>No</td></tr><tr><th scope="row">Medicines and stock</th><td>Yes</td><td>Yes</td><td>Yes</td></tr><tr><th scope="row">Health details and reports</th><td>${k.medicalFamily ? 'Yes' : 'No'}</td><td>Yes</td><td>Yes</td></tr></tbody></table></div>`, { icon: 'eye' })}`;
  };

  /* ---------- FAMILY ---------- */
  V.overview = function (c) {
    const p = c.p, a = LI.adherence(p, 7, c.now), todayDs = LI.dosesForDate(p, U.ymd(c.now), c.now), missedToday = todayDs.filter((d) => d.status === 'missed' || d.status === 'overdue').length;
    const nx = nextAppt(p, c.now), low = p.meds.filter((m) => m.active && LI.stockStatus(m) !== 'ok'), allowed = locAllowed(c);
    return html`${head(fn(p.name) + "'s day", 'Family overview - ' + U.fmtDateLong(U.ymd(c.now)), html`<button class="btn" type="button" data-action="genDaily">${ui.icon('file', 18)} Generate daily summary</button>`)}
    <div class="grid g4">
      ${ui.stat('Location', allowed ? (p.location.inside ? 'Home - safe' : 'Outside zone') : 'Private', allowed ? 'Updated ' + U.relTime(p.location.ts, c.now) : 'Sharing is off', allowed ? (p.location.inside ? 'ok' : 'danger') : '', 'pin')}
      ${ui.stat('Adherence (7 days)', a.pct + '%', a.taken + ' taken, ' + a.missed + ' missed', a.pct >= 85 ? 'ok' : a.pct >= 70 ? 'warn' : 'danger', 'pill')}
      ${ui.stat('Missed today', String(missedToday), missedToday ? 'Please check in' : 'All on track', missedToday ? 'warn' : 'ok', 'alert')}
      ${ui.stat('Next appointment', nx ? U.fmtDate(nx.date) : 'None', nx ? nx.title + ', ' + U.fmtTime12(nx.time) : '', '', 'calendar')}
    </div>
    <div class="grid g2">
      ${ui.card('Latest alerts', alertList(c, 4), { icon: 'bell', actions: html`<a class="btn btn-sm" href="#/alerts">All alerts</a>` })}
      ${ui.card('Today\'s medicines (read-only)', doseList(c), { icon: 'pill' })}
      ${medAllowed(c) ? ui.card('Daily summary', summaryBlock(c), { icon: 'spark' }) : ui.card('Health summary', ui.empty('Health details are not shared with family.'), { icon: 'lock' })}
      ${ui.card('Stock watch', low.length ? html`<ul class="list">${low.map((m) => html`<li class="item"><span class="grow"><strong>${m.name}</strong> <span class="muted small">${LI.daysLeft(m)} day(s) left</span></span>${stPill(m)}${m.status === 'requested' ? html`<button class="btn btn-sm btn-sage" type="button" data-action="placeOrder" data-id="${m.id}">Order now</button>` : ''}</li>`)}</ul><a class="btn btn-sm" href="#/medicines">Manage stock</a>` : ui.empty('All medicines are well stocked.'), { icon: 'box' })}
      ${ui.card('Notes from the caretaker', c.p.notes.care.length ? html`<ul class="list">${c.p.notes.care.slice(0, 3).map((n) => html`<li class="item col"><strong>${n.by} - ${U.fmtDate(n.date)}</strong><p>${n.text}</p></li>`)}</ul>` : ui.empty('No notes yet.'), { icon: 'file' })}
      ${ui.card('Missed-dose analysis', missedBlock(c), { icon: 'alert' })}
    </div>`;
  };

  V.medicines = function (c) {
    const a = LI.adherence(c.p, 7, c.now);
    return html`${head('Medicines', 'History, missed doses and stock for ' + fn(c.p.name))}
    <div class="grid g2">${ui.card('Adherence (7 days): ' + a.pct + '%', ui.bars(a.perDay), { icon: 'chart' })}${ui.card('Missed-dose analysis', missedBlock(c), { icon: 'alert' })}</div>
    ${c.role === 'caretaker' ? ui.card("Today's doses", doseList(c), { icon: 'pill' }) : ''}
    ${ui.card('Medicine stock', html`<p class="muted small">${c.role === 'caretaker' ? 'When a medicine is about to run out, notify the family so it can be ordered.' : 'Order medicines that the caretaker reports are running low.'}</p>${stockList(c)}`, { icon: 'box' })}
    ${ui.card('Medicine-taking history', html`${historyTable(c)}<p class="small muted">Each cell shows doses taken out of doses scheduled. Red marks a missed dose.</p>`, { icon: 'list' })}
    ${ui.card('Recent doses', doseTimeline(c, 12), { icon: 'clock' })}`;
  };

  V.health = function (c) {
    if (!medAllowed(c)) return html`${head('Health', '')}${ui.card('Private', ui.empty(fn(c.p.name) + ' has not shared health details with family.'), { icon: 'lock' })}`;
    const shared = c.p.notes.consult.filter((n) => n.shared);
    return html`${head('Health', 'Recorded health information for ' + c.p.name, html`<button class="btn btn-primary" type="button" data-action="downloadFull">${ui.icon('download', 18)} Full report (PDF)</button>`)}
    <div class="grid g2">${ui.card('AI health summary', summaryBlock(c), { icon: 'spark' })}${ui.card('Conditions', conditionsBlock(c.p), { icon: 'heart' })}</div>
    ${ui.card('Vitals', vitalsBlock(c.p), { icon: 'chart' })}${ui.card('Doctor notes (shared with family)', shared.length ? html`<ul class="list">${shared.map((n) => html`<li class="item col"><strong>${n.by} - ${U.fmtDate(n.date)}</strong><p>${n.text}</p></li>`)}</ul>` : ui.empty('No shared notes.'), { icon: 'steth' })}`;
  };

  V.reports = function (c) {
    const ok = medAllowed(c);
    return html`${head('Reports', 'Lab reports and prescriptions', ok ? html`<button class="btn btn-primary" type="button" data-action="downloadFull">${ui.icon('download', 18)} Download full report (PDF)</button><button class="btn" type="button" data-action="downloadAdherence">Adherence report (PDF)</button>` : '')}${ok ? ui.card('Reports on file', reportList(c), { icon: 'file' }) : ui.card('Private', ui.empty('Health details are not shared with family.'), { icon: 'lock' })}`;
  };

  V.alerts = function (c) {
    return html`${head('Alerts and history', 'Everything LivedIn has notified you about', html`<button class="btn" type="button" data-action="readAll">Mark all read</button>`)}${ui.card('Alerts', alertList(c, 60), { icon: 'bell' })}${ui.card('Activity history', html`<ul class="list compact">${c.p.activity.slice(0, 25).map((a) => html`<li class="item"><span class="mono muted">${U.fmtStamp(a.ts)}</span><span class="grow">${a.text}</span></li>`)}</ul>`, { icon: 'list' })}`;
  };

  V.contact = function (c) {
    const to = c.role === 'family' ? [['caretaker', 'Caretaker (Meena Verma)'], ['doctor', 'Doctor (Dr. Anil Kapoor)']] : c.role === 'caretaker' ? [['family', 'Family (Aarav Sharma)'], ['doctor', 'Doctor (Dr. Anil Kapoor)']] : [['family', 'Family'], ['caretaker', 'Caretaker']];
    return html`${head('Contact', 'Reach the care team and emergency contacts')}
    <div class="grid g2">${ui.card('Emergency contacts', contactsList(c.p), { icon: 'phone' })}
    ${ui.card('Send a message', html`<form data-form="message" class="stack-s"><div class="field"><label for="msgTo">To</label><select id="msgTo" name="to">${to.map((t) => html`<option value="${t[0]}">${t[1]}</option>`)}</select></div><div class="field"><label for="msgText">Message</label><textarea id="msgText" name="text" maxlength="400" required></textarea></div><button class="btn btn-primary" type="submit">${ui.icon('send', 18)} Send message</button></form>`, { icon: 'send' })}</div>
    ${ui.card('Care team', html`<ul class="list"><li class="item"><div class="avatar">M</div><div class="grow"><strong>Meena Verma</strong><div class="muted small">Caretaker</div></div><a class="btn btn-sm" href="tel:+919000000003">${ui.icon('phone', 16)} Call</a></li><li class="item"><div class="avatar">A</div><div class="grow"><strong>Dr. Anil Kapoor</strong><div class="muted small">Consultant Geriatrician</div></div><a class="btn btn-sm" href="tel:+919000000004">${ui.icon('phone', 16)} Call</a></li></ul>`, { icon: 'users' })}`;
  };
})();
