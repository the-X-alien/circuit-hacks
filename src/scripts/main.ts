import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { bus } from '~/lib/bus';

export function initSite(): void {
  const html = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  bus.reduced = reduced;

  // Pointer state feeds the WebGL island + cursor
  window.addEventListener(
    'pointermove',
    (e) => {
      bus.pointer.x = e.clientX;
      bus.pointer.y = e.clientY;
      bus.pointer.nx = (e.clientX / window.innerWidth) * 2 - 1;
      bus.pointer.ny = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true }
  );

  if (reduced) {
    // Everything readable, nothing animated
    gsap.set('[data-reveal]', { opacity: 1, y: 0 });
    return;
  }

  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

  const smoother = ScrollSmoother.create({
    wrapper: '#smooth-wrapper',
    content: '#smooth-content',
    smooth: 1.15,
    smoothTouch: false,
    normalizeScroll: false,
  });
  html.classList.add('has-smoother');
  bus.getScroll = () => smoother.scrollTop();

  // Nav chrome on scroll
  const nav = document.getElementById('site-nav');
  ScrollTrigger.create({
    start: 60,
    end: 'max',
    onToggle: (self) => nav?.classList.toggle('is-scrolled', self.isActive),
  });

  // Anchor navigation through the smoother
  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href')!;
    const target = id === '#top' ? 0 : document.querySelector(id);
    if (target === null) return;
    e.preventDefault();
    smoother.scrollTo(target as Element | number, true, 'top 72px');
  });

  // ── Headline reveals (SplitText line masks) ───────────────────
  const heroEls: Element[] = [];
  const splitTweens: (() => void)[] = [];

  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    gsap.set(split.lines, { yPercent: 118 });
    const play = () =>
      gsap.to(split.lines, {
        yPercent: 0,
        duration: 1.25,
        stagger: 0.1,
        ease: 'power4.out',
      });
    if (el.closest('#top')) {
      heroEls.push(el);
      splitTweens.push(play);
    } else {
      ScrollTrigger.create({ trigger: el, start: 'top 84%', once: true, onEnter: play });
    }
  });

  // ── Section titles light up (and stay lit) once scrolled into view ──
  // IntersectionObserver reacts to the real painted position, so it works
  // regardless of ScrollSmoother's transform-based virtual scroll.
  const litObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('title-lit');
          litObserver.unobserve(e.target);
        }
      }
    },
    { threshold: 0.4 }
  );
  document.querySelectorAll('[data-split]').forEach((el) => {
    if (!el.closest('#top')) litObserver.observe(el);
  });

  // ── Fade-up reveals (robust: a section can never stay blank) ──
  // Driven directly off scroll position + a hard safety net, so it does not
  // depend on ScrollTrigger start calculations that can misfire under
  // ScrollSmoother's transform-based virtual scroll.
  const allReveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const heroReveals = allReveals.filter((el) => el.closest('#top'));
  const restReveals = allReveals.filter((el) => !el.closest('#top'));
  // Pure CSS-class reveal — the fade is a CSS transition (compositor-driven),
  // so it does not depend on the gsap ticker running. A section can never stay
  // blank: an IntersectionObserver reveals on scroll, a scroll-frame sweep backs
  // it up, and a timeout guarantees everything is shown regardless.
  const reveal = (el: HTMLElement) => el.classList.add('is-in');

  const revealVisible = () => {
    const vh = window.innerHeight;
    for (const el of restReveals) {
      if (el.classList.contains('is-in')) continue;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) reveal(el);
    }
  };

  const revObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          reveal(e.target as HTMLElement);
          revObserver.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  restReveals.forEach((el) => revObserver.observe(el));

  // Backups: sweep on every scroll frame + guarantee everything after 3.5s.
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: revealVisible, onRefresh: revealVisible });
  revealVisible();
  setTimeout(revealVisible, 800);
  setTimeout(() => restReveals.forEach(reveal), 3500);

  // ── Hero entrance, released by the preloader ──────────────────
  const enterHero = () => {
    splitTweens.forEach((play) => play());
    heroReveals.forEach((el, i) => {
      setTimeout(() => el.classList.add('is-in'), 300 + i * 90);
    });
  };
  window.addEventListener('site:enter', enterHero, { once: true });
  // Fallback in case the preloader's site:enter fired before this listener.
  setTimeout(() => heroReveals.forEach((el) => el.classList.add('is-in')), 2500);

  // Layout can shift as fonts land + islands hydrate
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  setTimeout(() => ScrollTrigger.refresh(), 1600);

  void heroEls;
}
