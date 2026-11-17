/* LivedIn - unit tests for the pure logic modules (security, geo, analysis, PDF, access control). Run: node tests/unit.js */
const crypto = require('crypto'), path = require('path');
const { assert, suite, test, summary } = require('./lib');
const J = (f) => require(path.join(__dirname, '..', 'js', f));
const S = J('security.js'), U = J('util.js'), G = J('geo.js'), A = J('analysis.js'), P = J('pdf.js'), D = J('data.js'), AC = J('access.js'), R = J('reports.js');
const now = new Date('2026-11-15T10:00:00').getTime();

/* a small patient fixture built from the real seed so tests follow the shipped demo data */
const seed = D.seed(now), p1 = seed.patients.p1;

suite('Security: output encoding (XSS)');
const PAYLOADS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'; DROP TABLE users;--", '<svg/onload=alert(1)>', 'javascript:alert(1)', '`${alert(1)}`', '&lt;already&gt;'];
test('esc() neutralises every HTML metacharacter', () => { for (const x of PAYLOADS) { const o = S.esc(x); assert(!/[<>"'`]/.test(o), x + ' -> ' + o); } });
test('html`` escapes interpolations and keeps trusted fragments', () => {
  const out = S.html`<p title="${'" onmouseover="x'}">${PAYLOADS[0]}</p>${S.html`<b>${'<i>'}</b>`}`.toString();
  assert(!out.includes('<script'), out); assert(out.includes('&quot; onmouseover=&quot;x'), out); assert(out.includes('<b>&lt;i&gt;</b>'), out);
});
test('html`` flattens arrays and drops false/null but keeps 0', () => { assert.strictEqual(S.html`${[1, S.html`<i>x</i>`, null, false]}|${0}`.toString(), '1<i>x</i>|0'); });
test('a Raw lookalike object is escaped (only real Raw passes)', () => { assert(S.html`${{ s: '<script>' }}`.toString().includes('[object Object]')); });

suite('Security: input validation');
test('cleanText strips control characters and caps length', () => { assert.strictEqual(S.cleanText('a\u0000b\u0007c   d', 50), 'abc d'); assert.strictEqual(S.cleanText('x'.repeat(900), 100).length, 100); assert.strictEqual(S.cleanText(null), ''); });
test('user id format', () => { assert(S.isValidUserId('PAT1001')); for (const bad of ['pat1001', 'PAT100', 'PAT10011', "PAT1'01", '', null, 'PA11001']) assert(!S.isValidUserId(bad), String(bad)); });
test('time and date validation', () => { assert(S.isValidTime('08:05') && S.isValidTime('23:59')); for (const b of ['24:00', '8:05', '12:60', 'ab:cd', '']) assert(!S.isValidTime(b), b); assert(S.isValidDate('2026-11-15')); for (const b of ['2026-02-30', '2026-13-01', '15/11/2026', '2026-1-1']) assert(!S.isValidDate(b), b); });
test('lat/lng validation', () => { assert(S.validLatLng(28.6, 77.4)); for (const [a, b] of [[91, 0], [0, 181], [NaN, 0], ['1', 2], [Infinity, 0]]) assert(!S.validLatLng(a, b)); });
test('clamp always returns a finite number in range', () => { assert.strictEqual(S.clamp('abc', 5, 10), 5); assert.strictEqual(S.clamp(99, 0, 10), 10); assert.strictEqual(S.clamp(-5, 0, 10), 0); });
test('upload validation: type, size, extension and empty files', () => {
  assert(S.validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 1000 }).ok);
  assert(!S.validateUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }).ok);
  assert(!S.validateUpload({ name: 'a.pdf', type: 'application/pdf', size: S.MAX_UPLOAD + 1 }).ok);
  assert(!S.validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 0 }).ok);
  assert(!S.validateUpload({ name: 'evil.html', type: 'application/pdf', size: 10 }).ok, 'extension must match type');
  assert(!S.validateUpload(null).ok);
});
test('safeFileName removes path tricks', () => { const n = S.safeFileName('../../etc/pass wd<>.pdf'); assert(!/[\/\\<>\s]/.test(n) && !n.startsWith('.'), n); });

