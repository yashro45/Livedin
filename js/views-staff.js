/* LivedIn - caretaker and doctor views. */
(function () {
  'use strict';
  const LI = window.LI, ui = LI.ui, { html } = LI, U = LI, V = LI.views, S = LI.shared;
  const fn = (n) => String(n).split(' ')[0];
  const { head } = S;

  /* shared: patient list (caretaker + doctor) */
  V.patients = function (c) {
    const mine = c.user.patientIds.map((id) => c.s.patients[id]).filter(Boolean);
    return html`${head(c.role === 'doctor' ? 'My patients' : 'Assigned patients', 'Choose a patient to open their dashboard')}
    <div class="grid g2">${mine.map((p) => {
      const a = LI.adherence(p, 7, c.now), low = p.meds.filter((m) => m.active && LI.stockStatus(m) !== 'ok').length, unread = c.s.alerts.filter((x) => x.pid === p.id && x.audience.includes(c.role) && !x.readBy[c.role]).length;
      return html`<section class="card patient-card ${p.id === c.pid ? 'sel' : ''}"><div class="row"><div class="avatar lg">${p.name[0]}</div><div class="grow"><h2>${p.name}</h2><p class="muted small">${p.age} y - ${p.gender} - ${p.blood}</p></div>${p.id === c.pid ? ui.pill('Selected', 'ok') : ''}</div>
        <p class="small">${p.conditions.map((x) => x.name).join(', ')}</p>
        <div class="row">${ui.pill('Adherence ' + a.pct + '%', a.pct >= 85 ? 'ok' : a.pct >= 70 ? 'warn' : 'danger')}${c.role === 'caretaker' ? ui.pill(p.location.inside ? 'In safe zone' : 'Outside zone', p.location.inside ? 'ok' : 'danger') : ''}${c.role === 'caretaker' ? ui.pill('Battery ' + Math.round(p.device.battery) + '%', p.device.battery <= 20 ? 'danger' : 'info') : ''}${low ? ui.pill(low + ' low stock', 'warn') : ''}${unread ? ui.pill(unread + ' unread', 'danger') : ''}</div>
        <button class="btn btn-primary" type="button" data-action="selectPatient" data-pid="${p.id}">Open ${fn(p.name)}'s dashboard</button></section>`;
    })}</div>`;
  };

  /* ---------- CARETAKER ---------- */
  V.care = function (c) {
    const p = c.p, tasks = p.careTasks.filter((t) => t.date === U.ymd(c.now)), done = tasks.filter((t) => t.done).length;
    return html`${head('Care today', 'Daily care for ' + p.name, html`<button class="btn btn-danger" type="button" data-action="emergencyDlg">${ui.icon('alert', 18)} Report emergency</button>`)}
    <div class="grid g2">
      ${ui.card('Daily care activities', html`<p class="muted">${done} of ${tasks.length} done</p>${ui.progress(tasks.length ? (100 * done) / tasks.length : 0)}<ul class="list">${tasks.map((t) => html`<li class="item"><label class="check grow"><input type="checkbox" id="task-${t.id}" data-change="task" data-id="${t.id}" ${t.done ? 'checked' : ''}> <span class="${t.done ? 'done' : ''}">${t.label}</span></label>${t.done ? html`<span class="small muted">${t.by}</span>` : ''}</li>`)}</ul>
        <form data-form="addTask" class="row"><label class="sr-only" for="newTask">New activity</label><input id="newTask" name="label" type="text" maxlength="80" placeholder="Add an activity..." required class="grow"><button class="btn btn-sm btn-primary" type="submit">${ui.icon('plus', 16)} Add</button></form>`, { icon: 'check' })}
      ${ui.card("Confirm medicine administration", doseList(c), { icon: 'pill', sub: 'Tap "Confirm given" after you have given the medicine.' })}
      ${ui.card('Record patient condition', html`<form data-form="addVitals" class="stack-s"><div class="grid g2s"><div class="field"><label for="vSys">Systolic BP</label><input id="vSys" name="sys" type="number" min="60" max="260" required></div><div class="field"><label for="vDia">Diastolic BP</label><input id="vDia" name="dia" type="number" min="30" max="160" required></div><div class="field"><label for="vSug">Sugar (mg/dL)</label><input id="vSug" name="sugar" type="number" min="30" max="600" required></div><div class="field"><label for="vPul">Pulse (bpm)</label><input id="vPul" name="pulse" type="number" min="30" max="220" required></div></div><div class="field"><label for="vMood">Mood</label><select id="vMood" name="mood"><option>Calm</option><option>Cheerful</option><option>Tired</option><option>Anxious</option><option>Confused</option><option>In pain</option></select></div><button class="btn btn-primary" type="submit">Save condition</button></form>`, { icon: 'heart' })}
      ${ui.card('Note for family', html`<form data-form="addCareNote" class="stack-s"><div class="field"><label for="cnText">Share an update with the family</label><textarea id="cnText" name="text" maxlength="500" required></textarea></div><button class="btn btn-primary" type="submit">${ui.icon('send', 18)} Post note</button></form><ul class="list">${p.notes.care.slice(0, 3).map((n) => html`<li class="item col"><strong>${U.fmtDate(n.date)}</strong><p>${n.text}</p></li>`)}</ul>`, { icon: 'file' })}
    </div>
    ${ui.card('Latest vitals', S.vitalsBlock(p), { icon: 'chart' })}`;
  };
  const doseList = (c) => S.doseList(c);

  /* ---------- DOCTOR ---------- */
  V.overview_doctor = null;
  const doctorOverview = function (c) {
    const p = c.p, a = LI.adherence(p, 7, c.now);
    return html`${head(p.name, 'Complete picture - ' + p.age + ' y, ' + p.gender + ', blood group ' + p.blood, html`<button class="btn btn-primary" type="button" data-action="downloadFull">${ui.icon('download', 18)} Full report (PDF)</button>`)}
    <div class="grid g4">${ui.stat('Adherence (7 d)', a.pct + '%', a.missed + ' missed', a.pct >= 85 ? 'ok' : 'warn', 'pill')}${ui.stat('Latest BP', (p.vitals[p.vitals.length - 1] || {}).sys + '/' + (p.vitals[p.vitals.length - 1] || {}).dia, 'mmHg', '', 'heart')}${ui.stat('Latest sugar', String((p.vitals[p.vitals.length - 1] || {}).sugar), 'mg/dL', '', 'chart')}${ui.stat('Active medicines', String(p.meds.filter((m) => m.active).length), 'on schedule', '', 'pill')}</div>
    <div class="grid g2">${ui.card('AI health summary', S.summaryBlock(c), { icon: 'spark' })}${ui.card('Conditions and allergies', S.conditionsBlock(p), { icon: 'heart' })}
    ${ui.card('Current medicines', html`<ul class="list">${p.meds.filter((m) => m.active).map((m) => html`<li class="item col"><div class="row between"><div><strong>${m.name}</strong> <span class="muted">${m.dose}</span></div>${S.stPill(m)}</div><div class="small muted">${m.times.map(U.fmtTime12).join(', ')} - ${m.instructions} - for ${m.forCondition}</div></li>`)}</ul>`, { icon: 'pill' })}
    ${ui.card('Missed-dose analysis', S.missedBlock(c), { icon: 'alert' })}
    ${ui.card('Notes from caretaker', p.notes.care.length ? html`<ul class="list">${p.notes.care.slice(0, 3).map((n) => html`<li class="item col"><strong>${n.by} - ${U.fmtDate(n.date)}</strong><p>${n.text}</p></li>`)}</ul>` : ui.empty('None.'), { icon: 'file' })}
    ${ui.card('Latest reports', html`<ul class="list">${p.reports.slice(0, 3).map((r) => html`<li class="item"><span class="grow"><strong>${r.title}</strong><div class="small muted">${U.fmtDate(r.date)} - ${r.by}</div></span>${ui.pill(r.flag === 'attention' ? 'Attention' : 'Normal', r.flag === 'attention' ? 'warn' : 'ok')}</li>`)}</ul><a class="btn btn-sm" href="#/reports">Open reports</a>`, { icon: 'file' })}</div>
    ${ui.card('Vitals trend', S.vitalsBlock(p), { icon: 'chart' })}
    ${ui.card('Recent activity', html`<ul class="list compact">${p.activity.slice(0, 8).map((x) => html`<li class="item"><span class="mono muted">${U.fmtStamp(x.ts)}</span><span class="grow">${x.text}</span></li>`)}</ul>`, { icon: 'list' })}`;
  };
  V.overview = (function (family) { return function (c) { return c.role === 'doctor' ? doctorOverview(c) : family(c); }; })(V.overview);

  const reportsFamily = V.reports;
  V.reports = function (c) {
    if (c.role !== 'doctor') return reportsFamily(c);
    return html`${head('Reports', 'Add lab results and prescriptions for ' + c.p.name, html`<button class="btn btn-primary" type="button" data-action="downloadFull">${ui.icon('download', 18)} Full report (PDF)</button>`)}
    <div class="grid g2">
      ${ui.card('Add lab report', html`<form data-form="addLab" class="stack-s"><div class="field"><label for="labTitle">Test name</label><input id="labTitle" name="title" type="text" maxlength="80" required placeholder="e.g. HbA1c and lipid profile"></div><div class="field"><label for="labSum">What the report says</label><textarea id="labSum" name="summary" maxlength="800" required placeholder="Key values and your interpretation"></textarea></div><div class="grid g2s"><div class="field"><label for="labFlag">Result</label><select id="labFlag" name="flag"><option value="normal">Normal</option><option value="attention">Needs attention</option></select></div><div class="field"><label for="labFile">Attach file (optional)</label><input id="labFile" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt"><span class="hint">PDF, PNG, JPG or TXT, up to 2 MB.</span></div></div><button class="btn btn-primary" type="submit">${ui.icon('download', 18)} Upload lab report</button></form>`, { icon: 'file' })}
      ${ui.card('Prescription and medicines allotted', html`<form data-form="addRx" class="stack-s"><div class="field"><label for="rxText">Prescription text</label><textarea id="rxText" name="text" maxlength="1500" placeholder="Tab Metformin 500 mg 1-0-1 after food x 30 days"></textarea><span class="hint">Type it, load a .txt file, or use the demo OCR sample, then press Extract.</span></div><div class="row"><input id="rxFile" name="file" type="file" accept=".txt,.pdf,.png,.jpg,.jpeg" data-change="rxFile" aria-label="Prescription file"><button class="btn btn-sm" type="button" data-action="sampleRx">Demo OCR sample</button><button class="btn btn-sm btn-sage" type="button" data-action="parseRx">Extract medicines</button></div>${ui.simBanner('Demo OCR reads typed or .txt prescriptions. Photos and PDFs are attached as records; a real OCR engine would be plugged in for scans.')}<div id="rxOut" aria-live="polite"></div><button class="btn btn-primary" type="submit">Save prescription and update schedule</button></form>`, { icon: 'pill' })}
    </div>${ui.card('Reports on file', S.reportList(c), { icon: 'list' })}`;
  };

  V.medicines_doctor = null;
  const medsFamily = V.medicines;
  V.medicines = function (c) {
    if (c.role !== 'doctor') return medsFamily(c);
    const act = c.p.meds.filter((m) => m.active), off = c.p.meds.filter((m) => !m.active);
    return html`${head('Medicine schedule', 'Update what ' + fn(c.p.name) + ' takes and when', html`<button class="btn btn-primary" type="button" data-action="addMedDlg">${ui.icon('plus', 18)} Add medicine</button>`)}
    ${ui.card('Active medicines', html`<div class="table-wrap"><table><caption class="sr-only">Active medicines</caption><thead><tr><th scope="col">Medicine</th><th scope="col">Dose</th><th scope="col">Times</th><th scope="col">Instructions</th><th scope="col">Stock</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${act.map((m) => html`<tr><th scope="row">${m.name}<div class="small muted">${m.forCondition}</div></th><td>${m.dose}</td><td>${m.times.map(U.fmtTime12).join(', ')}</td><td>${m.instructions}</td><td>${S.stPill(m)}</td><td class="nowrap"><button class="btn btn-sm" type="button" data-action="editMed" data-id="${m.id}">Edit</button> <button class="btn btn-sm btn-danger" type="button" data-action="stopMed" data-id="${m.id}">Stop</button></td></tr>`)}</tbody></table></div>`, { icon: 'pill' })}
    ${off.length ? ui.card('Stopped medicines', html`<ul class="list">${off.map((m) => html`<li class="item"><span class="grow"><strong>${m.name}</strong> <span class="muted">${m.dose}</span></span><button class="btn btn-sm" type="button" data-action="resumeMed" data-id="${m.id}">Resume</button></li>`)}</ul>`, { icon: 'list' }) : ''}`;
  };

  V.notes = function (c) {
    return html`${head('Consultation notes', 'Add notes and choose what the family can see')}
    <div class="grid g2">${ui.card('New consultation note', html`<form data-form="addConsult" class="stack-s"><div class="field"><label for="ccText">Note</label><textarea id="ccText" name="text" maxlength="800" required></textarea></div><label class="check"><input type="checkbox" name="shared" id="ccShared"> Share this note with the family</label><button class="btn btn-primary" type="submit">Save note</button></form>`, { icon: 'steth' })}
    ${ui.card('Previous notes', c.p.notes.consult.length ? html`<ul class="list">${c.p.notes.consult.map((n) => html`<li class="item col"><div class="row between"><strong>${n.by} - ${U.fmtDate(n.date)}</strong>${ui.pill(n.shared ? 'Shared with family' : 'Private', n.shared ? 'info' : 'plain')}</div><p>${n.text}</p></li>`)}</ul>` : ui.empty('No notes yet.'), { icon: 'file' })}</div>`;
  };

  V.adherence = function (c) {
    const a7 = LI.adherence(c.p, 7, c.now), a14 = LI.adherence(c.p, 14, c.now);
    return html`${head('Adherence report', 'Medication adherence for ' + c.p.name, html`<button class="btn btn-primary" type="button" data-action="downloadAdherence">${ui.icon('download', 18)} Download (PDF)</button>`)}
    <div class="grid g4">${ui.stat('7-day adherence', a7.pct + '%', a7.taken + ' taken / ' + a7.missed + ' missed', a7.pct >= 85 ? 'ok' : 'warn', 'pill')}${ui.stat('14-day adherence', a14.pct + '%', a14.taken + ' taken / ' + a14.missed + ' missed', a14.pct >= 85 ? 'ok' : 'warn', 'chart')}</div>
    <div class="grid g2">${ui.card('Daily doses (14 days)', ui.bars(a14.perDay), { icon: 'chart' })}${ui.card('By medicine (14 days)', html`<ul class="list">${c.p.meds.filter((m) => m.active).map((m) => { const x = a14.perMed[m.id] || { pct: 100, taken: 0, missed: 0 }; return html`<li class="item col"><div class="row between"><strong>${m.name} ${m.dose}</strong><span class="mono">${x.pct}%</span></div>${ui.progress(x.pct, x.pct >= 85 ? '' : x.pct >= 70 ? 'warn' : 'danger')}<span class="small muted">${x.taken} taken, ${x.missed} missed</span></li>`; })}</ul>`, { icon: 'pill' })}</div>
    ${ui.card('Patterns detected', S.missedBlock(c), { icon: 'alert' })}${ui.card('Dose history', S.historyTable(c), { icon: 'list' })}`;
  };
})();
