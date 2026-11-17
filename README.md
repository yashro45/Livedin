# LivedIn - Elderly care and medication management

A working, no-build web prototype: landing page, four role-based dashboards, SafeTrack location safety, a **simulated** smart device, on-device AI helpers, PDF reports and a test suite. Palette: Pale Sage Ivory `#E5E8CE` and Muted Forest Sage `#789575` (from the reference image), extended with deeper forest greens and warm alert tones.

## Run it

```bash
node server.js          # http://localhost:8080  (adds security headers; no npm install needed)
# or just double-click index.html
```

Internet is used only for Google Fonts and Leaflet/OpenStreetMap tiles. Without it the app still works (system fonts and a built-in canvas map).

## Demo logins (password for every role: `1845`)

| Role | ID | What they see |
|---|---|---|
| Patient | `PAT1001` | Today's medicines, SOS, Hindi/English voice assistant, emergency help, privacy/consent |
| Family | `FAM1001` | Location, alerts, medicine history and stock (can order), health, reports (PDF), contact |
| Caretaker | `CTK1001` | Assigned patients, daily care, confirm doses, record condition, notes, stock alerts, emergency report |
| Doctor | `DOC1001` | Full patient picture, lab reports and prescriptions (with demo OCR), medicine schedule, appointments, notes, adherence |

The sign-in page has **Auto-fill demo credentials** and one-tap demo account rows.

## Suggested 3-minute evaluation path

1. Sign in as **Caretaker** > Medicines & stock > **Notify: going out of stock**.
2. Open a second tab as **Family**: the alert appears live (cross-tab, no refresh) > **Order now** > **Mark received**.
3. Family > **SafeTrack** > **Walk outside zone**: geofence alert. Press **Planned outing** and walk out again: no alert.
4. Family > **Smart device**: SOS, battery to 15%, go offline, open/close the medicine box (all labelled **SIMULATED**).
5. Sign in as **Doctor** > Reports > **Demo OCR sample** > Extract > Save: the medicine schedule updates. Family and Caretaker can now download the PDF.
6. Patient > **Assistant**: ask "When is my next medicine?" or choose हिन्दी.

## Feature map

* **Landing page**: hero, roles, features, SafeTrack explainer, privacy section.
* **Medicines**: schedules, reminders, taken/missed history, repeated-miss analysis, stock levels, refill and out-of-stock flow.
* **SafeTrack**: Leaflet + OpenStreetMap map, home safe zone with radius, geofence exit/return alerts, last known location with timestamp, SOS sharing, planned outing mode, low-battery and offline alerts, consent-controlled location history, **Demo Simulation mode** (slider / click-the-map) and **Real Tracking mode** (browser GPS).
* **Virtual IoT chip (simulated)**: GPS, SOS button, battery, network, movement, medicine box, buzzer/voice alert, status dashboard.
* **AI helpers (rule-based, on-device)**: Hindi/English voice assistant (speech recognition where the browser supports it), prescription text extraction, smart reminders, AI health summary, missed-medicine analysis, emergency assistant.
* **Notifications**: all ten alert types, filtered per role, with a bell, toasts, sound and history.
* **Reports**: lab reports and prescriptions added by the doctor; PDF downloads (single report, full report, adherence) for family and caretaker.
* **Accessibility**: large text switch, high-contrast mode, 46 px+ tap targets, keyboard and screen-reader friendly, reduced-motion support, responsive down to phones.

## Tests

```bash
npm test            # unit + static + server tests, zero dependencies (Node 18+)
npm run test:e2e    # real-browser click-through (needs: npm i -D playwright && npx playwright install chromium)
```

| Suite | What it proves |
|---|---|
| `tests/unit.js` (49) | XSS encoding, input validation, SHA-256 vs Node crypto, lockout, sessions, geofence maths, adherence/missed analysis, prescription parser, voice intents (EN/HI), PDF validity, role permissions, consent, session tampering |
| `tests/static.js` (47) | No `eval`/inline scripts/handlers/styles, strict CSP + SRI, safe `innerHTML`, no secrets, WCAG contrast of the palette, accessible markup, code-quality rules, **every button/form/slider/toggle has a handler**, and a requirement-to-code checklist for the problem statement |
| `tests/server.test.js` (6) | Security headers, path traversal blocked, methods restricted, no source/test leakage |
| `tests/e2e.js` (119) | Every page for all four roles renders and every control has an accessible name; full flows (stock notification, geofence, SOS, device, reports, PDFs, voice, consent); XSS injection is inert; tampered session rejected; phone layout has no horizontal scroll |

## Security design

* Passwords are never stored in clear text: salted, iterated SHA-256 digests, constant-time comparison, same work for unknown IDs, generic error, 5-failure lockout.
* Sessions live in `sessionStorage`, expire (30 min) and are re-validated against the user table on every load; a swapped role is rejected.
* Role-based access on **views and on every state change**; patient scoping; patient-controlled consent for location and health sharing.
* All dynamic markup goes through an auto-escaping `html` template tag; uploads are checked for type, size and extension; user text is length-limited and control characters removed.
* Strict Content-Security-Policy (no inline script/style), Subresource-Integrity on third-party assets, `rel=noopener` on external links, handler dispatch by allow-list only.

## Honest limitations (please read)

* This is a **front-end prototype**: data is stored in the browser (`localStorage`), so "real-time" alerts work across tabs of the same browser, not across devices. A production system needs a server, database, real authentication (Argon2/bcrypt, MFA), TLS, audit logging and push/SMS gateways.
* The demo password is printed on the login page on purpose, for evaluation.
* Smart-device features are **simulations**. No physical hardware is connected or claimed.
* "AI" features are deterministic on-device rules. Prescription OCR reads typed or `.txt` prescriptions; photos/PDFs are attached as records (a real OCR engine would be plugged in for scans). Voice recognition depends on the browser (Chrome works best).
* All names, numbers and medical records are fictional. Not a medical device.
