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

  // ── Fade-up reveals with variety ──────────────────────────────
  const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const heroReveals = reveals.filter((el) => el.closest('#top'));
  const restReveals = reveals.filter((el) => !el.closest('#top'));

  ScrollTrigger.batch(restReveals, {
    start: 'top 89%',
    once: true,
    onEnter: (batch) => {
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        stagger: (i) => Math.min(0.06 + i * 0.05, 0.25),
        ease: 'power3.out',
        overwrite: true,
      });
      // Subtle parallax on section headings
      batch.forEach((el) => {
        if (el.matches('h2, .kicker, .display-lg, .display-md')) {
          gsap.fromTo(el, { scale: 0.96, filter: 'blur(4px)' }, {
            scale: 1,
            filter: 'blur(0px)',
            duration: 1.4,
            ease: 'power4.out',
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
            overwrite: true,
          });
        }
        // Cards stagger with a slight rotation reveal
        if (el.matches('.card, .logo-slot')) {
          gsap.fromTo(el, { rotateX: 6 }, {
            rotateX: 0,
            duration: 1.2,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
            overwrite: true,
          });
        }
      });
    },
  });

  // ── Hero entrance, released by the preloader ──────────────────
  const enterHero = () => {
    splitTweens.forEach((play) => play());
    gsap.to(heroReveals, {
      opacity: 1,
      y: 0,
      duration: 1.2,
      stagger: (i) => 0.08 + i * 0.06,
      delay: 0.35,
      ease: 'power3.out',
    });
    // Hero kicker entrance from above
    const kicker = document.querySelector('#top .kicker');
    if (kicker) {
      gsap.fromTo(kicker, { y: -20, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, delay: 0.1, ease: 'power2.out',
      });
    }
  };
  window.addEventListener('site:enter', enterHero, { once: true });

  // Layout can shift as fonts land + islands hydrate
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  setTimeout(() => ScrollTrigger.refresh(), 1600);

  void heroEls;
}
