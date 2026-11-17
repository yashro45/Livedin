/*
 * LivedIn - end-to-end click-through (Playwright + Chromium).
 * Signs in as every role with the auto-fill button, opens every page, presses every working button
 * flow (medicines, stock, SOS, geofence, device, reports/PDF, voice, consent) and checks for errors.
 * Run: node tests/e2e.js   (needs `playwright`; set NODE_PATH if installed globally)
 */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('SKIP e2e: playwright not installed'); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });

let passed = 0, failed = 0; const fails = [];
const ok = (c, name) => { if (c) { passed++; console.log('  ok   ' + name); } else { failed++; fails.push(name); console.log('  FAIL ' + name); } };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(ctx) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource|net::|blocked|integrity|Refused to (load|apply)|fonts|leaflet|unpkg/i.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => d.accept());
    return page;
  }
  async function login(page, role) {
    await page.goto(base + '/login.html'); await page.click('#roleOpts label:has(input[value=' + role + '])');
    await page.click('#autofill'); await page.click('#submit'); await page.waitForURL('**/app.html'); await page.waitForSelector('#view h1');
  }
  const go = async (page, v) => { await page.evaluate((x) => { location.hash = '#/' + x; }, v); await page.waitForTimeout(120); };
  const txt = (page) => page.locator('#view').innerText();
  const toast = (page) => page.locator('#toasts').innerText();
  const clickAct = async (page, sel) => { await page.click(sel); await page.waitForTimeout(150); };

  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, permissions: [] });
  const VIEWS = { patient: ['today', 'assistant', 'emergency', 'appointments', 'safety', 'privacy'], family: ['overview', 'safetrack', 'medicines', 'health', 'appointments', 'reports', 'alerts', 'contact', 'device'], caretaker: ['patients', 'care', 'medicines', 'safetrack', 'appointments', 'reports', 'alerts', 'device', 'contact'], doctor: ['patients', 'overview', 'reports', 'medicines', 'appointments', 'notes', 'adherence'] };

  console.log('Login page');
  {
    const page = await newPage(ctx); await page.goto(base + '/login.html');
    await page.fill('#uid', 'PAT1001'); await page.fill('#pw', 'wrong'); await page.click('#submit');
    ok(/Invalid/.test(await page.locator('#msg').innerText()), 'wrong password is rejected');
    for (let i = 0; i < 4; i++) { await page.fill('#pw', 'bad' + i); await page.click('#submit'); await page.waitForTimeout(40); }
    ok(await page.locator('#submit').isDisabled(), 'account locks after repeated failures');
    await page.evaluate(() => localStorage.clear()); await page.close();
    const p2 = await newPage(ctx); await p2.goto(base + '/app.html'); await p2.waitForURL('**/login.html**'); ok(true, 'dashboard redirects to login without a session'); await p2.close();
  }

  for (const role of Object.keys(VIEWS)) {
    console.log('Role: ' + role);
    const page = await newPage(ctx); await login(page, role);
    for (const v of VIEWS[role]) { await go(page, v); const t = await txt(page); ok(t.length > 40 && !/Something went wrong/.test(t), role + ' / ' + v + ' renders');
      const unnamed = await page.evaluate(() => [...document.querySelectorAll('#view button, #view a[href], #view input:not([type=hidden]), #view select, #view textarea')].filter((el) => el.offsetParent !== null).filter((el) => { const n = (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').trim(); const lab = el.labels && el.labels.length; const lb = el.getAttribute('aria-labelledby'); return !n && !lab && !lb; }).map((el) => el.outerHTML.slice(0, 70)));
      ok(unnamed.length === 0, role + ' / ' + v + ' every control has an accessible name' + (unnamed.length ? ': ' + unnamed[0] : '')); }
    // other roles' pages are refused
    const foreign = Object.keys(VIEWS).filter((r) => r !== role).flatMap((r) => VIEWS[r]).find((v) => !VIEWS[role].includes(v));
    await go(page, foreign); ok(await page.locator('#nav [aria-current=page]').getAttribute('data-view') !== foreign, role + ' cannot open ' + foreign);
    await page.close();
  }

  console.log('Patient flows');
  {
    const page = await newPage(ctx); await login(page, 'patient'); await go(page, 'today');
    const before = await page.locator('.dose.taken').count();
    await clickAct(page, '.dose:not(.taken) button[data-action=markDose]');
    ok((await page.locator('.dose.taken').count()) === before + 1, 'patient can mark a dose as taken');
    await clickAct(page, 'button.sos-btn'); ok(/SOS sent/.test(await txt(page)) && /SOS/.test(await toast(page)), 'SOS button sends an alert');
    await clickAct(page, '[data-action=ackSos]'); ok(!/SOS sent/.test(await txt(page)), 'SOS can be cancelled');
    await go(page, 'assistant'); await page.fill('#askText', 'When is my next medicine?'); await page.click('form[data-form=ask] button[type=submit]'); await page.waitForTimeout(150);
    ok(/Your next medicine|finished all/.test(await page.locator('#chatLog').innerText()), 'voice assistant answers in English');
    await clickAct(page, '[data-action=lang][data-l=hi]'); await clickAct(page, '[data-action=ask]'); ok(/[ऀ-ॿ]/.test(await page.locator('#chatLog').innerText()), 'voice assistant answers in Hindi');
    await go(page, 'privacy'); await page.click('label.switch:has(#cs-family)'); await page.waitForTimeout(150); ok(/Off/.test(await page.locator('label.switch:has(#cs-family)').innerText()), 'consent toggle switches off');
    await go(page, 'safety'); await page.click('[data-action=outing][data-h="2"]'); await page.waitForTimeout(150); ok(/Outing mode on/.test(await txt(page)), 'planned outing mode');
    await page.close();
  }

  console.log('Family flows (consent was turned off in the shared store by the patient)');
  {
    const page = await newPage(ctx); await login(page, 'family'); await go(page, 'safetrack');
    ok(/Location is private/.test(await txt(page)), 'family cannot see location when consent is withdrawn');
    await go(page, 'overview'); ok(/Private/.test(await page.locator('.stat').first().innerText()), 'overview hides location when consent is off');
    await page.evaluate(() => { const k = 'livedin_state_v' + LI.VERSION; const s = JSON.parse(localStorage.getItem(k)); s.patients.p1.consent.family = true; localStorage.setItem(k, JSON.stringify(s)); location.reload(); });
    await page.waitForSelector('#view h1'); await go(page, 'safetrack'); ok(await page.locator('#mapSlot').count() === 1, 'map appears once consent is on');
    // the patient left outing mode on earlier; end it so a normal leave-zone alert can be tested
    if (await page.locator('[data-action=outing][data-h="0"]').count()) await clickAct(page, '[data-action=outing][data-h="0"]');
    // geofence: move out in demo mode
    await clickAct(page, '[data-action=simOut]'); ok(/Outside safe zone/.test(await txt(page)), 'walking out of the safe zone is detected');
    await go(page, 'alerts'); ok(/Left the safe zone/.test(await txt(page)), 'family receives geofence-exit alert');
    await go(page, 'safetrack'); await clickAct(page, '[data-action=simHome]'); await go(page, 'alerts'); ok(/Back in the safe zone/.test(await txt(page)), 'family receives return alert');
    await go(page, 'safetrack'); await page.click('[data-action=outing][data-h="1"]'); await page.waitForTimeout(150); await clickAct(page, '[data-action=simOut]');
    await go(page, 'alerts'); const n1 = await page.locator('.alert:has-text("Left the safe zone")').count();
    await go(page, 'safetrack'); await clickAct(page, '[data-action=outing][data-h="0"]'); await clickAct(page, '[data-action=simHome]');
    ok(n1 === 1, 'planned outing mode suppresses a new leave-zone alert');
    await go(page, 'device'); ok(/SIMULATED/i.test(await txt(page)), 'device page is clearly labelled simulated');
    await page.fill('#batt', '15'); await page.dispatchEvent('#batt', 'input'); await page.dispatchEvent('#batt', 'change'); await page.waitForTimeout(200);
    await go(page, 'alerts'); ok(/Low device battery/.test(await txt(page)), 'low-battery alert is raised');
    await go(page, 'device'); await clickAct(page, '[data-action=online]'); await go(page, 'alerts'); ok(/Device offline/.test(await txt(page)), 'device-offline alert is raised');
    await go(page, 'device'); await clickAct(page, '[data-action=online]');
    await clickAct(page, '[data-action=openBox]'); await clickAct(page, '[data-action=closeBox]'); ok(/smart box|Box closed/.test(await toast(page)), 'medicine box open/close simulation');
    await go(page, 'medicines'); ok(/Order requested|Order now|Running low|Almost out/.test(await txt(page)), 'family sees stock levels');
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await go(page, 'reports'); await page.click('[data-action=downloadFull]'); })()]);
    const buf = fs.readFileSync(await dl.path()); ok(buf.slice(0, 5).toString() === '%PDF-' && buf.length > 1500, 'family can download the full report as PDF');
    await go(page, 'overview'); await clickAct(page, '[data-action=genDaily]'); ok(/Daily summary created/.test(await toast(page)), 'daily family summary can be generated');
    await go(page, 'contact'); await page.fill('#msgText', 'Please remind her to drink water.'); await page.click('form[data-form=message] button[type=submit]'); await page.waitForTimeout(120); ok(/Message sent/.test(await toast(page)), 'family can message the care team');
    await page.close();
  }

  console.log('Caretaker -> family stock notification flow');
  {
    const care = await newPage(ctx); await login(care, 'caretaker');
    await go(care, 'patients'); await clickAct(care, '[data-action=selectPatient][data-pid=p1]'); ok(/Care today/.test(await txt(care)), 'caretaker opens a patient');
    await clickAct(care, 'input[data-change=task]'); await go(care, 'care');
    await care.fill('#vSys', '150'); await care.fill('#vDia', '90'); await care.fill('#vSug', '140'); await care.fill('#vPul', '80'); await care.click('form[data-form=addVitals] button[type=submit]'); await care.waitForTimeout(150);
    ok(/Condition recorded/.test(await toast(care)), 'caretaker records patient condition');
    await care.fill('#cnText', 'She ate well today.'); await care.click('form[data-form=addCareNote] button[type=submit]'); await care.waitForTimeout(120); ok(/She ate well/.test(await txt(care)), 'caretaker adds a note for family');
    if (await care.locator('[data-action=markDose]').count()) { await clickAct(care, '[data-action=markDose]'); ok(/Dose confirmed/.test(await toast(care)), 'caretaker confirms medicine administration'); }
    else ok(/Taken/.test(await txt(care)), 'caretaker sees every dose already confirmed');
    await go(care, 'medicines');
    const btn = care.locator('[data-action=requestOrder]').first(); ok(await btn.count() > 0, 'caretaker sees "going out of stock" button for low medicine');
    await btn.click(); await care.waitForTimeout(150); ok(/family has been notified/i.test(await toast(care)), 'caretaker sends out-of-stock notification');
    // family opens and sees notification + can order
    const fam = await newPage(ctx); await login(fam, 'family'); await go(fam, 'alerts'); ok(/Please order/.test(await txt(fam)), 'family receives the out-of-stock notification');
    await go(fam, 'medicines'); await clickAct(fam, '[data-action=placeOrder]'); ok(/Order placed/.test(await toast(fam)), 'family can order the medicine');
    await clickAct(fam, '[data-action=openReceive]'); await fam.click('form[data-form=receive] button[type=submit]'); await fam.waitForTimeout(150); ok(/Stock updated/.test(await toast(fam)), 'stock can be marked as received');
    await go(care, 'care'); await clickAct(care, '[data-action=emergencyDlg]'); await care.click('form[data-form=emergency] button[type=submit]'); await care.waitForTimeout(150); ok(/Emergency alert sent/.test(await toast(care)), 'caretaker can report an emergency');
    await go(care, 'reports'); const [dl] = await Promise.all([care.waitForEvent('download'), care.click('[data-action=downloadReport]')]); ok(fs.readFileSync(await dl.path()).slice(0, 5).toString() === '%PDF-', 'caretaker can download a report as PDF');
    await care.close(); await fam.close();
  }

  console.log('Doctor flows');
  {
    const page = await newPage(ctx); await login(page, 'doctor'); await go(page, 'patients'); await clickAct(page, '[data-action=selectPatient][data-pid=p1]');
    ok(/Complete picture/.test(await txt(page)), 'doctor sees everything about the patient');
    await go(page, 'reports');
    await page.fill('#labTitle', 'Complete blood count'); await page.fill('#labSum', 'Hb 11.8 g/dL (mildly low). WBC normal.'); await page.selectOption('#labFlag', 'attention');
    await page.click('form[data-form=addLab] button[type=submit]'); await page.waitForTimeout(150); ok(/Complete blood count/.test(await txt(page)), 'doctor uploads a lab report');
    await clickAct(page, '[data-action=sampleRx]'); ok(/Extracted 4 medicine/.test(await page.locator('#rxOut').innerText()), 'prescription OCR extracts medicines');
    await page.click('form[data-form=addRx] button[type=submit]'); await page.waitForTimeout(200); ok(/Prescription saved/.test(await toast(page)), 'prescription is saved');
    await go(page, 'medicines'); ok(/Vitamin D3/.test(await txt(page)), 'prescription updated the medicine schedule');
    await clickAct(page, '[data-action=editMed]'); await page.fill('#emT', '07:30, 19:30'); await page.click('form[data-form=updateMed] button[type=submit]'); await page.waitForTimeout(150); ok(/Schedule updated/.test(await toast(page)), 'doctor edits a medicine schedule');
    await clickAct(page, '[data-action=addMedDlg]'); await page.fill('#mdN', 'Paracetamol'); await page.fill('#mdD', '650 mg'); await page.click('form[data-form=addMed] button[type=submit]'); await page.waitForTimeout(150); ok(/Paracetamol/.test(await txt(page)), 'doctor adds a medicine');
    await go(page, 'appointments'); await clickAct(page, '[data-action=newAppt]'); await page.fill('#apT', 'BP check'); await page.click('form[data-form=newAppt] button[type=submit]'); await page.waitForTimeout(150); ok(/BP check/.test(await txt(page)), 'doctor schedules an appointment');
    await go(page, 'notes'); await page.fill('#ccText', 'Review diet in two weeks.'); await page.check('#ccShared'); await page.click('form[data-form=addConsult] button[type=submit]'); await page.waitForTimeout(150); ok(/Review diet/.test(await txt(page)), 'doctor adds a consultation note');
    await go(page, 'adherence'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=downloadAdherence]')]); ok(fs.readFileSync(await dl.path()).slice(0, 5).toString() === '%PDF-', 'doctor downloads adherence report');
    await page.close();
  }

  console.log('Security checks in the browser');
  {
    const page = await newPage(ctx); await login(page, 'caretaker'); await go(page, 'care');
    await page.fill('#cnText', '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>'); await page.click('form[data-form=addCareNote] button[type=submit]'); await page.waitForTimeout(200);
    ok(!(await page.evaluate(() => window.__xss)), 'script injected through a note is not executed');
    ok((await page.locator('#view').innerText()).includes('<img src=x'), 'injected markup is shown as plain text');
    const r = await page.evaluate(() => { try { LI.actions.constructor; return Object.prototype.hasOwnProperty.call(LI.actions, 'constructor'); } catch (e) { return false; } });
    ok(r === false, 'handler table has no inherited entry points');
    await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('livedin_session')); s.role = 'doctor'; sessionStorage.setItem('livedin_session', JSON.stringify(s)); });
    await page.goto(base + '/app.html'); await page.waitForURL('**/login.html**'); ok(true, 'tampered session role is rejected');
    await page.close();
  }

  console.log('Mobile layout');
  {
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } }); const page = await newPage(m); await login(page, 'patient');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); ok(!overflow, 'no horizontal scroll on a phone screen');
    await page.click('#menuBtn'); ok(await page.locator('#nav .nav-a').first().isVisible(), 'mobile menu opens');
    await m.close();
  }

  ok(errors.length === 0, 'no JavaScript errors during the whole run' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); if (failed) { console.log(fails.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
