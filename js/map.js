/*
 * LivedIn - SafeTrack map. Uses Leaflet + OpenStreetMap when available; otherwise falls back to a
 * lightweight canvas map so the demo still works offline. One persistent instance is re-mounted
 * between renders so the map does not flicker when state updates.
 */
(function () {
  'use strict';
  const LI = window.LI;
  const host = document.createElement('div');
  host.className = 'map-host';
  host.setAttribute('role', 'application');
  host.setAttribute('aria-label', 'Map showing the home safe zone and the patient position. Click or tap the map to move the simulated patient.');
  let impl = null, onPick = null, pickMode = 'patient', cur = null;

  function leafletImpl() {
    const L = window.L;
    const map = L.map(host, { zoomControl: true, attributionControl: true }).setView([28.6692, 77.4538], 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const zone = L.circle([0, 0], { radius: 300, color: '#2F4A38', weight: 2, fillColor: '#789575', fillOpacity: 0.22, dashArray: '6 6' }).addTo(map);
    const homeIcon = L.divIcon({ className: 'pin pin-home', html: '<span>H</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
    const patIcon = L.divIcon({ className: 'pin pin-patient', html: '<span>P</span>', iconSize: [38, 38], iconAnchor: [19, 19] });
    const home = L.marker([0, 0], { icon: homeIcon, keyboard: false, title: 'Home' }).addTo(map);
    const pat = L.marker([0, 0], { icon: patIcon, keyboard: false, title: 'Patient' }).addTo(map);
    const trail = L.polyline([], { color: '#C4693F', weight: 3, opacity: 0.8 }).addTo(map);
    map.on('click', (e) => { if (onPick) onPick(e.latlng.lat, e.latlng.lng, pickMode); });
    let fitted = false;
    return {
      update(d) {
        zone.setLatLng([d.zone.lat, d.zone.lng]); zone.setRadius(d.zone.radius); home.setLatLng([d.zone.lat, d.zone.lng]);
        pat.setLatLng([d.loc.lat, d.loc.lng]); trail.setLatLngs(d.trail.map((t) => [t.lat, t.lng]));
        zone.setStyle({ color: d.inside ? '#2F4A38' : '#B3402F', fillColor: d.inside ? '#789575' : '#B3402F' });
        if (!fitted || d.recenter) { map.fitBounds(zone.getBounds().extend([d.loc.lat, d.loc.lng]), { padding: [30, 30], maxZoom: 17 }); fitted = true; }
      },
      invalidate() { map.invalidateSize(); },
      kind: 'leaflet',
    };
  }

  function canvasImpl() {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 560; cv.className = 'map-canvas';
    cv.setAttribute('aria-hidden', 'true'); host.appendChild(cv);
    const note = document.createElement('div'); note.className = 'map-note';
    note.textContent = 'Offline map view (OpenStreetMap tiles could not be loaded). Click the map to move the simulated patient.';
    host.appendChild(note);
    const ctx = cv.getContext('2d'); let data = null, scale = 1;
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#789575';
    function proj(p) {
      const z = data.zone, mPerDegLat = 111320, mPerDegLng = 111320 * Math.cos((z.lat * Math.PI) / 180);
      return { x: cv.width / 2 + (p.lng - z.lng) * mPerDegLng * scale, y: cv.height / 2 - (p.lat - z.lat) * mPerDegLat * scale };
    }
    function draw() {
      if (!data) return;
      const z = data.zone, reach = Math.max(z.radius * 1.8, 500, ...data.trail.map((t) => LI.haversine(z, t) * 1.15), LI.haversine(z, data.loc) * 1.2);
      scale = (Math.min(cv.width, cv.height) / 2 - 30) / reach;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#EEF0DC'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(47,74,56,.12)'; ctx.lineWidth = 1;
      for (let x = 0; x < cv.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
      for (let y = 0; y < cv.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
      const h = proj(z);
      ctx.beginPath(); ctx.arc(h.x, h.y, z.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = data.inside ? 'rgba(120,149,117,.28)' : 'rgba(179,64,47,.2)'; ctx.fill();
      ctx.setLineDash([8, 6]); ctx.strokeStyle = data.inside ? '#2F4A38' : '#B3402F'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#C4693F'; ctx.lineWidth = 3; ctx.beginPath();
      data.trail.forEach((t, i) => { const q = proj(t); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke();
      function pin(p, label, color) { const q = proj(p); ctx.beginPath(); ctx.arc(q.x, q.y, 17, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '700 17px Inter, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, q.x, q.y + 1); }
      pin(z, 'H', '#2F4A38'); pin(data.loc, 'P', '#C4693F');
      ctx.fillStyle = '#2F4A38'; ctx.font = '600 15px Inter, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Safe zone: ' + z.radius + ' m radius', 16, cv.height - 18);
    }
    cv.addEventListener('click', (e) => {
      if (!data || !onPick) return;
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
      const z = data.zone, mLat = 111320, mLng = 111320 * Math.cos((z.lat * Math.PI) / 180);
      onPick(z.lat - (y - cv.height / 2) / (mLat * scale), z.lng + (x - cv.width / 2) / (mLng * scale), pickMode);
    });
    return { update(d) { data = d; draw(); }, invalidate() { draw(); }, kind: 'canvas' };
  }

  function ensure() {
    if (impl) return impl;
    try { impl = window.L && window.L.map ? leafletImpl() : canvasImpl(); }
    catch (e) { console.warn('Leaflet failed, using fallback map', e); host.innerHTML = ''; impl = canvasImpl(); }
    return impl;
  }

  LI.SafeMap = {
    mount(slot) { slot.appendChild(host); ensure(); setTimeout(() => impl && impl.invalidate(), 60); },
    update(data) { cur = data; ensure().update(data); },
    setPickHandler(fn, mode) { onPick = fn; pickMode = mode || 'patient'; },
    setPickMode(mode) { pickMode = mode; host.dataset.pick = mode; },
    kind: () => (impl ? impl.kind : 'none'),
    current: () => cur,
  };
})();
