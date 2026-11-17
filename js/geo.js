/* LivedIn - SafeTrack geometry + geofence evaluation (pure, unit-tested). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function destination(o, distM, bearingDeg) {
    const br = rad(bearingDeg), d = distM / R, lat1 = rad(o.lat), lng1 = rad(o.lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
    const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  const isInside = (loc, zone) => haversine(loc, zone) <= zone.radius;
  const outingActive = (outing, now) => !!(outing && outing.active && Number(outing.until) > now);

  /** Returns the new inside/outside state plus events: 'exit' | 'outing_exit' | 'return'. */
  function evaluateGeofence(wasInside, loc, zone, outing, now) {
    const inside = isInside(loc, zone);
    const events = [];
    if (wasInside && !inside) events.push(outingActive(outing, now) ? 'outing_exit' : 'exit');
    if (!wasInside && inside) events.push('return');
    return { inside, events };
  }
  function movementState(prev, cur) {
    if (!prev || !cur) return 'Still';
    const dt = (cur.ts - prev.ts) / 1000;
    if (!(dt > 0)) return 'Still';
    const v = haversine(prev, cur) / dt;
    if (v < 0.3) return 'Still';
    if (v < 2.5) return 'Walking';
    return 'Moving fast';
  }
  const osmLink = (lat, lng) => 'https://www.openstreetmap.org/?mlat=' + lat.toFixed(5) + '&mlon=' + lng.toFixed(5) + '#map=17/' + lat.toFixed(5) + '/' + lng.toFixed(5);
  const fmtCoord = (lat, lng) => lat.toFixed(5) + ', ' + lng.toFixed(5);
  const fmtDist = (m) => (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km');

  return { haversine, destination, bearing, isInside, outingActive, evaluateGeofence, movementState, osmLink, fmtCoord, fmtDist };
});
