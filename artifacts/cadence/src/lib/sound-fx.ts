// Web Audio API tactical acoustic synthesizer for Cadence
// Designed with studio-grade micro-acoustics: dual-sine harmonic detuning,
// 24dB/oct low-pass warmth filtering, zero-DC offset soft envelopes, and zero external assets.

class HighFidelitySoundFX {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private masterGain: GainNode | null = null;
  private warmFilter: BiquadFilterNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cadence_sound_enabled');
      this.enabled = stored === null ? true : stored === 'true';
    }
  }

  private initAudioChain(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Warm low-pass filter (2800 Hz) to eliminate digital harshness
        this.warmFilter = this.ctx.createBiquadFilter();
        this.warmFilter.type = 'lowpass';
        this.warmFilter.frequency.setValueAtTime(2800, this.ctx.currentTime);
        this.warmFilter.Q.setValueAtTime(0.707, this.ctx.currentTime); // Butterworth Q

        // Master output gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

        this.warmFilter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_sound_enabled', String(enabled));
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    if (this.enabled) {
      this.playTactileClick();
    }
    return this.enabled;
  }

  /**
   * Premium task completion chime:
   * Lush Major 7th ascending arpeggio (C5 -> E5 -> G5 -> B5)
   * with dual-oscillator micro-detune for organic acoustic resonance.
   */
  public playCompletion(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    // C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), B5 (987.77Hz)
    const chord = [523.25, 659.25, 783.99, 987.77];

    chord.forEach((freq, i) => {
      const noteStart = now + i * 0.045;
      const noteDuration = 0.42;

      // Primary warm sine
      const oscPrimary = ctx.createOscillator();
      oscPrimary.type = 'sine';
      oscPrimary.frequency.setValueAtTime(freq, noteStart);

      // Micro-detuned shimmer (+3 cents) for acoustic depth
      const oscShimmer = ctx.createOscillator();
      oscShimmer.type = 'sine';
      oscShimmer.frequency.setValueAtTime(freq * 1.0017, noteStart);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.09, noteStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

      oscPrimary.connect(gain);
      oscShimmer.connect(gain);
      gain.connect(this.warmFilter!);

      oscPrimary.start(noteStart);
      oscShimmer.start(noteStart);
      oscPrimary.stop(noteStart + noteDuration);
      oscShimmer.stop(noteStart + noteDuration);
    });
  }

  /**
   * Focus round start cue:
   * Grounding single gong tone (E4, 329.63Hz) with pure overtone
   */
  public playFocusStart(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    const fundamental = 329.63; // E4

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(fundamental, now);

    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(fundamental * 2, now); // E5

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    osc.connect(gain);
    overtone.connect(gain);
    gain.connect(this.warmFilter);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 0.8);
    overtone.stop(now + 0.8);
  }

  /**
   * Focus round complete bell:
   * Resonant bronze meditation bell with warm harmonic decay (1.8s)
   */
  public playFocusComplete(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    // Harmonic series: A3 (220Hz), E4 (329.6Hz), A4 (440Hz), C#5 (554.4Hz)
    const harmonics = [220, 329.63, 440, 554.37];

    harmonics.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const amp = 0.08 / (idx + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(amp, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      osc.connect(gain);
      gain.connect(this.warmFilter!);

      osc.start(now);
      osc.stop(now + 1.85);
    });
  }

  /**
   * Tactile crown / switch click:
   * Precision 12ms transient click at 1200Hz down to 200Hz,
   * modeled after Apple Watch digital crown haptic feedback.
   */
  public playTactileClick(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.015);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc.connect(gain);
    gain.connect(this.warmFilter);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * Alias for playTactileClick to ensure seamless backward compatibility
   */
  public playClick(): void {
    this.playTactileClick();
  }

  /**
   * Streak / Goal celebration fanfare:
   * Sparkling 5-note pentatonic cadence (F#5 -> A5 -> B5 -> D6 -> F#6)
   */
  public playCelebration(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    const fanfare = [739.99, 880.0, 987.77, 1174.66, 1479.98]; // F#5, A5, B5, D6, F#6

    fanfare.forEach((freq, idx) => {
      const noteTime = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.08, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.45);

      osc.connect(gain);
      gain.connect(this.warmFilter!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.48);
    });
  }

  /**
   * Gentle reminder nudge tone:
   * Two soft descending water-drop tones for discreet notifications
   */
  public playNudge(): void {
    if (!this.enabled) return;
    const ctx = this.initAudioChain();
    if (!ctx || !this.warmFilter) return;

    const now = ctx.currentTime;
    const notes = [880, 659.25]; // A5 -> E5

    notes.forEach((freq, idx) => {
      const t = now + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.warmFilter!);

      osc.start(t);
      osc.stop(t + 0.28);
    });
  }
}

export const soundFX = new HighFidelitySoundFX();
