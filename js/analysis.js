/*
 * LivedIn - rule-based "AI" helpers. These run fully on-device (no external model, no network).
 * They are deterministic so they can be unit-tested: missed-dose analysis, health summary,
 * prescription text parsing ("demo OCR"), and the bilingual voice-assistant intent engine.
 */
(function (root, factory) {
  const U = (typeof module === 'object' && module.exports) ? require('./util.js') : root.LI;
  const G = (typeof module === 'object' && module.exports) ? require('./geo.js') : root.LI;
  const api = factory(U, G);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function (U, G) {
  'use strict';

  /* ---------- schedule ---------- */
  const GRACE_BEFORE = 30, GRACE_AFTER = 90; // minutes

  function doseStatus(minNow, timeHM) {
    const t = U.hmToMin(timeHM);
    if (minNow < t - GRACE_BEFORE) return 'upcoming';
    if (minNow <= t + GRACE_AFTER) return 'due';
    return 'overdue';
  }
  /** All scheduled doses for a date with their logged/derived status. */
  function dosesForDate(p, dateStr, now) {
    const today = U.ymd(now), minNow = U.minOfDay(now), out = [];
    for (const m of p.meds) {
      if (!m.active || (m.since && m.since > dateStr)) continue;
      for (const time of m.times) {
        const entry = p.doseLog.find((e) => e.medId === m.id && e.date === dateStr && e.time === time);
        let status;
        if (entry) status = entry.status;
        else if (dateStr > today) status = 'upcoming';
        else if (dateStr === today) status = doseStatus(minNow, time);
        else status = 'none';
        out.push({ med: m, medId: m.id, name: m.name, dose: m.dose, perDose: m.perDose, time, date: dateStr, status, entry });
      }
    }
    return out.sort((a, b) => U.hmToMin(a.time) - U.hmToMin(b.time));
  }

  function adherence(p, days, now) {
    const perDay = [], perMed = {};
    let taken = 0, missed = 0;
    for (let i = days - 1; i >= 0; i--) {
      const date = U.ymd(U.addDays(now, -i));
      let t = 0, m = 0;
      for (const e of p.doseLog) {
        if (e.date !== date) continue;
        if (e.status === 'taken') t++; else if (e.status === 'missed') m++;
        const pm = perMed[e.medId] || (perMed[e.medId] = { taken: 0, missed: 0 });
        if (e.status === 'taken') pm.taken++; else if (e.status === 'missed') pm.missed++;
      }
      taken += t; missed += m; perDay.push({ date, taken: t, missed: m });
    }
    for (const k of Object.keys(perMed)) {
      const x = perMed[k]; x.pct = x.taken + x.missed ? Math.round((100 * x.taken) / (x.taken + x.missed)) : 100;
    }
    return { taken, missed, pct: taken + missed ? Math.round((100 * taken) / (taken + missed)) : 100, perDay, perMed };
  }

  /** Repeated missed doses of the same medicine+time within `window` days. */
  function analyzeMissed(p, now, window = 7, threshold = 2) {
    const since = U.ymd(U.addDays(now, -(window - 1))), groups = {};
    for (const e of p.doseLog) {
      if (e.status !== 'missed' || e.date < since) continue;
      const k = e.medId + '|' + e.time;
      (groups[k] = groups[k] || []).push(e.date);
    }
    const out = [];
    for (const k of Object.keys(groups)) {
      if (groups[k].length < threshold) continue;
      const [medId, time] = k.split('|');
      const med = p.meds.find((m) => m.id === medId); if (!med) continue;
      out.push({
        key: k + '|' + groups[k].length, medId, name: med.name, time, count: groups[k].length, dates: groups[k].sort(),
        text: med.name + ' (' + U.fmtTime12(time) + ') was missed ' + groups[k].length + ' times in the last ' + window + ' days.',
      });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  /* ---------- stock ---------- */
  const dailyUnits = (m) => Math.max(0.0001, m.times.length * m.perDose);
  const daysLeft = (m) => Math.floor(m.stock / dailyUnits(m));
  function stockStatus(m) {
    if (m.stock <= 0) return 'out';
    const d = daysLeft(m);
    return d <= 3 ? 'critical' : d <= 5 ? 'low' : 'ok';
  }

  /* ---------- AI health summary ---------- */
  function healthSummary(p, now) {
    const a7 = adherence(p, 7, now), lines = [];
    const v = p.vitals[p.vitals.length - 1];
    lines.push(p.name + ' (' + p.age + ') is being supported for ' + p.conditions.map((c) => c.name).join(', ') + '.');
    lines.push('Medicine adherence over the last 7 days is ' + a7.pct + '% (' + a7.taken + ' taken, ' + a7.missed + ' missed).');
    const pat = analyzeMissed(p, now);
    lines.push(pat.length ? 'Pattern noticed: ' + pat.map((x) => x.text).join(' ') : 'No repeated missed-dose pattern was detected.');
    if (v) lines.push('Latest recorded vitals (' + U.fmtDate(v.date) + '): BP ' + v.sys + '/' + v.dia + ' mmHg, sugar ' + v.sugar + ' mg/dL, pulse ' + v.pulse + ' bpm, mood: ' + v.mood + '.');
    const low = p.meds.filter((m) => m.active && stockStatus(m) !== 'ok');
    if (low.length) lines.push('Stock needs attention: ' + low.map((m) => m.name + ' (' + daysLeft(m) + ' days left)').join(', ') + '.');
    const next = p.appointments.filter((x) => x.status === 'scheduled' && x.date >= U.ymd(now)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
    if (next) lines.push('Next appointment: ' + next.title + ' with ' + next.with + ' on ' + U.fmtDateLong(next.date) + ' at ' + U.fmtTime12(next.time) + '.');
    lines.push('Summary generated by LivedIn on-device rules. It supports, but never replaces, medical advice.');
    return lines;
  }

  /* ---------- prescription parser ("demo OCR") ---------- */
  const FREQ = {
    od: ['09:00'], qd: ['09:00'], 'once daily': ['09:00'], bd: ['08:00', '20:00'], bid: ['08:00', '20:00'], 'twice daily': ['08:00', '20:00'],
    tds: ['08:00', '14:00', '21:00'], tid: ['08:00', '14:00', '21:00'], qid: ['08:00', '12:00', '16:00', '20:00'], hs: ['21:00'], sos: [],
  };
  const SLOTS = ['08:00', '14:00', '21:00', '22:30'];
  const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

  function parsePrescription(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
    const out = [];
    for (const raw of lines) {
      const doseM = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu)\b/i.exec(raw);
      const formM = /^(tab|cap|syp|inj|tablet|capsule|syrup)\b\.?\s*/i.exec(raw);
      if (/[<>{}]/.test(raw)) continue; // never treat markup-like lines as prescriptions
      if (!doseM && !formM) continue;
      let head = raw.slice(0, doseM ? doseM.index : raw.length).replace(/^(\d+[.)]\s*)/, '').replace(formM ? formM[0] : /$^/, '');
      head = head.replace(/[^A-Za-z \-+]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/^[A-Za-z][A-Za-z \-+]{1,40}$/.test(head)) continue;
      let times = null, conf = 'high';
      const pat = /\b([01])\s*-\s*([01])\s*-\s*([01])(?:\s*-\s*([01]))?\b/.exec(raw);
      if (pat) { times = [1, 2, 3, 4].filter((i) => pat[i] === '1').map((i) => SLOTS[i - 1]); }
      else {
        const k = Object.keys(FREQ).find((f) => new RegExp('\\b' + f + '\\b', 'i').test(raw));
        if (k) times = FREQ[k]; else { times = ['08:00']; conf = 'low'; }
      }
      const dur = /(?:x|for)\s*(\d{1,3})\s*(days?|d|weeks?|w)\b/i.exec(raw);
      const days = dur ? (+dur[1]) * (/^w/i.test(dur[2]) ? 7 : 1) : null;
      const ins = /(after|before|with)\s+(food|meals?)/i.exec(raw);
      out.push({
        name: titleCase(head), dose: doseM ? doseM[1] + ' ' + doseM[2].toLowerCase() : '', times, perDose: 1,
        days, instructions: ins ? ins[0].toLowerCase() : '', confidence: conf, raw: raw.slice(0, 120),
      });
    }
    return out;
  }

  /* ---------- bilingual voice assistant ---------- */
  const INTENTS = [
    ['emergency', /(emergency|help me|sos|ambulance|chest pain|fall|fell|मदद|बचाओ|आपातकाल|एम्बुलेंस|गिर|madad|bachao)/i],
    ['next_med', /(next (medicine|medication|dose|pill)|when.*(take|medicine|dose)|कब.*(दवा|दवाई)|अगली.*(दवा|दवाई)|kab.*(dawa|dawai)|agli (dawa|dawai))/i],
    ['all_meds', /(my (medicines|medications|pills)|which (medicine|pill)|what.*(medicine|pills)|कौन.*(दवा|दवाई)|मेरी.*(दवा|दवाइयाँ|दवाई)|meri (dawa|dawai)|konsi (dawa|dawai))/i],
    ['stock', /(stock|running out|refill|खत्म|स्टॉक|khatam)/i],
    ['appointments', /(appointment|doctor visit|checkup|check-up|अपॉइंटमेंट|डॉक्टर|डाक्टर|doctor kab|appointment kab)/i],
    ['family', /(call.*(son|family|daughter)|family|बेटा|परिवार|घर वाले|beta|parivar)/i],
    ['location', /(where am i|my location|location|कहाँ|कहां|लोकेशन|kahan)/i],
    ['time', /(what time|time is it|today.?s date|date today|समय|कितने बजे|तारीख|kitne baje)/i],
    ['summary', /(how am i|my health|health summary|सेहत|स्वास्थ्य|तबीयत|tabiyat|sehat)/i],
    ['greet', /^(?:(?:hi|hello|hey|namaste|namaskar)\b|नमस्ते|नमस्कार|हेलो)/i],
    ['thanks', /(thank|thanks|shukriya|dhanyavad|धन्यवाद|शुक्रिया)/i],
  ];
  function detectIntent(text) {
    const t = String(text || '').slice(0, 300);
    for (const [k, re] of INTENTS) if (re.test(t)) return k;
    return 'unknown';
  }
  function voiceReply(intent, p, lang, now, ctx) {
    const hi = lang === 'hi';
    const today = dosesForDate(p, U.ymd(now), now);
    const pending = today.filter((d) => d.status === 'upcoming' || d.status === 'due' || d.status === 'overdue');
    const next = pending[0];
    const nextAppt = p.appointments.filter((x) => x.status === 'scheduled' && x.date >= U.ymd(now)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    switch (intent) {
      case 'greet': return hi ? 'नमस्ते ' + p.name.split(' ')[0] + ' जी! मैं आपकी दवाइयों और सुरक्षा में मदद कर सकता हूँ।' : 'Hello ' + p.name.split(' ')[0] + '! I can help with your medicines, appointments and safety.';
      case 'thanks': return hi ? 'आपका स्वागत है। मैं हमेशा यहाँ हूँ।' : "You're welcome. I'm always here.";
      case 'next_med':
        if (!next) return hi ? 'आज की सभी दवाइयाँ पूरी हो चुकी हैं। बहुत अच्छा!' : "You've finished all of today's medicines. Well done!";
        return hi ? 'आपकी अगली दवा ' + next.name + ' ' + next.dose + ' है, समय ' + U.fmtTime12(next.time) + '।' : 'Your next medicine is ' + next.name + ' ' + next.dose + ' at ' + U.fmtTime12(next.time) + '.';
      case 'all_meds': {
        const list = p.meds.filter((m) => m.active).map((m) => m.name + ' ' + m.dose + ' (' + m.times.map(U.fmtTime12).join(', ') + ')');
        return (hi ? 'आपकी दवाइयाँ: ' : 'Your medicines: ') + list.join('; ') + '.';
      }
      case 'stock': {
        const low = p.meds.filter((m) => m.active && m.stock / dailyUnits(m) <= 5);
        if (!low.length) return hi ? 'सभी दवाइयों का स्टॉक ठीक है।' : 'All your medicine stock looks fine.';
        return (hi ? 'ये दवाइयाँ जल्द खत्म होंगी: ' : 'These are running low: ') + low.map((m) => m.name + ' (' + daysLeft(m) + (hi ? ' दिन)' : ' days)')).join(', ') + (hi ? '। मैं केयरटेकर को बता सकता हूँ।' : '. Your caretaker can arrange a refill.');
      }
      case 'appointments':
        if (!nextAppt) return hi ? 'अभी कोई अपॉइंटमेंट तय नहीं है।' : 'You have no upcoming appointments.';
        return hi ? 'अगला अपॉइंटमेंट: ' + nextAppt.title + ', ' + nextAppt.with + ' के साथ, ' + U.fmtDate(nextAppt.date) + ' को ' + U.fmtTime12(nextAppt.time) + ' बजे।' : 'Your next appointment is ' + nextAppt.title + ' with ' + nextAppt.with + ' on ' + U.fmtDate(nextAppt.date) + ' at ' + U.fmtTime12(nextAppt.time) + '.';
      case 'family': {
        const c = p.contacts[0];
        return hi ? 'आप ' + c.name + ' को ' + c.phone + ' पर कॉल कर सकते हैं। Emergency पेज पर कॉल बटन है।' : 'You can call ' + c.name + ' on ' + c.phone + '. The Emergency page has a call button.';
      }
      case 'location': {
        const inside = p.location.inside;
        return hi ? (inside ? 'आप अपने सुरक्षित क्षेत्र (घर) के अंदर हैं।' : 'आप घर के सुरक्षित क्षेत्र से बाहर हैं। परिवार को सूचित किया गया है।') : (inside ? 'You are inside your home safe zone.' : 'You are outside your home safe zone. Your family has been informed.');
      }
      case 'time': { const d = new Date(now); return (hi ? 'अभी समय है ' : 'It is ') + U.fmtTime12(U.pad(d.getHours()) + ':' + U.pad(d.getMinutes())) + (hi ? '।' : ', ' + d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + '.'); }
      case 'summary': {
        const a = adherence(p, 7, now);
        return hi ? 'पिछले 7 दिनों में आपने ' + a.pct + '% दवाइयाँ समय पर लीं। अपना ध्यान रखिए।' : 'In the last 7 days you took ' + a.pct + '% of your medicines. Keep it up and stay hydrated.';
      }
      case 'emergency': return hi ? 'घबराइए मत। SOS बटन दबाएँ या 112 पर कॉल करें। मैं परिवार को आपकी लोकेशन भेज सकता हूँ।' : "Stay calm. Press the SOS button or call 112. I can share your location with your family.";
      default: return hi ? 'माफ़ कीजिए, मैं समझ नहीं पाया। आप पूछ सकते हैं: "मेरी अगली दवा कब है?"' : 'Sorry, I did not catch that. Try: "When is my next medicine?"';
    }
  }

  /* ---------- emergency guidance (static, general first aid) ---------- */
  const EMERGENCY_GUIDE = [
    { id: 'fall', title: 'After a fall', steps: ['Stay still and do not rush to stand up.', 'Check for pain, bleeding or dizziness.', 'Press SOS or call a family member.', 'Do not move if you suspect a head, neck, hip or back injury.'] },
    { id: 'chest', title: 'Chest pain or breathlessness', steps: ['Sit down and stay calm; loosen tight clothing.', 'Call 112 / 108 immediately.', 'Chew one aspirin only if a doctor has advised it earlier.', 'Unlock the door and wait for help.'] },
    { id: 'sugar', title: 'Low blood sugar (shaky, sweaty, confused)', steps: ['Take 15 g fast sugar: 3 glucose tablets or half a glass of juice.', 'Recheck after 15 minutes; repeat if still low.', 'Have a small snack afterwards.', 'Call the doctor or 112 if confusion continues.'] },
    { id: 'missed', title: 'Missed a medicine dose', steps: ['Do not double the next dose.', 'Tell your caretaker or call the doctor for advice.', 'Take the next dose at the scheduled time.'] },
  ];

  return {
    dosesForDate, doseStatus, adherence, analyzeMissed, dailyUnits, daysLeft, stockStatus, healthSummary,
    parsePrescription, detectIntent, voiceReply, EMERGENCY_GUIDE, GRACE_AFTER,
  };
});
