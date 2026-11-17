/*
 * LivedIn - security helpers (pure, no DOM, unit-tested in Node).
 * - Auto-escaping html`` template tag (XSS defence)
 * - Input validation / sanitising
 * - Pure-JS SHA-256 + iterated salted password hashing
 * - Login lockout + session expiry logic
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- output encoding ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"'`]/g, (c) => ESC[c]); }

  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  function raw(s) { return new Raw(String(s)); }
  function toStr(v) {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(toStr).join('');
    if (v === false || v == null) return '';
    return esc(v);
  }
  /** Tagged template: every interpolation is HTML-escaped unless it is a Raw (from another html``). */
  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += toStr(vals[i]) + strings[i + 1];
    return new Raw(out);
  }

  /* ---------- input validation ---------- */
  // strip control chars, collapse whitespace, cap length
  function cleanText(v, max = 500) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, max);
  }
  function isValidUserId(v) { return typeof v === 'string' && /^[A-Z]{3}[0-9]{4}$/.test(v); }
  function isValidTime(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
  function isValidDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, dd] = v.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === dd;
  }
  function isValidPhone(v) { return typeof v === 'string' && /^[+0-9][0-9 \-]{6,17}$/.test(v); }
  function clamp(n, lo, hi) { n = Number(n); if (!isFinite(n)) return lo; return Math.min(hi, Math.max(lo, n)); }
  function validLatLng(lat, lng) {
    return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  const ALLOWED_UPLOAD = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'text/plain': 'txt' };
  const MAX_UPLOAD = 2 * 1024 * 1024;
  function validateUpload(file) {
    if (!file || typeof file !== 'object') return { ok: false, error: 'No file selected.' };
    if (!ALLOWED_UPLOAD[file.type]) return { ok: false, error: 'Only PDF, PNG, JPG or TXT files are allowed.' };
    if (!(file.size > 0)) return { ok: false, error: 'The file is empty.' };
    if (file.size > MAX_UPLOAD) return { ok: false, error: 'File is larger than 2 MB.' };
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    const okExt = ALLOWED_UPLOAD[file.type] === ext || (file.type === 'image/jpeg' && ext === 'jpeg');
    if (!okExt) return { ok: false, error: 'File extension does not match its type.' };
    return { ok: true };
  }
  function safeFileName(name) {
    return String(name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'file';
  }

  /* ---------- SHA-256 (pure JS so it also works on file:// pages) ---------- */
  const PRIMES = (function () {
    const p = []; for (let n = 2; p.length < 64; n++) { let ok = true; for (const q of p) { if (q * q > n) break; if (n % q === 0) { ok = false; break; } } if (ok) p.push(n); } return p;
  })();
  const frac = (x) => x - Math.floor(x);
  const K = PRIMES.map((p) => Math.floor(frac(Math.cbrt(p)) * 4294967296) >>> 0);
  const H0 = PRIMES.slice(0, 8).map((p) => Math.floor(frac(Math.sqrt(p)) * 4294967296) >>> 0);

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const b = unescape(encodeURIComponent(str)); const o = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o;
  }
  function sha256(msg) {
    const bytes = utf8(String(msg));
    const l = bytes.length;
    const padLen = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padLen); buf.set(bytes); buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = l * 8;
    dv.setUint32(padLen - 8, Math.floor(bits / 4294967296));
    dv.setUint32(padLen - 4, bits >>> 0);
    const H = H0.slice(); const w = new Uint32Array(64);
    for (let o = 0; o < padLen; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  const HASH_ROUNDS = 1500;
  /** Salted, iterated hash. (Demo-grade KDF; a real deployment would use Argon2/bcrypt server-side.) */
  function hashPassword(password, salt) {
    let h = sha256(salt + ':' + password);
    for (let i = 1; i < HASH_ROUNDS; i++) h = sha256(h + salt);
    return h;
  }
  function safeEqual(a, b) {
    a = String(a); b = String(b);
    let diff = a.length ^ b.length;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }

  /* ---------- brute-force lockout + sessions ---------- */
  const MAX_FAILS = 5, LOCK_MS = 30000, SESSION_TTL = 30 * 60 * 1000;
  function lockRemaining(rec, now) { return rec && rec.until && rec.until > now ? Math.ceil((rec.until - now) / 1000) : 0; }
  function registerFailure(rec, now) {
    const r = { fails: ((rec && rec.fails) || 0) + 1, until: (rec && rec.until) || 0 };
    if (r.fails >= MAX_FAILS) { r.until = now + LOCK_MS; r.fails = 0; }
    return r;
  }
  function makeSession(uid, role, now) { return { uid, role, iat: now, exp: now + SESSION_TTL, seen: now }; }
  function sessionValid(s, now) {
    return !!(s && typeof s === 'object' && typeof s.uid === 'string' && typeof s.role === 'string' &&
      Number(s.exp) > now && Number(s.seen) + SESSION_TTL > now);
  }

  return {
    esc, raw, html, Raw, cleanText, isValidUserId, isValidTime, isValidDate, isValidPhone, clamp, validLatLng,
    validateUpload, safeFileName, MAX_UPLOAD, sha256, hashPassword, safeEqual,
    MAX_FAILS, LOCK_MS, SESSION_TTL, lockRemaining, registerFailure, makeSession, sessionValid,
  };
});
