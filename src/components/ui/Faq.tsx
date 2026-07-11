import { useId, useState } from 'react';

interface QA {
  q: string;
  a: string;
}

const ITEMS: QA[] = [
  {
    q: 'How much does it cost?',
    a: 'Nothing. Zero dollars, no deposit, no “materials fee.” Meals, snacks, parts, tools, and swag are all covered by our sponsors. If anyone ever asks you for money for this event, it isn’t us.',
  },
  {
    q: 'Who can attend?',
    a: 'Any current high school student (grades 9–12) in or near the Bay Area. You don’t need to attend a specific school, and you don’t need any prior hardware or coding experience.',
  },
  {
    q: 'I’ve never touched hardware. Should I still come?',
    a: 'Especially then. Every team gets a starter kit that works out of the box, mentors roam the floor all 24 hours, and we run beginner workshops on soldering, microcontrollers, and sensors. Total beginners have won prizes at events like this. Repeatedly.',
  },
  {
    q: 'Do I need a team?',
    a: 'No. You can register solo and join a team at the event — we run team formation right after the theme reveal. Teams are 1 to 4 people. Friends who register together can lock a team on the RSVP form.',
  },
  {
    q: 'What’s the theme?',
    a: 'Classified. There is exactly one track, and it’s revealed on stage at the opening ceremony. Everyone starts from the same blank whiteboard at the same moment — that’s the point.',
  },
  {
    q: 'What hardware is provided?',
    a: 'Arduinos, ESP32s, Raspberry Pis, a wall of sensors and motors, breadboards, jumper wire by the mile, 3D printers, soldering stations, and hand tools. You can bring your own components too — anything pre-assembled just needs to be declared at check-in so judging stays fair.',
  },
  {
    q: 'Do we actually stay overnight?',
    a: 'If you want to. The venue is open and supervised the entire 24 hours, with a quiet nap room. Going home Saturday night and coming back Sunday morning is completely fine — plenty of hackers do.',
  },
  {
    q: 'What about food?',
    a: 'Lunch, dinner, midnight snacks, and breakfast — all free. Dietary restrictions and allergies are collected on the RSVP form and every station is labeled.',
  },
  {
    q: 'How does judging work?',
    a: 'Sunday afternoon is a science-fair-style expo: judges walk the floor and you demo your machine live. Judging weighs engineering, creativity, and how far you pushed past your own starting point — not how polished your slide deck is. There are no slide decks.',
  },
  {
    q: 'Is there a waiver?',
    a: 'Yes. After you RSVP, we email a liability and photo release waiver that a parent or guardian must sign. Bring it (or the digital confirmation) to check-in.',
  },
  {
    q: 'Can parents visit?',
    a: 'Parents are welcome at the Sunday demo expo and awards ceremony. During hacking hours the floor is participants, mentors, and organizers only — but the parent hotline is answered 24/7.',
  },
  {
    q: 'My question isn’t here.',
    a: 'Hit the contact link in the footer — a real organizer reads every message, usually within a day.',
  },
];

function Item({ item, index }: { item: QA; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const id = useId();

  return (
    <div className={`faq-item${open ? ' open' : ''}`}>
      <button
        className="faq-q"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="faq-num">{String(index + 1).padStart(2, '0')}</span>
        <span className="faq-text">{item.q}</span>
        <span className="faq-icon" aria-hidden="true" />
      </button>
      <div id={id} className="faq-a" hidden={!open}>
        <p>{item.a}</p>
      </div>
    </div>
  );
}

export default function Faq() {
  return (
    <div className="faq-list">
      {ITEMS.map((item, i) => (
        <Item key={item.q} item={item} index={i} />
      ))}
      <style>{`
        .faq-list {
          max-width: 52rem;
          border-top: 1px solid var(--line);
        }
        .faq-item {
          border-bottom: 1px solid var(--line);
        }
        .faq-q {
          display: grid;
          grid-template-columns: 3rem 1fr 2rem;
          align-items: center;
          gap: 1rem;
          width: 100%;
          text-align: left;
          padding: 1.4rem 0;
          transition: color 0.3s ease;
        }
        .faq-q:hover .faq-text {
          color: var(--cyan);
        }
        .faq-num {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.2em;
          color: var(--ink-faint);
        }
        .faq-text {
          font-family: var(--font-display);
          font-size: clamp(1rem, 1.6vw, 1.25rem);
          font-weight: 550;
          letter-spacing: -0.01em;
          transition: color 0.3s ease;
        }
        .faq-icon {
          position: relative;
          width: 14px;
          height: 14px;
          justify-self: end;
        }
        .faq-icon::before,
        .faq-icon::after {
          content: '';
          position: absolute;
          background: var(--ink-dim);
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .faq-icon::before {
          left: 0;
          top: 6px;
          width: 14px;
          height: 2px;
        }
        .faq-icon::after {
          left: 6px;
          top: 0;
          width: 2px;
          height: 14px;
        }
        .open .faq-icon::after {
          transform: scaleY(0);
        }
        .faq-a {
          overflow: hidden;
        }
        .faq-a p {
          max-width: 46rem;
          padding: 0 3rem 1.6rem;
          color: var(--ink-dim);
          font-size: 0.95rem;
        }
        @media (max-width: 560px) {
          .faq-q { grid-template-columns: 1fr 2rem; }
          .faq-num { display: none; }
          .faq-a p { padding-left: 0; }
        }
      `}</style>
    </div>
  );
}
