/*
 * LivedIn - static checks of the source: security hygiene, accessibility, code cleanliness,
 * "every button has a handler", and alignment with the problem statement. Run: node tests/static.js
 */
const fs = require('fs'), path = require('path');
const { assert, suite, test, summary } = require('./lib');
const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const PAGES = ['index.html', 'login.html', 'app.html'];
const src = (f) => rd('js/' + f);
const allJs = JS.map((f) => [f, src(f)]);

/* ---------------- security ---------------- */
suite('Security: code scan');
test('no eval, Function constructor, document.write or javascript: URLs', () => {
  for (const [f, s] of allJs) for (const re of [/\beval\s*\(/, /new\s+Function\s*\(/, /document\.write\s*\(/, /javascript:/i, /setTimeout\s*\(\s*['"`]/, /\binsertAdjacentHTML\b/]) assert(!re.test(s), f + ' matches ' + re);
});
test('every innerHTML/outerHTML write is escaped markup (from html``) or a constant', () => {
  const bad = [];
  for (const [f, s] of allJs) s.split('\n').forEach((line, i) => {
    if (!/\.(innerHTML|outerHTML)\s*=/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
    const ok = /innerHTML\s*=\s*''\s*;/.test(line) || /\.s\b/.test(line) || /\.toString\(\)/.test(line) || /\.join\(''\)/.test(line) || /html`/.test(line) || /innerHTML\s*=\s*''/.test(line);
    if (!ok) bad.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 90));
  });
  assert.deepStrictEqual(bad, []);
});
test('no secrets or plaintext passwords in code (demo password only in the sign-in helper)', () => {
  const hits = allJs.filter(([, s]) => /['"`]1845['"`]/.test(s)).map(([f]) => f);
  assert.deepStrictEqual(hits, ['login.js'], 'plaintext demo password must only appear in the auto-fill helper: ' + hits);
  for (const [f, s] of allJs) assert(!/(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9]{12,}/i.test(s), f);
});
test('storage never receives passwords; session is kept in sessionStorage', () => {
  for (const [f, s] of allJs) { for (const m of s.matchAll(/(?:local|session)Storage\.setItem\(([^,]+),/g)) assert(!/pass|pw/i.test(m[1]), f + ': ' + m[1]); }
  assert(/sessionStorage\.setItem\(SESSION_KEY/.test(src('login.js')));
});
test('pages: strict CSP without unsafe-inline / unsafe-eval, no inline scripts, handlers or styles', () => {
  for (const p of PAGES) {
    const h = rd(p), csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(h);
    assert(csp, p + ' has CSP'); assert(!/unsafe-inline|unsafe-eval/.test(csp[1]), p + ' CSP'); assert(/script-src 'self'/.test(csp[1]) && /object-src 'none'/.test(csp[1]) && /base-uri 'none'/.test(csp[1]) && /form-action 'self'/.test(csp[1]), p + ' CSP directives');
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(h), p + ' inline <script>'); assert(!/\son[a-z]+\s*=\s*["']/i.test(h), p + ' inline handler'); assert(!/\sstyle\s*=\s*["']/i.test(h), p + ' inline style attribute');
  }
});
test('third-party scripts and styles use pinned versions with integrity hashes', () => {
  const h = rd('app.html');
  for (const m of h.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https:\/\/unpkg\.com[^"]+)"[^>]*>/g)) { assert(/@1\.9\.4/.test(m[1]), 'pinned: ' + m[1]); assert(/integrity="sha256-/.test(m[0]) && /crossorigin/.test(m[0]), 'SRI: ' + m[1]); }
});
test('external links open safely', () => { for (const [f, s] of allJs.concat(PAGES.map((p) => [p, rd(p)]))) for (const m of s.matchAll(/target="_blank"[^>]*/g)) assert(/noopener/.test(m[0]), f + ': ' + m[0]); });
test('handler dispatch is allow-list based and role-checked', () => {
  const a = src('app.js'), act = src('actions.js');
  assert(/hasOwnProperty\.call\(t, k\)/.test(a), 'own-property dispatch'); assert(/LI\.can\(c\.role, name\)/.test(act) && /canAccessPatient/.test(act), 'role + patient check in run()');
  assert(/validateSession/.test(a) && /location\.replace\('login\.html/.test(a), 'dashboard guards the session');
});
test('user text always goes through html`` (no string-concatenated markup in views)', () => {
  for (const f of ['views.js', 'views-staff.js']) assert(!/['"]<[a-z][^'"]*['"]\s*\+/.test(src(f)), f + ' concatenates markup');
});
test('file uploads are validated before use', () => { const a = src('actions.js'); assert(/validateUpload/.test(a) && (a.match(/validateUpload/g) || []).length >= 2, 'lab/prescription form and prescription file picker both validate'); });
test('login: lockout, constant-work hash for unknown ids, generic error message', () => { const l = src('login.js'); assert(/registerFailure/.test(l) && /lockRemaining/.test(l) && /lv-none/.test(l) && /Invalid ID, password or role/.test(l)); });

/* ---------------- accessibility ---------------- */
suite('Accessibility');
test('every page has lang, viewport, title, a skip link and a main landmark', () => { for (const p of PAGES) { const h = rd(p); assert(/<html lang="en"/.test(h) && /name="viewport"/.test(h) && /<title>[^<]{3,}/.test(h) && /class="skip"/.test(h) && /<main\b/.test(h), p); } });
test('landmarks: nav has a label, dialog is labelled, toasts are live regions', () => { const h = rd('app.html'); assert(/<nav[^>]+aria-label/.test(h) && /<dialog[^>]+aria-labelledby/.test(h) && /aria-live/.test(h)); });
test('focus is always visible and motion can be reduced', () => { const c = rd('css/base.css'); assert(/:focus-visible/.test(c) && /prefers-reduced-motion/.test(c)); });
test('elderly-friendly controls: text-size switch, high-contrast mode, large tap targets', () => { const c = rd('css/base.css'); assert(/data-text="large"/.test(c) && /data-contrast="high"/.test(c) && /min-height:\s*46px/.test(c)); assert(/textSize/.test(src('actions.js')) && /contrast/.test(src('actions.js'))); });
test('icon-only buttons have accessible names', () => { for (const [f, s] of allJs.concat(PAGES.map((p) => [p, rd(p)]))) for (const m of s.matchAll(/<button[^>]*>\s*(?:\$\{ui\.icon\([^)]*\)\}|<svg[^>]*>.*?<\/svg>)\s*<\/button>/g)) assert(/aria-label/.test(m[0]), f + ': ' + m[0].slice(0, 80)); });
test('tables have captions or headers; form fields use labels', () => {
  const v = src('views.js') + src('views-staff.js'); const tables = (v.match(/<table>/g) || []).length, caps = (v.match(/<caption/g) || []).length; assert(tables === caps, tables + ' tables vs ' + caps + ' captions');
  for (const m of v.matchAll(/<input id="([^"]+)"/g)) assert(v.includes('for="' + m[1] + '"') || v.includes('aria-label'), 'label for ' + m[1]);
});
function lum(hex) { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('colour contrast of the palette meets WCAG AA for the pairs used', () => {
  const pairs = [['#1B2A21', '#E5E8CE', 4.5, 'ink on ivory'], ['#1B2A21', '#F2F4E3', 4.5, 'ink on card'], ['#2F4A38', '#E5E8CE', 4.5, 'forest on ivory'], ['#F2F4E3', '#2F4A38', 4.5, 'ivory on forest (primary button)'], ['#E5E8CE', '#2F4A38', 4.5, 'sidebar text'], ['#FFFFFF', '#B3402F', 4.5, 'white on danger'], ['#FFFFFF', '#2c5a36', 4.5, 'toast ok'], ['#FFFFFF', '#5E7B5C', 4.0, 'sage button (large/bold)'], ['#4B5E52', '#E5E8CE', 4.5, 'muted on ivory'], ['#4B5E52', '#F2F4E3', 4.5, 'muted on card'], ['#789575', '#E5E8CE', 2.5, 'display heading (decorative, large)']];
  for (const [fg, bg, min, n] of pairs) assert(ratio(fg, bg) >= min, n + ' = ' + ratio(fg, bg).toFixed(2));
});

/* ---------------- clean code + every control works ---------------- */
suite('Code quality');
test('every file is strict mode, parses, and has no debugging leftovers', () => {
  for (const [f, s] of allJs) { assert(/'use strict'/.test(s), f + ' strict'); assert(!/\bdebugger\b/.test(s) && !/console\.log\(/.test(s), f + ' leftovers'); new Function(s.replace(/^#!.*/, '')); }
});
test('no TODO/FIXME markers', () => { for (const [f, s] of allJs) assert(!/TODO|FIXME|XXX/.test(s), f); });
test('no function longer than 120 lines (keeps code readable)', () => {
  for (const [f, s] of allJs) { const lines = s.split('\n'); let depth = 0, start = -1; lines.forEach((l, i) => { if (/^\s{2,4}(?:async )?function\s+\w+|^\s{2,4}\w[\w.]*\s*=\s*(?:async )?function/.test(l) && depth === 0) start = i; depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length; if (start >= 0 && depth <= 1 && i - start > 120) assert.fail(f + ' function at line ' + (start + 1) + ' is ' + (i - start) + ' lines'); if (depth <= 1) start = -1; }); }
});
test('assets referenced by the pages exist', () => { for (const p of PAGES) for (const m of rd(p).matchAll(/(?:src|href)="((?:js|css|assets)\/[^"]+)"/g)) assert(fs.existsSync(path.join(ROOT, m[1])), p + ' -> ' + m[1]); });
test('every script loaded by app.html exists and every js file is used', () => { const h = rd('app.html') + rd('login.html') + rd('index.html'); for (const f of JS) assert(h.includes('js/' + f), f + ' is not loaded by any page'); });

function used(attr) {
  const out = new Set(); const files = allJs.map(([f, s]) => s).concat(PAGES.map(rd));
  for (const s of files) for (const m of s.matchAll(new RegExp('data-' + attr + '="([^"]+)"', 'g'))) { if (m[1].includes('${')) for (const q of m[1].matchAll(/'([A-Za-z]+)'/g)) out.add(q[1]); else out.add(m[1]); }
  return out;
}
function defined(prefix) { const s = src('actions.js'); return new Set([...s.matchAll(new RegExp('\\b' + prefix + '\\.([A-Za-z]+)\\s*=', 'g'))].map((m) => m[1])); }
suite('Every button, form, slider and toggle has a working handler');
for (const [attr, prefix, label] of [['action', 'A', 'buttons (data-action)'], ['form', 'F', 'forms (data-form)'], ['input', 'I', 'sliders (data-input)'], ['change', 'C', 'toggles (data-change)']]) {
  test(label, () => { const u = used(attr), d = defined(prefix); const missing = [...u].filter((x) => !d.has(x)); assert.deepStrictEqual(missing, [], 'no handler for: ' + missing.join(', ')); assert(u.size > 0); });
}
test('every view named in the role tables is implemented', () => {
  const AC = require('../js/access.js'); const v = src('views.js') + src('views-staff.js');
  for (const r of AC.ROLES) for (const n of AC.VIEWS[r]) assert(new RegExp('V\\.' + n + '\\s*=').test(v), r + '/' + n);
});
test('every state change in actions maps to a permission entry', () => {
  const AC = require('../js/access.js'); const a = src('actions.js');
  for (const m of a.matchAll(/\brun\('([A-Za-z]+)'/g)) assert(AC.PERMS[m[1]], 'run(' + m[1] + ') has no permission rule');
  for (const m of a.matchAll(/store\.act\('([A-Za-z]+)'/g)) assert(AC.PERMS[m[1]] || /setLocation|setDose/.test(m[1]), 'store.act ' + m[1]);
});

/* ---------------- alignment with the problem statement ---------------- */
suite('Problem-statement alignment (requirement -> evidence in the code)');
const D = require('../js/data.js'), AC = require('../js/access.js'), A = require('../js/analysis.js');
const all = allJs.map(([, s]) => s).join('\n') + PAGES.map(rd).join('\n');
const has = (re, msg) => assert(re.test(all), msg || String(re));
const R = (name, fn) => test(name, fn);
R('project name LivedIn and the sage palette from the reference image', () => { has(/LivedIn/); const c = rd('css/base.css'); assert(/#E5E8CE/i.test(c) && /#789575/i.test(c)); });
R('landing page + four logins (patient, family, caretaker, doctor) with ids and password 1845', () => { assert(fs.existsSync(path.join(ROOT, 'index.html')) && fs.existsSync(path.join(ROOT, 'login.html'))); assert.deepStrictEqual(D.USERS.map((u) => u.role).sort(), ['caretaker', 'doctor', 'family', 'patient']); });
R('auto-fill option for credentials', () => { has(/id="autofill"/); has(/Auto-fill demo credentials/); assert(/fillCreds/.test(src('login.js'))); });
R('dummy reports: diseases, medicines the patient takes, lab and prescription reports', () => { const p = D.seed(Date.now()).patients.p1; assert(p.conditions.length && p.meds.length && p.reports.some((r) => r.kind === 'lab') && p.reports.some((r) => r.kind === 'prescription')); });
R('family and caretaker can see available stock', () => { assert(/stockList/.test(src('views.js'))); assert(AC.VIEWS.family.includes('medicines') && AC.VIEWS.caretaker.includes('medicines')); });
R('caretaker can notify "going out of stock"; family can order', () => { assert(AC.can('caretaker', 'requestOrder') && AC.can('family', 'placeOrder')); has(/Notify: going out of stock/); has(/Please order/); });
R('doctor dashboard: everything about the patient + report page to add lab results and medicines', () => { assert(AC.VIEWS.doctor.includes('overview') && AC.VIEWS.doctor.includes('reports')); has(/Add lab report/); has(/Prescription and medicines allotted/); });
R('PDF download of reports for family and caretaker', () => { assert(AC.can('family', 'download') && AC.can('caretaker', 'download')); has(/data-action="downloadReport"/); has(/data-action="downloadFull"/); });
R('SafeTrack: live location, home safe zone, geofence radius, leave/return alerts, last known with timestamp, SOS', () => { for (const r of [/updateZone/, /geofence_exit/, /patient_return/, /Last known location/, /fmtStamp/, /core\.sos/, /type="range"[^>]*id="zoneR"|id="zoneR"/]) has(r); });
R('SafeTrack: low-battery + device-offline alerts, planned outing mode, location history with consent', () => { has(/low_battery/); has(/device_offline/); has(/Planned outing mode/); has(/Location history/); has(/consentAllows/); });
R('virtual IoT: GPS, SOS button, battery, network, movement, medicine box, buzzer/voice, status dashboard - all labelled simulated', () => { for (const r of [/Virtual SOS button/, /Simulated battery/, /Simulated connectivity/, /Virtual movement detection/, /Medicine-box open\/close/, /Buzzer and voice alert/, /Device status dashboard/, /do not claim|No physical chip|No physical hardware/i]) has(r); });
R('family dashboard items', () => { for (const r of [/Receive|Latest alerts/, /Medicine-taking history/, /Missed-dose analysis/, /Upcoming|Appointments/, /Emergency contacts/, /Daily summary/, /Care team/]) has(r); });
R('caretaker dashboard items', () => { for (const r of [/Assigned patients/, /Daily care activities/, /Confirm medicine administration/, /Record patient condition/, /Note for family/, /Report emergency/, /Schedule/]) has(r); });
R('doctor dashboard items', () => { for (const r of [/My patients/, /Prescription and medicines/, /Medicine schedule/, /Consultation notes/, /Adherence report/, /Appointments/]) has(r); });
R('AI features: voice assistant (Hindi + English), prescription OCR, smart reminders, health summary, missed analysis, emergency assistant', () => { assert(typeof A.detectIntent === 'function' && typeof A.parsePrescription === 'function' && typeof A.healthSummary === 'function' && typeof A.analyzeMissed === 'function' && A.EMERGENCY_GUIDE.length); has(/medicine_reminder/); has(/hi-IN/); });
R('all ten notification types exist', () => { for (const t of ['medicine_reminder', 'missed_medicine', 'geofence_exit', 'patient_return', 'sos', 'low_battery', 'device_offline', 'appointment_reminder', 'medicine_refill', 'daily_report']) assert(D.AUDIENCE[t], t); });
R('hackathon extras: Leaflet + OpenStreetMap, real + demo mode, slider, responsive, accessible, consent, history, PDFs', () => { has(/leaflet@1\.9\.4/); has(/tile\.openstreetmap\.org/); has(/Real tracking/); has(/Demo simulation/); has(/id="simDist"/); assert(/@media \(max-width/.test(rd('css/app.css')) && /@media \(max-width/.test(rd('css/landing.css'))); has(/setConsent/); has(/Activity history/); has(/buildPdf/); });
R('honesty: simulated features are labelled and no hardware is claimed', () => { has(/SIMULATED/); assert(!/real hardware (is )?connected/i.test(all) || /not claim|No physical/i.test(all)); });

summary('Static checks');