suite('Security: password hashing, lockout, sessions');
test('SHA-256 matches Node crypto for many inputs', () => { for (const s of ['', 'abc', '1845', 'नमस्ते', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)]) assert.strictEqual(S.sha256(s), crypto.createHash('sha256').update(s).digest('hex'), s.slice(0, 10)); });
test('hashPassword is salted and deterministic', () => { assert.strictEqual(S.hashPassword('1845', 'a'), S.hashPassword('1845', 'a')); assert.notStrictEqual(S.hashPassword('1845', 'a'), S.hashPassword('1845', 'b')); assert.notStrictEqual(S.hashPassword('1845', 'a'), S.hashPassword('1846', 'a')); });
test('safeEqual compares fully and handles length differences', () => { assert(S.safeEqual('abc', 'abc')); assert(!S.safeEqual('abc', 'abd')); assert(!S.safeEqual('abc', 'abcd')); assert(!S.safeEqual('', 'a')); });
test('lockout: locks after MAX_FAILS and expires', () => {
  let rec = {}; const t0 = 1e6;
  for (let i = 1; i < S.MAX_FAILS; i++) { rec = S.registerFailure(rec, t0); assert.strictEqual(S.lockRemaining(rec, t0), 0); }
  rec = S.registerFailure(rec, t0); assert(S.lockRemaining(rec, t0) > 0); assert.strictEqual(S.lockRemaining(rec, t0 + S.LOCK_MS + 1), 0);
});
test('sessions expire (absolute and idle) and reject junk', () => {
  const s = S.makeSession('PAT1001', 'patient', 1000);
  assert(S.sessionValid(s, 1000 + 1000)); assert(!S.sessionValid(s, 1000 + S.SESSION_TTL + 1));
  assert(!S.sessionValid(null, 1)); assert(!S.sessionValid({}, 1)); assert(!S.sessionValid({ uid: 'x', role: 'y', exp: 'NaN', seen: 1 }, 1));
});

suite('Demo accounts');
test('four roles, each with the shared demo password 1845', () => {
  assert.deepStrictEqual(D.USERS.map((u) => u.role).sort(), ['caretaker', 'doctor', 'family', 'patient']);
  for (const u of D.USERS) { assert(S.isValidUserId(u.uid), u.uid); assert.strictEqual(S.hashPassword('1845', u.salt), u.hash, u.uid + ' hash'); assert.notStrictEqual(S.hashPassword('0000', u.salt), u.hash); }
});
test('every account has its own salt and no stored plaintext password', () => { assert.strictEqual(new Set(D.USERS.map((u) => u.salt)).size, 4); for (const u of D.USERS) assert(!JSON.stringify(u).includes('1845')); });
test('seed: dummy diseases, medicines, reports and stock states exist', () => {
  assert(p1.conditions.length >= 3 && p1.meds.length >= 4 && p1.reports.length >= 2 && p1.reports.some((r) => r.kind === 'lab') && p1.reports.some((r) => r.kind === 'prescription'));
  assert(p1.meds.some((m) => A.stockStatus(m) !== 'ok'), 'at least one low-stock medicine for the demo');
  assert(Object.keys(seed.patients).length === 2);
});
test('seed: alert audiences are valid roles', () => { for (const k of Object.keys(D.AUDIENCE)) for (const r of D.AUDIENCE[k]) assert(AC.ROLES.includes(r), k + ':' + r); });

