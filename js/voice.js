/* LivedIn - voice assistant plumbing (browser speech recognition when available; typed input always works). */
(function () {
  'use strict';
  const LI = window.LI;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  LI.voice = {
    supported: () => !!SR,
    listen(lang, onText, onEnd, onErr) {
      if (!SR) { onErr('Speech recognition is not supported in this browser. Please type your question.'); return; }
      try {
        rec = new SR(); rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'; rec.interimResults = false; rec.maxAlternatives = 1;
        rec.onresult = (e) => onText(String(e.results[0][0].transcript || '').slice(0, 300));
        rec.onerror = (e) => onErr(e.error === 'not-allowed' ? 'Microphone permission was denied. You can type instead.' : 'Could not hear you. Please try again or type.');
        rec.onend = onEnd; rec.start();
      } catch (e) { onErr('Could not start the microphone. Please type instead.'); }
    },
    stop() { try { if (rec) rec.stop(); } catch (e) { /* ignore */ } },
  };
})();
