// Procedural ambience via WebAudio (no audio assets needed): filtered noise
// swells for ocean waves, detuned low oscillators for the alien-world drone.
// The AudioContext is created lazily on the first user gesture.

type Mode = 'ocean' | 'drone' | 'off';

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: { stop(): void } | null = null;
  private mode: Mode = 'off';
  private unlocked = false;

  constructor() {
    const unlock = () => {
      this.unlocked = true;
      this.apply();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.apply();
  }

  private ensureContext(): AudioContext | null {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private apply(): void {
    this.current?.stop();
    this.current = null;
    if (this.mode === 'off') return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.current = this.mode === 'ocean' ? this.startOcean(ctx) : this.startDrone(ctx);
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private startOcean(ctx: AudioContext): { stop(): void } {
    const noise = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(gain.gain);
    noise.connect(filter).connect(gain).connect(this.master!);
    noise.start();
    lfo.start();
    return {
      stop() {
        noise.stop();
        lfo.stop();
        gain.disconnect();
      },
    };
  }

  private startDrone(ctx: AudioContext): { stop(): void } {
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    const oscs = [55, 55.7, 110.3].map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.12 : 0.3;
      osc.connect(g).connect(gain);
      osc.start();
      return osc;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    gain.connect(this.master!);
    return {
      stop() {
        for (const o of oscs) o.stop();
        lfo.stop();
        gain.disconnect();
      },
    };
  }
}