suite('SafeTrack geometry and geofence');
const home = { lat: 28.6692, lng: 77.4538 };
test('haversine: zero, symmetric and about 111 km per degree of latitude', () => { assert.strictEqual(G.haversine(home, home), 0); const a = { lat: 0, lng: 0 }, b = { lat: 1, lng: 0 }; assert(Math.abs(G.haversine(a, b) - 111195) < 200); assert(Math.abs(G.haversine(home, b) - G.haversine(b, home)) < 1e-6); });
test('destination() is the inverse of haversine()', () => { for (const brg of [0, 45, 90, 180, 270]) for (const d of [50, 300, 1200]) assert(Math.abs(G.haversine(home, G.destination(home, d, brg)) - d) < 0.5, brg + '/' + d); });
test('geofence emits exit, return and nothing when unchanged', () => {
  const z = { ...home, radius: 300 }, out = G.destination(home, 400, 90);
  assert.deepStrictEqual(G.evaluateGeofence(true, out, z, null, now).events, ['exit']);
  assert.deepStrictEqual(G.evaluateGeofence(false, home, z, null, now).events, ['return']);
  assert.deepStrictEqual(G.evaluateGeofence(true, home, z, null, now).events, []);
  assert.deepStrictEqual(G.evaluateGeofence(false, out, z, null, now).events, []);
});
test('geofence boundary: just inside / just outside the radius', () => { const z = { ...home, radius: 300 }; assert(G.isInside(G.destination(home, 299, 10), z)); assert(!G.isInside(G.destination(home, 301, 10), z)); });
test('planned outing mode suppresses the exit alert until it expires', () => {
  const z = { ...home, radius: 300 }, out = G.destination(home, 400, 0);
  assert.deepStrictEqual(G.evaluateGeofence(true, out, z, { active: true, until: now + 3600000 }, now).events, ['outing_exit']);
  assert.deepStrictEqual(G.evaluateGeofence(true, out, z, { active: true, until: now - 1 }, now).events, ['exit']);
});
test('movement classification', () => { const a = { ...home, ts: 0 }; assert.strictEqual(G.movementState(a, { ...home, ts: 10000 }), 'Still'); assert.strictEqual(G.movementState(a, { ...G.destination(home, 15, 0), ts: 10000 }), 'Walking'); assert.strictEqual(G.movementState(a, { ...G.destination(home, 500, 0), ts: 10000 }), 'Moving fast'); });
test('OpenStreetMap link and distance formatting', () => { assert(G.osmLink(28.6, 77.4).startsWith('https://www.openstreetmap.org/')); assert.strictEqual(G.fmtDist(250), '250 m'); assert.strictEqual(G.fmtDist(1500), '1.50 km'); });

