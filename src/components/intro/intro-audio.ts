// Sound for the intro.
//
// There is no audio file to ship, so the score is synthesised: a low drone from
// three detuned oscillators through a lowpass, plus a filtered noise bed that
// swells and falls. It is a few lines of WebAudio instead of a megabyte of MP3,
// and it can run indefinitely without looping audibly.
//
// The voice lines go through the browser's own speech synthesiser. That is an
// honest trade and worth being clear about: it will not sound like a hired
// voice actor. It is off by default, every line is on screen as a caption
// regardless, and the film is built to be watched silently — which is how most
// of the web is watched anyway.
//
// Nothing here starts without a click. Browsers block audio that starts on its
// own, and an experience that half-plays is worse than one that waits to be
// asked.

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private spoken = new Set<number>();

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    type WithLegacy = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithLegacy).webkitAudioContext;
    if (!Ctor) return;

    try {
      const ctx = new Ctor();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.2);
      master.connect(ctx.destination);
      this.master = master;

      // Drone. The fifth above the root is what stops it sounding like a hum.
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(220, ctx.currentTime);
      filter.Q.value = 0.6;
      filter.connect(master);

      for (const [freq, gain, type] of [
        [41.2, 0.5, "sine"],
        [61.7, 0.26, "sine"],
        [82.4, 0.15, "triangle"],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        // A hair off pitch so the three beat against each other slowly.
        osc.detune.value = (Math.random() - 0.5) * 8;
        const g = ctx.createGain();
        g.gain.value = gain;
        osc.connect(g).connect(filter);
        osc.start();
        this.nodes.push(osc);
      }

      // A slow breath of filtered noise over the top.
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 620;
      band.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.value = 0.05;

      // An LFO sweeping the band gives the "something is thinking" texture.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 420;
      lfo.connect(lfoGain).connect(band.frequency);
      lfo.start();

      noise.connect(band).connect(ng).connect(master);
      noise.start();
      this.nodes.push(noise, lfo);
    } catch {
      // Audio is a bonus. If the context will not open, the film is unaffected.
      this.stop();
    }
  }

  /** A soft low hit, for a scene change. */
  accent() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
      osc.connect(g).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch {
      /* an accent is not worth an exception */
    }
  }

  /** Speaks a caption once. Repeat calls for the same index do nothing. */
  say(index: number, text: string) {
    if (!this.ctx || this.spoken.has(index)) return;
    this.spoken.add(index);
    if (typeof speechSynthesis === "undefined") return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.94;
      u.pitch = 0.92;
      u.volume = 0.95;
      const voice = speechSynthesis
        .getVoices()
        .find((v) => /en[-_](GB|US)/i.test(v.lang) && /female|samantha|serena|zira|google/i.test(v.name));
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch {
      /* the caption is already on screen */
    }
  }

  stop() {
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
    const ctx = this.ctx;
    const master = this.master;
    if (ctx && master) {
      try {
        // Ramp down rather than cutting, which clicks.
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      } catch {
        /* fall through to teardown */
      }
    }
    const nodes = this.nodes;
    this.nodes = [];
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        ctx?.close();
      } catch {
        /* already closed */
      }
    }, 300);
    this.ctx = null;
    this.master = null;
  }
}
