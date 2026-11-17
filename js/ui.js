/* LivedIn - shared UI building blocks (all output goes through the escaping html`` tag). */
(function () {
  'use strict';
  const LI = window.LI, { html, raw } = LI;
  const ui = {};

  ui.icon = (n, s = 20) => html`<svg class="ic" width="${s}" height="${s}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
  ui.pill = (t, k) => html`<span class="pill ${k || ''}">${t}</span>`;
  ui.card = (title, body, o = {}) => html`<section class="card ${o.cls || ''}">${title ? html`<header class="card-h"><h2>${o.icon ? ui.icon(o.icon, 20) : ''}${title}</h2>${o.actions ? html`<div class="card-a">${o.actions}</div>` : ''}</header>` : ''}${o.sub ? html`<p class="muted small card-sub">${o.sub}</p>` : ''}${body}</section>`;
  ui.stat = (label, value, sub, kind, icon) => html`<div class="stat ${kind || ''}"><div class="stat-ic">${ui.icon(icon || 'heart', 22)}</div><div><div class="stat-l">${label}</div><div class="stat-v">${value}</div>${sub ? html`<div class="stat-s">${sub}</div>` : ''}</div></div>`;
  ui.progress = (pct, kind) => html`<div class="progress ${kind || ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i data-w="${Math.max(0, Math.min(100, pct))}"></i></div>`;
  ui.empty = (t) => html`<p class="empty">${t}</p>`;
  ui.hydrate = (root) => {
    root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
    root.querySelectorAll('[data-h]').forEach((el) => { el.style.height = el.dataset.h + '%'; });
  };
  ui.simBanner = (text) => html`<div class="sim-banner" role="note"><span class="pill warn plain">SIMULATED</span> ${text || 'Demo simulation. No physical hardware or real sensor is connected.'}</div>`;

  /* ---- toasts ---- */
  ui.toast = (text, kind, o = {}) => {
    const wrap = document.getElementById('toasts'); if (!wrap) return;
    const el = document.createElement('div'); el.className = 'toast ' + (kind || 'info');
    el.setAttribute('role', kind === 'critical' ? 'alert' : 'status');
    const t = document.createElement('span'); t.textContent = text; el.appendChild(t);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-x'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '×'; x.addEventListener('click', () => el.remove()); el.appendChild(x);
    wrap.appendChild(el);
    while (wrap.children.length > 4) wrap.firstChild.remove();
    setTimeout(() => el.remove(), o.ms || (kind === 'critical' ? 12000 : 5500));
  };

  /* ---- dialog ---- */
  ui.openDialog = (title, body, o = {}) => {
    const d = document.getElementById('dlg');
    d.innerHTML = html`<div class="dlg-in ${o.cls || ''}"><header class="dlg-h"><h2 id="dlgTitle">${title}</h2><button type="button" class="btn btn-sm btn-ghost" data-action="closeDialog" aria-label="Close dialog">${ui.icon('x', 18)}</button></header><div class="dlg-b">${body}</div></div>`.s;
    d.setAttribute('aria-labelledby', 'dlgTitle');
    if (!d.open) d.showModal();
    const f = d.querySelector('input,select,textarea,button.btn-primary'); if (f) f.focus();
  };
  ui.closeDialog = () => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); };
  ui.confirm = (title, msg, okLabel) => new Promise((res) => {
    ui.openDialog(title, html`<p>${msg}</p><div class="row end"><button type="button" class="btn" data-action="closeDialog" id="cfNo">Cancel</button><button type="button" class="btn btn-primary" id="cfYes">${okLabel || 'Confirm'}</button></div>`);
    const d = document.getElementById('dlg');
    const done = (v) => { d.removeEventListener('close', onClose); ui.closeDialog(); res(v); };
    const onClose = () => res(false);
    d.addEventListener('close', onClose, { once: true });
    document.getElementById('cfYes').addEventListener('click', () => { d.removeEventListener('close', onClose); ui.closeDialog(); res(true); }, { once: true });
    void done;
  });

  /* ---- files / audio / speech ---- */
  ui.download = (name, bytes, mime) => {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = LI.safeFileName(name); a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  let actx = null;
  ui.beep = (pattern) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime;
      (pattern || [880, 660, 880]).forEach((f) => {
        const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.32); t += 0.36;
      });
    } catch (e) { /* audio blocked until a user gesture */ }
  };
  ui.speak = (text, lang) => {
    try {
      if (!('speechSynthesis' in window)) return false;
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text).slice(0, 400)); u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'; u.rate = 0.92; speechSynthesis.speak(u); return true;
    } catch (e) { return false; }
  };

  /* ---- tiny charts (SVG, no libraries) ---- */
  ui.bars = (days) => {
    const max = Math.max(1, ...days.map((d) => d.taken + d.missed));
    return html`<div class="bars" role="img" aria-label="Doses taken and missed per day for the last ${days.length} days">${days.map((d) => html`<div class="bar-col"><div class="bar-stack"><i class="bar missed" data-h="${(d.missed / max) * 100}"></i><i class="bar taken" data-h="${(d.taken / max) * 100}"></i></div><span class="bar-l">${LI.fmtDate(d.date).split(' ')[0]}</span><span class="sr-only">${d.taken} taken, ${d.missed} missed</span></div>`)}</div><div class="legend"><span><i class="sw taken"></i>Taken</span><span><i class="sw missed"></i>Missed</span></div>`;
  };
  ui.lineChart = (vals, labels, o = {}) => {
    const W = 520, H = 170, px = 34, py = 18, n = vals.length; if (n < 2) return ui.empty('Not enough readings yet.');
    const lo = o.min != null ? o.min : Math.min(...vals) - 6, hi = o.max != null ? o.max : Math.max(...vals) + 6;
    const x = (i) => px + (i * (W - px - 12)) / (n - 1), y = (v) => H - py - ((v - lo) / (hi - lo || 1)) * (H - 2 * py);
    const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    return html`<svg class="linechart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'Trend'}: ${vals.join(', ')}"><g stroke="currentColor" stroke-opacity=".12">${[0, 1, 2, 3].map((k) => html`<line x1="${px}" x2="${W - 8}" y1="${py + (k * (H - 2 * py)) / 3}" y2="${py + (k * (H - 2 * py)) / 3}"/>`)}</g><polyline fill="none" stroke="${o.color || '#2F4A38'}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/>${vals.map((v, i) => html`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" fill="${o.color || '#2F4A38'}"/>`)}<g class="axis">${labels.map((l, i) => html`<text x="${x(i).toFixed(1)}" y="${H - 2}" text-anchor="middle">${l}</text>`)}<text x="4" y="${py + 4}">${Math.round(hi)}</text><text x="4" y="${H - py}">${Math.round(lo)}</text></g></svg>`;
  };

  LI.ui = ui;
  LI.views = LI.views || {}; LI.nav = LI.nav || {}; LI.actions = LI.actions || {}; LI.forms = LI.forms || {}; LI.inputs = LI.inputs || {};
})();
