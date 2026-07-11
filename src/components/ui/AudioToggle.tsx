import { useEffect, useRef, useState } from 'react';

/**
 * Generative ambient pad — no audio assets. Detuned sine drones through
 * slow LFOs plus band-passed noise. Pauses when the tab is hidden.
 */
class Ambient {
  private ctx: AudioContext;
  private master: GainNode;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    const drones = [55, 82.41, 110, 164.81];
    drones.forEach((freq, i) => {
      const pair = this.ctx.createGain();
      pair.gain.value = 0.035;
      pair.connect(this.master);

      for (const detune of [-2.5, 2.5]) {
        const osc = this.ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        osc.connect(pair);
        osc.start();
      }

      // Slow swell per drone
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.02 + i * 0.013;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.022;
      lfo.connect(lfoGain);
      lfoGain.connect(pair.gain);
      lfo.start();
    });

    // Filtered noise bed ("server room air")
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.6;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.012;

    const filterLfo = this.ctx.createOscillator();
    filterLfo.frequency.value = 0.011;
    const filterLfoGain = this.ctx.createGain();
    filterLfoGain.gain.value = 130;
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(filter.frequency);
    filterLfo.start();

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start();
  }

  fadeIn(): void {
    void this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.16, this.ctx.currentTime, 1.2);
  }

  fadeOut(): void {
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  suspend(): void {
    void this.ctx.suspend();
  }

  resume(): void {
    void this.ctx.resume();
  }
}

export default function AudioToggle() {
  const [on, setOn] = useState(false);
  const ambient = useRef<Ambient | null>(null);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    // Page Visibility API: silence when the tab is hidden
    const onVisibility = () => {
      if (!ambient.current || !onRef.current) return;
      document.hidden ? ambient.current.suspend() : ambient.current.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggle = () => {
    if (!ambient.current) ambient.current = new Ambient();
    const next = !on;
    setOn(next);
    next ? ambient.current.fadeIn() : ambient.current.fadeOut();
  };

  return (
    <button
      className={`audio-toggle${on ? ' on' : ''}`}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Mute ambient audio' : 'Play ambient audio'}
      title="Ambient audio"
    >
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <style>{`
        .audio-toggle {
          position: fixed;
          right: 1.4rem;
          bottom: 1.4rem;
          z-index: 110;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(10, 10, 10, 0.55);
          box-shadow: inset 0 0 0 1px var(--line-strong);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: box-shadow 0.3s ease;
        }
        .audio-toggle:hover {
          box-shadow: inset 0 0 0 1px var(--cyan);
        }
        .bars {
          display: flex;
          align-items: flex-end;
          gap: 2.5px;
          height: 14px;
        }
        .bars i {
          width: 2.5px;
          background: var(--ink-dim);
          height: 30%;
          transition: background 0.3s ease;
        }
        .on .bars i {
          background: var(--cyan);
        }
        .on .bars i:nth-child(1) { animation: eq 0.9s ease-in-out infinite alternate; }
        .on .bars i:nth-child(2) { animation: eq 0.7s 0.1s ease-in-out infinite alternate; }
        .on .bars i:nth-child(3) { animation: eq 1.1s 0.2s ease-in-out infinite alternate; }
        .on .bars i:nth-child(4) { animation: eq 0.8s 0.05s ease-in-out infinite alternate; }
        @keyframes eq {
          from { height: 25%; }
          to { height: 100%; }
        }
      `}</style>
    </button>
  );
}
