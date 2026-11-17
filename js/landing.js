/* LivedIn - landing page behaviour: sticky nav state, mobile menu, scroll reveal. */
(function () {
  'use strict';
  document.body.classList.remove('no-js');
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const btn = document.getElementById('menuBtn'), list = document.getElementById('navlinks');
  btn.addEventListener('click', () => { const open = list.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); });
  list.addEventListener('click', (e) => { if (e.target.closest('a')) { list.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { list.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });

  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  items.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
})();
