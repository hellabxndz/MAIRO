// Sound for the intro.
//
// Two separate things, in order of preference.
//
// 1. A REAL RECORDED TRACK at /intro/voice.mp3 — narration and a music bed
//    mixed together, the music ducking under every line so nothing competes
//    with the voice. If that file exists it is played as one continuous track,
//    seeked to wherever the film has got to, the synthesiser is never used, and
//    the drone below is faded out because the track brings its own score. Drop a
//    different recording in and it takes over automatically, with no code
//    change. The captions in script.ts are the script it reads.
//
// 2. SPEECH SYNTHESIS, if there is no recording. It is a fallback and it sounds
//    like one — a browser reading a line, not somebody saying it. It is tuned as
//    far as it goes: the best voice on the device rather than the default, a
//    slower rate, and each line broken into clauses queued separately so there
//    are breaths between them instead of one flat run-on.
//
// Under both, a synthesised score plays: a low drone from three detuned
// oscillators through a lowpass, plus a filtered noise bed that swells and
// falls. A few lines of WebAudio instead of a megabyte of MP3, and it never
// loops audibly.
//
// Nothing starts without a click. Browsers block audio that starts on its own,
// and an experience that half-plays is worse than one that waits to be asked.

const VOICE_URL = "/intro/voice.mp3";

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private spoken = new Set<number>();

  private voice: HTMLAudioElement | null = null;
  /** Until the probe resolves we do not know whether to speak or to play. */
  private mode: "probing" | "recorded" | "synthesised" = "probing";
  /** The line that was on screen while we were still deciding. */
  private queued: [number, string] | null = null;
  private stopped = false;
  private voiceCache: SpeechSynthesisVoice[] | null = null;

  /**
   * Must be called from a user gesture.
   *
   * @param atSeconds Where the film has already got to, so a recording starts
   *   in the right place rather than from the top.
   */
  start(atSeconds = 0) {
    if (this.ctx) return;
    this.stopped = false;
    // Order matters. Both of these have to happen synchronously inside the
    // click, before anything is awaited.
    this.unlockSpeech();
    this.startScore();
    void this.chooseVoice(atSeconds);
  }

  /**
   * Unlocks the speech synthesiser inside the user gesture.
   *
   * Safari — iOS especially — only permits speech that BEGINS during a user
   * gesture. Probing for a recording awaits a fetch first, and by the time that
   * resolves the gesture is over, so every later speak() is dropped in silence
   * with no error. Speaking a single inaudible space synchronously here, while
   * the click is still on the stack, unlocks it for the rest of the session.
   *
   * This is the difference between the narration working on an iPhone and the
   * narration simply never happening.
   */
  private unlockSpeech() {
    if (typeof speechSynthesis === "undefined") return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0.01;
      speechSynthesis.speak(u);
    } catch {
      /* nothing to unlock */
    }
  }

  private startScore() {
    type WithLegacy = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WithLegacy).webkitAudioContext;
    if (!Ctor) return;

    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      // Safari hands back a suspended context even when it was created inside a
      // gesture, and a suspended context is simply silent.
      if (ctx.state === "suspended") void ctx.resume();

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 2.2);
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
      ng.gain.value = 0.045;

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
      this.ctx = null;
      this.master = null;
    }
  }

  /**
   * Decides between a recording and the synthesiser, once, before anything is
   * said. Probing first rather than racing the two means a line is never read
   * aloud a moment before the recording of it starts.
   */
  private async chooseVoice(atSeconds: number) {
    let found = false;
    try {
      const res = await fetch(VOICE_URL, { method: "HEAD" });
      found = res.ok;
    } catch {
      found = false;
    }
    if (this.stopped) return;

    if (found) {
      try {
        const el = new Audio(VOICE_URL);
        el.preload = "auto";
        el.volume = 0.95;
        el.currentTime = Math.max(0, atSeconds);
        await el.play();
        this.voice = el;
        this.mode = "recorded";
        this.queued = null;
        // The recording carries its own music, so the synthesised drone would
        // just be a second, unrelated piece of music playing over the top of it.
        this.fadeOutScore();
        return;
      } catch {
        // Present but unplayable. Fall through and read it instead.
      }
    }

    this.mode = "synthesised";
    const pending = this.queued;
    this.queued = null;
    if (pending) this.speak(pending[0], pending[1]);
  }

  /** Fades the synthesised score out, for when a real mix takes over. */
  private fadeOutScore() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.4);
    } catch {
      /* the recording is the important half */
    }
  }

  /** A soft low hit, for a scene change. Silent once a real mix is playing. */
  accent() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.mode === "recorded") return;
    try {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
      osc.connect(g).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch {
      /* an accent is not worth an exception */
    }
  }

  /** Narrates a caption once. Does nothing if a recording is carrying the film. */
  say(index: number, text: string) {
    if (!this.ctx || this.spoken.has(index)) return;
    if (this.mode === "recorded") return;
    if (this.mode === "probing") {
      // Hold it. If the probe lands on the synthesiser this is spoken then; if
      // it finds a recording it is dropped, which is what we want.
      this.queued = [index, text];
      return;
    }
    this.spoken.add(index);
    this.speak(index, text);
  }

  /**
   * The best English voice the device has.
   *
   * Platforms ship a default that is usually the oldest and flattest one
   * installed, so the named-quality voices are worth hunting for: they are
   * neural, and they are the difference between a line being spoken and a line
   * being pronounced.
   */
  private pickVoice(): SpeechSynthesisVoice | undefined {
    // getVoices() is empty until the list has loaded on Chrome and on first
    // load in Safari, so the list is cached the moment it appears rather than
    // read fresh each time and coming back empty.
    const all = speechSynthesis.getVoices();
    if (all.length) this.voiceCache = all;
    const voices = (this.voiceCache ?? all).filter((v) => /^en(-|_|$)/i.test(v.lang));
    if (!voices.length) return undefined;
    const rank = (v: SpeechSynthesisVoice) => {
      const n = `${v.name}`.toLowerCase();
      if (/natural|neural/.test(n)) return 0;
      if (/premium|enhanced/.test(n)) return 1;
      if (/\b(ava|jenny|aria|serena|samantha|sonia|libby)\b/.test(n)) return 2;
      if (/google/.test(n)) return 3;
      return 4;
    };
    return [...voices].sort((a, b) => rank(a) - rank(b))[0];
  }

  private speak(index: number, text: string) {
    if (typeof speechSynthesis === "undefined") return;
    this.spoken.add(index);
    try {
      // One utterance per clause. The synthesiser runs a whole string together
      // at one pace; splitting it puts a breath where a person would take one.
      const clauses = text
        .split(/(?<=[.?!])\s+|\s+—\s+/)
        .map((c) => c.trim())
        .filter(Boolean);
      const voice = this.pickVoice();
      for (const clause of clauses) {
        const u = new SpeechSynthesisUtterance(clause);
        u.rate = 0.92;
        u.pitch = 1.0;
        u.volume = 0.95;
        if (voice) u.voice = voice;
        speechSynthesis.speak(u);
      }
    } catch {
      /* the caption is already on screen */
    }
  }

  stop() {
    this.stopped = true;
    this.queued = null;
    try {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
    if (this.voice) {
      try {
        this.voice.pause();
        this.voice.src = "";
      } catch {
        /* already gone */
      }
      this.voice = null;
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
    this.mode = "probing";
  }
}
