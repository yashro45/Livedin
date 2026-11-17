/*
 * LivedIn - demo accounts and dummy data seed. ALL DATA IS FICTIONAL.
 * Passwords are never stored in clear text: only salted, iterated SHA-256 digests.
 */
(function (root, factory) {
  const U = (typeof module === 'object' && module.exports) ? require('./util.js') : root.LI;
  const api = factory(U);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  const VERSION = 3;
  // Demo password for every role is 1845 (shown on the login page on purpose, for evaluators).
  const USERS = [
    { uid: 'PAT1001', role: 'patient', name: 'Savitri Sharma', title: 'Patient', patientIds: ['p1'], salt: 'lv-pat-9f3a1c', hash: '26c25f016f3869c6be0404ecc7a68811e5a2686c740fcbe26a57a06854074bb9' },
    { uid: 'FAM1001', role: 'family', name: 'Aarav Sharma', title: 'Family (son)', patientIds: ['p1'], salt: 'lv-fam-27be40', hash: '684d39bd353001f8ce988572cf4a8a38dc5ad4eb96d88608249c00d65ce33ce6' },
    { uid: 'CTK1001', role: 'caretaker', name: 'Meena Verma', title: 'Caretaker', patientIds: ['p1', 'p2'], salt: 'lv-ctk-c81d5e', hash: '0ed209c9ee41426d509050bb3a3d57414b4f20e8740b898aefd83b332beb442e' },
    { uid: 'DOC1001', role: 'doctor', name: 'Dr. Anil Kapoor', title: 'Doctor', patientIds: ['p1', 'p2'], salt: 'lv-doc-4a6f92', hash: '70bb2dc22b92b1b19765e90ff789d2ecad020d54544fdaed1c5884d5b184f7a1' },
  ];

  const AUDIENCE = {
    medicine_reminder: ['patient', 'caretaker'],
    missed_medicine: ['family', 'caretaker', 'doctor'],
    geofence_exit: ['family', 'caretaker'],
    patient_return: ['family', 'caretaker'],
    sos: ['patient', 'family', 'caretaker', 'doctor'],
    emergency: ['family', 'caretaker', 'doctor'],
    low_battery: ['family', 'caretaker'],
    device_offline: ['family', 'caretaker'],
    appointment_reminder: ['patient', 'family', 'caretaker', 'doctor'],
    medicine_refill: ['family', 'caretaker'],
    stock_request: ['family'],
    order_placed: ['caretaker'],
    daily_report: ['family'],
    message: ['family', 'caretaker', 'doctor'],
    info: ['family', 'caretaker', 'doctor', 'patient'],
  };

  function buildPatient(cfg, now) {
    const today = U.ymd(now), minNow = U.minOfDay(now);
    const p = {
      id: cfg.id, name: cfg.name, age: cfg.age, gender: cfg.gender, blood: cfg.blood, address: cfg.address,
      conditions: cfg.conditions, allergies: cfg.allergies,
      meds: cfg.meds.map((m, i) => Object.assign({ id: cfg.id + '_m' + (i + 1), active: true, perDose: 1, since: U.ymd(U.addDays(now, -40)), status: 'ok', refillAlerted: false }, m)),
      doseLog: [], appointments: [], reports: [], notes: { consult: [], care: [] }, vitals: [], careTasks: [], activity: [],
      device: { paired: true, battery: cfg.battery, online: cfg.online, drain: false, boxOpen: false, buzzer: false, movement: 'Still', lastSeen: now - (cfg.online ? 20000 : 3 * 3600000), mode: 'demo', realWatching: false, sosPressed: false },
      safezone: { lat: cfg.home.lat, lng: cfg.home.lng, radius: 300, label: 'Home (demo location)', outing: { active: false, until: 0 } },
      location: { lat: cfg.home.lat, lng: cfg.home.lng, ts: now - (cfg.online ? 20000 : 3 * 3600000), source: 'demo', inside: true },
      locHistory: [], consent: { family: true, caretaker: true, medicalFamily: true }, contacts: cfg.contacts, flags: { lowBattery: cfg.battery <= 20 },
    };
    // 7 days of dose history with deliberate patterns
    cfg.meds.forEach((m, mi) => {
      const med = p.meds[mi];
      for (let back = 7; back >= 0; back--) {
        const date = U.ymd(U.addDays(now, -back));
        med.times.forEach((time) => {
          if (back === 0 && U.hmToMin(time) > minNow - 90) return; // today: only doses that are already past
          const key = mi + '|' + time + '|' + back;
          const missed = (cfg.missPattern || []).includes(key);
          p.doseLog.push({
            id: U.uid('d'), medId: med.id, date, time, status: missed ? 'missed' : 'taken', by: missed ? 'system' : (back % 2 ? 'patient' : 'caretaker'),
            at: new Date(date + 'T' + time + ':00').getTime() + 6 * 60000,
          });
        });
      }
    });
    cfg.appts.forEach((a, i) => p.appointments.push({ id: p.id + '_a' + (i + 1), status: 'scheduled', mode: 'In-person', reminded: false, title: a.title, with: a.with, location: a.location, date: U.ymd(U.addDays(now, a.inDays)), time: a.time }));
    cfg.reports.forEach((r, i) => p.reports.push({ id: p.id + '_r' + (i + 1), kind: r.kind, title: r.title, date: U.ymd(U.addDays(now, -r.ago)), by: r.by, summary: r.summary, flag: r.flag, file: null, meds: r.meds || [] }));
    cfg.consults.forEach((c, i) => p.notes.consult.push({ id: p.id + '_c' + (i + 1), date: U.ymd(U.addDays(now, -c.ago)), by: 'Dr. Anil Kapoor', text: c.text, shared: c.shared }));
    cfg.careNotes.forEach((c, i) => p.notes.care.push({ id: p.id + '_n' + (i + 1), date: U.ymd(U.addDays(now, -c.ago)), by: 'Meena Verma', text: c.text }));
    cfg.vitals.forEach((v, i) => p.vitals.push({ id: p.id + '_v' + (i + 1), date: U.ymd(U.addDays(now, -(cfg.vitals.length - 1 - i))), sys: v[0], dia: v[1], sugar: v[2], pulse: v[3], temp: 98.4, mood: v[4], by: 'Meena Verma' }));
    ['Morning hygiene & dressing', 'Breakfast and hydration', 'Light walk (20 min)', 'Physiotherapy exercises', 'Afternoon rest', 'Evening walk and prayer'].forEach((label, i) =>
      p.careTasks.push({ id: p.id + '_t' + (i + 1), date: today, label, done: i < 2 && minNow > 9 * 60, by: i < 2 ? 'Meena Verma' : '' }));
    p.activity.push(
      { id: U.uid('x'), ts: now - 5 * 3600000, text: 'Morning walk detected (simulated movement sensor)', kind: 'movement' },
      { id: U.uid('x'), ts: now - 26 * 3600000, text: 'Evening medicines confirmed by caretaker', kind: 'medicine' },
      { id: U.uid('x'), ts: now - 30 * 3600000, text: 'Blood pressure recorded: 138/86 mmHg', kind: 'vitals' },
    );
    for (let i = 8; i >= 1; i--) p.locHistory.push({ ts: now - i * 25 * 60000, lat: cfg.home.lat, lng: cfg.home.lng, inside: true, source: 'seed' });
    return p;
  }

  function seed(now) {
    const day = 86400000;
    const p1 = buildPatient({
      id: 'p1', name: 'Savitri Sharma', age: 74, gender: 'Female', blood: 'B+', address: 'Flat 12, Green Meadows, Ghaziabad (demo address)',
      conditions: [
        { name: 'Type 2 Diabetes', since: '2014', notes: 'HbA1c 7.4% at last review; diet + metformin.', severity: 'Moderate' },
        { name: 'Hypertension', since: '2012', notes: 'Home BP running 130-146 / 84-92 mmHg.', severity: 'Moderate' },
        { name: 'Osteoarthritis (knees)', since: '2019', notes: 'Pain on stairs; physiotherapy twice a week.', severity: 'Mild' },
      ],
      allergies: ['Penicillin (rash)'], battery: 76, online: true, home: { lat: 28.6692, lng: 77.4538 },
      meds: [
        { name: 'Metformin', dose: '500 mg', form: 'Tablet', times: ['08:00', '20:00'], stock: 18, forCondition: 'Type 2 Diabetes', instructions: 'After food', prescribedBy: 'Dr. Anil Kapoor' },
        { name: 'Amlodipine', dose: '5 mg', form: 'Tablet', times: ['08:00'], stock: 40, forCondition: 'Hypertension', instructions: 'Same time daily', prescribedBy: 'Dr. Anil Kapoor' },
        { name: 'Atorvastatin', dose: '10 mg', form: 'Tablet', times: ['21:00'], stock: 4, forCondition: 'Cholesterol', instructions: 'After dinner', prescribedBy: 'Dr. Anil Kapoor' },
        { name: 'Calcium + Vitamin D3', dose: '500 mg', form: 'Tablet', times: ['13:00'], stock: 5, forCondition: 'Osteoarthritis / bones', instructions: 'After lunch', prescribedBy: 'Dr. Anil Kapoor' },
      ],
      missPattern: ['0|20:00|1', '0|20:00|3', '0|20:00|6', '2|21:00|2', '2|21:00|3', '3|13:00|5'],
      appts: [
        { title: 'Diabetes follow-up', with: 'Dr. Anil Kapoor', location: 'City Care Clinic, Room 4', inDays: 2, time: '11:00' },
        { title: 'HbA1c lab test (fasting)', with: 'Apex Diagnostics', location: 'Home sample collection', inDays: 5, time: '07:30' },
      ],
      reports: [
        { kind: 'lab', title: 'HbA1c and Lipid profile', ago: 10, by: 'Apex Diagnostics', flag: 'attention', summary: 'HbA1c 7.4% (target below 7.0%). LDL 128 mg/dL (borderline high). Creatinine 0.9 mg/dL (normal). Vitamin D 21 ng/mL (low).' },
        { kind: 'prescription', title: 'Prescription - diabetes and BP review', ago: 10, by: 'Dr. Anil Kapoor', flag: 'normal', summary: 'Continue current regimen; add Calcium + Vitamin D3. Review in 2 weeks.', meds: ['Metformin 500 mg - 1-0-1 after food', 'Amlodipine 5 mg - 1-0-0', 'Atorvastatin 10 mg - 0-0-1', 'Calcium + Vitamin D3 - once after lunch'] },
        { kind: 'lab', title: 'Kidney function and electrolytes', ago: 32, by: 'Apex Diagnostics', flag: 'normal', summary: 'Urea 28 mg/dL, creatinine 0.9 mg/dL, sodium 138 mmol/L, potassium 4.2 mmol/L. All within range.' },
      ],
      consults: [
        { ago: 10, text: 'Sugar control is acceptable but evening doses are being skipped. Advised caretaker to prompt Metformin at 8 PM. Encourage 30 min daily walking.', shared: true },
        { ago: 32, text: 'BP slightly elevated in clinic (146/90). Continue Amlodipine; reduce salt. Reassess in 4 weeks.', shared: false },
      ],
      careNotes: [{ ago: 1, text: 'Savitri ji had a good appetite today and walked 20 minutes. She felt a little dizzy after the evening dose yesterday; resolved with rest.' }, { ago: 3, text: 'Evening Metformin refused twice - says it upsets her stomach if taken before dinner.' }],
      vitals: [[138, 86, 132, 76, 'Calm'], [142, 88, 140, 78, 'Calm'], [136, 84, 128, 74, 'Cheerful'], [146, 92, 152, 82, 'Tired'], [140, 86, 138, 76, 'Calm'], [134, 82, 126, 72, 'Cheerful'], [138, 86, 134, 75, 'Calm']],
      contacts: [
        { id: 'c1', name: 'Aarav Sharma', relation: 'Son', phone: '+91 90000 00001', primary: true },
        { id: 'c2', name: 'Neha Sharma', relation: 'Daughter-in-law', phone: '+91 90000 00002', primary: false },
        { id: 'c3', name: 'Meena Verma', relation: 'Caretaker', phone: '+91 90000 00003', primary: false },
        { id: 'c4', name: 'Dr. Anil Kapoor', relation: 'Doctor', phone: '+91 90000 00004', primary: false },
      ],
    }, now);

    const p2 = buildPatient({
      id: 'p2', name: 'Ramesh Kumar', age: 79, gender: 'Male', blood: 'O+', address: 'B-7, Shanti Apartments, Indirapuram (demo address)',
      conditions: [
        { name: 'Chronic heart failure (NYHA II)', since: '2018', notes: 'Fluid restriction 1.5 L/day; daily weight check.', severity: 'Moderate' },
        { name: 'Hypothyroidism', since: '2010', notes: 'TSH stable on current dose.', severity: 'Mild' },
      ],
      allergies: ['None known'], battery: 19, online: false, home: { lat: 28.646, lng: 77.369 },
      meds: [
        { name: 'Levothyroxine', dose: '50 mcg', form: 'Tablet', times: ['06:30'], stock: 25, forCondition: 'Hypothyroidism', instructions: 'Empty stomach', prescribedBy: 'Dr. Anil Kapoor' },
        { name: 'Furosemide', dose: '40 mg', form: 'Tablet', times: ['08:00'], stock: 3, forCondition: 'Heart failure', instructions: 'Morning only', prescribedBy: 'Dr. Anil Kapoor' },
        { name: 'Carvedilol', dose: '6.25 mg', form: 'Tablet', times: ['08:00', '20:00'], stock: 30, forCondition: 'Heart failure', instructions: 'With food', prescribedBy: 'Dr. Anil Kapoor' },
      ],
      missPattern: ['1|08:00|2'],
      appts: [{ title: 'Cardiology review', with: 'Dr. Anil Kapoor', location: 'City Care Clinic, Room 2', inDays: 4, time: '10:30' }],
      reports: [{ kind: 'lab', title: 'Thyroid profile (TSH)', ago: 21, by: 'Apex Diagnostics', flag: 'normal', summary: 'TSH 3.1 mIU/L, free T4 1.2 ng/dL. Within range.' }],
      consults: [{ ago: 14, text: 'Weight stable. Mild ankle swelling in evenings; continue diuretic and salt restriction.', shared: true }],
      careNotes: [{ ago: 2, text: 'Weight 71.4 kg, no breathlessness. Battery of tracker low - please charge overnight.' }],
      vitals: [[128, 78, 110, 70, 'Calm'], [130, 80, 112, 72, 'Calm'], [126, 76, 108, 68, 'Cheerful'], [132, 80, 118, 74, 'Calm']],
      contacts: [{ id: 'c1', name: 'Pooja Kumar', relation: 'Daughter', phone: '+91 90000 00011', primary: true }, { id: 'c2', name: 'Meena Verma', relation: 'Caretaker', phone: '+91 90000 00003', primary: false }],
    }, now);

    const alerts = [];
    const A = (pid, type, sev, title, msg, ago) => alerts.push({
      id: U.uid('al'), pid, type, sev, title, msg, ts: now - ago, audience: AUDIENCE[type].slice(), readBy: { family: true, caretaker: true, doctor: true, patient: true }, meta: {},
    });
    A('p1', 'missed_medicine', 'warn', 'Missed dose', 'Metformin (8:00 PM) was not taken yesterday.', 20 * 3600000);
    A('p1', 'geofence_exit', 'warn', 'Left safe zone', 'Savitri left the home safe zone at 5:42 PM.', 28 * 3600000);
    A('p1', 'patient_return', 'info', 'Back home', 'Savitri returned to the safe zone at 6:05 PM.', 27 * 3600000);
    A('p1', 'daily_report', 'info', 'Daily family report', 'Yesterday: 5 of 6 doses taken, 3,200 steps simulated, mood calm, no emergencies.', 12 * 3600000);
    A('p2', 'low_battery', 'warn', 'Low battery', 'Ramesh\'s smart device is at 19%.', 4 * 3600000);
    A('p2', 'device_offline', 'warn', 'Device offline', 'Ramesh\'s smart device has been offline for 3 hours (simulated).', 3 * 3600000);

    return { v: VERSION, createdAt: now, patients: { p1, p2 }, alerts, messages: [], reminded: {}, flags: {}, daily: {} };
  }

  return { VERSION, USERS, AUDIENCE, seed };
});
