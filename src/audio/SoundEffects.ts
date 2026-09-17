export class SoundEffects {
  private ctx: AudioContext | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private saw: OscillatorNode | null = null;
  private tri: OscillatorNode | null = null;
  private engineStarted = false;
  muted = false;

  get context(): AudioContext | null {
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    this.startEngineTone();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(muted ? 0 : 0.05, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  updateEngine(rpm: number, running: boolean, throttle: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.engineFilter || !this.engineGain || !this.saw || !this.tri) return;
    this.startEngineTone();
    const base = 55 + rpm * 0.08;
    const now = ctx.currentTime;
    this.saw.frequency.setTargetAtTime(base, now, 0.04);
    this.tri.frequency.setTargetAtTime(base * 0.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(700 + rpm * 0.35 + throttle * 900, now, 0.05);
    this.engineFilter.Q.setTargetAtTime(1.2 + throttle * 4, now, 0.08);
    const amp = this.muted || !running || rpm < 1 ? 0 : 0.035 + Math.min(0.09, rpm / 80000) + throttle * 0.04;
    this.engineGain.gain.setTargetAtTime(amp, now, 0.06);
  }

  shiftClick(): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    this.metallicImpulse(ctx, 1800, 0.07, 0.18);
    this.metallicImpulse(ctx, 3200, 0.05, 0.12, 0.03);
  }

  grind(duration = 0.45): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const buffer = this.noiseBuffer(ctx, duration);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 14;
    const pulse = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = 0.22;
    src.connect(filter);
    filter.connect(pulse);
    pulse.connect(out);
    out.connect(ctx.destination);
    const pulses = Math.max(4, Math.floor(duration * 60));
    for (let i = 0; i < pulses; i++) {
      const t = now + i / 60;
      pulse.gain.setValueAtTime(i % 2 === 0 ? 1 : 0.08, t);
    }
    src.start(now);
    src.stop(now + duration);
  }

  stall(): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);

    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.value = 42;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.35, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    thud.connect(tg);
    tg.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.3);
  }

  explode(): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const boom = ctx.createBufferSource();
    boom.buffer = this.noiseBuffer(ctx, 0.7);
    const dist = ctx.createWaveShaper();
    dist.curve = this.distortionCurve(18) as Float32Array<ArrayBuffer>;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    boom.connect(dist);
    dist.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.7);

    const snap = ctx.createOscillator();
    snap.type = "square";
    snap.frequency.setValueAtTime(2400, now);
    snap.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.16, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    snap.connect(sg);
    sg.connect(ctx.destination);
    snap.start(now);
    snap.stop(now + 0.15);
  }

  ratchet(duration = 1.15): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const clicks = 18;
    for (let i = 0; i < clicks; i++) {
      const t = now + (i / clicks) * duration;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 2100 + (i % 3) * 280;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  private startEngineTone(): void {
    const ctx = this.ensure();
    if (!ctx || this.engineStarted) return;
    this.engineStarted = true;
    this.saw = ctx.createOscillator();
    this.tri = ctx.createOscillator();
    this.saw.type = "sawtooth";
    this.tri.type = "triangle";
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.saw.connect(this.engineFilter);
    this.tri.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.saw.start();
    this.tri.start();
  }

  private metallicImpulse(ctx: AudioContext, freq: number, dur: number, gain: number, delay = 0): void {
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private distortionCurve(amount: number): Float32Array {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}