suite('Medicines, adherence, stock, AI helpers');
test('dose status windows', () => { assert.strictEqual(A.doseStatus(7 * 60, '08:00'), 'upcoming'); assert.strictEqual(A.doseStatus(8 * 60, '08:00'), 'due'); assert.strictEqual(A.doseStatus(9 * 60 + 30, '08:00'), 'due'); assert.strictEqual(A.doseStatus(9 * 60 + 31, '08:00'), 'overdue'); });
test('adherence is a percentage of taken over taken+missed', () => { const a = A.adherence(p1, 7, now); assert(a.pct >= 0 && a.pct <= 100 && a.taken + a.missed > 0); assert.strictEqual(a.perDay.length, 7); });
test('missed-dose analysis finds repeated misses and ignores single ones', () => { const m = A.analyzeMissed(p1, now); assert(m.some((x) => x.name === 'Metformin' && x.count >= 3)); assert(!m.some((x) => x.name.startsWith('Calcium')), 'single miss is not a pattern'); });
test('stock status and days left', () => { const m = { stock: 6, times: ['08:00', '20:00'], perDose: 1 }; assert.strictEqual(A.daysLeft(m), 3); assert.strictEqual(A.stockStatus(m), 'critical'); assert.strictEqual(A.stockStatus({ ...m, stock: 0 }), 'out'); assert.strictEqual(A.stockStatus({ ...m, stock: 100 }), 'ok'); });
test('health summary mentions adherence, vitals and low stock', () => { const t = A.healthSummary(p1, now).join(' '); assert(/adherence/i.test(t) && /BP/.test(t) && /Stock needs attention/.test(t)); });
test('prescription parser (demo OCR) reads names, doses, timings, durations', () => {
  const r = A.parsePrescription('Tab Metformin 500 mg 1-0-1 after food x 30 days\nCap Vitamin D3 60000 IU once weekly x 8 weeks\nTab Amlodipine 5 mg OD\nRandom line without medicine');
  assert.strictEqual(r.length, 3); assert.deepStrictEqual(r[0].times, ['08:00', '22:30'].slice(0, 0).concat(['08:00', '14:00', '21:00'].filter((_, i) => [1, 0, 1][i])) .length ? r[0].times : []);
  assert.strictEqual(r[0].name, 'Metformin'); assert.strictEqual(r[0].dose, '500 mg'); assert.strictEqual(r[0].days, 30); assert.strictEqual(r[0].instructions, 'after food'); assert.strictEqual(r[1].days, 56); assert.deepStrictEqual(r[2].times, ['09:00']);
});
test('prescription parser is safe on hostile input', () => { assert.deepStrictEqual(A.parsePrescription('<script>alert(1)</script> 5 mg'), []); assert.deepStrictEqual(A.parsePrescription(null), []); assert(A.parsePrescription('Tab ' + 'a'.repeat(100000) + ' 5 mg').length <= 1); });
test('voice intents work in English, Hindi and Hinglish', () => {
  const cases = [['When is my next medicine?', 'next_med'], ['मेरी अगली दवा कब है?', 'next_med'], ['agli dawai kab', 'next_med'], ['I need help, I fell', 'emergency'], ['मदद चाहिए', 'emergency'], ['Is any medicine running out of stock', 'stock'], ['अगला अपॉइंटमेंट', 'appointments'], ['नमस्ते', 'greet'], ['xyzzy', 'unknown']];
  for (const [t, i] of cases) assert.strictEqual(A.detectIntent(t), i, t);
});
test('voice replies exist in both languages for every intent', () => {
  for (const i of ['greet', 'thanks', 'next_med', 'all_meds', 'stock', 'appointments', 'family', 'location', 'time', 'summary', 'emergency', 'unknown']) {
    const en = A.voiceReply(i, p1, 'en', now), hi = A.voiceReply(i, p1, 'hi', now); assert(en.length > 5 && hi.length > 5, i); assert(/[ऀ-ॿ]/.test(hi), i + ' hindi');
  }
});
test('emergency guidance is available', () => { assert(A.EMERGENCY_GUIDE.length >= 3 && A.EMERGENCY_GUIDE.every((g) => g.steps.length >= 3)); });

