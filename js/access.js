/*
 * LivedIn - access control (pure, unit-tested): which role may open which view,
 * which role may run which state change, patient scoping, consent rules, session validation.
 */
(function (root, factory) {
  const S = (typeof module === 'object' && module.exports) ? require('./security.js') : root.LI;
  const api = factory(S);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  const ROLES = ['patient', 'family', 'caretaker', 'doctor'];
  const VIEWS = {
    patient: ['today', 'assistant', 'emergency', 'appointments', 'safety', 'privacy'],
    family: ['overview', 'safetrack', 'medicines', 'health', 'appointments', 'reports', 'alerts', 'contact', 'device'],
    caretaker: ['patients', 'care', 'medicines', 'safetrack', 'appointments', 'reports', 'alerts', 'device', 'contact'],
    doctor: ['patients', 'overview', 'reports', 'medicines', 'appointments', 'notes', 'adherence'],
  };
  const DEFAULT_VIEW = { patient: 'today', family: 'overview', caretaker: 'patients', doctor: 'patients' };

  // state-changing operations (names match the store's core mutators, plus 'download')
  const PERMS = {
    setDose: ['patient', 'caretaker'], sos: ['patient', 'family', 'caretaker'], clearSos: ['patient', 'family', 'caretaker'],
    requestOrder: ['caretaker'], placeOrder: ['family', 'caretaker'], receiveStock: ['family', 'caretaker'],
    setLocation: ['patient', 'family', 'caretaker'], updateZone: ['family', 'caretaker'], setOuting: ['patient', 'family', 'caretaker'],
    setBattery: ['patient', 'family', 'caretaker'], setOnline: ['patient', 'family', 'caretaker'], setBox: ['patient', 'family', 'caretaker'], setBuzzer: ['patient', 'family', 'caretaker'],
    addReport: ['doctor'], addMeds: ['doctor'], updateMed: ['doctor'], addConsult: ['doctor'],
    addVitals: ['caretaker', 'doctor'], addAppt: ['doctor', 'caretaker'], setAppt: ['doctor', 'caretaker'],
    addCareNote: ['caretaker'], toggleTask: ['caretaker'], addTask: ['caretaker'], emergency: ['caretaker'],
    setConsent: ['patient'], message: ['family', 'caretaker', 'doctor'], dailyReport: ['family', 'caretaker'],
    download: ['family', 'caretaker', 'doctor'],
  };

  const canView = (role, v) => ROLES.includes(role) && VIEWS[role].includes(v);
  const can = (role, action) => Object.prototype.hasOwnProperty.call(PERMS, action) && PERMS[action].includes(role);
  const canAccessPatient = (user, pid) => !!user && Array.isArray(user.patientIds) && user.patientIds.includes(pid);

  /** what: 'location' | 'medical' */
  function consentAllows(role, consent, what) {
    consent = consent || {};
    if (what === 'location') {
      if (role === 'patient') return true;
      if (role === 'family') return consent.family === true;
      if (role === 'caretaker') return consent.caretaker === true;
      return false; // doctors never see live location
    }
    if (what === 'medical') return role === 'family' ? consent.medicalFamily === true : ROLES.includes(role);
    return false;
  }

  function validateSession(s, users, now) {
    if (!S.sessionValid(s, now)) return null;
    const u = users.find((x) => x.uid === s.uid && x.role === s.role);
    return u || null;
  }

  return { ROLES, VIEWS, DEFAULT_VIEW, PERMS, canView, can, canAccessPatient, consentAllows, validateSession };
});
