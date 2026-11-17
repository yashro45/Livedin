/* LivedIn - dependency-free PDF writer (A4, Helvetica). Pure; unit-tested. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LI = root.LI || {}; Object.assign(root.LI, api); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const W = 595, H = 842, MX = 48, TOP = 760, BOTTOM = 56;

  // keep Latin-1 only (standard PDF fonts); replace others
  const latin = (s) => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  const pdfEsc = (s) => latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  function wrap(text, size, maxW) {
    const cw = size * 0.5, max = Math.max(10, Math.floor(maxW / cw)), out = [];
    for (const para of latin(text).split(/\n/)) {
      let line = '';
      for (const word of para.split(' ')) {
        let w = word;
        while (w.length > max) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, max)); w = w.slice(max); }
        if ((line + ' ' + w).trim().length > max) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
      }
      out.push(line);
    }
    return out;
  }

  /**
   * doc = { title, subtitle, footer, sections: [{ heading, lines: [string | {text, bold}] }] }
   * Returns Uint8Array containing a valid PDF.
   */
  function buildPdf(doc) {
    const pages = []; let ops = [], y = TOP;
    const newPage = () => { if (ops.length || !pages.length) pages.push(ops); ops = []; y = TOP; };
    function header() {
      ops.push('0.184 0.290 0.220 rg 0 ' + (H - 96) + ' ' + W + ' 96 re f');
      ops.push('0.898 0.910 0.808 rg BT /F2 22 Tf ' + MX + ' ' + (H - 50) + ' Td (' + pdfEsc(doc.title || 'LivedIn Report') + ') Tj ET');
      ops.push('0.898 0.910 0.808 rg BT /F1 10 Tf ' + MX + ' ' + (H - 72) + ' Td (' + pdfEsc(doc.subtitle || '') + ') Tj ET');
      ops.push('0.471 0.584 0.459 rg 0 ' + (H - 100) + ' ' + W + ' 4 re f');
      y = H - 130;
    }
    header();
    function ensure(h) { if (y - h < BOTTOM) { pages.push(ops); ops = []; y = TOP + 20; } }
    for (const sec of doc.sections || []) {
      ensure(60);
      ops.push('0.184 0.290 0.220 rg BT /F2 13 Tf ' + MX + ' ' + y + ' Td (' + pdfEsc(sec.heading) + ') Tj ET');
      ops.push('0.471 0.584 0.459 RG 1 w ' + MX + ' ' + (y - 5) + ' m ' + (W - MX) + ' ' + (y - 5) + ' l S');
      y -= 24;
      for (const ln of sec.lines || []) {
        const bold = typeof ln === 'object' && ln.bold, text = typeof ln === 'object' ? ln.text : ln;
        const size = 10.5;
        for (const part of wrap(text, size, W - 2 * MX)) {
          ensure(16);
          ops.push('0.11 0.16 0.13 rg BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + MX + ' ' + y + ' Td (' + pdfEsc(part) + ') Tj ET');
          y -= 15;
        }
      }
      y -= 12;
    }
    pages.push(ops);
    const total = pages.length;
    pages.forEach((p, i) => p.push('0.35 0.42 0.37 rg BT /F1 8.5 Tf ' + MX + ' 30 Td (' + pdfEsc((doc.footer || 'LivedIn - demo data') + '   |   Page ' + (i + 1) + ' of ' + total) + ') Tj ET'));

    // object layout: 1 catalog, 2 pages, 3 F1, 4 F2, then (page, content) pairs
    const objs = [];
    const kids = pages.map((_, i) => (5 + i * 2) + ' 0 R').join(' ');
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Pages /Kids [' + kids + '] /Count ' + total + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((p, i) => {
      const stream = p.join('\n');
      objs[5 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + i * 2) + ' 0 R >>';
      objs[6 + i * 2] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    });
    let out = '%PDF-1.4\n'; const offs = [];
    for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    const xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (let i = 1; i < objs.length; i++) out += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return bytes;
  }
  return { buildPdf };
});