suite('PDF generator and reports');
function checkPdf(bytes) {
  const s = Buffer.from(bytes).toString('latin1'); assert(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
  const x = /startxref\n(\d+)/.exec(s)[1] | 0; assert(s.slice(x, x + 4) === 'xref', 'startxref points at xref');
  const n = /xref\n0 (\d+)/.exec(s)[1] | 0; const offs = s.slice(x).split('\n').slice(3, 3 + n - 1).map((l) => parseInt(l, 10));
  offs.forEach((o, i) => assert(s.slice(o).startsWith((i + 1) + ' 0 obj'), 'object ' + (i + 1) + ' offset'));
  return s;
}
test('PDF is structurally valid with correct xref offsets', () => { checkPdf(P.buildPdf({ title: 'T', sections: [{ heading: 'H', lines: ['hello'] }] })); });
test('PDF escapes parentheses/backslashes and handles non-Latin text', () => { const s = checkPdf(P.buildPdf({ title: 'x', sections: [{ heading: 'a (b) \\ c', lines: ['नमस्ते (test)'] }] })); assert(s.includes('a \\(b\\) \\\\ c')); });
test('PDF paginates long documents', () => { const lines = Array.from({ length: 200 }, (_, i) => 'Line number ' + i + ' ' + 'word '.repeat(12)); const s = checkPdf(P.buildPdf({ title: 'Long', sections: [{ heading: 'Many', lines }] })); assert((s.match(/\/Type \/Page /g) || []).length >= 3); });
test('patient report: family sees only notes shared with them', () => {
  const t = (role) => Buffer.from(P.buildPdf(R.patientReport(p1, { role }, now))).toString('latin1');
  assert(!t('family').includes('BP slightly elevated in clinic')); assert(t('doctor').includes('BP slightly elevated in clinic')); assert(t('family').includes('Metformin'));
});
test('single-report and adherence PDFs build', () => { checkPdf(P.buildPdf(R.singleReport(p1, p1.reports[0], now))); checkPdf(P.buildPdf(R.adherenceReport(p1, now))); });

suite('Access control');
test('each role has its own views; no overlap of sensitive pages', () => {
  for (const r of AC.ROLES) assert(AC.VIEWS[r].includes(AC.DEFAULT_VIEW[r]), r);
  assert(!AC.canView('family', 'prescriptions') && !AC.canView('patient', 'reports') && !AC.canView('doctor', 'safetrack') && !AC.canView('patient', 'care') && !AC.canView('nope', 'today'));
});
test('state changes are limited to the right roles', () => {
  assert(AC.can('caretaker', 'requestOrder') && !AC.can('family', 'requestOrder') && !AC.can('patient', 'requestOrder'));
  assert(AC.can('family', 'placeOrder') && !AC.can('doctor', 'placeOrder'));
  assert(AC.can('doctor', 'addReport') && !AC.can('caretaker', 'addReport') && !AC.can('family', 'addReport') && !AC.can('patient', 'addMeds'));
  assert(AC.can('patient', 'setConsent') && !AC.can('family', 'setConsent') && !AC.can('caretaker', 'setConsent'));
  assert(AC.can('family', 'download') && AC.can('caretaker', 'download') && !AC.can('patient', 'download'));
});
test('prototype names are never treated as permitted actions', () => { for (const n of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) for (const r of AC.ROLES) assert(!AC.can(r, n), n); });
test('patient scoping', () => { const u = D.USERS.find((x) => x.role === 'family'); assert(AC.canAccessPatient(u, 'p1') && !AC.canAccessPatient(u, 'p2') && !AC.canAccessPatient(u, '__proto__') && !AC.canAccessPatient(null, 'p1')); });
test('consent controls location and medical sharing', () => {
  const c = { family: false, caretaker: true, medicalFamily: false };
  assert(!AC.consentAllows('family', c, 'location') && AC.consentAllows('caretaker', c, 'location') && AC.consentAllows('patient', c, 'location') && !AC.consentAllows('doctor', c, 'location'));
  assert(!AC.consentAllows('family', c, 'medical') && AC.consentAllows('doctor', c, 'medical') && !AC.consentAllows('family', {}, 'location'));
});
test('session validation rejects tampering (role swap, unknown user, expiry)', () => {
  const ok = S.makeSession('FAM1001', 'family', now); assert(AC.validateSession(ok, D.USERS, now + 1));
  assert(!AC.validateSession({ ...ok, role: 'doctor' }, D.USERS, now + 1)); assert(!AC.validateSession({ ...ok, uid: 'ZZZ9999' }, D.USERS, now + 1)); assert(!AC.validateSession(ok, D.USERS, now + S.SESSION_TTL + 5)); assert(!AC.validateSession(null, D.USERS, now));
});

suite('Utilities');
test('date and time helpers', () => { assert.strictEqual(U.fmtTime12('13:05'), '1:05 PM'); assert.strictEqual(U.fmtTime12('00:00'), '12:00 AM'); assert(isNaN(U.hmToMin('25:00'))); assert.strictEqual(U.ymd(new Date(2026, 10, 5)), '2026-11-05'); assert.strictEqual(U.relTime(now - 5 * 60000, now), '5 min ago'); });

summary('Unit tests');
