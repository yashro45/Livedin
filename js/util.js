/* LivedIn - small pure date/time helpers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function hmToMin(hm) { const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hm)); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  const minOfDay = (d) => { d = new Date(d); return d.getHours() * 60 + d.getMinutes(); };
  function fmtTime12(hm) {
    const m = hmToMin(hm); if (isNaN(m)) return String(hm);
    let h = Math.floor(m / 60); const mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + pad(mm) + ' ' + ap;
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) { const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s); return isNaN(d) ? String(s) : d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtDateLong(s) { const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtStamp(ts) {
    const d = new Date(ts); if (isNaN(d)) return '-';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + fmtTime12(pad(d.getHours()) + ':' + pad(d.getMinutes()));
  }
  function relTime(ts, now) {
    const s = Math.round((now - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  const uid = (p) => (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  return { pad, ymd, addDays, hmToMin, minOfDay, fmtTime12, fmtDate, fmtDateLong, fmtStamp, relTime, uid };
});
